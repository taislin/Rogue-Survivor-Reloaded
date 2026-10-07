/**
 * The music enable flag — C# `IMusicManager.IsMusicEnabled`
 * (`src/Engine/IMusicManager.cs:32`), `IsAudioEnabled` after the fork's Release 2
 * rename, written by `RogueGame.ApplyOptions` (`RogueGame.cs:19857`, fork
 * `:2697`).
 *
 * ## The bug this file exists for
 *
 * The port had **no flag on the manager at all**. `ApplyOptions` had the C#'s
 * `m_MusicManager.IsMusicEnabled = Options.PlayMusic;` commented out, and the one
 * reader of the option was `UpdateBgMusic`. So switching music off stopped the
 * track that was playing and did nothing else: `UpdateBgMusic` was quiet, but
 * every other start — a raid theme, a fight sting, the sleep cue, the limbo loop,
 * the death jingle, the interlude — played anyway. The row read OFF over audible
 * music, and the next event turned it back on.
 *
 * Which is the whole difference between a *state* and a *stop*. The C# puts the
 * flag inside the manager and every `Play`/`PlayLooping`/`PlayIfNotAlreadyPlaying`
 * opens with `if (!m_IsMusicEnabled) return;` (`SFMLSoundManager.cs:114`, `:133`,
 * `:155`), so a disabled manager answers no to everything. One flag is what makes
 * OFF mean off.
 *
 * ## Why `Audio` is stubbed
 *
 * `vitest.config.mts` runs the suite in `environment: "node"` on purpose — the
 * engine is DOM-free, and the Web Audio managers are a documented coverage blind
 * spot because they call an API node does not have. The constructor needs one
 * member of that API (`new Audio()`), and only that one: the gain stage is
 * created lazily and lives behind a `try`, so a missing `window` degrades to the
 * plain-element path exactly as it does in a browser without Web Audio. Stubbing
 * the element and nothing else keeps the test about the flag rather than about
 * the DOM, and the stub is removed again in `afterAll`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { audioPath } from "@engine/AssetPaths";
import { MusicPriority } from "@engine/audio/IMusicManager";
import { WebAudioMusicManager } from "@engine/audio/WebAudioMusicManager";
import { GameMusics } from "@gameplay/GameSounds";

/** The one HTMLMediaElement member the constructor and `start` touch. */
class FakeAudio {
  volume = 1;
  loop = false;
  src = "";
  currentTime = 0;
  addEventListener(): void {}
  play(): Promise<void> { return Promise.resolve(); }
  pause(): void {}
}

const g = globalThis as { Audio?: unknown };
const hadAudio = "Audio" in g;

beforeAll(() => {
  g.Audio = FakeAudio;
});

afterAll(() => {
  if (hadAudio) g.Audio = undefined;
  else delete g.Audio;
});

describe("the music enable flag is a state on the manager, not a one-off stop", () => {
  it("does not start a track while it is off, whatever the priority", () => {
    const m = new WebAudioMusicManager();
    m.setEnabled(false);

    for (const priority of [MusicPriority.BGM, MusicPriority.EVENT]) {
      m.play(GameMusics.INTRO, priority);
      m.playLooping(GameMusics.SLEEP, priority);
      m.playIfNotAlreadyPlaying(GameMusics.LIMBO, priority);
    }

    // `src` is assigned *before* the request resolves, which is what made a
    // rejected load silence the previous track: if it were assigned here, the
    // disabled manager would still have replaced the music it was told not to
    // touch.
    expect((m as unknown as { audioElement: { src: string } }).audioElement.src).toBe("");
    expect(m.isPlaying()).toBe(false);
    expect(m.getCurrentMusicId()).toBeNull();
  });

  it("starts one as soon as the flag is back on", async () => {
    const m = new WebAudioMusicManager();
    m.setEnabled(false);
    m.play(GameMusics.INTRO, MusicPriority.EVENT);
    expect(m.getCurrentMusicId()).toBeNull();

    m.setEnabled(true);
    m.play(GameMusics.INTRO, MusicPriority.EVENT);
    expect(
      (m as unknown as { audioElement: { src: string } }).audioElement.src,
    ).toBe(audioPath(GameMusics.INTRO));

    await Promise.resolve();
    expect(m.isPlaying()).toBe(true);
    expect(m.getCurrentMusicId()).toBe(GameMusics.INTRO);
  });

  it("gates resume as well, which is where a preview cue would slip through", async () => {
    // `OptionsAudioPreview`'s `default` arm calls `music.resume()` when the
    // cursor leaves the audio rows, so an ungated resume restarts a track the
    // options screen has just been told not to play.
    const m = new WebAudioMusicManager();
    m.setEnabled(true);
    m.play(GameMusics.INTRO, MusicPriority.EVENT);
    m.pause();
    expect(m.isPlaying()).toBe(false);

    m.setEnabled(false);
    m.resume();
    expect(m.isPlaying()).toBe(false);

    m.setEnabled(true);
    m.resume();
    await Promise.resolve();
    expect(m.isPlaying()).toBe(true);
  });

  it("starts enabled, so a fresh session has music before the options are read", () => {
    // The C# field defaults to `false`, but `RogueGame.ApplyOptions` writes the
    // option into it before anything can play; a port that copied the default and
    // not the write would ship a game with no music until the options menu was
    // opened once. `WebAudioSoundManager.enabled` makes the same choice.
    const m = new WebAudioMusicManager();
    expect(m.isEnabled()).toBe(true);
    m.setEnabled(false);
    expect(m.isEnabled()).toBe(false);
    m.setEnabled(true);
    expect(m.isEnabled()).toBe(true);
  });
});
