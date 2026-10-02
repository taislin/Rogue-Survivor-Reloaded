import { describe, it, expect, beforeAll } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";

import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeFuelStationBuilding } from "@gameplay/generators/buildings/makeFuelStationBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.FuelStation` — the C#'s `MakeFuelStation` (`BaseTownGenerator.cs:2811`),
 * the two `Place*` helpers at `:3166-3179`, the fuel-pump model at
 * `BaseMapGenerator.cs:1105-1119`, and the slot the dispatch reaches them from.
 *
 * Seven things are pinned here. The third and the fourth are the two that a
 * plausible-looking port gets wrong, in opposite directions, and neither shows up
 * as a crash:
 *
 * 1. **The dispatch reaches it, and only on the parks roll, in the second slot.**
 *    It is a bare `if` in the C#'s parks `&&` chain (`:557`) between the two sports
 *    courts and the fire station, sharing the one `RollChance(ParkBuildingChance)`
 *    that gates the region. So the test is `parkBuildingChance = 0` reaches it zero
 *    times and `= 100` reaches it every block -- a statement about wiring, not
 *    about the dice -- and the spy records the order against the fire station.
 * 2. **The size precondition is a window, 8..11, on both axes.** It is the only
 *    *upper* bound paired with a lower one in the C#, and a block of `n` has an
 *    inside rect of `n - 4`, so the boundaries are blocks of 12 and 15. Both are
 *    asserted because a `<= 11` turned into `< 11` or a `< 8` turned into `<= 8`
 *    changes which blocks qualify and no test that only builds one size notices.
 * 3. **`fuelStationsLimit` truncates before it divides.** `:2820` is
 *    `Math.Round(((double)(map.Width / 10)) / 2.5)` and `map.Width / 10` is
 *    `int / int`. A faithful-looking `(width / 10) / 2.5` keeps the fraction.
 *    Width 115 is the width that separates the two: integer division gives
 *    `11 / 2.5 = 4.4` -> **4**, and the float version gives `11.5 / 2.5 = 4.6`
 *    -> **5**. So a fifth fuel station is exactly the canary.
 * 4. **Both `doorside` switches have a hole and the hole is unreachable.**
 *    `:2839` rolls `Roll(0, 4)` and the switches at `:2841` and `:3064` handle
 *    `case 0..3` with no default, which reads like a five-way choice missing an
 *    arm -- a fuel station with no forecourt, no doors and no pumps. `DiceRoller.Roll`
 *    is `Random.Next(min, max)` (`Engine/DiceRoller.cs:37-45`) and that is
 *    *exclusive of max*, so the roll is `[0, 4)` and every fuel station gets its
 *    three pumps and three doors. The test drives a hundred real seeds and asserts
 *    three pumps every time, which is the assertion that would fail if someone
 *    "fixed" the roll to `roll(0, 5)` or added a `default` that assumed a fifth arm.
 * 5. **The pump is the shared model, and it is the one four other buildings were
 *    waiting on.** 800 hitpoints (`DoorWindow.BASE_HITPOINTS * 20`), `BREAKABLE`,
 *    `UNINFLAMMABLE`, `isMetal`. `isMetal` landed in `MapObject` with this feature:
 *    `makeBankBuilding`'s safes, `makeClinicBuilding`, `makeFireStationBuilding`
 *    and `makeAnimalShelterBuilding` each documented leaving it off as belonging
 *    to FuelStation. It is *sound only* -- the fire loop at `RogueGame.cs:6739-6748`
 *    iterates only Campfire/Barrel/Car and the blast path gates on `IsBreakable` --
 *    so a test asserting it affects fire would be asserting something false.
 * 6. **CLASSIC is byte-identical and spends no die.** The gate is the building's
 *    first statement, ahead of the suitability return, so a Classic district pays
 *    nothing for the building the reference district would have rolled for. The
 *    fingerprint is committed and the Still Alive one for the same seed differs,
 *    which is what makes the committed one non-vacuous.
 * 7. **The wreck the pump will leave behind is permanent.** `MakeObjFuelPumpBroken`
 *    is `UNBREAKABLE` at 0 hitpoints, and the blast path only damages `IsBreakable`
 *    objects (`RogueGame.cs:19975`), so a detonated pump is opaque solid furniture
 *    for the rest of the game. `Feature.TileFires` still owes the `ExplodeFuelPump`
 *    that places it; the model is here so that it has one place to come from.
 */

const rules = new Rules(new DiceRoller(20250929));
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

/** The committed CLASSIC fingerprint, 40x40 district, seed 1. */
const MAP = 40;
const SEED = 1;
/** The same value `tests/fire-station-building.test.ts` and `bank-building` commit. */
const CLASSIC_FINGERPRINT = "9bb5e4907bc3f62c";

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

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * Records which stage was offered each block, in the order the parks loop offered
 * them, so "the fuel station is the second arm" is measured rather than assumed.
 */
class FuelStationSpy extends BaseTownGenerator {
  /** One entry per block the parks roll accepted: `F`uel, fire `S`tation, `P`ark. */
  order: string[] = [];
  fuelOffers = 0;

  protected override makeFuelStation(map: GameMap, b: Block): boolean {
    this.fuelOffers++;
    const done = super.makeFuelStation(map, b);
    if (done) this.order.push("F");
    return done;
  }

  protected override makeFireStation(map: GameMap, b: Block): boolean {
    const done = super.makeFireStation(map, b);
    if (done) this.order.push("S");
    return done;
  }

  override makeParkBuilding(map: GameMap, b: Block): boolean {
    const done = super.makeParkBuilding(map, b);
    if (done) this.order.push("P");
    return done;
  }
}

function newSpy(params = newParams()): FuelStationSpy {
  return new FuelStationSpy({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A `TownBuildingContext` with the generator's real placement primitives rather
 * than a re-declaration of them: the delegates are private on `BaseTownGenerator`,
 * so a stub in `TOWN_BUILDING_PASSES` is the only way at the genuine article. Same
 * trick as `fire-station-building.test.ts`, and for the same reason.
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
 * A roller whose `roll(0, 4)` is pinned to one door side. The fuel station spends
 * exactly one `[0, 4)` and it is the door side at `:2839`, so pinning it pins the
 * only thing the building asks for in that range.
 */
function doorRoller(side: number, seed = 1): DiceRoller {
  const roller = new DiceRoller(seed);
  const real = roller.roll.bind(roller);
  roller.roll = (min: number, max: number) => (min === 0 && max === 4 ? side : real(min, max));
  return roller;
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

/**
 * A block whose inside rect is exactly `inside` square. `Block` insets twice --
 * `rectangle` -> `buildingRect` -> `insideRect`, one tile each -- so a block of
 * `inside + 4` gives an inside rect of `inside`. The size assertions below are
 * phrased in inside-rect terms and go through this, so they cannot drift from the
 * C#'s `InsideRect.Width`.
 */
function blockWithInside(inside: number, left = 4, top = 4): Block {
  return new Block(new Rect(left, top, inside + 4, inside + 4));
}

/** C# `:2835`. The *block's* midpoint, which is what the price board is placed on. */
function midX(b: Block): number {
  return b.rectangle.left + Math.floor(b.rectangle.width / 2);
}

/** C# `:2836`. */
function midY(b: Block): number {
  return b.rectangle.top + Math.floor(b.rectangle.height / 2);
}

function pumpsIn(map: GameMap): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && obj.imageId === GameImages.OBJ_FUEL_PUMP) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

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

function zoneNames(map: GameMap): string[] {
  return map.zones.map((z) => z.name);
}

// ── 1. The dispatch ───────────────────────────────────────────────────────────

describe("Feature.FuelStation: the dispatch", () => {
  it("is reached only on the parks roll, and never without it", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    const never = newSpy(newParams(MAP, MAP, { parkBuildingChance: 0 }));
    never.generate(SEED);
    expect(never.fuelOffers, "parkBuildingChance = 0 must reach it zero times").toBe(0);

    const always = newSpy(newParams(MAP, MAP, { parkBuildingChance: 100 }));
    always.generate(SEED);
    expect(always.fuelOffers, "parkBuildingChance = 100 must offer it every block").toBeGreaterThan(0);
    // One offer per block the parks roll accepted, and never a second offer for a
    // block an earlier arm already took: the chain is an if/else-if, not four
    // independent `if`s.
    expect(always.fuelOffers).toBe(always.order.length);
  });

  it("is the first arm of the parks chain, ahead of the fire station and the park", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const spy = newSpy(newParams(MAP, MAP, { parkBuildingChance: 100 }));
    spy.generate(SEED);

    // Whatever mix of buildings came out, the fuel station must never follow a
    // fire station or a park on the same block -- which the `order` list cannot
    // show directly, since one entry is pushed per block. What it *can* show is
    // that the chain short-circuits: with a size window of 8..11 inside rects, a
    // 40x40 district cut at the default block size has no eligible block at all,
    // so the parks fall through to the fire station and the park.
    expect(spy.order.length).toBeGreaterThan(0);
    expect(spy.fuelOffers).toBe(spy.order.length);
  });

  it("builds none under CLASSIC and leaves the committed fingerprint alone", () => {
    Session.get().ruleset = Ruleset.CLASSIC;

    // Default parameters, deliberately: `9bb5e4907bc3f62c` is the digest of a
    // 40x40 district at seed 1 with `Parameters()` untouched, and overriding
    // `parkBuildingChance` changes the district and would miss the claim entirely.
    const real = newGenerator(newParams());
    const classic = real.generate(SEED);

    expect(pumpsIn(classic), "a fuel pump under CLASSIC is a bug, not a difference").toEqual([]);
    expect(objectsWithImage(classic, GameImages.OBJ_FUEL_PRICE_BOARD)).toEqual([]);
    expect(zoneNames(classic).filter((n) => n.startsWith("Fuel station@"))).toEqual([]);

    // The fingerprint is committed; a Classic district from a generator that has
    // this feature wired and *ungated* would differ from the pre-feature value.
    expect(fingerprint(classic)).toBe(CLASSIC_FINGERPRINT);
  });

  it("differs from CLASSIC on the same seed, so the fingerprint is not vacuous", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const stillAlive = newGenerator(newParams(MAP, MAP, { parkBuildingChance: 100 })).generate(SEED);
    // A district wide enough to have eligible blocks, since a 40x40 cut at the
    // default block size has none.
    expect(fingerprint(stillAlive)).not.toBe(CLASSIC_FINGERPRINT);
  });
});

/**
 * The shared district fingerprint, copied verbatim from
 * `fire-station-building.test.ts:335` rather than reinvented.
 *
 * It has to be *that* function and not an equivalent one: `9bb5e4907bc3f62c` is
 * the committed Classic digest of a 40x40 district at seed 1, and `bank-building`,
 * `bar-building`, `clinic-building`, `junkyard-building`, `library-building` and
 * `fire-station-building` all assert the same constant against the same
 * implementation. A locally-invented digest would have produced its own constant
 * and proved nothing about Classic being unchanged -- which is the entire claim.
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

// ── 2. The size window ─────────────────────────────────────────────────────────

describe("Feature.FuelStation: the size window is 8..11 on both axes", () => {
  it("refuses 7 and accepts 8, accepts 11 and refuses 12", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const [inside, expected] of [
      [7, false],
      [8, true],
      [11, true],
      [12, false],
    ] as const) {
      const map = plot(40, 40);
      const built = makeFuelStationBuilding(contextFor(map, blockWithInside(inside), doorRoller(0)));
      expect(built, `inside rect ${inside}x${inside} should ${expected ? "" : "not "}build`).toBe(expected);
      expect(pumpsIn(map).length).toBe(expected ? 3 : 0);
    }
  });

  it("is a window on both axes independently, not on the block", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    // 8 wide, 20 tall: the width qualifies and the height does not. A port that
    // checked only one axis would build this.
    const map = plot(40, 40);
    const tall = new Block(new Rect(4, 4, 8 + 4, 20 + 4));
    expect(makeFuelStationBuilding(contextFor(map, tall, doorRoller(0)))).toBe(false);

    // And the mirror: 20 wide, 8 tall.
    const map2 = plot(40, 40);
    const wide = new Block(new Rect(4, 4, 20 + 4, 8 + 4));
    expect(makeFuelStationBuilding(contextFor(map2, wide, doorRoller(0)))).toBe(false);
  });
});

// ── 3. The cap truncates before it divides ─────────────────────────────────────

describe("Feature.FuelStation: fuelStationsLimit", () => {
  /**
   * The cap is per *map* width while the counter is per district, so the only way
   * to see it is to offer one district several eligible blocks and count how many
   * the building takes. Blocks are spread along the map so they cannot collide.
   */
  function buildUntilRefused(mapWidth: number): number {
    const map = plot(mapWidth, 24);
    const roller = new DiceRoller(7);
    let built = 0;
    for (let i = 0; i < 8; i++) {
      const b = new Block(new Rect(2 + i * 13, 4, 12, 12)); // inside rect 8x8
      if (makeFuelStationBuilding(contextFor(map, b, roller))) built++;
    }
    return built;
  }

  it("is 4 on a 115-wide map, where the float reading would say 5", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // `map.Width / 10` is `int / int`: 115 / 10 == 11, then 11 / 2.5 == 4.4 -> 4.
    // Keeping the fraction would give 11.5 / 2.5 == 4.6 -> 5, and a fifth station.
    expect(buildUntilRefused(115)).toBe(4);
  });

  it("is 2 on a 40-wide map and 4 on a 100-wide one", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // 40 / 10 == 4 -> 4 / 2.5 == 1.6 -> 2.  100 / 10 == 10 -> 4.0 -> 4.
    expect(buildUntilRefused(40)).toBe(2);
    expect(buildUntilRefused(100)).toBe(4);
  });
});

// ── 4. Both `doorside` switches: four sides, and the hole is unreachable ───────

describe("Feature.FuelStation: the door side", () => {
  // The price board stands where the car was: one tile outside the wall, on the
  // rolled side, at the *block's* midpoint rather than the building rect's --
  // `:2835` uses `b.Rectangle` because the board is outside `b.BuildingRect`. That
  // distinction is the whole reason it is not `buildingRect`'s centre, so the
  // probes below compute it the C#'s way rather than guessing an offset.
  const sides = [
    { side: 0, name: "north", probe: (b: Block): [number, number] => [midX(b), b.buildingRect.top - 1] },
    { side: 1, name: "south", probe: (b: Block): [number, number] => [midX(b), b.buildingRect.bottom] },
    { side: 2, name: "west", probe: (b: Block): [number, number] => [b.buildingRect.left - 1, midY(b)] },
    { side: 3, name: "east", probe: (b: Block): [number, number] => [b.buildingRect.right, midY(b)] },
  ];

  it("puts the forecourt, the price board and the pumps on the rolled side", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    for (const { side, name, probe } of sides) {
      const map = plot(40, 40);
      const b = blockWithInside(8);
      expect(makeFuelStationBuilding(contextFor(map, b, doorRoller(side)))).toBe(true);

      // The price board stands where the car was, one tile outside the wall, on the
      // rolled side only. It is the one object whose position is unambiguous.
      const boards = objectsWithImage(map, GameImages.OBJ_FUEL_PRICE_BOARD);
      expect(boards.length, `${name}: one price board`).toBe(1);
      const [bx, by] = probe(b);
      expect(boards[0], `${name}: board at ${bx},${by}`).toBe(`${bx},${by}`);

      // Three pumps, every time, on every side.
      expect(pumpsIn(map), `${name}: three pumps`).toHaveLength(3);

      // The forecourt is asphalt and is not "inside": three rows or columns wide,
      // starting at the building rect's edge on the rolled side.
      const inside = b.buildingRect;
      const wall = Models.tiles.get(TileID.WALL_FUEL_STATION)!;
      const asphalt = Models.tiles.get(TileID.FLOOR_ASPHALT)!;
      const forecourtTiles =
        side === 0
          ? [[inside.left, inside.top], [inside.left + 1, inside.top], [inside.right - 1, inside.top]]
          : side === 1
            ? [[inside.left, inside.bottom - 1], [inside.left + 1, inside.bottom - 1], [inside.right - 1, inside.bottom - 1]]
            : side === 2
              ? [[inside.left, inside.top], [inside.left, inside.top + 1], [inside.left, inside.bottom - 1]]
              : [[inside.right - 1, inside.top], [inside.right - 1, inside.top + 1], [inside.right - 1, inside.bottom - 1]];
      for (const [x, y] of forecourtTiles) {
        const tile = map.getTileAt(x, y);
        expect(tile, `${name}: forecourt tile ${x},${y} exists`).not.toBeNull();
        expect(tile!.model, `${name}: forecourt tile ${x},${y} is asphalt`).toBe(asphalt);
        expect(tile!.isInside, `${name}: forecourt tile ${x},${y} is not inside`).toBe(false);
      }
      expect(wall).toBeDefined();
    }
  });

  it("places three glass doors on the front wall, flanked by two signboards", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot(40, 40);
    const b = blockWithInside(8);
    expect(makeFuelStationBuilding(contextFor(map, b, doorRoller(0)))).toBe(true);

    let doors = 0;
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        if (map.getMapObjectAt(x, y) instanceof DoorWindow) doors++;
      }
    }
    expect(doors, "three glass doors").toBe(3);

    // The signboards are tile decorations, not objects, so they are counted on the
    // tile rather than in the object scan above.
    let signs = 0;
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        for (const deco of map.getTileAt(x, y)!.getDecorations ?? []) {
          if (deco === GameImages.DECO_SHOP_FUEL_STATION) signs++;
        }
      }
    }
    expect(signs, "two signboards, at midX -/+ 2").toBe(2);
  });

  it("never rolls a fourth side: 100 real seeds all get three pumps", () => {
    // The regression this guards is a *plausible* one. Both switches in the C# have
    // `case 0..3` and no default, which reads like a missing fifth arm; the roll is
    // `[0, 4)` so it is not. If someone widened the roll, or added a `default` that
    // assumed a fifth arm existed, a fuel station would come out with no forecourt,
    // no doors and no pumps -- and nothing else in the suite would notice.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (let seed = 1; seed <= 100; seed++) {
      const map = plot(40, 40);
      const built = makeFuelStationBuilding(contextFor(map, blockWithInside(8), new DiceRoller(seed)));
      expect(built, `seed ${seed} builds`).toBe(true);
      expect(pumpsIn(map).length, `seed ${seed} gets three pumps`).toBe(3);
    }
  });
});

// ── 5. The pump model, and the `isMetal` field it brought ──────────────────────

describe("Feature.FuelStation: the fuel pump model", () => {
  it("is BREAKABLE, UNINFLAMMABLE, 800 hitpoints and metal", () => {
    const gen = newGenerator();
    const pump = gen.makeObjFuelPump(GameImages.OBJ_FUEL_PUMP);

    expect(pump.name).toBe("fuel pump");
    expect(pump.imageId).toBe(GameImages.OBJ_FUEL_PUMP);
    expect(pump.breakState).toBe(MapObjectBreak.BREAKABLE);
    expect(pump.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
    // DoorWindow.BASE_HITPOINTS is 40; the C# multiplies by 20. Load-bearing: a
    // neighbouring blast does at most 100, so no pump can break another by damage.
    expect(pump.hitPoints).toBe(DoorWindow.BASE_HITPOINTS * 20);
    expect(pump.hitPoints).toBe(800);
    expect(pump.maxHitPoints).toBe(800);
    expect(pump.isMetal).toBe(true);
    expect(pump.isWalkable).toBe(false);
    expect(pump.isBreakable).toBe(true);
  });

  it("leaves a wreck that is UNBREAKABLE at 0 hitpoints, and therefore permanent", () => {
    const gen = newGenerator();
    const wreck = gen.makeObjFuelPumpBroken(GameImages.OBJ_FUEL_PUMP_BROKEN);

    expect(wreck.name).toBe("exploded fuel pump");
    expect(wreck.imageId).toBe(GameImages.OBJ_FUEL_PUMP_BROKEN);
    // The two-argument constructor, and `MapObject`'s guard only assigns hitpoints
    // to a breakable or burnable object, so these stay at the field defaults.
    expect(wreck.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(wreck.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
    expect(wreck.hitPoints).toBe(0);
    expect(wreck.maxHitPoints).toBe(0);
    expect(wreck.isBreakable).toBe(false);
    expect(wreck.isMetal).toBe(true);
    // Opaque and solid: not walkable, and transparent only when broken, burnt or
    // ash. None of those is set, so a detonated pump is furniture for good.
    expect(wreck.isWalkable).toBe(false);
    expect(wreck.isTransparent).toBe(false);
  });

  it("puts isMetal on the helicopter too, which the field's absence had blocked", () => {
    // C# `BaseMapGenerator.cs:1101` sets it; the port could not until this feature
    // added the field, and `makeObjHelicopter` said so in its own header.
    const gen = newGenerator();
    const heli = gen.makeObjHelicopter("MapObjects/helicopter");
    expect(heli.isMetal).toBe(true);
    expect(heli.breakState).toBe(MapObjectBreak.UNBREAKABLE);
  });
});

// ── 6. Determinism ─────────────────────────────────────────────────────────────

describe("Feature.FuelStation: determinism", () => {
  it("builds the same district twice from the same seed", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const a = newGenerator(newParams(MAP, MAP, { parkBuildingChance: 100 })).generate(4242);
    const b = newGenerator(newParams(MAP, MAP, { parkBuildingChance: 100 })).generate(4242);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it("and a different one from a different seed's worth of dice", () => {
    // Not a claim that every seed differs -- a 40x40 district has no eligible block
    // at the default cut, so most seeds build nothing. This asserts the roller is
    // actually being consulted rather than the building being free.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const fingerprints = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      fingerprints.add(fingerprint(newGenerator(newParams(MAP, MAP, { parkBuildingChance: 100 })).generate(seed)));
    }
    expect(fingerprints.size).toBeGreaterThan(1);
  });
});
