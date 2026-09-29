import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Session, SaveFormat, GameMode, Ruleset } from "@engine/Session";
import { storage } from "@engine/storage";
import { WorldTime } from "@engine/WorldTime";
import { GRAPH_VERSION, type GraphData } from "@engine/serialization/SessionGraph";
import { Exit, Map as GameMap } from "@data/Map";import { CLASS_SPECS, encodeScoring } from "@engine/serialization/specs";
import {
  findPlayerActor,
  readSessionGraph,
  reattachPlayer,
  writeSessionGraph,
  type LoadedGraph,
} from "@engine/serialization/sessionGraphRoot";

/**
 * A whole-world save/load roundtrip.
 *
 * This is the test that makes `Session.save` mean something. Everything else about
 * the graph is plumbing; what matters is that a world which has been *played* —
 * actors mid-conversation, items in inventories, a door that has been broken, a
 * district that has fallen behind — comes back exactly as it was.
 *
 * The failure mode it exists to catch is the quiet one. A codec that omits one
 * field produces a save that loads, that plays, and that has quietly lost that
 * field: nothing throws and nothing looks wrong. So the comparison here walks the
 * two graphs side by side and checks *every* field the format claims to carry,
 * rather than spot-checking the interesting ones — and the format's own skip lists
 * are the only thing allowed to differ, which makes each entry in them a visible
 * claim that has to be justified.
 */

const SEED = 13579;
const TURNS = 14;

let game: RogueGame;
let session: Session;
let before: LoadedGraph;

/**
 * The live session's own fields, so `afterEach` can put them back.
 *
 * `Session` is a singleton, and three of the tests below legitimately overwrite
 * it — `Session.load` installs a restored world, and the "no world" case nulls it.
 * Without this, whichever test ran first would decide what the rest saw, and the
 * failure would look like a serialisation bug.
 */
let pristine: {
  world: unknown;
  currentMap: unknown;
  scoring: unknown;
  worldTimeTurn: number;
  uniques: { uniqueActors: unknown; uniqueItems: unknown; uniqueMaps: unknown };
};

function snapshot(): void {
  pristine = {
    world: session.world,
    currentMap: session.currentMap,
    scoring: session.scoring,
    worldTimeTurn: session.worldTime.turnCounter,
    uniques: {
      uniqueActors: session.uniqueActors,
      uniqueItems: session.uniqueItems,
      uniqueMaps: session.uniqueMaps,
    },
  };
}

function restore(): void {
  session.world = pristine.world as never;
  session.currentMap = pristine.currentMap as never;
  session.uniqueActors = pristine.uniques.uniqueActors as never;
  session.uniqueItems = pristine.uniques.uniqueItems as never;
  session.uniqueMaps = pristine.uniques.uniqueMaps as never;
  // `worldTime` and `scoring` are written through the session's own fields: both
  // getters create a blank object when the backing field is null, so assigning
  // through them would install a fresh WorldTime(0) instead of the real one.
  (session as unknown as { m_WorldTime: WorldTime }).m_WorldTime = new WorldTime(pristine.worldTimeTurn);
  (session as unknown as { m_Scoring: unknown }).m_Scoring = pristine.scoring;
}

/**
 * The graph, written once and read once.
 *
 * Every read-only assertion below shares this one. It is the right shape for two
 * reasons, and the second is the important one: a full world is 4.6 MB of JSON and
 * ~20 000 objects, so re-deriving it per test cost 5 s each and, with 34 test files
 * in flight, the comparison test ran past vitest's 60 s default. `afterEach` puts
 * the live session back to the snapshot this was taken from, so a cached graph is
 * always a graph of the current state.
 */
let cached: { data: GraphData; loaded: LoadedGraph } | null = null;

/** Writes a save of the live session and reads the graph straight back out. */
function roundTrip(): { data: GraphData; loaded: LoadedGraph } {
  if (cached === null) {
    const world = session.world!;
    const map = session.currentMap!;
    const data = writeSessionGraph(
      world,
      map,
      session.scoring,
      session,
      findPlayerActor(map),
      session.worldTime.turnCounter
    );
    cached = { data, loaded: readSessionGraph(data) };
  }
  return cached;
}

/**
 * A graph written now, for the tests that change the live world first.
 *
 * The refusal tests below smuggle a field onto a real object and need the writer to
 * see it, which a cached graph would never do.
 */
function freshRoundTrip(): { data: GraphData; loaded: LoadedGraph } {
  cached = null;
  return roundTrip();
}

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  game = runner.rogueGame;
  await game.LoadData();
  // Enough turns for the world to have something in it: the bot has met people,
  // dropped or picked things up, and the districts have started killing actors.
  await runner.run({ worldSize: 1, maxTurns: TURNS, isUndead: true, bot: true });
  session = Session.get();
  snapshot();
  before = roundTrip().loaded;
}, 180_000);

afterEach(() => {
  restore();
  storage.setItem(Session.STORAGE_KEY, "{}");
});

describe("the save carries a world", () => {
  it("writes a graph, not null", () => {
    const { data } = roundTrip();
    const root = data.root as Record<string, unknown>;
    expect(data.v).toBe(GRAPH_VERSION);
    expect(data.objs.length).toBeGreaterThan(0);
    expect(root.world).not.toBeNull();
    expect(root.currentMap).not.toBeNull();
  });

  it("carries more than the player's own district would need", () => {
    // A graph of one map and one actor would pass every assertion below while
    // being useless, so the shape of what was written is asserted directly.
    const { data } = roundTrip();
    const kinds = new Set(data.objs.map((r) => r.k));
    for (const expected of ["World", "District", "Map", "Actor", "MapObject"]) {
      expect(kinds.has(expected), `save has no ${expected} record`).toBe(true);
    }
  });

  it("writes the tiles as two dense arrays of exactly the tiles there are", () => {
    // The regression this pins: the flat index has to step by the map's *height*,
    // and when it stepped by a guessed 10 000 instead, a 50x50 map's arrays came
    // out 76x too long and a 3x3 save weighed 155 MB rather than 4.6.
    const { data } = roundTrip();
    for (const record of data.objs) {
      if (record.k !== "Map") continue;
      const [width, height, models, flags, decorations] = record.f.tilesGrid as [
        number, number, number[], number[], unknown[],
      ];
      expect(models.length, `${width}x${height} map`).toBe(width * height);
      expect(flags.length).toBe(width * height);
      expect(Array.isArray(decorations)).toBe(true);
    }
  });

  it("stays a few megabytes, and the tiles are not most of it", () => {
    // 4.6 MB for a 3x3 world with 56 maps, 5 800 map objects and 970 actors. The
    // tiles are ~0.8 MB of that, which is the point of inlining them: as records
    // they would have cost 10 000 objects of overhead per map and tripled the
    // file. The absolute size is handled by the storage fallback, not here.
    const { data } = roundTrip();
    expect(JSON.stringify(data).length).toBeLessThan(8_000_000);
  });
});

describe("a roundtrip preserves the world", () => {
  it("restores every field the format carries, everywhere", () => {
    // The whole point of the file. It walks two 3x3 worlds — ~20 000 objects each —
    // field by field, and asserts on the *collected* differences rather than one
    // `expect` per field: 400 000 assertions is 40 seconds of assertion overhead,
    // and a failure should list everything that is wrong, not the first thing.
    const differences = compareGraphs(before, roundTrip().loaded);
    expect(differences, `${differences.length} field(s) differ`).toEqual([]);
  });

  it("restores the same object graph, not a copy of the values", () => {
    // The bijection matters more than the values: a save that duplicated a shared
    // object would pass a value comparison and then behave differently, because
    // `tryRemoveCorpseOf` and `hasActor` both compare by identity.
    const { loaded } = roundTrip();
    const original = session.currentMap!.actors[0];
    const twin = loaded.currentMap.actors.find((a) => a.unmodifiedName === original.unmodifiedName)!;
    expect(twin).toBeDefined();
    expect(twin).not.toBe(original);
    // And a *shared* reference inside the restored world is still shared: a leader
    // and its follower have to be two views of one pair of objects, not two pairs.
    const withLeader = loaded.currentMap.actors.find(
      (a) => a.leader != null && a.followers != null && a.followers.length > 0
    );
    if (withLeader != null) {
      expect(withLeader.followers!.some((f) => f === withLeader.leader)).toBe(true);
      expect(withLeader.leader!.followers!.some((f) => f === withLeader)).toBe(true);
    }
  });

  it("restores the per-map clocks, which are not the world clock", () => {
    const { loaded } = roundTrip();
    expect(loaded.currentMap.localTime.turnCounter).toBe(session.currentMap!.localTime.turnCounter);
    // Derived date fields are recomputed rather than copied, so they have to agree
    // with the turn that was restored.
    expect(loaded.currentMap.localTime.day).toBe(session.currentMap!.localTime.day);
    expect(loaded.currentMap.localTime.hour).toBe(session.currentMap!.localTime.hour);
    expect(loaded.currentMap.localTime.phase).toBe(session.currentMap!.localTime.phase);
  });

  it("restores the world clock", () => {
    const { loaded } = roundTrip();
    expect(loaded.worldTimeTurn).toBe(session.worldTime.turnCounter);
    expect(new WorldTime(loaded.worldTimeTurn).hour).toBe(session.worldTime.hour);
  });
});

describe("a restored map is usable, not just complete", () => {
  it("has a position index that agrees with its actor list", () => {
    // `assertActorIntegrity` is the engine's own check, and it is the one that
    // catches a list/index desync — the failure where every actor is restored and
    // the game cannot see any of them.
    const { loaded } = roundTrip();
    loaded.currentMap.assertActorIntegrity();
  });

  it("finds every restored actor by position", () => {
    const { loaded } = roundTrip();
    for (const actor of loaded.currentMap.actors) {
      const { x, y } = actor.location.position;
      expect(loaded.currentMap.getActorAt(x, y)).toBe(actor);
    }
  });

  it("points every actor's location at the map it is listed on", () => {
    const { loaded } = roundTrip();
    for (const actor of loaded.currentMap.actors) {
      expect(actor.location.map).toBe(loaded.currentMap);
    }
  });

  it("finds every restored map object, corpse and scent by position", () => {
    const { loaded } = roundTrip();
    const map = loaded.currentMap;
    for (const obj of map.mapObjects) {
      expect(map.getMapObjectAt(obj.location.position.x, obj.location.position.y)).toBe(obj);
      expect(obj.location.map).toBe(map);
    }
    for (const corpse of map.corpses) {
      expect(map.getCorpsesAt(corpse.position)).toContain(corpse);
    }
    for (const scent of map.scents) {
      expect(map.getScentsAt(scent.position)).toContain(scent);
    }
  });

  it("finds every ground inventory by position", () => {
    const { loaded } = roundTrip();
    const map = loaded.currentMap;
    // `getGroundInventoryPosition` walks the dict, so a key that did not survive
    // the roundtrip shows up as a null rather than as a wrong position.
    for (const inventory of map.groundInventories) {
      expect(map.getGroundInventoryPosition(inventory)).not.toBeNull();
    }
  });

  it("keeps the exits, which are keyed by the position they leave from", () => {
    const restored = roundTrip().loaded.currentMap;
    const original = exitsOf(session.currentMap!);
    const twin = exitsOf(restored);

    // Compared key by key rather than by scanning the map, because an exit is not
    // always at a position *on* the map: the ones leading to the next district sit
    // at the edge, some of them at y = -1, and `findFirstInMap` cannot see those.
    // The original has exactly the same keys, so this checks the roundtrip and not
    // a property of the generator.
    expect(twin.size).toBe(original.size);
    for (const [key, exit] of original) {
      const other = twin.get(key);
      expect(other, `the exit at ${key} is missing`).toBeDefined();
      expect(other!.toMap?.name ?? null, `the exit at ${key} leads nowhere now`).toBe(
        exit.toMap?.name ?? null
      );
      expect(other!.toPosition).toEqual(exit.toPosition);
      expect(other!.isAnAIExit).toBe(exit.isAnAIExit);
    }
  });

  it("keeps the zones and their game attributes", () => {
    const { loaded } = roundTrip();
    for (const zone of session.currentMap!.zones) {
      const twin = loaded.currentMap.getZoneByPartialName(zone.name);
      expect(twin, `zone ${zone.name} did not survive`).not.toBeNull();
      expect(twin!.bounds).toEqual(zone.bounds);
    }
  });
});

describe("the player comes back", () => {
  it("records which actor was the player", () => {
    const { loaded } = roundTrip();
    expect(loaded.player).not.toBeNull();
    expect(loaded.player!.unmodifiedName).toBe(findPlayerActor(session.currentMap!)!.unmodifiedName);
  });

  it("comes back without a controller, and takes a fresh one", () => {
    // The controller is not part of the graph — see specs.ts — so a restored actor
    // has none, and `isPlayer` is false until one is attached. `LoadGame` is what
    // attaches it, and this is the state it finds.
    const { loaded } = roundTrip();
    const player = loaded.player!;
    expect(player.controller).toBeNull();
    expect(player.isPlayer).toBe(false);

    reattachPlayer(player);
    expect(player.isPlayer).toBe(true);
  });

  it("is findable by the same test RefreshPlayer uses", () => {
    // `RefreshPlayer` scans the current map for `isPlayer`, so if that scan cannot
    // find the restored player, a load succeeds and leaves nobody in charge.
    const { loaded } = roundTrip();
    reattachPlayer(loaded.player);
    const found = findPlayerActor(loaded.currentMap);
    expect(found).toBe(loaded.player);
  });
});

describe("the scoring survives", () => {
  it("round-trips every scoring field, including the containers", () => {
    // `Scoring` is flattened rather than recorded, and half of it lives in JS
    // `Map`/`Set` fields whose accessors hand back live iterators — the sort of
    // thing that serialises as `{}` and comes back empty without complaining.
    const { data } = roundTrip();
    const reloaded = readSessionGraph(data);
    const beforeJson = JSON.stringify(encodeScoring(session.scoring, fakeWriter()));
    const afterJson = JSON.stringify(encodeScoring(reloaded.scoring, fakeWriter()));
    expect(afterJson).toBe(beforeJson);
  });

  it("keeps the eight achievements, which are indexed without a guard", () => {
    const { loaded } = roundTrip();
    expect(loaded.scoring.achievements.length).toBe(8);
    // `hasCompletedAchievement` would throw on a hole in that array.
    expect(() => loaded.scoring.hasCompletedAchievement(0)).not.toThrow();
  });

  it("keeps reincarnationNumber, which is a saved value and not a counter", () => {
    const { loaded } = roundTrip();
    expect(loaded.scoring.reincarnationNumber).toBe(session.scoring.reincarnationNumber);
  });
});

describe("Session.save and Session.load", () => {
  it("round-trips through storage", () => {
    Session.save(session, SaveFormat.FORMAT_JSON);
    const raw = storage.getItem(Session.STORAGE_KEY)!;
    expect(JSON.parse(raw).graph).not.toBeNull();

    expect(Session.load()).toBe(true);
    const loadedSession = Session.get();
    expect(loadedSession.world).not.toBeNull();
    expect(loadedSession.currentMap).not.toBeNull();
    expect(loadedSession.currentMap!.countActors).toBeGreaterThan(0);
    expect(loadedSession.worldTime.turnCounter).toBe(session.worldTime.turnCounter);
    expect(loadedSession.loadedPlayer).not.toBeNull();
  });

  it("loads a save written before the ruleset field existed, as CLASSIC", () => {
    // The ruleset is additive in the hand-written root object, not in the graph,
    // so nothing about `GRAPH_VERSION` had to change and every existing save in
    // the wild has no `ruleset` key at all. `Session.load` therefore defaults it.
    //
    // Defaulting to CLASSIC rather than rejecting the save is the right call and
    // worth pinning: a pre-ruleset save *was* a classic save, and the alternatives
    // — guessing STILL_ALIVE, or refusing — would either invent a content set the
    // player never chose or throw away a run over a missing field.
    const { data: graph } = freshRoundTrip();
    storage.setItem(
      Session.STORAGE_KEY,
      JSON.stringify({
        gameMode: GameMode.GM_STANDARD,
        seed: session.seed,
        lastTurnPlayerActed: session.lastTurnPlayerActed,
        graphVersion: GRAPH_VERSION,
        graph,
      })
    );

    expect(Session.load()).toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
  });

  it("keeps the ruleset across a round trip", () => {
    // The same field, with a value: a Still Alive save must come back as a Still
    // Alive save, or the world would silently revert to classic content.
    const previous = session.ruleset;
    session.ruleset = Ruleset.STILL_ALIVE;
    try {
      Session.save(session, SaveFormat.FORMAT_JSON);
      const raw = JSON.parse(storage.getItem(Session.STORAGE_KEY)!);
      expect(raw.ruleset).toBe(Ruleset.STILL_ALIVE);

      expect(Session.load()).toBe(true);
      expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
    } finally {
      session.ruleset = previous;
    }
  });

  it("still refuses a save with no graph, rather than loading the scalars alone", () => {
    storage.setItem(
      Session.STORAGE_KEY,
      JSON.stringify({ gameMode: 0, seed: 1, worldTime: 500, graphVersion: GRAPH_VERSION, graph: null })
    );
    expect(Session.load()).toBe(false);
  });

  it("still refuses a graph from another version", () => {
    const { data } = freshRoundTrip();
    const wrongVersion = { ...data, v: GRAPH_VERSION + 1 };
    storage.setItem(
      Session.STORAGE_KEY,
      JSON.stringify({ gameMode: 0, seed: 1, worldTime: 5, graphVersion: GRAPH_VERSION + 1, graph: wrongVersion })
    );
    expect(Session.load()).toBe(false);
  });

  it("refuses a corrupt graph without disturbing the game in progress", () => {
    // The regression this guards is bug 64 in reverse: a load that fails *after*
    // `reset()` refuses the save and takes the world with it.
    const liveWorld = session.world;
    const liveMap = session.currentMap;
    const { data } = freshRoundTrip();
    // Truncate the object table: every later reference now dangles.
    const truncated = { ...data, objs: data.objs.slice(0, 3) };
    storage.setItem(
      Session.STORAGE_KEY,
      JSON.stringify({ gameMode: 0, seed: 1, worldTime: 5, graphVersion: GRAPH_VERSION, graph: truncated })
    );

    expect(Session.load()).toBe(false);
    expect(Session.get().world).toBe(liveWorld);
    expect(Session.get().currentMap).toBe(liveMap);
  });

  it("writes no graph for a session that has no world", () => {
    const empty = Session.get();
    empty.world = null;
    empty.currentMap = null;
    Session.save(empty);
    const raw = JSON.parse(storage.getItem(Session.STORAGE_KEY)!) as Record<string, unknown>;
    expect(raw.graph).toBeNull();
    expect(raw.graphVersion).toBe(GRAPH_VERSION);
  });
});

describe("a field with no codec stops the save", () => {
  it("throws, naming the path, instead of writing a partial graph", () => {
    // The alternative — a best-effort dump — produces a save that loads and lies,
    // which is the failure this project keeps paying for. So the writer refuses.
    const actor = session.currentMap!.actors[0];
    (actor as unknown as Record<string, unknown>).smuggled = session.world;
    try {
      expect(() => freshRoundTrip()).toThrow(/Actor\.smuggled/);
    } finally {
      delete (actor as unknown as Record<string, unknown>).smuggled;
    }
  });

  it("says which class has no codec when the object is not one it knows", () => {
    const zone = session.currentMap!.zones[0];
    (zone as unknown as Record<string, unknown>).smuggled = new Map();
    try {
      expect(() => freshRoundTrip()).toThrow(/smuggled/);
    } finally {
      delete (zone as unknown as Record<string, unknown>).smuggled;
    }
  });
});

// ── The comparison ──────────────────────────────────────────────────────────

/** The spec for a value, or null if the format carries it inline. */
function specFor(value: object): (typeof CLASS_SPECS)[number] | null {
  return CLASS_SPECS.find((s) => s.matches(value)) ?? null;
}

/** A writer that hands out ids without needing a real graph. */
function fakeWriter() {
  let next = 1;
  const ids = new WeakMap<object, number>();
  return {
    ref(value: object | null) {
      if (value === null) return null;
      const existing = ids.get(value);
      if (existing !== undefined) return { $: existing };
      const id = next++;
      ids.set(value, id);
      return { $: id };
    },
  } as unknown as Parameters<typeof encodeScoring>[1];
}

/**
 * The two graphs must be isomorphic over the fields the format carries.
/**
 * The two graphs must be isomorphic over the fields the format carries.
 *
 * Differences are *collected* and returned rather than asserted as they are found,
 * for two reasons: 400 000 `expect` calls over a 3x3 world is most of a minute of
 * assertion overhead, and a save that loses one field out of twenty should say so
 * once, in full, rather than abort on the first.
 *
 * `mapping` is the bijection: the first time an object is met it is paired with
 * its counterpart, and every later reference to it has to come back to the same
 * one. A format that duplicated a shared object would pass a value comparison and
 * fail here — which is the difference between "the numbers are the same" and "it
 * is the same world".
 */
function compareGraphs(a: LoadedGraph, b: LoadedGraph): string[] {
  const diffs: string[] = [];
  const mapping = new Map<object, object>();
  const note = (path: string, detail: string): void => {
    if (diffs.length < 40) diffs.push(`${path}: ${detail}`);
  };
  compare(a.world, b.world, "world", mapping, diffs, note);
  compare(a.currentMap, b.currentMap, "currentMap", mapping, diffs, note);
  compare(a.scoring, b.scoring, "scoring", mapping, diffs, note);
  compare(a.uniqueActors, b.uniqueActors, "uniqueActors", mapping, diffs, note);
  compare(a.uniqueItems, b.uniqueItems, "uniqueItems", mapping, diffs, note);
  compare(a.uniqueMaps, b.uniqueMaps, "uniqueMaps", mapping, diffs, note);
  compare(a.player, b.player, "player", mapping, diffs, note);
  if (mapping.size <= 10) diffs.push(`only ${mapping.size} objects were compared, which is too few to mean anything`);
  return diffs;
}

type Note = (path: string, detail: string) => void;

function compare(
  a: unknown,
  b: unknown,
  path: string,
  mapping: Map<object, object>,
  diffs: string[],
  note: Note
): void {
  if (a === null || a === undefined) {
    if (b !== a) note(path, `expected nothing, got ${describeValue(b)}`);
    return;
  }
  if (typeof a !== "object") {
    if (!Object.is(b, a)) note(path, `expected ${describeValue(a)}, got ${describeValue(b)}`);
    return;
  }

  const spec = specFor(a as object);
  if (spec != null) {
    compareRecord(a as any, b, spec, path, mapping, diffs, note);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      note(path, `expected an array, got ${describeValue(b)}`);
      return;
    }
    if (a.length !== b.length) {
      note(path, `array of ${a.length}, restored ${b.length}`);
      return;
    }
    for (let i = 0; i < a.length; i++) compare(a[i], b[i], `${path}[${i}]`, mapping, diffs, note);
    return;
  }
  if (a instanceof globalThis.Map) {
    if (!(b instanceof globalThis.Map)) {
      note(path, `expected a Map, got ${describeValue(b)}`);
      return;
    }
    if (a.size !== b.size) note(path, `Map of ${a.size} entries, restored ${b.size}`);
    for (const [key, value] of a) {
      if (!b.has(key)) {
        note(path, `key ${String(key)} is missing`);
        continue;
      }
      compare(value, b.get(key), `${path}.get(${String(key)})`, mapping, diffs, note);
    }
    return;
  }
  if (a instanceof globalThis.Set) {
    // A set of scalars: comparing the contents is the whole check. A set of
    // objects is not compared element-wise, so say so rather than let it pass.
    if (!(b instanceof globalThis.Set)) {
      note(path, `expected a Set, got ${describeValue(b)}`);
      return;
    }
    if (a.size !== b.size) {
      note(path, `Set of ${a.size}, restored ${b.size}`);
      return;
    }
    for (const value of a) {
      const primitive = value === null || typeof value !== "object";
      if (primitive && !b.has(value)) note(path, `${describeValue(value)} is missing from the set`);
    }
    return;
  }
  compareValue(a, b, path, mapping, diffs, note);
}

/** A value object: every own field, all of them. */
function compareValue(
  a: object,
  b: unknown,
  path: string,
  mapping: Map<object, object>,
  diffs: string[],
  note: Note
): void {
  if (typeof b !== "object" || b === null) {
    note(path, `expected a ${a.constructor?.name}, got ${describeValue(b)}`);
    return;
  }
  compareValueFields(a, b, path, mapping, diffs, note);
}

function compareValueFields(
  a: object,
  b: object,
  path: string,
  mapping: Map<object, object>,
  diffs: string[],
  note: Note
): void {
  if (Object.getPrototypeOf(b).constructor !== Object.getPrototypeOf(a).constructor) {
    note(path, `came back as a ${Object.getPrototypeOf(b).constructor?.name}, not a ${a.constructor?.name}`);
  }
  const keys = Object.keys(a);
  const otherKeys = new Set(Object.keys(b));
  for (const key of keys) {
    if (!otherKeys.has(key)) {
      note(path, `field ${key} is missing from the restored object`);
      continue;
    }
    otherKeys.delete(key);
    compare(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}.${key}`,
      mapping,
      diffs,
      note
    );
  }
  for (const key of otherKeys) note(path, `field ${key} exists only on the restored object`);
}

/** A record: every own field except the ones the format declares it skips. */
function compareRecord(
  a: any,
  b: unknown,
  spec: (typeof CLASS_SPECS)[number],
  path: string,
  mapping: Map<object, object>,
  diffs: string[],
  note: Note
): void {
  if (typeof b !== "object" || b === null) {
    note(path, `expected a ${spec.name}, got ${describeValue(b)}`);
    return;
  }

  const alreadyMapped = mapping.get(a);
  if (alreadyMapped !== undefined) {
    if (b !== alreadyMapped) note(path, "this shared reference came back as a different object");
    return;
  }
  mapping.set(a, b);
  if (Object.getPrototypeOf(b).constructor !== Object.getPrototypeOf(a).constructor) {
    note(path, `came back as a ${Object.getPrototypeOf(b).constructor?.name}, not a ${a.constructor?.name}`);
  }

  const skipped = new Set(
    Object.entries(spec.fields)
      .filter(([, codec]) => codec.kind === "skip")
      .map(([key]) => key)
  );
  const carried = Object.keys(a).filter((key) => !skipped.has(key));

  // Every carried field must be there, and nothing may be there that the format
  // does not claim — except the skipped keys a `finish` hook legitimately
  // re-created, like a map's position indexes.
  const restoredKeys = new Set(Object.keys(b));
  for (const key of carried) {
    if (!restoredKeys.has(key)) note(path, `field ${key} did not survive the roundtrip`);
  }
  for (const key of restoredKeys) {
    if (!carried.includes(key) && !skipped.has(key)) {
      note(path, `field ${key} exists on the restored object but the format does not carry it`);
    }
  }

  for (const key of carried) {
    compare(a[key], (b as any)[key], `${path}.${key}`, mapping, diffs, note);
  }

  // The extras: state the object does not hold as a field. Compared by *producing
  // it from both sides* rather than by reading the staging key back, because
  // `finish` consumes and deletes that key — the question is whether the hook put
  // the data where it belongs, not whether the note it was handed is still lying
  // around. For an actor that means comparing the two skill tables.
  for (const extra of spec.extra ?? []) {
    compare(extra.produce(a), extra.produce(b), `${path}.${extra.key}`, mapping, diffs, note);
  }
}

/** The exits of a map, by the key they are stored under. */
function exitsOf(map: GameMap): globalThis.Map<string, Exit> {
  return (map as unknown as { exitsMap: globalThis.Map<string, Exit> }).exitsMap;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value !== "object") return JSON.stringify(value);
  const name = (value as object).constructor?.name;
  return name ? `a live ${name}` : "a live object";
}