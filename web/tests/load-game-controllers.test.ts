import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { storage } from "@engine/storage";
import type { World } from "@data/World";

/**
 * `LoadGame` rebuilds the controllers it does not carry.
 *
 * `_controller` is skipped for every actor in the save graph (see `specs.ts`), so
 * a save read back hands over a world of actors and **no** controllers. The unit
 * test for `reattachControllers` proves the helper works; this one proves
 * `LoadGame` calls it, which is the difference between a fixed game and a fixed
 * function nobody reaches.
 *
 * What goes wrong without it is not a visible failure. `advancePlayMap` gives a
 * controller-less actor a free action instead of a turn, so every NPC alive when
 * the save was written simply stops — and the first AI that does still have a
 * controller and chats with a frozen neighbour sends `DoChat` into `DoTrade`,
 * which reads `targetAI!` and throws
 * `Cannot read properties of null (reading 'rateTradeOffer')`.
 */

const SEED = 24680;
const TURNS = 12;
const SAVE_SLOT = "0";

let game: RogueGame;

/** Actors in `world` with no controller at all — what a load must not leave. */
function controllerless(world: World): number {
  let count = 0;
  for (let x = 0; x < world.size; x++) {
    for (let y = 0; y < world.size; y++) {
      const district = world.getDistrict(x, y);
      if (district === null) continue;
      for (const map of district.maps) {
        for (const actor of map.actors) {
          if (actor.controller === null) count++;
        }
      }
    }
  }
  return count;
}

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  game = runner.rogueGame;
  await game.LoadData();
  await runner.run({ worldSize: 1, maxTurns: TURNS, isUndead: true, bot: true });
}, 180_000);

afterEach(() => {
  storage.removeItem(`rogueSurvivor_save_${SAVE_SLOT}`);
});

describe("LoadGame", () => {
  it("gives every restored NPC its controller back", async () => {
    const live = game.m_Session.world;
    expect(live).not.toBeNull();
    // Non-vacuity: the world being loaded from is complete, so the assertion
    // after the load is about the load and not about a world that was already
    // broken.
    expect(controllerless(live!), "the live world is missing controllers").toBe(0);

    game.DoSaveGame(SAVE_SLOT);
    await expect(game.LoadGame(SAVE_SLOT)).resolves.toBe(true);

    const restored = game.m_Session.world;
    expect(restored).not.toBeNull();
    expect(
      controllerless(restored!),
      "the load left NPCs without a controller — they will never act again",
    ).toBe(0);
    expect(game.m_Player).not.toBeNull();
    expect(game.m_Player.isPlayer).toBe(true);
  }, 120_000);
});
