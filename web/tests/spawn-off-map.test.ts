import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Actor } from "@data/Actor";
import { Point } from "@engine/Point";
import { ActorID } from "@gameplay/GameActors";
import { TileID } from "@gameplay/GameTiles";
import { FactionID } from "@gameplay/GameFactions";

/**
 * `SpawnActorNear` must not dereference a tile it does not have.
 *
 * It builds each candidate as `nearPoint +/- roll(1, maxDistToPoint + 1)`, and
 * every caller passes the position of a leader just placed by
 * `SpawnActorOnMapBorder` -- a tile on x=0, y=0, width-1 or height-1. A signed
 * offset off a border tile goes negative (or past the far edge) easily, and
 * `Map.getTileAt` answers `null` outside the grid (`Map.ts:303`). The port
 * asserted non-null and read `.isInside` straight through it, so a routine
 * candidate threw `TypeError: Cannot read properties of null (reading
 * 'isInside')` out of `FireEvent_BikersRaid` and killed the turn:
 *
 *     SpawnActorNear (RogueGame.ts:7568) <- SpawnNewBiker (RogueGame.ts:7781)
 *     <- FireEvent_BikersRaid (RogueGame.ts:6872) <- advancePlayDistrict
 *
 * C# has the same shape and the same hole -- `getTileAt` there returns `null`
 * for an out-of-bounds coordinate too, and `SpawnActorNear` reads `.isInside`
 * on it -- so this is an upstream crash, corrected in the port for the same
 * reason as the occupied-tile fix in `spawn-occupancy.test.ts`: no tile means no
 * spawn, which is one more reason for the retry loop to try the next candidate.
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

/** A small map of plain walkable floor, no actors. */
function emptyFloorMap(name: string): GameMap {
  const map = new GameMap(1234, name, WIDTH, HEIGHT);
  const floor = Models.tiles.get(TileID.FLOOR_CONCRETE);
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < HEIGHT; y++) map.setTileModelAt(x, y, floor);
  }
  return map;
}

/** An actor not yet on any map, to spawn. */
function freshActor(): Actor {
  const actorModel = Models.actors.get(ActorID.UNDEAD_ZOMBIE);
  return actorModel.createAnonymous(Models.factions.get(FactionID.TheUndeads), 0);
}

describe("SpawnActorNear candidate off the map", () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * Forces every candidate off the map, deterministically.
   *
   * `SpawnActorNear` draws four rolls per try -- `r1, r2` for x and `r3, r4` for
   * y, each candidate coordinate being `nearPoint + r_first - r_second`.
   * Alternating 1, 4, 1, 4 makes every coordinate `nearPoint - 3`, so a
   * `nearPoint` on the border puts all `4 * (width + height)` tries outside the
   * grid no matter what the seed is. Left to chance this only fails the old code
   * three tries in four, which is a regression test that mostly passes on the
   * bug it exists to catch.
   */
  function forceCandidatesOffMap(): void {
    let call = 0;
    vi.spyOn(game.m_Rules, "roll").mockImplementation(() =>
      ++call % 2 === 1 ? 1 : 4,
    );
  }

  it("gives up instead of dereferencing a null tile", () => {
    const map = emptyFloorMap("spawner off-map");
    // A biker raid leader's tile: on the map border, which is what every caller
    // passes as `nearPoint`.
    forceCandidatesOffMap();

    const spawned = game.SpawnActorNear(map, freshActor(), 0, new Point(0, 0), 3);
    // The point is that this returns at all: before the fix the first try threw
    // `TypeError: Cannot read properties of null (reading 'isInside')`.
    expect(spawned).toBe(false);
    expect(map.actors.length).toBe(0);
  });

  it("still spawns a squad member next to a border leader", () => {
    // The control: off-map candidates must be rejected without also rejecting
    // the on-map ones, or every raid would silently lose its squad. Roughly half
    // of the candidates from a border tile are off the map, so the retry loop
    // has plenty of room; this asserts it finds one.
    const map = emptyFloorMap("spawner border leader");
    const nearPoint = new Point(0, 0);

    expect(game.SpawnActorNear(map, freshActor(), 0, nearPoint, 3)).toBe(true);

    const placed = map.actors[0].location.position;
    expect(map.isInBoundsPoint(placed)).toBe(true);
    expect(placed.x).toBeLessThanOrEqual(3);
    expect(placed.y).toBeLessThanOrEqual(3);
  });

  it("SpawnActorOnMapBorder needs no such guard", () => {
    // The control for the fix's blast radius: that spawner draws its candidate
    // from `0`, `width - 1` or `rollX/rollY(map)`, so it is always in bounds and
    // its existing `!` is sound. This pins the asymmetry, so a future refactor
    // that unifies the two loops does not silently reintroduce the null.
    const map = emptyFloorMap("spawner border control");
    expect(game.SpawnActorOnMapBorder(map, freshActor(), 0, false)).toBe(true);
    expect(map.isInBoundsPoint(map.actors[0].location.position)).toBe(true);
  });
});
