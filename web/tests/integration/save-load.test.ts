import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { GameMode } from "@engine/Session";
import { SimRatio } from "@engine/GameOptions";
import { Session } from "@engine/Session";
import { GameSaveManager } from "@engine/GameSave";
import { storage } from "@engine/storage";
import { SkillID } from "@gameplay/Skills";

/**
 * Saving and loading a game.
 *
 * `Session.save` writes the session's scalars but not the world/map object graph
 * — the `TODO(phase 4)` in `Session.ts` — so a save is a set of numbers with no
 * world in it. The C# has no such gap: `Session.SaveBin` hands the whole object
 * graph to a `BinaryFormatter` and `LoadBin` calls `ReconstructAuxiliaryFields`
 * afterwards to rebuild the indexes that were derived, not stored.
 *
 * The bug this file exists for is what the port did with that gap. `LoadGame`
 * treated a successful *scalar* load as a successful *game* load and went
 * straight to `RefreshPlayer`, which dereferences `session.currentMap` — null,
 * because no world was restored. So Shift+L in the browser threw inside a
 * floating promise: no "LOADING FAILED" message, the rejection unhandled, and
 * the game left unable to continue. A save file that cannot be restored has to
 * say so, the way the C# does for an incompatible one.
 *
 * The world graph is the open work (BROWSER_PORT_PLAN §1.5 item 6). Until it
 * lands, a save is *expected* to fail to load, and these tests pin that it fails
 * loudly and leaves the game playable. When the serialisation lands, the second
 * test is the one to replace with a real roundtrip.
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
  await GameSaveManager.saveGame(0, JSON.parse(storage.getItem(Session.STORAGE_KEY) ?? "{}"));
}

describe("save/load roundtrip", () => {
  it("writes the session scalars into the save", async () => {
    const session = game.session;
    session.worldTime.turnCounter = 1234;
    session.lastTurnPlayerActed = 77;
    session.nextAutoSaveTime = 4321;
    session.charUndergroundFacility_Activated = true;

    await saveToSlotZero();

    // Asserted on the save file rather than through `load`, because a save with
    // no world in it is *supposed* to be refused — see the next two tests. The
    // scalars still have to be correct, or the day the world graph lands they
    // would be restored wrong and nothing would notice.
    const saveFile = await GameSaveManager.loadGame(0);
    expect(saveFile).not.toBeNull();
    const data = saveFile!.sessionData as Record<string, unknown>;
    expect(data.worldTime).toBe(1234);
    expect(data.lastTurnPlayerActed).toBe(77);
    expect(data.nextAutoSaveTime).toBe(4321);
    expect(data.charUndergroundFacility_Activated).toBe(true);
    expect(data.gameMode).toBe(GameMode.GM_STANDARD);
  });

  it("refuses a save that carries no world, and does not throw", async () => {
    // The regression: this used to throw a TypeError inside a floating promise,
    // so the player got no message at all and the game stopped responding.
    await saveToSlotZero();

    expect(Session.load()).toBe(false);
    expect(await game.LoadGame("0")).toBe(false);
  });

  it("leaves the game able to keep playing after a refused load", async () => {
    // The point of the guard: a refused load is a message, not a dead game. A
    // throw here is what used to end the session.
    await saveToSlotZero();
    await game.LoadGame("0");

    expect(() => game.RefreshPlayer()).not.toThrow();
    expect(() => game.RedrawPlayScreen()).not.toThrow();
  });

  it("keeps the live world intact across a refused load", async () => {
    // `Session.load` used to call `reset()` before validating, so a save it
    // could not restore still wiped the world the player was standing in. The
    // C# replaces the session only on success; so must this.
    const world = game.session.world;
    const map = game.session.currentMap;
    const player = game.player;
    expect(world).not.toBeNull();
    expect(map).not.toBeNull();

    await saveToSlotZero();
    await game.LoadGame("0");

    expect(game.session.world).toBe(world);
    expect(game.session.currentMap).toBe(map);
    expect(game.player).toBe(player);
    // And the scalars the session was mutated with are still there, rather than
    // having been half-restored from the save.
    expect(game.session.worldTime.turnCounter).toBe(1234);
  });
});
