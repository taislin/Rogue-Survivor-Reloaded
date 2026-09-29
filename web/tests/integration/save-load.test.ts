import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { SimRatio } from "@engine/GameOptions";
import { GameMode, Ruleset, Session } from "@engine/Session";
import { GameSaveManager } from "@engine/GameSave";
import { GRAPH_VERSION } from "@engine/serialization/SessionGraph";
import { SkillID } from "@gameplay/Skills";

/**
 * Saving and loading a real game, through the game's own entry points.
 *
 * This file used to assert the opposite: that a save carries no world and is
 * therefore *refused*, because `Session.save` wrote scalars only and the world
 * graph was the `TODO(phase 4)`. That gap is closed now, so the refusal tests are
 * kept only for the saves that genuinely cannot be restored, and the roundtrip
 * that could not be written is the one this file exists for.
 *
 * The C# never had any of this trouble: `Session.SaveBin` hands the whole object
 * graph to a `BinaryFormatter`, and `LoadBin` calls `ReconstructAuxiliaryFields`
 * afterwards to rebuild the indexes that were derived rather than stored. The port
 * has to do both halves by hand, and the second half is where a save goes wrong
 * quietly — see `tests/save-graph-roundtrip.test.ts` for the field-level
 * comparison, and `Map.finish` in `engine/serialization/specs.ts` for the indexes.
 *
 * ## What is still pinned about failure
 *
 * A save that cannot be restored has to say so rather than half-load, and — the
 * regression this file was born for — it must not take the game down with it.
 * `LoadGame` used to treat a successful *scalar* load as a successful *game* load
 * and go straight to `RefreshPlayer`, which dereferences `session.currentMap`:
 * null, because no world was restored. Shift+L threw inside a floating promise, so
 * the player got no message and the game stopped responding. Three tests below keep
 * that fixed, for a worldless save, a corrupt one and one from another build.
 */

const SEED = 4242;
let game: RogueGame;

beforeAll(async () => {
  // Before constructing the game: `RogueGame`'s constructor builds `Rules` from
  // the session seed, so a seed applied later would only half-pin the run.
  Session.useSeed(SEED);
  game = new RogueGame(new NullRogueUI(), new NullMusicManager());
  await game.LoadData();
  const opts = RogueGame.options;
  opts.citySize = 1;
  opts.simulateDistricts = SimRatio.OFF;
  opts.isAnimDelayOn = false;
  opts.isAdvisorEnabled = false;
  game.session.gameMode = GameMode.GM_STANDARD;
  game.m_CharGen.isUndead = false;
  game.m_CharGen.isMale = true;
  game.m_CharGen.startingSkill = SkillID.AGILE;
  await game.StartNewGame();
}, 120_000);

afterEach(async () => {
  await GameSaveManager.deleteSave(0);
});

/** What `DoSaveGame` does, minus the UI messages. */
async function saveToSlotZero(): Promise<void> {
  Session.save(game.session);
  await GameSaveManager.saveGame(0, JSON.parse(Session.savedJson() ?? "{}"));
}

/** The save as it sits in the slot, for the tests that damage it. */
async function slotData(): Promise<Record<string, unknown>> {
  const saveFile = await GameSaveManager.loadGame(0);
  return saveFile!.sessionData as Record<string, unknown>;
}

/** Puts a damaged save in the slot, the way a truncated file would arrive. */
async function saveDamaged(mutate: (data: Record<string, unknown>) => void): Promise<void> {
  const data = await slotData();
  mutate(data);
  Session.adopt(JSON.stringify(data));
  await GameSaveManager.saveGame(0, data);
}

describe("a save carries the world", () => {
  it("writes the session scalars into the save", async () => {
    const session = game.session;
    session.worldTime.turnCounter = 1234;
    session.lastTurnPlayerActed = 77;
    session.nextAutoSaveTime = 4321;
    session.charUndergroundFacility_Activated = true;
    session.armyHelicopterRescueDay = 19;

    await saveToSlotZero();

    // Asserted on the save file rather than through `load`, so that a failure
    // points at the writing side rather than at the reading side.
    const data = await slotData();
    expect(data.worldTime).toBe(1234);
    expect(data.lastTurnPlayerActed).toBe(77);
    expect(data.nextAutoSaveTime).toBe(4321);
    expect(data.charUndergroundFacility_Activated).toBe(true);
    // Chosen at character creation and per-run, so a save that dropped it would
    // restore a run whose helicopter arrives on the default day instead of the
    // one the player agreed to. Additive: a save with no key defaults to 21.
    expect(data.armyHelicopterRescueDay).toBe(19);
    expect(data.gameMode).toBe(GameMode.GM_STANDARD);
    // The ruleset is a sibling of gameMode in the hand-written root object, not
    // in the graph, so `save-graph-roundtrip.test.ts` cannot see it — this is the
    // only place it is checked end to end. It matters more than it looks: a save
    // that lost the ruleset would load as CLASSIC under `?? Ruleset.CLASSIC`, and
    // a Still Alive world would silently come back as a classic one.
    expect(data.ruleset).toBe(Ruleset.CLASSIC);
    expect(data.graphVersion).toBe(GRAPH_VERSION);
    expect(data.graph).not.toBeNull();
  });

  it("round-trips the game through LoadGame", async () => {
    // The test this file could not write before. `LoadGame` is the player's Shift+L
    // and it has to leave a world that is the one they saved: same map, same
    // actors, same turn.
    game.session.worldTime.turnCounter = 2000;
    game.session.armyHelicopterRescueDay = 17;
    const before = {
      map: game.session.currentMap,
      world: game.session.world,
      actors: game.session.currentMap!.countActors,
      objects: game.session.currentMap!.mapObjects.length,
      player: game.player!.unmodifiedName,
    };

    await saveToSlotZero();
    expect(await game.LoadGame("0")).toBe(true);

    // New objects — this is a restore, not the same session handed back.
    expect(game.session.currentMap).not.toBe(before.map);
    expect(game.session.world).not.toBe(before.world);
    // And the same world.
    expect(game.session.currentMap!.countActors).toBe(before.actors);
    expect(game.session.currentMap!.mapObjects.length).toBe(before.objects);
    expect(game.session.worldTime.turnCounter).toBe(2000);
    expect(game.session.armyHelicopterRescueDay).toBe(17);
    // The player is back, and is a player again: the graph does not carry
    // controllers, so `LoadGame` reattaches one.
    expect(game.player).not.toBeNull();
    expect(game.player!.isPlayer).toBe(true);
    expect(game.player!.unmodifiedName).toBe(before.player);
  });

  it("leaves the restored game playable", async () => {
    // A restored world that cannot be drawn or re-viewed is a save that loads and
    // then breaks the next keypress. These are the two calls every turn makes.
    await saveToSlotZero();
    expect(await game.LoadGame("0")).toBe(true);
    expect(() => game.RefreshPlayer()).not.toThrow();
    expect(() => game.RedrawPlayScreen()).not.toThrow();
    expect(() => game.session.currentMap!.assertActorIntegrity()).not.toThrow();
  });

  it("survives being loaded twice in a row", async () => {
    // A load replaces the world, so the second one saves a *restored* world. That is
    // a different object graph from the first — rebuilt indexes rather than generated
    // ones — and it is the case that would expose a field the first load did not
    // quite rebuild.
    await saveToSlotZero();
    expect(await game.LoadGame("0")).toBe(true);
    const actors = game.session.currentMap!.countActors;
    expect(await game.LoadGame("0")).toBe(true);
    expect(game.session.currentMap!.countActors).toBe(actors);
    expect(game.player!.isPlayer).toBe(true);
  });
});

describe("a save that cannot be restored says so", () => {
  it("refuses a save with no world in it, and does not throw", async () => {
    // The regression: this used to throw a TypeError inside a floating promise, so
    // the player got no message at all and the game stopped responding.
    await saveToSlotZero();
    await saveDamaged((data) => {
      data.graph = null;
    });

    expect(Session.load()).toBe(false);
    expect(await game.LoadGame("0")).toBe(false);
  });

  it("refuses a corrupt graph, rather than restoring part of one", async () => {
    await saveToSlotZero();
    await saveDamaged((data) => {
      const graph = data.graph as { objs: unknown[] };
      graph.objs = graph.objs.slice(0, 2); // every later reference now dangles
    });

    expect(Session.load()).toBe(false);
    expect(await game.LoadGame("0")).toBe(false);
  });

  it("refuses a graph written by another build", async () => {
    // "VERSION NOT COMPATIBLE" in `DoLoadGame`, and `Session.Load` returning false
    // for a `SaveFormat` it cannot read.
    await saveToSlotZero();
    await saveDamaged((data) => {
      data.graphVersion = GRAPH_VERSION + 1;
    });

    expect(Session.load()).toBe(false);
  });

  it("leaves the game able to keep playing after a refused load", async () => {
    // The point of the guard: a refused load is a message, not a dead game.
    await saveToSlotZero();
    await saveDamaged((data) => {
      data.graph = null;
    });
    await game.LoadGame("0");

    expect(() => game.RefreshPlayer()).not.toThrow();
    expect(() => game.RedrawPlayScreen()).not.toThrow();
  });

  it("keeps the live world intact across a refused load", async () => {
    // `Session.load` used to call `reset()` before validating, so a save it could
    // not restore still wiped the world the player was standing in. The C#
    // replaces the session only on success; so must this — and now that a load
    // *can* succeed, the asymmetry is the only thing standing between a refused
    // load and a destroyed game.
    const world = game.session.world;
    const map = game.session.currentMap;
    const player = game.player;
    expect(world).not.toBeNull();

    await saveToSlotZero();
    await saveDamaged((data) => {
      data.graph = null;
    });
    await game.LoadGame("0");

    expect(game.session.world).toBe(world);
    expect(game.session.currentMap).toBe(map);
    expect(game.player).toBe(player);
  });
});
