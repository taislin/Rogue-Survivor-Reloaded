export interface ISoundManager {
  play(soundId: string): void;
  /**
   * Play only if this id is not already sounding.
   *
   * The C#'s `PlayIfNotAlreadyPlaying` (`ISoundManager.cs:44`), and the reason the
   * bash/break ladder has two different calls in it: a *visible* hit uses plain
   * `Play` (a second bash should be heard) while an *audible-from-afar* one does not
   * (four NPCs bashing a door on the same turn should not stack four copies of the
   * same effect).
   */
  playIfNotAlreadyPlaying(soundId: string): boolean;
  stopAll(): void;
  setVolume(vol: number): void;
  getVolume(): number;
  /**
   * Still Alive, Release 2 — the C#'s `IsSoundEnabled`, driven by `UI_SFXS`.
   *
   * Not a volume of 0: the port's `WebAudioSoundManager` still reports and
   * reports a 404 for a missing file either way, and `getVolume()` of 0 is
   * indistinguishable from "the player turned it down". A mute is a different
   * state from a quiet sound and it has its own option row.
   */
  setEnabled(on: boolean): void;
  preload(soundIds: string[]): Promise<void>;
}
