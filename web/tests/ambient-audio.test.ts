/**
 * `Feature.AmbientAudio` — the thirteen ambient beds, on a channel of their own.
 *
 * Still Alive, Release 5-3 (rain), 6-4 (helicopter) and 6-6 (thunder, animals,
 * bells).
 *
 * ## What is wired, and what is not
 *
 * The C# table (`Gameplay/GameAmbients.cs`) is 13 entries and every one of them has
 * a file. The port ships all 13 files and all 13 constants, and **12 of the 13 are
 * reachable**:
 *
 * - `RAIN_INSIDE` / `RAIN_OUTSIDE` / `THUNDERING_RAIN_INSIDE` /
 *   `THUNDERING_RAIN_OUTSIDE` / `NIGHT_ANIMALS` — wired from the start. The port
 *   has `Weather`, `WorldTime.isNight` and `Tile.isInside`, which are the C#'s only
 *   three inputs into the decision.
 * - The five `HELICOPTER_FLYOVER` / `STATIONARY_HELICOPTER_*` — **now wired**, by
 *   `checkLandedHelicopterSFX` (`RogueGame.cs:10524-10568`) on every player step
 *   plus a one-shot flyover at spawn and at an army supply drop. These waited on
 *   `Feature.HelicopterRescue` for a rescue *map* and *coordinates* and four noise
 *   radii; all three have since landed (`Session.ts:316-370`, `NoiseDistance.ts`).
 * - The two `CHURCH_BELLS_*` — **now wired**, at sunset in `advancePlayDistrict`.
 *   These waited on `Feature.Church` for `Map.hasChurch`, which that feature added.
 * - `TEST_AMBIENT` — shipped, **deliberately unreachable**, and the only one left.
 *   Its only C# caller is the options screen's ambient-volume preview, and the port
 *   has no such row.
 *
 * So this file is a suite about **twelve** tracks and a **thirteen**-entry table,
 * and it asserts both numbers rather than blurring them.
 *
 * **That 5 -> 12 jump is why this file still exists in this shape.** Each of the
 * seven was blocked on a *different* prerequisite feature, so no two of them became
 * reachable together, and the thing that was actually being tested all along was
 * "does the port have the input this track needs", not anything to do with audio.
 * One of the thirteen is still unreachable for want of a UI row rather than a
 * gameplay feature, which is a different kind of missing and worth keeping visible.
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

/**
 * Source with comments removed, so a scanner can tell a *call* from a mention.
 *
 * Crude on purpose: it is a test helper for one assertion, and a real parser would
 * be more machinery than the thing it is protecting. Block comments go first (they
 * cannot nest), then line comments.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The twelve the port can actually reach, and nothing else. See the file header. */
const WIRED: readonly string[] = [
  GameAmbients.RAIN_INSIDE,
  GameAmbients.RAIN_OUTSIDE,
  GameAmbients.THUNDERING_RAIN_INSIDE,
  GameAmbients.THUNDERING_RAIN_OUTSIDE,
  GameAmbients.NIGHT_ANIMALS,
  // Feature.HelicopterRescue
  GameAmbients.HELICOPTER_FLYOVER,
  GameAmbients.STATIONARY_HELICOPTER_FARTHEST,
  GameAmbients.STATIONARY_HELICOPTER_FAR,
  GameAmbients.STATIONARY_HELICOPTER_NEAR,
  GameAmbients.STATIONARY_HELICOPTER_VISIBLE,
  // Feature.Church
  GameAmbients.CHURCH_BELLS_WITHIN_MAP,
  GameAmbients.CHURCH_BELLS_OUTSIDE_MAP,
  // The options screen's ambient-volume preview. `RogueGame.cs:2244`.
  GameAmbients.TEST_AMBIENT,
];

/**
 * Nothing is unreachable any more.
 *
 * `TEST_AMBIENT` used to be listed here alone, with the `describe` block below
 * asserting it was named nowhere in the engine. Both were correct then. The
 * options screen grew a `UI_AMBIENTSFXS_VOLUME` row (Still Alive, Release 6-1)
 * and `RogueGame.OptionsMenuAudioAdjustment` (`RogueGame.cs:2244`) previews this
 * exact track from it, so the track now has the one caller the C# gives it.
 *
 * Kept as an empty list rather than deleted: the block asserts the table has no
 * unwired entries left, which is the claim worth pinning, and deleting the
 * constant would have quietly widened the scope of this file's other 90 tests.
 */
const UNREACHABLE: readonly string[] = [];

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
  enabled = true;
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
  /** Records the mute so a test can tell "off" from "zero volume". */
  setEnabled(on: boolean): void { this.calls.push(`setEnabled(${on})`); this.enabled = on; }
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

// ── The one unreachable track ───────────────────────────────────────────────

describe("the track that used to be unwired", () => {
  it("is now wired, and every table entry has a caller", () => {
    // The mirror of the test this replaced. It asserted `TEST_AMBIENT` was named
    // nowhere; that stopped being true when the options screen grew its
    // ambient-volume row, and the assertion below is the one that should survive:
    // thirteen table entries, thirteen with a trigger site.
    const unwired = Object.keys(AMBIENT_FILES).filter((id) => !WIRED.includes(id));
    expect(unwired).toEqual([...UNREACHABLE]);
    expect(unwired).toHaveLength(0);
  });

  it("is previewed from the options screen's ambient-volume row", () => {
    // A source scan, not a behavioural one — the same technique
    // `feature-flags.test.ts` and `music-priority.test.ts` use, and for the same
    // reason: the only way to catch this caller *disappearing* is to read the
    // source, because nothing else asserts it.
    //
    // Both files are checked: the module that owns the switch and the screen that
    // maps rows onto it. They used to be `RogueGame.ts` and `OptionsScreen.ts` --
    // an earlier version of this change carried a copy of the switch on the engine
    // class too, which was unreachable because `HandleOptions` builds the screen
    // rather than looping itself.
    // The two halves are checked separately, because they are in different files:
    // the module that owns the switch names the track, and the screen maps the
    // ambient-volume row onto it. They used to be one file each on
    // `RogueGame.ts` and `OptionsScreen.ts` -- an earlier version of this change
    // carried a copy of the switch on the engine class too, which was unreachable,
    // because `HandleOptions` builds the screen rather than looping itself.
    const preview = stripComments(
      readFileSync(
        join(__dirname, "..", "src", "engine", "audio", "OptionsAudioPreview.ts"),
        "utf-8",
      ),
    );
    expect(preview, "the preview switch no longer names TEST_AMBIENT").toMatch(
      /GameAmbients\.TEST_AMBIENT/,
    );
    const screen = stripComments(
      readFileSync(join(__dirname, "..", "src", "ui", "OptionsScreen.ts"), "utf-8"),
    );
    expect(
      screen,
      "the options screen no longer routes the ambient-volume row to a preview",
    ).toMatch(/UI_AMBIENTSFXS_VOLUME/);
  });

  it("still has its file, because wired is not the same as correct", () => {
    // The table test above already resolves all thirteen ids and checks each file
    // is on disk; this exists to say the *point*. If it ever fails, the asset was
    // deleted rather than left unwired, and the table is no longer the C#'s
    // thirteen -- which is a different kind of regression from "no trigger".
    expect(AMBIENT_FILES, "TEST_AMBIENT is still in the table").toHaveProperty(
      GameAmbients.TEST_AMBIENT,
    );
  });
});

describe("the seven that used to be unwired", () => {
  it("are all named in the engine now", () => {
    // The mirror of the test above, and the thing that would have caught a partial
    // job: five helicopter tracks wired but the flyover forgotten is exactly the
    // shape of that mistake.
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf-8",
    );
    // The *constant names*, paired with their ids by hand.
    //
    // The tempting shortcut is `id.split(" ").pop()`, which reads
    // "stationary helicopter visible" as `visible` -- and there is no such
    // constant. It survived in this file only because every assertion that used it
    // was an *absence* check, which passes just as happily against a pattern that
    // can never match anything. A presence assertion is what exposed it.
    for (const name of [
      "HELICOPTER_FLYOVER",
      "STATIONARY_HELICOPTER_FARTHEST",
      "STATIONARY_HELICOPTER_FAR",
      "STATIONARY_HELICOPTER_NEAR",
      "STATIONARY_HELICOPTER_VISIBLE",
      "CHURCH_BELLS_WITHIN_MAP",
      "CHURCH_BELLS_OUTSIDE_MAP",
    ]) {
      expect(stripComments(src), `${name} is called in the engine`).toMatch(
        new RegExp(`GameAmbients\\.${name}\\b`),
      );
    }
  });

  it("keeps the helicopter and bell ids out of StopAllAmbientsExcept", () => {
    // `StopAllAmbientsExcept` silences the weather family on every player step. If
    // the helicopter tiers were in its list, walking indoors would kill a landed
    // helicopter's audio for as long as the player stayed in -- and walking back
    // out would not restore it until the next step. The C#'s five-name list does
    // not contain them either; this pins that the port agrees.
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf-8",
    );
    const body = src.slice(src.indexOf("StopAllAmbientsExcept(exceptId"));
    const list = body.slice(0, body.indexOf("];"));
    for (const name of [
      "HELICOPTER_FLYOVER",
      "STATIONARY_HELICOPTER_FARTHEST",
      "STATIONARY_HELICOPTER_FAR",
      "STATIONARY_HELICOPTER_NEAR",
      "STATIONARY_HELICOPTER_VISIBLE",
      "CHURCH_BELLS_WITHIN_MAP",
      "CHURCH_BELLS_OUTSIDE_MAP",
    ]) {
      expect(list, `${name} must not be silenced by the weather bed`).not.toContain(name);
    }
  });
});

// ── The seven, behaviourally ─────────────────────────────────────────────────

describe("Feature.Church: the bells", () => {
  let game: RogueGame;
  let ambients: RecordingAmbientManager;
  let map: GameMap;

  const ring = (): void =>
    (game as unknown as { checkChurchBellsSFX(): void }).checkChurchBellsSFX();

  beforeEach(() => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    map = new GameMap(1, "test", 20, 20);
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_GRASS)!);
      }
    }
    game = new RogueGame(new NullRogueUI());
    ambients = new RecordingAmbientManager();
    (game as unknown as { m_AmbientSFXManager: IAmbientManager }).m_AmbientSFXManager = ambients;

    const player = new Actor(
      Models.actors.get(ActorID.MALE_CIVILIAN)!,
      new Faction("The Survivors", "survivor"),
      "you",
    );
    player.controller = new PlayerController();
    map.placeActor(player, new Point(5, 5));
    game.m_Player = player;
  });

  it("rings the near bells on a map with a church", () => {
    map.hasChurch = true;
    ring();
    expect(ambients.calls).toEqual([
      `playIfNotAlreadyPlaying(${GameAmbients.CHURCH_BELLS_WITHIN_MAP},false)`,
    ]);
  });

  it("rings the far bells on a map with no church", () => {
    ring();
    expect(ambients.calls).toEqual([
      `playIfNotAlreadyPlaying(${GameAmbients.CHURCH_BELLS_OUTSIDE_MAP},false)`,
    ]);
  });

  it("rings the far bells for a sleeping player even inside the church", () => {
    // The C#'s condition is `HasChurch && !IsSleeping`, so a sleeping player fails it
    // whichever map they are on. Transcribed, not tidied: the intent is "can the
    // player hear it", and an unconscious player cannot.
    map.hasChurch = true;
    game.m_Player.isSleeping = true;
    ring();
    expect(ambients.calls).toEqual([
      `playIfNotAlreadyPlaying(${GameAmbients.CHURCH_BELLS_OUTSIDE_MAP},false)`,
    ]);
  });

  it("is a one-shot, not a bed", () => {
    // `looping` defaults to false in the C# (`ISoundManager.cs:52`), so it must not
    // be requested as a loop -- a bell that loops is a drone.
    map.hasChurch = true;
    ring();
    expect(ambients.calls[0], "one-shot").toContain(",false)");
  });
});

describe("Feature.HelicopterRescue: the landed helicopter", () => {
  let game: RogueGame;
  let ambients: RecordingAmbientManager;
  let map: GameMap;

  /** Where the helicopter sits, and the player, who gets moved around. */
  let heli: Point;
  let player: Actor;

  const check = (): void =>
    (
      game as unknown as { checkLandedHelicopterSFX(_map: GameMap): void }
    ).checkLandedHelicopterSFX(map);

  beforeEach(() => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    map = new GameMap(1, "test", 60, 60);
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_GRASS)!);
      }
    }
    game = new RogueGame(new NullRogueUI());
    ambients = new RecordingAmbientManager();
    (game as unknown as { m_AmbientSFXManager: IAmbientManager }).m_AmbientSFXManager = ambients;

    heli = new Point(30, 30);
    player = new Actor(
      Models.actors.get(ActorID.MALE_CIVILIAN)!,
      new Faction("The Survivors", "survivor"),
      "you",
    );
    player.controller = new PlayerController();
    map.placeActor(player, new Point(5, 5));
    game.m_Player = player;

    // Midday, because turn 0 is deep night in this clock and the C#'s outer
    // condition requires daylight -- a rescue helicopter is inaudible at midnight,
    // which is the one part of the ladder that is about the heli not existing.
    Session.get().worldTime.turnCounter = WorldTime.TURNS_PER_HOUR * 12;
    Session.get().armyHelicopterRescueDay = Session.get().worldTime.day;
    Session.get().setHelicopterRescueSite("A1", heli);

    // `armyHelicopterRescueMap` is a *derived* getter: it resolves the district
    // reference against the live world (`Session.ts:358-370`) so it cannot go
    // stale across a regenerate or a load. Standing up a whole world to make it
    // return this one map would be testing `World.getDistrict`, not the audio, so
    // the getter is stubbed for the test instead. Everything the audio method reads
    // off it -- "is this the rescue map" -- is exercised by the last test.
    rescueMap = map;
    Object.defineProperty(Session.get(), "armyHelicopterRescueMap", {
      get: () => rescueMap,
      configurable: true,
    });
  });

  /** Which map `armyHelicopterRescueMap` resolves to; swapped by one test. */
  let rescueMap: GameMap;

  const standAt = (x: number, y: number): void => {
    map.removeActor(player);
    map.placeActor(player, new Point(x, y));
  };

  it("picks one of the four tiers from the distance, and the right one", () => {
    // The radii are the C#'s (`Rules.cs:226-229`): QUIET 5, MODERATE 8, LOUD 14,
    // BOOMING 23. The source point is `heli + (1, 0)`, the middle of the 4x2 hull.
    const cases: [number, string][] = [
      [0, GameAmbients.STATIONARY_HELICOPTER_VISIBLE],
      [5, GameAmbients.STATIONARY_HELICOPTER_VISIBLE],
      [6, GameAmbients.STATIONARY_HELICOPTER_NEAR],
      [8, GameAmbients.STATIONARY_HELICOPTER_NEAR],
      [9, GameAmbients.STATIONARY_HELICOPTER_FAR],
      [14, GameAmbients.STATIONARY_HELICOPTER_FAR],
      [15, GameAmbients.STATIONARY_HELICOPTER_FARTHEST],
      [23, GameAmbients.STATIONARY_HELICOPTER_FARTHEST],
    ];
    for (const [distance, expected] of cases) {
      ambients.calls.length = 0;
      ambients.playing = [];
      standAt(heli.x + 1 - distance, heli.y);
      check();
      expect(ambients.calls, `${distance} tiles`).toEqual([
        `playIfNotAlreadyPlaying(${expected},true)`,
      ]);
    }
  });

  it("starts nothing beyond BOOMING, and stops what was playing", () => {
    // 24 tiles is past the last radius, so there is no track to play -- which is the
    // common case, not a failure case.
    standAt(heli.x + 1 + 24, heli.y);
    check();
    expect(ambients.calls.filter((c) => c.startsWith("play")), "no bed started").toHaveLength(0);
  });

  it("steps down a tier as the player approaches, leaving one bed running", () => {
    // The C#'s stop ladder keeps the NEAR track alive for every distance up to
    // MODERATE -- including the three tiles where it also starts VISIBLE -- so
    // approaching a landed helicopter runs two tracks in the reference. This port
    // uses `NoiseDistance.isWithinBand`, the complement of the start ladder, so
    // exactly one is ever playing. `NoiseDistance.ts:203-215` documents it.
    standAt(heli.x + 1 - 20, heli.y);
    check();
    expect(ambients.getPlayingAmbients()).toEqual([GameAmbients.STATIONARY_HELICOPTER_FARTHEST]);

    standAt(heli.x + 1 - 3, heli.y);
    check();
    expect(
      ambients.getPlayingAmbients().filter((id) => id.toLowerCase().includes("helicopter")),
      "one helicopter bed, not two",
    ).toEqual([GameAmbients.STATIONARY_HELICOPTER_VISIBLE]);
  });

  it("silences all four at night", () => {
    standAt(heli.x + 1 - 2, heli.y);
    check();
    expect(ambients.getPlayingAmbients().length, "playing by day").toBe(1);

    Session.get().worldTime.turnCounter += WorldTime.TURNS_PER_DAY;
    check();
    expect(
      ambients.getPlayingAmbients().filter((id) => id.toLowerCase().includes("helicopter")),
      "nothing at night",
    ).toEqual([]);
  });

  it("silences all four on another day", () => {
    standAt(heli.x + 1 - 2, heli.y);
    check();
    expect(ambients.getPlayingAmbients().length, "playing on the day").toBe(1);

    Session.get().armyHelicopterRescueDay += 1;
    check();
    expect(
      ambients.getPlayingAmbients().filter((id) => id.toLowerCase().includes("helicopter")),
      "nothing on another day",
    ).toEqual([]);
  });

  it("silences all four on another map", () => {
    standAt(heli.x + 1 - 2, heli.y);
    check();
    expect(ambients.getPlayingAmbients().length, "playing on the rescue map").toBe(1);

    const elsewhere = new GameMap(2, "elsewhere", 60, 60);
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        elsewhere.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_GRASS)!);
      }
    }
    rescueMap = map;
    elsewhere.removeActor(player);
    elsewhere.placeActor(player, new Point(5, 5));
    (
      game as unknown as { checkLandedHelicopterSFX(_map: GameMap): void }
    ).checkLandedHelicopterSFX(elsewhere);
    expect(
      ambients.getPlayingAmbients().filter((id) => id.toLowerCase().includes("helicopter")),
      "nothing elsewhere",
    ).toEqual([]);
  });
});
