import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { MapObject, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Barrel, DoorWindow, PowerGenerator } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeFireStationBuilding } from "@gameplay/generators/buildings/makeFireStationBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.FireStation` — the C#'s `MakeFireStation` (`BaseTownGenerator.cs:3181`),
 * and the one call site that reaches it from `BaseTownGenerator.generate()`.
 *
 * Five things are worth pinning here, and the fifth is the one that would have
 * been easiest to get wrong:
 *
 * 1. **The dispatch reaches it, and only on the parks roll.** The fire station is
 *    neither an arm of the shared `roll(0, 4)` (bar, bank) nor a generator with a
 *    chance roll of its own (church): it shares the parks region's single
 *    `RollChance(ParkBuildingChance)`, which in the C# is at `:552` and reaches
 *    the building at `:563`. So the dispatch test is not "some seed built one" --
 *    which a 10% roll makes a matter of luck -- but "`parkBuildingChance = 0`
 *    reaches it zero times, `= 100` reaches it every block", which is a
 *    statement about the wiring rather than about the dice.
 * 2. **The size precondition is an *upper* bound**, which is the only one among
 *    the C#'s fourteen: `InsideRect.Width > 6 || Height > 6` returns false with
 *    the block untouched, and an inside rect of exactly 6x6 builds. A block of
 *    `n` has an inside rect of `n - 4`, so the boundary block is 10x10 and an
 *    8x8 block is comfortably inside it -- an off-by-four in the other
 *    direction, and the boundary assertion is here to catch it.
 * 3. **The room is a room.** Walls on `buildingRect`, three roller doors, and a
 *    floor you can walk from the doorway to the far corner of. `CountAdjWalls`
 *    is 8-way in the reference, which is the only reason the furniture pass ever
 *    fires at all: a corner of the inside rect has three wall neighbours
 *    (two orthogonal plus the diagonal) and an edge tile has three, so `>= 3` is
 *    the perimeter ring and nothing else. A generator that "fixed" the test to
 *    four neighbours would fill the floor instead of the walls.
 * 4. **CLASSIC is byte-identical, and spends no die.** The fire station's first
 *    roll is the door side, which is *inside* the method and after the
 *    suitability return, so a Classic district pays nothing for it. The
 *    fingerprint is a committed value and the Still Alive one for the same seed
 *    has to differ, which is what makes the committed one non-vacuous.
 * 5. **What this building does not have.** The C# places no fuel pump here, and
 *    that is worth a test of its own: `MakeObjFuelPump` is Release 7-1 and is
 *    reached only from `MakeFuelStation` (`:3175`, `PlaceFuelPump`), which is
 *    `Feature.FuelStation` and still pending. Inventing a pump to make the
 *    building look complete would be a content addition with a fuel-explosion
 *    dependency behind it, so the omission is recorded rather than papered over
 *    -- and pinned, so it cannot become permanent by accident.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four: a shop drops items, a house basement
// spawns a rat, and every actor factory needs a faction.
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

/** The committed CLASSIC fingerprint, 40x40 district, seed 1. See below. */
const MAP = 40;
const SEED = 1;
/** The same value `tests/bank-building.test.ts` commits. */
const CLASSIC_FINGERPRINT = "e097b9d976ffac15";

type ParamsPatch = { minBlockSize?: number; parkBuildingChance?: number };

function newParams(width = MAP, height = MAP, patch: ParamsPatch = {}): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  if (patch.minBlockSize !== undefined) params.minBlockSize = patch.minBlockSize;
  if (patch.parkBuildingChance !== undefined) params.parkBuildingChance = patch.parkBuildingChance;
  return params;
}

/** `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it. */
function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * Counts the dispatch calls, so "the seam is live" is measured rather than
 * assumed. Overriding the stage is also the only way to get a generator with the
 * building genuinely *removed* rather than gated off, which is what the Classic
 * fingerprint is compared against.
 */
class FireStationSpy extends BaseTownGenerator {
  offered: Block[] = [];

  protected override makeFireStation(map: GameMap, b: Block): boolean {
    this.offered.push(b);
    return super.makeFireStation(map, b);
  }
}

/** The fire station stage deleted outright: no roll, no build, no bookkeeping. */
class NoFireStation extends BaseTownGenerator {
  protected override makeFireStation(): boolean {
    return false;
  }
}

function newSpy(params = newParams()): FireStationSpy {
  return new FireStationSpy({ rules, ApplyOnFire: () => undefined } as never, params);
}

function newNoFireStation(params = newParams()): NoFireStation {
  return new NoFireStation({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A `TownBuildingContext` with the generator's real placement primitives, rather
 * than a re-declaration of them: the delegates are private on
 * `BaseTownGenerator`, so a stub in `TOWN_BUILDING_PASSES` is the only way to get
 * the genuine article. The map, the block and the roller are then swapped per
 * test, which is exactly what `buildingContext()` does per block.
 */
let borrowedContext: TownBuildingContext | null = null;
function contextFor(map: GameMap, block: Block, roller: DiceRoller): TownBuildingContext {
  if (!borrowedContext) throw new Error("captureContext() first");
  return { ...borrowedContext, map, block, roller };
}
function captureContext(): void {
  const saved = TOWN_BUILDING_PASSES.slice();
  let captured: TownBuildingContext | null = null;
  TOWN_BUILDING_PASSES.push({
    csharpName: "MakeBorrowContextBuilding",
    tryBuild: (ctx) => {
      captured ??= ctx;
      return false;
    },
  });
  try {
    Session.get().ruleset = Ruleset.CLASSIC;
    newGenerator().generate(SEED);
  } finally {
    TOWN_BUILDING_PASSES.length = 0;
    TOWN_BUILDING_PASSES.push(...saved);
  }
  expect(captured).not.toBeNull();
  borrowedContext = captured as unknown as TownBuildingContext;
}
beforeAll(captureContext);

/**
 * A roller whose `roll(0, 4)` calls are scripted and whose every other roll is
 * the real one.
 *
 * The C# spends exactly two kinds of `roll(0, 4)` on a fire station and both are
 * reachable from here: the door side at `:3205`, once, and the piece of kit at
 * `:3274`, once per tile that passed the 33% roll. Nothing else in the method
 * asks for `[0, 4)`, so **the first one is the door side and every later one is
 * the kit** -- which is what makes "kit roll 2 maps to the flamethrower" a test
 * rather than a hope. Everything else (the 33%, the flamethrower's 15%, the two
 * 10%s, the truck's 5% per tile) stays real and stays in the C#'s order.
 */
function fireRoller(opts: { doorSide?: number; kit?: number; seed?: number } = {}): DiceRoller {
  const { doorSide = 0, kit = -1, seed = 1 } = opts;
  const roller = new DiceRoller(seed);
  const real = roller.roll.bind(roller);
  let seen = 0;
  roller.roll = (min: number, max: number) => {
    if (min !== 0 || max !== 4) return real(min, max);
    if (kit < 0) return doorSide;
    return seen++ === 0 ? doorSide : kit;
  };
  return roller;
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

function fireStationZones(map: GameMap): string[] {
  return map.zones.map((z) => z.name).filter((n) => n.startsWith("Fire station@"));
}

/**
 * Everything only `makeFireStationBuilding` can leave on a district, as one
 * sorted list. Any of these appearing under CLASSIC is the bug the feature gate
 * exists to prevent, and listing them rather than counting zones means a fire
 * station that somehow lost its zone is still caught.
 *
 * **Two sprites, not five.** Roller doors, workbenches, barrels and power
 * generators are shared: `MakeFarmBuilding` and `MakeJunkyard` both place
 * `MakeObjRollerDoor` and `MakeObjFireBarrel`, and `makeParkBuilding` places a
 * generator in its shed, so a district full of farms would fail a test that
 * looked for them. The four fire-truck halves and the sign have exactly one
 * caller in the whole C#, which is what makes them evidence.
 */
function fireStationTraces(map: GameMap): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && obj.imageId.includes("fire_truck")) out.push(`object ${obj.imageId}@${x},${y}`);
      for (const deco of map.getTileAt(x, y)!.getDecorations ?? []) {
        if (deco === GameImages.DECO_FIRE_STATION) out.push(`deco ${deco}@${x},${y}`);
      }
    }
  }
  return out.sort();
}

/** The block a `Fire station@x-y` zone was cut from, as a fresh `Block`. */
function blockOf(zone: { bounds: Rect }): Block {
  const b = zone.bounds;
  return new Block(new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2));
}

/** Objects standing inside a block, as `imageId@x,y`, sorted. */
function objectsIn(map: GameMap, b: Block): string[] {
  const out: string[] = [];
  for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
    for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj) out.push(`${obj.imageId}@${x},${y}`);
    }
  }
  return out.sort();
}

/** Ground item model ids inside a block, as `id@x,y`, sorted. */
function itemsIn(map: GameMap, b: Block): string[] {
  const out: string[] = [];
  for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
    for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
      for (const item of map.getItemsAt(new Point(x, y))?.items ?? []) out.push(`${item.model.id}@${x},${y}`);
    }
  }
  return out.sort();
}

/** The `x,y` of an `…@x,y` entry, as a `Point`. */
function cellAt(entry: string): Point {
  const [x, y] = entry.split("@")[1]!.split(",").map(Number);
  return new Point(x, y);
}

/** A tile's decorations; `null` and `[]` both mean none. */
function decorationsAt(map: GameMap, x: number, y: number): string[] {
  return [...(map.getTileAt(x, y)?.getDecorations ?? [])];
}

/**
 * Interior tiles reachable from `from` on *tile* walkability, ignoring the
 * furniture.
 *
 * Not `map.isWalkable`, which also asks the map object: the C# puts a power
 * generator, workbenches, barrels and a two-tile fire truck *inside* the room, so
 * an object-level flood fill measures the C#'s furniture rather than its room.
 * Tile walkability is the question actually being asked: is the bay a connected
 * area, or does the entrance open onto a wall.
 */
function floorReachableFrom(map: GameMap, from: Point, rect: Rect): string[] {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue: Point[] = [from];
  while (queue.length) {
    const p = queue.shift() as Point;
    for (const next of [
      new Point(p.x + 1, p.y),
      new Point(p.x - 1, p.y),
      new Point(p.x, p.y + 1),
      new Point(p.x, p.y - 1),
    ]) {
      const key = `${next.x},${next.y}`;
      const tile = map.getTileAt(next.x, next.y);
      if (seen.has(key) || !rect.contains(next) || !tile || !tile.model.isWalkable) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return [...seen].sort();
}

/** Every *tile*-walkable tile of a rect, as `x,y`, sorted. See `floorReachableFrom`. */
function walkableFloorIn(map: GameMap, rect: Rect): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) if (map.getTileAt(x, y)!.model.isWalkable) out.push(`${x},${y}`);
  }
  return out.sort();
}

/** Zones with their bounds, sorted, so two maps compare without order noise. */
function zoneNames(map: GameMap): string[] {
  return map.zones
    .map((z) => `${z.name}@${z.bounds.left},${z.bounds.top},${z.bounds.width},${z.bounds.height}`)
    .sort();
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

/**
 * A whole-district fingerprint: every tile's model, its map object, its
 * decorations and its inside flag, through two independent accumulators. The
 * same function, and the same accumulator constants, as
 * `tests/bank-building.test.ts` -- which is what makes the two files' committed
 * values comparable and what makes a change in one visible in the other.
 */
function fingerprint(map: GameMap): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const tile = map.getTileAt(x, y)!;
      const obj = map.getMapObjectAt(x, y);
      const cell = `${tile.model.id}|${obj ? obj.imageId : "-"}|${(tile.getDecorations ?? []).join(",")}|${
        tile.isInside ? 1 : 0
      }`;
      for (let i = 0; i < cell.length; i++) {
        h1 = Math.imul(h1 ^ cell.charCodeAt(i), 16777619) >>> 0;
        h2 = (Math.imul(h2 + cell.charCodeAt(i) + i, 2654435761) ^ (h2 >>> 7)) >>> 0;
      }
    }
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const originalRuleset = Session.get().ruleset;
afterEach(() => {
  Session.get().ruleset = originalRuleset;
  TOWN_BUILDING_PASSES.length = 0;
});

// ── Reached from the district generator ─────────────────────────────────────

describe("fire station, from BaseTownGenerator.generate()", () => {
  it("is reached only on the parks roll, and that is the only roll it rides", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    // C# `:552` spends one `RollChance(m_Params.ParkBuildingChance)` per block and
    // `:563` reaches the fire station from inside that `if`. Turning the chance to
    // zero has to reach the building zero times -- if the pass rolled for itself,
    // or rode some other die, it would still be called here.
    const never = newSpy(newParams(MAP, MAP, { parkBuildingChance: 0 }));
    const withoutParks = never.generate(SEED);
    expect(never.offered, "the parks roll is off, so the fire station is not offered").toEqual([]);
    expect(fireStationZones(withoutParks)).toEqual([]);
    expect(fireStationTraces(withoutParks)).toEqual([]);

    // And with the chance at 100 it is offered *every* block still in the pool at
    // the parks stage, so the switch is a statement about the wiring rather than
    // about luck: a 10% chance over a handful of blocks would otherwise make
    // "a district got a fire station" a coin flip.
    const always = newSpy(newParams(MAP, MAP, { parkBuildingChance: 100 }));
    const withParks = always.generate(SEED);
    expect(always.offered.length, "every block reaches the fire station arm").toBeGreaterThan(0);
    // One per district, C# `:563`'s `!fireStationPlaced`: however many blocks the
    // arm is offered, at most one of them becomes a fire station.
    expect(fireStationZones(withParks).length).toBeLessThanOrEqual(1);
  });

  it("builds a fire station on a district, names it with the C#'s zone, and only ever one", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // 50x50 with the parks chance pinned: the default `minBlockSize` of 11 means a
    // 40x40 district cuts blocks too big for a fire station (it wants an inside
    // rect of at most 6x6, so a block of at most 10x10), and a 50x50 one cuts a
    // handful of 10x10s. Both are properties of `makeBlocks`, not of this
    // building, so neither belongs in the assertion.
    const built: GameMap[] = [];
    for (let seed = 1; seed <= 20 && built.length < 3; seed++) {
      const map = newGenerator(newParams(50, 50, { parkBuildingChance: 100 })).generate(seed);
      if (fireStationZones(map).length > 0) built.push(map);
    }
    expect(built.length, "at least three of twenty 50x50 districts built a fire station").toBe(3);

    for (const map of built) {
      const names = fireStationZones(map);
      // C# `:3349-3350`: `MakeUniqueZone("Fire station", b.BuildingRect)`. Note the
      // lower-case second word, unlike `"Church"` and `"Bank"`.
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/^Fire station@\d+-\d+$/);
      const zone = map.zones.find((z) => z.name === names[0])!;
      const b = blockOf(zone);
      expect(zone.bounds.equals(b.buildingRect)).toBe(true);
      // `makeUniqueZone` (`BaseMapGenerator.ts:1592`) is
      // `${basename}@${left + floor(width/2)}-${top + floor(height/2)}`.
      expect(names[0]).toBe(`Fire station@${b.buildingRect.left + Math.floor(b.buildingRect.width / 2)}-${
        b.buildingRect.top + Math.floor(b.buildingRect.height / 2)
      }`);

      // The four walkway strips C# adds at `:3352`, around this block and no other.
      const outer = new Rect(b.rectangle.left, b.rectangle.top, b.rectangle.width, b.rectangle.height);
      const within = (r: Rect): boolean =>
        r.left >= outer.left && r.top >= outer.top && r.right <= outer.right && r.bottom <= outer.bottom;
      expect(map.zones.filter((z) => z.name.startsWith("walkway@") && within(z.bounds))).toHaveLength(4);

      // And the building is actually a building: three roller doors and a sign.
      const doors = objectsIn(map, b).filter((o) => o.startsWith(GameImages.OBJ_ROLLER_DOOR_CLOSED));
      expect(doors, "C# `:3210-3212` and its three twins: three doors").toHaveLength(3);
      expect(fireStationTraces(map).some((t) => t.startsWith(`deco ${GameImages.DECO_FIRE_STATION}`))).toBe(true);
    }
  });

  it("walls the building rect, floors the bay, and leaves the room reachable from its door", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 3; seed++) {
      const map = newGenerator(newParams(50, 50, { parkBuildingChance: 100 })).generate(seed);
      for (const zone of map.zones.filter((z) => z.name.startsWith("Fire station@"))) {
        const b = blockOf(zone);
        const wall = Models.tiles.get(TileID.WALL_POLICE_STATION)!;
        const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;

        // The perimeter is the police station's CadetBlue wall (`WALL_POLICE_STATION`
        // is that tile model, `GameTiles.ts:225`) except at the three doorways:
        // `placeDoor` lays the floor tile *under* the door, which is the whole
        // reason it is ordered that way (`TownBuilding.placeDoor`).
        const doorsOnWall: Point[] = [];
        for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
          for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
            const onEdge =
              x === b.buildingRect.left ||
              x === b.buildingRect.right - 1 ||
              y === b.buildingRect.top ||
              y === b.buildingRect.bottom - 1;
            if (!onEdge) continue;
            const tile = map.getTileAt(x, y)!;
            if (tile.model === wall) continue;
            expect(tile.model, `perimeter ${x},${y} is wall or a doorway`).toBe(concrete);
            if (map.getMapObjectAt(x, y) instanceof DoorWindow) doorsOnWall.push(new Point(x, y));
          }
        }
        expect(doorsOnWall).toHaveLength(3);
        // Three doors *down one wall*, centred on the block: C# `:3201-3202` takes
        // `b.Rectangle`'s middle, so the three cells are `mid-1`, `mid` and `mid+1`.
        const onVerticalWall =
          doorsOnWall.filter((p) => p.x === b.buildingRect.left || p.x === b.buildingRect.right - 1).length;
        expect(onVerticalWall === 3 || onVerticalWall === 0, "the three doors share one wall").toBe(true);
        // The middle of the three along that wall, which is the `midY`/`midX` cell
        // the C# placed first.
        const middle = doorsOnWall
          .map((p) => (onVerticalWall === 3 ? p.y : p.x))
          .sort((a, c) => a - c)[1]!;

        // The bay is concrete and flagged indoors, which is what makes it dark at
        // night and muffled.
        for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
          for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
            const tile = map.getTileAt(x, y)!;
            expect(tile.model, `inside ${x},${y}`).toBe(concrete);
            expect(tile.isInside, `inside ${x},${y} flagged`).toBe(true);
          }
        }

        // The room is not sealed. Step in off the middle door and walk the floor:
        // the *whole* bay, not most of it, so a doorway that opened onto a wall
        // rather than onto the floor fails.
        const middleDoor = doorsOnWall.find((p) => (onVerticalWall === 3 ? p.y : p.x) === middle)!;
        const inward =
          middleDoor.x === b.buildingRect.left
            ? new Point(middleDoor.x + 1, middleDoor.y)
            : middleDoor.x === b.buildingRect.right - 1
              ? new Point(middleDoor.x - 1, middleDoor.y)
              : middleDoor.y === b.buildingRect.top
                ? new Point(middleDoor.x, middleDoor.y + 1)
                : new Point(middleDoor.x, middleDoor.y - 1);
        expect(map.isWalkable(inward.x, inward.y), `inside the door at ${inward}`).toBe(true);
        // `CountAdjDoors` is what the sign keys on (`:3259`), and it sees the doors
        // from the tiles either side of them.
        expect(borrowedContext!.countAdjDoors(map, inward.x, inward.y)).toBeGreaterThanOrEqual(1);
        expect(floorReachableFrom(map, inward, b.insideRect), "the whole bay, from the door").toEqual(
          walkableFloorIn(map, b.insideRect),
        );
        checked++;
      }
    }
    expect(checked, "three fire stations' rooms were checked").toBe(3);
  });
});

// ── The generator itself ────────────────────────────────────────────────────

describe("makeFireStationBuilding", () => {
  it("returns false and touches nothing when the inside rect is over 6x6", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3186` is `> 6`, the only *upper* size bound among the C#'s fourteen. A
    // block of 11 has a 7x7 inside rect, so the size check is what refuses -- and
    // refusing has to happen before the first line is written, because a
    // half-built fire station in a park's block is a district nobody chose.
    for (const rect of [new Rect(4, 4, 11, 11), new Rect(4, 4, 20, 8), new Rect(4, 4, 8, 20)]) {
      const map = plot();
      const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
      const b = new Block(rect);
      expect(b.insideRect.width > 6 || b.insideRect.height > 6, `${rect.width}x${rect.height} is over the bound`).toBe(
        true,
      );

      expect(makeFireStationBuilding(contextFor(map, b, fireRoller()))).toBe(false);
      expect(map.zones, "no zone").toHaveLength(0);
      expect(map.mapObjects, "no map object").toHaveLength(0);
      for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) expect(map.getTileAt(x, y)!.model).toBe(grass);
    }
  });

  it("accepts an inside rect of exactly 6x6, the C#'s boundary", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // `InsideRect.Width > 6` is a strict `>`, so 6 builds -- and 6 means a 10x10
    // block, since a block of n has an inside rect of n - 4. A generator that wrote
    // `>=` would hand the boundary block to the housing pass instead, and that
    // off-by-one is invisible anywhere else.
    const map = plot();
    const b = new Block(new Rect(2, 2, 10, 10));
    expect(b.insideRect.width).toBe(6);
    expect(b.insideRect.height).toBe(6);
    expect(makeFireStationBuilding(contextFor(map, b, fireRoller()))).toBe(true);
    expect(fireStationZones(map)).toHaveLength(1);
  });

  it("builds at most one per district, and re-arms for the next", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:563`'s `!fireStationPlaced`, a `bool` the parks region declares and
    // resets per district (`:547`). Offered five eligible blocks, one comes back.
    const map = plot();
    const blocks = [
      new Block(new Rect(1, 1, 10, 10)),
      new Block(new Rect(12, 1, 10, 10)),
      new Block(new Rect(23, 1, 10, 10)),
      new Block(new Rect(1, 12, 10, 10)),
      new Block(new Rect(12, 12, 10, 10)),
    ];
    const roller = fireRoller();
    expect(blocks.filter((b) => makeFireStationBuilding(contextFor(map, b, roller)))).toHaveLength(1);
    expect(fireStationZones(map)).toHaveLength(1);

    // A new district is a new `DiceRoller`, which is where the C# re-declares the
    // flag -- so a second roller is a second district and may build one too.
    expect(makeFireStationBuilding(contextFor(map, new Block(new Rect(23, 12, 10, 10)), fireRoller()))).toBe(true);
    expect(fireStationZones(map)).toHaveLength(2);
  });

  it("puts three roller doors down one wall and an asphalt driveway off them", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3205-3256`. The four arms differ only in the axis the three doors step
    // along and the one tile outside the wall they open onto, so the four are the
    // claim worth pinning. `ARM` is 10x10 at (2,2), so `buildingRect` is (3,3,8,8)
    // and `midX`/`midY` are 7/7 -- `b.Rectangle`'s centre, C# `:3201-3202`.
    const ARM = new Rect(2, 2, 10, 10);
    const arms = [
      { name: "west", side: 0, doors: [[3, 6], [3, 7], [3, 8]], driveway: [2, 7] },
      { name: "east", side: 1, doors: [[10, 6], [10, 7], [10, 8]], driveway: [11, 7] },
      { name: "north", side: 2, doors: [[6, 3], [7, 3], [8, 3]], driveway: [7, 2] },
      { name: "south", side: 3, doors: [[6, 10], [7, 10], [8, 10]], driveway: [7, 11] },
    ];

    for (const arm of arms) {
      const map = plot();
      const b = new Block(ARM);
      // Park a car on the driveway tile: C# `:3216` and its three twins are
      // `map.RemoveMapObjectAt(...)` with the comment "get rid of cars", and
      // `addWreckedCarsOutside` runs after every building in the C# too.
      map.placeMapObject(new MapObject("parked car", GameImages.OBJ_CAR1), new Point(arm.driveway[0], arm.driveway[1]));

      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ doorSide: arm.side }))), `fire station, ${arm.name} side`).toBe(
        true,
      );

      // The three doors, on the rolled side, as a roller door in every state.
      const doors = objectsIn(map, b).filter((o) => o.startsWith(GameImages.OBJ_ROLLER_DOOR_CLOSED));
      expect(doors, `three doors on the ${arm.name} wall`).toHaveLength(3);
      for (const [x, y] of arm.doors) {
        const obj = map.getMapObjectAt(x, y);
        expect(obj, `door at ${x},${y}`).toBeInstanceOf(DoorWindow);
        expect((obj as DoorWindow).imageId).toBe(GameImages.OBJ_ROLLER_DOOR_CLOSED);
        expect(obj!.name, "the C# calls it a roller door, not a garage door").toBe("roller door");
        // The floor under the doorway is concrete, not wall: `placeDoor` lays the
        // tile first so the door is a hole in the wall.
        expect(map.getTileAt(x, y)!.model).toBe(Models.tiles.get(TileID.FLOOR_CONCRETE)!);
      }

      // The driveway: the car is gone and the tile is asphalt.
      const [dx, dy] = arm.driveway;
      expect(map.getMapObjectAt(dx, dy), `the car on the ${arm.name} driveway`).toBeNull();
      expect(map.getTileAt(dx, dy)!.model).toBe(Models.tiles.get(TileID.FLOOR_ASPHALT)!);
      // And the sign goes on the bare wall tiles either side of the door run,
      // which is exactly what `map.GetMapObjectAt(x, y) == null && CountAdjDoors
      // (...) >= 1` selects (`:3259`).
      const signed: string[] = [];
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          if (!decorationsAt(map, x, y).includes(GameImages.DECO_FIRE_STATION)) continue;
          signed.push(`${x},${y}`);
          expect(borrowedContext!.countAdjDoors(map, x, y), `sign at ${x},${y} is next to a door`).toBeGreaterThanOrEqual(1);
          expect(map.getMapObjectAt(x, y), `sign at ${x},${y} is on a bare wall`).toBeNull();
        }
      }
      expect(signed.length, `signs on the ${arm.name} wall`).toBe(2);
    }
  });

  it("hangs the power generator on the first wall-adjacent tile, and nothing off a floor tile", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3266-3297`. `CountAdjWalls` is 8-way in the reference
    // (`MapGenerator.cs:422`, over `Direction.COMPASS`), so the `>= 3` test is the
    // perimeter ring of the inside rect -- a corner has three wall neighbours, an
    // edge tile has three, and the middle of the room has none. The generator takes
    // the *first* such tile in `MapObjectFill`'s column-major walk and spends no
    // die on it at all.
    const map = plot();
    const b = new Block(new Rect(2, 2, 10, 10));
    expect(makeFireStationBuilding(contextFor(map, b, fireRoller()))).toBe(true);

    const inside = b.insideRect;
    // The same walk `MapObjectFill` makes: x outer, y inner.
    const eligible: Point[] = [];
    for (let x = inside.left; x < inside.right; x++) {
      for (let y = inside.top; y < inside.bottom; y++) {
        if (borrowedContext!.countAdjWalls(map, x, y) >= 3) eligible.push(new Point(x, y));
      }
    }
    expect(eligible.length, "the perimeter ring is a ring").toBeGreaterThan(0);

    const generators = objectsIn(map, b).filter((o) => o.includes("power_generator"));
    expect(generators, "C# `:3286-3290`: we only want to place one generator").toHaveLength(1);
    const at = cellAt(generators[0]!);
    // Not just *on* the ring: on the *first* tile of it, and no die spent getting
    // there, which is the reason the two 10% arms below it are the C#'s.
    expect(eligible[0], "the generator takes the first eligible tile").toEqual(at);
    // It is a `PowerGenerator`, not a bare `MapObject`: the sprite flips to
    // `_on` when it is running, which is `StateMapObject` and nothing else.
    expect(map.getMapObjectAt(at.x, at.y)).toBeInstanceOf(PowerGenerator);
    expect(map.getMapObjectAt(at.x, at.y)!.imageId).toBe(GameImages.OBJ_POWERGEN_OFF);
  });

  it.each([
    // C# `:3277-3280`, the `roll(0, 4)` table for case. `ItemID` rows pinned so a
    // renumber cannot make this pass by accident.
    [0, ItemID.MELEE_FIRE_AXE],
    [1, ItemID.ARMOR_FIRE_HAZARD_SUIT],
    [3, ItemID.FIRE_EXTINGUISHER],
  ])("kit roll %i drops item %i", (kit, itemId) => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // The 33% at `:3272` and the flamethrower's 15% at `:3279` stay real, so a
    // seed is used that puts at least one kit roll on the wall. The assertion is
    // on the *ids*, not on a count: a run that dropped none would otherwise prove
    // nothing, so the non-empty check comes first.
    const dropped = new Set<number>();
    for (let seed = 1; seed <= 8; seed++) {
      const map = plot();
      const b = new Block(new Rect(2, 2, 10, 10));
      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ doorSide: 0, kit, seed })))).toBe(true);
      for (const entry of itemsIn(map, b)) dropped.add(Number(entry.split("@")[0]));
    }
    expect(dropped.size, "at least one piece of kit was dropped").toBeGreaterThan(0);
    expect([...dropped].sort((a, c) => a - c)).toEqual([itemId]);
  });

  it("kit roll 2 is the flamethrower, and it is the only case with a second roll", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3279`: `case 2: if (m_DiceRoller.RollChance(15)) DropItemAt(MakeItemFlamethrower(), pt); break;`
    // -- so case 2 costs two dice and the other three cost one, and case 2 alone
    // can drop nothing. A flamethrower also arrives *empty*: `Ammo = 0`.
    let flamethrowers = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const map = plot();
      const b = new Block(new Rect(2, 2, 10, 10));
      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ doorSide: 0, kit: 2, seed })))).toBe(true);
      for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
        for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
          for (const item of map.getItemsAt(new Point(x, y))?.items ?? []) {
            if (item.model.id !== ItemID.RANGED_FLAMETHROWER) continue;
            ++flamethrowers;
            const weapon = item as unknown as { ammo: number };
            expect(weapon.ammo, "the C# zeroes the ammo on a found flamethrower").toBe(0);
          }
        }
      }
    }
    expect(flamethrowers, "the 15% inside case 2 fired on some seed").toBeGreaterThan(0);
  });

  it("lays at most one fire truck, in the two halves the door side picks", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3299-3342`. `MakeObjFireTruck`'s own comment has the shape: a 32x64
    // east-west or 64x32 north-south image, cut in half and laid down
    // back-to-front. Which pair is a function of the *door side*, which is why the
    // C#'s `switch (doorside)` reads a local from `:3205`. The truck's own tile
    // test is the loose one, `CountAdjWalls > 2` -> skip, so it wants the open
    // middle of the bay rather than a corner.
    const arms = [
      { name: "west", side: 0, back: GameImages.OBJ_FIRE_TRUCK_EW_BACK, front: GameImages.OBJ_FIRE_TRUCK_EW_FRONT },
      { name: "east", side: 1, back: GameImages.OBJ_FIRE_TRUCK_EW_BACK, front: GameImages.OBJ_FIRE_TRUCK_EW_FRONT },
      { name: "north", side: 2, back: GameImages.OBJ_FIRE_TRUCK_NS_BACK, front: GameImages.OBJ_FIRE_TRUCK_NS_FRONT },
      { name: "south", side: 3, back: GameImages.OBJ_FIRE_TRUCK_NS_BACK, front: GameImages.OBJ_FIRE_TRUCK_NS_FRONT },
    ];
    for (const arm of arms) {
      let sawTruck = false;
      for (let seed = 1; seed <= 12 && !sawTruck; seed++) {
        const map = plot();
        const b = new Block(new Rect(2, 2, 10, 10));
        expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ doorSide: arm.side, seed })))).toBe(true);
        const truckCells = objectsIn(map, b).filter((o) => o.includes("fire_truck"));
        // Zero or two halves, never one: the C# places the pair or neither.
        expect(truckCells.length % 2, `${arm.name}: the truck is two tiles or none`).toBe(0);
        if (truckCells.length === 0) continue;
        sawTruck = true;
        // Zero or two halves, never one: the C# places the pair or neither.
        expect(truckCells.length, `${arm.name}: at most one truck, so two halves`).toBe(2);
        const cells = truckCells.map(cellAt);
        const imageAt = (c: Point): string => map.getMapObjectAt(c.x, c.y)!.imageId;
        const backCell = cells.find((c) => imageAt(c) === arm.back)!;
        const frontCell = cells.find((c) => imageAt(c) === arm.front)!;
        expect(backCell, `${arm.name}: the back half`).toBeDefined();
        expect(frontCell, `${arm.name}: the front half`).toBeDefined();

        // The front is one tile right of the back for an east-west truck and one
        // tile below it for a north-south one (`:3317`, `:3329`).
        if (arm.side <= 1) {
          expect(frontCell, "the front is one tile right of the back").toEqual(new Point(backCell.x + 1, backCell.y));
        } else {
          expect(frontCell, "the front is one tile below the back").toEqual(new Point(backCell.x, backCell.y + 1));
        }

        // Both halves stand in the open middle of the bay, not in a corner: the
        // truck's own tile test is the loose one, `CountAdjWalls > 2` -> skip.
        for (const cell of cells) {
          const { x, y } = cell;
          expect(borrowedContext!.countAdjWalls(map, x, y), `truck half at ${x},${y} is off the wall`).toBeLessThanOrEqual(2);
          expect(map.getTileAt(x, y)!.isInside, `truck half at ${x},${y} is indoors`).toBe(true);
          // `StandOnFovBonus`: the one object in a fire station you get a
          // sightline from, and `JumpLevel = 1` so it can be jumped.
          expect(map.getMapObjectAt(x, y)!.standOnFovBonus).toBe(true);
          expect(map.getMapObjectAt(x, y)!.isMovable, "a fire truck does not move").toBe(false);
          expect(b.insideRect.contains(cell), `truck half at ${x},${y} is inside the bay`).toBe(true);
        }
      }
      expect(sawTruck, `a truck came down on the ${arm.name} arm within twelve seeds`).toBe(true);
    }
  });

  it("stocks workbenches and unlit fire barrels, and the roller door is a door", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3291-3294`: after the generator, each remaining wall-adjacent tile
    // rolls 10% for a workbench and then 10% for a barrel, so the barrel is only
    // ever reached by a tile that lost the workbench roll. The two 10%s stay real
    // here and the assertion is that both kinds turn up across a handful of
    // seeds, which is a weaker claim than "this seed put one here" on purpose: the
    // point is that the arms are wired at all, not which tile won.
    const workbenches = new Set<string>();
    const barrels = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const map = plot();
      const b = new Block(new Rect(2, 2, 10, 10));
      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ seed })))).toBe(true);
      for (const entry of objectsIn(map, b)) {
        if (entry.startsWith(GameImages.OBJ_WORKBENCH)) {
          workbenches.add(entry);
          const obj = map.getMapObjectAt(cellAt(entry).x, cellAt(entry).y)!;
          // `MakeObjWorkbench`'s whole body is the container: Release 5-3, so a
          // workbench can be looted for parts.
          expect(obj.name).toBe("workbench");
          expect(obj.isContainer, "a workbench is a container").toBe(true);
          // And it is on the ring, like everything the fill places.
          expect(borrowedContext!.countAdjWalls(map, cellAt(entry).x, cellAt(entry).y)).toBeGreaterThanOrEqual(3);
        }
        if (entry.startsWith(GameImages.OBJ_EMPTY_BARREL)) {
          barrels.add(entry);
          const at = cellAt(entry);
          const obj = map.getMapObjectAt(at.x, at.y)!;
          // `MakeObjFireBarrel` (`BaseMapGenerator.cs:758`): unbreakable,
          // burnable, four kilos, and *walkable* -- which is what makes it a thing
          // you stand on rather than an obstacle, and a `Barrel` rather than a
          // `MapObject` so the burn loop can refuel it.
          expect(obj).toBeInstanceOf(Barrel);
          expect(obj.name).toBe("receptacle");
          expect(obj.isWalkable, "a fire barrel is walkable").toBe(true);
          expect(obj.isContainer, "so items left in an unlit one are reachable").toBe(true);
          expect(obj.isMovable).toBe(true);
          expect(obj.weight).toBe(4);
          expect(obj.isBreakable, "unbreakable").toBe(false);
          expect(obj.fireState).toBe(MapObjectFire.BURNABLE);
        }
      }
    }
    expect(workbenches.size, "C# `:3292` put a workbench somewhere").toBeGreaterThan(0);
    expect(barrels.size, "C# `:3294` put a fire barrel somewhere").toBeGreaterThan(0);

    // The roller door, once, because a fire station's doors are what a horde has
    // to get through: six times a normal door's hit points (C# `BaseMapGenerator.cs:421`).
    const map = plot();
    const b = new Block(new Rect(2, 2, 10, 10));
    expect(makeFireStationBuilding(contextFor(map, b, fireRoller()))).toBe(true);
    const door = map.getMapObjectAt(b.buildingRect.left, b.rectangle.top + Math.trunc(b.rectangle.height / 2))!;
    expect(door).toBeInstanceOf(DoorWindow);
    expect((door as DoorWindow).maxHitPoints).toBe(6 * DoorWindow.BASE_HITPOINTS);
  });

  it("never places a fuel pump, because the C# has none in this building", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // The hazard the port plan warns about. `MakeObjFuelPump`
    // (`BaseMapGenerator.cs:1105`, Release 7-1) and `PlaceFuelPump`
    // (`BaseTownGenerator.cs:3175`, Release 7-3) are reached from
    // `MakeFuelStation` (`:2811`) and *nowhere else* in the reference --
    // `MakeFireStation` places a power generator, a workbench, a fire barrel and
    // a truck, and no pump. `Feature.FuelStation` owns the model and is still
    // unwired, and inventing one here would be content with a fuel-explosion
    // dependency behind it. This test says so out loud: if a future port adds a
    // pump to a fire station, this fails and the reason has to be written down.
    for (let seed = 1; seed <= 6; seed++) {
      const map = plot();
      const b = new Block(new Rect(2, 2, 10, 10));
      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ seed })))).toBe(true);
      expect(objectsIn(map, b).filter((o) => o.includes("fuel_pump"))).toEqual([]);
    }
    // And on a whole district, where the C# would have put a fuel station's pumps.
    let checked = 0;
    for (let seed = 1; seed <= 20 && checked < 2; seed++) {
      const map = newGenerator(newParams(50, 50, { parkBuildingChance: 100 })).generate(seed);
      if (fireStationZones(map).length === 0) continue;
      ++checked;
      for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
          expect(map.getMapObjectAt(x, y)?.imageId, `a fuel pump at ${x},${y}`).not.toBe(GameImages.OBJ_FUEL_PUMP);
        }
      }
    }
    expect(checked, "two districts with a fire station were checked for a fuel pump").toBe(2);
  });

  it("is deterministic for a given block and roller", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // World generation is seeded, so `ctx.roller` is the only randomness allowed:
    // a `Math.random()` in here would pass every other test in this file and
    // break every saved game. Same roller and same block, same map; a different
    // roller has to give a different answer, or the first assertion is vacuous.
    const build = (seed: number): string => {
      const map = plot();
      const b = new Block(new Rect(2, 2, 10, 10));
      expect(makeFireStationBuilding(contextFor(map, b, fireRoller({ seed })))).toBe(true);
      return [...objectsIn(map, b), ...itemsIn(map, b)].join(",");
    };
    expect(build(20250929)).toBe(build(20250929));
    expect(build(20250929)).not.toBe(build(4242));
  });
});

// ── CLASSIC ─────────────────────────────────────────────────────────────────

describe("fire station under CLASSIC", () => {
  it("is never reached, even on a block the parks stage offers", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // C# would have built on it. The gate is the generator's first statement, so
    // the `false` here is the feature and not luck: nothing is written, not even
    // the walls.
    const map = plot();
    const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
    expect(makeFireStationBuilding(contextFor(map, new Block(new Rect(2, 2, 10, 10)), fireRoller()))).toBe(false);
    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    expect(map.getTileAt(3, 3)!.model).toBe(grass);
  });

  it("leaves a CLASSIC district with no trace of a fire station", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = newGenerator(newParams(50, 50, { parkBuildingChance: 100 })).generate(SEED);

    expect(fireStationZones(map)).toEqual([]);
    // Roller doors, workbenches, barrels, the generator, the truck and the sign:
    // the C# has no other use for any of them here, so their absence is a
    // stronger statement than the absence of a zone.
    expect(fireStationTraces(map)).toEqual([]);
  });

  it("spends no die doing it", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // The load-bearing half. `NoFireStation` has the stage deleted rather than
    // switched off, so this is the same generation with the building removed.
    // Equal roll counts mean nothing in the stage ran under Classic -- including
    // the door-side roll, which the C# takes inside the method. A roll that is
    // taken and thrown away still moves every roll after it, and the housing pass,
    // the wrecked cars and the posters all come after.
    expect(rollsTaken(() => newGenerator().generate(4242))).toBe(rollsTaken(() => newNoFireStation().generate(4242)));
  });

  it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
    // Recorded from this seed with the dispatch present and the feature off, and
    // the *same* value `tests/bank-building.test.ts` commits: a CLASSIC world pays
    // nothing for the fire station, not even a die, and the folded-in parks arm
    // spends exactly the one `rollChance` the `&&` it replaced spent. If the
    // fire station had moved a single die, this value would differ from the bank's
    // -- which is the point of committing the same constant twice.
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = fingerprint(newGenerator().generate(SEED));
    expect(classic).toBe(CLASSIC_FINGERPRINT);
    // And the bank file's own assertion of the same constant, so the two cannot
    // drift apart silently.
    expect(fingerprint(newGenerator(newParams(40, 40)).generate(1))).toBe("e097b9d976ffac15");

    // The two assertions that give the committed value meaning. A fingerprint
    // that ignored the world would pass the first line for any value; one that
    // returned a per-seed constant would pass both.
    expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);

    // And the still-alive fingerprint for the same seed has to differ, or the
    // committed constant is only being asserted against itself. Not committed:
    // every other Stage 5 building moves this number, and a test that pinned it
    // would fail on a colleague's work rather than on a bug.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
  });

  it("is byte-identical to a district generated with the stage deleted outright", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 7, 42, 4242]) {
      const shipped = newGenerator().generate(seed);
      const withoutTheStage = newNoFireStation().generate(seed);
      expect(fingerprint(shipped), `seed ${seed} tile fingerprint`).toBe(fingerprint(withoutTheStage));
      expect(zoneNames(shipped), `seed ${seed} zones`).toEqual(zoneNames(withoutTheStage));
    }
  });
});
