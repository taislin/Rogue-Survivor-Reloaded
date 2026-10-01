import { beforeAll, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Barrel, DoorWindow } from "@engine/mapobjects/MapObjects";
import { ItemMeleeWeapon } from "@engine/items/ItemWeapon";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import {
  BaseTownGenerator,
  Block,
  Parameters,
} from "@gameplay/generators/BaseTownGenerator";
import {
  makeBasketballCourtBuilding,
  makeTennisCourtBuilding,
} from "@gameplay/generators/buildings/makeSportsCourts";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.SportsCourts` — the C#'s `MakeTennisCourt` (`BaseTownGenerator.cs:5858`) and
 * `MakeBasketballCourt` (`:5968`), and the four factories the port had to transcribe
 * for them.
 *
 * These are the *narrowest* two gates in the whole C# generator set and the file
 * exists mostly because of that plus four things a plausible port gets wrong, none of
 * which throws:
 *
 * 1. **The size gates are exact `buildingRect` equality, and there are only two of
 *    them in the reference.** `Width != 8 || Height != 10` for tennis and
 *    `Width != 10 || Height != 8` for basketball. Every other building generator
 *    asks for a minimum; the fuel station is the only one with a window. A court
 *    cannot be a minimum because step 2 is a **fixed list of 48 tile models handed to
 *    the interior tiles in visit order**: a 9x10 building rect has 7x8 = 56 interior
 *    tiles and the list runs dry at 48, so `listOfTilesToPlace[toPlaceIndex]` is
 *    `null`. `Block` insets twice, so a building rect of 8x10 is a *block* of 10x12
 *    and a basketball court is a block of 12x10 — which also means the two can never
 *    be the same block, and both are the same shape transposed.
 * 2. **The entrance `default` IS the roll-2 case.** `Roll(0, 4)` is
 *    `System.Random.Next(0, 4)`, exclusive of max, so the roll is `[0, 4)` and the
 *    C#'s switch on `case 0 / case 1 / case 3 / default:` has no `case 2` because
 *    `default` is it. This is the **opposite** of `makeFuelStationBuilding`, whose
 *    two switches handle `0..3` with no default and whose `case 4` is dead code.
 *    Normalising the two files to look alike would be a behaviour change in one of
 *    them, so the test pins all four faces on both courts by position.
 * 3. **`RemoveMapObjectAt` before the gate is load-bearing.** Step 1 fences every
 *    perimeter tile and all four entrance positions are perimeter tiles. The C#'s
 *    `PlaceMapObjectAt` throws on an occupied tile; the port's `ctx.mapObjectPlace`
 *    declines one. So without the removal the port builds a court with a fence and
 *    **no gate**, silently, on all four sides. The test asserts the fence count is
 *    *perimeter minus one* and a `DoorWindow` is standing there.
 * 4. **The two break numbers are 72 and 71 and both are unreachable, and the
 *    basketball comment is wrong.** Simulating the loops: the real 48th (and last)
 *    placement is at `globalPieceIndex == 71` for tennis and `== 69` for basketball, so
 *    the `else break` at `toPlaceIndex == 47` always fires first and the
 *    `globalPieceIndex` guard only ever fires afterwards, on a perimeter tile the
 *    `continue` would have skipped. The C#'s basketball comment says "70 is the last
 *    global piece", which is off by one against tennis's "71" *and* off by one against
 *    the 69 it is attached to. Both comments are preserved verbatim in the port; the
 *    correction is recorded here and in the constants' doc comments, and the two
 *    indices are asserted here so a future "fix" cannot quietly renumber the mosaic.
 *
 * The dispatch itself (`if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))`
 * at `:555`, sharing the one `RollChance(ParkBuildingChance)` with the whole parks
 * region and rolling for neither) lives in `BaseTownGenerator`, which this change does
 * not own, so nothing here asserts it. What is asserted is the whole of the two
 * methods, called directly on a *real* borrowed `TownBuildingContext`.
 */

const MAP = 40;
const SEED = 1;

const rules = new Rules(new DiceRoller(20250929));
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

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
 * A `TownBuildingContext` carrying the generator's **real** placement primitives
 * rather than a re-declaration of them: the delegates are private on
 * `BaseTownGenerator`, so a stub pushed into `TOWN_BUILDING_PASSES` is the only way at
 * the genuine article. Same trick as `fuel-station-building.test.ts:147-172` and
 * `fire-station-building.test.ts`, and for the same reason — `ItemsDrop`'s walk order
 * and `MapObjectFill`'s "decline an occupied tile" are both observable behaviour, and
 * a hand-rolled stub would have been free to get either wrong in whichever direction
 * made the test pass.
 *
 * `TOWN_BUILDING_PASSES` is module-global mutable state shared with every other suite
 * in the process, so the stub is pushed, captured and **removed in a `finally`**,
 * restoring the array to exactly what it was on the way in. A capture that leaked
 * would make `runTownBuildingPasses` call a closure over a `null` `borrowedContext` in
 * whichever test file ran next.
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
    csharpName: "MakeBorrowSportsCourtContextBuilding",
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
  expect(captured, "the stub pass must have been offered a block").not.toBeNull();
  borrowedContext = captured as unknown as TownBuildingContext;
}
beforeAll(captureContext);

// ── Plot, block and roller helpers ────────────────────────────────────────────

/** A fresh map, grass all over, for one court to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

/**
 * A block with a building rect of exactly `bw` x `bh`. `Block` insets **twice**
 * (`TownBuilding.ts:224-231`) — `rectangle` -> `buildingRect` -> `insideRect` — so the
 * block rect is `bw + 2` by `bh + 2`. Every size assertion below is phrased in
 * building-rect terms and goes through here, so it cannot drift from the C#'s
 * `b.BuildingRect.Width`.
 */
function blockWithBuildingRect(bw: number, bh: number, left = 4, top = 4): Block {
  return new Block(new Rect(left, top, bw + 2, bh + 2));
}

/** C# `:5863`. A tennis court is a block of 10x12. */
const TENNIS_BLOCK = () => blockWithBuildingRect(8, 10);
/** C# `:5973`. A basketball court is a block of 12x10. */
const BASKETBALL_BLOCK = () => blockWithBuildingRect(10, 8);

/**
 * A roller that records every die it is asked for, in order, and can be pinned.
 *
 * The dice sequence is the claim under test — this is a port, and the whole point of
 * the seam is that a building spends the district's stream in the C#'s order — so the
 * tests below count rolls rather than inferring them from what landed on the map. A
 * test that only looked at the resulting map would pass on any implementation that
 * spent the right number of dice somewhere else, which is the failure mode that
 * silently reseeds every world.
 *
 * **`rollChance` is re-implemented here rather than wrapped**, so that each die is
 * recorded exactly once. The port's `DiceRoller.rollChance` is `this.roll(0, 100) <
 * chance` (`DiceRoller.ts:40-42`), so wrapping both methods would record every chance
 * roll *twice* — once as `rollChance(n)` and again as the `roll(0, 100)` underneath it
 * — and every count in this file would be off by a factor of two. `answer` pins the
 * chance roll's value while still recording it, which is what makes the barrel
 * short-circuit countable.
 */
interface RecordedRoller {
  roller: DiceRoller;
  calls: string[];
}

function recordingRoller(seed = 1, answer?: boolean): RecordedRoller {
  const roller = new DiceRoller(seed);
  const calls: string[] = [];
  // The *original*, so the wrappers below do not recurse into each other.
  const originalRoll = roller.roll.bind(roller);
  roller.roll = (min: number, max: number) => {
    calls.push(`roll(${min},${max})`);
    return originalRoll(min, max);
  };
  roller.rollChance = (chance: number) => {
    calls.push(`rollChance(${chance})`);
    return answer !== undefined ? answer : originalRoll(0, 100) < chance;
  };
  return { roller, calls };
}

/**
 * A roller whose `Roll(0, 4)` is pinned to one face, so the entrance is the only
 * thing the C#'s single `[0, 4)` in step 3 can decide. Everything else is real dice.
 */
function faceRoller(face: number, seed = 1): DiceRoller {
  const roller = new DiceRoller(seed);
  const real = roller.roll.bind(roller);
  roller.roll = (min: number, max: number) => (min === 0 && max === 4 ? face : real(min, max));
  return roller;
}

/**
 * A roller whose `rollChance` is forced to one answer, whatever it is asked. Used to
 * pin the *count* of rolls a building spends independently of the values, and to prove
 * the short-circuit ordering: an always-true basketball roller must spend exactly one
 * `rollChance(5)`, because `!fireBarrelPlaced` is the left operand of the `&&`.
 */
function forcedRoller(answer: boolean, seed = 1): DiceRoller {
  const roller = new DiceRoller(seed);
  roller.rollChance = () => answer;
  return roller;
}

// ── Map readers ───────────────────────────────────────────────────────────────

function objectsWithImage(map: GameMap, imageId: string): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && obj.imageId === imageId) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

function itemsOn(map: GameMap): Item[] {
  const out: Item[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const stack = map.getItemsAt(new Point(x, y));
      if (stack) out.push(...stack.items);
    }
  }
  return out;
}

function zoneNames(map: GameMap): string[] {
  return map.zones.map((z) => z.name);
}

/**
 * The interior tiles of a building rect, in the **visit order the C#'s step-2 loop
 * uses**: `for y … for x …`, row-major, skipping nothing. This is the order the mosaic
 * hands `listOfTilesToPlace[toPlaceIndex]` out in, so it is also the order the tests
 * read the laid court back in.
 */
function interiorVisitOrder(b: Block): Point[] {
  const r = b.buildingRect;
  const out: Point[] = [];
  for (let y = r.top; y < r.bottom; y++) {
    for (let x = r.left; x < r.right; x++) {
      if (x === r.left || x === r.right - 1 || y === r.top || y === r.bottom - 1) continue;
      out.push(new Point(x, y));
    }
  }
  return out;
}

/** Perimeter tile count of a building rect: `2w + 2h - 4`. */
function perimeterCount(b: Block): number {
  const r = b.buildingRect;
  return 2 * r.width + 2 * r.height - 4;
}

function tennisTileIds(): readonly TileID[] {
  return [
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
    64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  ];
}

function basketballTileIds(): readonly TileID[] {
  return [
    85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
    111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132,
  ];
}

/** The model ids actually laid on the interior tiles, in visit order. */
function laidInteriorModelIds(map: GameMap, b: Block): number[] {
  return interiorVisitOrder(b).map((p) => map.getTileAt(p.x, p.y)!.model.id);
}

// ── 1. The exact-equality size gates ──────────────────────────────────────────

describe("Feature.SportsCourts: the size gates are exact buildingRect equality", () => {
  it("takes the tennis court at exactly 8x10 and refuses 7x10, 9x10, 8x9 and 8x11", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const [bw, bh, expected] of [
      [8, 10, true], // C# :5863
      [7, 10, false],
      [9, 10, false],
      [8, 9, false],
      [8, 11, false],
    ] as const) {
      const map = plot();
      const b = blockWithBuildingRect(bw, bh);
      const built = makeTennisCourtBuilding(contextFor(map, b, faceRoller(0)));
      expect(built, `building rect ${bw}x${bh} should ${expected ? "" : "not "}build`).toBe(expected);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED).length).toBe(expected ? 1 : 0);
    }
  });

  it("takes the basketball court at exactly 10x8 and refuses 9x8, 11x8, 10x7 and 10x9", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const [bw, bh, expected] of [
      [10, 8, true], // C# :5973
      [9, 8, false],
      [11, 8, false],
      [10, 7, false],
      [10, 9, false],
    ] as const) {
      const map = plot();
      const b = blockWithBuildingRect(bw, bh);
      const built = makeBasketballCourtBuilding(contextFor(map, b, faceRoller(0)));
      expect(built, `building rect ${bw}x${bh} should ${expected ? "" : "not "}build`).toBe(expected);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED).length).toBe(expected ? 1 : 0);
    }
  });

  it("means the block rects are 10x12 and 12x10, because Block insets twice", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    // `Block` insets `rectangle` -> `buildingRect` -> `insideRect`, one tile each on
    // each axis, so the C#'s 8x10 building rect is a 10x12 *block* and the two courts
    // are transpositions of one another, never the same block.
    const tennis = TENNIS_BLOCK();
    expect(tennis.rectangle.width).toBe(10);
    expect(tennis.rectangle.height).toBe(12);
    expect(tennis.buildingRect.width).toBe(8);
    expect(tennis.buildingRect.height).toBe(10);
    expect(tennis.insideRect.width).toBe(6);
    expect(tennis.insideRect.height).toBe(8);
    expect(tennis.insideRect.width * tennis.insideRect.height, "tennis interior").toBe(48);

    const bball = BASKETBALL_BLOCK();
    expect(bball.rectangle.width).toBe(12);
    expect(bball.rectangle.height).toBe(10);
    expect(bball.insideRect.width).toBe(8);
    expect(bball.insideRect.height).toBe(6);
    expect(bball.insideRect.width * bball.insideRect.height, "basketball interior").toBe(48);
  });

  it("makes the two courts mutually exclusive on shape alone, with no dispatch order", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    // A 10x12 block is a tennis court and a 12x10 block is a basketball court; the
    // C#'s `!MakeTennisCourt && !MakeBasketballCourt` short-circuits on shape anyway.
    const tennisMap = plot();
    expect(makeTennisCourtBuilding(contextFor(tennisMap, TENNIS_BLOCK(), faceRoller(0)))).toBe(true);
    expect(makeBasketballCourtBuilding(contextFor(plot(), TENNIS_BLOCK(), faceRoller(0)))).toBe(false);

    const bballMap = plot();
    expect(makeBasketballCourtBuilding(contextFor(bballMap, BASKETBALL_BLOCK(), faceRoller(0)))).toBe(true);
    expect(makeTennisCourtBuilding(contextFor(plot(), BASKETBALL_BLOCK(), faceRoller(0)))).toBe(false);
  });
});

// ── 2. The mosaic: 48 tiles, in visit order, and the two break numbers ────────

describe("Feature.SportsCourts: the fixed-layout mosaic", () => {
  it("lays all 48 tennis tiles on the interior, in list order, in visit order", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = TENNIS_BLOCK();
    expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    expect(interiorVisitOrder(b), "an 8x10 building rect has 48 interior tiles").toHaveLength(48);
    // The loop is purely positional: `list[i]` is assigned in visit order, so the
    // laid models must be the list *in order*. This is what makes the tennis list's
    // row-major-looking numbers and the basketball list's sprite-sheet numbers
    // harmless — neither is ever read.
    expect(laidInteriorModelIds(map, b)).toEqual([...tennisTileIds()]);
  });

  it("lays all 48 basketball tiles on the interior, in list order, in visit order", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    expect(interiorVisitOrder(b), "a 10x8 building rect has 48 interior tiles").toHaveLength(48);
    expect(laidInteriorModelIds(map, b)).toEqual([...basketballTileIds()]);
  });

  it("leaves the outer ring on the _OUTER model, which is what step 2's `continue` reads", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const outer = Models.tiles.get(TileID.FLOOR_TENNIS_COURT_OUTER)!;
    const map = plot();
    const b = TENNIS_BLOCK();
    expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    const r = b.buildingRect;
    let onOuter = 0;
    for (let y = r.top; y < r.bottom; y++) {
      for (let x = r.left; x < r.right; x++) {
        const isPerimeter = x === r.left || x === r.right - 1 || y === r.top || y === r.bottom - 1;
        if (!isPerimeter) continue;
        expect(map.getTileAt(x, y)!.model, `perimeter tile ${x},${y} stayed _OUTER`).toBe(outer);
        onOuter++;
      }
    }
    expect(onOuter, "perimeter of 8x10").toBe(perimeterCount(b));
    expect(perimeterCount(b)).toBe(32);
  });

  it("puts the tennis court's real 48th placement at globalPieceIndex 71, not 72", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = TENNIS_BLOCK();
    expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    // Simulating the C#'s loop: `globalPieceIndex` counts *every* visited tile, perimeter
    // included, and is incremented before both the `== 72` guard and the `_OUTER`
    // `continue`. For an 8-wide rect each row burns 1 + 6 + 1 = 8 indices of which 6
    // place a tile, so the interior tiles of row r sit at `8r + 2 .. 8r + 7` and the
    // 48th — the last, `toPlaceIndex == 47` — is `8*8 + 7` = **71**, on the 6th
    // interior tile of row 8. The `else break` therefore fires at 71 and the
    // `globalPieceIndex == 72` guard only ever fires afterwards, on the first tile of
    // row 9, which is a perimeter tile the `continue` would have skipped.
    //
    // The C#'s comment on that guard — "71 is the last global piece we need to place
    // down manually" — is therefore **correct** for tennis, and the guard is a pure
    // safety net. Asserted on the tile the port actually laid.
    const visits = interiorVisitOrder(b);
    const last = visits[47]!;
    expect(last.x).toBe(b.buildingRect.left + 6);
    expect(last.y).toBe(b.buildingRect.top + 8);
    expect(map.getTileAt(last.x, last.y)!.model.id, "list[47] on the last interior tile").toBe(
      TileID.FLOOR_TENNIS_COURT_71
    );
  });

  it("puts the basketball court's real 48th placement at globalPieceIndex 69, not 70 or 71", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    // Same simulation for a 10-wide rect: each row burns 1 + 8 + 1 = 10 indices of
    // which 8 place a tile, so the interior tiles of row r sit at `10r + 2 .. 10r + 9`
    // and the 48th — the last, `toPlaceIndex == 47` — is `10*6 + 9` = **69**, on the
    // 8th interior tile of row 6. The `globalPieceIndex == 71` guard then fires on the
    // *second* tile of row 7, again a perimeter tile.
    //
    // The C#'s comment on that guard says "70 is the last global piece we need to place
    // down manually", which is **off by one against tennis's "71" and off by one
    // against the 69 the placement actually lands on**. The comment is preserved
    // verbatim in `makeSportsCourts.ts`; this is the record of what it should have said.
    const visits = interiorVisitOrder(b);
    const last = visits[47]!;
    expect(last.x).toBe(b.buildingRect.left + 8);
    expect(last.y).toBe(b.buildingRect.top + 6);
    expect(map.getTileAt(last.x, last.y)!.model.id, "list[47] on the last interior tile").toBe(
      TileID.FLOOR_BASKETBALL_COURT_70
    );
  });

  it("leaves no interior tile on the _OUTER model, so the 48-tile list never ran dry", () => {
    // If the `globalPieceIndex` guards were the terminator that ran, or if step 0 were
    // ever relaxed to a minimum, the list would run out and the remaining interior
    // tiles would keep the `_OUTER` model from step 1. This is the canary for both.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (const [make, block] of [
      [makeTennisCourtBuilding, TENNIS_BLOCK()],
      [makeBasketballCourtBuilding, BASKETBALL_BLOCK()],
    ] as const) {
      const outerId =
        block.buildingRect.width === 8
          ? TileID.FLOOR_TENNIS_COURT_OUTER
          : TileID.FLOOR_BASKETBALL_COURT_OUTER;
      const map = plot();
      expect(make(contextFor(map, block, faceRoller(0)))).toBe(true);
      const ids = laidInteriorModelIds(map, block);
      expect(ids.filter((id) => id === outerId), "no interior tile left on _OUTER").toEqual([]);
      expect(new Set(ids).size, "the 48 mosaic tiles are 48 distinct models").toBe(48);
    }
  });
});

// ── 3. The entrance ladder, and the load-bearing removal ──────────────────────

describe("Feature.SportsCourts: the entrance", () => {
  /**
   * The four faces, computed **the C#'s way** from whatever building rect it is
   * handed rather than hardcoded — the two courts are transposes of one another, so a
   * probe written against tennis's 8x10 (mid-height `top + 5`, mid-width `left + 4`)
   * lands on a plain fence post on the basketball court's west wall. `Roll(0, 4)` is
   * `[0, 4)` and the C#'s switch is `case 0 / case 1 / case 3 / default:`, so
   * **`default` is the roll-2 case, and the roll 2 is south.**
   */
  const faces = [
    {
      roll: 0,
      name: "west",
      at: (b: Block): [number, number] => [
        b.buildingRect.left,
        b.buildingRect.top + Math.floor(b.buildingRect.height / 2),
      ],
    },
    {
      roll: 1,
      name: "east",
      at: (b: Block): [number, number] => [
        b.buildingRect.right - 1,
        b.buildingRect.top + Math.floor(b.buildingRect.height / 2),
      ],
    },
    {
      roll: 3,
      name: "north",
      at: (b: Block): [number, number] => [
        b.buildingRect.left + Math.floor(b.buildingRect.width / 2),
        b.buildingRect.top,
      ],
    },
    {
      // The roll-2 arm. Deliberately labelled `2` and not `default` in the test: there
      // is no `case 2` in the C# and this is the arm that catches it.
      roll: 2,
      name: "south (the `default` arm)",
      at: (b: Block): [number, number] => [
        b.buildingRect.left + Math.floor(b.buildingRect.width / 2),
        b.buildingRect.bottom - 1,
      ],
    },
  ];

  it("puts a closed chainlink gate on each of the four faces, tennis court", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const { roll, name, at } of faces) {
      const map = plot();
      const b = TENNIS_BLOCK();
      expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(roll))), `${name}: builds`).toBe(true);

      const [gx, gy] = at(b);
      const gate = map.getMapObjectAt(gx, gy);
      expect(gate, `${name}: a gate at ${gx},${gy}`).not.toBeNull();
      expect(gate, `${name}: the gate is a DoorWindow`).toBeInstanceOf(DoorWindow);
      expect(gate!.name).toBe("chainlink gate");
      expect(gate!.imageId).toBe(GameImages.OBJ_CHAINWIRE_GATE_CLOSED);
      expect((gate as DoorWindow).isClosed, `${name}: STATE_CLOSED`).toBe(true);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED), `${name}: exactly one gate`).toEqual([
        `${gx},${gy}`,
      ]);
    }
  });

  it("puts a closed chainlink gate on each of the four faces, basketball court", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const { roll, name, at } of faces) {
      const map = plot();
      const b = BASKETBALL_BLOCK();
      expect(makeBasketballCourtBuilding(contextFor(map, b, faceRoller(roll))), `${name}: builds`).toBe(true);

      const [gx, gy] = at(b);
      const gate = map.getMapObjectAt(gx, gy);
      expect(gate, `${name}: a gate at ${gx},${gy}`).not.toBeNull();
      expect(gate, `${name}: the gate is a DoorWindow`).toBeInstanceOf(DoorWindow);
      expect((gate as DoorWindow).isClosed, `${name}: STATE_CLOSED`).toBe(true);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED), `${name}: exactly one gate`).toEqual([
        `${gx},${gy}`,
      ]);
    }
  });

  it("replaces the fence post rather than standing beside it, on all four sides", () => {
    // **The load-bearing part.** Step 1 has already put a chain wire fence on every
    // perimeter tile, and all four entrance positions are perimeter tiles. The C#'s
    // `PlaceMapObjectAt` throws on an occupied tile, so `RemoveMapObjectAt` at `:5948`
    // / `:6068` is what makes every court build at all. The port's `mapObjectPlace`
    // *declines* an occupied tile instead, so a port that dropped the removal would
    // produce a court with a fence and no gate — on all four sides, silently, and with
    // every other assertion in this file still passing except this one.
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const { roll, name } of faces) {
      const map = plot();
      const b = TENNIS_BLOCK();
      expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(roll))), `${name}: builds`).toBe(true);

      // Perimeter tiles: 32 on an 8x10 building rect. One of them now holds the gate,
      // so 31 hold chain wire fence — not 32, and not 30.
      const fences = objectsWithImage(map, GameImages.OBJ_CHAINWIRE_FENCE);
      expect(fences.length, `${name}: 31 fences, the 32nd perimeter tile became the gate`).toBe(
        perimeterCount(b) - 1
      );
      expect(perimeterCount(b)).toBe(32);
    }
  });

  it("never reaches a fifth face: 100 real seeds all get exactly one gate", () => {
    // The regression this guards is a *plausible* one in the other direction from the
    // fuel station's. The C#'s switch handles `0, 1, 3` and a `default`, which reads
    // like a missing `case 2`; the roll is `[0, 4)` so the `default` is it and the
    // ladder is total. If someone "tidied" it to `case 0..3` with no default, or
    // widened the roll to `roll(0, 5)`, a court would come out with no gate at all on
    // one side in five — and nothing else in this file would notice.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (let seed = 1; seed <= 100; seed++) {
      const map = plot();
      const b = TENNIS_BLOCK();
      expect(makeTennisCourtBuilding(contextFor(map, b, new DiceRoller(seed))), `seed ${seed} builds`).toBe(true);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED).length, `seed ${seed}: one gate`).toBe(1);
    }
  });
});

// ── 4. The dice, counted ──────────────────────────────────────────────────────

describe("Feature.SportsCourts: the dice the district pays", () => {
  it("tennis spends exactly 49: one roll(0,4) first, then 48 rollChance(10)", () => {
    // C# `:5927` then `:5954-5956`. The inside rect of a 10x12 block is 6x8 = 48 tiles,
    // the predicate is `map.GetMapObjectAt(pt) == null && m_DiceRoller.RollChance(10)`,
    // and every one of those tiles is empty at that point — the fence is on the
    // *building* rect's perimeter and the mosaic only set tile models — so all 48
    // roll. 1 + 48 = 49, and this is by a wide margin the most expensive building in
    // the parks chain.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { roller, calls } = recordingRoller(7);
    const map = plot();
    expect(makeTennisCourtBuilding(contextFor(map, TENNIS_BLOCK(), roller))).toBe(true);

    expect(calls.length, "49 dice").toBe(49);
    expect(calls[0], "the entrance is the first die").toBe("roll(0,4)");
    expect(calls.filter((c) => c === "rollChance(10)").length, "48 at 10%").toBe(48);
    expect(new Set(calls), "roll(0,4) and nothing else but the 10% roll").toEqual(
      new Set(["roll(0,4)", "rollChance(10)"])
    );
  });

  it("tennis's ItemsDrop tests the object FIRST, so a blocked tile costs no die", () => {
    // The `&&` in `(pt) => map.GetMapObjectAt(pt) == null && m_DiceRoller.RollChance(10)`
    // is in the C# and the order is the order: the object test short-circuits *ahead
    // of* the roll. Put something on one interior tile and the roll for that tile is
    // never spent, so the court spends 48 instead of 49. A port that rolled first
    // would still drop no racket there — the boolean is the same — and would spend 49,
    // which moves every die after the court in the district.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { roller, calls } = recordingRoller(7);
    const map = plot();
    const b = TENNIS_BLOCK();
    const blocked = interiorVisitOrder(b)[7]!;
    map.placeMapObject(new MapObject("parked car", "parked car"), new Point(blocked.x, blocked.y));

    expect(makeTennisCourtBuilding(contextFor(map, b, roller))).toBe(true);
    expect(calls.length, "48 dice, not 49").toBe(48);
    expect(calls.filter((c) => c === "rollChance(10)").length, "47 at 10%").toBe(47);
    expect(map.getItemsAt(new Point(blocked.x, blocked.y)), "no racket on the blocked tile").toBeNull();
  });

  it("tennis drops a racket on every interior tile when the 10% always fires, and on none when it never does", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    const loud = plot();
    expect(makeTennisCourtBuilding(contextFor(loud, TENNIS_BLOCK(), forcedRoller(true)))).toBe(true);
    const rackets = itemsOn(loud);
    expect(rackets.length, "6x8 = 48 rackets").toBe(48);
    for (const racket of rackets) {
      expect(racket).toBeInstanceOf(ItemMeleeWeapon);
      expect(racket.model.id).toBe(ItemID.MELEE_TENNIS_RACKET);
      expect(racket.imageId).toBe(GameImages.ITEM_TENNIS_RACKET);
      // C# `:1718-1721` sets nothing on this item, so unlike `MakeItemSiphonKit` and
      // the shelter's `ItemLight`s the AI *is* allowed to pick one up and bash with it.
      expect(racket.isForbiddenToAI).toBe(false);
    }

    const quiet = plot();
    expect(makeTennisCourtBuilding(contextFor(quiet, TENNIS_BLOCK(), forcedRoller(false)))).toBe(true);
    expect(itemsOn(quiet).length, "no rackets").toBe(0);
  });

  it("basketball spends the fire-barrel rolls BEFORE the entrance roll", () => {
    // **The reverse of the tennis court, and it is the C#'s step numbering, not a
    // decision.** The basketball tile loop is step 2 and its `RollChance(5)` is inside
    // it; the entrance `Roll(0, 4)` is step 3. Tennis has the entrance at step 3 and
    // its only other roll at step 4, so tennis is entrance-first and basketball is
    // not. Both orders are asserted so neither can be quietly swapped for the other.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { roller, calls } = recordingRoller(11);
    const map = plot();
    expect(makeBasketballCourtBuilding(contextFor(map, BASKETBALL_BLOCK(), roller))).toBe(true);

    expect(calls.length).toBeGreaterThan(0);
    const entranceIndex = calls.indexOf("roll(0,4)");
    expect(entranceIndex, "the entrance roll is present exactly once").toBeGreaterThanOrEqual(0);
    expect(calls.filter((c) => c === "roll(0,4)").length, "one entrance roll").toBe(1);
    expect(entranceIndex, "the entrance roll is the LAST die, not the first").toBe(calls.length - 1);
    expect(calls.slice(0, entranceIndex).every((c) => c === "rollChance(5)"), "only barrel rolls before it").toBe(
      true
    );
    expect(calls.filter((c) => c === "rollChance(5)").length, "at most 46, one per non-ring interior tile").toBeLessThanOrEqual(
      46
    );
  });

  it("basketball's barrel ceiling is 46 rolls: 48 placements, two of them ring tiles", () => {
    // `!fireBarrelPlaced && RollChance(5)` is forced false here so the roll is spent on
    // every eligible placement. The two ring tiles take the `if` branch ahead of the
    // `else if`, so they spend nothing: 48 - 2 = 46. Plus the entrance's 1 = 47.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { roller, calls } = recordingRoller(3, false);

    const map = plot();
    expect(makeBasketballCourtBuilding(contextFor(map, BASKETBALL_BLOCK(), roller))).toBe(true);

    expect(calls.filter((c) => c === "rollChance(5)").length, "46 barrel rolls").toBe(46);
    expect(calls.length, "47 dice in total").toBe(47);
    expect(calls[46], "and the entrance is the 47th and last").toBe("roll(0,4)");
    // A `!fireBarrelPlaced` guard that were on the *right* of the `&&` would spend 48
    // rolls here, because nothing would ever set the flag.
    expect(objectsWithImage(map, GameImages.OBJ_EMPTY_BIN), "no barrel at all").toEqual([]);
  });

  it("basketball's !fireBarrelPlaced short-circuits AHEAD of the roll: one barrel roll, ever", () => {
    // Forcing the 5% to always succeed must spend exactly one `rollChance(5)`, because
    // the flag is the left operand of the `&&` and is set by the first success. This is
    // the cheapest available proof of the operand order: the reverse would spend 46.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { roller, calls } = recordingRoller(3, true);

    const map = plot();
    expect(makeBasketballCourtBuilding(contextFor(map, BASKETBALL_BLOCK(), roller))).toBe(true);

    expect(calls.filter((c) => c === "rollChance(5)").length, "exactly one barrel roll").toBe(1);
    expect(calls.length, "2 dice in total: the barrel roll and the entrance").toBe(2);
    expect(calls[calls.length - 1]).toBe("roll(0,4)");
  });

  it("basketball has no ItemsDrop at all, even at a 100% racket chance", () => {
    // The reference gives a tennis court tennis rackets and a basketball court **no
    // loot arm whatsoever** — the C#'s step numbering jumps from "3. Entrance" straight
    // to "4. Zone" (`:6071-6073`). If a basketball court had inherited the tennis
    // court's `ItemsDrop` "for symmetry" it would show here, and the asymmetry would be
    // gone for good.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    expect(makeBasketballCourtBuilding(contextFor(map, BASKETBALL_BLOCK(), forcedRoller(true)))).toBe(true);
    expect(itemsOn(map), "a basketball court carries no items").toEqual([]);
  });
});

// ── 5. The rings, the barrel, and the three map-object models ────────────────

describe("Feature.SportsCourts: the two rings and the one barrel", () => {
  it("puts a ring on the two ring tiles and on no others", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, forcedRoller(false)))).toBe(true);

    const rings = objectsWithImage(map, GameImages.OBJ_BASKETBALL_RING);
    expect(rings, "two rings, 48 placements").toHaveLength(2);

    // C# `:6027` names `FLOOR_BASKETBALL_COURT_36` and `FLOOR_BASKETBALL_COURT_43`, which
    // are list entries 16 and 23 — the 17th and 24th interior tile in visit order, i.e.
    // the first and the eighth interior tile of row 3 of a 10-wide rect. Two rings on
    // one row, one tile in from the left wall and two in from the right: the C#'s
    // asymmetry, preserved.
    const visits = interiorVisitOrder(b);
    expect(visits[16]!.x).toBe(b.buildingRect.left + 1);
    expect(visits[16]!.y).toBe(b.buildingRect.top + 3);
    expect(visits[23]!.x).toBe(b.buildingRect.left + 8);
    expect(visits[23]!.y).toBe(b.buildingRect.top + 3);
    expect(map.getTileAt(visits[16]!.x, visits[16]!.y)!.model.id).toBe(TileID.FLOOR_BASKETBALL_COURT_36);
    expect(map.getTileAt(visits[23]!.x, visits[23]!.y)!.model.id).toBe(TileID.FLOOR_BASKETBALL_COURT_43);
    expect(rings).toEqual(
      [`${visits[16]!.x},${visits[16]!.y}`, `${visits[23]!.x},${visits[23]!.y}`].sort()
    );
  });

  it("the ring is walkable, transparent, metal, and unbreakable at 0 hitpoints", () => {
    // C# `BaseMapGenerator.cs:1185-1193`. The two-argument `MapObject` constructor is
    // the whole subtlety: it leaves `breakState` UNBREAKABLE and `fireState`
    // UNINFLAMMABLE, and `MapObject`'s guard (`:60-62`) only assigns hit points to a
    // breakable-or-burnable object, so a ring is 0/0 and fire does not touch it.
    // `isWalkable` therefore has to be set *explicitly* — a backboard a survivor can
    // stand under, and a court that is not blocked by its own hoops.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, forcedRoller(false)))).toBe(true);

    const [first] = objectsWithImage(map, GameImages.OBJ_BASKETBALL_RING);
    const [x, y] = first!.split(",").map(Number) as [number, number];
    const ring = map.getMapObjectAt(x, y)!;

    expect(ring.name).toBe("basketball ring");
    expect(ring.imageId).toBe(GameImages.OBJ_BASKETBALL_RING);
    expect(ring.isWalkable, "explicitly walkable").toBe(true);
    expect(ring.isMaterialTransparent).toBe(true);
    expect(ring.isMetal).toBe(true);
    expect(ring.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(ring.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
    expect(ring.isBreakable).toBe(false);
    expect(ring.hitPoints).toBe(0);
    expect(ring.maxHitPoints).toBe(0);
    // Walkable *and* transparent: you can see through the ring and stand in it.
    expect(map.isWalkable(x, y)).toBe(true);
  });

  it("a ring tile never rolls and never hosts the barrel, however loud the barrel roll", () => {
    // The two ring tiles are `if`-chained **ahead of** the barrel's `else if`, so with
    // the 5% forced true the barrel lands on the *very first* placement — which is
    // `list[0]`, `BASKETBALL_COURT_18`, a non-ring tile — and both rings are still
    // there 16 and 23 visits later. A port that put the barrel test first would have
    // put a barrel on a backboard, and one that made the ring an `else if` would have
    // spent the roll on the two ring tiles as well.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, forcedRoller(true)))).toBe(true);

    const visits = interiorVisitOrder(b);
    const ringA = visits[16]!; // list[16] == FLOOR_BASKETBALL_COURT_36
    const ringB = visits[23]!; // list[23] == FLOOR_BASKETBALL_COURT_43
    expect(map.getTileAt(ringA.x, ringA.y)!.model.id).toBe(TileID.FLOOR_BASKETBALL_COURT_36);
    expect(map.getTileAt(ringB.x, ringB.y)!.model.id).toBe(TileID.FLOOR_BASKETBALL_COURT_43);
    expect(map.getMapObjectAt(ringA.x, ringA.y)!.imageId).toBe(GameImages.OBJ_BASKETBALL_RING);
    expect(map.getMapObjectAt(ringB.x, ringB.y)!.imageId).toBe(GameImages.OBJ_BASKETBALL_RING);

    const barrels = objectsWithImage(map, GameImages.OBJ_EMPTY_BIN);
    expect(barrels, "at most one barrel per court").toHaveLength(1);
    // `list[0]`, the first interior tile in visit order.
    expect(barrels[0]).toBe(`${visits[0]!.x},${visits[0]!.y}`);
    expect(barrels[0]).not.toBe(`${ringA.x},${ringA.y}`);
    expect(barrels[0]).not.toBe(`${ringB.x},${ringB.y}`);
  });

  it("the barrel is the junkyard's, unbreakable, burnable, walkable, 4kg, metal", () => {
    // C# `BaseMapGenerator.cs:758-772`, Release 7-6. **The fourth copy in the port**
    // after `makeJunkyard.ts`, `makeFireStationBuilding.ts` and `BaseMapGenerator`'s own
    // `protected` copy — and unlike those three this one *does* set `isMetal`, because
    // the field landed on `MapObject` with `Feature.FuelStation`. `HoverDescription` is
    // still not a field and is reported rather than approximated.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    expect(makeBasketballCourtBuilding(contextFor(map, BASKETBALL_BLOCK(), forcedRoller(true)))).toBe(true);

    const [pos] = objectsWithImage(map, GameImages.OBJ_EMPTY_BIN);
    const [x, y] = pos!.split(",").map(Number) as [number, number];
    const barrel = map.getMapObjectAt(x, y)!;

    expect(barrel).toBeInstanceOf(Barrel);
    expect(barrel.name).toBe("receptacle");
    expect(barrel.imageId).toBe(GameImages.OBJ_EMPTY_BIN);
    expect(barrel.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(barrel.isBreakable).toBe(false);
    expect(barrel.fireState).toBe(MapObjectFire.BURNABLE);
    expect(barrel.isFlammable).toBe(true);
    expect(barrel.isWalkable, "a thing you stand on, not an obstacle").toBe(true);
    expect(barrel.isMaterialTransparent).toBe(true);
    expect(barrel.isContainer, "'in case items were left there when the barrel was unlit'").toBe(true);
    expect(barrel.isMovable).toBe(true);
    expect(barrel.weight).toBe(4);
    expect(barrel.isMetal).toBe(true);
    // It lands on a *court* tile, so `Feature.TileFires` can set it alight and the
    // court gets a fire in it the reference never expected. Preserved, not prevented.
    expect(map.getTileAt(x, y)!.model.id, "a court tile, not a perimeter tile").not.toBe(
      TileID.FLOOR_BASKETBALL_COURT_OUTER
    );
  });

  it("the chain wire fence is the C#'s, not the port's wooden fence", () => {
    // C# `BaseMapGenerator.cs:444-453` `MakeObjFence` — "Chain wire and IS jumpable",
    // `BASE_HITPOINTS * 10` = 400. **This is the third copy in the port** after
    // `makeJunkyard.ts` and `makeAnimalShelterBuilding.ts`, and the two are
    // byte-identical. A file that reached for the port's own `makeObjFence` instead
    // would have put up a *wooden* fence: named `fence`, it gives wood, it is opaque
    // and it is not jumpable, and the court would read as a yard. `isMetal` is set
    // here — the C# has had it since Release 5-4 and the port's `MapObject` has had
    // the field since `Feature.FuelStation` — so the "the field does not exist" notes
    // still carried by the other two copies are stale.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = TENNIS_BLOCK();
    expect(makeTennisCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    const [pos] = objectsWithImage(map, GameImages.OBJ_CHAINWIRE_FENCE);
    const [x, y] = pos!.split(",").map(Number) as [number, number];
    const fence = map.getMapObjectAt(x, y)!;

    expect(fence.name).toBe("chain wire fence");
    expect(fence.name, "not the port's vanilla wooden `fence`").not.toBe("fence");
    expect(fence.givesWood, "not the wooden fence either").toBe(false);
    expect(fence.breakState).toBe(MapObjectBreak.BREAKABLE);
    expect(fence.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
    expect(fence.hitPoints).toBe(DoorWindow.BASE_HITPOINTS * 10);
    expect(fence.hitPoints).toBe(400);
    expect(fence.jumpLevel, "IS jumpable").toBe(1);
    expect(fence.isJumpable).toBe(true);
    expect(fence.isMaterialTransparent).toBe(true);
    expect(fence.standOnFovBonus).toBe(true);
    expect(fence.isMetal).toBe(true);
  });

  it("the chainlink gate is half a door's hitpoints, metal, and closed", () => {
    // C# `BaseMapGenerator.cs:1176-1183`. `2 * DoorWindow.BASE_HITPOINTS` = 80, against
    // the wooden door's 1x and the roller door's 6x. The C#'s sixth constructor
    // argument (`state`) has nowhere to go in the port's five-argument `DoorWindow`, so
    // it is applied with `setState` afterwards — and at the only call site in this file
    // the argument is always `STATE_CLOSED`, which the port's constructor already
    // guarantees, so the `setState` is a faithful no-op rather than a lost state.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(map, b, faceRoller(0)))).toBe(true);

    const [pos] = objectsWithImage(map, GameImages.OBJ_CHAINWIRE_GATE_CLOSED);
    const [x, y] = pos!.split(",").map(Number) as [number, number];
    const gate = map.getMapObjectAt(x, y) as DoorWindow;

    expect(gate.name).toBe("chainlink gate");
    expect(gate.hitPoints).toBe(2 * DoorWindow.BASE_HITPOINTS);
    expect(gate.hitPoints).toBe(80);
    expect(gate.isMetal).toBe(true);
    expect(gate.isClosed).toBe(true);
    expect(gate.isOpen).toBe(false);
    expect(gate.imageId).toBe(GameImages.OBJ_CHAINWIRE_GATE_CLOSED);
  });
});

// ── 6. Zones ──────────────────────────────────────────────────────────────────

describe("Feature.SportsCourts: the zones", () => {
  it("names them 'Tennis court' and 'Basketball court', sentence case, over the building rect", () => {
    // C# `:5961` and `:6074`. Sentence case with a lower-case second word, which is not
    // the `AnimalShelter`/`FuelStation` capitalisation its siblings use and is what the
    // C# spells. `makeUniqueZone` (`BaseMapGenerator.ts:1784-1787`) appends `@midX-midY`
    // of the rect, so the full name is checkable and the rect is the *building* rect.
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    const tennis = plot();
    const tb = TENNIS_BLOCK();
    expect(makeTennisCourtBuilding(contextFor(tennis, tb, faceRoller(0)))).toBe(true);
    const tennisZone = zoneNames(tennis).find((n) => n.startsWith("Tennis court"));
    expect(tennisZone).toBe(
      `Tennis court@${tb.buildingRect.left + 4}-${tb.buildingRect.top + 5}`
    );
    expect(tennisZone, "not the PascalCase spelling").not.toBe("TennisCourt@...");

    const bball = plot();
    const bb = BASKETBALL_BLOCK();
    expect(makeBasketballCourtBuilding(contextFor(bball, bb, faceRoller(0)))).toBe(true);
    expect(zoneNames(bball).find((n) => n.startsWith("Basketball court"))).toBe(
      `Basketball court@${bb.buildingRect.left + 5}-${bb.buildingRect.top + 4}`
    );
  });

  it("adds the four walkway zones to both, as all fourteen buildings do", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (const [make, block] of [
      [makeTennisCourtBuilding, TENNIS_BLOCK()],
      [makeBasketballCourtBuilding, BASKETBALL_BLOCK()],
    ] as const) {
      const map = plot();
      expect(make(contextFor(map, block, faceRoller(0)))).toBe(true);
      const walkways = zoneNames(map).filter((n) => n.startsWith("walkway@"));
      expect(walkways.length, "north, south, east, west").toBe(4);
    }
  });
});

// ── 7. The feature gate, and determinism ──────────────────────────────────────

describe("Feature.SportsCourts: the feature gate", () => {
  it("builds nothing under CLASSIC and spends no die at all", () => {
    // The gate is the first statement of both functions and it precedes the size check,
    // so a Classic district pays nothing for two buildings the reference district would
    // have rolled for — and a block that *would* have been a court is left as bare
    // grass rather than half-built.
    Session.get().ruleset = Ruleset.CLASSIC;

    for (const [make, block] of [
      [makeTennisCourtBuilding, TENNIS_BLOCK()],
      [makeBasketballCourtBuilding, BASKETBALL_BLOCK()],
    ] as const) {
      const { roller, calls } = recordingRoller(5);
      const map = plot();
      expect(make(contextFor(map, block, roller)), "refused under CLASSIC").toBe(false);
      expect(calls, "zero dice under CLASSIC").toEqual([]);
      expect(objectsWithImage(map, GameImages.OBJ_CHAINWIRE_FENCE)).toEqual([]);
      expect(zoneNames(map).filter((n) => /Tennis|Basketball/.test(n))).toEqual([]);
    }
  });

  it("builds under STILL_ALIVE", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(makeTennisCourtBuilding(contextFor(plot(), TENNIS_BLOCK(), faceRoller(0)))).toBe(true);
    expect(makeBasketballCourtBuilding(contextFor(plot(), BASKETBALL_BLOCK(), faceRoller(0)))).toBe(true);
  });
});

describe("Feature.SportsCourts: determinism", () => {
  /** The same district fingerprint `fuel-station-building.test.ts:313-330` commits. */
  function fingerprint(map: GameMap): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        const tile = map.getTileAt(x, y)!;
        const obj = map.getMapObjectAt(x, y);
        const stack = map.getItemsAt(new Point(x, y));
        const cell = `${tile.model.id}|${obj ? obj.imageId : "-"}|${(tile.getDecorations ?? []).join(",")}|${
          tile.isInside ? 1 : 0
        }|${stack ? stack.countItems : 0}`;
        for (let i = 0; i < cell.length; i++) {
          h1 = Math.imul(h1 ^ cell.charCodeAt(i), 16777619) >>> 0;
          h2 = (Math.imul(h2 + cell.charCodeAt(i) + i, 2654435761) ^ (h2 >>> 7)) >>> 0;
        }
      }
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  function buildBoth(seed: number): string {
    const tennis = plot();
    makeTennisCourtBuilding(contextFor(tennis, TENNIS_BLOCK(), new DiceRoller(seed)));
    const bball = plot();
    makeBasketballCourtBuilding(contextFor(bball, BASKETBALL_BLOCK(), new DiceRoller(seed)));
    return fingerprint(tennis) + "/" + fingerprint(bball);
  }

  it("builds the same court from the same seed and a different one from a different seed", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(buildBoth(99)).toBe(buildBoth(99));
    const seeds = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(buildBoth));
    expect(seeds.size, "the roller is really being consulted").toBeGreaterThan(1);
  });

  it("the entrance face moves the court, so the roller is not being ignored", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const prints = [0, 1, 2, 3].map((face) => {
      const map = plot();
      makeTennisCourtBuilding(contextFor(map, TENNIS_BLOCK(), faceRoller(face)));
      return fingerprint(map);
    });
    expect(new Set(prints).size, "four faces, four courts").toBe(4);
  });
});
