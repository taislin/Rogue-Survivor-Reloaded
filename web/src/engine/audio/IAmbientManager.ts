/**
 * The ambient channel — C# `m_AmbientSFXManager`.
 *
 * The C# does **not** have an ambient manager class. It has a *second instance* of
 * the same sound manager it uses for music (`RogueGame.cs:861`,
 * `m_AmbientSFXManager = new SFMLMusicManager()`), with its own `Volume` and its own
 * `IsAudioEnabled`, and that is the whole mixing mechanism: two players writing to
 * the same speakers at two independent levels, so rain sits under the map's theme
 * instead of replacing it. `GameAmbients.cs:5` says as much — "these may be played
 * in conjunction with background music".
 *
 * Two consequences shape this interface, and both come from `ISoundManager` being
 * *per-track* rather than per-channel:
 *
 * - **Several ambients can be audible at once, and each is named.** The C#'s
 *   `StopAllAmbientsExcept` (`RogueGame.cs:10490`) stops a hand-written list of
 *   five, and the helicopter arm (`:10545`) reads `IsPlaying` per track to decide
 *   which of four distance tiers to silence. A one-track channel — which is what
 *   `IMusicManager` is, and deliberately so — cannot express either, so this
 *   interface is per-id and the browser implementation keeps one element per voice.
 * - **`PlayIfNotAlreadyPlaying` is not `Play`.** The C# rain arm guards every
 *   start with `if (!IsPlaying(RAIN_INSIDE))` *precisely because* `PlayLooping`
 *   restarts from the top, and a rain bed restarted mid-thunderclap is a visible
 *   pop. Folding the guard into the call is behaviour-identical and is why the
 *   third argument (`looping`, added in Release 6-4) is a real parameter here.
 *
 * `MusicPriority` is deliberately absent: the ambient channel is not competing with
 * anything, because it is not the music channel. The C# still passes
 * `AudioPriority.PRIORITY_BGM`/`EVENT` to these calls (`RogueGame.cs:10445`,
 * `:10536`) and the value is ignored by the manager it reaches — an artifact of
 * ambients being a music manager rather than an ambient one.
 */
export interface IAmbientManager {
  /**
   * C# `ISoundManager.Play` — start a track once, from the beginning, replacing
   * any previous use of the same id. This is what the church bells use, and the
   * bells are a *one-shot*: the C# calls
   * `PlayIfNotAlreadyPlaying(CHURCH_BELLS_WITHIN_MAP, PRIORITY_BGM)` at
   * `RogueGame.cs:5638` and `PlayIfNotAlreadyPlaying`'s `looping` parameter
   * defaults to `false` (`ISoundManager.cs:52`).
   */
  play(ambientId: string): void;

  /** C# `ISoundManager.PlayLooping` — start a track and repeat it. */
  playLooping(ambientId: string): void;

  /**
   * C# `ISoundManager.PlayIfNotAlreadyPlaying` — start the track only if that id is
   * not already playing, so a bed is never restarted from the top underfoot.
   *
   * The C# guards its three rain/nature calls by hand with `IsPlaying` first; this
   * is the same condition, stated once.
   */
  playIfNotAlreadyPlaying(ambientId: string, looping: boolean): void;

  /** C# `ISoundManager.Stop` — silence one track, leaving the others alone. */
  stop(ambientId: string): void;

  /** C# `ISoundManager.StopAll` — silence everything on the channel. */
  stopAll(): void;

  /** C# `ISoundManager.PauseAll` — used when the player sleeps and by the debug options. */
  pauseAll(): void;

  /** C# `ISoundManager.ResumeAll` — the counterpart to `pauseAll`. */
  resumeAll(): void;

  /** C# `ISoundManager.IsPlaying(musicname)` — is *this* track audible? */
  isPlaying(ambientId: string): boolean;

  /** Whether anything at all is audible. The port's addition: a one-question test. */
  isAnyPlaying(): boolean;

  /**
   * The ids currently audible, for tests and diagnostics.
   *
   * Not in the C#, and not for gameplay: `isPlaying` answers the only question any
   * trigger site asks. This is here so a test can assert the *set* — that moving
   * from rain to night animals leaves exactly one thing playing — which is the
   * property `StopAllAmbientsExcept` exists to maintain.
   */
  getPlayingAmbients(): readonly string[];

  /**
   * The channel level, 0..1. This is the mix: it is the `AmbientSFXVolume` option
   * the C# applies to `m_AmbientSFXManager` alone (`RogueGame.cs:2703`), and the
   * reason a rain bed sits under the music rather than over it.
   */
  setVolume(vol: number): void;
  getVolume(): number;
}

/**
 * The ambient channel's level, and the whole of the ambient/music mix.
 *
 * C# `options.AmbientSFXVolume = 75` (`GameOptions.cs:1389`, the factory's
 * defaults), i.e. 75% against a `MusicVolume` of 100. The C# reaches it as an
 * option row (`UI_AMBIENTSFXS_VOLUME`, `GameOptions.cs:1038`: "Ambient sounds
 * volume (rain, church bells, distant animals, etc)"), and the port does not have
 * that row yet — the `GameOptions`/`OptionsScreen` change is Stage 5 work that
 * nothing about the channel blocks, so the C#'s default is applied instead and a
 * player cannot currently move it.
 *
 * A constant rather than a literal at the two use sites, because the value is only
 * meaningful as "the C#'s default", and a bare `0.75` in a constructor says
 * nothing about where it came from.
 */
export const AMBIENT_SFX_VOLUME = 0.75;
