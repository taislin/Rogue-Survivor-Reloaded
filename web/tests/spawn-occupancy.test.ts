import { describe, it, expect, beforeAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Point } from "@engine/Point";
import { ActorID } from "@gameplay/GameActors";
import { TileID } from "@gameplay/GameTiles";
import { FactionID } from "@gameplay/GameFactions";

/**
 * The spawners must not place an actor on an occupied tile.
 *
 * C# has no such check: `SpawnActorOnMapBorder` and `SpawnActorNear` test only
 * `IsWalkableFor`, which looks at the tile *model*, not at who is standing
 * there. The chosen tile is then handed to `Map.PlaceActorAt`, which throws
 * `"another actor already at position"` (Map.cs:488) — and the throw escapes
 * world generation, ending the run. §1.2a records it happening on any survivor
 * run past turn 720.
 *
 * Corrected in the port rather than in `src/`, which stays the untouched
 * reference: a spawner that can crash the game is an upstream bug, and the port
 * may outgrow it. Every other rejection in these loops already `continue`s, so
 * an occupied tile is just one more reason to try the next candidate.
 *
 * The test makes the situation impossible to miss by construction: a small map
 * with *every* tile occupied, so all `4 * (width + height)` candidates are
 * rejected. Before the fix this threw on the first one.
 */

const WIDTH = 6;
const HEIGHT = 6;

let game: RogueGame;

beforeAll(async () => {
  const runner = new HeadlessRunner(31337, new NullRogueUI());
  game = runner.rogueGame;
  await game.LoadData();
  // One turn is enough: this needs a live `Rules` and a session, not a played
  // world, and a full `StartNewGame` would cost seconds for nothing.
  await runner.run({ worldSize: 1, maxTurns: 1, isUndead: true, bot: false });
}, 120_000);

/** A small all-floor map, with every tile occupied by an actor. */
function fullyOccupiedMap(): { map: GameMap; occupants: Actor[] } {
  const map = new GameMap(1234, "spawner test", WIDTH, HEIGHT);
  const floor = Models.tiles.get(TileID.FLOOR_CONCRETE);
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < HEIGHT; y++) map.setTileModelAt(x, y, floor);
  }

  const actorModel = Models.actors.get(ActorID.UNDEAD_ZOMBIE);
  const faction: Faction = Models.factions.get(FactionID.TheUndeads);
  const occupants: Actor[] = [];
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < HEIGHT; y++) {
      const actor = actorModel.createAnonymous(faction, 0);
      map.placeActor(actor, new Point(x, y));
      occupants.push(actor);
    }
  }
  return { map, occupants };
}

/** An actor not yet on any map, to spawn. */
function freshActor(): Actor {
  const actorModel = Models.actors.get(ActorID.UNDEAD_ZOMBIE);
  return actorModel.createAnonymous(Models.factions.get(FactionID.TheUndeads), 0);
}

describe("spawning onto an occupied tile", () => {
  it("SpawnActorNear gives up instead of throwing", () => {
    const { map } = fullyOccupiedMap();
    const spawned = game.SpawnActorNear(map, freshActor(), 0, new Point(2, 2), 0);
    // The point is that this returns at all: C# would have thrown
    // "another actor already at position" from Map.placeActor on the first try.
    expect(spawned).toBe(false);
    expect(map.actors.length).toBe(WIDTH * HEIGHT);
  });

  it("SpawnActorOnMapBorder gives up instead of throwing", () => {
    const { map } = fullyOccupiedMap();
    const spawned = game.SpawnActorOnMapBorder(map, freshActor(), 0, false);
    expect(spawned).toBe(false);
    expect(map.actors.length).toBe(WIDTH * HEIGHT);
  });

  it("still spawns on a free tile", () => {
    // The control: the occupancy check must reject only occupied tiles, or the
    // spawners would silently stop working. One tile is left empty.
    const map = new GameMap(1234, "spawner control", WIDTH, HEIGHT);
    const floor = Models.tiles.get(TileID.FLOOR_CONCRETE);
    for (let x = 0; x < WIDTH; x++) {
      for (let y = 0; y < HEIGHT; y++) map.setTileModelAt(x, y, floor);
    }
    const actorModel = Models.actors.get(ActorID.UNDEAD_ZOMBIE);
    const faction = Models.factions.get(FactionID.TheUndeads);
    for (let x = 0; x < WIDTH; x++) {
      for (let y = 0; y < HEIGHT; y++) {
        if (x === 3 && y === 3) continue; // the one free tile
        map.placeActor(actorModel.createAnonymous(faction, 0), new Point(x, y));
      }
    }

    const spawned = game.SpawnActorNear(map, freshActor(), 0, new Point(3, 3), 0);
    expect(spawned).toBe(true);
    expect(map.actors.length).toBe(WIDTH * HEIGHT);
  });
});
