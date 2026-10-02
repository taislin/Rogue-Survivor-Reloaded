import { BASE_URL } from "@engine/BaseUrl";

/**
 * Long-running ambient beds. Port of the C# `Gameplay/GameAmbients.cs` (48 lines,
 * a `static class` of name/file constant pairs) and the first content in a third
 * asset directory.
 *
 * **The ids are the C#'s, and the file names are too — undecorated.** The C# has
 * `PATH = @"Resources/Ambients\"` and every file under it is bare
 * (`rain_outside_looped.ogg`), unlike the other two trees, which the port's
 * existing assets decorate as `sfx - ` and `RS - ` so the names sort together in a
 * file listing. Renaming these would be a choice, not a translation, so they keep
 * the fork's names and the third directory keeps them grouped instead.
 *
 * **These are not sound effects.** The C# gives them a second `SFMLMusicManager`
 * instance (`RogueGame.cs:861`, chosen "because the music manager is good for long
 * tracks, as they are streamed from disk rather than kept in memory") with its own
 * volume, so an ambient and the background music are two players that overlap
 * rather than one that interrupts the other. The port keeps that as a third
 * channel (`engine/audio/IAmbientManager.ts`); putting these ids through the sound
 * or music manager would be the port's own bug, not the C#'s, because
 * `StopAllAmbientsExcept` is a *list*, and a one-track channel cannot express it.
 */
export class GameAmbients {
  // Prefixed with the deployment base, not a literal: see engine/BaseUrl.ts.
  static readonly PATH = `${BASE_URL}assets/ambients/`;

  //@@MP (Release 6-1)
  static readonly RAIN_OUTSIDE = "outside whilst raining";
  static readonly RAIN_OUTSIDE_FILE = `${GameAmbients.PATH}rain_outside_looped`;

  static readonly RAIN_INSIDE = "inside whilst raining";
  static readonly RAIN_INSIDE_FILE = `${GameAmbients.PATH}rain_inside_looped`;

  //@@MP (Release 6-6)
  static readonly THUNDERING_RAIN_OUTSIDE = "outside whilst thundering rain";
  static readonly THUNDERING_RAIN_OUTSIDE_FILE = `${GameAmbients.PATH}thundering_rain_outside_looped`;

  static readonly THUNDERING_RAIN_INSIDE = "inside whilst thundering rain";
  static readonly THUNDERING_RAIN_INSIDE_FILE = `${GameAmbients.PATH}thundering_rain_inside_looped`;

  //@@MP (Release 6-1)
  static readonly HELICOPTER_FLYOVER = "helicopter flyover";
  static readonly HELICOPTER_FLYOVER_FILE = `${GameAmbients.PATH}helicopter_flyover`;

  //@@MP - for when a helicopter is stationary or hovering (Release 6-4)
  static readonly STATIONARY_HELICOPTER_FARTHEST = "stationary helicopter farthest";
  static readonly STATIONARY_HELICOPTER_FARTHEST_FILE = `${GameAmbients.PATH}helicopter_static_farthest`;

  static readonly STATIONARY_HELICOPTER_FAR = "stationary helicopter far";
  static readonly STATIONARY_HELICOPTER_FAR_FILE = `${GameAmbients.PATH}helicopter_static_far`;

  // The display name says "nearby" while the file and the constant say "near".
  // Both are the C#'s (`GameAmbients.cs:31-32`); only the *id* is ever compared,
  // and renaming either half would break the save-compat-free id contract the rest
  // of the audio layer keeps by using the fork's strings verbatim.
  static readonly STATIONARY_HELICOPTER_NEAR = "stationary helicopter nearby";
  static readonly STATIONARY_HELICOPTER_NEAR_FILE = `${GameAmbients.PATH}helicopter_static_nearby`;

  static readonly STATIONARY_HELICOPTER_VISIBLE = "stationary helicopter visible";
  static readonly STATIONARY_HELICOPTER_VISIBLE_FILE = `${GameAmbients.PATH}helicopter_static_visible`;

  //@@MP (Release 6-6)
  static readonly NIGHT_ANIMALS = "wild animals";
  static readonly NIGHT_ANIMALS_FILE = `${GameAmbients.PATH}night_animals`;

  static readonly CHURCH_BELLS_WITHIN_MAP = "hearing church bells nearby";
  static readonly CHURCH_BELLS_WITHIN_MAP_FILE = `${GameAmbients.PATH}church_bells_within_map`;

  static readonly CHURCH_BELLS_OUTSIDE_MAP = "hearing church bells far off";
  static readonly CHURCH_BELLS_OUTSIDE_MAP_FILE = `${GameAmbients.PATH}church_bells_outside_map`;

  //@@MP (Release 7-3)
  //
  // Debug only, and shipped only so the table above is the C#'s thirteen in full
  // and the asset-existence test is total. Its one C# trigger is
  // `OptionsMenuAudioAdjustment` (`RogueGame.cs:2244`), a preview cue for the
  // ambient-volume row in the *options screen* — a row the port does not have (see
  // `AMBIENT_SFX_VOLUME`), so there is nothing for it to preview. Nothing plays it.
  static readonly TEST_AMBIENT = "test_ambient";
  static readonly TEST_AMBIENT_FILE = `${GameAmbients.PATH}test_ambient`;
}

/**
 * id -> file base name, mirroring the C# `*_FILE` constants, for the same reason
 * `MUSIC_FILES` and `SOUND_FILES` exist: the manager resolves the file at play
 * time from the id, so it needs the map rather than the caller passing both halves.
 *
 * Deliberately *not* merged into `MUSIC_FILES`. `AssetPaths.audioPath` consults
 * that table, and the music manager is handed ids from it — folding the ambients in
 * would make a mistyped ambient id resolve to a music track instead of 404ing, and
 * would lose the fact that this is a separate channel with a separate volume.
 */
export const AMBIENT_FILES: Readonly<Record<string, string>> = {
  [GameAmbients.RAIN_OUTSIDE]: "rain_outside_looped",
  [GameAmbients.RAIN_INSIDE]: "rain_inside_looped",
  [GameAmbients.THUNDERING_RAIN_OUTSIDE]: "thundering_rain_outside_looped",
  [GameAmbients.THUNDERING_RAIN_INSIDE]: "thundering_rain_inside_looped",
  [GameAmbients.HELICOPTER_FLYOVER]: "helicopter_flyover",
  [GameAmbients.STATIONARY_HELICOPTER_FARTHEST]: "helicopter_static_farthest",
  [GameAmbients.STATIONARY_HELICOPTER_FAR]: "helicopter_static_far",
  [GameAmbients.STATIONARY_HELICOPTER_NEAR]: "helicopter_static_nearby",
  [GameAmbients.STATIONARY_HELICOPTER_VISIBLE]: "helicopter_static_visible",
  [GameAmbients.NIGHT_ANIMALS]: "night_animals",
  [GameAmbients.CHURCH_BELLS_WITHIN_MAP]: "church_bells_within_map",
  [GameAmbients.CHURCH_BELLS_OUTSIDE_MAP]: "church_bells_outside_map",
  [GameAmbients.TEST_AMBIENT]: "test_ambient",
};
