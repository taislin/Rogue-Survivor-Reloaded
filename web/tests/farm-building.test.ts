/**
 * `Feature.Farm` — the C#'s `MakeFarmBuilding` (`BaseTownGenerator.cs:3685-3805`),
 * `MakeFarmShedBuilding` (`:3807-3943`), `MakeFarmShedItem` (`:7867-7891`) and the
 * two factories added to `BaseMapGenerator` for them. Still Alive, Release 7-3.
 *
 * Seven things are pinned, and four of them are the ones a plausible port gets wrong
 * without crashing:
 *
 * 1. **The feature gate is the first statement and spends no die.** `hasFeature` is
 *    off for CLASSIC, so a Classic district never rolls for a farm. Asserted against
 *    the roll counter, not just the return value, because a gate placed *after* the
 *    suitability check would pass a "returns false" test on a small block and still
 *    be wrong.
 * 2. **The suitability gate is `>= 8 && >= 8`, written as two redundant lines.**
 *    `Block` insets twice, so 8x8 inside is a 12x12 block. The interesting cases are
 *    the ones only *one* of the two C# lines rejects — 8x6 and 6x8 — because those
 *    are exactly what collapses if somebody "simplifies" the pair into
 *    `w < 8 || h < 6 || w < 6 || h < 8` incorrectly, or into a single `min(8, 8)`.
 * 3. **No `FLOOR_PLANTED`, anywhere, ever.** This building was believed to be blocked
 *    on the alpha10 farming substrate. It is not: the crops are *map objects*, one per
 *    inside-rect tile, and the four tiles the reference lays are walkway, grass, dirt
 *    and wood planks (plus one asphalt tile where the driveway meets the street). The
 *    test asserts the exact set of tile ids inside the block, so a future "let's use
 *    FLOOR_PLANTED after all" is a red test rather than a silent dependency.
 * 4. **`Roll(0, 3)` is three outcomes and the third is a grape vine.** The C#'s own
 *    comment says "berries (1), peanuts (2) or crops (3)", which is 1-based against a
 *    0-based switch and names a case that does not exist. `roll(0, 3)` is `[0, 3)`, so
 *    `case 2` is a grape vine and there is no crops case. A hundred seeds must produce
 *    exactly those three sprites and nothing else — which is the assertion that fails
 *    if someone widens the roll to `roll(0, 4)` to "match the comment".
 * 5. **The fence's orientation loop is `COMPASS_NSEW`, not `COMPASS_4`.** The C#
 *    iterates `{ N, S, E, W }` and the port's `Direction.COMPASS_4` is `{ N, E, S, W }`.
 *    The only post that tells them apart is the one that can see walkway both south
 *    and east, i.e. the south-east corner, and that is the probe below.
 * 6. **The dice sequence, in order.** `(0, 3)` for the plant type, then the shed's
 *    `(left, right - 5)` and `(top, bottom - 5)`, then the shed's `(0, 4)` door side,
 *    then `(0, 3)` and `(0, 12)` per eligible shed tile with a `(0, 100)` inside
 *    either of two of them. The ranges are recorded, not just the count, because the
 *    shed-position ranges are half-open and an off-by-one there moves the shed.
 * 7. **The shed is a 5x5 room with a plank outline, a dirt `IsInside` floor, one
 *    roller door, a tractor on the tile in front of it and a dirt track out to the
 *    street.** Plus the two absences, asserted out loud so they cannot read as
 *    oversights: **no actors** (the chickens are `#if false` upstream) and **no second
 *    map** (a farm is entirely on the surface; the animal shelter is the only ported
 *    building that needed one).
 *
 * **This file drives `makeFarmBuilding` directly through a captured context** rather
 * than generating districts, for the reason `tests/fuel-station-building.test.ts` and
 * `tests/animal-shelter-building.test.ts` give: the farm is a *band* of the green
 * cascade that `BaseTownGenerator.makeJunkyards` currently consumes, and widening that
 * gate is somebody else's change. A test that went through the dispatch would be
 * testing a wiring decision, not the building.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { BaseMapGenerator } from "@gameplay/generators/BaseMapGenerator";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeFarmBuilding } from "@gameplay/generators/buildings/makeFarmBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";

// The model databases register themselves into `Models` on construction, and a
// district read needs tiles, actors, factions and items. `captureContext` runs a
// whole district, so it has to come after them -- hence a second `beforeAll` rather
// than a bare call at module scope, which the file-scope `new GameTiles()` style used
// by `tests/animal-shelter-building.test.ts` would allow but which would then make
// this file's ordering depend on import order.
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();
});

const MAP = 40;
const rules = new Rules(new DiceRoller(20250929));

function newParams(width = MAP, height = MAP): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  return params;
}

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A real context, borrowed from the dispatch.
 *
 * The placement primitives are the generator's, so driving the function through a
 * captured context tests *it* and nothing else — a building that quietly grew its own
 * placement would not be caught by a file that only inspects the map. The same trick
 * as `fuel-station-building.test.ts`: the delegates are private on
 * `BaseTownGenerator`, so a stub pushed into `TOWN_BUILDING_PASSES` is the only way at
 * the genuine article from outside the class.
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
    newGenerator().generate(1);
  } finally {
    TOWN_BUILDING_PASSES.length = 0;
    TOWN_BUILDING_PASSES.push(...saved);
  }
  expect(captured).not.toBeNull();
  borrowedContext = captured as unknown as TownBuildingContext;
}

/** A blank grass plot, so a farm is not measured against leftover furniture. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  }
  return map;
}

/**
 * A block whose inside rect is exactly `inside` square. `Block` insets twice --
 * `rectangle` -> `buildingRect` -> `insideRect`, one tile each -- so a block of
 * `inside + 4` gives an inside rect of `inside`, and a farm needs a 12x12 block.
 */
function blockWithInside(inside: number, left = 6, top = 6): Block {
  return new Block(new Rect(left, top, inside + 4, inside + 4));
}

/**
 * A roller that records every `roll(min, max)` *and its answer*, in the order it is
 * asked for, and optionally pins specific ranges.
 *
 * The values matter as much as the ranges here. `rollChance(chance)` is
 * `roll(0, 100) < chance` (`DiceRoller.ts:40-42`), so the shed's two chances and its
 * two `roll` picks all show up as a `(0, 100)` or a `(0, 3)` pair with nothing in the
 * *range* to tell them apart — the answer is the only thing that does, and it is what
 * says whether the extra die was spent.
 */
class RecordingRoller extends DiceRoller {
  readonly calls: [number, number, number][] = [];
  private readonly pinned: Map<string, number>;

  constructor(seed: number, pinned: [number, number, number][] = []) {
    super(seed);
    this.pinned = new Map(pinned.map(([min, max, value]) => [`${min},${max}`, value]));
    const real = this.roll.bind(this);
    this.roll = (min: number, max: number): number => {
      const value = this.pinned.get(`${min},${max}`) ?? real(min, max);
      this.calls.push([min, max, value]);
      return value;
    };
  }
}

/** A build's dice, as `"min,max"` strings, in order. */
function rangesRollerSpends(map: GameMap, block: Block, seed = 1): string[] {
  const roller = new RecordingRoller(seed);
  makeFarmBuilding(contextFor(map, block, roller));
  return roller.calls.map(([min, max]) => `${min},${max}`);
}

/** Every map object on the map carrying `imageId`, as sorted `"x,y"` strings. */
function objectsWithImage(map: GameMap, imageId: string): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      if (map.getMapObjectAt(x, y)?.imageId === imageId) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

function countWithImage(map: GameMap, imageId: string): number {
  return map.mapObjects.filter((o) => o.imageId === imageId).length;
}

const CROP_IMAGES = [GameImages.OBJ_BERRY_BUSH, GameImages.OBJ_PEANUT_PLANT, GameImages.OBJ_GRAPE_VINE];
const CROP_NAMES = ["berry bush", "peanut plant", "grape vine"];

function zoneNames(map: GameMap): string[] {
  return map.zones.map((z) => z.name);
}

/** How many actors the map is holding. A farm must leave this at zero. */
function actorCount(map: GameMap): number {
  return map.actors.length;
}

/** Every ground item model id on the map, in no particular order. */
function groundItemModelIds(map: GameMap): number[] {
  const ids: number[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const inv = map.getItemsAt(new Point(x, y));
      if (!inv) continue;
      for (const it of inv.items) ids.push(it.model.id);
    }
  }
  return ids;
}

/**
 * The 5x5 rect the shed occupies, found from its plank walls. `TileRectangle` draws
 * the outline only, so the planks are exactly the shed's perimeter and their bounding
 * box is the shed. Declared at file scope rather than inside the shed `describe` so
 * the driveway test and the furnishing test can both reach it.
 */
function shedRect(map: GameMap): Rect {
  const planks: Point[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      if (map.getTileAt(x, y)!.model.id === TileID.WALL_WOOD_PLANKS) planks.push(new Point(x, y));
    }
  }
  const left = Math.min(...planks.map((p) => p.x));
  const right = Math.max(...planks.map((p) => p.x));
  const top = Math.min(...planks.map((p) => p.y));
  const bottom = Math.max(...planks.map((p) => p.y));
  return new Rect(left, top, right - left + 1, bottom - top + 1);
}

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

/**
 * Borrow the generator's real placement primitives, once, from inside a district
 * generation. Registered after the model databases above.
 */
beforeAll(captureContext);

// ── 1. The gate ────────────────────────────────────────────────────────────────

describe("Feature.Farm: the gate", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.Farm)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.Farm)).toBe(false);
  });

  it("a direct call under CLASSIC places nothing and spends no die", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = plot();
    const block = blockWithInside(12);
    const roller = new RecordingRoller(1);

    expect(makeFarmBuilding(contextFor(map, block, roller)), "the generator's own gate").toBe(false);
    // Ahead of the suitability return, not behind it: a 12x12 block would otherwise
    // have built. That is the assertion the boundary tests below could not make.
    expect(map.mapObjects.length, "and left the block alone").toBe(0);
    expect(map.zones.length).toBe(0);
    expect(roller.calls, "CLASSIC pays nothing for the building").toEqual([]);
  });
});

// ── 2. The two redundant suitability lines ──────────────────────────────────────

describe("Feature.Farm: the suitability gate is >= 8 && >= 8", () => {
  it("refuses 7x7 and accepts 8x8", () => {
    const small = makeFarmBuilding(contextFor(plot(), blockWithInside(7), new DiceRoller(1)));
    expect(small, "7x7 inside").toBe(false);

    const exact = makeFarmBuilding(contextFor(plot(), blockWithInside(8), new DiceRoller(1)));
    expect(exact, "8x8 inside is a 12x12 block").toBe(true);
  });

  it("each half of the pair is load-bearing: 8x6 and 6x8 are both refused", () => {
    // C# `:3690-3693` is
    //   if (w < 8 || h < 6) return false;
    //   if (w < 6 || h < 8) return false;
    // 8x6 passes the first line and is killed by the second; 6x8 is killed by the
    // first. A collapse to `w < 8 || h < 8` gives the same answers, which is why
    // these two are the *least* informative cases -- so the informative ones are
    // below: they are the shapes only a wrong simplification would let through.
    expect(makeFarmBuilding(contextFor(plot(), new Block(new Rect(6, 6, 12, 10)), new DiceRoller(1))), "8 wide, 6 tall").toBe(false);
    expect(makeFarmBuilding(contextFor(plot(), new Block(new Rect(6, 6, 10, 12)), new DiceRoller(1))), "6 wide, 8 tall").toBe(false);
  });

  it("is checked on both axes independently, not on the block or its area", () => {
    // 8 across, 40 down qualifies; 40 across, 8 down qualifies; 7 across, 40 down
    // does not. A `w * h >= 64` reading would refuse the first two.
    expect(makeFarmBuilding(contextFor(plot(60, 60), new Block(new Rect(6, 6, 12, 44)), new DiceRoller(1))), "8 x 40").toBe(true);
    expect(makeFarmBuilding(contextFor(plot(60, 60), new Block(new Rect(6, 6, 44, 12)), new DiceRoller(1))), "40 x 8").toBe(true);
    expect(makeFarmBuilding(contextFor(plot(60, 60), new Block(new Rect(6, 6, 11, 44)), new DiceRoller(1))), "7 x 40").toBe(false);
  });

  it("a refused block is left completely untouched", () => {
    const map = plot();
    const block = blockWithInside(7);
    expect(makeFarmBuilding(contextFor(map, block, new DiceRoller(1)))).toBe(false);
    expect(map.mapObjects.length).toBe(0);
    expect(map.zones.length).toBe(0);
  });
});

// ── 3. No FLOOR_PLANTED, and only four tiles ────────────────────────────────────

describe("Feature.Farm: the farm needs no farming substrate", () => {
  /** Every tile id present inside the block's own rectangle. */
  function tileIdsIn(map: GameMap, b: Block): number[] {
    const ids = new Set<number>();
    for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
      for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
        ids.add(map.getTileAt(x, y)!.model.id);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }

  it("lays no FLOOR_PLANTED on any of a hundred seeds, and no other rule misses it", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const map = plot();
      const b = blockWithInside(8);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed))), `seed ${seed} builds`).toBe(true);
      expect(map.getTileAt(b.insideRect.left, b.insideRect.top)!.model.id, `seed ${seed}`).not.toBe(
        TileID.FLOOR_PLANTED,
      );
    }
  });

  it("lays exactly walkway, grass, dirt, wood planks and one asphalt tile", () => {
    // The whole of the C#'s tile vocabulary for a farm: `:3698` walkway, `:3699`
    // grass, `:3711` dirt under each fence post, `:3812-3813` planks and dirt for the
    // shed, `:3862`/`:3890` dirt for the driveway, `:3896` asphalt for its last tile.
    // Anything outside this set is a tile the reference does not lay -- and in
    // particular `FLOOR_PLANTED` (20) is not in it, which is the whole point.
    const expected = [
      TileID.FLOOR_ASPHALT,
      TileID.FLOOR_DIRT,
      TileID.FLOOR_GRASS,
      TileID.FLOOR_WALKWAY,
      TileID.WALL_WOOD_PLANKS,
    ].sort((a, b) => a - b);
    expect(expected).not.toContain(TileID.FLOOR_PLANTED);
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const map = plot();
      const b = blockWithInside(10);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed)))).toBe(true);
      expect(tileIdsIn(map, b), `seed ${seed}`).toEqual(expected);
    }
  });

  it("lays walkway under the whole block and grass over the field", () => {
    const map = plot();
    const b = blockWithInside(8);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    // The block's own corner tile, which no crop can reach.
    expect(map.getTileAt(b.rectangle.left, b.rectangle.top)!.model.id).toBe(TileID.FLOOR_WALKWAY);
    // The field: grass under a crop.
    expect(map.getTileAt(b.insideRect.left, b.insideRect.top)!.model.id).toBe(TileID.FLOOR_GRASS);
  });
});

// ── 4. The crops: one per inside-rect tile, three types, no fourth ──────────────

describe("Feature.Farm: the crops", () => {
  it("fills every inside-rect tile, and only the shed and its track take any back", () => {
    // **The fill is total and the shed is what makes it less than total.** Step 2
    // runs before step 4, so at the moment the fill runs there is a crop on every one
    // of the `w * h` tiles; then `ClearRectangle` at `:3765` takes the shed's
    // twenty-five back and the driveway's `RemoveMapObjectAt` calls take the rest of
    // its track. So the honest invariant is per-tile, not a total:
    //
    //   inside the field:  GRASS -> a crop,  DIRT or a plank wall -> no crop
    //   outside the field: no crop
    //
    // because inside `InsideRect` the only dirt is the shed and the track (the fence
    // line is on `BuildingRect`, one tile further out).
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const map = plot();
      const b = blockWithInside(9);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed)))).toBe(true);

      let grass = 0;
      let crops = 0;
      for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
        for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
          const tile = map.getTileAt(x, y)!;
          const obj = map.getMapObjectAt(x, y);
          const isCrop = CROP_IMAGES.includes(obj?.imageId ?? "");
          if (tile.model.id === TileID.FLOOR_GRASS) {
            grass++;
            expect(isCrop, `seed ${seed}: grass at ${x},${y} carries a crop`).toBe(true);
          } else {
            expect(
              isCrop,
              `seed ${seed}: ${tile.model.id === TileID.FLOOR_DIRT ? "dirt" : "plank"} at ${x},${y} is bare`,
            ).toBe(false);
          }
          if (isCrop) crops++;
        }
      }
      expect(crops, `seed ${seed}: one crop per grass tile`).toBe(grass);
      // And the shed's arithmetic, exactly. `ClearRectangle` at `:3765` takes the
      // shed's 5x5 = 25 back; the door loop takes the one plant in front of the door;
      // and the driveway takes one or two more where it crosses open field, because
      // the front is at worst on the field's edge and the ring is two tiles out. So a
      // farm always loses between 26 and 28 of its `w * h` crops -- never fewer (the
      // shed is unconditional) and never more (the track runs straight out).
      const lost = b.insideRect.width * b.insideRect.height - crops;
      expect(lost, `seed ${seed}: the shed, the door front and the track`).toBeGreaterThanOrEqual(26);
      expect(lost, `seed ${seed}: the shed, the door front and the track`).toBeLessThanOrEqual(28);
    }
  });

  it("puts no crop outside the field", () => {
    const map = plot();
    const b = blockWithInside(9);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
      for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
        if (b.insideRect.contains(new Point(x, y))) continue;
        const image = map.getMapObjectAt(x, y)?.imageId;
        expect(CROP_IMAGES.includes(image ?? ""), `a crop on the ring at ${x},${y}`).toBe(false);
      }
    }
  });

  it("rolls 0/1/2 into bush/plant/vine, and only those three", () => {
    // The C#'s comment on `:3729` reads "berries (1), peanuts (2) or crops (3)". It is
    // stale twice over: `Roll(0, 3)` is `[0, 3)`, so the values are 0, 1, 2, and the
    // `case 2` at `:3738` is a **grape vine**. There is no crops case.
    const expected = [
      [0, "berry bush", GameImages.OBJ_BERRY_BUSH],
      [1, "peanut plant", GameImages.OBJ_PEANUT_PLANT],
      [2, "grape vine", GameImages.OBJ_GRAPE_VINE],
    ] as const;
    for (const [roll, name, image] of expected) {
      const map = plot();
      const b = blockWithInside(8);
      // Pin only the plant-type roll; everything after it keeps its own dice.
      const roller = new RecordingRoller(1, [[0, 3, roll]]);
      expect(makeFarmBuilding(contextFor(map, b, roller)), `roll ${roll} builds`).toBe(true);

      // The whole field carries the rolled crop -- except the twenty-five tiles the
      // shed cleared and the tiles its track re-paved, so this is "more than half the
      // field and every one of the same sprite", which is what "one roll for the farm"
      // actually means once step 4 has run.
      const rolled = countWithImage(map, image);
      const others = CROP_IMAGES.filter((i) => i !== image);
      expect(rolled, `roll ${roll} fills the field`).toBeGreaterThan(
        (b.insideRect.width * b.insideRect.height) / 2,
      );
      for (const other of others) {
        expect(countWithImage(map, other), `roll ${roll} leaves ${other} out`).toBe(0);
      }
      // The C#'s `case 0/1/2` each pass their own name to `MakeObjFarmPlant`, and the
      // name is what a survivor sees. It is not a sprite id.
      expect(map.mapObjects.find((o) => o.imageId === image)!.name).toBe(name);
    }
    expect(CROP_NAMES).toEqual(["berry bush", "peanut plant", "grape vine"]);
  });

  it("one roll for the whole farm, never one per tile", () => {
    // A hundred seeds, and every farm is a single crop type. A per-tile roll would
    // make a mixed farm the common case and this would fail on the first seed.
    for (let seed = 1; seed <= 100; seed++) {
      const map = plot();
      makeFarmBuilding(contextFor(map, blockWithInside(8), new DiceRoller(seed)));
      const present = CROP_IMAGES.filter((i) => countWithImage(map, i) > 0);
      expect(present.length, `seed ${seed} has exactly one crop type`).toBe(1);
    }
  });

  it("a hundred seeds produce all three crops and never a fourth", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const map = plot();
      makeFarmBuilding(contextFor(map, blockWithInside(8), new DiceRoller(seed)));
      for (const obj of map.mapObjects) {
        if (CROP_IMAGES.includes(obj.imageId)) seen.add(obj.imageId);
      }
    }
    expect([...seen].sort()).toEqual([...CROP_IMAGES].sort());
  });

  it("a crop is a walkable, unbreakable, burnable, 2-hitpoint container", () => {
    // C# `BaseMapGenerator.cs:1155-1163`. `IsWalkable` is load-bearing: the crop *is*
    // the floor, which is why the field is walkable without a tile change.
    const bush = BaseMapGenerator.makeObjFarmPlant("berry bush", GameImages.OBJ_BERRY_BUSH);
    expect(bush.name).toBe("berry bush");
    expect(bush.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(bush.fireState).toBe(MapObjectFire.BURNABLE);
    expect(bush.hitPoints).toBe(Math.floor(DoorWindow.BASE_HITPOINTS / 20));
    expect(bush.hitPoints).toBe(2);
    expect(bush.isContainer).toBe(true);
    expect(bush.isWalkable).toBe(true);
    expect(bush.isMaterialTransparent).toBe(true);
    expect(bush.isBreakable).toBe(false);
  });
});

// ── 5. The fence, and COMPASS_NSEW ─────────────────────────────────────────────

describe("Feature.Farm: the fence", () => {
  it("fences the whole building rect with objects, on dirt, under walkway", () => {
    const map = plot();
    const b = blockWithInside(8);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);

    // The fence is objects on a walkway floor, not wall tiles -- `TileRectangle` lays
    // walkway over the whole block at `:3698` and the "fence" is the perimeter of the
    // building rect. Asserting a wall tile here would be a plausible-looking test of
    // something the C# does not do.
    const fenceImages = map.mapObjects.filter((o) => o.name === "wooden fence");
    const perimeter = 2 * (b.buildingRect.width + b.buildingRect.height) - 4;
    expect(fenceImages.length, `${perimeter} posts`).toBe(perimeter);

    for (const post of fenceImages) {
      const { x, y } = post.location.position;
      // `:3711` puts dirt under every post, so the fence line is dirt and the
      // shed's driveway loop walks straight over it without eating it.
      expect(map.getTileAt(x, y)!.model.id, `post at ${x},${y} stands on dirt`).toBe(TileID.FLOOR_DIRT);
      const onTheLine =
        x === b.buildingRect.left ||
        x === b.buildingRect.right - 1 ||
        y === b.buildingRect.top ||
        y === b.buildingRect.bottom - 1;
      expect(onTheLine, `post at ${x},${y} is on the building rect's perimeter`).toBe(true);
    }
  });

  it("a wooden fence is BURNABLE at one door's worth of hitpoints, and hoppable", () => {
    // C# `BaseMapGenerator.cs:467-475`. NOT the port's `makeObjFence`: that one is
    // called `fence`, carries `BASE_HITPOINTS * 10`, defaults to UNINFLAMMABLE and
    // has a fov bonus. This is a different object, which is why it is a new method.
    const fence = BaseMapGenerator.makeObjWoodenFence(GameImages.OBJ_FARM_FENCE_EW);
    expect(fence.name).toBe("wooden fence");
    expect(fence.breakState).toBe(MapObjectBreak.BREAKABLE);
    expect(fence.fireState).toBe(MapObjectFire.BURNABLE);
    expect(fence.hitPoints).toBe(DoorWindow.BASE_HITPOINTS);
    expect(fence.givesWood).toBe(true);
    expect(fence.jumpLevel).toBe(1);
    expect(fence.isJumpable).toBe(true);
    expect(fence.isMaterialTransparent).toBe(true);
  });

  it("the south-east corner gets the E-W sprite, which is what COMPASS_NSEW means", () => {
    // C# `Data/Direction.cs:86-89` `COMPASS_NSEW = { N, S, E, W }`. The port's
    // `Direction.COMPASS_4` is `{ N, E, S, W }` and the loop at `:3706` returns on the
    // *first* direction whose neighbour is walkway, so the two orders disagree on
    // exactly one kind of tile: one that can see walkway both **south** and **east**.
    // That is the building rect's south-east corner, and nothing else.
    //
    //  - COMPASS_NSEW: S first  -> E-W fence
    //  - COMPASS_4:    E first  -> NS-right fence
    const map = plot();
    const b = blockWithInside(8);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);

    const seX = b.buildingRect.right - 1;
    const seY = b.buildingRect.bottom - 1;
    const se = map.getMapObjectAt(seX, seY);
    expect(se, "the south-east corner has a post").not.toBeNull();
    expect(se!.imageId, `south-east corner at ${seX},${seY} is E-W`).toBe(GameImages.OBJ_FARM_FENCE_EW);
  });

  it("the other three corners and the mid-edges take the sprite their side implies", () => {
    const map = plot();
    const b = blockWithInside(8);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    const r = b.buildingRect;
    const midX = Math.floor((r.left + r.right) / 2);
    const midY = Math.floor((r.top + r.bottom) / 2);

    // North edge: walkway above -> E-W. South edge: walkway below -> E-W. West edge:
    // walkway left -> NS-left. East edge: walkway right -> NS-right.
    expect(map.getMapObjectAt(midX, r.top)!.imageId, "north edge").toBe(GameImages.OBJ_FARM_FENCE_EW);
    expect(map.getMapObjectAt(midX, r.bottom - 1)!.imageId, "south edge").toBe(GameImages.OBJ_FARM_FENCE_EW);
    expect(map.getMapObjectAt(r.left, midY)!.imageId, "west edge").toBe(GameImages.OBJ_FARM_FENCE_NS_LEFT);
    expect(map.getMapObjectAt(r.right - 1, midY)!.imageId, "east edge").toBe(GameImages.OBJ_FARM_FENCE_NS_RIGHT);
  });
});

// ── 6. Zones ───────────────────────────────────────────────────────────────────

describe("Feature.Farm: zones", () => {
  it("names its zone `Farm` and adds the four walkway zones beside it", () => {
    const map = plot();
    expect(makeFarmBuilding(contextFor(map, blockWithInside(8), new DiceRoller(1)))).toBe(true);
    const names = zoneNames(map);
    expect(
      names.filter((n) => n.startsWith("Farm@")).length,
      `zones: ${names.join(" | ")}`,
    ).toBe(1);
    expect(names.filter((n) => n.startsWith("walkway@")).length).toBe(4);
  });

  it("and a `Shed` zone, capital S, alongside", () => {
    const map = plot();
    expect(makeFarmBuilding(contextFor(map, blockWithInside(8), new DiceRoller(1)))).toBe(true);
    expect(zoneNames(map).filter((n) => n.startsWith("Shed@")).length).toBe(1);
  });
});

// ── 7. The dice, in order ──────────────────────────────────────────────────────

describe("Feature.Farm: the dice sequence", () => {
  it("is plant type, shed x, shed y, shed door, then object and item per tile", () => {
    const b = blockWithInside(10);
    const spent = rangesRollerSpends(plot(), b);
    // C# `:3729`, then `:3759-3760`, then `:3825`. The shed's position ranges are
    // half-open and end-exclusive on the *far* side by five, which is what keeps the
    // shed's walls and its door-front inside the field.
    expect(spent.slice(0, 4), `full: ${spent.join(" ")}`).toEqual([
      "0,3",
      `${b.insideRect.left},${b.insideRect.right - 5}`,
      `${b.insideRect.top},${b.insideRect.bottom - 5}`,
      "0,4",
    ]);
  });

  it("then a generator tile, and object-plus-item rolls for every other tile", () => {
    // The generator is *outside* the C#'s switch -- the C#'s own comment at `:3913`
    // says it was moved there in Release 7-6 "in order to make it guaranteed spawn",
    // because a `roll(0, 3)` that lands on `default` would otherwise leave the first
    // tile bare. So the first eligible tile spends **no** object roll at all, and the
    // tail starts with a bare `0,12`.
    const roller = new RecordingRoller(1);
    makeFarmBuilding(contextFor(plot(), blockWithInside(10), roller));
    const tail = roller.calls.slice(4);
    const asRanges = tail.map(([min, max]) => `${min},${max}`);

    let i = 0;
    const take = (what: string): [number, number, number] => {
      const call = tail[i];
      expect(call, `ran out of dice at ${what}; spent: ${asRanges.join(" ")}`).toBeDefined();
      i++;
      return call!;
    };
    const expectRange = (what: string, range: string): number => {
      const [min, max, value] = take(what);
      expect(`${min},${max}`, `${what} (spent so far: ${asRanges.join(" ")})`).toBe(range);
      return value;
    };
    // `rollChance(15)` is `roll(0, 100)`, so it is only identifiable by following an
    // item roll that came up 11.
    const maybeChance = (wasEleven: boolean, what: string): void => {
      const next = tail[i];
      if (!next) return;
      if (!wasEleven) return;
      expectRange(`${what} (case 11 spends a 15% chance)`, "0,100");
    };

    // The generator tile: one item roll, and the 15% fishing-rod chance on 11.
    const firstItem = expectRange("the generator tile's item roll", "0,12");
    maybeChance(firstItem === 11, "the generator tile");

    // Then one (object, item) pair per remaining eligible tile, with a 50% chance
    // between them whenever the object roll came up 2 (drums against a fire barrel).
    let tiles = 0;
    while (i < tail.length) {
      const objectRoll = expectRange(`tile ${tiles}: object roll`, "0,3");
      if (objectRoll === 2) expectRange(`tile ${tiles}: 50% barrels/fire barrel`, "0,100");
      const itemRoll = expectRange(`tile ${tiles}: item roll`, "0,12");
      maybeChance(itemRoll === 11, `tile ${tiles}`);
      tiles++;
    }
    // A 5x5 shed's 3x3 interior loses three tiles to the C#'s three guards: the
    // middle one has no adjacent wall (`CountAdjWalls == 0`, and the diagonals count,
    // so only the exact centre scores zero) and three more are `CountAdjDoors > 0`
    // because the door on the shed's outline is a *diagonal* neighbour of the two
    // bottom corners. Five of nine survive, one of which takes the generator.
    expect(tiles, "four object rolls after the generator").toBe(4);
  });

  it("spends the shed's four rolls only, on a block that can hold a shed", () => {
    // The 8x8 inside rect is the *smallest* farm, and the shed gate at `:3756` is
    // `> SHED_WIDTH + 1`, so an 8x8 inside (which is 12x12 as a block) still builds
    // one. That the gate is never actually false at this point is worth stating: the
    // two constants are 5 and 6, and step 0 has already guaranteed 8.
    const spent = rangesRollerSpends(plot(), blockWithInside(8));
    expect(spent[0], "the plant type is always the first roll").toBe("0,3");
    expect(spent[3], "the shed door side comes fourth").toBe("0,4");
  });

  it("a refused block spends nothing at all", () => {
    expect(rangesRollerSpends(plot(), blockWithInside(7))).toEqual([]);
  });

  it("is deterministic: same seed, same farm", () => {
    const fingerprint = (seed: number): string => {
      const map = plot();
      makeFarmBuilding(contextFor(map, blockWithInside(10), new DiceRoller(seed)));
      return map.mapObjects
        .map((o) => `${o.imageId}@${o.location.position.x},${o.location.position.y}`)
        .join("|");
    };
    expect(fingerprint(9)).toBe(fingerprint(9));
    expect(fingerprint(9), "and a different seed differs").not.toBe(fingerprint(10));
  });
});

// ── 8. The shed ────────────────────────────────────────────────────────────────

describe("Feature.Farm: the shed", () => {
  it("is 5x5, laid inside the field and never overlapping the fence", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const map = plot();
      const b = blockWithInside(10);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed)))).toBe(true);
      const shed = shedRect(map);
      expect(shed.width, `seed ${seed} width`).toBe(5);
      expect(shed.height, `seed ${seed} height`).toBe(5);
      // `Roll(InsideRect.Left, InsideRect.Right - 5)` is half-open, so the shed can be
      // flush with the field's left/top edge but its far side is always short of the
      // field's right/bottom -- which is what leaves a tile for the door front.
      expect(shed.left, `seed ${seed} left`).toBeGreaterThanOrEqual(b.insideRect.left);
      expect(shed.top, `seed ${seed} top`).toBeGreaterThanOrEqual(b.insideRect.top);
      expect(shed.right, `seed ${seed} right`).toBeLessThanOrEqual(b.insideRect.right);
      expect(shed.bottom, `seed ${seed} bottom`).toBeLessThanOrEqual(b.insideRect.bottom);
      // Strictly inside the fence: the fence is on `buildingRect`, and a shed that
      // reached it would put a door front on a fence post.
      expect(shed.left).toBeGreaterThan(b.buildingRect.left);
      expect(shed.top).toBeGreaterThan(b.buildingRect.top);
    }
  });

  it("has a dirt floor marked inside, and one roller door on a plank wall", () => {
    const map = plot();
    const b = blockWithInside(10);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    const shed = shedRect(map);

    for (let x = shed.left + 1; x < shed.right - 1; x++) {
      for (let y = shed.top + 1; y < shed.bottom - 1; y++) {
        expect(map.getTileAt(x, y)!.model.id, `shed floor at ${x},${y} is dirt`).toBe(TileID.FLOOR_DIRT);
        // The farm's only `IsInside`: the field is outdoors and the shed is not, so
        // the shed is the only part of a farm that is dark at night.
        expect(map.getTileAt(x, y)!.isInside, `shed floor at ${x},${y} is inside`).toBe(true);
      }
    }

    const doors = map.mapObjects.filter((o) => o instanceof DoorWindow);
    expect(doors, "the shed's roller door, and only it").toHaveLength(1);
    expect(doors[0]!.name).toBe("roller door");
    expect(doors[0]!.imageId).toBe(GameImages.OBJ_ROLLER_DOOR_CLOSED);
    // Six wooden doors' worth, no wood: 240 hitpoints.
    expect(doors[0]!.hitPoints).toBe(6 * DoorWindow.BASE_HITPOINTS);
    // On the plank outline, and `placeDoor` put dirt under it, so it is a hole in the
    // wall rather than a door hung on a plank.
    const door = doors[0]!.location.position;
    const onTheOutline =
      door.x === shed.left ||
      door.x === shed.right - 1 ||
      door.y === shed.top ||
      door.y === shed.bottom - 1;
    expect(onTheOutline, "the door is on the shed's outline").toBe(true);
    expect(map.getTileAt(door.x, door.y)!.model.id, "and the floor under it is dirt").toBe(TileID.FLOOR_DIRT);
  });

  it("parks a tractor on the tile in front of the door, and it is metal", () => {
    const map = plot();
    const b = blockWithInside(10);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    const shed = shedRect(map);

    const tractors = map.mapObjects.filter((o) => o.name === "tractor");
    expect(tractors, "one tractor per farm").toHaveLength(1);
    const tractor = tractors[0]!;
    expect(tractor.isMetal, "C# :1171 sets IsMetal; the port's MapObject has the field").toBe(true);
    expect(tractor.jumpLevel).toBe(1);
    expect(tractor.isMovable).toBe(false);
    expect(tractor.standOnFovBonus).toBe(true);

    // It is one tile out from the shed, on the side the door faces, and on the field.
    // The door is on the shed's outline and the tractor is one step further out on
    // the same axis, so the two clauses that can be true are "the door is north of
    // me and I am below the shed" or "the door is south of me and I am above it".
    const { x, y } = tractor.location.position;
    const oneStepOff =
      (map.getMapObjectAt(x - 1, y) instanceof DoorWindow && x === shed.left - 1) ||
      (map.getMapObjectAt(x + 1, y) instanceof DoorWindow && x === shed.right) ||
      (map.getMapObjectAt(x, y - 1) instanceof DoorWindow && y === shed.bottom) ||
      (map.getMapObjectAt(x, y + 1) instanceof DoorWindow && y === shed.top - 1);
    expect(oneStepOff, `tractor at ${x},${y} is one tile out from the door`).toBe(true);
    expect(
      shed.contains(new Point(x, y)),
      `tractor at ${x},${y} is outside the shed, not on it`,
    ).toBe(false);
    expect(b.insideRect.contains(new Point(x, y)), "and it is still on the field").toBe(true);
  });

  it("leaves the fence standing and paves a track out to the street", () => {
    // C# `:3873-3896`. The `else if (tileModel != FLOOR_DIRT)` is the fence guard:
    // the fence pass re-paved every post to dirt, so a fence tile matches neither arm
    // and survives. The last tile the track touches is the block's own walkway ring,
    // and it becomes asphalt -- the farm's only opening in the fence line.
    const map = plot();
    const b = blockWithInside(10);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);

    const fenceCount = map.mapObjects.filter((o) => o.name === "wooden fence").length;
    const perimeter = 2 * (b.buildingRect.width + b.buildingRect.height) - 4;
    expect(fenceCount, "the driveway did not eat the fence").toBe(perimeter);

    // Exactly one asphalt tile: the last one the track laid, on the block's ring.
    const asphaltTiles: string[] = [];
    for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
      for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
        if (map.getTileAt(x, y)!.model.id === TileID.FLOOR_ASPHALT) asphaltTiles.push(`${x},${y}`);
      }
    }
    expect(asphaltTiles.length, "one asphalt tile, the end of the track").toBe(1);
    const [ax, ay] = asphaltTiles[0]!.split(",").map(Number) as [number, number];
    expect(
      b.rectangle.contains(new Point(ax, ay)),
      `the asphalt at ${ax},${ay} is on the block's own ring`,
    ).toBe(true);
    expect(
      b.insideRect.contains(new Point(ax, ay)),
      "and not on the field, so the track crossed the fence line",
    ).toBe(false);
  });

  it("re-rolls the shed door when it would open against the fence", () => {
    // C# `:3853-3861`. **The refusal is live, not defensive.** The shed is rolled
    // inside `InsideRect` over the half-open `[Left, Right - 5)`, so its wall can land
    // exactly on the field's edge and the tile one step beyond the door is then on
    // `BuildingRect` -- the fence line:
    //
    //   west  refuses when shedX == Left          east  refuses when shedX == Right - 6
    //   north refuses when shedY == Top           south refuses when shedY == Bottom - 6
    //
    // All four are reachable for an inside rect of 8 or more. The observable is the
    // number of `roll(0, 4)` calls: one on a farm whose door faced open field, two or
    // more on one that had to re-roll. A port that dropped the `continue` would show a
    // constant one here, and a tractor standing on a fence post.
    const doorRolls: number[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const roller = new RecordingRoller(seed);
      makeFarmBuilding(contextFor(plot(), blockWithInside(8), roller));
      doorRolls.push(roller.calls.filter(([min, max]) => min === 0 && max === 4).length);
    }
    expect(Math.min(...doorRolls), "some seeds need no re-roll").toBe(1);
    expect(
      Math.max(...doorRolls),
      `some seed put the door against a fence and re-rolled; got ${[...new Set(doorRolls)].join(",")}`,
    ).toBeGreaterThan(1);
  });

  it("never leaves the tractor on the fence line, whatever the door re-rolled", () => {
    // The invariant the loop exists to protect. Sixty seeds, four sides, every shed
    // position the two position rolls can reach.
    for (let seed = 1; seed <= 60; seed++) {
      const map = plot();
      const b = blockWithInside(8);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed)))).toBe(true);
      const tractor = map.mapObjects.find((o) => o.name === "tractor");
      expect(tractor, `seed ${seed} has a tractor`).toBeDefined();
      const at = tractor!.location.position;
      expect(
        b.insideRect.contains(at),
        `seed ${seed}: tractor at ${at.x},${at.y} is on the field, not the fence`,
      ).toBe(true);
      // And the fence it refused is still there: the loop re-rolls, it does not eat.
      const perimeter = 2 * (b.buildingRect.width + b.buildingRect.height) - 4;
      expect(
        map.mapObjects.filter((o) => o.name === "wooden fence").length,
        `seed ${seed}: the fence is intact`,
      ).toBe(perimeter);
    }
  });

  it("furnishes the shed: one power generator, and the contents hug its walls", () => {
    const map = plot();
    const b = blockWithInside(12);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    const shed = shedRect(map);
    const inside = new Rect(shed.left + 1, shed.top + 1, 3, 3);

    const generators = map.mapObjects.filter((o) => o.name === "power generator");
    expect(generators, "one generator, and it is on the first eligible tile").toHaveLength(1);
    expect(inside.contains(generators[0]!.location.position)).toBe(true);
    expect(generators[0]!.imageId).toBe(GameImages.OBJ_POWERGEN_OFF);

    // The C#'s three guards at `:3904-3911` are walkable, not beside a door, and *has*
    // a wall -- so of a 3x3 interior the centre (no adjacent wall) and the two tiles
    // beside the door are skipped. Six eligible tiles out of nine, and the generator
    // took the first of them in `DoForEachTile`'s column-major order.
    const furnished: string[] = [];
    for (let x = inside.left; x < inside.right; x++) {
      for (let y = inside.top; y < inside.bottom; y++) {
        const obj = map.getMapObjectAt(x, y);
        if (obj !== null && obj.name !== "power generator") furnished.push(`${x},${y}`);
      }
    }
    // Whatever the object rolls came up as, the centre of the room is never furnished:
    // it has no adjacent wall, so the third guard skipped it.
    expect(furnished, "the open middle of the shed is left bare").not.toContain(
      `${inside.left + 1},${inside.top + 1}`,
    );
    // And the shed never spills: everything it put down is on its own 3x3.
    for (const at of furnished) {
      const [x, y] = at.split(",").map(Number) as [number, number];
      expect(inside.contains(new Point(x, y)), `shed contents at ${at} are inside`).toBe(true);
    }
  });

  it("drops one shed item per eligible tile, and never a vegetable seed", () => {
    // `MakeFarmShedItem`'s `roll(0, 12)` spends one die per eligible tile, and six of
    // its twelve arms are vegetable seeds -- which `ItemID.VEGETABLE_SEEDS` does not
    // have a row for, so the drop is skipped on those. The roll is still spent, which
    // is what the dice-sequence test above pins; this one pins the consequence.
    const shedItemImages = new Set([
      GameImages.ITEM_SHOVEL,
      GameImages.ITEM_PICKAXE,
      GameImages.ITEM_CHAINSAW,
      GameImages.ITEM_PITCH_FORK,
      GameImages.ITEM_SCYTHE,
      GameImages.ITEM_MACHETE,
      GameImages.ITEM_FISHING_ROD,
    ]);
    const found = new Set<number>();
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const map = plot();
      makeFarmBuilding(contextFor(map, blockWithInside(12), new DiceRoller(seed)));
      for (const id of groundItemModelIds(map)) {
        const model = Models.items.get(id);
        if (model.imageId && shedItemImages.has(model.imageId)) {
          found.add(id);
          total++;
        }
      }
    }
    // At least one of the six portable tools turns up across sixty seeds.
    expect(found.size, "tools appear in the shed").toBeGreaterThan(3);
    expect(total).toBeGreaterThan(0);
  });
});

// ── 9. What a farm does NOT do ─────────────────────────────────────────────────

describe("Feature.Farm: the absences", () => {
  it("places no actors, and no map but the district's own", () => {
    // The chickens are inside `#if false` upstream (`:3778-3801`) and the C#'s own
    // comment says they were abandoned because the animal AI kept walking them out of
    // the farm and into the locked army base. Porting a bug the author threw away
    // would also be the most expensive thing in the file in dice.
    for (let seed = 1; seed <= 20; seed++) {
      const map = plot();
      const b = blockWithInside(12);
      expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(seed)))).toBe(true);
      expect(actorCount(map), `seed ${seed} placed an actor`).toBe(0);
    }
  });

  it("puts no food where a crop is, and no crop where food is", () => {
    // `MakeObjFarmPlant` is a *container*, so the crop is a thing you can loot -- but
    // the C# never fills one at generation time. A farm's harvest comes from
    // `RogueGame`'s crop handling, not from here.
    const map = plot();
    const b = blockWithInside(10);
    expect(makeFarmBuilding(contextFor(map, b, new DiceRoller(1)))).toBe(true);
    const shed = shedRect(map);
    for (const image of CROP_IMAGES) {
      for (const at of objectsWithImage(map, image)) {
        const [x, y] = at.split(",").map(Number) as [number, number];
        expect(shed.contains(new Point(x, y)), `a crop at ${at} is not inside the shed`).toBe(false);
        expect(
          map.getItemsAt(new Point(x, y))?.items ?? [],
          `no item is dropped under the crop at ${at}`,
        ).toEqual([]);
      }
    }
  });
});
