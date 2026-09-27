import { describe, it, expect, beforeAll, vi } from "vitest";
import { Map as GameMap, Lighting, Exit } from "@data/Map";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Color } from "@engine/Color";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

/**
 * `Map.isOnMapBorder` and `Map.isMapBoundary` are one character apart in the C#
 * and mean opposite things, and confusing them costs you the district-exit
 * labels without any error.
 *
 * The C# is unambiguous once you see it side by side (src/Data/Map.cs:308-316):
 *
 *   IsMapBoundary  ->  x == -1 || x == Width  || y == -1 || y == Height   (outside)
 *   IsOnMapBorder  ->  x == 0  || x == Width-1|| y == 0  || y == Height-1  (inside)
 *
 * `DrawMap` walks the *view rect*, which overhangs the map, and uses the
 * outside ring to decide whether to draw an exit marker — because exits are
 * stored one tile beyond the edge. The port called `isOnMapBorder` there. In
 * the `else` branch the coordinate is by definition out of bounds, and
 * `isOnMapBorder` is false for every out-of-bounds coordinate except the two
 * corners, so `DrawExit` ran almost never and the "EXIT" labels never appeared.
 *
 * This is invisible in every other sense: no throw, no wrong number, the map
 * still draws, and a headless run stays green because the headless UI drops
 * painting entirely.
 */

const tiles = new GameTiles();

function newMap(width = 10, height = 8): GameMap {
  const map = new GameMap(1234, "border test", width, height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) map.setTileModelAt(x, y, tiles.get(TileID.FLOOR_CONCRETE));
  }
  map.lighting = Lighting.LIT;
  return map;
}

describe("the two border rings are not the same ring", () => {
  it("isMapBoundary is the ring just outside the map", () => {
    const map = newMap();
    expect(map.isMapBoundary(-1, 4)).toBe(true);
    expect(map.isMapBoundary(10, 4)).toBe(true);
    expect(map.isMapBoundary(4, -1)).toBe(true);
    expect(map.isMapBoundary(4, 8)).toBe(true);
  });

  it("isOnMapBorder is the edge tiles, which are in bounds", () => {
    const map = newMap();
    expect(map.isOnMapBorder(0, 4)).toBe(true);
    expect(map.isOnMapBorder(9, 4)).toBe(true);
    expect(map.isOnMapBorder(4, 0)).toBe(true);
    expect(map.isOnMapBorder(4, 7)).toBe(true);
  });

  it("the rings overlap in exactly the eight coordinates around the corners", () => {
    // Not disjoint, and the overlap is not an accident: (-1, 0) is outside the
    // map *and* level with the top edge, so it satisfies both tests. Two per
    // corner, which is why the old code drew the odd corner-adjacent exit and
    // nothing else -- and why a "must be false everywhere" claim would have
    // been wrong.
    const map = newMap();
    const overlap: string[] = [];
    for (let x = -3; x <= 12; x++) {
      for (let y = -3; y <= 10; y++) {
        if (map.isMapBoundary(x, y) && map.isOnMapBorder(x, y)) overlap.push(`${x},${y}`);
      }
    }
    expect(overlap.sort()).toEqual(
      ["-1,0", "-1,7", "0,-1", "0,8", "9,-1", "9,8", "10,0", "10,7"].sort()
    );
  });

  it("the outside ring is exactly the four lines adjacent to the map", () => {
    const map = newMap();
    // Built as a set, because the four lines cross at four points and those
    // must be counted once each.
    const expected = new Set<string>();
    for (let y = -3; y <= 10; y++) {
      expected.add(`-1,${y}`);
      expected.add(`10,${y}`);
    }
    for (let x = -3; x <= 12; x++) {
      expected.add(`${x},-1`);
      expected.add(`${x},8`);
    }
    const actual: string[] = [];
    for (let x = -3; x <= 12; x++) {
      for (let y = -3; y <= 10; y++) {
        if (map.isMapBoundary(x, y)) actual.push(`${x},${y}`);
      }
    }
    expect(actual.sort()).toEqual([...expected].sort());
  });

  it("isMapBoundary is false for in-bounds tiles, including the edges", () => {
    const map = newMap();
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 8; y++) {
        expect(map.isMapBoundary(x, y), `(${x},${y}) is in bounds`).toBe(false);
      }
    }
  });

  it("isOnMapBorder is false for out-of-bounds coordinates, including exits", () => {
    // The regression itself: an exit lives at (-1, 4), and the old DrawMap test
    // returned false for exactly that, so the label was never drawn.
    const map = newMap();
    expect(map.isOnMapBorder(-1, 4)).toBe(false);
    expect(map.isOnMapBorder(10, 4)).toBe(false);
    expect(map.isOnMapBorder(4, -1)).toBe(false);
    expect(map.isOnMapBorder(4, 8)).toBe(false);
  });
});

describe("exits are found on the outside ring", () => {
  it("an exit one tile outside the edge is discoverable by the DrawMap test", () => {
    const map = newMap();
    const exitAt = new Point(-1, 4);
    // This is the exact condition DrawMap uses, lifted from RogueGame.ts:15309.
    const wouldDraw = !map.isInBounds(exitAt.x, exitAt.y) && map.isMapBoundary(exitAt.x, exitAt.y);
    expect(wouldDraw).toBe(true);
  });

  it("the old condition would have missed that same exit", () => {
    const map = newMap();
    const exitAt = new Point(-1, 4);
    const wouldHaveDrawn =
      !map.isInBounds(exitAt.x, exitAt.y) && map.isOnMapBorder(exitAt.x, exitAt.y);
    expect(wouldHaveDrawn).toBe(false);
  });

  it("a tile inside the map is never mistaken for a boundary exit", () => {
    const map = newMap();
    for (const p of [new Point(0, 0), new Point(9, 7), new Point(5, 3)]) {
      expect(map.isMapBoundary(p.x, p.y)).toBe(false);
    }
  });
});

/**
 * The tests above pin the two predicates. They do NOT pin the bug, because the
 * bug was never in a predicate -- both were correct -- it was `DrawMap` calling
 * the wrong one. Verified by reverting the fix and watching all of them stay
 * green.
 *
 * So this drives the real thing: a started game, an exit planted on the outside
 * ring, and a spy on `DrawExit` to see whether the label actually gets drawn.
 * It costs a world generation, which is why there is one of these rather than
 * one per ring.
 */
describe("DrawMap actually draws the label for a boundary exit", () => {
  let game: HeadlessRunner["rogueGame"];
  let map: GameMap;

  beforeAll(async () => {
    const runner = new HeadlessRunner(4242);
    const metrics = await runner.run({ worldSize: 1, maxTurns: 1, isUndead: true, bot: false });
    expect(metrics.error, "world generation threw").toBeUndefined();
    game = runner.rogueGame;
    map = game.player!.location.map!;
  }, 120_000);

  /** Centre the view on a map position and draw, reporting whether the label went out. */
  function drawMapCentredOn(pos: Point): boolean {
    game.m_MapViewRect = new Rect(pos.x, pos.y, 1, 1);
    const spy = vi.spyOn(game, "DrawExit");
    try {
      game.DrawMap(map, Color.White);
      return spy.mock.calls.length > 0;
    } finally {
      spy.mockRestore();
    }
  }

  it("draws the label for an exit on the outside ring", () => {
    const exitPos = new Point(map.width, 12);
    map.addExit(exitPos, new Exit(map, new Point(3, 3)));
    expect(map.getExitAt(exitPos)).not.toBeNull();
    expect(drawMapCentredOn(exitPos), "DrawExit was never called for a boundary exit").toBe(true);
  });

  it("does not invent a label where there is no exit", () => {
    expect(drawMapCentredOn(new Point(map.width, 40))).toBe(false);
  });
});
