/**
 * C# `MusicPriority` — only one track plays at a time, so *which* track gets to
 * interrupt is the whole design.
 *
 * The C# added this in alpha10 (`src/Engine/IMusicManager.cs:14`) and it does one
 * job: a track at `PRIORITY_EVENT` is not interrupted by the periodic background
 * music update, while a `PRIORITY_BGM` track is. Without it, `UpdateBgMusic` —
 * which fires every `BGMUSIC_UPDATE_TURNS` turns — stops whatever is playing and
 * restarts the map's track, so a raid theme or a boss cue was cut off mid-event
 * at a fixed, arbitrary point in the fight.
 *
 * The port dropped the concept (it was a one-field omission), which is why every
 * `play()` here is unconditional and why a one-shot has nowhere to declare itself
 * one.
 */
export const MusicPriority = {
  /** Nothing playing. Must be 0 — see the C#. */
  NULL: 0,
  /** The map's own theme; may be replaced by anything, and replaces itself. */
  BGM: 1,
  /** A discrete event — a raid, a fight, an ending. Never interrupted by BGM. */
  EVENT: 2,
} as const;

export type MusicPriorityValue = (typeof MusicPriority)[keyof typeof MusicPriority];

export interface IMusicManager {
  /**
   * C# `IMusicManager.Play` — start a track **once**, from the beginning.
   *
   * One-shot is the C# behaviour, not a port choice: `SFMLSoundManager.Play`
   * (`src/Engine/SFMLSoundManager.cs:120`) never touches `music.Loop`, while
   * `PlayLooping` sets it. The port hard-coded `loop = true` on the element in
   * its constructor and never reset it, so `PLAYER_DEATH`, `FIGHT`, `INTRO` and
   * the three sound effects all looped forever — a 1-second effect repeating
   * under the whole game.
   */
  play(musicId: string, priority: MusicPriorityValue): void;

  /** C# `IMusicManager.PlayLooping` — start a track and repeat it. */
  playLooping(musicId: string, priority: MusicPriorityValue): void;

  /**
   * C# `ISoundManager.PlayIfNotAlreadyPlaying` — `SFMLSoundManager.cs:123`.
   *
   * The C# puts this on `ISoundManager`, which is the *music* interface there (the
   * music and effects interfaces are `ISoundManager` and `IMDXSoundManager`, which is
   * the opposite of what the names suggest). Splitting them in the port put the
   * method on `ISoundManager` only, so the one music caller lost it:
   * `OptionsMenuAudioAdjustment` (`RogueGame.cs:2244`) previews `TEST_MUSIC` with
   * it, and re-entering the row must not restart the cue from the top on every
   * cursor move.
   */
  playIfNotAlreadyPlaying(musicId: string, priority: MusicPriorityValue): void;

  stop(): void;
  pause(): void;
  resume(): void;
  isPlaying(): boolean;
  /** C# `IMusicManager.Music` — id of the track loaded/playing, null when stopped. */
  getCurrentMusicId(): string | null;
  /** C# `IMusicManager.Priority` — the priority the current track was started at. */
  getPriority(): MusicPriorityValue;
  setVolume(vol: number): void;
  getVolume(): number;
}
