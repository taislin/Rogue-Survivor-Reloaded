/**
 * Game options - port of src/Engine/GameOptions.cs
 *
 * C# binary serialization → `localStorage` JSON.
 */

import { GameMode } from "@engine/Session";
import { storage } from "@engine/storage";
import {
	DEFAULT_IMAGE_SET,
	IMAGE_SETS,
	setImageSet,
	type ImageSet,
} from "@engine/AssetPaths";

import {
	DEFAULT_FONT_CHOICE,
	FONT_CHOICES,
	fontChoiceName,
	setFontChoice,
	type FontChoice,
} from "@ui/fonts";

import {
	DEFAULT_VIEW_MODE,
	VIEW_MODES,
	type ViewMode,
} from "@engine/firstperson/Types";

export enum OptionIDs {
  UI_MUSIC,
  UI_MUSIC_VOLUME,
  UI_SHOW_PLAYER_TAG_ON_MINIMAP,
  UI_ANIM_DELAY,
  UI_SHOW_MINIMAP,
  UI_ADVISOR,
  UI_COMBAT_ASSISTANT,
  UI_SHOW_TARGETS,
  UI_SHOW_PLAYER_TARGETS,

  GAME_DISTRICT_SIZE,
  GAME_MAX_CIVILIANS,
  GAME_MAX_DOGS,
  GAME_MAX_UNDEADS,
  GAME_SIMULATE_DISTRICTS,
  GAME_SIMULATE_SLEEP,
  GAME_SIM_THREAD,
  GAME_SPAWN_SKELETON_CHANCE,
  GAME_SPAWN_ZOMBIE_CHANCE,
  GAME_SPAWN_ZOMBIE_MASTER_CHANCE,
  GAME_CITY_SIZE,
  GAME_NPC_CAN_STARVE_TO_DEATH,
  GAME_ZOMBIFICATION_CHANCE,
  GAME_REVEAL_STARTING_DISTRICT,
  GAME_ALLOW_UNDEADS_EVOLUTION,
  GAME_DAY_ZERO_UNDEADS_PERCENT,
  GAME_ZOMBIE_INVASION_DAILY_INCREASE,
  GAME_STARVED_ZOMBIFICATION_CHANCE,
  GAME_MAX_REINCARNATIONS,
  GAME_REINCARNATE_AS_RAT,
  GAME_REINCARNATE_TO_SEWERS,
  GAME_REINC_LIVING_RESTRICTED,
  GAME_PERMADEATH,
  GAME_DEATH_SCREENSHOT,
  GAME_AGGRESSIVE_HUNGRY_CIVILIANS,
  GAME_NATGUARD_FACTOR,
  GAME_SUPPLIESDROP_FACTOR,
  GAME_UNDEADS_UPGRADE_DAYS,
  GAME_RATS_UPGRADE,
  GAME_SKELETONS_UPGRADE,
  GAME_SHAMBLERS_UPGRADE,
  GAME_AUTOSAVE_PERIOD, // alpha10.1
  /** Still Alive, Release 7-6. Appended: the ID is stored by number in saves. */
  GAME_DAYS_BEFORE_ITEM_DESPAWNS,
  /** Still Alive, Release 7-6. Appended, per the numeric-id rule. */
  GAME_REDUCED_MAPOBJECT_LIGHTING,
  /**
   * Still Alive, Release 7-4. Appended after the two Release 7-6 rows: the
   * numeric id is what a stored options blob carries, so inserting here would
   * silently re-point somebody's saved setting at a different option.
   */
  GAME_RESOURCES_AVAILABILITY,
  UI_SPRITE_STYLE, // browser port
  UI_FONT_CHOICE, // browser port
  UI_VIEW_MODE, // browser port
  GAME_IDLE_AUTO_ADVANCE, // browser port
  /**
   * Still Alive, Release 7-4. Appended for the same reason as the three above it:
   * the numeric id is what a stored options blob carries, so this goes at the end
   * rather than beside the Still Alive rows it belongs with. It is the fork's
   * `DIFFICULTY_RESCUE_DAY`.
   */
  GAME_RESCUE_DAY,
  /**
   * Still Alive, Release 7-6. Appended for the same reason as the three above it:
   * the numeric id is what a stored options blob carries, so this goes at the end
   * rather than beside the Still Alive rows it belongs with. It is the fork's
   * `GAME_WORLD_DECAY`.
   */
  GAME_WORLD_DECAY,
  /**
   * Still Alive, Release 7-6. Appended, per the numeric-id rule. The fork's
   * `GAME_DAYS_BEFORE_WORLD_DECAYS`, which gates `GAME_WORLD_DECAY` — with decay
   * off the day count is never consulted, exactly as the C#'s help text says.
   */
  GAME_DAYS_BEFORE_WORLD_DECAYS,
}

/**
 * Still Alive, Release 7-4: options are split so the difficulty ones can be reset
 * on their own.
 *
 * The C# added this because `R` on the character-creation difficulty screen calls
 * `ResetToDefaultValues(DIFFICULTY)` (`RogueGame.cs:3930`), and resetting
 * *everything* from that screen would throw away the player's font and view mode
 * because they nudged a difficulty number. See `resetToDefaultValues`.
 */
export enum OptionsCategory {
  GENERAL,
  DIFFICULTY,
  ALL,
}

/**
 * The day "6" means, which is a C# convention rather than a number
 * (`GameOptions.cs:707`): the visible rescue day is clamped to 6..100 and 6 is
 * the "random" choice, so the screen can show a single row whose value is
 * `random` or a real day. The real day lands in `hiddenRescueDay` instead.
 */
export const RESCUE_DAY_RANDOM = 6;

/** The window `Random()` is drawn from (`RogueGame.cs:4040`), [from, to). */
export const RESCUE_DAY_RANDOM_MIN = 14;
export const RESCUE_DAY_RANDOM_MAX = 28;

/**
 * Every option the fork treats as *difficulty*, in the order
 * `HandleNewCharacterDifficulty` shows them (`RogueGame.cs:3772-3799`).
 *
 * One list, read by two callers that would otherwise drift apart:
 * `RogueGame.HandleNewCharacterDifficulty` builds the creation-time screen from
 * it, and `OptionsScreen` drops exactly these rows from the mid-game screen —
 * which is the C#'s whole "locked mid-game" mechanism, a deleted block of the
 * mid-game list under a `//MOVED TO CHARACTER CREATION` comment
 * (`RogueGame.cs:1557-1582`), not a runtime check on the `ingame` parameter.
 *
 * The port's list is the C#'s minus the rows for options this build has not
 * grown yet: `LIVING_DAMAGE_PERCENT`, `SANITY`, `ANTIVIRAL_PILLS`, `BACKPACKS`,
 * `UNDEAD_DAMAGE_PERCENT` and `BLACKOPS_RAIDS` are all in the C#'s screen and
 * none of them is an option here, so including them would be a row that throws
 * "unhandled option" the moment it is selected.
 *
 * **`GAME_RATS_UPGRADE` is in this list and not in the C#'s screen.** The C# has
 * it commented out at `RogueGame.cs:3790` because Release 5 removed rats
 * upgrades upstream, and this port still has the option from classic's list, so
 * it is one of the rows that has to move — leaving it behind would be the single
 * Still Alive difficulty option a player could still change mid-game. The screen
 * excludes it again for the C#'s reason; see `HandleNewCharacterDifficulty`.
 */
export const DIFFICULTY_OPTIONS: readonly OptionIDs[] = [
  OptionIDs.GAME_RESCUE_DAY,
  OptionIDs.GAME_RESOURCES_AVAILABILITY,
  OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS,
  OptionIDs.GAME_ZOMBIFICATION_CHANCE,
  OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH,
  OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE,
  OptionIDs.GAME_MAX_CIVILIANS,
  OptionIDs.GAME_MAX_UNDEADS,
  OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT,
  OptionIDs.GAME_UNDEADS_UPGRADE_DAYS,
  OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION,
  OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE,
  OptionIDs.GAME_SKELETONS_UPGRADE,
  OptionIDs.GAME_SHAMBLERS_UPGRADE,
  // Not on the C#'s difficulty screen — see the comment above. Last so that
  // dropping it from the screen cannot renumber anything the player has seen.
  OptionIDs.GAME_RATS_UPGRADE,
  OptionIDs.GAME_NATGUARD_FACTOR,
  OptionIDs.GAME_SUPPLIESDROP_FACTOR,
];

/**
 * Still Alive, Release 7-4: how plentiful the world is.
 *
 * One knob, and it reaches surprisingly far -- starting kit, meat per corpse,
 * fish odds, plant fruiting, the antiviral drop in an army-supplies cache, the
 * dynamite in an underground cache, and the survival-difficulty rating. See
 * plans/BROWSER_PORT_PLAN for the full reader list.
 *
 * `LOW = 0` is not an accident: the C#'s difficulty screen steps the value with
 * `-1`/`+1` and clamps at the ends, so the numbering has to run from LOW to HIGH
 * or Left and Right are swapped.
 */
export enum Resources {
  LOW = 0,
  MED = 1,
  HIGH = 2,
}

export enum ZupDays {
  _FIRST = 0,
  ONE = _FIRST,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  OFF,
  _COUNT,
}

export enum SimRatio {
  _FIRST = 0,
  OFF = _FIRST,
  ONE_QUARTER, // 1/4
  ONE_THIRD, // 1/3
  HALF, // 1/2
  TWO_THIRDS, // 2/3
  THREE_QUARTER, // 3/4
  FULL,
  _COUNT,
}

export enum ReincMode {
  _FIRST = 0,
  RANDOM_FOLLOWER = _FIRST,
  KILLER,
  ZOMBIFIED,
  RANDOM_LIVING,
  RANDOM_UNDEAD,
  RANDOM_ACTOR,
  _LAST = RANDOM_ACTOR,
  _COUNT,
}

/**
 * How long the player may sit still before the game takes a turn for them.
 *
 * A browser port addition with no C# original, so it is a rate rather than a
 * port of something. `OFF` is the default: a turn-based game that advances
 * itself is a *different* game, and this should be something a player opts into
 * rather than something they discover has been happening to them.
 *
 * The steps span two regimes. The short ones — 1s and 2s — are the ones a player
 * turns this on for: the world visibly keeps moving, and they sit either side of
 * the boundary where a turn stops feeling like a turn. The long ones are for
 * stepping away from the keyboard without losing the run, and are spaced far
 * enough apart that stepping through them does not take forever. The binding
 * constraint on the *bottom* of the range is the ~22ms a district turn actually
 * costs (`RogueGame.simulateOneBehindDistrictTurn`): a step below a few hundred
 * milliseconds cannot be honoured, because the redraw and the sim would not fit
 * inside it. 1s is about 45× that, so the fastest step is still comfortably
 * affordable — but note that figure is measured on a 1x1 world, and a larger
 * city costs more, so the fastest step is the one to watch on a big map.
 *
 * The values are indices, not milliseconds, because the option screen steps
 * through them with `+ 1` the way it steps `SimRatio`; the milliseconds live in
 * `IDLE_AUTO_ADVANCE_MS` so the engine and the display cannot disagree about
 * which step is which. That also means the saved form is the *ordinal*, so
 * inserting a step here renumbers the ones after it. That is safe while the
 * option is unreleased and worth remembering when it is not — the same
 * append-only constraint `STILL_ALIVE_REFERENCE.md` records for `ItemID` and
 * `PlayerCommand`.
 */
export enum IdleAdvance {
  _FIRST = 0,
  OFF = _FIRST,
  ONE_SECOND,
  TWO_SECONDS,
  FIVE_SECONDS,
  TEN_SECONDS,
  THIRTY_SECONDS,
  _LAST = THIRTY_SECONDS,
  _COUNT,
}

/**
 * The wall-clock milliseconds behind each `IdleAdvance` step.
 *
 * Indexed by the enum. `_COUNT` is the sentinel the options screen compares
 * against, so it is present and unused rather than left out.
 */
const IDLE_AUTO_ADVANCE_MS: readonly number[] = [
  0, // OFF
  1000,
  2000,
  5000,
  10000,
  30000,
  0, // _COUNT sentinel
];

/** The timeout in milliseconds for an `IdleAdvance` value, 0 when off. */
export function idleAdvanceMs(value: IdleAdvance): number {
  return IDLE_AUTO_ADVANCE_MS[value] ?? 0;
}

const MAP_MAX_HEIGHT = 100; // RogueGame.MAP_MAX_HEIGHT
const MAP_MAX_WIDTH = 100; // RogueGame.MAP_MAX_WIDTH

export class GameOptions {
  // ── Default values ──────────────────────────────────────────────────────
  static readonly DEFAULT_DISTRICT_SIZE = 50;
  static readonly DEFAULT_MAX_CIVILIANS = 25;
  static readonly DEFAULT_MAX_DOGS = 0; // 5
  static readonly DEFAULT_MAX_UNDEADS = 100;
  static readonly DEFAULT_SPAWN_SKELETON_CHANCE = 60;
  static readonly DEFAULT_SPAWN_ZOMBIE_CHANCE = 30;
  static readonly DEFAULT_SPAWN_ZOMBIE_MASTER_CHANCE = 10;
  static readonly DEFAULT_CITY_SIZE = 5;
  static readonly DEFAULT_SIM_DISTRICTS: SimRatio = SimRatio.FULL;
  static readonly DEFAULT_ZOMBIFICATION_CHANCE = 100;
  static readonly DEFAULT_DAY_ZERO_UNDEADS_PERCENT = 30;
  static readonly DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE = 5;
  static readonly DEFAULT_STARVED_ZOMBIFICATION_CHANCE = 50;
  static readonly DEFAULT_MAX_REINCARNATIONS = 1;
  static readonly DEFAULT_NATGUARD_FACTOR = 100;
  static readonly DEFAULT_SUPPLIESDROP_FACTOR = 100;
  /** Still Alive, Release 7-6. Four days, and the option is `--` not clamped. */
  static readonly DEFAULT_DAYS_BEFORE_ITEM_DESPAWNS = 4;
  /**
   * Still Alive, Release 7-6. Default OFF, i.e. a burning barrel lights its whole
   * surroundings.
   *
   * ON drops the two-over and the eight three-point bearings, leaving a burning
   * object lighting only its own tile and the eight adjacent to it -- a radius-1
   * disc instead of the C#'s larger footprint. It is a difficulty knob dressed as
   * a graphics one.
   */
  static readonly DEFAULT_REDUCED_MAPOBJECT_LIGHTING = false;
  /**
   * Still Alive, Release 7-4. MED, and it matters that it is the *default*:
   * `computeDifficultyRating` scales the survivor's rating by 1.5 on LOW and
   * 0.5 on HIGH, so the shipped default is the only setting that neither
   * inflates nor deflates a score.
   */
  static readonly DEFAULT_RESOURCES_AVAILABILITY: Resources = Resources.MED;
  /**
   * Still Alive, Release 7-4. 21, and the *visible* day is the option while the
   * real one lands in the session — see `visibleRescueDay`.
   */
  static readonly DEFAULT_RESCUE_DAY = 21;
  /**
   * Still Alive, Release 7-6. ON.
   *
   * A hardcoded `true` in the C#'s reset (`GameOptions.cs:830`) rather than a
   * `DEFAULT_` constant — there is no constant to point at, and the reset is the
   * only place the value is written. Named like the others here so the reset line
   * reads as a reset rather than as a literal.
   */
  static readonly DEFAULT_WORLD_DECAY = true;
  /**
   * Still Alive, Release 7-6. Seven days, and **that is also the release build's
   * floor**, so this option cannot be set below its own default: the C#'s setter
   * clamps `value < 7` to 7 in a release build and only lowers it to 1 under
   * `DEBUG` (`GameOptions.cs:775-779`). The port takes the release arm; see the
   * setter for why the debug one is not reachable.
   *
   * Seven means the world is clean for a week and then decays in three steps: the
   * C# applies a phase when `day / this` is exactly 1, 2 or 3 and does nothing
   * after that (`RogueGame.cs:9251-9260`), so 7 gives phase 1 on day 7, phase 2 on
   * day 14 and phase 3 on day 21, and a run that outlives three weeks never gets a
   * fourth.
   */
  static readonly DEFAULT_DAYS_BEFORE_WORLD_DECAYS = 7;
  static readonly DEFAULT_ZOMBIFIEDS_UPGRADE_DAYS: ZupDays = ZupDays.THREE;
  static readonly DEFAULT_AUTOSAVE_PERIOD = 24; // alpha10.1
  static readonly DEFAULT_SPRITE_STYLE: ImageSet = DEFAULT_IMAGE_SET;
  static readonly DEFAULT_FONT_CHOICE: FontChoice = DEFAULT_FONT_CHOICE;
  static readonly DEFAULT_VIEW_MODE: ViewMode = DEFAULT_VIEW_MODE;
  static readonly DEFAULT_IDLE_AUTO_ADVANCE: IdleAdvance = IdleAdvance.OFF;

  // ── Fields ──────────────────────────────────────────────────────────────
  private m_DistrictSize = 0;
  private m_MaxCivilians = 0;
  private m_MaxDogs = 0;
  private m_MaxUndeads = 0;
  private m_PlayMusic = false;
  private m_MusicVolume = 0;
  private m_AnimDelay = false;
  private m_ShowMinimap = false;
  private m_EnabledAdvisor = false;
  private m_CombatAssistant = false;
  private m_SimulateDistricts: SimRatio = SimRatio.OFF;
  private m_cachedSimRatioFloat = 0;
  private m_SimulateWhenSleeping = false;
  private m_SimThread = false;
  private m_ShowPlayerTagsOnMinimap = false;
  private m_SpawnSkeletonChance = 0;
  private m_SpawnZombieChance = 0;
  private m_SpawnZombieMasterChance = 0;
  private m_CitySize = 0;
  private m_NPCCanStarveToDeath = false;
  private m_ZombificationChance = 0;
  private m_RevealStartingDistrict = false;
  private m_AllowUndeadsEvolution = false;
  private m_DayZeroUndeadsPercent = 0;
  private m_ZombieInvasionDailyIncrease = 0;
  private m_StarvedZombificationChance = 0;
  private m_MaxReincarnations = 0;
  private m_CanReincarnateAsRat = false;
  private m_CanReincarnateToSewers = false;
  private m_IsLivingReincRestricted = false;
  private m_Permadeath = false;
  /**
   * C# defaults this to true (a silent file write). The browser has no silent
   * files: saving means a download prompt, so an automatic download on every
   * death is hostile. Default off here; the option screen still offers it, and
   * turning it on is an explicit choice to get that download.
   */
  private m_DeathScreenshot = false;
  private m_AggressiveHungryCivilians = false;
  private m_NatGuardFactor = 0;
  private m_SuppliesDropFactor = 0;
  private m_DaysBeforeDiscardedItemDespawns = 0;
  private m_ReducedMapObjectLighting = false;
  /** Still Alive, Release 7-6. See `DEFAULT_WORLD_DECAY`. */
  private m_WorldDecay = false;
  /** Still Alive, Release 7-6. See `DEFAULT_DAYS_BEFORE_WORLD_DECAYS`. */
  private m_DaysBeforeWorldDecays = 0;
  private m_ResourcesAvailability: Resources = Resources.MED;
  private m_VisibleRescueDay = 0;
  private m_HiddenRescueDay = 0;
  private m_ShowTargets = false;
  private m_ShowPlayerTargets = false;
  private m_ZupDays: ZupDays = ZupDays.OFF;
  private m_RatsUpgrade = false;
  private m_SkeletonsUpgrade = false;
  private m_ShamblersUpgrade = false;
  private m_AutoSavePeriodInHours = 0; // alpha10.1

  /**
   * Which sprite set to draw, as one of the folder names in `assets/images/`.
   *
   * A string rather than an enum of its own, unlike `simulateDistricts` and
   * `zombifiedsUpgradeDays`. Those enums exist because the *values* are the
   * option; here the values are already a list that has to exist somewhere else
   * anyway (`AssetPaths.IMAGE_SETS`, which is what is actually on disk), and a
   * second copy of the list would be a second thing to forget to update. The
   * option bounds in the options screen come from that array instead.
   */
  private m_SpriteStyle: ImageSet = DEFAULT_IMAGE_SET;

  /** Which typeface the canvas draws with; see `ui/fonts.ts`. */
  private m_FontChoice: FontChoice = DEFAULT_FONT_CHOICE;

  /**
   * Whether the play screen is drawn top-down or in first person.
   *
   * A string out of `firstperson/Types.VIEW_MODES` rather than an enum of its
   * own, for the same reason `m_SpriteStyle` is a string: the values are a list
   * that the options screen has to bound against, and the renderer has to read,
   * and one list beats two. The values are also the mode names, so the saved
   * options JSON says `"first-person"` rather than `true`.
   *
   * **Deliberately has no `applyViewMode()`**, unlike the sprite style and the
   * typeface above. Those push their value into another module — `AssetPaths`,
   * the font stack — which a direct field write (what `load()` and `copyFrom()`
   * do) would silently skip, which is why each needs re-applying in three places.
   * The view mode has no such second copy to push into: `RogueGame` reads
   * `s_Options.viewMode` directly wherever it branches, and the renderer is handed
   * the camera in the scene rather than asking for the mode. So there is nothing
   * to re-apply, and adding an `applyX()` here out of habit would be a no-op that
   * reads as load-bearing.
   */
  private m_ViewMode: ViewMode = DEFAULT_VIEW_MODE;

  /**
   * Whether the game takes a turn for an idle player, and after how long.
   *
   * Default off. See `IdleAdvance` for why the steps are what they are.
   */
  private m_IdleAutoAdvance: IdleAdvance = GameOptions.DEFAULT_IDLE_AUTO_ADVANCE;

  // dev only options (hidden)
  DEV_ShowActorsStats = false;

  constructor() {
    this.resetToDefaultValues();
  }

  // ── Properties ──────────────────────────────────────────────────────────
  get playMusic(): boolean {
    return this.m_PlayMusic;
  }
  set playMusic(value: boolean) {
    this.m_PlayMusic = value;
  }

  get musicVolume(): number {
    return this.m_MusicVolume;
  }
  set musicVolume(value: number) {
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    this.m_MusicVolume = value;
  }

  get showPlayerTagsOnMinimap(): boolean {
    return this.m_ShowPlayerTagsOnMinimap;
  }
  set showPlayerTagsOnMinimap(value: boolean) {
    this.m_ShowPlayerTagsOnMinimap = value;
  }

  get isAnimDelayOn(): boolean {
    return this.m_AnimDelay;
  }
  set isAnimDelayOn(value: boolean) {
    this.m_AnimDelay = value;
  }

  get isMinimapOn(): boolean {
    return this.m_ShowMinimap;
  }
  set isMinimapOn(value: boolean) {
    this.m_ShowMinimap = value;
  }

  get isAdvisorEnabled(): boolean {
    return this.m_EnabledAdvisor;
  }
  set isAdvisorEnabled(value: boolean) {
    this.m_EnabledAdvisor = value;
  }

  get isCombatAssistantOn(): boolean {
    return this.m_CombatAssistant;
  }
  set isCombatAssistantOn(value: boolean) {
    this.m_CombatAssistant = value;
  }

  get citySize(): number {
    return this.m_CitySize;
  }
  set citySize(value: number) {
    if (value < 3) value = 3;
    if (value > 7) value = 7;
    this.m_CitySize = value;
  }

  get maxCivilians(): number {
    return this.m_MaxCivilians;
  }
  set maxCivilians(value: number) {
    if (value < 10) value = 10;
    if (value > 75) value = 75;
    this.m_MaxCivilians = value;
  }

  get maxDogs(): number {
    return this.m_MaxDogs;
  }
  set maxDogs(value: number) {
    if (value < 0) value = 0;
    if (value > 75) value = 75;
    this.m_MaxDogs = value;
  }

  get maxUndeads(): number {
    return this.m_MaxUndeads;
  }
  set maxUndeads(value: number) {
    if (value < 10) value = 10;
    if (value > 200) value = 200;
    this.m_MaxUndeads = value;
  }

  get spawnSkeletonChance(): number {
    return this.m_SpawnSkeletonChance;
  }
  set spawnSkeletonChance(value: number) {
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    this.m_SpawnSkeletonChance = value;
  }

  get spawnZombieChance(): number {
    return this.m_SpawnZombieChance;
  }
  set spawnZombieChance(value: number) {
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    this.m_SpawnZombieChance = value;
  }

  get spawnZombieMasterChance(): number {
    return this.m_SpawnZombieMasterChance;
  }
  set spawnZombieMasterChance(value: number) {
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    this.m_SpawnZombieMasterChance = value;
  }

  get simulateDistricts(): SimRatio {
    return this.m_SimulateDistricts;
  }
  set simulateDistricts(value: SimRatio) {
    this.m_SimulateDistricts = value;
    this.m_cachedSimRatioFloat = GameOptions.simRatioToFloat(this.m_SimulateDistricts);
  }

  get simRatioFloat(): number {
    return this.m_cachedSimRatioFloat;
  }

  get simulateWhenSleeping(): boolean {
    return this.m_SimulateWhenSleeping;
  }
  set simulateWhenSleeping(value: boolean) {
    this.m_SimulateWhenSleeping = value;
  }

  get isSimON(): boolean {
    return this.m_SimulateDistricts !== SimRatio.OFF;
  }

  get simThread(): boolean {
    return this.m_SimThread;
  }
  set simThread(value: boolean) {
    this.m_SimThread = value;
  }

  get districtSize(): number {
    return this.m_DistrictSize;
  }
  set districtSize(value: number) {
    if (value < 30) value = 30;
    if (value > MAP_MAX_HEIGHT || value > MAP_MAX_WIDTH) {
      value = Math.min(MAP_MAX_WIDTH, MAP_MAX_HEIGHT);
    }
    this.m_DistrictSize = value;
  }

  get nPCCanStarveToDeath(): boolean {
    return this.m_NPCCanStarveToDeath;
  }
  set nPCCanStarveToDeath(value: boolean) {
    this.m_NPCCanStarveToDeath = value;
  }

  get zombificationChance(): number {
    return this.m_ZombificationChance;
  }
  set zombificationChance(value: number) {
    if (value < 10) value = 10;
    if (value > 100) value = 100;
    this.m_ZombificationChance = value;
  }

  get revealStartingDistrict(): boolean {
    return this.m_RevealStartingDistrict;
  }
  set revealStartingDistrict(value: boolean) {
    this.m_RevealStartingDistrict = value;
  }

  get allowUndeadsEvolution(): boolean {
    return this.m_AllowUndeadsEvolution;
  }
  set allowUndeadsEvolution(value: boolean) {
    this.m_AllowUndeadsEvolution = value;
  }

  get dayZeroUndeadsPercent(): number {
    return this.m_DayZeroUndeadsPercent;
  }
  set dayZeroUndeadsPercent(value: number) {
    if (value < 10) value = 10;
    if (value > 100) value = 100;
    this.m_DayZeroUndeadsPercent = value;
  }

  get zombieInvasionDailyIncrease(): number {
    return this.m_ZombieInvasionDailyIncrease;
  }
  set zombieInvasionDailyIncrease(value: number) {
    if (value < 1) value = 1;
    if (value > 20) value = 20;
    this.m_ZombieInvasionDailyIncrease = value;
  }

  get starvedZombificationChance(): number {
    return this.m_StarvedZombificationChance;
  }
  set starvedZombificationChance(value: number) {
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    this.m_StarvedZombificationChance = value;
  }

  get maxReincarnations(): number {
    return this.m_MaxReincarnations;
  }
  set maxReincarnations(value: number) {
    if (value < 0) value = 0;
    if (value > 7) value = 7;
    this.m_MaxReincarnations = value;
  }

  get canReincarnateAsRat(): boolean {
    return this.m_CanReincarnateAsRat;
  }
  set canReincarnateAsRat(value: boolean) {
    this.m_CanReincarnateAsRat = value;
  }

  get canReincarnateToSewers(): boolean {
    return this.m_CanReincarnateToSewers;
  }
  set canReincarnateToSewers(value: boolean) {
    this.m_CanReincarnateToSewers = value;
  }

  get isLivingReincRestricted(): boolean {
    return this.m_IsLivingReincRestricted;
  }
  set isLivingReincRestricted(value: boolean) {
    this.m_IsLivingReincRestricted = value;
  }

  get isPermadeathOn(): boolean {
    return this.m_Permadeath;
  }
  set isPermadeathOn(value: boolean) {
    this.m_Permadeath = value;
  }

  get isDeathScreenshotOn(): boolean {
    return this.m_DeathScreenshot;
  }
  set isDeathScreenshotOn(value: boolean) {
    this.m_DeathScreenshot = value;
  }

  get isAggressiveHungryCiviliansOn(): boolean {
    return this.m_AggressiveHungryCivilians;
  }
  set isAggressiveHungryCiviliansOn(value: boolean) {
    this.m_AggressiveHungryCivilians = value;
  }

  get natGuardFactor(): number {
    return this.m_NatGuardFactor;
  }
  set natGuardFactor(value: number) {
    if (value < 0) value = 0;
    if (value > 200) value = 200;
    this.m_NatGuardFactor = value;
  }

  get suppliesDropFactor(): number {
    return this.m_SuppliesDropFactor;
  }
  set suppliesDropFactor(value: number) {
    if (value < 0) value = 0;
    if (value > 200) value = 200;
    this.m_SuppliesDropFactor = value;
  }

  /**
   * How many in-game days a junk item an NPC dropped may sit before it goes.
   *
   * Still Alive, Release 7-6. The default of 4 is a *deferral*, not a
   * cleanup: the despawn sweep only runs once the world clock is already past
   * `days * TURNS_PER_DAY`, so on a short run nothing is ever swept at all.
   */
  get daysBeforeDiscardedItemDespawns(): number {
    return this.m_DaysBeforeDiscardedItemDespawns;
  }
  set daysBeforeDiscardedItemDespawns(value: number) {
    if (value < 0) value = 0;
    this.m_DaysBeforeDiscardedItemDespawns = value;
  }

  /** Still Alive, Release 7-6. See `DEFAULT_REDUCED_MAPOBJECT_LIGHTING`. */
  get reducedMapObjectLighting(): boolean {
    return this.m_ReducedMapObjectLighting;
  }
  set reducedMapObjectLighting(value: boolean) {
    this.m_ReducedMapObjectLighting = value;
  }

  /**
   * Whether the world decays at all as the clock runs down. Still Alive,
   * Release 7-6, C# `IsWorldDecayOn` over `m_WorldDecay`.
   *
   * Named for the C#'s property rather than its field, as the other boolean
   * options here are (`isPermadeathOn`, `isMinimapOn`). The two are not
   * interchangeable for this pair: the option below would want the bare noun
   * `worldDecay` for what is really a day count, so the boolean keeps the
   * `is...On` form that says what it is.
   *
   * Default ON. A master switch rather than a difficulty knob — the C#'s help text
   * is explicit that it is "a thematic choice only; it doesn't affect gameplay" —
   * and it gates the other one absolutely: with this off, `daysBeforeWorldDecays`
   * is never read, because the pass that would consult it is never called
   * (`RogueGame.cs:5618` short-circuits on this before the comparison).
   */
  get isWorldDecayOn(): boolean {
    return this.m_WorldDecay;
  }
  set isWorldDecayOn(value: boolean) {
    this.m_WorldDecay = value;
  }

  /**
   * How many in-game days pass before the world starts to look decayed. Still
   * Alive, Release 7-6, C# `DaysBeforeWorldDecays`.
   *
   * **Clamped to 7..28, so the floor is the default and the ceiling is 4× it.**
   * The C#'s setter has a `#if DEBUG` arm that allows 1 ("can start from the
   * get-go for testing purposes") and a release arm that allows 7 ("minimum of 7
   * days") (`GameOptions.cs:775-779`); this takes the release arm, because a
   * browser build has no DEBUG configuration and the number a player can see is
   * the number the C# ships.
   *
   * A *period* rather than an offset, which is not obvious from the name: the C#
   * divides the day by this and applies a phase when the quotient is exactly 1, 2
   * or 3 (`RogueGame.cs:9251`), so 14 does not mean "decay starts a fortnight in
   * and then never again" — it means phase 1 on day 14, phase 2 on day 28, phase 3
   * on day 42, and nothing after that.
   */
  get daysBeforeWorldDecays(): number {
    return this.m_DaysBeforeWorldDecays;
  }
  set daysBeforeWorldDecays(value: number) {
    if (value < 7) value = 7;
    if (value > 28) value = 28;
    this.m_DaysBeforeWorldDecays = value;
  }

  /** Still Alive, Release 7-4. See `DEFAULT_RESOURCES_AVAILABILITY`. */
  get resourcesAvailability(): Resources {
    return this.m_ResourcesAvailability;
  }
  set resourcesAvailability(value: Resources) {
    this.m_ResourcesAvailability = value;
  }

  /**
   * The rescue day as the *player* chose it, and the one the options row shows.
   *
   * Two fields rather than one because "random" has to survive being shown
   * repeatedly: the C# keeps the choice here and the rolled day in
   * `hiddenRescueDay`, so a player who picks random and backs out of character
   * creation sees `random` again next time rather than a specific number they
   * never chose (`GameOptions.cs:700-706`).
   *
   * Clamped to 6..100, and **6 is not a day** — it is `RESCUE_DAY_RANDOM`, the
   * value that makes the accept path roll instead of copy. The floor is 6 rather
   * than 1 for that reason alone.
   */
  get visibleRescueDay(): number {
    return this.m_VisibleRescueDay;
  }
  set visibleRescueDay(value: number) {
    if (value < RESCUE_DAY_RANDOM) value = RESCUE_DAY_RANDOM;
    if (value > 100) value = 100;
    this.m_VisibleRescueDay = value;
  }

  /**
   * The day the run will actually use, after a "random" choice was resolved.
   *
   * Never displayed: `describeValue` reads `visibleRescueDay` so the row keeps
   * saying `random`. Written once per accepted character creation.
   */
  get hiddenRescueDay(): number {
    return this.m_HiddenRescueDay;
  }
  set hiddenRescueDay(value: number) {
    this.m_HiddenRescueDay = value;
  }

  get showTargets(): boolean {
    return this.m_ShowTargets;
  }
  set showTargets(value: boolean) {
    this.m_ShowTargets = value;
  }

  get showPlayerTargets(): boolean {
    return this.m_ShowPlayerTargets;
  }
  set showPlayerTargets(value: boolean) {
    this.m_ShowPlayerTargets = value;
  }

  get zombifiedsUpgradeDays(): ZupDays {
    return this.m_ZupDays;
  }
  set zombifiedsUpgradeDays(value: ZupDays) {
    this.m_ZupDays = value;
  }

  get ratsUpgrade(): boolean {
    return this.m_RatsUpgrade;
  }
  set ratsUpgrade(value: boolean) {
    this.m_RatsUpgrade = value;
  }

  get skeletonsUpgrade(): boolean {
    return this.m_SkeletonsUpgrade;
  }
  set skeletonsUpgrade(value: boolean) {
    this.m_SkeletonsUpgrade = value;
  }

  get shamblersUpgrade(): boolean {
    return this.m_ShamblersUpgrade;
  }
  set shamblersUpgrade(value: boolean) {
    this.m_ShamblersUpgrade = value;
  }

  // alpha10.1
  get autoSavePeriodInHours(): number {
    return this.m_AutoSavePeriodInHours;
  }
  set autoSavePeriodInHours(value: number) {
    if (value < 0) value = 0;
    if (value > 7 * 24) value = 7 * 24;
    this.m_AutoSavePeriodInHours = value;
  }

  /**
   * The sprite set to draw, applied as soon as it is set.
   *
   * The setter pushes the value into `AssetPaths` rather than only recording it,
   * so choosing a style in the options screen changes what the next frame draws
   * without a reload. The consequence is that the setter is the *only* supported
   * way to change it — assigning `m_SpriteStyle` directly (which is what
   * `load()` and `copyFrom()` do) leaves `AssetPaths` on the old set, so
   * `applySpriteStyle()` exists to re-apply, and both of those call it.
   */
  get spriteStyle(): ImageSet {
    return this.m_SpriteStyle;
  }
  set spriteStyle(value: ImageSet) {
    this.m_SpriteStyle = value;
    this.applySpriteStyle();
  }

  /** Pushes the stored sprite style into `AssetPaths`, which is what draws. */
  applySpriteStyle(): void {
    setImageSet(this.m_SpriteStyle);
  }

  /**
   * The typeface, applied as soon as it is set — for the same reason the sprite
   * style is: the canvas font strings are read per draw, so a change takes effect
   * on the next frame rather than the next reload.
   */
  get fontChoice(): FontChoice {
    return this.m_FontChoice;
  }
  set fontChoice(value: FontChoice) {
    this.m_FontChoice = value;
    void this.applyFontChoice();
  }

  /**
   * Pushes the stored typeface into the font module.
   *
   * Fire-and-forget on purpose: switching to the bundled face may need a font
   * fetch, and an option change must not be able to reject into nowhere. The
   * faces are already cached by then in every normal case, since the bundled face
   * is the default and was awaited at boot.
   */
  applyFontChoice(): Promise<void> {
    return setFontChoice(this.m_FontChoice);
  }

  /**
   * The view the play screen is drawn in. Plain accessor, no side effect — see
   * `m_ViewMode` for why this option has no `applyX()`.
   */
  get viewMode(): ViewMode {
    return this.m_ViewMode;
  }
  set viewMode(value: ViewMode) {
    this.m_ViewMode = value;
  }

  /**
   * Whether an idle player has a turn taken for them, and after how long.
   *
   * Plain accessor, no side effect, for the same reason `viewMode` has none: the
   * engine reads this where it branches, and there is no second copy of the
   * value for anything else to fall out of step with. `idleAdvanceMs` is where
   * the enum becomes the number the clock compares against.
   */
  get idleAutoAdvance(): IdleAdvance {
    return this.m_IdleAutoAdvance;
  }
  set idleAutoAdvance(value: IdleAdvance) {
    this.m_IdleAutoAdvance = value;
  }

  /**
   * Whether `mode` is the first-person view.
   *
   * Every branch that decides how to draw goes through this rather than testing
   * `viewMode === "first-person"` inline, and the reason is the failure direction.
   * The value is unvalidated JSON in a storage blob a player can hand-edit or a
   * truncated write can damage, and `mode !== "first-person"` is then *true* for
   * a typo — so an inline `!==` test would quietly drop the player into a
   * renderer they never asked for, against a map drawn for a different
   * coordinate space. This predicate is false for anything it does not
   * recognise, so an unknown value falls back to the C# behaviour.
   */
  static isFirstPersonView(mode: string): boolean {
    return mode === "first-person";
  }

  // ── Init ────────────────────────────────────────────────────────────────
  /**
   * Restore defaults, for one category or for all of them.
   *
   * The split is the C#'s (`GameOptions.cs:797`, Release 7-4) and it exists for
   * one caller: `R` on the character-creation difficulty screen, which resets the
   * *difficulty* options to the shipped defaults. Resetting everything there
   * would mean that nudging max-civilians also threw away the player's font,
   * view mode and sprite style.
   *
   * **The difficulty arm resets to the shipped defaults, not to the values the
   * screen was entered with** — that is the C#'s behaviour and not an
   * oversight. Its own comment says the call "used to restore changes in this
   * session" and now does not (`RogueGame.cs:3930`), so a player who opened the
   * screen and pressed `R` expecting to undo their own edits instead gets a
   * clean difficulty slate and keeps the font they had.
   *
   * Which options each arm owns is `DIFFICULTY_OPTIONS`; `tests/
   * difficulty-at-creation.test.ts` asserts the two lists cannot drift, because
   * a row that is on the screen but not in the arm is an option `R` silently
   * leaves alone.
   */
  resetToDefaultValues(category: OptionsCategory = OptionsCategory.ALL): void {
    if (category === OptionsCategory.GENERAL || category === OptionsCategory.ALL) {
      this.m_PlayMusic = true;
      this.m_MusicVolume = 100;
      this.m_AnimDelay = true;
      this.m_ShowMinimap = true;
      this.m_ShowPlayerTagsOnMinimap = true;
      this.m_EnabledAdvisor = true;
      this.m_CombatAssistant = false;
      this.simulateDistricts = GameOptions.DEFAULT_SIM_DISTRICTS;
      this.m_SimulateWhenSleeping = false;
      this.m_SimThread = true;
      this.m_CitySize = GameOptions.DEFAULT_CITY_SIZE;
      this.m_RevealStartingDistrict = true;
      this.m_DistrictSize = GameOptions.DEFAULT_DISTRICT_SIZE;
      this.m_Permadeath = false;
      this.m_DeathScreenshot = false; // browser default off; C# default is true.
      this.m_ShowTargets = true;
      this.m_ShowPlayerTargets = true;
      this.m_CanReincarnateAsRat = false;
      this.m_CanReincarnateToSewers = false;
      this.m_IsLivingReincRestricted = false;
      this.m_MaxReincarnations = GameOptions.DEFAULT_MAX_REINCARNATIONS;
      this.m_DaysBeforeDiscardedItemDespawns =
        GameOptions.DEFAULT_DAYS_BEFORE_ITEM_DESPAWNS;
      this.m_ReducedMapObjectLighting = GameOptions.DEFAULT_REDUCED_MAPOBJECT_LIGHTING;
      // Release 7-6, both straight to the field rather than through the setters, as
      // every other row in this arm does and as the C# does (`GameOptions.cs:826,830`).
      // It matters for the day count in particular: its setter clamps to 7..28 and
      // the default is already 7, so routing the reset through it is a no-op today
      // and a silent clamp tomorrow if the default ever moves.
      this.m_WorldDecay = GameOptions.DEFAULT_WORLD_DECAY;
      this.m_DaysBeforeWorldDecays = GameOptions.DEFAULT_DAYS_BEFORE_WORLD_DECAYS;
      this.m_AutoSavePeriodInHours = GameOptions.DEFAULT_AUTOSAVE_PERIOD; // alpha10.1
      this.m_SpriteStyle = GameOptions.DEFAULT_SPRITE_STYLE;
      this.applySpriteStyle();
      this.m_FontChoice = GameOptions.DEFAULT_FONT_CHOICE;
      void this.applyFontChoice();
      this.m_ViewMode = GameOptions.DEFAULT_VIEW_MODE;
      this.m_IdleAutoAdvance = GameOptions.DEFAULT_IDLE_AUTO_ADVANCE;
      this.DEV_ShowActorsStats = false;
    }
    if (category === OptionsCategory.DIFFICULTY || category === OptionsCategory.ALL) {
      this.m_MaxCivilians = GameOptions.DEFAULT_MAX_CIVILIANS;
      this.m_MaxUndeads = GameOptions.DEFAULT_MAX_UNDEADS;
      this.m_SpawnSkeletonChance = GameOptions.DEFAULT_SPAWN_SKELETON_CHANCE;
      this.m_SpawnZombieChance = GameOptions.DEFAULT_SPAWN_ZOMBIE_CHANCE;
      this.m_SpawnZombieMasterChance = GameOptions.DEFAULT_SPAWN_ZOMBIE_MASTER_CHANCE;
      this.m_MaxDogs = GameOptions.DEFAULT_MAX_DOGS;
      this.m_NPCCanStarveToDeath = true;
      this.m_ZombificationChance = GameOptions.DEFAULT_ZOMBIFICATION_CHANCE;
      this.m_AllowUndeadsEvolution = true;
      this.m_DayZeroUndeadsPercent = GameOptions.DEFAULT_DAY_ZERO_UNDEADS_PERCENT;
      this.m_ZombieInvasionDailyIncrease = GameOptions.DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE;
      this.m_StarvedZombificationChance = GameOptions.DEFAULT_STARVED_ZOMBIFICATION_CHANCE;
      this.m_AggressiveHungryCivilians = true;
      this.m_NatGuardFactor = GameOptions.DEFAULT_NATGUARD_FACTOR;
      this.m_SuppliesDropFactor = GameOptions.DEFAULT_SUPPLIESDROP_FACTOR;
      this.m_ZupDays = GameOptions.DEFAULT_ZOMBIFIEDS_UPGRADE_DAYS;
      this.m_SkeletonsUpgrade = false;
      this.m_ShamblersUpgrade = false;
      this.m_RatsUpgrade = false;
      this.m_ResourcesAvailability = GameOptions.DEFAULT_RESOURCES_AVAILABILITY;
      // Both halves, because the C#'s difficulty arm resets them together
      // (`GameOptions.cs:857`): the visible day is the option and the hidden one
      // is its resolved twin, so resetting only the visible one would leave a
      // stale rolled day behind for a run that never asked for a roll.
      this.m_VisibleRescueDay = GameOptions.DEFAULT_RESCUE_DAY;
      this.m_HiddenRescueDay = GameOptions.DEFAULT_RESCUE_DAY;
    }
  }

  // ── Value-copy (C# GameOptions is a struct) ──────────────────────────────

  /** Deep value copy of every option field into `this`. */
  copyFrom(src: GameOptions): void {
    const dst = this as unknown as Record<string, unknown>;
    const from = src as unknown as Record<string, unknown>;
    for (const key of Object.keys(from)) {
      if (key.startsWith("m_")) dst[key] = from[key];
    }
    dst.DEV_ShowActorsStats = from.DEV_ShowActorsStats;
    // The sprite set and the typeface are the two options with an effect
    // outside this object, so copying the field is not enough: `AssetPaths` and
    // the font module have to be told too. Without this, "R" (restore previous)
    // in the options screen would put the numbers back and leave the screen drawn
    // in the look the player just rejected.
    //
    // The view mode is deliberately not in that list. The `m_` loop above already
    // copied it, and it has no second copy to push into — see `m_ViewMode`.
    this.applySpriteStyle();
    void this.applyFontChoice();
  }

  /** Returns a new instance holding a copy of this option set. */
  clone(): GameOptions {
    const copy = new GameOptions();
    copy.copyFrom(this);
    return copy;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  static optionName(option: OptionIDs): string {
    switch (option) {
      case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS:
        return "(Living) Aggressive Hungry Civs";
      case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION:
        return "(Undead) Allow Undeads Evolution";
      case OptionIDs.GAME_CITY_SIZE:
        return "   (Map) City Size";
      case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT:
        return "(Undead) Day 0 Undeads";
      case OptionIDs.GAME_DEATH_SCREENSHOT:
        return " (Death) Death Screenshot";
      case OptionIDs.GAME_DISTRICT_SIZE:
        return "   (Map) District Map Size";
      case OptionIDs.GAME_MAX_CIVILIANS:
        return "(Living) Max Civilians";
      case OptionIDs.GAME_MAX_DOGS:
        return "(Living) Max Dogs";
      case OptionIDs.GAME_MAX_REINCARNATIONS:
        return " (Reinc) Max Reincarnations";
      case OptionIDs.GAME_MAX_UNDEADS:
        return "(Undead) Max Undeads";
      case OptionIDs.GAME_NATGUARD_FACTOR:
        return " (Event) National Guard";
      case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH:
        return "(Living) NPCs can starve to death";
      case OptionIDs.GAME_PERMADEATH:
        return " (Death) Permadeath";
      case OptionIDs.GAME_RATS_UPGRADE:
        return "(Undead) Rats Skill Upgrade";
      case OptionIDs.GAME_REVEAL_STARTING_DISTRICT:
        return "   (Map) Reveal Starting District";
      case OptionIDs.GAME_REINC_LIVING_RESTRICTED:
        return " (Reinc) Civilians only Reinc.";
      case OptionIDs.GAME_RESOURCES_AVAILABILITY:
        // Still Alive, Release 7-4. The C# prefixes "(Living)", which is a
        // leftover from when the difficulty screen was the only one that had it.
        return " (Living) Resources availability";
      case OptionIDs.GAME_RESCUE_DAY:
        // Still Alive, Release 7-4. The C#'s two difficulty screens spell these
        // rows differently ("(Undead) Allow undeads evolution (non-VTG)" versus
        // "(Undead) Allow Undeads Evolution") and adds the "(STD)"/"(non-VTG)"
        // qualifiers into the name rather than filtering the row out. One name
        // for both screens, and the qualifiers are done by filtering instead —
        // see `HandleNewCharacterDifficulty`.
        return " (Living) Helicopter rescue day";
      case OptionIDs.GAME_REINCARNATE_AS_RAT:
        return " (Reinc) Can Reincarnate as Rat";
      case OptionIDs.GAME_REINCARNATE_TO_SEWERS:
        return " (Reinc) Can Reincarnate to Sewers";
      case OptionIDs.GAME_SHAMBLERS_UPGRADE:
        return "(Undead) Shamblers Skill Upgrade";
      case OptionIDs.GAME_SKELETONS_UPGRADE:
        return "(Undead) Skeletons Skill Upgrade";
      case OptionIDs.GAME_SIMULATE_DISTRICTS:
        return "   (Sim) Districts Simulation";
      case OptionIDs.GAME_SIMULATE_SLEEP:
        return "   (Sim) Simulate when Sleeping";
      case OptionIDs.GAME_SIM_THREAD:
        return "   (Sim) Synchronous Simulation";
      case OptionIDs.GAME_SPAWN_SKELETON_CHANCE:
        return "(Undead) Spawn Skeleton chance";
      case OptionIDs.GAME_SPAWN_ZOMBIE_CHANCE:
        return "(Undead) Spawn Zombie chance";
      case OptionIDs.GAME_SPAWN_ZOMBIE_MASTER_CHANCE:
        return "(Undead) Spawn Zombie Master chance";
      case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE:
        return "(Living) Starved Zombification";
      case OptionIDs.GAME_SUPPLIESDROP_FACTOR:
        return " (Event) Supplies Drop";
      case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
        return "(Undead) Undeads Skills Upgrade Days";
      case OptionIDs.GAME_ZOMBIFICATION_CHANCE:
        return "(Living) Zombification Chance";
      case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE:
        return "(Undead) Invasion Daily Increase";
      case OptionIDs.UI_ANIM_DELAY:
        return "   (Gfx) Animations Delay";
      case OptionIDs.UI_MUSIC:
        return "   (Sfx) Music";
      case OptionIDs.UI_MUSIC_VOLUME:
        return "   (Sfx) Music Volume";
      case OptionIDs.UI_SHOW_MINIMAP:
        return "   (Gfx) Show Minimap";
      case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP:
        return "   (Gfx) Show Tags on Minimap";
      case OptionIDs.UI_ADVISOR:
        return "  (Help) Enable Advisor";
      case OptionIDs.UI_COMBAT_ASSISTANT:
        return "  (Help) Combat Assistant";
      case OptionIDs.UI_SHOW_TARGETS:
        return "  (Help) Show Other Actors Targets";
      case OptionIDs.UI_SHOW_PLAYER_TARGETS:
        return "  (Help) Show Player Targets";
    case OptionIDs.GAME_AUTOSAVE_PERIOD:
      return "  (Save) AutoSave Period"; // alpha10.1
    case OptionIDs.GAME_DAYS_BEFORE_ITEM_DESPAWNS: // Still Alive, Release 7-6
      return "   (Map) Days before a junk item despawns";
    case OptionIDs.GAME_REDUCED_MAPOBJECT_LIGHTING: // Still Alive, Release 7-6
      return "   (Map) Fires have a smaller light radius";
    case OptionIDs.GAME_WORLD_DECAY: // Still Alive, Release 7-6
      return "   (Map) World decays as time passes";
    case OptionIDs.GAME_DAYS_BEFORE_WORLD_DECAYS: // Still Alive, Release 7-6
      return "   (Map) Days before the world looks decayed";
    case OptionIDs.UI_SPRITE_STYLE:
      return "  (Gfx) Sprite Style";
    case OptionIDs.UI_FONT_CHOICE:
      return "  (Gfx) Font";
    case OptionIDs.UI_VIEW_MODE:
      return "  (Gfx) View Mode";
    case OptionIDs.GAME_IDLE_AUTO_ADVANCE:
      return "  (Play) Idle Auto-Advance";
      default:
        throw new Error("unhandled option");
    }
  }

  // alpha10
  static describe(option: OptionIDs): string {
    switch (option) {
      case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS:
        return "Allows hungry civilians to attack other people for food.";
      case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION:
        return "ALWAYS OFF IN VTG-VINTAGE MODE.\nAllows undeads to evolve into stronger forms.";
      case OptionIDs.GAME_CITY_SIZE:
        return (
          "Size of the city grid. The city is a square grid of districts.\n" +
          "Larger cities are more fun but rapidly increases game saves size and loading time."
        );
      case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT:
        return "Percentage of max undeads spawned when the game starts.";
      case OptionIDs.GAME_DEATH_SCREENSHOT:
        return "Takes a screenshot when you die and save it to the game Config\\Screenshot folder.";
      case OptionIDs.GAME_DISTRICT_SIZE:
        return "How large are the maps in tiles. Larger maps are more fun but increase game saves size and loading time.";
      case OptionIDs.GAME_MAX_CIVILIANS:
        return "Maximum number of civilians on a map. More civilians makes the game easier for livings, but slows the game down.";
      case OptionIDs.GAME_MAX_DOGS:
        return "OPTION IS UNUSED YOU SHOULDNT BE READING THIS :)";
      case OptionIDs.GAME_MAX_REINCARNATIONS:
        return (
          "Number of times you can reincarnate in a game after your character dies.\n" +
          "Set it to 0 to disable reincarnation altogether."
        );
      case OptionIDs.GAME_MAX_UNDEADS:
        return "Maximum number of undeads on a map. More undeads makes the game more challenging for livings, but slows the game down.";
      case OptionIDs.GAME_NATGUARD_FACTOR:
        return "Affects how likely the National Guard event happens.\n100 is default, 0 to disable.";
      case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH:
        return "When NPCs are starving they can die. When disabled ai characters will never die from hunger.";
      case OptionIDs.GAME_PERMADEATH:
        return "Deletes your saved game when you die so you can't reload your way out. Extra challenge and tension.";
      case OptionIDs.GAME_RATS_UPGRADE:
        return (
          "ALWAYS OFF IN VTG-VINTAGE MODE.\nCan Rats type of undeads upgrade their skills like other undeads.\n" +
          "Not recommended unless you want super annoying rats."
        );
      case OptionIDs.GAME_REVEAL_STARTING_DISTRICT:
        return "You start the game with knowing parts of the map you start in.";
      case OptionIDs.GAME_REINC_LIVING_RESTRICTED:
        return "Limit choices of reincarnations as livings to civilians only. If disabled allow you to reincarnte into all kinds of livings.";
      case OptionIDs.GAME_RESOURCES_AVAILABILITY:
        return (
          "How plentiful the world is. It is not one number: it sets your starting food, " +
          "how much meat a corpse yields, your odds of catching a fish, how often plants fruit, " +
          "and what turns up in supply caches."
        );
      case OptionIDs.GAME_RESCUE_DAY: // Still Alive, Release 7-4
        return (
          "Which day that the rescue helicopter will arrive. You just need to find out where that will be...\n" +
          "Choosing random will select a day between 14-28."
        );
      case OptionIDs.GAME_REINCARNATE_AS_RAT:
        return "Enables the possibility to reincarnate into a zombie rat.";
      case OptionIDs.GAME_REINCARNATE_TO_SEWERS:
        return "Enables the possibility to reincarnate to the sewers.";
      case OptionIDs.GAME_SHAMBLERS_UPGRADE:
        return "ALWAYS OFF IN VTG-VINTAGE MODE.\nCan Shamblers type of undeads upgrade their skills like other undeads.";
      case OptionIDs.GAME_SKELETONS_UPGRADE:
        return "ALWAYS OFF IN VTG-VINTAGE MODE.\nCan Skeletons type of undeads upgrade their skills like other undeads.";
      case OptionIDs.GAME_SIMULATE_DISTRICTS:
        return (
          "The game simulates what is happening in districts around you. You should keep this option maxed for better gameplay.\n" +
          "When the simulation happens depends on other sim options."
        );
      case OptionIDs.GAME_SIMULATE_SLEEP:
        return "Performs simulation when you are sleeping. Recommended if synchronous sim is off.";
      case OptionIDs.GAME_SIM_THREAD:
        return "Performs simulation in a separate thread while you are playing. Recommended unless the game is unstable.";
      case OptionIDs.GAME_SPAWN_SKELETON_CHANCE:
        return "YOU SHOULDNT BE READING THIS :)";
      case OptionIDs.GAME_SPAWN_ZOMBIE_CHANCE:
        return "YOU SHOULDNT BE READING THIS :)";
      case OptionIDs.GAME_SPAWN_ZOMBIE_MASTER_CHANCE:
        return "YOU SHOULDNT BE READING THIS :)";
      case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE:
        return "ONLY IN STD-STANDARD MODE.\nIf NPCs can starve to death, chances of turning into a zombie.";
      case OptionIDs.GAME_SUPPLIESDROP_FACTOR:
        return "Affects how likely the supplies drop event happens.\n100 is default, 0 to disable.";
      case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
        return "How often can undeads upgrade their skills. They usually upgrade at a slower pace than livings.";
      case OptionIDs.GAME_ZOMBIFICATION_CHANCE:
        return (
          "ONLY IN STD-STANDARD MODE.\nSome undeads have the ability to turn their living victims into zombies after killing them.\n" +
          "This option control the chances of zombification. Changing this value has a large impact on game difficulty.\n" +
          "Exception: the player is always checked for zombification when killed in all game modes."
        );
      case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE:
        return "The zombies invasion increases in size each day, to fill up to Max Undeads on a map.";
      case OptionIDs.UI_ANIM_DELAY:
        return (
          "Enable or disable delays when showing actions or events on the map.\n" +
          "You should keep it on when learning the game and then disable it for a faster play."
        );
      case OptionIDs.UI_MUSIC:
        return "Enable or disable ingame musics. Musics are not essential for gameplay. If you can't hear music, try the configuration program.";
      case OptionIDs.UI_MUSIC_VOLUME:
        return "Music volume.";
      case OptionIDs.UI_SHOW_MINIMAP:
        return "Display or hide the minimap.\nThe minimap could potentially crash the game on some very old graphics cards.";
      case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP:
        return "Highlight tags painted by the player as yellow dots in the minimap.";
      case OptionIDs.UI_ADVISOR:
        return (
          "Enable or disable the ingame hints system. The advisor helps you learn the game for the living side.\n" +
          "It will only tell you hints it didn't already tell you.\nAll hints are also available from the main menu."
        );
      case OptionIDs.UI_COMBAT_ASSISTANT:
        return (
          "When enabled draws a colored circle icon on your enemies.\n" +
          "Green = you can safely act twice before your enemy\n" +
          "Yellow = your enemy will act after you\nRed = your enemy will act twice after you"
        );
      case OptionIDs.UI_SHOW_TARGETS:
        return "When mouse over an actor, will draw icons on actors that are targeting, are targeted or are in group with this actor.";
      case OptionIDs.UI_SHOW_PLAYER_TARGETS:
        return "Will draw icons on actors that are targeting you.";
    case OptionIDs.GAME_REDUCED_MAPOBJECT_LIGHTING: // Still Alive, Release 7-6
      return "A burning barrel or campfire lights a smaller area.\n" +
        "Cheaper to draw and easier to hide from.";
    case OptionIDs.GAME_DAYS_BEFORE_ITEM_DESPAWNS: // Still Alive, Release 7-6
      return "The number of in-game days at which point an item that a non-follower NPC discarded get despawned.\n" +
        "Only applies to common, low-value items. Doesn't affect items dropped by the player or their followers.\n" +
        "Does not apply to items in the player or an NPCs's inventory or bank safe.";
    case OptionIDs.GAME_WORLD_DECAY: // Still Alive, Release 7-6
      return (
        "After a configurable number of days the world starts to look decayed.\n" +
        "Buildings and roads begin to crumble, and plants begin to reclaim the city.\n" +
        "If this is Off, the 'Days before the world looks decayed' setting is ignored.\n" +
        "This is a thematic choice only; it doesn't affect gameplay."
      );
    case OptionIDs.GAME_DAYS_BEFORE_WORLD_DECAYS: // Still Alive, Release 7-6
      return (
        "The number of in-game days at which point the world begins to appear apocalyptically decayed.\n" +
        "The later it starts, the longer the decay process is drawn out over time from then on.\n" +
        "This is a thematic choice only; it doesn't affect gameplay."
      );
    case OptionIDs.GAME_AUTOSAVE_PERIOD: // alpha10.1
      return "Will autosave at regular intervals when you start sleeping, start a long wait or change map.\nManually saving the game will reschedule the next autosave.";
    case OptionIDs.UI_SPRITE_STYLE:
      return "Which sprite set to draw the game with.\nThe other sets are variations of the classic one and do not contain every sprite: anything they are missing is drawn from classic, so a missing entry falls back rather than leaving a hole.";
    case OptionIDs.UI_FONT_CHOICE:
        return "Which typeface to draw the text with.\nFour are bundled, so they look the same everywhere and work offline: JetBrains Mono (the default), Iosevka Term Slab, Hack and IBM Plex Mono. Classic uses the system's own monospace font, which is what this game was drawn with before.";
    case OptionIDs.UI_VIEW_MODE:
      return (
        "Draws the play screen from your own eyes rather than from above.\n" +
        "The map, the rules and one-action-per-turn are all unchanged.\n" +
        "In first person the arrow keys change meaning:\n" +
        "Left and Right turn you an eighth of a circle, costing no turn;\n" +
        "Up and Down walk you forward and back the way you are facing."
      );
    case OptionIDs.GAME_IDLE_AUTO_ADVANCE:
      return (
        "If you do nothing for this long, the game takes a turn for you: you wait in place.\n" +
        "It stops the moment you press anything, so a deliberate action is never cut short,\n" +
        "and it never fires while a targeting mode is open, so it cannot pick a tile for you.\n" +
        "OFF is the default: the game is turn-based, and this is a way to stop standing still being a death sentence."
      );
      default:
        throw new Error("unhandled option");
    }
  }

  static reincModeName(mode: ReincMode): string {
    switch (mode) {
      case ReincMode.RANDOM_ACTOR:
        return "Random Actor";
      case ReincMode.RANDOM_LIVING:
        return "Random Living";
      case ReincMode.RANDOM_UNDEAD:
        return "Random Undead";
      case ReincMode.RANDOM_FOLLOWER:
        return "Random Follower";
      case ReincMode.KILLER:
        return "Your Killer";
      case ReincMode.ZOMBIFIED:
        return "Your Zombie Self";
      default:
        throw new Error("unhandled ReincMode");
    }
  }

  /** The display name of a resources-availability level. */
  static resourcesAvailabilityName(availability: Resources): string {
    switch (availability) {
      case Resources.LOW:
        return "LOW";
      case Resources.MED:
        return "MED";
      case Resources.HIGH:
        return "HIGH";
      default:
        throw new Error("unhandled Resources");
    }
  }

  /**
   * `Resources` as a percentage, for the four readers that want a chance rather
   * than a name: the antiviral in an army-supplies cache, the dynamite in an
   * underground cache, and so on.
   *
   * **33/54/75, not 33/50/66.** Not a typo and not "nicely spaced" -- those are
   * the C#'s exact numbers, and they are not evenly spaced on purpose. HIGH is
   * 75 rather than 100, so even the most plentiful world leaves the occasional
   * cache bare, which is what makes scavenging a search rather than a formality.
   */
  static resourcesAvailabilityToInt(availability: Resources): number {
    switch (availability) {
      case Resources.LOW:
        return 33;
      case Resources.MED:
        return 54;
      case Resources.HIGH:
        return 75;
      default:
        throw new Error("unhandled Resources");
    }
  }

  static simRatioName(ratio: SimRatio): string {
    switch (ratio) {
      case SimRatio.OFF:
        return "OFF";
      case SimRatio.ONE_QUARTER:
        return "25%";
      case SimRatio.ONE_THIRD:
        return "33%";
      case SimRatio.HALF:
        return "50%";
      case SimRatio.TWO_THIRDS:
        return "66%";
      case SimRatio.THREE_QUARTER:
        return "75%";
      case SimRatio.FULL:
        return "FULL";
      default:
        throw new Error("unhandled simRatio");
    }
  }

  /**
   * The display name of an idle auto-advance step: the seconds it waits.
   *
   * Seconds rather than the raw milliseconds because that is the unit a player
   * is choosing in, and because the engine is the one that has to know about
   * milliseconds. Divided from `IDLE_AUTO_ADVANCE_MS` rather than written out
   * per case, so the label and the clock cannot drift apart.
   */
  static idleAdvanceName(value: IdleAdvance): string {
    const ms = idleAdvanceMs(value);
    if (ms === 0) return "OFF";
    return `${ms / 1000} s`;
  }

  static simRatioToFloat(ratio: SimRatio): number {
    switch (ratio) {
      case SimRatio.OFF:
        return 0;
      case SimRatio.ONE_QUARTER:
        return 1 / 4;
      case SimRatio.ONE_THIRD:
        return 1 / 3;
      case SimRatio.HALF:
        return 1 / 2;
      case SimRatio.TWO_THIRDS:
        return 2 / 3;
      case SimRatio.THREE_QUARTER:
        return 3 / 4;
      case SimRatio.FULL:
        return 1;
      default:
        throw new Error("unhandled simRatio");
    }
  }

  /**
   * The display name of a sprite set: the folder name, minus the `webp`-era
   * underscores, so `deonapocalypse_v9_r1` reads as "Deonapocalypse v9 r1".
   *
   * `classic` is annotated as the complete set, because that is what makes the
   * fallback invisible and the player does not need to know it is happening.
   */
  static spriteStyleName(set: ImageSet): string {
    const pretty = set.replace(/_/g, " ");
    return set === DEFAULT_IMAGE_SET ? `${pretty}  (complete set)` : pretty;
  }

  static zupDaysName(d: ZupDays): string {    switch (d) {
      case ZupDays.OFF:
        return "OFF";
      case ZupDays.ONE:
        return "1 d";
      case ZupDays.TWO:
        return "2 d";
      case ZupDays.THREE:
        return "3 d";
      case ZupDays.FOUR:
        return "4 d";
      case ZupDays.FIVE:
        return "5 d";
      case ZupDays.SIX:
        return "6 d";
      case ZupDays.SEVEN:
        return "7 d";
      default:
        throw new Error("unhandled zupDays");
    }
  }

  static isZupDay(d: ZupDays, day: number): boolean {
    switch (d) {
      case ZupDays.ONE:
        return true;
      case ZupDays.TWO:
        return day % 2 === 0;
      case ZupDays.THREE:
        return day % 3 === 0;
      case ZupDays.FOUR:
        return day % 4 === 0;
      case ZupDays.FIVE:
        return day % 5 === 0;
      case ZupDays.SIX:
        return day % 6 === 0;
      case ZupDays.SEVEN:
        return day % 7 === 0;
      case ZupDays.OFF:
      default:
        return false;
    }
  }

  private static pad(n: number, width: number): string {
    return String(n).padStart(width, "0");
  }

  private static padPct(n: number, width: number): string {
    return `${GameOptions.pad(n, width)}%`;
  }

  describeValue(mode: GameMode, option: OptionIDs): string {
    // mode is part of the C# signature but unused in the original switch.
    void mode;
    const pad = GameOptions.pad;
    const padPct = GameOptions.padPct;
    switch (option) {
      case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS:
        return this.isAggressiveHungryCiviliansOn ? "ON    (default ON)" : "OFF   (default ON)";
      case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION:
        return this.allowUndeadsEvolution ? "YES   (default YES)" : "NO    (default YES)";
      case OptionIDs.GAME_CITY_SIZE:
        return `${pad(this.citySize, 2)}*   (default ${pad(GameOptions.DEFAULT_CITY_SIZE, 2)})`;
      case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT:
        return `${padPct(this.dayZeroUndeadsPercent, 3)}  (default ${padPct(
          GameOptions.DEFAULT_DAY_ZERO_UNDEADS_PERCENT,
          3
        )})`;
      case OptionIDs.GAME_DEATH_SCREENSHOT:
        return this.isDeathScreenshotOn ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_DISTRICT_SIZE:
        return `${pad(this.districtSize, 2)}*   (default ${pad(GameOptions.DEFAULT_DISTRICT_SIZE, 2)})`;
      case OptionIDs.GAME_MAX_CIVILIANS:
        return `${pad(this.maxCivilians, 3)}*  (default ${pad(GameOptions.DEFAULT_MAX_CIVILIANS, 3)})`;
      case OptionIDs.GAME_MAX_DOGS:
        return `${pad(this.maxDogs, 3)}*  (default ${pad(GameOptions.DEFAULT_MAX_DOGS, 3)})`;
      case OptionIDs.GAME_MAX_REINCARNATIONS:
        return `${pad(this.maxReincarnations, 3)}   (default ${pad(GameOptions.DEFAULT_MAX_REINCARNATIONS, 3)})`;
      case OptionIDs.GAME_MAX_UNDEADS:
        return `${pad(this.maxUndeads, 3)}*  (default ${pad(GameOptions.DEFAULT_MAX_UNDEADS, 3)})`;
      case OptionIDs.GAME_NATGUARD_FACTOR:
        return `${padPct(this.natGuardFactor, 3)}  (default ${padPct(GameOptions.DEFAULT_NATGUARD_FACTOR, 3)})`;
      case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH:
        return this.nPCCanStarveToDeath ? "YES   (default YES)" : "NO    (default YES)";
      case OptionIDs.GAME_PERMADEATH:
        return this.isPermadeathOn ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_RATS_UPGRADE:
        return this.ratsUpgrade ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_REINC_LIVING_RESTRICTED:
        return this.isLivingReincRestricted ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_REINCARNATE_AS_RAT:
        return this.canReincarnateAsRat ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_REINCARNATE_TO_SEWERS:
        return this.canReincarnateToSewers ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_RESOURCES_AVAILABILITY:
        return `${GameOptions.resourcesAvailabilityName(this.resourcesAvailability).padEnd(
          4,
        )}  (default ${GameOptions.resourcesAvailabilityName(
          GameOptions.DEFAULT_RESOURCES_AVAILABILITY,
        )})`;
      case OptionIDs.GAME_REVEAL_STARTING_DISTRICT:
        return this.revealStartingDistrict ? "YES   (default YES)" : "NO    (default YES)";
      case OptionIDs.GAME_RESCUE_DAY: // Still Alive, Release 7-4
        // "random" reads the *visible* day, so the row keeps saying random after a
        // run has rolled one into `hiddenRescueDay` — which is the whole reason
        // there are two fields.
        return `${this.visibleRescueDay === RESCUE_DAY_RANDOM ? "random" : this.visibleRescueDay.toString()} (default ${GameOptions.DEFAULT_RESCUE_DAY})`;
      case OptionIDs.GAME_SHAMBLERS_UPGRADE:
        return this.shamblersUpgrade ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_SKELETONS_UPGRADE:
        return this.skeletonsUpgrade ? "YES   (default NO)" : "NO    (default NO)";
      case OptionIDs.GAME_SIM_THREAD:
        return this.simThread ? "YES*  (default YES)" : "NO*   (default YES)";
      case OptionIDs.GAME_SIMULATE_DISTRICTS:
        return `${GameOptions.simRatioName(this.simulateDistricts).padEnd(4)}* (default ${GameOptions.simRatioName(
          GameOptions.DEFAULT_SIM_DISTRICTS
        )})`;
      case OptionIDs.GAME_SIMULATE_SLEEP:
        return this.simulateWhenSleeping ? "YES*  (default NO)" : "NO*   (default NO)";
      case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE:
        return `${padPct(this.starvedZombificationChance, 3)}  (default ${padPct(
          GameOptions.DEFAULT_STARVED_ZOMBIFICATION_CHANCE,
          3
        )})`;
      case OptionIDs.GAME_SUPPLIESDROP_FACTOR:
        return `${padPct(this.suppliesDropFactor, 3)}  (default ${padPct(GameOptions.DEFAULT_SUPPLIESDROP_FACTOR, 3)})`;
      case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE:
        return `${padPct(this.zombieInvasionDailyIncrease, 3)}  (default ${padPct(
          GameOptions.DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE,
          3
        )})`;
      case OptionIDs.GAME_ZOMBIFICATION_CHANCE:
        return `${padPct(this.zombificationChance, 3)}  (default ${padPct(
          GameOptions.DEFAULT_ZOMBIFICATION_CHANCE,
          3
        )})`;
      case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
        return `${GameOptions.zupDaysName(this.zombifiedsUpgradeDays)}   (default ${GameOptions.zupDaysName(
          GameOptions.DEFAULT_ZOMBIFIEDS_UPGRADE_DAYS
        )})`;
      case OptionIDs.UI_ADVISOR:
        return this.isAdvisorEnabled ? "YES" : "NO ";
      case OptionIDs.UI_ANIM_DELAY:
        return this.isAnimDelayOn ? "ON " : "OFF";
      case OptionIDs.UI_COMBAT_ASSISTANT:
        return this.isCombatAssistantOn ? "ON    (default OFF)" : "OFF   (default OFF)";
      case OptionIDs.UI_MUSIC:
        return this.playMusic ? "ON " : "OFF";
      case OptionIDs.UI_MUSIC_VOLUME:
        return `${this.musicVolume}%`;
      case OptionIDs.UI_SHOW_MINIMAP:
        return this.isMinimapOn ? "ON " : "OFF";
      case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP:
        return this.showPlayerTagsOnMinimap ? "YES" : "NO ";
      case OptionIDs.UI_SHOW_PLAYER_TARGETS:
        return this.showPlayerTargets ? "ON    (default ON)" : "OFF   (default ON)";
      case OptionIDs.UI_SHOW_TARGETS:
        return this.showTargets ? "ON    (default ON)" : "OFF   (default ON)";
    case OptionIDs.GAME_REDUCED_MAPOBJECT_LIGHTING: // Still Alive, Release 7-6
      return this.reducedMapObjectLighting ? "ON    (default OFF)" : "OFF   (default OFF)";
    case OptionIDs.GAME_DAYS_BEFORE_ITEM_DESPAWNS: // Still Alive, Release 7-6
      return `${this.daysBeforeDiscardedItemDespawns.toString().padStart(3)}  (default ${GameOptions.DEFAULT_DAYS_BEFORE_ITEM_DESPAWNS})`;
    case OptionIDs.GAME_WORLD_DECAY: // Still Alive, Release 7-6
      return this.isWorldDecayOn ? "ON    (default ON)" : "OFF   (default ON)";
    case OptionIDs.GAME_DAYS_BEFORE_WORLD_DECAYS: // Still Alive, Release 7-6
      // `{0:D3}` in the C#: a zero-padded day count, so the row does not change
      // width as it is stepped. The default is read through the same padding so
      // the two columns line up.
      return `${pad(this.daysBeforeWorldDecays, 3)}   (default ${pad(
        GameOptions.DEFAULT_DAYS_BEFORE_WORLD_DECAYS,
        3
      )})`;
    case OptionIDs.GAME_AUTOSAVE_PERIOD: // alpha10.1
      return `${(this.autoSavePeriodInHours === 0 ? "OFF" : `${this.autoSavePeriodInHours}h`).padEnd(4)}  (default ${GameOptions.DEFAULT_AUTOSAVE_PERIOD}h)`;
    case OptionIDs.UI_SPRITE_STYLE:
      return GameOptions.spriteStyleName(this.spriteStyle);
    case OptionIDs.UI_FONT_CHOICE:
      return fontChoiceName(this.fontChoice);
    case OptionIDs.UI_VIEW_MODE:
      return GameOptions.viewModeName(this.viewMode);
    case OptionIDs.GAME_IDLE_AUTO_ADVANCE:
      return `${GameOptions.idleAdvanceName(this.idleAutoAdvance)}   (default ${GameOptions.idleAdvanceName(
        GameOptions.DEFAULT_IDLE_AUTO_ADVANCE
      )})`;
      default:
        return "???";
    }
  }

  /**
   * The display name of a view mode.
   *
   * Unlike `spriteStyleName` this has nothing to tidy up — the stored values were
   * chosen to read as words already, because they are also the option's saved
   * form and there is no reason for the two to differ. The annotation marks the
   * one a first run gets, the same way the sprite style marks the complete set.
   *
   * **The experimental tag is display-only and marks the first-person view as
   * unfinished.** It is a claim about this renderer, not about the option: the
   * second renderer is a work in progress, and the value column is the only place
   * a player looks before turning it on. `"first-person  (experimental)"` — the
   * mode string is left alone, so the saved form and the type stay `"first-person"`
   * and a build without this annotation reads the same value.
   */
  static viewModeName(mode: ViewMode): string {
    if (mode !== DEFAULT_VIEW_MODE) return `${mode}  (experimental)`;
    return `${mode}  (default)`;
  }

  // ── Saving & Loading (localStorage JSON instead of binary) ──────────────
  static readonly STORAGE_KEY = "rogue-survivor-options";

  static save(options: GameOptions): void {
    const data: Record<string, unknown> = {
      DEV_ShowActorsStats: options.DEV_ShowActorsStats,
    };
    for (const key of Object.keys(options)) {
      if (key.startsWith("m_")) data[key] = (options as unknown as Record<string, unknown>)[key];
    }
    storage.setItem(GameOptions.STORAGE_KEY, JSON.stringify(data));
  }

  static load(): GameOptions {
    const options = new GameOptions();
    try {
      const raw = storage.getItem(GameOptions.STORAGE_KEY);
      if (raw === null) return options;
      const data = JSON.parse(raw) as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (key.startsWith("m_") && key in options) {
          (options as unknown as Record<string, unknown>)[key] = data[key];
        } else if (key === "DEV_ShowActorsStats") {
          options.DEV_ShowActorsStats = data[key] as boolean;
        }
      }
      options.simulateDistricts = options.m_SimulateDistricts; // refresh cached ratio
    // Same reason: `load` writes the field, not through the setter, so the
    // sprite set `AssetPaths` is drawing with would stay at the default.
    options.applySpriteStyle();
    // And the typeface, for the same reason and the same way.
    void options.applyFontChoice();
    // The view mode needs nothing here, unlike the two above: it has no second
    // copy to push into, so `RogueGame` reading `s_Options.viewMode` is already
    // in step with the field `load` just wrote. See `m_ViewMode`.
    } catch {
      // failed to load options (no custom options?) -> return default values.
      return new GameOptions();
    }
    return options;
  }
}

/** C# `RogueGame.Options` singleton. */
export const Options: GameOptions = new GameOptions();

/**
 * Steps one option by `dir`, which is the Left and Right key of both option
 * screens.
 *
 * The C# writes this out twice — once in `HandleOptions` and once in
 * `HandleNewCharacterDifficulty`, as two `switch` statements with a `case` per
 * option and the arrow's direction spelled into each line. The port has one
 * function instead, and the `dir` argument replaces the duplicated `case
 * Keys.Left:` / `case Keys.Right:` pair. The alternative is twenty arms of
 * step-per-arrow in two files with nothing to keep them equal, and the two
 * screens show overlapping rows: the first divergence would be a row that steps
 * one way on the creation screen and not at all in the options screen, which is
 * exactly the sort of thing nobody notices until a player hits it.
 *
 * Acts on the `Options` singleton, as both screens do. A caller that has to
 * re-draw afterwards (`OptionsScreen`, because a typeface change loads faces) is
 * responsible for noticing that — compare the value, or check the option id.
 *
 * Options with no stepping (the booleans that only ever toggle do step; the ones
 * here are the unused spawn chances and `GAME_MAX_DOGS`, which no list shows)
 * fall through and do nothing, which is what the C#'s missing `case` does.
 */
export function stepGameOption(option: OptionIDs, dir: -1 | 1): void {
	const o = Options;
	switch (option) {
		case OptionIDs.GAME_DISTRICT_SIZE:
			o.districtSize += dir * 5;
			break;
		case OptionIDs.UI_MUSIC:
			o.playMusic = !o.playMusic;
			break;
		case OptionIDs.UI_MUSIC_VOLUME:
			o.musicVolume += dir * 5;
			break;
		case OptionIDs.UI_ANIM_DELAY:
			o.isAnimDelayOn = !o.isAnimDelayOn;
			break;
		case OptionIDs.UI_SHOW_MINIMAP:
			o.isMinimapOn = !o.isMinimapOn;
			break;
		case OptionIDs.UI_SHOW_PLAYER_TAG_ON_MINIMAP:
			o.showPlayerTagsOnMinimap = !o.showPlayerTagsOnMinimap;
			break;
		case OptionIDs.UI_ADVISOR:
			o.isAdvisorEnabled = !o.isAdvisorEnabled;
			break;
		case OptionIDs.UI_COMBAT_ASSISTANT:
			o.isCombatAssistantOn = !o.isCombatAssistantOn;
			break;
		case OptionIDs.UI_SHOW_TARGETS:
			o.showTargets = !o.showTargets;
			break;
		case OptionIDs.UI_SHOW_PLAYER_TARGETS:
			o.showPlayerTargets = !o.showPlayerTargets;
			break;
		case OptionIDs.GAME_MAX_CIVILIANS:
			o.maxCivilians += dir * 5;
			break;
		case OptionIDs.GAME_RESOURCES_AVAILABILITY:
			// Clamped at both ends rather than wrapping: the C# does
			// `if (!= LOW) --` and `if (!= HIGH) ++`, so Left at LOW and Right
			// at HIGH are no-ops instead of jumping to the other extreme.
			o.resourcesAvailability = dir === -1
				? o.resourcesAvailability > Resources.LOW
					? ((o.resourcesAvailability - 1) as Resources)
					: Resources.LOW
				: o.resourcesAvailability < Resources.HIGH
					? ((o.resourcesAvailability + 1) as Resources)
					: Resources.HIGH;
			break;
		case OptionIDs.GAME_RESCUE_DAY:
			// A day, stepped by one, clamped by the setter to 6..100 — and 6 is
			// `RESCUE_DAY_RANDOM`, so it is a real row value rather than a floor
			// the player can reach and get stuck on.
			o.visibleRescueDay += dir;
			break;
		case OptionIDs.GAME_MAX_DOGS:
			o.maxDogs += dir;
			break;
		case OptionIDs.GAME_MAX_UNDEADS:
			o.maxUndeads += dir * 10;
			break;
		case OptionIDs.GAME_DAY_ZERO_UNDEADS_PERCENT:
			o.dayZeroUndeadsPercent += dir * 5;
			break;
		case OptionIDs.GAME_ZOMBIE_INVASION_DAILY_INCREASE:
			o.zombieInvasionDailyIncrease += dir;
			break;
		case OptionIDs.GAME_CITY_SIZE:
			o.citySize += dir;
			break;
		case OptionIDs.GAME_NPC_CAN_STARVE_TO_DEATH:
			o.nPCCanStarveToDeath = !o.nPCCanStarveToDeath;
			break;
		case OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE:
			o.starvedZombificationChance += dir * 5;
			break;
		case OptionIDs.GAME_SIMULATE_DISTRICTS:
			if (dir < 0) {
				if (o.simulateDistricts !== SimRatio.OFF) {
					o.simulateDistricts = (o.simulateDistricts - 1) as SimRatio;
				}
			} else if (o.simulateDistricts !== SimRatio.FULL) {
				o.simulateDistricts = (o.simulateDistricts + 1) as SimRatio;
			}
			break;
		case OptionIDs.GAME_SIMULATE_SLEEP:
			o.simulateWhenSleeping = !o.simulateWhenSleeping;
			break;
		case OptionIDs.GAME_SIM_THREAD:
			o.simThread = !o.simThread;
			break;
		case OptionIDs.GAME_IDLE_AUTO_ADVANCE:
			// Stepped like SimRatio rather than toggled, because "off" is one
			// value among several and not a boolean: a player who finds the
			// fastest step aggressive needs a longer one to exist to move to.
			if (dir < 0) {
				if (o.idleAutoAdvance !== IdleAdvance._FIRST) {
					o.idleAutoAdvance = (o.idleAutoAdvance - 1) as IdleAdvance;
				}
			} else if (o.idleAutoAdvance !== IdleAdvance._COUNT - 1) {
				o.idleAutoAdvance = (o.idleAutoAdvance + 1) as IdleAdvance;
			}
			break;
		case OptionIDs.GAME_ZOMBIFICATION_CHANCE:
			o.zombificationChance += dir * 5;
			break;
		case OptionIDs.GAME_REVEAL_STARTING_DISTRICT:
			o.revealStartingDistrict = !o.revealStartingDistrict;
			break;
		case OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION:
			o.allowUndeadsEvolution = !o.allowUndeadsEvolution;
			break;
		case OptionIDs.GAME_UNDEADS_UPGRADE_DAYS:
			if (dir < 0) {
				if (o.zombifiedsUpgradeDays !== ZupDays._FIRST) {
					o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays - 1) as ZupDays;
				}
			} else if (o.zombifiedsUpgradeDays !== ZupDays._COUNT - 1) {
				o.zombifiedsUpgradeDays = (o.zombifiedsUpgradeDays + 1) as ZupDays;
			}
			break;
		case OptionIDs.GAME_MAX_REINCARNATIONS:
			o.maxReincarnations += dir;
			break;
		case OptionIDs.GAME_REINCARNATE_AS_RAT:
			o.canReincarnateAsRat = !o.canReincarnateAsRat;
			break;
		case OptionIDs.GAME_REINCARNATE_TO_SEWERS:
			o.canReincarnateToSewers = !o.canReincarnateToSewers;
			break;
		case OptionIDs.GAME_REINC_LIVING_RESTRICTED:
			o.isLivingReincRestricted = !o.isLivingReincRestricted;
			break;
		case OptionIDs.GAME_PERMADEATH:
			o.isPermadeathOn = !o.isPermadeathOn;
			break;
		case OptionIDs.GAME_DEATH_SCREENSHOT:
			o.isDeathScreenshotOn = !o.isDeathScreenshotOn;
			break;
		case OptionIDs.GAME_AGGRESSIVE_HUNGRY_CIVILIANS:
			o.isAggressiveHungryCiviliansOn = !o.isAggressiveHungryCiviliansOn;
			break;
		case OptionIDs.GAME_NATGUARD_FACTOR:
			o.natGuardFactor += dir * 10;
			break;
		case OptionIDs.GAME_SUPPLIESDROP_FACTOR:
			o.suppliesDropFactor += dir * 10;
			break;
		case OptionIDs.GAME_RATS_UPGRADE:
			o.ratsUpgrade = !o.ratsUpgrade;
			break;
		case OptionIDs.GAME_SHAMBLERS_UPGRADE:
			o.shamblersUpgrade = !o.shamblersUpgrade;
			break;
		case OptionIDs.GAME_SKELETONS_UPGRADE:
			o.skeletonsUpgrade = !o.skeletonsUpgrade;
			break;
		case OptionIDs.GAME_AUTOSAVE_PERIOD:
			o.autoSavePeriodInHours += dir * 12;
			break; // alpha10.1
		case OptionIDs.UI_SPRITE_STYLE: {
			/*
			 * Bounded index arithmetic over the list of sets that exist on
			 * disk, in the same shape as the SimRatio and ZupDays cases:
			 * clamped, not wrapped, so Left on the first set is a no-op
			 * rather than a jump to the last.
			 *
			 * The list is `AssetPaths.IMAGE_SETS` rather than an enum
			 * because that is the thing that has to agree with the folders
			 * in `assets/images/` — see `GameOptions.spriteStyle`.
			 */
			const index = IMAGE_SETS.indexOf(o.spriteStyle);
			const next = index + dir;
			if (next >= 0 && next < IMAGE_SETS.length) {
				o.spriteStyle = IMAGE_SETS[next]!;
			}
			break;
		}
		case OptionIDs.UI_FONT_CHOICE: {
			// Same bounded-index shape, over the typefaces `ui/fonts.ts` offers.
			// The setter applies it, so the next frame is drawn in the new face
			// rather than the next reload. The caller is what has to notice and
			// redraw once the faces land; see the function comment.
			const index = FONT_CHOICES.indexOf(o.fontChoice);
			const next = index + dir;
			if (next >= 0 && next < FONT_CHOICES.length) {
				o.fontChoice = FONT_CHOICES[next]!;
			}
			break;
		}
		case OptionIDs.UI_VIEW_MODE: {
			// Same bounded-index shape, over the views `firstperson/Types` offers.
			// Unlike the two above there is nothing to apply afterwards: the view
			// mode has no second copy to push into, and `RogueGame.ApplyOptions`
			// picks the change up when this screen exits. See `m_ViewMode`.
			//
			// An unrecognised stored value — a hand-edited or truncated options
			// blob — is not on the list, so `indexOf` is -1 and `index + dir`
			// would land on an arbitrary neighbour. Repair it to the default and
			// stop, rather than showing a row whose value is about to jump.
			if (!VIEW_MODES.includes(o.viewMode)) {
				o.viewMode = DEFAULT_VIEW_MODE;
				break;
			}
			const index = VIEW_MODES.indexOf(o.viewMode);
			const next = index + dir;
			if (next >= 0 && next < VIEW_MODES.length) {
				o.viewMode = VIEW_MODES[next]!;
			}
			break;
		}
		default:
			break;
	}
}
