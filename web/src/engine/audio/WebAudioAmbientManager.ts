import { AMBIENT_SFX_VOLUME, IAmbientManager } from "./IAmbientManager";
import { ambientPath } from "@engine/AssetPaths";
import { fireAndForget, reportSwallowed } from "@engine/Diagnostics";

/**
 * Ambient playback: one `<audio>` element per audible track, all sharing a master
 * gain stage.
 *
 * **Why a voice per track, when the music manager has one element for everything.**
 * `WebAudioMusicManager` can be a single element because only one music track plays
 * at a time — that is the C#'s design too, and the reason it has a priority. The
 * ambient channel is not like that: `StopAllAmbientsExcept`
 * (`RogueGame.cs:10490`) stops a *named list* of five, and the helicopter arm
 * (`:10545`) asks `IsPlaying` about four separate ids. One element would make the
 * second of those calls silently stop the first, which is precisely the
 * still-alive/music bug the C# avoided by giving ambients a manager of their own.
 *
 * **Why a Web Audio gain stage at all, when the C# has one `Volume` per manager.**
 * Because that one volume is the *mix*, and `HTMLMediaElement.volume` caps at 1.0
 * while the mix is a number below 1. `AMBIENT_SFX_VOLUME` is 0.75, which a scalar
 * could express — but only because the C# chose 75% and not, say, 130%, and
 * routing through a `GainNode` means the port can be given a level above 1 if that
 * is ever wanted, without the element fighting it. The gain also *sums*, which is
 * the property that matters: two overlapping voices each at 0.75 come out at 0.75,
 * not at 1.5, and a browser would clip the second otherwise.
 *
 * There is deliberately **no per-track correction** here, unlike
 * `gameplay/AudioLevels.ts` does for music and sfx. The C# has none for ambients
 * either: `SFMLMusicManager.OnVolumeChange` (`SFMLMusicManager.cs:82-85`) sets one
 * `Volume` on every sound it holds, so an ambient's loudness relative to another is
 * whatever the recording is. Inventing per-track numbers would be a mixing decision
 * the fork did not make, and the C#'s own complaint about the uneven soundtrack
 * (which the music table answers) is not something to answer twice.
 */
/** One element and its own gain, feeding the shared master. */
interface Voice {
  element: HTMLAudioElement;
  /** Null when there is no Web Audio; the element's own volume carries the level then. */
  gain: GainNode | null;
}

export class WebAudioAmbientManager implements IAmbientManager {
  private ctx: AudioContext | null = null;
  /** The channel level. This is the mix; see the class comment. */
  private master: GainNode | null = null;

  /**
   * The audible tracks, by id.
   *
   * Keyed by ambient id so `isPlaying`/`stop` are the per-track operations the C#'s
   * interface has. An entry lives from `play` until `stop` or, for a one-shot, its
   * `ended` event.
   */
  private voices: Map<string, Voice> = new Map();

  /** The C# default (`GameOptions.cs:1389`), so an unconfigured browser build
   * mixes exactly as the shipped C# did. See `AMBIENT_SFX_VOLUME`. */
  private volume: number = AMBIENT_SFX_VOLUME;

  /**
   * Routes new voices through Web Audio on first use.
   *
   * Lazy rather than in the constructor, for the same reason
   * `WebAudioMusicManager.ensureGainStage` is: an AudioContext created before a
   * user gesture starts suspended, and some browsers log a warning about it.
   */
  private ensureGainStage(): AudioContext | null {
    if (this.ctx !== null) {
      if (this.ctx.state === "suspended") {
        // Autoplay policy: the context only runs after a user gesture.
        void this.ctx.resume().catch((e: unknown) => {
          reportSwallowed("WebAudioAmbientManager.resume()", e);
        });
      }
      return this.ctx;
    }

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.master.gain.value = this.volume;
      return this.ctx;
    } catch (e) {
      // No Web Audio, or the context could not be built. Fall back to plain element
      // volume: `master` stays null and the per-voice `applyVolume` adapts.
      reportSwallowed("WebAudioAmbientManager.ensureGainStage()", e);
      this.ctx = null;
      this.master = null;
      return null;
    }
  }

  public play(ambientId: string): void {
    this.start(ambientId, false);
  }

  public playLooping(ambientId: string): void {
    this.start(ambientId, true);
  }

  public playIfNotAlreadyPlaying(ambientId: string, looping: boolean): void {
    // The C# writes this guard by hand at each of its three rain/nature sites
    // (`if (!m_AmbientSFXManager.IsPlaying(...)) PlayLooping(...)`); the condition
    // is the same, and putting it here is what keeps a bed from restarting under a
    // player who is standing still in the rain.
    if (this.voices.has(ambientId)) return;
    this.start(ambientId, looping);
  }

  private start(ambientId: string, looping: boolean): void {
    // A restart replaces the voice rather than layering a second one: the C#'s
    // `Play` is documented as "restart playing an audio track from the beginning"
    // (`ISoundManager.cs:46`), and the caller has already decided this id should be
    // the one that is audible.
    this.stop(ambientId);

    const ctx = this.ensureGainStage();
    const element = new Audio();
    // Per play, not once in a constructor: the C# sets `Loop` in `PlayLooping` and
    // not in `Play` (`SFMLSoundManager.cs:129-145`), and the church bells depend on
    // that — they are a one-shot played at sunset.
    element.loop = looping;
    element.addEventListener("ended", () => {
      // Only a one-shot ends on its own. A loop that was stopped meanwhile is
      // already out of `voices`, and removing it again is harmless but the `stop`
      // path is what should win.
      if (this.voices.get(ambientId)?.element === element) this.voices.delete(ambientId);
    });

    const voice: Voice = { element, gain: null };
    if (ctx !== null) {
      try {
        // One element per voice, so the "may only be called once per element,
        // ever" rule in `WebAudioMusicManager` cannot bite: each voice's element is
        // brand new every time.
        const source = ctx.createMediaElementSource(element);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(this.master!);
        voice.gain = gain;
        this.applyVolume(voice);
      } catch (e) {
        reportSwallowed(`WebAudioAmbientManager.play("${ambientId}") gain stage`, e);
        voice.gain = null;
      }
    }

    element.src = ambientPath(ambientId);
    this.voices.set(ambientId, voice);
    if (voice.gain === null) {
      // No Web Audio: the channel level on the element, capped because a media
      // element's `volume` is 0..1 and a sum of two would clip anyway.
      element.volume = Math.min(1, this.volume);
    }

    fireAndForget(
      `WebAudioAmbientManager.play("${ambientId}")`,
      element.play().catch((e: unknown) => {
        // Autoplay being blocked (harmless, retried on the next gesture) and a
        // missing file (a packaging bug) arrive identically, so both are said
        // rather than swallowed. `music-priority.test.ts` records the C# history:
        // a bad path once silenced the soundtrack because `src` is assigned before
        // the request resolves, and nothing complained.
        this.stop(ambientId);
        reportSwallowed(`WebAudioAmbientManager.play("${ambientId}")`, e);
      }),
    );
  }

  public stop(ambientId: string): void {
    const voice = this.voices.get(ambientId);
    if (voice === undefined) return;
    this.voices.delete(ambientId);
    voice.element.pause();
    try {
      voice.element.currentTime = 0;
    } catch {
      // `currentTime` is not settable until metadata has arrived, and for a track
      // that failed to load it may never be. The element is being discarded, so the
      // un-reset position is irrelevant.
    }
    // The voice is gone; leaving it wired to the master would keep the element
    // alive for as long as the context is.
    voice.gain?.disconnect();
  }

  public stopAll(): void {
    for (const ambientId of [...this.voices.keys()]) this.stop(ambientId);
  }

  public pauseAll(): void {
    for (const voice of this.voices.values()) voice.element.pause();
  }

  public resumeAll(): void {
    for (const [ambientId, voice] of this.voices) {
      // A voice whose element has ended (a one-shot that already finished, before
      // anything paused it) must not be restarted by a `resumeAll`; the C#'s
      // `ResumeAll` only resumes what it paused.
      if (voice.element.ended) continue;
      fireAndForget(
        `WebAudioAmbientManager.resumeAll("${ambientId}")`,
        voice.element.play().catch((e: unknown) => {
          reportSwallowed(`WebAudioAmbientManager.resumeAll("${ambientId}")`, e);
        }),
      );
    }
  }

  public isPlaying(ambientId: string): boolean {
    return this.voices.has(ambientId);
  }

  public isAnyPlaying(): boolean {
    return this.voices.size > 0;
  }

  public getPlayingAmbients(): readonly string[] {
    return [...this.voices.keys()];
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.master !== null) this.master.gain.value = this.volume;
    for (const voice of this.voices.values()) this.applyVolume(voice);
  }

  public getVolume(): number {
    return this.volume;
  }

  /** Keeps the element silent when the gain stage carries the level. */
  private applyVolume(voice: Voice): void {
    if (voice.gain !== null) {
      voice.element.volume = 1.0;
      voice.gain.gain.value = this.volume;
    } else {
      voice.element.volume = Math.min(1, this.volume);
    }
  }
}
