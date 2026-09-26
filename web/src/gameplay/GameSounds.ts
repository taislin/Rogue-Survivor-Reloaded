export class GameSounds {
  static readonly PATH = "/assets/sfx/";

  static readonly UNDEAD_EAT = "undead eat";
  static readonly UNDEAD_EAT_FILE = `${GameSounds.PATH}sfx - undead eat`;

  static readonly UNDEAD_RISE = "undead rise";
  static readonly UNDEAD_RISE_FILE = `${GameSounds.PATH}sfx - undead rise`;

  static readonly NIGHTMARE = "nightmare";
  static readonly NIGHTMARE_FILE = `${GameSounds.PATH}sfx - nightmare`;
}

export class GameMusics {
  static readonly PATH = "/assets/music/";

  static readonly ARMY = "army";
  static readonly ARMY_FILE = `${GameMusics.PATH}RS - Army`;

  static readonly BIGBEAR_THEME_SONG = "big bear theme song";
  static readonly BIGBEAR_THEME_SONG_FILE = `${GameMusics.PATH}RS - Big Bear Theme Song`;

  static readonly BIKER = "biker";
  static readonly BIKER_FILE = `${GameMusics.PATH}RS - Biker`;

  static readonly CHAR_UNDERGROUND_FACILITY = "char underground facility";
  static readonly CHAR_UNDERGROUND_FACILITY_FILE = `${GameMusics.PATH}RS - CUF`;

  static readonly DUCKMAN_THEME_SONG = "duckman theme song";
  static readonly DUCKMAN_THEME_SONG_FILE = `${GameMusics.PATH}RS - Duckman Theme Song`;

  static readonly FAMU_FATARU_THEME_SONG = "famu fataru theme song";
  static readonly FAMU_FATARU_THEME_SONG_FILE = `${GameMusics.PATH}RS - Famu Fataru Theme Song`;

  static readonly FIGHT = "fight";
  static readonly FIGHT_FILE = `${GameMusics.PATH}RS - Fight`;

  static readonly GANGSTA = "gangsta";
  static readonly GANGSTA_FILE = `${GameMusics.PATH}RS - Gangsta`;

  static readonly HANS_VON_HANZ_THEME_SONG = "hans von hanz theme song";
  static readonly HANS_VON_HANZ_THEME_SONG_FILE = `${GameMusics.PATH}RS - Hans von Hanz Theme Song`;

  static readonly HEYTHERE = "heythere";
  static readonly HEYTHERE_FILE = `${GameMusics.PATH}RS - Hey There`;

  static readonly HOSPITAL = "hospital";
  static readonly HOSPITAL_FILE = `${GameMusics.PATH}RS - Hospital`;

  static readonly INSANE = "insane";
  static readonly INSANE_FILE = `${GameMusics.PATH}RS - Insane`;

  static readonly INTERLUDE = "interlude";
  static readonly INTERLUDE_FILE = `${GameMusics.PATH}RS - Interlude - Loop`;

  static readonly INTRO = "intro";
  static readonly INTRO_FILE = `${GameMusics.PATH}RS - Intro`;

  static readonly LIMBO = "limbo";
  static readonly LIMBO_FILE = `${GameMusics.PATH}RS - Limbo`;

  static readonly PLAYER_DEATH = "playerdeath";
  // C# GameMusics.cs spells it "RS - Post Mortem"; the shipped file is "RS - Post mortem".
  static readonly PLAYER_DEATH_FILE = `${GameMusics.PATH}RS - Post mortem`;

  static readonly REINCARNATE = "reincarnate";
  static readonly REINCARNATE_FILE = `${GameMusics.PATH}RS - Reincarnate`;

  static readonly ROGUEDJACK_THEME_SONG = "roguedjack theme song";
  static readonly ROGUEDJACK_THEME_SONG_FILE = `${GameMusics.PATH}RS - Roguedjack Theme Song`;

  static readonly SANTAMAN_THEME_SONG = "santaman theme song";
  static readonly SANTAMAN_THEME_SONG_FILE = `${GameMusics.PATH}RS - Santaman Theme Song`;

  static readonly SEWERS = "sewers";
  static readonly SEWERS_FILE = `${GameMusics.PATH}RS - Sewers`;

  static readonly SLEEP = "sleep";
  static readonly SLEEP_FILE = `${GameMusics.PATH}RS - Sleep - Loop`;

  static readonly SUBWAY = "subway";
  static readonly SUBWAY_FILE = `${GameMusics.PATH}RS - Subway`;

  static readonly SURVIVORS = "survivors";
  static readonly SURVIVORS_FILE = `${GameMusics.PATH}RS - Survivors`;

  // alpha10
  static readonly SURFACE = "surface";
  static readonly SURFACE_FILE = `${GameMusics.PATH}RS - Surface`;
}

/**
 * id -> file base name, mirroring the C# `*_FILE` constants. The web port resolves
 * the file at play time (`AssetPaths.musicPath`) instead of pre-loading it, so the
 * manager needs the map rather than the caller passing both halves.
 */
export const MUSIC_FILES: Readonly<Record<string, string>> = {
  [GameMusics.ARMY]: "RS - Army",
  [GameMusics.BIGBEAR_THEME_SONG]: "RS - Big Bear Theme Song",
  [GameMusics.BIKER]: "RS - Biker",
  [GameMusics.CHAR_UNDERGROUND_FACILITY]: "RS - CUF",
  [GameMusics.DUCKMAN_THEME_SONG]: "RS - Duckman Theme Song",
  [GameMusics.FAMU_FATARU_THEME_SONG]: "RS - Famu Fataru Theme Song",
  [GameMusics.FIGHT]: "RS - Fight",
  [GameMusics.GANGSTA]: "RS - Gangsta",
  [GameMusics.HANS_VON_HANZ_THEME_SONG]: "RS - Hans von Hanz Theme Song",
  [GameMusics.HEYTHERE]: "RS - Hey There",
  [GameMusics.HOSPITAL]: "RS - Hospital",
  [GameMusics.INSANE]: "RS - Insane",
  [GameMusics.INTERLUDE]: "RS - Interlude - Loop",
  [GameMusics.INTRO]: "RS - Intro",
  [GameMusics.LIMBO]: "RS - Limbo",
  [GameMusics.PLAYER_DEATH]: "RS - Post mortem",
  [GameMusics.REINCARNATE]: "RS - Reincarnate",
  [GameMusics.ROGUEDJACK_THEME_SONG]: "RS - Roguedjack Theme Song",
  [GameMusics.SANTAMAN_THEME_SONG]: "RS - Santaman Theme Song",
  [GameMusics.SEWERS]: "RS - Sewers",
  [GameMusics.SLEEP]: "RS - Sleep - Loop",
  [GameMusics.SUBWAY]: "RS - Subway",
  [GameMusics.SURVIVORS]: "RS - Survivors",
  [GameMusics.SURFACE]: "RS - Surface",
};

export const SOUND_FILES: Readonly<Record<string, string>> = {
  [GameSounds.UNDEAD_EAT]: "sfx - undead eat",
  [GameSounds.UNDEAD_RISE]: "sfx - undead rise",
  [GameSounds.NIGHTMARE]: "sfx - nightmare",
};
