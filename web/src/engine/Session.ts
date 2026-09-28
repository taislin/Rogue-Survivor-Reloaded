/**
 * Game session state - port of src/Engine/Session.cs
 *
 * C# binary/SOAP/XML serialization → `localStorage` JSON. The C# gets that for
 * free from `BinaryFormatter`, which walks the whole object graph; the port has
 * to do it by hand, and the world/map graph is in `engine/serialization/`.
 */

import { Actor } from "@data/Actor";
import { FireMode } from "@data/Attack";
import { Item } from "@data/Item";
import { Inventory } from "@data/Inventory";
import { District } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { World } from "@data/World";
import { WorldTime } from "@engine/WorldTime";
import { Weather } from "@data/Weather";
import { GameOptions, Options } from "@engine/GameOptions";
import { Scoring } from "@engine/Scoring";
import { storage } from "@engine/storage";
import { GRAPH_VERSION, type GraphData } from "@engine/serialization/SessionGraph";
import { readSessionGraph, writeSessionGraph, findPlayerActor } from "@engine/serialization/sessionGraphRoot";
import { reportSwallowed } from "@engine/Diagnostics";

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
  private m_Weather: Weather = Weather.CLEAR;

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

  /**
   * An explicitly requested RNG seed, or 0 for "derive from the clock".
   *
   * `reset()` honours this, so a forced seed survives the resets that
   * `HandleNewCharacter` and `Session.load()` perform. It is deliberately *not*
   * serialized: it is a property of one process, not of a saved game.
   */
  private m_ForcedSeed = 0;

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

  /**
   * Pin the RNG seed so a run is reproducible, then reset.
   *
   * This exists because `reset()` otherwise seeds from `Date.now()`, which made
   * every headless run explore a different world and fail in a different place
   * — so bugs could be found but never regression-tested. Pass 0 to go back to
   * the clock-derived default.
   *
   * **Call this before constructing `RogueGame`.** The game constructor builds
   * `Rules` from `Session.get().seed`, so a seed applied afterwards would
   * reseed world generation while leaving the rules roller on the old value —
   * only half the run would be deterministic, which is worse than none.
   */
  static useSeed(seed: number): Session {
    const session = Session.get();
    session.m_ForcedSeed = seed > 0 ? seed >>> 0 : 0;
    session.reset();
    return session;
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

  get weather(): Weather {
    return this.m_Weather;
  }
  set weather(value: Weather) {
    this.m_Weather = value;
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


    this.lastLoadError = null;    this.seed =
      this.m_ForcedSeed !== 0 ? this.m_ForcedSeed : Math.floor(Date.now() % 0x7fffffff);
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
    this.m_LoadedPlayer = null;
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
   * Serializes the whole session: its scalars, and the world/map object graph.
   *
   * The graph is written by `writeSessionGraph` — see
   * `engine/serialization/SessionGraph.ts` for the format and for why it is not
   * `JSON.stringify`. `graphVersion` goes in alongside it, and `load` refuses
   * anything that does not carry a complete graph at this version: a load that
   * restores the scalars and silently drops the world is a half-loaded game, and
   * half-loaded is worse than not loaded.
   *
   * Throws rather than swallowing: a graph that cannot be written (an object with
   * no codec, a field JSON cannot carry) is a bug in the port, and writing a
   * partial save over a good one would turn a loud failure into a silent one.
   *
   * The one failure it does *not* throw on is storage refusing the write, because
   * a full world is legitimately bigger than the string store — see `adopt`.
   */
  static save(session: Session, _format: SaveFormat = SaveFormat.FORMAT_JSON): void {
    // C# `Session.Save` opens with `session.World.OptimizeBeforeSaving()`
    // (`src/Engine/Session.cs:589`) — a whole-graph pass that drops references to
    // dead actors before anything is serialised. Run it here, before the graph is
    // built, so the graph cannot capture what the pass is meant to remove.
    Session.optimizeBeforeSaving(session);

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
      weather: session.m_Weather,
      worldTime: session.m_WorldTime ? session.m_WorldTime.turnCounter : 0,
      graphVersion: GRAPH_VERSION,
      graph: Session.writeGraph(session),
    };
    // Serialized before it is stored, so a failure above cannot leave a
    // half-written save behind: `adopt` is the only call that touches storage.
    Session.adopt(JSON.stringify(data));
  }

  /**
   * C# `World.OptimizeBeforeSaving` and everything it reaches.
   *
   * The C# spreads this over seven `OptimizeBeforeSaving` methods — `World` →
   * `District` → `Map` / `Actor` / `Inventory`, and `Map` → `Tile` → item stack
   * plus each actor. It is transcribed here as one traversal rather than seven
   * methods because the only overrides in the whole hierarchy are on `Item`, and
   * a method per level that only forwards is seven chances to forget a
   * container. What it visits is the C#'s, narrowed to the containers this port
   * actually has: items live either in an actor's inventory or in one of
   * `Map.GroundInventories` (which is also where a corpse's belongings are —
   * `getCorpseAt` resolves a corpse to its position). The port's `Tile` holds no
   * item stack and its `MapObject` has no inventory, so the C#'s tile and
   * map-object legs have nothing to walk.
   *
   * What it is for: an item's override drops references to dead actors, so a
   * save does not carry a corpse. The reachable behaviour change is that a
   * *revived* actor stops being bored of an entertainment item it was bored of
   * before it died — the C# says so in a comment at `ItemEntertainment.cs:53`
   * rather than leaving it to be discovered.
   */
  static optimizeBeforeSaving(session: Session): void {
    const world = session.world;
    if (world == null) return;

    for (let dx = 0; dx < world.size; dx++) {
      for (let dy = 0; dy < world.size; dy++) {
        const district = world.getDistrict(dx, dy);
        if (district == null) continue;
        for (const map of district.maps) {
          // C# Map.OptimizeBeforeSaving: the ground inventories, then the actors.
          for (const inventory of map.groundInventories) {
            Session.optimizeInventory(inventory);
          }
          for (const actor of map.actors) {
            Session.optimizeInventory(actor.inventory);
          }
        }
      }
    }
  }

  private static optimizeInventory(inventory: Inventory | null): void {
    if (inventory == null) return;
    for (const item of inventory.items) item.optimizeBeforeSaving();
  }

  /**
   * Holds a save for `load` to read, in storage if it fits and in memory if not.
   *
   * A save used to be small enough that `localStorage` was the obvious place for
   * it. It is not any more: a 3x3 world with nine districts and 56 maps measures
   * **4.6 MB** of JSON, and the string store is a ~5 MB budget shared with
   * everything else on the origin — and it counts UTF-16, so ~2.5 M characters.
   * Writing one there throws `QuotaExceededError`, which on its own would take the
   * game down on the very key a player presses to keep their game.
   *
   * So the buffer is best-effort: stored when it fits, remembered when it does
   * not. Nothing is lost either way, because the durable copy is the save slot —
   * `GameSaveManager` already falls back to IndexedDB for exactly this, and
   * `DoLoadGame` reads the slot back through it. This buffer only has to survive
   * the hop from "the player pressed S" to "the player pressed L".
   */
  private static s_Buffer: string | null = null;

  /** The save `load` will read, wherever it ended up. */
  private static readBuffer(): string | null {
    try {
      return storage.getItem(Session.STORAGE_KEY) ?? Session.s_Buffer;
    } catch {
      return Session.s_Buffer;
    }
  }

  /**
   * Makes `json` the save `load` reads, preferring storage.
   *
   * Called with a save that has just been written, and with one that has just been
   * read back out of a slot — which is why `RogueGame.LoadGame` uses this rather
   * than writing to storage itself: a loaded save can be just as large as a
   * written one.
   */
  static adopt(json: string): void {
    Session.s_Buffer = json;
    try {
      storage.setItem(Session.STORAGE_KEY, json);
    } catch {
      // The in-memory copy above is the fallback; see the note on `s_Buffer`.
    }
  }

  /**
   * The save as JSON, from wherever it ended up.
   *
   * `DoSaveGame` needs the text to hand to `GameSaveManager`, and it must not read
   * storage directly: for a world bigger than the string store the copy is only in
   * memory, and reading storage would come back empty — a save that reported
   * success and wrote nothing.
   */
  static savedJson(): string | null {
    return Session.readBuffer();
  }

  /**
   * The graph for this session, or null when there is no world to write.
   *
   * Null is a legitimate answer — a session that has been reset, or a world that
   * was never generated — and `load` refuses it, so the save that gets written
   * says "no graph" rather than pretending to have one.
   */
  private static writeGraph(session: Session): GraphData | null {
    const world = session.m_World;
    const currentMap = session.m_CurrentMap;
    if (world == null || currentMap == null) return null;
    return writeSessionGraph(
      world,
      currentMap,
      session.scoring,
      session,
      findPlayerActor(currentMap),
      session.m_WorldTime ? session.m_WorldTime.turnCounter : 0
    );
  }

  /** Try to load, false if failed. */
  static load(_format: SaveFormat = SaveFormat.FORMAT_JSON): boolean {
    try {
      const raw = Session.readBuffer();
      if (raw === null) return false;

      const data = JSON.parse(raw) as Record<string, unknown>;

      /*
       * A save is only restorable if it carries a world graph written at the
       * version this build understands. Two things are refused, and both are
       * refused *before* `reset()` so that a save we cannot restore never also
       * destroys the game in progress — `reset()` clears the world, the current
       * map and the scoring, so validating afterwards would refuse the load
       * *and* wipe what the player was standing in.
       *
       *  - No graph: a session that was saved with no world, or one written by a
       *    build that could not. Restoring the scalars into a session with no
       *    actors would be a half-loaded game.
       *  - Wrong `graphVersion`: a format this build cannot read, which is what
       *    the C# does for an unknown `SaveFormat` and what "VERSION NOT
       *    COMPATIBLE" in `DoLoadGame` means.
       *
       * Both are checked on the *data*, not on a save-file version string.
       */
      if (data.graph == null) return false;
      if ((data.graphVersion as number) !== GRAPH_VERSION) return false;

      // The graph is read before anything is installed, so a graph that cannot be
      // read (a truncated save, an unresolvable reference) leaves the live session
      // exactly as it was rather than half-replaced.
      const loaded = readSessionGraph(data.graph as GraphData);

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
      session.m_Weather = (data.weather as Weather) ?? Weather.CLEAR;

      /*
       * The clock and the scoring are assigned to the backing fields, not through
       * the `worldTime` and `scoring` getters: both getters *create* a blank
       * object when their field is null, so writing through them on a session
       * that has just been reset would build a fresh `WorldTime(0)` and a fresh
       * `Scoring` and then quietly keep the blank one.
       */
      session.m_WorldTime = new WorldTime(loaded.worldTimeTurn);
      session.m_Scoring = loaded.scoring;
      session.m_World = loaded.world;
      session.m_CurrentMap = loaded.currentMap;
      session.uniqueActors = loaded.uniqueActors;
      session.uniqueItems = loaded.uniqueItems;
      session.uniqueMaps = loaded.uniqueMaps;

      // The player comes back without a controller — controllers are not part of
      // the graph — so the actor that was the player is recorded here and
      // `RogueGame.LoadGame` reattaches one.
      session.m_LoadedPlayer = loaded.player;
      session.lastLoadError = null;

      return true;
    } catch (e) {
      /*
       * Failed to load the session. The C# nulls `s_TheSession` here
       * (`Session.cs:659`) because a load happens at startup, when the only
       * session is the one being replaced. In the browser `LoadGame` runs
       * mid-game, so nulling the singleton would orphan the live game: the
       * `RogueGame` holds its own reference and would keep going, while the next
       * `Session.get()` handed out a *different* object. Leaving it alone is
       * both safer and closer to what the player expects from a failed load.
       *
       * Returning `false` is the right *behaviour* and was a silent *report*.
       * Every cause collapsed into it — corrupt JSON, a truncated save, an
       * unresolvable reference, an out-of-memory, and a genuine deserialiser bug
       * — and `RogueGame.DoLoadGame` turns `false` into the player-facing
       * "NO GAME SAVED OR VERSION NOT COMPATIBLE", so the message actively
       * misdirects: a bug in `specs.ts` is reported to the player as an
       * incompatible save file, and nothing is written anywhere. The class of
       * "silently truncated data" bugs this port has already fixed dozens of
       * times is undiagnosable if the failure leaves no trace.
       *
       * So the outcome stays `false` — the live session is untouched either way —
       * and the reason is reported.
       */
      console.warn(
        "[RogueSurvivor] session load failed; the live session has been left untouched:",
        e,
      );
      // `session` is bound inside the `try`, so reach the singleton directly.
      // It is the same object — `get()` returns the one live instance.
      Session.get().lastLoadError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /**
   * The actor the player was controlling in the save just loaded, if any.
   *
   * Cleared by `reset()`. `RogueGame.LoadGame` reads it once and hands the actor a
   * `PlayerController`; nothing else should need it.
   */
  private m_LoadedPlayer: Actor | null = null;

  /** The player actor restored by the last successful `load`, else null. */
  get loadedPlayer(): Actor | null {
    return this.m_LoadedPlayer;
  }

  /**
   * Why the last `load` failed, or null if it succeeded / has not been tried.
   *
   * `load` answers `false` for every cause — corrupt JSON, a truncated save, an
   * unresolvable reference, an OOM, or a deserialiser bug — and the caller turns
   * that into one fixed message. This is what lets the message say which, and
   * what makes the "silently truncated data" class diagnosable after the fact.
   */
  lastLoadError: string | null = null;

  static delete(_filepath: string | null = null): boolean {
    try {
      storage.removeItem(Session.STORAGE_KEY);
      return true;
    } catch (e) {
      // Was commented "failing silently", which is a description rather than a
      // decision: a save the player asked to delete and did not is exactly the
      // kind of thing that must not vanish without a trace.
      reportSwallowed("Session.delete", e);
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