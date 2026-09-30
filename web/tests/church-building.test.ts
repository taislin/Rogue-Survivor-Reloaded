import { describe, it, expect, afterEach, vi } from "vitest";
import { Map as GameMap } from "@data/Map";
import { MapObject } from "@data/MapObject";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";
import { makeChurchBuilding } from "@gameplay/generators/buildings/makeChurchBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";

/**
 * `Feature.Church`: `MakeChurchBuilding`, C# `BaseTownGenerator.cs:2187-2385`.
 *
 * Four things a diff of the generator cannot show, in the order they would bite:
 *
 * 1. **The dispatch reaches it.** A building wired to nothing and a building
 *    wired to the registry look the same in review. `BaseTownGenerator`'s
 *    church stage is counted from a subclass, so "the seam is live" is measured
 *    rather than assumed.
 * 2. **The room it builds is a room.** Walls on `buildingRect`, a door, and a
 *    nave you can walk to the far wall from. A church whose door ended up in a
 *    wall that the pews had already filled would still be a plausible-looking
 *    district.
 * 3. **Nothing here runs under Classic**, *and nothing here spends a dice roll*
 *    under Classic. The second half is the one that matters: "no church zone"
 *    is also what a church that rolled 10% and lost would produce. So the
 *    Classic district is compared against a generator whose church stage is
 *    deleted outright -- the feature genuinely absent rather than merely gated
 *    off -- and the two layouts have to be identical.
 * 4. **The furniture is the C#'s.** The four door arms, the pews-and-carpet
 *    geometry, the antique-weapon table. Written against a scripted roller and
 *    a hand-made block so the expectations do not depend on how many blocks a
 *    given seed happens to cut, which unrelated generator work would change.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on
// construction, and the church reaches four of them: tiles, items for the CHAR
// book and the antique weapons, factions and actors for the housing pass that
// runs over the blocks a church did not take.
new GameTiles();
new GameActors();
new GameItems();
new GameFactions();

function newParams(): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = 40;
  params.mapHeight = 40;
  return params;
}

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/** Counts the dispatch calls, so "the seam is live" is measured. */
class ChurchSpy extends BaseTownGenerator {
  churchStageCalls = 0;

  protected override makeChurchBuildings(map: GameMap, emptyBlocks: Block[]): void {
    ++this.churchStageCalls;
    super.makeChurchBuildings(map, emptyBlocks);
  }
}

/**
 * A generator with the feature *removed*, not merely gated off: the stage is
 * overridden away, so no roll is taken and no building is built. A Classic
 * district from this must be identical to a Classic district from the real class,
 * and the only way that can fail is something in the stage running anyway.
 */
class NoChurches extends BaseTownGenerator {
  protected override makeChurchBuildings(): void {
    // no roll, no build
  }
}

function newSpy(params = newParams()): ChurchSpy {
  return new ChurchSpy({ rules, ApplyOnFire: () => undefined } as never, params);
}

function newNoChurches(params = newParams()): NoChurches {
  return new NoChurches({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A real `TownBuildingContext`, captured off the live dispatch. It has thirty-one
 * members and is not something a test should hand-assemble; capturing it also
 * proves the primitives a building is handed are the generator's own.
 */
function capturedContext(): TownBuildingContext {
  let captured: TownBuildingContext | null = null;
  TOWN_BUILDING_PASSES.push({
    csharpName: "CaptureChurchContext",
    tryBuild: (ctx) => {
      captured ??= ctx;
      return false;
    },
  });
  try {
    newGenerator().generate(7);
  } finally {
    TOWN_BUILDING_PASSES.length = 0;
  }
  expect(captured, "the registry was reached, so a context exists").not.toBeNull();
  return captured as unknown as TownBuildingContext;
}

/**
 * A roller that answers from a script, so a test can say which arm of the method
 * it wants and which antique weapon comes out, without depending on a seed.
 * The building only ever asks for `roll` and `rollChance`.
 */
class ScriptedRoller {
  // Copied rather than held, so a script can be passed as a `readonly` literal
  // and still be consumed one entry per call.
  private readonly rolls: number[];
  private readonly chances: boolean[];

  constructor(rolls: readonly number[] = [], chances: readonly boolean[] = []) {
    this.rolls = [...rolls];
    this.chances = [...chances];
  }

  roll(min: number, _max: number): number {
    return this.rolls.length > 0 ? (this.rolls.shift() as number) : min;
  }

  rollChance(_chance: number): boolean {
    return this.chances.length > 0 ? this.chances.shift() === true : false;
  }

  asRoller(): DiceRoller {
    return this as unknown as DiceRoller;
  }
}

/** A fresh map and a context pointed at it, with a scripted roller. */
function churchFixture(
  base: TownBuildingContext,
  rect: Rect,
  rolls: readonly number[] = [],
  chances: readonly boolean[] = []
): { map: GameMap; ctx: TownBuildingContext; block: Block } {
  const map = new GameMap(11, "church", 40, 40);
  const block = new Block(rect);
  return {
    map,
    block,
    ctx: { ...base, map, block, roller: new ScriptedRoller(rolls, chances).asRoller() },
  };
}

const BASE = capturedContext();

/** Tile ids of every tile in a rect, row by row, as a flat list. */
function tileIds(map: GameMap, rect: Rect): number[] {
  const out: number[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) out.push(map.getTileAt(x, y)!.model.id);
  }
  return out;
}

/** The one tile of `buildingRect` holding a door. C# places exactly one. */
function doorTile(map: GameMap, buildingRect: Rect): Point {
  const found: Point[] = [];
  for (let x = buildingRect.left; x < buildingRect.right; x++) {
    for (let y = buildingRect.top; y < buildingRect.bottom; y++) {
      if (map.getMapObjectAt(x, y) instanceof DoorWindow) found.push(new Point(x, y));
    }
  }
  expect(found, "exactly one door").toHaveLength(1);
  return found[0];
}

/** Walkable `insideRect` tiles reachable from `from` in four steps. */
function reachable(map: GameMap, rect: Rect, from: Point): Set<string> {
  const key = (x: number, y: number): string => `${x},${y}`;
  const seen = new Set<string>();
  const queue: Point[] = [from];
  seen.add(key(from.x, from.y));
  while (queue.length > 0) {
    const p = queue.shift() as Point;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue;
      if (seen.has(key(x, y))) continue;
      if (!map.isWalkable(x, y)) continue;
      seen.add(key(x, y));
      queue.push(new Point(x, y));
    }
  }
  return seen;
}

/** A tile's decorations, `null` and `[]` both meaning none. */
function decorationsAt(map: GameMap, x: number, y: number): string[] {
  return [...(map.getTileAt(x, y)?.getDecorations ?? [])];
}

function walkableIn(map: GameMap, rect: Rect): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      if (map.isWalkable(x, y)) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

/** Zones with their bounds, sorted, so two maps compare without order noise. */
function zoneNames(map: GameMap): string[] {
  return map.zones
    .map((z) => `${z.name}@${z.bounds.left},${z.bounds.top},${z.bounds.width},${z.bounds.height}`)
    .sort();
}

/** Every tile model id and object image, as one comparable string. */
function layout(map: GameMap): string {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      out.push(`${map.getTileAt(x, y)!.model.id}/${obj ? obj.imageId : "-"}`);
    }
  }
  return out.join(",");
}

/**
 * How many dice the generation spent. `DiceRoller.rollChance` delegates to
 * `roll`, so this counts both -- which is the point: "took a roll and threw it
 * away" and "took no roll" must be distinguishable, and only a counter can tell.
 */
function rollsTaken(generate: () => GameMap): number {
  const spy = vi.spyOn(DiceRoller.prototype, "roll");
  try {
    generate();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

function churchZones(map: GameMap): string[] {
  return map.zones.map((z) => z.name).filter((n) => n.startsWith("Church@"));
}

afterEach(() => {
  // This file pushes a capture pass; nothing else may survive it.
  TOWN_BUILDING_PASSES.length = 0;
});

/** The first `count` district seeds under `ruleset`, as one sweep. */
function sweep(ruleset: Ruleset, count = 20): GameMap[] {
  Session.get().ruleset = ruleset;
  const maps: GameMap[] = [];
  for (let seed = 1; seed <= count; seed++) maps.push(newGenerator().generate(seed));
  return maps;
}

describe("Feature.Church: the dispatch reaches the generator", () => {
  it("runs the church stage, and a district gets a church", () => {
    // The stage is reached from `generate()`, counted rather than assumed: a
    // church generator wired to nothing compiles, looks right, and does nothing.
    const spy = newSpy();
    spy.generate(1);
    expect(spy.churchStageCalls, "generate() ran the church stage once").toBe(1);

    // And a church on some district. A 10% chance per block means most seeds get
    // none, so the sweep is what makes this robust to a change in how many blocks
    // a 40x40 city cuts.
    const withChurch = sweep(Ruleset.STILL_ALIVE).filter((m) => churchZones(m).length > 0);
    expect(withChurch.length, "at least one of twenty seeds built a church").toBeGreaterThan(0);
    expect(withChurch[0].hasChurch, "and the map knows it has a church").toBe(true);
  });

  it("names every zone with the C#'s MakeUniqueZone formula, and adds that block's walkways", () => {
    for (const map of sweep(Ruleset.STILL_ALIVE)) {
      for (const name of churchZones(map)) {
        // C# `:2377-2378`: `MakeUniqueZone("Church", b.BuildingRect)`, and
        // `makeUniqueZone` (BaseMapGenerator.ts:1592) is
        // `${basename}@${left + floor(width/2)}-${top + floor(height/2)}`.
        expect(name).toMatch(/^Church@[0-9]+-[0-9]+$/);
        const b = map.zones.find((z) => z.name === name)!.bounds;
        expect(name).toBe(`Church@${b.left + Math.floor(b.width / 2)}-${b.top + Math.floor(b.height / 2)}`);
        // The four walkway strips the C# adds at `:2380`, around this block and
        // no other -- a whole map has one set per block, so the count only means
        // something scoped to the block.
        const outer = new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2);
        const within = (r: Rect): boolean =>
          r.left >= outer.left && r.top >= outer.top && r.right <= outer.right && r.bottom <= outer.bottom;
        expect(map.zones.filter((z) => z.name.startsWith("walkway@") && within(z.bounds))).toHaveLength(4);
      }
    }
  });

  it("gives two churches on one map two different zone names", () => {
    // "Unique" is the whole of what `MakeUniqueZone` adds over `AddZone`, and it
    // only shows up with two buildings, so two are built here rather than waited
    // for: a 10%-per-block district gets two maybe one seed in ten.
    const map = new GameMap(12, "two churches", 40, 40);
    const here = new Block(new Rect(2, 2, 13, 13));
    const there = new Block(new Rect(20, 20, 13, 13));
    expect(makeChurchBuilding({ ...BASE, map, block: here, roller: new ScriptedRoller([0], [true]).asRoller() })).toBe(true);
    expect(makeChurchBuilding({ ...BASE, map, block: there, roller: new ScriptedRoller([1], [false]).asRoller() })).toBe(true);

    const names = churchZones(map);
    expect(names).toHaveLength(2);
    expect(new Set(names).size, `names: ${names.join(", ")}`).toBe(2);
    // Each church demarks its own building rect, and nothing else.
    const zones = map.zones.filter((z) => z.name.startsWith("Church@"));
    expect(zones.map((z) => z.bounds.width)).toEqual([11, 11]);
  });
});

describe("Feature.Church: the suitability check", () => {
  it("declines a block whose inside is under 5x5, and writes nothing at all", () => {
    // C# `:2192`. A 6x6 block has a 4x4 inside: too small for a central alley
    // with a pew row on each side of it.
    for (const rect of [new Rect(4, 4, 6, 6), new Rect(4, 4, 4, 12), new Rect(4, 4, 12, 4)]) {
      const { map, ctx, block } = churchFixture(BASE, rect);
      const before = tileIds(map, block.rectangle);

      expect(makeChurchBuilding(ctx)).toBe(false);
      expect(tileIds(map, block.rectangle), "the block rectangle is untouched").toEqual(before);
      expect(map.zones).toHaveLength(0);
      expect(map.hasChurch).toBe(false);
    }
  });

  it("builds at exactly 5x5 inside, so the boundary is the C#'s", () => {
    const { map, ctx, block } = churchFixture(BASE, new Rect(4, 4, 9, 9));
    expect(block.insideRect.width).toBe(5);
    expect(block.insideRect.height).toBe(5);
    expect(makeChurchBuilding(ctx)).toBe(true);
    expect(churchZones(map)).toHaveLength(1);
  });
});

describe("Feature.Church: the room", () => {
  const rect = new Rect(4, 4, 13, 13);

  it("walls buildingRect, doors one tile of it, and floors the rest", () => {
    const { map, ctx, block } = churchFixture(BASE, rect);
    expect(makeChurchBuilding(ctx)).toBe(true);

    const wall = Models.tiles.get(TileID.WALL_LIGHT_BROWN)!.id;
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!.id;
    const planks = Models.tiles.get(TileID.FLOOR_PLANKS)!.id;
    const door = doorTile(map, block.buildingRect);

    for (let x = block.buildingRect.left; x < block.buildingRect.right; x++) {
      for (let y = block.buildingRect.top; y < block.buildingRect.bottom; y++) {
        const edge =
          x === block.buildingRect.left ||
          x === block.buildingRect.right - 1 ||
          y === block.buildingRect.top ||
          y === block.buildingRect.bottom - 1;
        if (!edge) continue;
        const isDoor = x === door.x && y === door.y;
        // The C# lays the walkway floor under the door (`:2270` and its three
        // twins), so the doorway is a gap in the wall, not a wall with a door on it.
        expect(map.getTileAt(x, y)!.model.id, `tile ${x},${y}`).toBe(isDoor ? walkway : wall);
      }
    }

    // The nave is planks, and indoors: `IsInside` is what makes it dark and
    // muffled, and it is the reason the floor fill at `:2200` has a decorator.
    for (let x = block.insideRect.left; x < block.insideRect.right; x++) {
      for (let y = block.insideRect.top; y < block.insideRect.bottom; y++) {
        const tile = map.getTileAt(x, y)!;
        if (tile.model.id !== planks) continue; // the carpet alley and the lectern's tile
        expect(tile.isInside, `tile ${x},${y} is inside`).toBe(true);
      }
    }
  });

  it("is not sealed: the door registers, and every walkable nave tile is reachable", () => {
    const { map, ctx, block } = churchFixture(BASE, rect);
    expect(makeChurchBuilding(ctx)).toBe(true);

    const door = doorTile(map, block.buildingRect);
    // A wooden door, as at `:2270`.
    expect(map.getMapObjectAt(door.x, door.y)!.imageId).toBe(GameImages.OBJ_WOODEN_DOOR_CLOSED);
    // `CountAdjDoors` is what `DecorateOutsideWalls` keys on (`:2370`), and it
    // sees the door from the wall tiles either side of it.
    expect(BASE.countAdjDoors(map, door.x - 1, door.y) + BASE.countAdjDoors(map, door.x + 1, door.y)).toBeGreaterThan(0);

    // The step just inside the door, then everything walkable in the nave.
    const inward =
      door.y === block.buildingRect.top
        ? new Point(door.x, door.y + 1)
        : door.y === block.buildingRect.bottom - 1
          ? new Point(door.x, door.y - 1)
          : door.x === block.buildingRect.left
            ? new Point(door.x + 1, door.y)
            : new Point(door.x - 1, door.y);
    expect(map.isWalkable(inward.x, inward.y), "the tile inside the door is walkable").toBe(true);

    const walkable = walkableIn(map, block.insideRect);
    expect(walkable.length, "the nave has open floor").toBeGreaterThan(0);
    const reached = reachable(map, block.insideRect, inward);
    // Every walkable tile reached, not just most of them: a pew row that closed
    // off the far half of the nave would still leave plenty reachable.
    expect([...reached].sort()).toEqual(walkable);
  });
});

describe("Feature.Church: the nave", () => {
  /**
   * The C#'s own geometry, recomputed here rather than read off the map, so what
   * is asserted is "the generator agrees with `:2206-2246`" and not "the
   * generator agrees with itself".
   *
   * `countAdjWalls` is deliberately *not* re-implemented: a tile the C# skipped
   * for touching a wall would be a tile this cannot predict, so the pews are
   * checked by where they are rather than counted against a total.
   */
  function naveGeometry(block: Block): { horizontal: boolean; central: number; carpet: string[]; pewLines: Set<number> } {
    const horizontal = block.rectangle.width >= block.rectangle.height;
    const carpet: string[] = [];
    const pewLines = new Set<number>();
    // `:2206-2225`: the alley rect is the inside rect shrunk by one column at
    // each end for an east-west nave, or by one row at each end for the other.
    // Only *one* axis is shrunk, so the other keeps the inside rect's extent.
    let startX = block.insideRect.left;
    let startY = block.insideRect.top;
    let endX = block.insideRect.right;
    let endY = block.insideRect.bottom;
    let central: number;
    if (horizontal) {
      ++startX;
      --endX;
      central = block.insideRect.left + Math.floor(block.insideRect.width / 2);
    } else {
      ++startY;
      --endY;
      central = block.insideRect.top + Math.floor(block.insideRect.height / 2);
    }
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        // `:2235` carpet on the central *column*, `:2241` on the central *row*.
        if (horizontal ? x === central : y === central) carpet.push(`${x},${y}`);
        // `:2234` and `:2240`: every other line along the nave, never the alley.
        else if (horizontal ? (y - startY) % 2 === 1 : (x - startX) % 2 === 1) pewLines.add(horizontal ? y : x);
      }
    }
    return { horizontal, central, carpet, pewLines };
  }

  it.each([
    ["east-west nave", new Rect(4, 4, 17, 11)],
    ["north-south nave", new Rect(4, 4, 11, 17)],
  ])("lays the C#'s pews and carpet for a %s", (_name, rect) => {
    const { map, ctx, block } = churchFixture(BASE, rect as Rect);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const { horizontal, central, carpet, pewLines } = naveGeometry(block);

    // The carpet: one column for an east-west nave, one row for the other, and
    // exactly the C#'s extent -- the lectern stands on one end of it, so that
    // tile is carpet *under* an object rather than bare.
    const carpetOnMap: string[] = [];
    for (let x = block.insideRect.left; x < block.insideRect.right; x++) {
      for (let y = block.insideRect.top; y < block.insideRect.bottom; y++) {
        if (map.getTileAt(x, y)!.model.id === Models.tiles.get(TileID.FLOOR_RED_CARPET)!.id) carpetOnMap.push(`${x},${y}`);
      }
    }
    expect(carpetOnMap.sort(), "the carpeted alley").toEqual(carpet.sort());

    // The pews: on one of the alternate lines, never on the alley, and never
    // outside the alley rect's extent (which is where the shrink shows up).
    let pewCount = 0;
    for (let x = block.insideRect.left; x < block.insideRect.right; x++) {
      for (let y = block.insideRect.top; y < block.insideRect.bottom; y++) {
        const obj = map.getMapObjectAt(x, y);
        if (obj === null || obj.imageId !== GameImages.OBJ_CHURCH_PEW) continue;
        ++pewCount;
        const line = horizontal ? y : x;
        const across = horizontal ? x : y;
        expect(pewLines.has(line), `pew at ${x},${y} is on a pew line`).toBe(true);
        expect(across, `pew at ${x},${y} is not in the alley`).not.toBe(central);
        // And the flag that makes a pew a pew: a bench you can sit on.
        expect(obj.isCouch, `pew at ${x},${y} is a couch`).toBe(true);
      }
    }
    expect(pewCount, `a nave this size gets ${pewCount} pews`).toBeGreaterThan(4);
  });
});

describe("Feature.Church: the door arms", () => {
  // C# `:2257-2362`. `midX` is the *rectangle's* centre, not the building
  // rect's, which is why a door can sit a tile off the centre of the nave.
  const wide = new Rect(4, 4, 17, 11);
  // `:2257` -- `b.Rectangle.Left + b.Rectangle.Width / 2`.
  const wideMidX = wide.left + Math.floor(wide.width / 2);
  // `Block.resetRectangle` insets the building rect by one all round.
  const wideTop = wide.top + 1;
  const wideBottom = wide.top + wide.height - 1; // exclusive

  const tall = new Rect(4, 4, 11, 17);
  // `:2258`.
  const tallMidY = tall.top + Math.floor(tall.height / 2);
  const tallLeft = tall.left + 1;
  const tallRight = tall.left + tall.width - 1; // exclusive

  it.each([
    // An east-west nave puts the door on a gable wall (`:2314`).
    // North: door at `(midX, BuildingRect.Top)` (`:2321`), lectern opposite.
    ["north", [true], new Point(wideMidX, wideTop), new Point(wideMidX, wideBottom - 2)],
    // South: door at `(midX, BuildingRect.Bottom - 1)` (`:2344`).
    ["south", [false], new Point(wideMidX, wideBottom - 1), new Point(wideMidX, wideTop + 1)],
  ])("an east-west nave with a %s door", (side, chances, door, lectern) => {
    const { map, ctx, block } = churchFixture(BASE, wide, [0], chances as boolean[]);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const d = doorTile(map, block.buildingRect);
    expect(new Point(d.x, d.y), `${side} door`).toEqual(door);
    expect(map.getMapObjectAt(lectern.x, lectern.y)?.imageId, `${side} lectern`).toBe(GameImages.OBJ_LECTERN);
  });

  it.each([
    // A north-south nave puts it on a long wall instead (`:2263`).
    // West: door at `(BuildingRect.Left, midY)` (`:2270`), lectern opposite.
    ["west", [true], new Point(tallLeft, tallMidY), new Point(tallRight - 2, tallMidY)],
    // East: door at `(BuildingRect.Right - 1, midY)` (`:2292`).
    ["east", [false], new Point(tallRight - 1, tallMidY), new Point(tallLeft + 1, tallMidY)],
  ])("a north-south nave with a %s door", (side, chances, door, lectern) => {
    const { map, ctx, block } = churchFixture(BASE, tall, [0], chances as boolean[]);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const d = doorTile(map, block.buildingRect);
    expect(new Point(d.x, d.y), `${side} door`).toEqual(door);
    expect(map.getMapObjectAt(lectern.x, lectern.y)?.imageId, `${side} lectern`).toBe(GameImages.OBJ_LECTERN);
  });

  it("hangs a painting one tile beyond each display case, and signs the wall by the door", () => {
    const { map, ctx } = churchFixture(BASE, wide, [3], [true]);
    expect(makeChurchBuilding(ctx)).toBe(true);

    // The north door's lectern, and the two cases flanking it across the nave.
    // The C# places the *east* one first (`:2329`) and the west one second
    // (`:2335`), which is the order the two antique-weapon rolls come off the
    // roller in -- the opposite sense to the long-wall arms, and the reason the
    // generator's `caseSigns` is a per-axis list.
    const lectern = new Point(wideMidX, wideBottom - 2);
    for (const sign of [1, -1]) {
      const at = new Point(lectern.x + sign, lectern.y);
      expect(map.getMapObjectAt(at.x, at.y)?.imageId, `case at ${at.x},${at.y}`).toBe(GameImages.OBJ_DISPLAY_CASE);
      // A container, or the weapon dropped in it is not reachable.
      expect(map.getMapObjectAt(at.x, at.y)?.isContainer, `case at ${at.x},${at.y} holds items`).toBe(true);
      // Two tiles out, so the hanging is on the wall the case stands against
      // rather than on the case (`:2333`).
      expect(decorationsAt(map, lectern.x + 2 * sign, lectern.y), `hanging at ${lectern.x + 2 * sign}`).toContain(
        GameImages.DECO_CHURCH_HANGING4
      );
    }

    // The church sign goes on the wall tiles either side of the door, which is
    // exactly what `map.GetMapObjectAt(x, y) == null && CountAdjDoors(...) >= 1`
    // selects (`:2370`) -- and *not* on the door tile, which has an object on it.
    const door = doorTile(map, new Rect(wide.left + 1, wideTop, wide.width - 2, wide.height - 2));
    expect(decorationsAt(map, door.x, door.y)).not.toContain(GameImages.DECO_CHURCH);
    const signed: Point[] = [];
    for (let x = wide.left + 1; x < wide.left + 1 + wide.width - 2; x++) {
      for (let y = wideTop; y < wideBottom; y++) {
        if (decorationsAt(map, x, y).includes(GameImages.DECO_CHURCH)) signed.push(new Point(x, y));
      }
    }
    expect(signed.length, `signs at ${signed.map((p) => `${p.x},${p.y}`).join(" ")}`).toBeGreaterThan(0);
    for (const at of signed) {
      expect(BASE.countAdjDoors(map, at.x, at.y), `sign at ${at.x},${at.y} is next to a door`).toBeGreaterThanOrEqual(1);
      expect(map.getMapObjectAt(at.x, at.y), `sign at ${at.x},${at.y} is on a bare wall`).toBeNull();
    }
  });
});

describe("Feature.Church: the lectern's book and the display cases' weapons", () => {
  const rect = new Rect(4, 4, 17, 11);
  const midX = rect.left + Math.floor(rect.width / 2);

  it("puts a CHAR book on the lectern", () => {
    // C# `:2275`, `MakeItemCHARBook()`. `chances: [true]` is the north door, so
    // the lectern is at `BuildingRect.Bottom - 2` (`:2324`).
    const { map, ctx, block } = churchFixture(BASE, rect, [0], [true]);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const lectern = new Point(midX, block.buildingRect.bottom - 2);
    const items = map.getItemsAt(lectern)?.items ?? [];
    expect(items.map((i) => i.model.id)).toEqual([ItemID.ENT_BOOK_CHAR]);
  });

  it.each([
    // The C#'s `Roll(0, 9)` case for case, `BaseMapGenerator.cs:2161-2176`.
    [0, ItemID.MELEE_FLAIL],
    [1, ItemID.MELEE_SCIMITAR],
    [2, ItemID.MELEE_MACE],
    [3, ItemID.MELEE_SPIKED_MACE],
    [4, ItemID.MELEE_SPEAR],
    [5, ItemID.MELEE_SICKLE],
    [6, ItemID.EXPLOSIVE_HOLY_HAND_GRENADE],
    [7, ItemID.UNIQUE_BOOK_OF_ARMAMENTS],
    [8, ItemID.MELEE_KATANA],
  ])("maps antique weapon roll %i to item %i", (roll, itemId) => {
    // The hanging roll comes first, so the script is [hanging, weapon].
    const { map, ctx, block } = churchFixture(BASE, rect, [0, roll], [true]);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const lectern = new Point(midX, block.buildingRect.bottom - 2);
    const found: number[] = [];
    for (const sign of [1, -1]) {
      const at = new Point(lectern.x + sign, lectern.y);
      for (const it of map.getItemsAt(at)?.items ?? []) found.push(it.model.id);
    }
    expect(found, `roll ${roll}`).toEqual([itemId, ItemID.MELEE_FLAIL]);
  });

  it("places the two display cases in the C#'s order, which is the order their two rolls come off in", () => {
    // The long-wall arms write the *south* case first (`:2278`, `:2300`) and the
    // gable-wall arms the *east* one (`:2329`, `:2352`), so the generator keeps
    // the order per axis. Script two different weapons and check which case got
    // which: hanging 0, then weapon 1 (scimitar), then weapon 0 (flail).
    const cases: Array<[string, Rect, boolean, (x: number, y: number) => Point]> = [
      // A north-south nave, west door: lectern at `BuildingRect.Right - 2` (`:2273`).
      ["north-south nave, west door", new Rect(4, 4, 11, 17), true, (x, y) => new Point(x, y - 1)],
      // An east-west nave, north door: lectern at `BuildingRect.Bottom - 2` (`:2324`).
      ["east-west nave, north door", new Rect(4, 4, 17, 11), true, (x, y) => new Point(x + 1, y)],
    ];
    for (const [name, rect, north, firstCase] of cases) {
      const { map, ctx, block } = churchFixture(BASE, rect, [0, 1, 0], [north]);
      expect(makeChurchBuilding(ctx), name).toBe(true);
      const midX = block.rectangle.left + Math.floor(block.rectangle.width / 2);
      const midY = block.rectangle.top + Math.floor(block.rectangle.height / 2);
      const lectern =
        block.rectangle.width >= block.rectangle.height
          ? new Point(midX, block.buildingRect.bottom - 2)
          : new Point(block.buildingRect.right - 2, midY);
      const first = firstCase(lectern.x, lectern.y);
      const second = new Point(lectern.x * 2 - first.x, lectern.y * 2 - first.y);
      const ids = (p: Point): number[] => (map.getItemsAt(p)?.items ?? []).map((i) => i.model.id);
      expect(ids(first), `${name}: the case placed first`).toEqual([ItemID.MELEE_SCIMITAR]);
      expect(ids(second), `${name}: the case placed second`).toEqual([ItemID.MELEE_FLAIL]);
    }
  });

  it("rolls the grenade's stack size off the same stream, after the weapon roll", () => {
    // Case 6 is the only one of the nine that costs a second roll, so it is the
    // only way the two antique weapons in one church can come out different.
    // Script: hanging 0, weapon 6, stack 3, weapon 0.
    const { map, ctx, block } = churchFixture(BASE, rect, [0, 6, 3, 0], [true]);
    expect(makeChurchBuilding(ctx)).toBe(true);
    const lectern = new Point(midX, block.buildingRect.bottom - 2);
    const first = (map.getItemsAt(new Point(lectern.x + 1, lectern.y))?.items ?? [])[0];
    const second = (map.getItemsAt(new Point(lectern.x - 1, lectern.y))?.items ?? [])[0];
    expect(first.model.id).toBe(ItemID.EXPLOSIVE_HOLY_HAND_GRENADE);
    expect(first.quantity).toBe(3);
    expect(second.model.id).toBe(ItemID.MELEE_FLAIL);
  });
});

describe("Feature.Church: the map flag", () => {
  it("sets the map's church flag, as the C# does at `:2379`", () => {
    const fresh = new GameMap(3, "fresh", 8, 8);
    expect(fresh.hasChurch, "and it defaults to false, as `Data/Map.cs:273` does").toBe(false);

    const { map, ctx } = churchFixture(BASE, new Rect(1, 1, 9, 9));
    expect(makeChurchBuilding(ctx)).toBe(true);
    expect(map.hasChurch).toBe(true);
  });
});

describe("Feature.Church: the gate", () => {
  it("builds nothing under Classic, and spends no dice doing it", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const spy = newSpy();
    const map = spy.generate(4242);

    // The stage *is* entered -- the gate is inside it -- and the gate stops
    // everything: no zone, and the map does not claim to have a church.
    expect(spy.churchStageCalls, "generate() ran the church stage").toBe(1);
    expect(churchZones(map)).toEqual([]);
    expect(map.hasChurch).toBe(false);

    // The load-bearing half. `NoChurches` overrides the stage away, so this is
    // the same generation with the feature deleted rather than switched off. Equal
    // roll counts mean the stage took nothing off the district's stream: a roll
    // that is taken and thrown away still moves every roll after it, and the
    // housing pass, the wrecked cars and the posters all come after.
    expect(rollsTaken(() => newGenerator().generate(4242))).toBe(rollsTaken(() => newNoChurches().generate(4242)));
  });

  it("leaves a Classic district byte-identical to one generated with the feature removed", () => {
    // The layout comparison, over four seeds. Equal layouts under Classic are the
    // claim "adding this feature changed nothing about a classic world": a church
    // that leaked would change the tiles, a roll that leaked would change every
    // tile after it, and a zone that leaked would change the zone list.
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 7, 42, 4242]) {
      const shipped = newGenerator().generate(seed);
      const withoutTheFeature = newNoChurches().generate(seed);
      expect(layout(shipped), `seed ${seed} tile layout`).toBe(layout(withoutTheFeature));
      expect(zoneNames(shipped), `seed ${seed} zones`).toEqual(zoneNames(withoutTheFeature));
    }
  });

  it("does change the district when the flag is on, so the two tests above are not vacuous", () => {
    // Without this, "the layouts are equal" would also be true of a church stage
    // that never built anything under either ruleset.
    const stillAlive = sweep(Ruleset.STILL_ALIVE).filter((m) => churchZones(m).length > 0)[0];
    const classic = sweep(Ruleset.CLASSIC, 1)[0];
    expect(stillAlive, "a Still Alive district with a church").toBeDefined();
    expect(stillAlive!.hasChurch).toBe(true);
    expect(layout(stillAlive!)).not.toBe(layout(classic));
  });

  it("is deterministic: the same seed builds the same church", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (const seed of [1, 7, 12, 42]) {
      expect(layout(newGenerator().generate(seed)), `seed ${seed}`).toBe(layout(newGenerator().generate(seed)));
    }
  });
});

describe("Feature.Church: the sprite and item rows it needed", () => {
  it("names the eight sprites the C# draws and the one the antique weapon drops", () => {
    // Every id here is a path that has to resolve to a file; `sprite-assets.test.ts`
    // is the test that proves it, and it walks the same class.
    expect(GameImages.DECO_CHURCH).toBe("Tiles/Decoration/church_sign");
    expect(GameImages.DECO_CHURCH_HANGING1).toBe("Tiles/Decoration/hanging_purple");
    expect(GameImages.DECO_CHURCH_HANGING4).toBe("Tiles/Decoration/hanging_blue");
    expect(GameImages.OBJ_CHURCH_PEW).toBe("MapObjects/church_pew");
    expect(GameImages.OBJ_LECTERN).toBe("MapObjects/lectern");
    expect(GameImages.OBJ_DISPLAY_CASE).toBe("MapObjects/display_case");
    expect(GameImages.ITEM_UNIQUE_BOOK).toBe("Items/item_unique_book");
  });

  it("appends the one item id it needed rather than renumbering anything", () => {
    // `ItemID` is append-only because a save names an item by this number, so
    // this is the next free number and `FISHING_ROD` -- the row before it -- is
    // unmoved. (Pinned rather than derived from `_COUNT`, which the next
    // appended row will move.)
    expect(ItemID.FISHING_ROD).toBe(170);
    expect(ItemID.UNIQUE_BOOK_OF_ARMAMENTS).toBe(171);
    const model = Models.items.get(ItemID.UNIQUE_BOOK_OF_ARMAMENTS)!;
    expect(model.imageId).toBe(GameImages.ITEM_UNIQUE_BOOK);
    expect(model.flavorDescription).toBe("It's open at chapter 2, verses 9 through 21.");
  });

  it("makes the pew a bench, the lectern a drawer and the case a container", () => {
    // The three are the C#'s `MakeObjBench`/`MakeObjDrawer`/`MakeObjDisplayCase`
    // with a different sprite. The flags are the whole of the difference, and
    // they are what the game reads: `isCouch` for sitting, `isContainer` for
    // reaching the weapon inside the case.
    const { map, ctx, block } = churchFixture(BASE, new Rect(4, 4, 17, 11));
    expect(makeChurchBuilding(ctx)).toBe(true);
    const objects: MapObject[] = [];
    for (let x = block.rectangle.left; x < block.rectangle.right; x++) {
      for (let y = block.rectangle.top; y < block.rectangle.bottom; y++) {
        const o = map.getMapObjectAt(x, y);
        if (o) objects.push(o);
      }
    }
    const pews = objects.filter((o) => o.imageId === GameImages.OBJ_CHURCH_PEW);
    const cases = objects.filter((o) => o.imageId === GameImages.OBJ_DISPLAY_CASE);
    const lecterns = objects.filter((o) => o.imageId === GameImages.OBJ_LECTERN);
    expect(pews.length).toBeGreaterThan(0);
    expect(cases).toHaveLength(2);
    expect(lecterns).toHaveLength(1);
    for (const pew of pews) {
      expect(pew.name).toBe("bench");
      expect(pew.isCouch).toBe(true);
      expect(pew.givesWood).toBe(true);
      expect(pew.isMaterialTransparent).toBe(true);
    }
    for (const displayCase of cases) {
      expect(displayCase.name).toBe("display case");
      expect(displayCase.isContainer).toBe(true);
      expect(displayCase.weight).toBe(10);
      expect(displayCase.breaksWhenFiredThrough).toBe(true);
    }
    expect(lecterns[0].name).toBe("drawer");
    expect(lecterns[0].isContainer).toBe(true);
  });
});
