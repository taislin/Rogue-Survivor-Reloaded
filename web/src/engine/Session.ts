/**
 * Game session state - port of src/Engine/Session.cs
 *
 * C# binary/SOAP/XML serialization → `localStorage` JSON.
 * The `world` object graph is not serialized yet (Phase 4).
 */

import { Actor } from "@data/Actor";
import { FireMode } from "@data/Attack";
import { Item } from "@data/Item";
import { District } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { World } from "@data/World";
import { WorldTime } from "@engine/WorldTime";
import { GameOptions, Options } from "@engine/GameOptions";
import { Scoring } from "@engine/Scoring";

export enum GameMode {
  GM_STANDARD,
  GM_CORPSES_INFECTION,
  GM_VINTAGE,
}

export enum ScriptStage {
  STAGE_0,
  STAGE_1,
  STAGE_2,
  STAGE_3,
  STAGE_4,
  STAGE_5,
}

export enum RaidType {
  _FIRST = 0,

  BIKERS = _FIRST,
  GANGSTA,
  BLACKOPS,
  SURVIVORS,

  /** "Fake" raid for AIs. */
  NATGUARD,

  /** "Fake" raid for AIs. */
  ARMY_SUPLLIES,

  _COUNT,
}

/** C# SaveFormat.BIN/SOAP/XML are all replaced by JSON. */
export enum SaveFormat {
  FORMAT_JSON,
}

export class UniqueActor {
  isSpawned = false;
  theActor: Actor | null = null;
  isWithRefugees = false;
  eventThemeMusic: string | null = null;
  eventMessage: string | null = null;
}

export class UniqueActors {
  bigBear = new UniqueActor();
  duckman = new UniqueActor();
  famuFataru = new UniqueActor();
  hansVonHanz = new UniqueActor();
  jasonMyers = new UniqueActor();
  policeStationPrisoner = new UniqueActor();
  roguedjack = new UniqueActor();
  santaman = new UniqueActor();
  theSewersThing = new UniqueActor();

  /** Allocates a new array each call, don't overuse it... */
  toArray(): UniqueActor[] {
    return [
      this.bigBear,
      this.duckman,
      this.famuFataru,
      this.hansVonHanz,
      this.roguedjack,
      this.santaman,
      this.policeStationPrisoner,
      this.theSewersThing,
      this.jasonMyers, // alpha10
    ];
  }
}

export class UniqueItem {
  isSpawned = false;
  theItem: Item | null = null;
}

export class UniqueItems {
  theSubwayWorkerBadge = new UniqueItem();
}

export class UniqueMap {
  theMap: GameMap | null = null;
}

export class UniqueMaps {
  charUndergroundFacility = new UniqueMap();
  policeStation_OfficesLevel = new UniqueMap();
  policeStation_JailsLevel = new UniqueMap();
  hospital_Admissions = new UniqueMap();
  hospital_Offices = new UniqueMap();
  hospital_Patients = new UniqueMap();
  hospital_Storage = new UniqueMap();
  hospital_Power = new UniqueMap();
}

/**
 * All the data that is needed to represent the game state, or in other words
 * everything that need to be saved and loaded.
 */
export class Session {
  static readonly STORAGE_KEY = "rogue-survivor-session";

  private static s_TheSession: Session | null = null;

  // ── Game mode ───────────────────────────────────────────────────────────
  private m_GameMode: GameMode = GameMode.GM_STANDARD;

  // ── World map ───────────────────────────────────────────────────────────
  private m_WorldTime: WorldTime | null = null;
  private m_World: World | null = null;
  private m_CurrentMap: GameMap | null = null;

  // ── Scoring ─────────────────────────────────────────────────────────────
  private m_Scoring: Scoring | null = null;

  /**
   * [RaidType, District.WorldPosition.X, District.WorldPosition.Y] -> turnCounter
   */
  private m_Event_Raids: number[][][] = [];

  // alpha10.1
  private m_NextAutoSaveTime = 0;

  seed = 0;
  lastTurnPlayerActed = 0;

  // ── Uniques ─────────────────────────────────────────────────────────────
  uniqueActors = new UniqueActors();
  uniqueItems = new UniqueItems();
  uniqueMaps = new UniqueMaps();

  // ── Special flags ───────────────────────────────────────────────────────
  playerKnows_CHARUndergroundFacilityLocation = false;
  playerKnows_TheSewersThingLocation = false;
  charUndergroundFacility_Activated = false;
  scriptStage_PoliceStationPrisoner: ScriptStage = ScriptStage.STAGE_0;
  player_CurrentFireMode: FireMode = FireMode.DEFAULT;
  player_TurnCharismaRoll = 0;

  // ── Properties ──────────────────────────────────────────────────────────
  /** Gets the current Session (singleton). */
  static get(): Session {
    if (Session.s_TheSession === null) Session.s_TheSession = new Session();
    return Session.s_TheSession;
  }

  get gameMode(): GameMode {
    return this.m_GameMode;
  }
  set gameMode(value: GameMode) {
    this.m_GameMode = value;
  }

  get worldTime(): WorldTime {
    if (this.m_WorldTime === null) this.m_WorldTime = new WorldTime();
    return this.m_WorldTime;
  }

  get world(): World | null {
    return this.m_World;
  }
  set world(value: World | null) {
    this.m_World = value;
  }

  get currentMap(): GameMap | null {
    return this.m_CurrentMap;
  }
  set currentMap(value: GameMap | null) {
    this.m_CurrentMap = value;
  }

  get scoring(): Scoring {
    if (this.m_Scoring === null) this.m_Scoring = new Scoring();
    return this.m_Scoring;
  }

  // alpha10.01
  get nextAutoSaveTime(): number {
    return this.m_NextAutoSaveTime;
  }
  set nextAutoSaveTime(value: number) {
    this.m_NextAutoSaveTime = value;
  }

  // ── Init ────────────────────────────────────────────────────────────────
  private constructor() {
    this.reset();
  }

  reset(): void {
    this.seed = Math.floor(Date.now() % 0x7fffffff);
    this.m_CurrentMap = null;
    this.m_Scoring = new Scoring();
    this.m_World = null;
    this.m_WorldTime = new WorldTime();
    this.lastTurnPlayerActed = 0;

    const citySize = Options.citySize;
    this.m_Event_Raids = [];
    for (let i = RaidType._FIRST; i < RaidType._COUNT; i++) {
      const raidGrid: number[][] = [];
      for (let x = 0; x < citySize; x++) {
        const column: number[] = [];
        for (let y = 0; y < citySize; y++) column.push(-1);
        raidGrid.push(column);
      }
      this.m_Event_Raids.push(raidGrid);
    }

    ////////////////////////////
    // Reset special properties.
    ////////////////////////////
    this.charUndergroundFacility_Activated = false;
    this.playerKnows_CHARUndergroundFacilityLocation = false;
    this.playerKnows_TheSewersThingLocation = false;
    this.scriptStage_PoliceStationPrisoner = ScriptStage.STAGE_0;
    this.uniqueActors = new UniqueActors();
    this.uniqueItems = new UniqueItems();
    this.uniqueMaps = new UniqueMaps();
    // alpha10
    this.player_CurrentFireMode = FireMode.DEFAULT;
    this.player_TurnCharismaRoll = 0;
    // alpha10.1
    this.m_NextAutoSaveTime = 0;
  }

  // ── Events ──────────────────────────────────────────────────────────────
  hasRaidHappened(raid: RaidType, district: District): boolean {
    if (!district) throw new Error("district");
    return this.m_Event_Raids[raid][district.worldPosition.x][district.worldPosition.y] > -1;
  }

  lastRaidTime(raid: RaidType, district: District): number {
    if (!district) throw new Error("district");
    return this.m_Event_Raids[raid][district.worldPosition.x][district.worldPosition.y];
  }

  setLastRaidTime(raid: RaidType, district: District, turnCounter: number): void {
    if (!district) throw new Error("district");
    this.m_Event_Raids[raid][district.worldPosition.x][district.worldPosition.y] = turnCounter;
  }

  // ── Saving & Loading ────────────────────────────────────────────────────

  /**
   * Serializes the session's scalar state.
   *
   * The `world`/`currentMap` object graph is not serialized yet — that needs
   * `toJSON()` support across the data layer (Phase 4).
   */
  static save(session: Session, _format: SaveFormat = SaveFormat.FORMAT_JSON): void {
    const data = {
      gameMode: session.m_GameMode,
      seed: session.seed,
      lastTurnPlayerActed: session.lastTurnPlayerActed,
      eventRaids: session.m_Event_Raids,
      nextAutoSaveTime: session.m_NextAutoSaveTime,
      playerKnows_CHARUndergroundFacilityLocation: session.playerKnows_CHARUndergroundFacilityLocation,
      playerKnows_TheSewersThingLocation: session.playerKnows_TheSewersThingLocation,
      charUndergroundFacility_Activated: session.charUndergroundFacility_Activated,
      scriptStage_PoliceStationPrisoner: session.scriptStage_PoliceStationPrisoner,
      player_CurrentFireMode: session.player_CurrentFireMode,
      player_TurnCharismaRoll: session.player_TurnCharismaRoll,
      worldTime: session.m_WorldTime ? session.m_WorldTime.turnCounter : 0,
      // TODO(phase 4): serialize m_World / m_CurrentMap once the data layer
      // implements toJSON().
    };
    localStorage.setItem(Session.STORAGE_KEY, JSON.stringify(data));
  }

  /** Try to load, false if failed. */
  static load(_format: SaveFormat = SaveFormat.FORMAT_JSON): boolean {
    try {
      const raw = localStorage.getItem(Session.STORAGE_KEY);
      if (raw === null) return false;

      const data = JSON.parse(raw) as Record<string, unknown>;
      const session = Session.get();
      session.reset();

      session.m_GameMode = data.gameMode as GameMode;
      session.seed = data.seed as number;
      session.lastTurnPlayerActed = data.lastTurnPlayerActed as number;
      session.m_Event_Raids = data.eventRaids as number[][][];
      session.m_NextAutoSaveTime = data.nextAutoSaveTime as number;
      session.playerKnows_CHARUndergroundFacilityLocation =
        data.playerKnows_CHARUndergroundFacilityLocation as boolean;
      session.playerKnows_TheSewersThingLocation = data.playerKnows_TheSewersThingLocation as boolean;
      session.charUndergroundFacility_Activated = data.charUndergroundFacility_Activated as boolean;
      session.scriptStage_PoliceStationPrisoner = data.scriptStage_PoliceStationPrisoner as ScriptStage;
      session.player_CurrentFireMode = data.player_CurrentFireMode as FireMode;
      session.player_TurnCharismaRoll = data.player_TurnCharismaRoll as number;
      session.worldTime.turnCounter = data.worldTime as number;

      return true;
    } catch {
      // failed to load session (no save game?)
      Session.s_TheSession = null;
      return false;
    }
  }

  static delete(_filepath: string | null = null): boolean {
    try {
      localStorage.removeItem(Session.STORAGE_KEY);
      return true;
    } catch {
      // failing silently.
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  static descGameMode(mode: GameMode): string {
    switch (mode) {
      case GameMode.GM_STANDARD:
        return "STD - Standard Game";
      case GameMode.GM_CORPSES_INFECTION:
        return "C&I - Corpses & Infection";
      case GameMode.GM_VINTAGE:
        return "VTG - Vintage Zombies";
      default:
        throw new Error("unhandled game mode");
    }
  }

  static descShortGameMode(mode: GameMode): string {
    switch (mode) {
      case GameMode.GM_STANDARD:
        return "STD";
      case GameMode.GM_CORPSES_INFECTION:
        return "C&I";
      case GameMode.GM_VINTAGE:
        return "VTG";
      default:
        throw new Error("unhandled game mode");
    }
  }

  // alpha10
  actorToUniqueActor(a: Actor): UniqueActor {
    if (!a.isUnique) throw new Error("actor is not unique");
    for (const unique of this.uniqueActors.toArray()) {
      if (unique.theActor === a) return unique;
    }
    throw new Error("actor is flagged as unique but did not find it!");
  }
}

// Re-exported so `GameOptions.ts` can stay decoupled from RogueGame.
export type { GameOptions };
