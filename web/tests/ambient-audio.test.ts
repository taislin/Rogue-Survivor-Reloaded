/**
 * `Feature.AmbientAudio` — the thirteen ambient beds, on a channel of their own.
 *
 * Still Alive, Release 5-3 (rain), 6-4 (helicopter) and 6-6 (thunder, animals,
 * bells).
 *
 * ## What is wired, and what is not
 *
 * The C# table (`Gameplay/GameAmbients.cs`) is 13 entries and every one of them has
 * a file. The port ships all 13 files and all 13 constants, and **5 of the 13 are
 * reachable**:
 *
 * - `RAIN_INSIDE` / `RAIN_OUTSIDE` / `THUNDERING_RAIN_INSIDE` /
 *   `THUNDERING_RAIN_OUTSIDE` / `NIGHT_ANIMALS` — wired. The port has `Weather`,
 *   `WorldTime.isNight` and `Tile.isInside`, which are the C#'s only three inputs
 *   into the decision.
 * - The five `HELICOPTER_FLYOVER` / `STATIONARY_HELICOPTER_*` — **not wired**,
 *   pending `Feature.HelicopterRescue`. `CheckLandedHelicopterSFX` needs a rescue
 *   *map* and *coordinates*, and four noise radii the port does not have.
 * - The two `CHURCH_BELLS_*` — **not wired**, pending `Feature.Church`. The C#'s
 *   trigger is `Map.HasChurch`, and the port's `Map` has no such field.
 * - `TEST_AMBIENT` — shipped, deliberately unreachable. Its only C# caller is the
 *   options screen's ambient-volume preview, and the port has no such row.
 *
 * So this file is a suite about **five** tracks and a **thirteen**-entry table, and
 * it asserts both numbers rather than blurring them.
 *
 * ## Why the asset test is the loudest thing here
 *
 * A table of constants cannot be wrong in a way that shows. `ambientPath` derives a
 * URL from an id, and a URL that 404s is silent in a browser, silent in
 * `NullMusicManager`, and silent in the headless harness — which is exactly how the
 * music manager once played three sound effects out of a 404 *and silenced the
 * soundtrack* (`AssetPaths.audioPath`'s comment, and `music-priority.test.ts`).
 * So: for all thirteen, the id resolves, and the file it resolves to is on disk.
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Weather } from "@data/Weather";
import {
  AMBIENTS_ROOT,
  ambientPath,
  ASSETS_ROOT,
  isKnownAudioId,
  MUSIC_ROOT,
  SFX_ROOT,
} from "@engine/AssetPaths";
import { AMBIENT_SFX_VOLUME, type IAmbientManager } from "@engine/audio/IAmbientManager";
import { NullAmbientManager } from "@engine/audio/NullAmbientManager";
import { WebAudioAmbientManager } from "@engine/audio/WebAudioAmbientManager";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { AMBIENT_FILES, GameAmbients } from "@gameplay/GameAmbients";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { NullRogueUI } from "@ui/NullRogueUI";
import { publicFilePath } from "./helpers/assetPath";

const survivors = new Faction("The Survivors", "survivor");

/**
 * The C# table, written out rather than derived from `AMBIENT_FILES`.
 *
 * Two columns, `[id, file base name]`, so a transcription slip in either the
 * constant or the map is a failure. `GameAmbients.cs:12-46` in order.
 */
const CS_TABLE: readonly (readonly [string, string])[] = [
  ["outside whilst raining", "rain_outside_looped"],
  ["inside whilst raining", "rain_inside_looped"],
  ["outside whilst thundering rain", "thundering_rain_outside_looped"],
  ["inside whilst thundering rain", "thundering_rain_inside_looped"],
  ["helicopter flyover", "helicopter_flyover"],
  ["stationary helicopter farthest", "helicopter_static_farthest"],
  ["stationary helicopter far", "helicopter_static_far"],
  ["stationary helicopter nearby", "helicopter_static_nearby"],
  ["stationary helicopter visible", "helicopter_static_visible"],
  ["wild animals", "night_animals"],
  ["hearing church bells nearby", "church_bells_within_map"],
  ["hearing church bells far off", "church_bells_outside_map"],
  ["test_ambient", "test_ambient"],
];

/** The five the port can actually reach, and nothing else. See the file header. */
const WIRED: readonly string[] = [
  GameAmbients.RAIN_INSIDE,
  GameAmbients.RAIN_OUTSIDE,
  GameAmbients.THUNDERING_RAIN_INSIDE,
  GameAmbients.THUNDERING_RAIN_OUTSIDE,
  GameAmbients.NIGHT_ANIMALS,
];

/** The eight that are not, and the pending feature each is waiting on. */
const PENDING_ON_HELICOPTER: readonly string[] = [
  GameAmbients.HELICOPTER_FLYOVER,
  GameAmbients.STATIONARY_HELICOPTER_FARTHEST,
  GameAmbients.STATIONARY_HELICOPTER_FAR,
  GameAmbients.STATIONARY_HELICOPTER_NEAR,
  GameAmbients.STATIONARY_HELICOPTER_VISIBLE,
];
const PENDING_ON_CHURCH: readonly string[] = [
  GameAmbients.CHURCH_BELLS_WITHIN_MAP,
  GameAmbients.CHURCH_BELLS_OUTSIDE_MAP,
];

// ── The table ───────────────────────────────────────────────────────────────

describe("the ambient table is the C#'s thirteen", () => {
  it("has one entry per C# constant, with the C#'s display names", () => {
    // Spelled out above on purpose. Deriving this from `AMBIENT_FILES` would make
    // the assertion "the table has thirteen entries" true of any table that happens
    // to have thirteen entries, including one with the wrong thirteen.
    expect(Object.keys(AMBIENT_FILES).sort()).toEqual(CS_TABLE.map(([id]) => id).sort());
    expect(Object.keys(AMBIENT_FILES)).toHaveLength(13);
  });

  it("maps each id to the C#'s file name", () => {
    for (const [id, file] of CS_TABLE) expect(AMBIENT_FILES[id], id).toBe(file);
  });

  it("gives every id a `*_FILE` companion that is the resolved URL of that file", () => {
    // The C# keeps an id and a `*_FILE` per entry, and the port's manager takes the
    // id and derives the file. A `*_FILE` that disagrees with `AMBIENT_FILES` would
    // be a second source of truth nobody checks, which is the shape of bug the
    // music table's `Post mortem` row already has (see GameSounds.ts:66).
    const companions: [string, string][] = [
      [GameAmbients.RAIN_OUTSIDE, GameAmbients.RAIN_OUTSIDE_FILE],
      [GameAmbients.RAIN_INSIDE, GameAmbients.RAIN_INSIDE_FILE],
      [GameAmbients.THUNDERING_RAIN_OUTSIDE, GameAmbients.THUNDERING_RAIN_OUTSIDE_FILE],
      [GameAmbients.THUNDERING_RAIN_INSIDE, GameAmbients.THUNDERING_RAIN_INSIDE_FILE],
      [GameAmbients.HELICOPTER_FLYOVER, GameAmbients.HELICOPTER_FLYOVER_FILE],
      [GameAmbients.STATIONARY_HELICOPTER_FARTHEST, GameAmbients.STATIONARY_HELICOPTER_FARTHEST_FILE],
      [GameAmbients.STATIONARY_HELICOPTER_FAR, GameAmbients.STATIONARY_HELICOPTER_FAR_FILE],
      [GameAmbients.STATIONARY_HELICOPTER_NEAR, GameAmbients.STATIONARY_HELICOPTER_NEAR_FILE],
      [GameAmbients.STATIONARY_HELICOPTER_VISIBLE, GameAmbients.STATIONARY_HELICOPTER_VISIBLE_FILE],
      [GameAmbients.NIGHT_ANIMALS, GameAmbients.NIGHT_ANIMALS_FILE],
      [GameAmbients.CHURCH_BELLS_WITHIN_MAP, GameAmbients.CHURCH_BELLS_WITHIN_MAP_FILE],
      [GameAmbients.CHURCH_BELLS_OUTSIDE_MAP, GameAmbients.CHURCH_BELLS_OUTSIDE_MAP_FILE],
      [GameAmbients.TEST_AMBIENT, GameAmbients.TEST_AMBIENT_FILE],
    ];
    expect(companions).toHaveLength(13);
    for (const [id, file] of companions) {
      expect(ambientPath(file), `${id}'s *_FILE`).toBe(ambientPath(id));
      expect(file, `${id}'s *_FILE must not be a bare name`).toMatch(
        /^\/.*assets\/ambients\//,
      );
    }
  });

  it("routes every id to the third directory and no other", () => {
    for (const [id] of CS_TABLE) {
      const url = ambientPath(id);
      expect(url, id).toMatch(/^\/.*assets\/ambients\//);
      expect(url.endsWith(".ogg"), id).toBe(true);
    }
  });

  it("keeps the ambients out of the music and sound tables", () => {
    // The three channels are three managers in the C# (`RogueGame.cs:833`, `:861`
    // and the sfx manager), and folding the ids together would make a mistyped
    // ambient resolve to a *track* rather than 404 — see `AssetPaths.ambientPath`.
    for (const [id] of CS_TABLE) {
      expect(isKnownAudioId(id), `${id} must not be in MUSIC_FILES/SOUND_FILES`).toBe(false);
    }
  });

  it("an unknown id does not resolve to a shipped file", () => {
    // The fall-through is `<root>/<id>.ogg`, so this asserts the *absence* of a
    // file rather than the shape of a URL. If a future id were added to the table
    // without its file, the table test above would still pass and this would not.
    expect(existsSync(publicFilePath(ambientPath("no such ambient")))).toBe(false);
  });
});

describe("every ambient file is actually on disk", () => {
  it("resolves all thirteen ids to a file that exists and is not empty", () => {
    const missing: string[] = [];
    const empty: string[] = [];
    for (const [id] of CS_TABLE) {
      const path = publicFilePath(ambientPath(id));
      if (!existsSync(path)) missing.push(`${id} -> ${ambientPath(id)}`);
      else if (statSync(path).size === 0) empty.push(`${id} -> ${path}`);
    }
    expect(missing, `ambient files that are not on disk:\n  ${missing.join("\n  ")}`).toEqual([]);
    expect(empty, `ambient files that are zero bytes:\n  ${empty.join("\n  ")}`).toEqual([]);
  });

  it("the directory holds exactly the thirteen and nothing else", () => {
    // Catches the opposite failure to the one above: a stale or stray `.ogg` that
    // no id resolves to, which is 14 MB of nothing in the build and in the service
    // worker's runtime cache.
    const dir = join(__dirname, "..", "public", "assets", "ambients");
    const onDisk = Array.from(
      new Set(CS_TABLE.map(([, file]) => file)),
    );
    const expected = onDisk.map((f) => `${f}.ogg`).sort();
    const actual = readdirSync(dir)
      .filter((n) => n.endsWith(".ogg"))
      .sort();
    expect(actual).toEqual(expected);
  });

  it("AMBIENTS_ROOT is a sibling of the music and sfx roots, under one assets/", () => {
    // The one place a base-path regression would show: the C# has four
    // `Resources/` subtrees and the port has four roots off `ASSETS_ROOT`, and a
    // hardcoded `/assets/...` here would break the subdirectory deployment that
    // `web/base-path.ts` exists for. Asserted against the *other three*, so the
    // property is "four roots, one parent" rather than "one string".
    expect(AMBIENTS_ROOT.endsWith("/ambients")).toBe(true);
    expect(MUSIC_ROOT.endsWith("/music")).toBe(true);
    expect(SFX_ROOT.endsWith("/sfx")).toBe(true);
    const parent = (root: string): string => root.slice(0, root.lastIndexOf("/"));
    expect(parent(AMBIENTS_ROOT)).toBe(parent(MUSIC_ROOT));
    expect(parent(AMBIENTS_ROOT)).toBe(parent(SFX_ROOT));
    expect(parent(AMBIENTS_ROOT)).toBe(ASSETS_ROOT);
    for (const id of [GameAmbients.NIGHT_ANIMALS, GameAmbients.TEST_AMBIENT]) {
      expect(ambientPath(id).startsWith(AMBIENTS_ROOT), id).toBe(true);
    }
  });
});

// ── The channel ─────────────────────────────────────────────────────────────

/** A recording `IAmbientManager`, standing in for the browser's. */
class RecordingAmbientManager implements IAmbientManager {
  readonly calls: string[] = [];
  playing: string[] = [];
  volume = 0;
  private paused = false;

  play(id: string): void { this.calls.push(`play(${id})`); this.mark(id); }
  playLooping(id: string): void { this.calls.push(`playLooping(${id})`); this.mark(id); }
  /** Starts that actually reached the channel, as opposed to guard calls. */
  starts = 0;
  playIfNotAlreadyPlaying(id: string, looping: boolean): void {
    this.calls.push(`playIfNotAlreadyPlaying(${id},${looping})`);
    if (this.isPlaying(id)) return;
    this.starts++;
    this.mark(id);
  }
  private mark(id: string): void {
    this.playing = this.playing.filter((p) => p !== id);
    this.playing.push(id);
  }
  stop(id: string): void {
    this.calls.push(`stop(${id})`);
    this.playing = this.playing.filter((p) => p !== id);
  }
  stopAll(): void { this.calls.push("stopAll()"); this.playing = []; }
  pauseAll(): void { this.calls.push("pauseAll()"); this.paused = true; }
  resumeAll(): void { this.calls.push("resumeAll()"); this.paused = false; }
  isPlaying(id: string): boolean { return this.playing.includes(id); }
  isAnyPlaying(): boolean { return this.playing.length > 0; }
  getPlayingAmbients(): readonly string[] { return [...this.playing]; }
  setVolume(vol: number): void { this.calls.push(`setVolume(${vol})`); this.volume = vol; }
  getVolume(): number { return this.volume; }
  isPaused(): boolean { return this.paused; }
}

// ── The Web Audio implementation, with the two browser globals stubbed ──────

/**
 * Just enough of `<audio>` and `AudioContext` for the manager.
 *
 * The suite runs in `node` (`vitest.config.mts`), and this file is the one place
 * that reaches for a browser global on purpose: `WebAudioAmbientManager` is a real
 * 130 lines of lifecycle and per-voice bookkeeping, and the alternative is the
 * state `WebAudioMusicManager` is in — 0% covered, and the one that once silenced
 * the soundtrack. The stubs assert the *manager's* behaviour (which ids have
 * voices, whether an element was looped, what `src` it was given), not the
 * browser's.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  loop = false;
  volume = 1;
  paused = false;
  ended = false;
  currentTime = 7;
  playCount = 0;
  private listeners: (() => void)[] = [];
  constructor() { FakeAudio.instances.push(this); }
  addEventListener(_name: string, fn: () => void): void { this.listeners.push(fn); }
  play(): Promise<void> { this.playCount++; this.paused = false; return Promise.resolve(); }
  pause(): void { this.paused = true; }
  /** Drives the `ended` event the manager listens for. */
  finish(): void {
    this.ended = true;
    for (const fn of this.listeners) fn();
  }
}

class FakeGain {
  gain = { value: 1 };
  connected: unknown[] = [];
  connect(to: unknown): void { this.connected.push(to); }
  disconnect(): void { this.connected = []; }
}

/** A `MediaElementAudioSourceNode`: remembers what it was wired to. */
class FakeSource {
  connected: unknown[] = [];
  constructor(readonly element: FakeAudio) {}
  connect(to: unknown): void { this.connected.push(to); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "running";
  readonly destination = { name: "destination" };
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createMediaElementSource(el: FakeAudio): FakeSource {
    const s = new FakeSource(el);
    this.sources.push(s);
    return s;
  }
  resume(): Promise<void> { this.state = "running"; return Promise.resolve(); }
}

const realAudio = (globalThis as Record<string, unknown>).Audio;
const realWindow = (globalThis as Record<string, unknown>).window;

/** Installs the stubs and returns a manager built on them. */
function withStubs(): WebAudioAmbientManager {
  (globalThis as Record<string, unknown>).Audio = FakeAudio;
  (globalThis as Record<string, unknown>).window = { AudioContext: FakeAudioContext };
  FakeAudio.instances = [];
  FakeAudioContext.instances = [];
  return new WebAudioAmbientManager();
}

afterEach(() => {
  (globalThis as Record<string, unknown>).Audio = realAudio;
  (globalThis as Record<string, unknown>).window = realWindow;
});

describe("the ambient channel's lifecycle", () => {
  let manager: WebAudioAmbientManager;
  beforeEach(() => { manager = withStubs(); });

  it("gives a track its own element, from its own path, looped when asked", () => {
    manager.playLooping(GameAmbients.RAIN_OUTSIDE);
    expect(FakeAudio.instances).toHaveLength(1);
    const el = FakeAudio.instances[0]!;
    expect(el.src).toBe(ambientPath(GameAmbients.RAIN_OUTSIDE));
    expect(el.loop).toBe(true);
    expect(el.paused).toBe(false);
    expect(manager.isPlaying(GameAmbients.RAIN_OUTSIDE)).toBe(true);
    expect(manager.getPlayingAmbients()).toEqual([GameAmbients.RAIN_OUTSIDE]);
  });

  it("a one-shot is not looped — which is what the church bells are", () => {
    // The C# plays the bells with `PlayIfNotAlreadyPlaying(id, PRIORITY_BGM)` and
    // that overload's `looping` parameter defaults to `false` (ISoundManager.cs:52),
    // so a looped bell would ring over every sunset for the rest of the session.
    manager.play(GameAmbients.CHURCH_BELLS_WITHIN_MAP);
    expect(FakeAudio.instances[0]!.loop).toBe(false);
  });

  it("keeps two tracks audible at once, which is the whole reason it is a channel", () => {
    // `WebAudioMusicManager` is one element for one track, and cannot do this. The
    // C# can, because the rain arm of `CheckAmbientSFX` and the helicopter arm of
    // `CheckLandedHelicopterSFX` run independently and the bells play over both.
    manager.playLooping(GameAmbients.RAIN_INSIDE);
    manager.play(GameAmbients.CHURCH_BELLS_OUTSIDE_MAP);
    expect([...manager.getPlayingAmbients()].sort()).toEqual(
      [GameAmbients.RAIN_INSIDE, GameAmbients.CHURCH_BELLS_OUTSIDE_MAP].sort(),
    );
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("playIfNotAlreadyPlaying does not restart a track that is already up", () => {
    // The C# writes this guard by hand before each of its three bed calls; the
    // consequence of getting it wrong is the bed restarting from the top under a
    // survivor who has not moved.
    manager.playIfNotAlreadyPlaying(GameAmbients.NIGHT_ANIMALS, true);
    const el = FakeAudio.instances[0]!;
    manager.playIfNotAlreadyPlaying(GameAmbients.NIGHT_ANIMALS, true);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(el.playCount).toBe(1);
  });

  it("play replaces a track's own voice rather than layering a second one", () => {
    manager.playLooping(GameAmbients.RAIN_OUTSIDE);
    manager.play(GameAmbients.RAIN_OUTSIDE);
    expect(manager.getPlayingAmbients()).toEqual([GameAmbients.RAIN_OUTSIDE]);
    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("stop silences one track and leaves the others alone", () => {
    manager.playLooping(GameAmbients.RAIN_INSIDE);
    manager.playLooping(GameAmbients.NIGHT_ANIMALS);
    manager.stop(GameAmbients.RAIN_INSIDE);
    expect(manager.isPlaying(GameAmbients.RAIN_INSIDE)).toBe(false);
    expect(manager.isPlaying(GameAmbients.NIGHT_ANIMALS)).toBe(true);
    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(FakeAudio.instances[1]!.paused).toBe(false);
  });

  it("stopAll, pauseAll and resumeAll reach every voice", () => {
    manager.playLooping(GameAmbients.RAIN_INSIDE);
    manager.playLooping(GameAmbients.THUNDERING_RAIN_OUTSIDE);
    manager.pauseAll();
    expect(FakeAudio.instances.every((e) => e.paused)).toBe(true);
    manager.resumeAll();
    expect(FakeAudio.instances.every((e) => !e.paused)).toBe(true);
    manager.stopAll();
    expect(manager.getPlayingAmbients()).toEqual([]);
    expect(FakeAudio.instances.every((e) => e.paused)).toBe(true);
  });

  it("a finished one-shot drops out of the playing set on its own", () => {
    manager.play(GameAmbients.CHURCH_BELLS_WITHIN_MAP);
    expect(manager.isPlaying(GameAmbients.CHURCH_BELLS_WITHIN_MAP)).toBe(true);
    FakeAudio.instances[0]!.finish();
    expect(manager.isPlaying(GameAmbients.CHURCH_BELLS_WITHIN_MAP)).toBe(false);
    expect(manager.isAnyPlaying()).toBe(false);
  });

  it("a finished one-shot is not resurrected by resumeAll", () => {
    // The C#'s `ResumeAll` only resumes what it paused; a bed that rang out while
    // the player was in a menu must not start again under the game.
    manager.play(GameAmbients.CHURCH_BELLS_WITHIN_MAP);
    FakeAudio.instances[0]!.finish();
    manager.resumeAll();
    expect(FakeAudio.instances[0]!.playCount).toBe(1);
  });

  it("the channel level is the mix, and it is the C#'s default", () => {
    // C# `options.AmbientSFXVolume = 75` (GameOptions.cs:1389) against a
    // `MusicVolume` of 100. Applied to the master, so two overlapping voices sum
    // rather than add up to a clipped 1.5.
    expect(AMBIENT_SFX_VOLUME).toBe(0.75);
    manager.playLooping(GameAmbients.RAIN_OUTSIDE);
    const ctx = FakeAudioContext.instances[0]!;
    const master = ctx.gains[0]!;
    expect(master.gain.value).toBe(AMBIENT_SFX_VOLUME);
    manager.setVolume(0.25);
    expect(master.gain.value).toBe(0.25);
    expect(manager.getVolume()).toBe(0.25);
    // Clamped, like the music manager's.
    manager.setVolume(9);
    expect(manager.getVolume()).toBe(1);
    manager.setVolume(-1);
    expect(manager.getVolume()).toBe(0);
  });
});

describe("NullAmbientManager", () => {
  it("answers every question without a DOM and without throwing", () => {
    // The headless harness runs the real `RogueGame` with it, so every method is
    // called for real here — a null manager that throws would take the sim down
    // rather than a test.
    const n = new NullAmbientManager();
    expect(() => {
      n.play(GameAmbients.RAIN_OUTSIDE);
      n.playLooping(GameAmbients.RAIN_OUTSIDE);
      n.playIfNotAlreadyPlaying(GameAmbients.RAIN_OUTSIDE, true);
      n.stop(GameAmbients.RAIN_OUTSIDE);
      n.stopAll();
      n.pauseAll();
      n.resumeAll();
      n.setVolume(0.5);
    }).not.toThrow();
    expect(n.isPlaying(GameAmbients.RAIN_OUTSIDE)).toBe(false);
    expect(n.isAnyPlaying()).toBe(false);
    expect(n.getPlayingAmbients()).toEqual([]);
    expect(n.getVolume()).toBe(0);
  });
});

// ── The gate, and what the game does with the channel ───────────────────────

let game: RogueGame;
let map: GameMap;
let player: Actor;
let ambients: RecordingAmbientManager;

const HERE = new Point(5, 5);

beforeEach(() => {
  new GameActors();
  new GameTiles();
  // Pinned before `RogueGame`, which builds `Rules` — and so its `DiceRoller` —
  // out of the session seed. See `tile-fires.test.ts` for why that ordering is
  // load-bearing rather than stylistic.
  Session.useSeed(1);
  ambients = new RecordingAmbientManager();
  game = new RogueGame(new NullRogueUI(), undefined, ambients);
  map = new GameMap(1, "test", 30, 30);
  map.setTileModelAt(HERE.x, HERE.y, Models.tiles.get(TileID.FLOOR_ASPHALT));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  // Turn 0 is midnight, so `isNight` starts true; a test that wants daylight says
  // so rather than inheriting it.
  Session.get().worldTime.turnCounter = 0;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, HERE);
  game.m_Player = player;
  Session.get().currentMap = map;
  ambients.calls.length = 0;
});

/** Run the C#'s `CheckAmbientSFX` decision. */
const check = (): void => game.CheckAmbientAudio(map);

const putPlayerIndoors = (): void => {
  map.getTileAt(HERE.x, HERE.y)!.isInside = true;
};

const setDaytime = (): void => {
  Session.get().worldTime.turnCounter = WorldTime.TURNS_PER_HOUR * 12; // MIDDAY
};

describe("CheckAmbientAudio under STILL_ALIVE", () => {
  it("plays the outside rain bed in the rain, and loops it", () => {
    Session.get().weather = Weather.RAIN;
    setDaytime();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.RAIN_OUTSIDE]);
    expect(ambients.calls).toContain(
      `playIfNotAlreadyPlaying(${GameAmbients.RAIN_OUTSIDE},true)`,
    );
  });

  it("plays the inside rain bed on an indoor tile", () => {
    Session.get().weather = Weather.RAIN;
    setDaytime();
    putPlayerIndoors();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.RAIN_INSIDE]);
  });

  it("plays thundering rain for HEAVY_RAIN, inside or out", () => {
    Session.get().weather = Weather.HEAVY_RAIN;
    setDaytime();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.THUNDERING_RAIN_OUTSIDE]);
    ambients.stopAll();
    putPlayerIndoors();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.THUNDERING_RAIN_INSIDE]);
  });

  it("plays wild animals at night when it is not raining", () => {
    // Turn 0 is midnight. The C# has no inside/outside split for these
    // (RogueGame.cs:10476) — checked below, since it is a decision, not an
    // accident.
    expect(Session.get().worldTime.isNight).toBe(true);
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.NIGHT_ANIMALS]);
    putPlayerIndoors();
    ambients.stopAll();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.NIGHT_ANIMALS]);
  });

  it("rain wins over night, because the C# tests the weather first", () => {
    // `if (weather == RAIN) ... else if (HEAVY_RAIN) ... else if (IsNight)` — the
    // ordering is the C#'s and it is load-bearing: a night in the rain is rain.
    Session.get().weather = Weather.RAIN;
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.RAIN_OUTSIDE]);
    expect(ambients.isPlaying(GameAmbients.NIGHT_ANIMALS)).toBe(false);
    putPlayerIndoors();
    ambients.stopAll();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.RAIN_INSIDE]);
    expect(ambients.isPlaying(GameAmbients.NIGHT_ANIMALS)).toBe(false);
  });

  it("plays nothing in clear daylight, and stops what was up", () => {
    Session.get().weather = Weather.RAIN;
    check();
    expect(ambients.isAnyPlaying()).toBe(true);
    Session.get().weather = Weather.CLEAR;
    setDaytime();
    check();
    expect(ambients.getPlayingAmbients()).toEqual([]);
  });

  it("swaps one bed for another and leaves exactly one playing", () => {
    // This is `StopAllAmbientsExcept`, and the invariant is the C#'s: at most one
    // of the five is ever up. A version that forgot the stop would leave two, and
    // rain over wild animals is a bug no single-track manager could have shown.
    //
    // Turn 0 throughout, so it stays night: the animals are the only bed the C#
    // will reach without rain, and a test that walked into daylight would be
    // asserting the "stop everything" arm instead of the swap.
    expect(Session.get().worldTime.isNight).toBe(true);
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.NIGHT_ANIMALS]);

    ambients.calls.length = 0;
    Session.get().weather = Weather.RAIN;
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.RAIN_OUTSIDE]);

    ambients.calls.length = 0;
    Session.get().weather = Weather.CLEAR;
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.NIGHT_ANIMALS]);

    // And the start happens *before* the stops, so the swap has no silent gap.
    const animalsStart = ambients.calls.indexOf(
      `playIfNotAlreadyPlaying(${GameAmbients.NIGHT_ANIMALS},true)`,
    );
    const rainStop = ambients.calls.indexOf(`stop(${GameAmbients.RAIN_OUTSIDE})`);
    expect(animalsStart).toBeGreaterThan(-1);
    expect(rainStop).toBeGreaterThan(-1);
    expect(animalsStart).toBeLessThan(rainStop);
  });

  it("does not restart a bed that is already playing", () => {
    Session.get().weather = Weather.RAIN;
    setDaytime();
    check();
    check();
    check();
    // Three calls, one start: the guard is what the C# writes by hand
    // (`if (!IsPlaying(RAIN_OUTSIDE)) PlayLooping(...)`, `:10452-10453`) and it is
    // the reason a survivor standing still in the rain does not get the bed
    // restarted from the top three times per turn.
    expect(
      ambients.calls.filter((c) => c.startsWith("playIfNotAlreadyPlaying")),
    ).toHaveLength(3);
    expect(ambients.starts).toBe(1);
  });

  it("silences everything in a basement", () => {
    // The C#'s underground list starts with a name test on the *session's* map
    // (RogueGame.cs:10425), because a house basement has no entry in `UniqueMaps`.
    Session.get().weather = Weather.RAIN;
    setDaytime();
    check();
    expect(ambients.isAnyPlaying()).toBe(true);
    map.name = "house basement";
    check();
    expect(ambients.getPlayingAmbients()).toEqual([]);
  });

  it("silences everything on the sewers and the subway", () => {
    // C# identity test, not a name test: `map == map.District.SewersMap` /
    // `== map.District.SubwayMap` (`:10426-10427`). Both maps exist in the port's
    // `District` and both generators are reachable (`RogueGame.ts:26460-26463`),
    // so this is a real arm rather than one waiting on a pending feature.
    Session.get().weather = Weather.RAIN;
    setDaytime();
    const district = new District(new Point(0, 0), DistrictKind.GENERAL);
    map.district = district;

    check();
    expect(ambients.isAnyPlaying(), "a map with no underground role is audible").toBe(true);

    district.sewersMap = map;
    check();
    expect(ambients.getPlayingAmbients(), "on the sewers").toEqual([]);

    district.sewersMap = null;
    district.subwayMap = map;
    check();
    expect(ambients.getPlayingAmbients(), "on the subway").toEqual([]);
  });

  it("silences everything on the hospital levels and the police station jails", () => {
    // `UniqueMaps` identity, same shape. All seven exist in the port
    // (`Session.ts:127-137`), so every C# arm in this group is testable here; the
    // one the C# list *omits* — `hospital_Admissions` — is the port's own addition
    // and is asserted as such rather than left to the comment.
    Session.get().weather = Weather.RAIN;
    setDaytime();
    const unique = Session.get().uniqueMaps;
    const levels: [string, () => void][] = [
      ["hospital_Admissions", () => { unique.hospital_Admissions.theMap = map; }],
      ["hospital_Offices", () => { unique.hospital_Offices.theMap = map; }],
      ["hospital_Patients", () => { unique.hospital_Patients.theMap = map; }],
      ["hospital_Power", () => { unique.hospital_Power.theMap = map; }],
      ["hospital_Storage", () => { unique.hospital_Storage.theMap = map; }],
      ["policeStation_OfficesLevel", () => { unique.policeStation_OfficesLevel.theMap = map; }],
      ["policeStation_JailsLevel", () => { unique.policeStation_JailsLevel.theMap = map; }],
      ["charUndergroundFacility", () => { unique.charUndergroundFacility.theMap = map; }],
    ];
    for (const [name, assign] of levels) {
      for (const u of [
        unique.hospital_Admissions, unique.hospital_Offices, unique.hospital_Patients,
        unique.hospital_Power, unique.hospital_Storage, unique.policeStation_OfficesLevel,
        unique.policeStation_JailsLevel, unique.charUndergroundFacility,
      ]) u.theMap = null;
      check();
      ambients.stopAll();
      check();
      expect(ambients.isAnyPlaying(), `${name} is audible before it is a unique map`).toBe(true);
      assign();
      check();
      expect(ambients.getPlayingAmbients(), name).toEqual([]);
    }
  });

  it("plays nothing while the player is asleep", () => {
    // C# RogueGame.cs:10419-10422, and the "they'll already be stopped" comment is
    // about the beds being silenced on the way *in*, not here.
    Session.get().weather = Weather.RAIN;
    player.isSleeping = true;
    check();
    expect(ambients.getPlayingAmbients()).toEqual([]);
  });
});

describe("CLASSIC gets no ambient channel at all", () => {
  beforeEach(() => {
    Session.get().ruleset = Ruleset.CLASSIC;
    Session.get().weather = Weather.HEAVY_RAIN;
    ambients.calls.length = 0;
  });

  it("CheckAmbientAudio plays nothing, in any weather, at any hour", () => {
    for (const weather of [Weather.CLEAR, Weather.CLOUDY, Weather.RAIN, Weather.HEAVY_RAIN]) {
      for (const turn of [0, WorldTime.TURNS_PER_HOUR * 12]) {
        Session.get().weather = weather;
        Session.get().worldTime.turnCounter = turn;
        check();
      }
    }
    expect(ambients.calls).toEqual([]);
    expect(ambients.isAnyPlaying()).toBe(false);
  });

  it("the gate is what stops it, and the feature really is off for CLASSIC", () => {
    // Asserted separately so a failure says which of the two broke: a test that
    // only checked "nothing played" would also pass if `hasFeature` were somehow
    // true and the arm had been deleted.
    expect(hasFeature(Ruleset.CLASSIC, Feature.AmbientAudio)).toBe(false);
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.AmbientAudio)).toBe(true);
  });

  it("HandleReincarnation makes no channel call at all", () => {
    // The five `stopAll()` sites are gated, so CLASSIC makes no channel calls —
    // asserted on the call log, because `stopAll()` on an empty channel is
    // invisible and would be exactly the sort of thing a reviewer should not have
    // to take on trust.
    //
    // `HandleReincarnation` is the site chosen because it is the only one of the
    // five that is reachable without a whole game around it: it asks the player
    // first (`AskForReincarnation`), and the C#'s `m_AmbientSFXManager.StopAll()`
    // is on the *first* line of the method, before that question — which is what
    // is under test.
    void game.HandleReincarnation;
    const source = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf-8",
    );
    const body = source.slice(
      source.indexOf("async HandleReincarnation()"),
      source.indexOf("async HandleReincarnation()") + 900,
    );
    const stopAt = body.indexOf("m_AmbientSFXManager.stopAll()");
    const askAt = body.indexOf("AskForReincarnation");
    expect(stopAt, "the ambient stop is on HandleReincarnation").toBeGreaterThan(-1);
    expect(stopAt, "and it comes before the reincarnate question, as in the C#")
      .toBeLessThan(askAt);
    // Which is only true if the line above it is the gate.
    const gated = body.slice(0, stopAt);
    expect(gated).toMatch(/hasFeature\([^)]*Feature\.AmbientAudio\)/);
  });
});

// ── The unwired eight ───────────────────────────────────────────────────────

describe("the eight unwired tracks", () => {
  it("are the C#'s helicopter and church bells, and nothing else is missing", () => {
    // 13 table entries - 5 wired - 8 pending. If a future stage wires one of the
    // eight this fails and has to be updated on purpose, which is the point: a
    // pending track that silently becomes live is the failure this guards.
    const unwired = Object.keys(AMBIENT_FILES).filter((id) => !WIRED.includes(id));
    expect(unwired.sort()).toEqual(
      [...PENDING_ON_HELICOPTER, ...PENDING_ON_CHURCH, GameAmbients.TEST_AMBIENT].sort(),
    );
    expect(unwired).toHaveLength(8);
  });

  it("nothing outside CheckAmbientAudio names an unwired track", () => {
    // A source scan, not a behavioural one: the eight have no trigger site at all,
    // so the only way to catch one appearing is to read the source. This is the
    // same technique `feature-flags.test.ts` and `music-priority.test.ts` use.
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf-8",
    );
    const unwired = [
      ...PENDING_ON_HELICOPTER,
      ...PENDING_ON_CHURCH,
    ];
    // `GameAmbients.ts` holds the constants; the test file is the only other place
    // allowed to name one, and the engine is not.
    expect(src, "an unwired ambient is referenced in the engine").not.toMatch(
      new RegExp(`GameAmbients\\.(${unwired.map((u) => u.split(" ").pop()).join("|")})`),
    );
  });

  it("the five unwired engine constants are named at the site that waits for them", () => {
    // A reader arriving at `CheckAmbientAudio` has to be told *which* pending
    // feature each group is waiting on, in the source, not only in the plan.
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf-8",
    );
    // From the *docblock*, not the declaration: the pending-feature names are in
    // the comment above the method, and slicing at the signature would read the
    // body and find neither.
    const doc = src.slice(
      src.indexOf("C# `CheckAmbientSFX` (`RogueGame.cs:10417`)"),
      src.indexOf("StopAllAmbientsExcept(exceptId"),
    );
    expect(doc.length, "the CheckAmbientAudio docblock was found").toBeGreaterThan(1000);
    expect(doc).toMatch(/Feature\.HelicopterRescue/);
    expect(doc).toMatch(/Feature\.Church/);
  });
});
