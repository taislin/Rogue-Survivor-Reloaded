/**
 * Scoring & achievements - port of src/Engine/Scoring.cs
 */

import { Actor } from "@data/Actor";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { WorldTime } from "@engine/WorldTime";
import { GameOptions, ZupDays } from "@engine/GameOptions";
import { GameMusics } from "@gameplay/GameSounds";
import { SkillID } from "@gameplay/Skills";

export enum AchievementIDs {
  _FIRST = 0,

  REACHED_DAY_07 = _FIRST,
  REACHED_DAY_14,
  REACHED_DAY_21,
  REACHED_DAY_28,

  CHAR_BROKE_INTO_OFFICE,
  CHAR_FOUND_UNDERGROUND_FACILITY,
  CHAR_POWER_UNDERGROUND_FACILITY,

  KILLED_THE_SEWERS_THING,

  _COUNT,
}

export class Achievement {
  readonly id: AchievementIDs;
  readonly name: string;
  readonly teaseName: string;
  readonly text: readonly string[];
  readonly musicId: string;
  readonly scoreValue: number;
  isDone = false;

  constructor(
    id: AchievementIDs,
    name: string,
    teaseName: string,
    text: string[],
    musicId: string,
    scoreValue: number
  ) {
    this.id = id;
    this.name = name;
    this.teaseName = teaseName;
    this.text = text;
    this.musicId = musicId;
    this.scoreValue = scoreValue;
  }
}

export enum DifficultySide {
  FOR_SURVIVOR,
  FOR_UNDEAD,
}

export class KillData {
  actorModelID: number;
  amount: number;
  firstKillTurn: number;

  constructor(actorModelID: number, turn: number) {
    this.actorModelID = actorModelID;
    this.amount = 1;
    this.firstKillTurn = turn;
  }
}

export class GameEventData {
  readonly turn: number;
  readonly text: string;

  constructor(turn: number, text: string) {
    this.turn = turn;
    this.text = text;
  }
}

export class Scoring {
  static readonly MAX_ACHIEVEMENTS = AchievementIDs._COUNT;

  static readonly SCORE_BONUS_FOR_KILLING_LIVING_AS_UNDEAD = 12 * WorldTime.TURNS_PER_HOUR;

  // ── Fields ──────────────────────────────────────────────────────────────
  private m_StartScoringTurn = 0;
  private m_ReincarnationNumber = 0;
  private m_Kills = new Map<number, KillData>();
  private m_Sightings = new Set<number>();
  private m_Events: GameEventData[] = [];
  private m_VisitedMaps = new Set<GameMap>();
  private m_FollowersWhenDied: Actor[] | null = null;
  private m_Killer: Actor | null = null;
  private m_ZombifiedPlayer: Actor | null = null;
  private m_KillPoints = 0;
  private m_DifficultyRating = 1;
  private m_Side: DifficultySide = DifficultySide.FOR_SURVIVOR;

  // ── Properties ──────────────────────────────────────────────────────────
  get side(): DifficultySide {
    return this.m_Side;
  }
  set side(value: DifficultySide) {
    this.m_Side = value;
  }
  get startScoringTurn(): number {
    return this.m_StartScoringTurn;
  }
  set startScoringTurn(value: number) {
    this.m_StartScoringTurn = value;
  }
  /** Current reincarnation, 0 is the first life. */
  get reincarnationNumber(): number {
    return this.m_ReincarnationNumber;
  }
  set reincarnationNumber(value: number) {
    this.m_ReincarnationNumber = value;
  }
  achievements: Achievement[] = [];
  /** obsolete */
  startingSkill: SkillID = SkillID.AGILE;
  turnsSurvived = 0;
  deathReason: string | null = null;
  deathPlace: string | null = null;
  completedAchievementsCount = 0;
  /** Reallife playing time in seconds. */
  realLifePlayingTimeSeconds = 0;

  get events(): readonly GameEventData[] {
    return this.m_Events;
  }
  get hasNoEvents(): boolean {
    return this.m_Events.length === 0;
  }
  get kills(): IterableIterator<KillData> {
    return this.m_Kills.values();
  }
  get hasNoKills(): boolean {
    return this.m_Kills.size === 0;
  }
  get sightings(): IterableIterator<number> {
    return this.m_Sightings.values();
  }
  get followersWhendDied(): Actor[] | null {
    return this.m_FollowersWhenDied;
  }
  get killer(): Actor | null {
    return this.m_Killer;
  }
  get zombifiedPlayer(): Actor | null {
    return this.m_ZombifiedPlayer;
  }
  get killPoints(): number {
    return this.m_KillPoints;
  }
  get survivalPoints(): number {
    return 2 * (this.turnsSurvived - this.m_StartScoringTurn);
  }
  get achievementPoints(): number {
    let bonus = 0;
    for (let i = AchievementIDs._FIRST; i < AchievementIDs._COUNT; i++) {
      if (this.hasCompletedAchievement(i)) bonus += this.getAchievement(i).scoreValue;
    }
    return bonus;
  }
  /** Difficulty as a float (0..1+), divided by current reincarnation number. */
  get difficultyRating(): number {
    return this.m_DifficultyRating / (1 + this.m_ReincarnationNumber);
  }
  set difficultyRating(value: number) {
    this.m_DifficultyRating = value;
  }
  /** (Difficulty * (SurvivalPoints + KillPoints + Achievement)) */
  get totalPoints(): number {
    return Math.floor(this.difficultyRating * (this.m_KillPoints + this.survivalPoints + this.achievementPoints));
  }


  // ── Init ────────────────────────────────────────────────────────────────
  constructor() {
    this.realLifePlayingTimeSeconds = 0;

    this.achievements = new Array<Achievement>(AchievementIDs._COUNT);

    // CHAR related
    this.initAchievement(
      AchievementIDs.CHAR_BROKE_INTO_OFFICE,
      new Achievement(
        AchievementIDs.CHAR_BROKE_INTO_OFFICE,
        "Broke into a CHAR Office",
        "Did not broke into XXX",
        ["Now try not to die too soon..."],
        GameMusics.HEYTHERE,
        1000
      )
    );

    this.initAchievement(
      AchievementIDs.CHAR_FOUND_UNDERGROUND_FACILITY,
      new Achievement(
        AchievementIDs.CHAR_FOUND_UNDERGROUND_FACILITY,
        "Found the CHAR Underground Facility",
        "Did not found XXX",
        ["Now, where is the light switch?..."],
        GameMusics.CHAR_UNDERGROUND_FACILITY,
        2000
      )
    );

    this.initAchievement(
      AchievementIDs.CHAR_POWER_UNDERGROUND_FACILITY,
      new Achievement(
        AchievementIDs.CHAR_POWER_UNDERGROUND_FACILITY,
        "Powered the CHAR Underground Facility",
        "Did not XXX the XXX",
        [
          "Personal message from the game developper : ",
          "Sorry, the rest of the plot is missing.",
          "For now its a dead end.",
          "Enjoy the rest of the game.",
          "See you in a next game version :)",
        ],
        GameMusics.CHAR_UNDERGROUND_FACILITY,
        3000
      )
    );

    // Killing uniques
    this.initAchievement(
      AchievementIDs.KILLED_THE_SEWERS_THING,
      new Achievement(
        AchievementIDs.KILLED_THE_SEWERS_THING,
        "Killed The Sewers Thing",
        "Did not kill the XXX",
        ["One less Thing to worry about!"],
        GameMusics.HEYTHERE,
        1000
      )
    );

    // Reaching Day X
    this.initAchievement(
      AchievementIDs.REACHED_DAY_07,
      new Achievement(
        AchievementIDs.REACHED_DAY_07,
        "Reached Day 7",
        "Did not reach XXX",
        ["Keep staying alive!"],
        GameMusics.HEYTHERE,
        1000
      )
    );

    this.initAchievement(
      AchievementIDs.REACHED_DAY_14,
      new Achievement(
        AchievementIDs.REACHED_DAY_14,
        "Reached Day 14",
        "Did not reach XXX",
        ["Keep staying alive!"],
        GameMusics.HEYTHERE,
        1000
      )
    );

    this.initAchievement(
      AchievementIDs.REACHED_DAY_21,
      new Achievement(
        AchievementIDs.REACHED_DAY_21,
        "Reached Day 21",
        "Did not reach XXX",
        ["Keep staying alive!"],
        GameMusics.HEYTHERE,
        1000
      )
    );

    this.initAchievement(
      AchievementIDs.REACHED_DAY_28,
      new Achievement(
        AchievementIDs.REACHED_DAY_28,
        "Reached Day 28",
        "Did not reach XXX",
        ["Is this the end?"],
        GameMusics.HEYTHERE,
        1000
      )
    );

  }

  /** Setup scoring for a new life (reincarnation). */
  startNewLife(gameTurn: number): void {
    // new life.
    ++this.m_ReincarnationNumber;

    // reset achievements.
    for (const a of this.achievements) a.isDone = false;
    this.completedAchievementsCount = 0;

    // reset visited maps.
    this.m_VisitedMaps.clear();

    // clear events.
    this.m_Events.length = 0;

    // clear sightings.
    this.m_Sightings.clear();

    // clear kills.
    this.m_Kills.clear();

    // reset killer, followers & zombified form.
    this.m_Killer = null;
    this.m_FollowersWhenDied = null;
    this.m_ZombifiedPlayer = null;

    // reset points.
    this.m_KillPoints = 0;

    // start scoring at this turn.
    this.m_StartScoringTurn = gameTurn;
  }

  // ── Achievements ────────────────────────────────────────────────────────
  hasCompletedAchievement(id: AchievementIDs): boolean {
    return this.achievements[id].isDone;
  }

  setCompletedAchievement(id: AchievementIDs): void {
    this.achievements[id].isDone = true;
  }

  getAchievement(id: AchievementIDs): Achievement {
    return this.achievements[id];
  }

  private initAchievement(id: AchievementIDs, a: Achievement): void {
    this.achievements[id] = a;
  }

  // ── Computing difficulty rating ─────────────────────────────────────────

  /** @returns [0..1+] */
  static computeDifficultyRating(
    options: GameOptions,
    side: DifficultySide,
    reincarnationNumber: number
  ): number {
    let rating = 1.0;

    // ── Constant factors. ───────────────────────────────────────────────
    // - Don't reveal starting map: +10%
    if (!options.revealStartingDistrict) rating += 0.1;

    // - Disable NPC starvation: -10%
    if (!options.nPCCanStarveToDeath) {
      if (side === DifficultySide.FOR_SURVIVOR) rating -= 0.1;
      else rating += 0.1;
    }

    // - Nat Guards : -50% -> +50%
    if (options.natGuardFactor !== GameOptions.DEFAULT_NATGUARD_FACTOR) {
      const k = (options.natGuardFactor - GameOptions.DEFAULT_NATGUARD_FACTOR) / GameOptions.DEFAULT_NATGUARD_FACTOR;
      if (side === DifficultySide.FOR_SURVIVOR) rating -= 0.5 * k;
      else rating += 0.5 * k;
    }

    // - Supplies : -50% -> +50%
    if (options.suppliesDropFactor !== GameOptions.DEFAULT_SUPPLIESDROP_FACTOR) {
      const k =
        (options.suppliesDropFactor - GameOptions.DEFAULT_SUPPLIESDROP_FACTOR) /
        GameOptions.DEFAULT_SUPPLIESDROP_FACTOR;
      if (side === DifficultySide.FOR_SURVIVOR) rating -= 0.5 * k;
      else rating += 0.5 * k;
    }

    // - Zombifieds UpDay
    if (options.zombifiedsUpgradeDays !== GameOptions.DEFAULT_ZOMBIFIEDS_UPGRADE_DAYS) {
      let k = 0;
      switch (options.zombifiedsUpgradeDays) {
        case ZupDays.OFF:
          k = -0.5;
          break;
        case ZupDays.ONE:
          k = 0.5;
          break;
        case ZupDays.TWO:
          k = 0.25;
          break;
        case ZupDays.THREE:
          break;
        case ZupDays.FOUR:
          k -= 0.1;
          break;
        case ZupDays.FIVE:
          k -= 0.2;
          break;
        case ZupDays.SIX:
          k -= 0.3;
          break;
        case ZupDays.SEVEN:
          k -= 0.4;
          break;
        default:
          break;
      }
      if (side === DifficultySide.FOR_SURVIVOR) rating += k;
      else rating -= k;
    }

    // ── Dynamic factors (reversed for undeads) ──────────────────────────
    // - Density : f(mapsize, civs+undeads), +/- 99%
    const kDefaultDensity =
      Math.sqrt(GameOptions.DEFAULT_MAX_CIVILIANS + GameOptions.DEFAULT_MAX_UNDEADS) /
      (GameOptions.DEFAULT_DISTRICT_SIZE * GameOptions.DEFAULT_DISTRICT_SIZE);
    const kDensity = Math.sqrt(options.maxCivilians + options.maxUndeads) / (options.districtSize * options.districtSize);
    const rDensity = (kDensity - kDefaultDensity) / kDefaultDensity;
    if (side === DifficultySide.FOR_SURVIVOR) rating += 0.99 * rDensity;
    else rating -= 0.99 * rDensity;

    // - Undeads : f(undeads/civs, day0, invasion%), +/- 50%
    const kDefaultUndeadsRatio = GameOptions.DEFAULT_MAX_UNDEADS / GameOptions.DEFAULT_MAX_CIVILIANS;
    const kUndeadsRatio = options.maxUndeads / options.maxCivilians;
    const kUndeads_Nb = (kUndeadsRatio - kDefaultUndeadsRatio) / kDefaultUndeadsRatio;
    const kUndeads_Day0 =
      (options.dayZeroUndeadsPercent - GameOptions.DEFAULT_DAY_ZERO_UNDEADS_PERCENT) /
      GameOptions.DEFAULT_DAY_ZERO_UNDEADS_PERCENT;
    const kUndeads_Inv =
      (options.zombieInvasionDailyIncrease - GameOptions.DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE) /
      GameOptions.DEFAULT_ZOMBIE_INVASION_DAILY_INCREASE;
    if (side === DifficultySide.FOR_SURVIVOR)
      rating += 0.3 * kUndeads_Nb + 0.05 * kUndeads_Day0 + 0.15 * kUndeads_Inv;
    else rating -= 0.3 * kUndeads_Nb + 0.05 * kUndeads_Day0 + 0.15 * kUndeads_Inv;

    // - Civilians : f(zombification%, canstarve&starvedzomb%), +/- 50%
    const kDefaultCivZombification =
      GameOptions.DEFAULT_MAX_CIVILIANS * GameOptions.DEFAULT_ZOMBIFICATION_CHANCE;
    const kCivZombification =
      (options.maxCivilians * options.zombificationChance - kDefaultCivZombification) / kDefaultCivZombification;

    const kDefaultCivStarvation =
      GameOptions.DEFAULT_MAX_CIVILIANS * GameOptions.DEFAULT_STARVED_ZOMBIFICATION_CHANCE;
    let kCivStarvation =
      (options.maxCivilians * options.starvedZombificationChance - kDefaultCivStarvation) / kDefaultCivStarvation;
    if (!options.nPCCanStarveToDeath) kCivStarvation = -1;
    if (side === DifficultySide.FOR_SURVIVOR) rating += 0.3 * kCivZombification + 0.2 * kCivStarvation;
    else rating -= 0.3 * kCivZombification + 0.2 * kCivStarvation;

    // ── Scaling factors. ────────────────────────────────────────────────
    // - Disable undeads evolution: x0.5 / x2
    if (!options.allowUndeadsEvolution) {
      if (side === DifficultySide.FOR_SURVIVOR) rating *= 0.5;
      else rating *= 2;
    }

    // - Enable Combat Assistant : x0.75
    if (options.isCombatAssistantOn) rating *= 0.75;

    // - Enable permadeath : x2
    if (options.isPermadeathOn) rating *= 2.0;

    // - Aggressive Hungry Civs : x0.5 / x2
    if (!options.isAggressiveHungryCiviliansOn) {
      if (side === DifficultySide.FOR_SURVIVOR) rating *= 0.5;
      else rating *= 2;
    }
    // - Rats Upgrade
    if (options.ratsUpgrade) {
      if (side === DifficultySide.FOR_SURVIVOR) rating *= 1.1;
      else rating *= 0.9;
    }
    // - Skeletons Upgrade
    if (options.skeletonsUpgrade) {
      if (side === DifficultySide.FOR_SURVIVOR) rating *= 1.2;
      else rating *= 0.8;
    }
    // - Shamblers Upgrade
    if (options.shamblersUpgrade) {
      if (side === DifficultySide.FOR_SURVIVOR) rating *= 1.25;
      else rating *= 0.75;
    }

    // Divide by reincarnation.
    rating /= 1 + reincarnationNumber;

    // done.
    return Math.max(rating, 0);
  }

  // ── Kills & Sightings ───────────────────────────────────────────────────

  /**
   * Add kill to record and increase kill points.
   * Distinguish killing as living vs killing as undead.
   */
  addKill(player: Actor, victim: Actor, turn: number): void {
    void player;
    const actorModelID = victim.model.id;

    // add kill.
    const data = this.m_Kills.get(actorModelID);
    if (data) {
      ++data.amount;
    } else {
      // first kill!
      this.m_Kills.set(actorModelID, new KillData(actorModelID, turn));
      this.m_Events.push(new GameEventData(turn, `Killed first ${Models.actors.get(actorModelID).name}.`));
    }

    // add to score.
    this.m_KillPoints += Models.actors.get(actorModelID).scoreValue;

    // killing livings as undead give bonuses.
    if (this.m_Side === DifficultySide.FOR_UNDEAD && !Models.actors.get(actorModelID).abilities.isUndead) {
      this.m_KillPoints += Scoring.SCORE_BONUS_FOR_KILLING_LIVING_AS_UNDEAD;
    }
  }

  addSighting(actorModelID: number, turn: number): void {
    // ignore if already sighted.
    if (this.m_Sightings.has(actorModelID)) return;

    // add.
    this.m_Sightings.add(actorModelID);
    this.m_Events.push(new GameEventData(turn, `Sighted first ${Models.actors.get(actorModelID).name}.`));
  }

  hasSighted(actorModelID: number): boolean {
    return this.m_Sightings.has(actorModelID);
  }

  // ── Map & zones visits ──────────────────────────────────────────────────
  hasVisited(map: GameMap): boolean {
    return this.m_VisitedMaps.has(map);
  }

  addVisit(_turn: number, map: GameMap): void {
    this.m_VisitedMaps.add(map);
  }

  // ── Dying : stuff to remember at death. ─────────────────────────────────
  /** @param k can be null */
  setKiller(k: Actor | null): void {
    this.m_Killer = k;
  }

  /** @param z can be null */
  setZombifiedPlayer(z: Actor | null): void {
    this.m_ZombifiedPlayer = z;
  }

  /** Adds an actor that was a player follower at time of death. */
  addFollowerWhenDied(fo: Actor): void {
    if (this.m_FollowersWhenDied === null) this.m_FollowersWhenDied = [];
    this.m_FollowersWhenDied.push(fo);
  }

  // ── Misc events ─────────────────────────────────────────────────────────
  addEvent(turn: number, text: string): void {
    this.m_Events.push(new GameEventData(turn, text));
  }
}
