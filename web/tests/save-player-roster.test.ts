/**
 * The save format carries a *roster*, not one player.
 *
 * `plans/MULTIPLAYER_PLAN.md` §8 Phase 1 names this as half of its gate:
 *
 * > **Gate:** a two-player headless run survives 50 turns, and the two-player save
 * > round-trips through the existing bijection test.
 *
 * This file is that second half, in isolation. The first half is Phase 1's later
 * slices — `m_Player` is still one field, so a second player does not yet *act* as
 * one. What is settled here is the narrower and prior question: **can a save name
 * two players and restore both?** If it cannot, nothing above it can.
 *
 * ## What was wrong
 *
 * `Session.writeGraph` recorded `findPlayerActor(currentMap)` — the **first**
 * player-controlled actor on the **one** map the session calls current. Two
 * consequences, both silent:
 *
 * - With two players on one map, the second was never written. The save was
 *   well-formed, loaded cleanly, and came back with one player. Nothing threw.
 * - With two players in two districts — the case turn-passing exists for — the
 *   second was not even *looked for*, because `currentMap` cannot see it.
 *
 * `_controller` is `{ kind: "skip" }` in the graph spec, so a restored actor has no
 * controller at all and `isPlayer` is false until one is attached. A player missing
 * from the save is therefore not merely un-driven: it comes back as an ordinary NPC,
 * indistinguishable from one that was never a player. That is the failure mode this
 * test is built to make loud.
 *
 * ## Why there is no `GRAPH_VERSION` bump
 *
 * The plan asks for one. It is declined, and the reason is already written down in
 * this codebase for the same shape of change — `Session.armyHelicopterRescueMap`:
 *
 * > a `Map` in the save root would need a new entry in the hand-written graph spec
 * > and a `GRAPH_VERSION` bump to refuse older saves, and the pair below rides in
 * > the root's plain JSON where **an absent key is simply a default — an old save
 * > restores with no rescue site, which is what it had.**
 *
 * Bumping to 2 would refuse **every existing single-player save** to distinguish
 * two formats that are byte-identical when there is one player — and multiplayer
 * does not exist yet, so there is no save a bump would protect. So `players` is
 * additive and the migration is one `?? [player]` on read, which
 * `reads a save with no players key` pins from both sides.
 *
 * The bump is not deferred forever: it becomes correct the moment the format has a
 * state an old build would *misread* rather than merely lack. That is a question
 * about the second player's map and turn cursor, not about the roster.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Session } from "@engine/Session";
import { Actor } from "@data/Actor";
import { Point } from "@engine/Point";
import { PlayerController } from "@data/PlayerController";
import type { World } from "@data/World";
import type { Map as GameMap } from "@data/Map";
import {
  findPlayerActors,
  readSessionGraph,
  reattachPlayers,
  writeSessionGraph,
  type LoadedGraph,
} from "@engine/serialization/sessionGraphRoot";

const SEED = 24680;
const SETTLE_TURNS = 10;

let session: Session;
let world: World;
let map: GameMap;
let playerA: Actor;

/** Write and read the whole world back, the way `Session.save`/`load` do. */
function roundTrip(): LoadedGraph {
  return readSessionGraph(
    writeSessionGraph(
      world,
      map,
      session.scoring,
      session,
      playerA,
      session.worldTime.turnCounter,
      findPlayerActors(world),
    ),
  );
}

/** Add a second player-controlled actor to `target`, and return it. */
function addSecondPlayer(target: GameMap): Actor {
  let spot: Point | null = null;
  outer: for (let y = 1; y < target.height - 1 && spot === null; y++) {
    for (let x = 1; x < target.width - 1; x++) {
      const p = new Point(x, y);
      if (target.getActorAtPoint(p) === null) {
        spot = p;
        break outer;
      }
    }
  }
  if (spot === null) throw new Error("no free tile for the second player");

  const b = new Actor(playerA.model, playerA.faction, "survivor");
  target.placeActor(b, spot);
  b.controller = new PlayerController();
  return b;
}

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  await runner.run({ worldSize: 1, maxTurns: SETTLE_TURNS, bot: true });
  session = Session.get();
  world = session.world!;
  map = session.currentMap!;
  playerA = session.loadedPlayer ?? runner.rogueGame.player!;
}, 120_000);

describe("a save names every player, not just the first", () => {
  it("round-trips two players on one map", () => {
    const playerB = addSecondPlayer(map);
    expect(findPlayerActors(world).length, "two players before the save").toBe(2);

    const loaded = roundTrip();

    expect(loaded.players.length, "two players came back").toBe(2);

    // Controllers are not in the graph, so both arrive as ordinary NPCs until
    // reattached — and that is exactly why the roster has to name them here.
    for (const p of loaded.players) {
      expect(p.controller, "a restored actor has no controller yet").toBeNull();
      expect(p.isPlayer, "…so it is not a player yet").toBe(false);
    }

    reattachPlayers(loaded.players);
    expect(
      loaded.players.every((p) => p.isPlayer),
      "every restored player is a player again",
    ).toBe(true);

    // The pair must be the *same two actors* — a roster of two actors that are
    // both copies of player A would satisfy the length check above.
    const aName = playerA.theName;
    expect(
      loaded.players.map((p) => p.theName).sort(),
      "the two players are the two that were saved, not two copies of one",
    ).toEqual([aName, playerB.theName].sort());
  });

  it("finds a player who is not on the current map", () => {
    // The case a `currentMap` scan cannot see at all, and the reason
    // `findPlayerActors` walks the world. Two players in two districts is
    // turn-passing's whole reason for existing.
    //
    // Built by hand rather than by moving an actor, because moving one across maps
    // is not something the game can do: `Location` is a map reference plus a
    // position and there is no API that rewrites it mid-game. The claim under test
    // is about the *scan*, so the scan is what is arranged.
    const other = world.getDistrict(1, 0)?.maps[0];
    expect(other, "a second district exists to put a player in").toBeTruthy();
    expect(other, "…and it is a different map").not.toBe(map);

    const b = new Actor(playerA.model, playerA.faction, "survivor");
    other!.placeActor(b, new Point(2, 2));
    b.controller = new PlayerController();

    try {
      const found = findPlayerActors(world);
      expect(
        found.some((p) => p === b),
        "a player on another map is found by the world scan",
      ).toBe(true);

      const loaded = roundTrip();
      reattachPlayers(loaded.players);
      expect(
        loaded.players.some((p) => p.theName === b.theName && p.isPlayer),
        "and survives the round-trip as a player",
      ).toBe(true);
    } finally {
      // Leave the shared world as it was found: this file's other cases assert
      // exact counts, and a leaked third player would make them lie.
      other!.removeActor(b);
      b.controller = null;
    }
  });

  it("still records the single player for a one-player world", () => {
    // The additive key must not have cost the old one. `player` is what
    // `RefreshPlayer` and every single-player caller read.
    const loaded = roundTrip();
    expect(loaded.player, "the singular ref is still there").not.toBeNull();
    expect(
      loaded.players.includes(loaded.player!),
      "and it is the first entry of the roster",
    ).toBe(true);
  });

  it("reads a save with no players key as a one-player roster", () => {
    // The migration, pinned from both sides. This is the shape of every save
    // written before this change, and the whole reason there is no version bump.
    const data = writeSessionGraph(
      world,
      map,
      session.scoring,
      session,
      playerA,
      session.worldTime.turnCounter,
      findPlayerActors(world),
    );

    // Strip the key the way a pre-`players` save simply lacks it.
    const stripped = {
      ...data,
      root: Object.fromEntries(
        Object.entries(data.root as Record<string, unknown>).filter(
          ([k]) => k !== "players",
        ),
      ),
    } as typeof data;

    const loaded = readSessionGraph(stripped);

    expect(
      Object.prototype.hasOwnProperty.call(stripped.root as object, "players"),
      "the fixture really has no players key, or this test proves nothing",
    ).toBe(false);
    expect(loaded.player, "the old key still resolves on its own").not.toBeNull();
    expect(
      loaded.players.length,
      "and the roster is reconstructed from it rather than empty",
    ).toBe(1);
    expect(loaded.players[0], "…as the same actor").toBe(loaded.player);
  });

  it("honours an explicitly empty roster rather than resurrecting the player", () => {
    // The other side of the same line. A writer that recorded *no* players meant
    // it, and `?? [player]` must not paper over that — otherwise a save from a
    // game where every player died would come back with one alive.
    const data = writeSessionGraph(
      world,
      map,
      session.scoring,
      session,
      playerA,
      session.worldTime.turnCounter,
      findPlayerActors(world),
    );

    const emptied = {
      ...data,
      root: { ...(data.root as Record<string, unknown>), players: [] },
    } as typeof data;

    const loaded = readSessionGraph(emptied);
    expect(loaded.players.length, "an empty roster reads as empty").toBe(0);
    // `player` is untouched, so `loadedPlayer` still answers — which is why this
    // is a shape decision and not a claim that the singular ref goes away.
    expect(loaded.player, "the singular ref is independent of the roster").not.toBeNull();
  });
});
