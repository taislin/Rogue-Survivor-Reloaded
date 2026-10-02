import { IMusicManager, MusicPriority, type MusicPriorityValue } from './IMusicManager';
import { audioPath } from '@engine/AssetPaths';
import { musicGain } from '@gameplay/AudioLevels';

/**
 * Music playback over an `<audio>` element, with per-track loudness correction.
 *
 * WHY A WEB AUDIO GAIN STAGE
 *
 * The shipped music is very uneven (see `gameplay/AudioLevels.ts`): RMS spans
 * 0.055-0.267, so tracks differ by up to ~4.9x in perceived loudness. Correcting
 * that means boosting the quiet tracks by up to 2.7x -- and `HTMLMediaElement.volume`
 * is capped at 1.0, so a scalar on the element cannot express it. Routing the
 * element through a `GainNode` can, which keeps the correction *and* the
 * original absolute level: normalising purely by attenuation would have forced
 * every track down to the quietest one's level, making the whole soundtrack
 * ~2.4x quieter.
 *
 * If the Web Audio API is unavailable the manager degrades to plain element
 * volume: still works, just without the per-track correction.
 */
export class WebAudioMusicManager implements IMusicManager {
  private audioElement: HTMLAudioElement | null = null;
  private currentMusicId: string | null = null;
  private volume: number = 0.5;
  private isPlayingState: boolean = false;
  /** C# `IMusicManager.Priority` — what the current track was started at. */
  private currentPriority: MusicPriorityValue = MusicPriority.NULL;

  /** Per-track correction for the track currently loaded. */
  private trackGain: number = 1.0;

  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  /** `createMediaElementSource` may only be called once per element, ever. */
  private sourceCreated = false;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.addEventListener('ended', () => {
      this.isPlayingState = false;
    });
    // NOT `loop = true`. Looping is a property of the individual call in the C# —
    // `PlayLooping` sets it, `Play` does not (`SFMLSoundManager.cs:129-145`) — so
    // it is set per play below rather than once, here. Hard-coding it made every
    // one-shot loop forever, including three ~1s sound effects.
    this.audioElement.loop = false;
    this.applyVolume();
  }

  /**
   * Routes the element through Web Audio on first use.
   *
   * Done lazily rather than in the constructor: creating an AudioContext before
   * a user gesture leaves it suspended, and some browsers log a warning.
   */
  private ensureGainStage(): void {
    if (this.sourceCreated || !this.audioElement) return;
    this.sourceCreated = true;

    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      const source = this.ctx.createMediaElementSource(this.audioElement);
      this.gainNode = this.ctx.createGain();
      source.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.applyVolume();
    } catch {
      // No Web Audio (or the element is already captured). Fall back to plain
      // element volume; `this.gainNode` stays null and applyVolume adapts.
      this.gainNode = null;
    }
  }

  /**
   * Pushes `master * trackGain` to whichever volume control exists.
   *
   * When the gain stage is in use the element itself is left at 1.0 so the two
   * do not multiply in a browser-dependent way.
   */
  private applyVolume(): void {
    if (!this.audioElement) return;
    const effective = this.volume * this.trackGain;
    if (this.gainNode) {
      this.audioElement.volume = 1.0;
      this.gainNode.gain.value = effective;
    } else {
      this.audioElement.volume = Math.min(1, effective);
    }
  }

  public play(musicId: string, priority: MusicPriorityValue): void {
    this.start(musicId, priority, false);
  }

  public playLooping(musicId: string, priority: MusicPriorityValue): void {
    this.start(musicId, priority, true);
  }

  /**
   * C# `ISoundManager.PlayIfNotAlreadyPlaying` — `SFMLSoundManager.cs:123`.
   *
   * `start` already short-circuits when the requested id is the one sounding
   * (`if (this.currentMusicId === musicId && this.isPlayingState) return;`), so
   * this is `play` and the guard is inherited rather than restated. It is spelled
   * out as its own method because the C# interface has it and the one caller —
   * the options-menu preview — is written against that name.
   */
  public playIfNotAlreadyPlaying(musicId: string, priority: MusicPriorityValue): void {
    this.start(musicId, priority, false);
  }

  private start(musicId: string, priority: MusicPriorityValue, loop: boolean): void {
    if (!this.audioElement) return;
    if (this.currentMusicId === musicId && this.isPlayingState) return;

    this.ensureGainStage();
    if (this.ctx && this.ctx.state === 'suspended') {
      // Autoplay policy: the context can only run after a user gesture.
      void this.ctx.resume();
    }

    this.trackGain = musicGain(musicId);
    this.audioElement.loop = loop;
    // `audioPath`, not `musicPath`: the C# hands this manager three *sound
    // effects* as well as the tracks, and `musicPath` resolves only the music
    // table — so those three 404'd and, because `src` is assigned before the
    // request resolves, silenced the current track on the way. See `audioPath`.
    this.audioElement.src = audioPath(musicId);
    this.applyVolume();

    this.audioElement
      .play()
      .then(() => {
        this.isPlayingState = true;
        this.currentMusicId = musicId;
        this.currentPriority = priority;
      })
      .catch((err) => {
        // Two causes, and the second used to be invisible: autoplay being blocked
        // (harmless, retried on the next gesture) and a 404 (a real bug, silent
        // until now because the rejection was swallowed). Say which.
        this.isPlayingState = false;
        console.warn(`[audio] could not play "${musicId}" from ${this.audioElement?.src}:`, err);
      });
  }

  public stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isPlayingState = false;
      this.currentMusicId = null;
      this.currentPriority = MusicPriority.NULL;
    }
  }

  public pause(): void {
    if (this.audioElement && this.isPlayingState) {
      this.audioElement.pause();
      this.isPlayingState = false;
    }
  }

  public resume(): void {
    if (this.audioElement && !this.isPlayingState && this.currentMusicId) {
      this.audioElement
        .play()
        .then(() => {
          this.isPlayingState = true;
        })
        .catch(() => {});
    }
  }

  public isPlaying(): boolean {
    return this.isPlayingState;
  }

  /** C# `IMusicManager.Music`. */
  public getCurrentMusicId(): string | null {
    return this.currentMusicId;
  }

  /** C# `IMusicManager.Priority`. */
  public getPriority(): MusicPriorityValue {
    return this.currentPriority;
  }

  /** The master volume, before the per-track correction. */
  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolume();
  }

  public getVolume(): number {
    return this.volume;
  }

  /** The correction being applied to the current track; 1.0 before any plays. */
  public getTrackGain(): number {
    return this.trackGain;
  }
}
