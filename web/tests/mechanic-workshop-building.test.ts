import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { MapObject } from "@data/MapObject";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Barrel, Car, DoorWindow, PowerGenerator } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeMechanicWorkshop } from "@gameplay/generators/buildings/makeMechanicWorkshop";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.MechanicWorkshop` — the fork's `MakeMechanicWorkshop`
 * (`BaseTownGenerator.cs:2670`), the fourth arm of the business cascade's shared
 * `roll(0, 4)`, and the arm that was left empty on the strength of a comment
 * saying the building was vanilla.
 *
 * What is worth pinning here:
 *
 * 1. **It is reachable from `generate()` and only under Still Alive.** The arm is
 *    `case 3` of a die the caller spends, so "some seed built one" is the claim
 *    that needs a sweep rather than a single seed, and the CLASSIC half of the
 *    same sweep is the assertion that the gate is real.
 * 2. **Both size bounds.** 5..7 on each axis, in the C#'s order, with the upper
 *    bound first — the only building among the C#'s fourteen that has an upper
 *    bound *and* a lower one. The boundary blocks are here because an off-by-one
 *    in either direction is invisible anywhere but here.
 * 3. **The cap is per district and re-arms on a new one.** `Round((Width / 10) /
 *    4)` with `Width / 10` as C# integer division, keyed on the district's roller
 *    exactly as the bar, bank, clinic and fire station key theirs.
 * 4. **The door side is the only `roll(0, 4)` the method spends.** The fire
 *    station spends a second one on its piece of kit; the workshop has no such
 *    roll, and a test that counted *all* dice could not tell the two apart. This
 *    is what keeps a future edit from quietly adding one.
 * 5. **CLASSIC pays nothing**, measured by the committed district fingerprint
 *    that five other suites also commit, so a die moved under Classic shows up
 *    here as well as there.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four.
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

const MAP = 40;
const SEED = 1;
/** The same value `tests/bank-building.test.ts` and five others commit. */
const CLASSIC_FINGERPRINT = "9bb5e4907bc3f62c";

type ParamsPatch = {
  minBlockSize?: number;
  charBuildingChance?: number;
  wreckedCarChance?: number;
};

function newParams(width = MAP, height = MAP, patch: ParamsPatch = {}): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  if (patch.minBlockSize !== undefined) params.minBlockSize = patch.minBlockSize;
  if (patch.charBuildingChance !== undefined) params.charBuildingChance = patch.charBuildingChance;
  if (patch.wreckedCarChance !== undefined) params.wreckedCarChance = patch.wreckedCarChance;
  return params;
}

/** `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it. */
function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
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
 * A roller whose `roll(0, 4)` is the door side and whose `rollChance` answers the
 * three percentages this method asks for by name.
 *
 * The workshop spends exactly one `roll(0, 4)` — the door side at `:2701` — so
 * there is no "later one" to disambiguate the way `fireRoller` has to. The three
 * `rollChance`es are distinguished by the *chance value*: 20 is the construction
 * tool, 10 is the fire barrel, and `params.wreckedCarChance` is whatever the test
 * set it to, so a test that wants cars moves that instead of guessing.
 */
function workshopRoller(opts: { doorSide?: number; tool?: boolean; barrel?: boolean; seed?: number } = {}) {
  const { doorSide = 0, tool = false, barrel = false, seed = 1 } = opts;
  const roller = new DiceRoller(seed);
  const realRoll = roller.roll.bind(roller);
  const realChance = roller.rollChance.bind(roller);
  const spent: number[] = [];
  roller.roll = (min: number, max: number) => {
    if (min === 0 && max === 4) {
      spent.push(doorSide);
      return doorSide;
    }
    return realRoll(min, max);
  };
  roller.rollChance = (chance: number) => {
    if (chance === 20) return tool;
    if (chance === 10) return barrel;
    return realChance(chance);
  };
  return { roller, doorSides: () => spent.length };
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

function workshopZones(map: GameMap): string[] {
  return map.zones.map((z) => z.name).filter((n) => n.startsWith("Mechanic@"));
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

/**
 * The `Car`s inside a block, by class rather than by image id: the five phase-0
 * models are `car_blue_phase0`, `car_green_phase0`, `car_red_phase0`,
 * `car_white_phase0` and `police_car_phase0`, and the last one does not start
 * with `car`.
 */
function carsIn(map: GameMap, b: Block): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
    for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
      if (map.getMapObjectAt(x, y) instanceof Car) out.push({ x, y });
    }
  }
  return out;
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

/** A tile's decorations; `null` and `[]` both mean none. */
function decorationsAt(map: GameMap, x: number, y: number): string[] {
  return [...(map.getTileAt(x, y)?.getDecorations ?? [])];
}

/** The workshop's three pieces of furniture inside a block, by class where a class exists. */
function furnitureIn(map: GameMap, b: Block): { generators: number; barrels: number; benches: number } {
  const out = { generators: 0, barrels: 0, benches: 0 };
  for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
    for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj instanceof PowerGenerator) out.generators++;
      else if (obj instanceof Barrel) out.barrels++;
      else if (obj && obj.imageId === GameImages.OBJ_WORKBENCH) out.benches++;
    }
  }
  return out;
}

/**
 * A whole-district fingerprint: every tile's model, its map object, its
 * decorations and its inside flag. The same function and the same accumulator
 * constants as `tests/fire-station-building.test.ts` and `tests/bank-building.test.ts`
 * — which is what makes their three committed values the same value.
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

/**
 * Everything only the workshop can leave on a district, as one sorted list.
 *
 * Roller doors and workbenches and fire barrels are shared — the farm, the
 * junkyard and the fire station all place them — so they are deliberately *not*
 * in here. What is in here is the sign, which has exactly one caller in the whole
 * reference, plus the zone name.
 */
function workshopTraces(map: GameMap): string[] {
  const out: string[] = workshopZones(map);
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      if (decorationsAt(map, x, y).includes(GameImages.DECO_MECHANIC)) out.push(`deco ${GameImages.DECO_MECHANIC}@${x},${y}`);
    }
  }
  return out.sort();
}

const originalRuleset = Session.get().ruleset;
afterEach(() => {
  Session.get().ruleset = originalRuleset;
  TOWN_BUILDING_PASSES.length = 0;
});

// ── Reached from the district generator ─────────────────────────────────────

describe("mechanic workshop, from BaseTownGenerator.generate()", () => {
  // `charBuildingChance = 100` so every block is offered the outer `if` and the
  // interior cascade is what decides; at the default of 10 only one block in ten
  // is ever considered and the sweep below would be a coin toss.
  const sweepParams = () => newParams(50, 50, { charBuildingChance: 100 });

  it("is reached by case 3 of the business cascade, under Still Alive", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // Not "some seed built one": a 1-in-4 arm behind a size window of only three
    // block widths is exactly the shape a single-seed assertion gets wrong in both
    // directions. Measured over 100 districts at this width, about one seed in
    // nine builds one, so sixty districts puts the expected count near seven and
    // the chance of an empty sweep below one in a thousand.
    let built = 0;
    for (let seed = 1; seed <= 60; seed++) built += workshopZones(newGenerator(sweepParams()).generate(seed)).length;
    expect(built, "a Still Alive sweep found no workshop at all").toBeGreaterThan(0);
  });

  it("is never reached under CLASSIC, over the same sixty districts", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    for (let seed = 1; seed <= 60; seed++) {
      expect(workshopTraces(newGenerator(sweepParams()).generate(seed)), `seed ${seed}`).toEqual([]);
    }
  });
});

// ── The generator itself ────────────────────────────────────────────────────

describe("makeMechanicWorkshop", () => {
  it("returns false and touches nothing when the inside rect is over 7x7", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2675` is the *upper* bound, checked first. A block of 15 has an 11x11
    // inside, and the two odd-shaped ones are over on one axis only.
    for (const rect of [new Rect(4, 4, 15, 15), new Rect(4, 4, 20, 8), new Rect(4, 4, 8, 20)]) {
      const map = plot();
      const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
      const b = new Block(rect);
      expect(b.insideRect.width > 7 || b.insideRect.height > 7, `${rect.width}x${rect.height} is over the bound`).toBe(
        true,
      );

      expect(makeMechanicWorkshop(contextFor(map, b, workshopRoller().roller), 3), `${rect.width}x${rect.height}`).toBe(
        false,
      );
      expect(map.zones, "no zone").toHaveLength(0);
      expect(map.mapObjects, "no map object").toHaveLength(0);
      for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) expect(map.getTileAt(x, y)!.model).toBe(grass);
    }
  });

  it("returns false when the inside rect is under 5x5", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2677`. A block of 4 has a 0x0 inside and a block of 8 has a 4x4, and
    // both are refused *before* the district is charged against the cap.
    for (const rect of [new Rect(4, 4, 4, 4), new Rect(4, 4, 8, 8), new Rect(4, 4, 8, 12)]) {
      const map = plot();
      const b = new Block(rect);
      expect(b.insideRect.width < 5 || b.insideRect.height < 5, `${rect.width}x${rect.height} is under the bound`).toBe(
        true,
      );
      expect(makeMechanicWorkshop(contextFor(map, b, workshopRoller().roller), 3), `${rect.width}x${rect.height}`).toBe(
        false,
      );
      expect(map.mapObjects).toHaveLength(0);
    }
  });

  it("accepts inside rects of exactly 5x5 and exactly 7x7, the C#'s boundaries", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // Both edges, because the bound is a range and a `>=`/`>` slip at either end
    // is a different bug with the same symptom. A block of n has an inside rect of
    // n - 4, so 5 is a block of 9 and 7 is a block of 11.
    for (const [blockSide, insideSide] of [
      [9, 5],
      [11, 7],
    ]) {
      const map = plot();
      const b = new Block(new Rect(2, 2, blockSide, blockSide));
      expect(b.insideRect.width, `block ${blockSide} inside width`).toBe(insideSide);
      expect(b.insideRect.height, `block ${blockSide} inside height`).toBe(insideSide);
      expect(
        makeMechanicWorkshop(contextFor(map, b, workshopRoller().roller), 3),
        `block ${blockSide}, inside ${insideSide}`,
      ).toBe(true);
      expect(workshopZones(map), `block ${blockSide} zone`).toHaveLength(1);
    }
  });

  it("declines any dispatch case that is not 3, without rolling", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // The case arrives as a parameter and this generator never rolls for its own
    // dispatch: `roll(0, 4)` is spent once per block by `generate()`. Rolling again
    // in here would spend two dice where the C# spends one.
    for (const roll of [0, 1, 2, 4, 9]) {
      const map = plot();
      expect(makeMechanicWorkshop(contextFor(map, new Block(new Rect(2, 2, 11, 11)), workshopRoller().roller), roll), `case ${roll}`).toBe(false);
      expect(map.mapObjects, `case ${roll} touched the map`).toHaveLength(0);
    }
  });

  it("builds at most Round((Width / 10) / 4) per district, and re-arms for the next", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2679-2683`. At 40 wide the limit is `Round(4 / 4)` = 1; at 80 it is
    // `Round(8 / 4)` = 2. Both are worth pinning because the first factor is C#
    // integer division — `map.Width / 10` truncates before the divide — so a 45-wide
    // map is `4 / 4 = 1` and not `4.5 / 4 = 1.125`.
    const map = plot(80, 40);
    const blocks = [
      new Block(new Rect(1, 1, 11, 11)),
      new Block(new Rect(14, 1, 11, 11)),
      new Block(new Rect(27, 1, 11, 11)),
      new Block(new Rect(1, 14, 11, 11)),
      new Block(new Rect(14, 14, 11, 11)),
      new Block(new Rect(27, 14, 11, 11)),
    ];
    const roller = workshopRoller().roller;
    const built = blocks.filter((b) => makeMechanicWorkshop(contextFor(map, b, roller), 3));
    expect(built, "Round((80 / 10) / 4) = 2").toHaveLength(2);
    expect(workshopZones(map)).toHaveLength(2);

    // A new district is a new `DiceRoller`, which is where the C# re-declares the
    // `ref`, so a second roller is a second district and may build again.
    expect(
      makeMechanicWorkshop(contextFor(map, new Block(new Rect(1, 27, 11, 11)), workshopRoller().roller), 3),
    ).toBe(true);
    expect(workshopZones(map)).toHaveLength(3);
  });

  it("puts three roller doors down one wall and an asphalt driveway off them", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2701-2753`. The four arms differ only in the axis the three doors step
    // along and the one tile outside the wall they open onto. `ARM` is 11x11 at
    // (2,2), so `buildingRect` is (3,3,9,9) and `midX`/`midY` are 7/7 —
    // `b.Rectangle`'s centre, C# `:2697-2698`.
    const ARM = new Rect(2, 2, 11, 11);
    const arms = [
      { name: "west", side: 0, doors: [[3, 6], [3, 7], [3, 8]], driveway: [2, 7] },
      { name: "east", side: 1, doors: [[11, 6], [11, 7], [11, 8]], driveway: [12, 7] },
      { name: "north", side: 2, doors: [[6, 3], [7, 3], [8, 3]], driveway: [7, 2] },
      { name: "south", side: 3, doors: [[6, 11], [7, 11], [8, 11]], driveway: [7, 12] },
    ];

    for (const arm of arms) {
      const map = plot();
      const b = new Block(ARM);
      // Park a car on the driveway tile: C# `:2712` and its three twins are
      // `map.RemoveMapObjectAt(...)` with the comment "get rid of cars".
      map.placeMapObject(
        new MapObject("parked car", GameImages.OBJ_CAR1),
        new Point(arm.driveway[0], arm.driveway[1]),
      );

      const { roller, doorSides } = workshopRoller({ doorSide: arm.side });
      expect(
        makeMechanicWorkshop(contextFor(map, b, roller), 3),
        `workshop, ${arm.name} side`,
      ).toBe(true);
      // The method's only `roll(0, 4)` is the door side: no kit roll the way the
      // fire station has one, which is what makes `doorSides()` a count of 1.
      expect(doorSides(), `door-side rolls on the ${arm.name} arm`).toBe(1);

      const doors = objectsIn(map, b).filter((o) => o.startsWith(GameImages.OBJ_ROLLER_DOOR_CLOSED));
      expect(doors, `three doors on the ${arm.name} wall`).toHaveLength(3);
      for (const [x, y] of arm.doors) {
        const obj = map.getMapObjectAt(x, y);
        expect(obj, `door at ${x},${y}`).toBeInstanceOf(DoorWindow);
        expect((obj as DoorWindow).imageId).toBe(GameImages.OBJ_ROLLER_DOOR_CLOSED);
        expect(obj!.name, "the C# calls it a roller door").toBe("roller door");
        expect(map.getTileAt(x, y)!.model, `floor under the ${arm.name} door`).toBe(
          Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        );
      }

      const [dx, dy] = arm.driveway;
      expect(map.getMapObjectAt(dx, dy), `the car on the ${arm.name} driveway`).toBeNull();
      expect(map.getTileAt(dx, dy)!.model).toBe(Models.tiles.get(TileID.FLOOR_ASPHALT)!);

      // The sign: a bare wall tile with a door beside it, C# `:2755`.
      const signed: string[] = [];
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          if (!decorationsAt(map, x, y).includes(GameImages.DECO_MECHANIC)) continue;
          signed.push(`${x},${y}`);
          expect(borrowedContext!.countAdjDoors(map, x, y), `sign at ${x},${y}`).toBeGreaterThanOrEqual(1);
          expect(map.getMapObjectAt(x, y), `sign at ${x},${y} is on a bare wall`).toBeNull();
        }
      }
      expect(signed.length, `signs on the ${arm.name} wall`).toBe(2);
    }
  });

  it("hangs one power generator and fills the rest of the wall ring with workbenches", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2762-2780`, with both `rollChance`es answered "no": every tile the wall
    // test accepts takes an object, the first takes the district's single
    // generator and the rest are workbenches, and no tool is dropped on the way.
    const map = plot();
    const b = new Block(new Rect(2, 2, 11, 11));
    const { roller } = workshopRoller({ barrel: false, tool: false });
    expect(makeMechanicWorkshop(contextFor(map, b, roller), 3)).toBe(true);

    const objects = objectsIn(map, b);
    const furniture = furnitureIn(map, b);
    expect(furniture.generators, "one power generator, C# `:2774` Release 6-2").toBe(1);
    expect(furniture.benches, "the rest of the wall ring").toBeGreaterThan(0);
    expect(furniture.barrels, "barrel chance answered no").toBe(0);
    expect(itemsIn(map, b), "tool chance answered no").toEqual([]);

    // And the furniture is on the perimeter and nowhere else: `CountAdjWalls < 3`
    // is 8-way in the reference, so the middle of a 7x7 floor never qualifies.
    const ctx = borrowedContext!;
    for (const entry of objects) {
      if (!entry.startsWith(GameImages.OBJ_WORKBENCH)) continue;
      const [x, y] = entry.split("@")[1]!.split(",").map(Number);
      expect(ctx.countAdjWalls(map, x, y), `${entry} has three wall neighbours`).toBeGreaterThanOrEqual(3);
    }
    const centre = map.getTileAt(7, 7)!;
    expect(centre.isInside, "the centre of the room is inside").toBe(true);
    expect(map.getMapObjectAt(7, 7), "and carries nothing").toBeNull();
  });

  it("drops a construction tool one tile in five when that roll says so", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2768-2769`. The drop is *not* inside an `else`: a tile that takes the
    // 20% goes on to take a workbench as well, so the item and the object coexist.
    const map = plot();
    const b = new Block(new Rect(2, 2, 11, 11));
    const { roller } = workshopRoller({ tool: true, barrel: false });
    expect(makeMechanicWorkshop(contextFor(map, b, roller), 3)).toBe(true);

    expect(itemsIn(map, b).length, "every wall-adjacent tile dropped a tool").toBeGreaterThan(0);
    expect(objectsIn(map, b).filter((o) => o.startsWith(GameImages.OBJ_WORKBENCH)).length).toBeGreaterThan(0);
  });

  it("lays wrecked cars only on tiles that are inside and walkable", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2782-2795`. `WreckedCarChance` is moved to 100 rather than scripted so
    // the second fill is asked on every tile: `rollChance` is distinguished from
    // the barrel's by the chance value, and both default to 10.
    const map = plot();
    const b = new Block(new Rect(2, 2, 11, 11));
    const params = newParams();
    params.wreckedCarChance = 100;
    const ctx = { ...borrowedContext!, params };
    const { roller } = workshopRoller({ barrel: false });
    expect(makeMechanicWorkshop({ ...ctx, map, block: b, roller }, 3)).toBe(true);

    const cars = carsIn(map, b);
    expect(cars.length, "100% chance per interior tile").toBeGreaterThan(0);
    for (const { x, y } of cars) {
      const tile = map.getTileAt(x, y)!;
      expect(tile.isInside, `car at ${x},${y} is on an inside tile`).toBe(true);
      expect(tile.model.isWalkable, `car at ${x},${y} is on a walkable tile`).toBe(true);
    }

    // And with the chance at zero the second fill puts nothing down at all, which
    // is what makes "the cars came from `:2782`" a statement rather than a hope.
    const empty = plot();
    const zeroParams = newParams();
    zeroParams.wreckedCarChance = 0;
    const zeroCtx = { ...borrowedContext!, params: zeroParams, map: empty, block: b, roller: workshopRoller().roller };
    expect(makeMechanicWorkshop(zeroCtx, 3)).toBe(true);
    expect(carsIn(empty, b)).toEqual([]);
  });

  it("is deterministic for a given block and roller", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // A *real* roller, not the scripted one: the script pins every die this
    // method spends, so two scripted seeds would be two identical runs and the
    // test below would pass on a generator that ignored its roller entirely.
    const build = (seed: number) => {
      const map = plot();
      makeMechanicWorkshop(contextFor(map, new Block(new Rect(2, 2, 11, 11)), new DiceRoller(seed)), 3);
      return fingerprint(map);
    };
    expect(build(7), "same seed, same district").toBe(build(7));
    expect(build(8), "a different seed differs").not.toBe(build(7));
  });
});

// ── CLASSIC ─────────────────────────────────────────────────────────────────

describe("mechanic workshop under CLASSIC", () => {
  it("is never reached, even on a block the cascade offers", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // The gate is the generator's first statement, so the `false` here is the
    // feature and not luck: nothing is written, not even the walls, and above all
    // no die is spent — the district's dice stream is the thing at stake.
    const map = plot();
    const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
    expect(makeMechanicWorkshop(contextFor(map, new Block(new Rect(2, 2, 11, 11)), workshopRoller().roller), 3)).toBe(
      false,
    );
    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    expect(map.getTileAt(4, 4)!.model).toBe(grass);
  });

  it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
    // The same committed constant `bank-building`, `clinic-building`,
    // `fire-station-building`, `junkyard-building` and `library-building` all
    // assert. A CLASSIC world pays nothing for the workshop — the whole cascade is
    // behind `cascadeEnabled`, which is false under Classic — so this value is the
    // same value those five files commit, and a die moved anywhere in the region
    // shows up in all six.
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = fingerprint(newGenerator().generate(SEED));
    expect(classic).toBe(CLASSIC_FINGERPRINT);

    // The two assertions that give the committed value meaning: a fingerprint that
    // ignored the world would pass the first line for any value.
    expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);
    expect(fingerprint(newGenerator(newParams(40, 40)).generate(1))).toBe("9bb5e4907bc3f62c");

    // And the Still Alive fingerprint for the same seed has to differ, or the
    // committed constant is only being asserted against itself. Not committed:
    // every Stage 5 building moves this number, and the workshop moves it again.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
  });
});
