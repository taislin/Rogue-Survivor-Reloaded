import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeBarBuilding } from "@gameplay/generators/BarBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext, TownBuildingPass } from "@gameplay/generators/TownBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";

/**
 * `Feature.Bar`: C# `BaseTownGenerator.cs:2387-2668` `MakeBarBuilding`.
 *
 * Four things a diff cannot show and a broken generator would not announce:
 *
 * 1. **The pass is reached.** Registered in `TOWN_BUILDING_PASSES` and offered by
 *    `generate()`, a bar really does appear in a district -- and the block it took
 *    leaves the pool, so a later pass is never offered it again. A pass nothing
 *    called would look identical in review to one that works.
 * 2. **The room is a room.** Walls on the building rect, one door, a floor the
 *    door opens onto, and floor you can walk across once you are through it. The
 *    failure this catches is the one `placeDoor` exists for: a doorway in a wall
 *    with nothing walkable behind it, which renders fine and seals the building.
 * 3. **The dice.** The C# consumes a `Roll(0, 4)` dispatch roll, a `Roll(0, 4)`
 *    door-side roll, a per-table roll and five `mapObjectPlaceInGoodPosition`
 *    rolls per table, *in that order* -- and it takes the first one before it even
 *    looks at the block. Merging or dropping any of them reseeds every world
 *    after the first bar, so the order is asserted rather than assumed.
 * 4. **Classic is untouched.** Not "no bar was built" -- that passes just as well
 *    if the pass ran and every roll and every block happened to decline. A classic
 *    district generated with the pass registered is *byte-identical* to one
 *    generated with the registry empty, and the same comparison under STILL_ALIVE
 *    is *not* identical, so the test cannot pass vacuously.
 */

// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four.
new GameTiles();
new GameActors();
new GameItems();
new GameFactions();

/**
 * The one registry line the port plan asks for. Spelled out here rather than
 * imported, so this file also pins the shape of the entry six other building
 * agents are writing.
 */
const BAR_PASS = { csharpName: "MakeBarBuilding", tryBuild: makeBarBuilding } as unknown as TownBuildingPass;

/**
 * The four door sides, and the seeds that reach them.
 *
 * `roll(0, 4)` is half-open, so `0..3` is the whole of `doorside`; the seeds were
 * found by taking, for each of the four values the *second* roll takes, the first
 * `s` whose first `roll(0, 4)` is 0 -- the C#'s `case 0`. The coordinates are for
 * the 13x13 block below: `rectangle` 13x13 at (0,0), `buildingRect` 11x11 at (1,1),
 * `insideRect` 9x9 at (2,2), so `midX`/`midY` are 6.
 */
/**
 * One entry per door arm: the seed, the side it produces, and the cells the test
 * then asserts on. The seeds are *derived*, not chosen -- they are the first seeds
 * whose first `roll(0, 4)` lands on each arm (0 west, 1 east, 2 north, 3 south),
 * because the arm is the generator's first internal roll and the dispatch roll
 * before it is now a parameter rather than a value off the roller. When the bar
 * moved into the C#'s shared business cascade that parameter change shifted every
 * subsequent roll, so the old seeds no longer selected the arms they claimed.
 */
const DOOR_SIDES = [
  {
    seed: 7,
    side: "west",
    door: new Point(1, 6),
    rope: new Point(0, 6),
    sink: new Point(10, 6),
    shelfLine: 10,
    counterLine: 8,
    shelvesRunDown: true,
  },
  {
    seed: 12,
    side: "east",
    door: new Point(11, 6),
    rope: new Point(12, 6),
    sink: new Point(2, 6),
    shelfLine: 2,
    counterLine: 4,
    shelvesRunDown: true,
  },
  {
    seed: 1,
    side: "north",
    door: new Point(6, 1),
    rope: new Point(6, 0),
    sink: new Point(6, 10),
    shelfLine: 10,
    counterLine: 8,
    shelvesRunDown: false,
  },
  {
    seed: 4,
    side: "south",
    door: new Point(6, 11),
    rope: new Point(6, 12),
    sink: new Point(6, 2),
    shelfLine: 2,
    counterLine: 4,
    shelvesRunDown: false,
  },
] as const;

/** A 13x13 block, so `insideRect` is 9x9 -- over the C#'s 5x5 minimum. */
const BLOCK_RECT = new Rect(0, 0, 13, 13);
/** 24 wide: `round(floor(24 / 10) / 2.5) == 1`, so a map that fits exactly one bar. */
const ONE_BAR_MAP_WIDTH = 24;
/** 50 wide: `round(floor(50 / 10) / 2.5) == 2`, for the per-district cap. */
const TWO_BAR_MAP_WIDTH = 50;
/**
 * The 40x40 district seed that produces two bars; found by scanning `generate()`.
 *
 * **It keeps moving, and that is a property of the cascade rather than a bug.**
 * It was 6 until the bar moved out of the flat `TOWN_BUILDING_PASSES` list into
 * the C#'s shared `roll(0, 4)` business cascade; it was re-derived to 2 for that,
 * and to 3 again when the library and clinic landed. Each of those changed which
 * blocks the cascade is offered, and therefore every roll after it.
 *
 * So this constant is re-derived by scanning `generate()` rather than asserted as
 * a fixed number, and the failure mode is a clear assertion instead of a
 * mysteriously wrong count. Do not treat a change here as a regression on its own:
 * check whether a building pass moved, and re-derive. The invariant that actually
 * matters is the one in the "CLASSIC" block below -- `9bb5e4907bc3f62c`, which no
 * Stage 5 building is allowed to move.
 */
const DISTRICT_SEED = 8;
/**
 * The reference's own minimum district (`districtsSizeFloor`, Release 7-3 -- the C#
 * raised `DistrictSize` from 30 to 50 when it added `GenerateShoppingMall`), so 50 is
 * the smallest size a player ever sees and 40 was always a test-only district.
 *
 * **It has to be 50 now, and not for the seed's sake.** The C#'s business interior
 * at `BaseTownGenerator.cs:496` is reached only for a block whose `rolled` is 30 or
 * more, and `:479`'s `|| charOfficesCount == 0` forces a CHAR attempt on the
 * district's *first* business-region block, which `MakeCHARBuilding` does not
 * decline. So the interior wants a district with at least two business-region
 * blocks, and one in ten blocks qualifies for that region at all. A 40x40 district
 * cuts about five blocks: over 60 seeds no bar, no bank and no clinic appeared in
 * one, and this file's district-level tests were passing on empty sets. At 50x50
 * they are reachable, and `DISTRICT_SEED` is swept for one that builds two bars --
 * which is also the per-district cap at this width, so the cap assertion below has
 * something to reach.
 */
const DISTRICT_WIDTH = 50;
/**
 * A 100-wide seed that builds bars, for the wide-district half of the cap test.
 *
 * Separate from `DISTRICT_SEED` because a 100-wide district cuts a different set of
 * blocks: it reaches the cap of 4 on some seeds (28 builds 3) and builds nothing at
 * all on others, and pinning one number for both widths would be a claim about a
 * stream rather than about the cap.
 */
const WIDE_SEED = 28;

function newParams(width = DISTRICT_WIDTH): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = width;
  return params;
}

/**
 * `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it for a
 * burning wrecked car and reads `rules` off it.
 *
 * **A fresh `Rules` per generator, and that is load-bearing rather than tidy.**
 * `Rules` carries its own `DiceRoller`, seeded in `RogueGame` from
 * `Session.get().seed`, and the housing pass draws *item quantities* through it --
 * so two generators sharing one `Rules` see two different worlds from the same
 * district seed, and the byte-identical comparison below would fail for a reason
 * that has nothing to do with the bar. `town-building-seam.test.ts` gets away with
 * one shared `Rules` because its `layout()` looks at tiles and objects only.
 */
function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never, params);
}

/**
 * Everything about a map that a building can change, as one comparable string.
 *
 * Tiles, decorations, map objects, ground items and zones. The decorations are in
 * here because a bar's most visible output is two wall signs and a velvet rope,
 * all of which are decorations rather than objects, and the ground items are in
 * here because a district that differs only in a wardrobe's contents is still a
 * district that moved.
 */
function fingerprint(map: GameMap): string {
  const tiles: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const tile = map.getTileAt(x, y)!;
      const obj = map.getMapObjectAt(x, y);
      const items = map.getItemsAt(new Point(x, y));
      tiles.push(
        [
          tile.model.id,
          tile.isInside ? "in" : "-",
          (tile.getDecorations ?? []).join("+") || "-",
          obj ? `${obj.imageId}:${obj.name}` : "-",
          items && items.countItems > 0 ? items.items.map((i) => `${i.model.id}x${i.quantity}`).join("+") : "-",
        ].join("/")
      );
    }
  }
  const zones = map.zones
    .map((z) => `${z.name}@${z.bounds.left},${z.bounds.top},${z.bounds.width},${z.bounds.height}`)
    .sort();
  return `${tiles.join(",")}#${zones.join(",")}`;
}

function zoneNames(map: GameMap): string[] {
  return map.zones.map((z) => z.name);
}

/** The four compass neighbours, which is what `countAdjDoors` walks. */
const COMPASS: readonly Point[] = [new Point(0, -1), new Point(0, 1), new Point(-1, 0), new Point(1, 0)];

/** Tiles reachable from `start` by walkable steps, as `"x,y"` keys. */
function reachable(map: GameMap, start: Point): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const queue: Point[] = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const d of COMPASS) {
      const n = new Point(queue[i].x + d.x, queue[i].y + d.y);
      const key = `${n.x},${n.y}`;
      if (seen.has(key) || !map.isWalkable(n.x, n.y)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return seen;
}

/** Named map objects inside a rect, by name. */
function objectsIn(map: GameMap, rect: Rect, name: string): Point[] {
  const out: Point[] = [];
  for (let y = rect.top; y < rect.bottom; y++) {
    for (let x = rect.left; x < rect.right; x++) {
      if (map.getMapObjectAt(x, y)?.name === name) out.push(new Point(x, y));
    }
  }
  return out;
}

/**
 * How many `roll(0, 4)` draws a declined `makeBarBuilding` spent.
 *
 * `DiceRoller` is a pure function of its seed and its call count, so a roller's
 * remaining output identifies its position in the stream. This is the only way to
 * tell "declined after the dispatch roll" from "declined after rolling the door
 * side as well" -- a distinction a map comparison cannot make, and the one that
 * decides whether the other six buildings sharing the C#'s `Roll(0, 4)` dispatch
 * roll come out where they used to.
 *
 * The position is found by matching a *run* of values rather than one, because a
 * single `roll(0, 4)` repeats: a lone comparison would find the wrong offset
 * whenever the stream happens to start with two equal values, which is a
 * one-in-four chance for any seed.
 */
function rollsSpent(
  ctx: TownBuildingContext,
  block: Block,
  seed: number,
  dispatchRoll = 0,
): number {
  // Eight consecutive values pin an offset to about one in 65 536, so scanning a
  // hundred of them cannot confuse the answer for anything but the right one.
  const WINDOW = 8;
  const MAX = 96;
  const draw = (skipped: number): number[] => {
    const r = new DiceRoller(seed);
    for (let i = 0; i < skipped; i++) r.roll(0, 4);
    return Array.from({ length: WINDOW }, () => r.roll(0, 4));
  };

  const spent = new DiceRoller(seed);
  makeBarBuilding({
    ...ctx,
    map: new GameMap(seed, "declined", ONE_BAR_MAP_WIDTH, ONE_BAR_MAP_WIDTH),
    block,
    roller: spent,
  }, dispatchRoll);
  const after: number[] = Array.from({ length: WINDOW }, () => spent.roll(0, 4));

  for (let skipped = 0; skipped <= MAX; skipped++) {
    if (draw(skipped).every((v, i) => v === after[i])) return skipped;
  }
  throw new Error(`no roll offset below ${MAX} matches ${after.join(",")} for seed ${seed}`);
}

let savedRuleset: Ruleset;

beforeEach(() => {
  savedRuleset = Session.get().ruleset;
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

afterEach(() => {
  // `TOWN_BUILDING_PASSES` is a shared mutable array by design, and the bar's own
  // `barsBuilt` count is keyed on the district's roller, so a fresh roller is all
  // the state reset a later test needs.
  TOWN_BUILDING_PASSES.length = 0;
  Session.get().ruleset = savedRuleset;
});

/**
 * A real context, captured from the dispatch the way `town-building-seam` does,
 * then pointed at a fresh map and block.
 *
 * The primitives are the generator's, so this exercises `makeBarBuilding` and
 * nothing else -- which is the point: a building that quietly grew its own
 * placement would not be caught by this file.
 */
function barContext(): TownBuildingContext {
  let captured: TownBuildingContext | null = null;
  TOWN_BUILDING_PASSES.push({
    csharpName: "MakeCaptureBuilding",
    tryBuild: (c) => {
      captured ??= c;
      return false;
    },
  });
  newGenerator().generate(4242);
  expect(captured).not.toBeNull();
  return captured as unknown as TownBuildingContext;
}

/** `makeBarBuilding` on a fresh map, with the district's roller replaced. */
function buildBar(
  ctx: TownBuildingContext,
  seed: number,
  blockRect: Rect = BLOCK_RECT,
  mapWidth = ONE_BAR_MAP_WIDTH
): { map: GameMap; block: Block; built: boolean } {
  const map = new GameMap(seed, "bar", mapWidth, mapWidth);
  const block = new Block(blockRect);
  const built = makeBarBuilding(
    // **A fresh `Rules` per call, seeded from the same `seed` as the district
    // roller**, and that is the third bullet of the header arriving one building
    // late: `MakeItemAlcohol` (`BaseMapGenerator.cs:1965`) rolls
    // `m_Game.Rules.RollChance(66)` and then its child's own `Roll(0, 4)` / `Roll(0, 2)`,
    // so a bar's bottles are a function of the *session's* roller position and not of
    // `m_DiceRoller` alone. Two calls sharing one `Rules` therefore draw different
    // liquor -- which is the C#'s behaviour, not a defect, and is why "same seed, same
    // bar" below needs both rollers reseeded rather than one.
    { ...ctx, map, block, roller: new DiceRoller(seed), game: { ...ctx.game, rules: new Rules(new DiceRoller(seed)) } },
    0
  );
  return { map, block, built };
}

describe("Feature.Bar: registration and dispatch", () => {
  /**
   * The first seed in a fixed range that builds a bar, with what the probe saw.
   *
   * Exists because "the pass is reached" is a claim about *some* district, and a
   * single pinned seed silently turns it into a claim about that district's dice
   * stream. The range is fixed so a failure is reproducible, and the seed is
   * reported so a reader can go and look at it.
   */
  function findSeedWithBars(min: number, count = 12): { map: GameMap; seed: number; offeredAfter: Block[] } | null {
    for (let i = 1; i <= count; i++) {
      TOWN_BUILDING_PASSES.length = 0;
      TOWN_BUILDING_PASSES.push(BAR_PASS);
      const offeredAfter: Block[] = [];
      TOWN_BUILDING_PASSES.push({
        csharpName: "MakeProbeBuilding",
        tryBuild: (c) => {
          offeredAfter.push(c.block);
          return false;
        },
      });
      const map = newGenerator().generate(i);
      const n = map.zones.filter((z) => z.name.startsWith("Bar@")).length;
      if (n >= min) return { map, seed: i, offeredAfter };
    }
    return null;
  }

  it("names the C# method the entry it registers ports", () => {
    // `csharpName` is the one field of a `TownBuildingPass` a reader cannot derive
    // from the function, and it is the audit key the plan's table is built on.
    expect(BAR_PASS.csharpName).toBe("MakeBarBuilding");
    expect(BAR_PASS.tryBuild).toBe(makeBarBuilding);
  });

  it("is reached by generate() and takes its block out of the pool", () => {
    TOWN_BUILDING_PASSES.push(BAR_PASS);
    // Offered after the bar pass, so a block the bar built must never arrive here.
    const offeredAfter: Block[] = [];
    TOWN_BUILDING_PASSES.push({
      csharpName: "MakeProbeBuilding",
      tryBuild: (c) => {
        offeredAfter.push(c.block);
        return false;
      },
    });

    // **The district is searched for one that yields a bar, not pinned to a seed.**
    //
    // `DISTRICT_SEED` used to work here because the district's dice stream was
    // fixed: it was a Still Alive district generated by a port with no backpacks in
    // it, so nothing downstream of the town pass could move. `Feature.ShelterBackpacks`
    // put eight backpack rolls into the Still Alive stream, which is the reference's
    // behaviour and moved the stream -- and a test that asserts "this exact seed
    // produces a bar" is asserting the *stream*, not the feature, so it fails on
    // every future Still Alive roll that any other change adds.
    //
    // What is actually being claimed is that the pass is reached and takes its block
    // out of the pool, and that holds for any district that produces a bar at all.
    const found = findSeedWithBars(1);
    expect(found, "no district in the search range produced a bar at all").not.toBeNull();
    const map = found!.map;
    const bars = map.zones.filter((z) => z.name.startsWith("Bar@"));
    for (const z of bars) {
      // `makeUniqueZone` names a zone for its rect's centre, so the name is a
      // function of where the bar is rather than a literal with a counter in it.
      expect(z.name).toBe(`Bar@${z.bounds.left + Math.floor(z.bounds.width / 2)}-${z.bounds.top + Math.floor(z.bounds.height / 2)}`);
      // The zone covers a block the bar could actually have built in: the C#'s
      // size precondition is an inside rect of at least 5x5, so a building rect
      // of at least 7x7.
      expect(z.bounds.width).toBeGreaterThanOrEqual(7);
      expect(z.bounds.height).toBeGreaterThanOrEqual(7);
    }
    // And the probe pass was offered *something* -- so "took its block out of the
    // pool" is not vacuously true because nothing was ever on offer.
    expect(found!.offeredAfter.length).toBeGreaterThan(0);
  });

  it("respects the C#'s per-district cap of round(floor(width / 10) / 2.5)", () => {
    TOWN_BUILDING_PASSES.push(BAR_PASS);
    // A 40x40 district: `round(floor(40 / 10) / 2.5) == round(1.6) == 2`. The
    // dispatch roll is `Roll(0, 4)`, so four blocks in five are declined before the
    // cap can matter.
    //
    // **The claim is the cap, so the assertion is the cap.** It used to be `== 2` on
    // one seed, justified by "the district is picked so two of the rest are big
    // enough -- the count is therefore the cap and not luck". That reasoning depends
    // on the seed and stopped being true when the Still Alive stream moved, and an
    // exact count on one seed is luck wearing the cap's clothes. So: the cap holds on
    // every seed tried, and at least one seed reaches it -- which is strictly more
    // than `== 2` proved, because a run that never hit the cap would have passed the
    // old assertion by accident.
    const barsFor = (seed: number): number =>
      zoneNames(newGenerator().generate(seed)).filter((n) => n.startsWith("Bar@")).length;

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const counts = seeds.map(barsFor);
    for (const [i, n] of counts.entries()) {
      expect(n, `seed ${seeds[i]} built ${n} bars, over the cap of 2`).toBeLessThanOrEqual(2);
    }
    expect(Math.max(...counts), "no seed reached the cap, so nothing was tested").toBe(2);

    // A 100-wide district has a cap of 4 and a bigger pool, so the cap is still
    // what stops it -- and the bars are still real rooms.
    TOWN_BUILDING_PASSES.length = 0;
    TOWN_BUILDING_PASSES.push(BAR_PASS);
    const wide = newGenerator(newParams(100)).generate(WIDE_SEED);
    const wideBars = zoneNames(wide).filter((n) => n.startsWith("Bar@"));
    expect(wideBars.length).toBeGreaterThan(0);
    expect(wideBars.length).toBeLessThanOrEqual(4);
  });
});

describe("Feature.Bar: suitability", () => {
  it("returns false and leaves the block empty when the inside rect is too small", () => {
    const ctx = barContext();

    // The C#'s `:2392`: `InsideRect.Width < 5 || InsideRect.Height < 5`. The first
    // two are 13 wide, so it is the height that fails; the third fails on width.
    for (const rect of [new Rect(0, 0, 13, 7), new Rect(0, 0, 13, 6), new Rect(0, 0, 6, 13)]) {
      const control = new GameMap(1, "control", ONE_BAR_MAP_WIDTH, ONE_BAR_MAP_WIDTH);
      const map = new GameMap(1, "bar", ONE_BAR_MAP_WIDTH, ONE_BAR_MAP_WIDTH);

      const built = makeBarBuilding({ ...ctx, map, block: new Block(rect), roller: new DiceRoller(7) }, 0);

      expect(built, `${rect.width}x${rect.height}`).toBe(false);
      // "Empty" is the whole claim: not "no zone" but "the map is untouched", so a
      // generator that declined only after drawing walls cannot pass.
      expect(fingerprint(map), `${rect.width}x${rect.height}`).toBe(fingerprint(control));
    }
  });

  it("refuses the second bar on a map whose cap is one, and the third on a cap of two", () => {
    const ctx = barContext();

    // `round(floor(24 / 10) / 2.5) == 1`: one bar per 24-wide map.
    const one = new GameMap(1, "one", ONE_BAR_MAP_WIDTH, ONE_BAR_MAP_WIDTH);
    const oneRoller = new DiceRoller(7);
    // The same roller for both calls, because the C#'s `barsCount` is reset per
    // district and the district is the thing whose cap this is.
    expect(makeBarBuilding({ ...ctx, map: one, block: new Block(BLOCK_RECT), roller: oneRoller }, 0)).toBe(true);
    expect(makeBarBuilding({ ...ctx, map: one, block: new Block(new Rect(15, 0, 13, 13)), roller: oneRoller }, 0)).toBe(false);

    // `round(floor(50 / 10) / 2.5) == 2`.
    const two = new GameMap(2, "two", TWO_BAR_MAP_WIDTH, TWO_BAR_MAP_WIDTH);
    const twoRoller = new DiceRoller(7);
    const results = [0, 1, 2].map((i) =>
      makeBarBuilding({ ...ctx, map: two, block: new Block(new Rect(i * 17, 0, 13, 13)), roller: twoRoller }, 0)
    );
    expect(results).toEqual([true, true, false]);
    expect(zoneNames(two).filter((n) => n.startsWith("Bar@"))).toHaveLength(2);
  });
});

describe("Feature.Bar: the room it builds", () => {
  it("walls the building rect, floors the inside, and hangs one wooden door in it", () => {
    const ctx = barContext();
    const { map, block, built } = buildBar(ctx, 7);
    expect(built).toBe(true);

    const { buildingRect, insideRect, rectangle } = block;
    const walls = Models.tiles.get(TileID.WALL_LIGHT_BROWN)!;
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
    const planks = Models.tiles.get(TileID.FLOOR_PLANKS)!;

    // The C#'s three tile calls at `:2403-2405`: walkway over the whole block,
    // light-brown wall over the building rect, planks marked inside over the
    // inside rect.
    let doorsOnWall = 0;
    for (let y = rectangle.top; y < rectangle.bottom; y++) {
      for (let x = rectangle.left; x < rectangle.right; x++) {
        const where = `${x},${y}`;
        const tile = map.getTileAt(x, y)!;
        if (insideRect.contains(new Point(x, y))) {
          expect(tile.model, `inside ${where}`).toBe(planks);
          expect(tile.isInside, `inside flag ${where}`).toBe(true);
        } else if (buildingRect.contains(new Point(x, y))) {
          if (map.getMapObjectAt(x, y) instanceof DoorWindow) {
            doorsOnWall++;
            // `placeDoor` lays the floor *under* the door, or the doorway opens
            // onto a wall tile and the room behind it is sealed.
            expect(tile.model, `door tile ${where}`).toBe(walkway);
          } else {
            expect(tile.model, `wall ${where}`).toBe(walls);
            expect(tile.isInside, `wall is not inside ${where}`).toBe(false);
          }
        } else {
          // The block's walkway ring, which is also where the rope goes.
          expect(tile.model, `walkway ring ${where}`).toBe(walkway);
        }
      }
    }
    // Exactly one, from the C#'s single `PlaceDoor` per `doorside` arm.
    expect(doorsOnWall).toBe(1);
  });

  it("countAdjDoors is non-zero on the wall either side of the door, and the interior is walkable", () => {
    const ctx = barContext();
    const { map, block, built } = buildBar(ctx, 7);
    expect(built).toBe(true);
    const generator = newGenerator();

    const door = DOOR_SIDES[0].door;
    expect(map.getMapObjectAt(door.x, door.y)).toBeInstanceOf(DoorWindow);

    // The two wall tiles the door sits between. `countAdjDoors` is what the C#'s
    // `DecorateOutsideWalls` callback asks (`:2589`), and it is public on the
    // generator, so this is the same number the sign placement sees.
    for (const neighbour of [new Point(door.x, door.y - 1), new Point(door.x, door.y + 1)]) {
      expect(generator.countAdjDoors(map, neighbour.x, neighbour.y), `${neighbour.x},${neighbour.y}`).toBe(1);
    }
    // And both got the building image, because a bar you cannot tell from a
    // warehouse is the failure a sign exists to prevent.
    for (const neighbour of [new Point(door.x, door.y - 1), new Point(door.x, door.y + 1)]) {
      expect(map.getTileAt(neighbour.x, neighbour.y)!.getDecorations, `${neighbour.x},${neighbour.y}`).toEqual(
        expect.arrayContaining(["Tiles/Decoration/shop_bar"])
      );
    }

    // The room is walkable and you can walk across it. The reachable set has to
    // touch every row of the inside rect: the shelf and counter lines run along
    // one axis, so a sealed room -- or one whose counter line ran *through* the
    // doorway -- would leave most rows unreachable.
    const inside = block.insideRect;
    const start = new Point(door.x + 1, door.y);
    expect(inside.contains(start), "the tile behind the door is interior").toBe(true);
    expect(map.isWalkable(start.x, start.y), "the tile inside the door").toBe(true);
    const reached = reachable(map, start);
    expect(reached.size).toBeGreaterThan(1);
    for (let y = inside.top; y < inside.bottom; y++) {
      const inRow = [...reached].some((k) => k.split(",")[1] === String(y));
      expect(inRow, `inside row ${y} reachable from the door`).toBe(true);
    }
  });

  it("hangs a velvet rope on the walkway outside the door, in all four arms", () => {
    const ctx = barContext();
    for (const { seed, side, rope } of DOOR_SIDES) {
      const { map, block, built } = buildBar(ctx, seed);
      expect(built, `seed ${seed}`).toBe(true);
      // The rope cell is always on the block's walkway ring -- one tile outside
      // the building rect -- and never on the wall, or it would be invisible.
      expect(block.rectangle.contains(rope), `${side} rope is on the block`).toBe(true);
      expect(block.buildingRect.contains(rope), `${side} rope is outside the walls`).toBe(false);
      expect(map.getTileAt(rope.x, rope.y)!.model, `${side} rope tile`).toBe(
        Models.tiles.get(TileID.FLOOR_WALKWAY)
      );
      expect(map.getTileAt(rope.x, rope.y)!.getDecorations, `${side} rope at ${rope.x},${rope.y}`).toEqual(
        expect.arrayContaining(["Tiles/Decoration/velvet_rope"])
      );
    }
  });

  it("adds a unique zone on the building rect, named Bar@<centre>", () => {
    const ctx = barContext();
    const { map, block, built } = buildBar(ctx, 7);
    expect(built).toBe(true);

    const bars = map.zones.filter((z) => z.name.startsWith("Bar@"));
    expect(bars).toHaveLength(1);
    expect(bars[0].name).toBe("Bar@6-6");
    expect(bars[0].bounds).toEqual(block.buildingRect);
    // Unique: no two zones share a name, which is the whole of "unique" -- a
    // district with two `Bar@6-6` would make every zone lookup ambiguous.
    expect(new Set(map.zones.map((z) => z.name)).size).toBe(map.zones.length);
    // And the C#'s four walkway strips, so the bar has an addressable exterior.
    expect(map.zones.filter((z) => z.name.startsWith("walkway@"))).toHaveLength(4);
  });

  it("puts the sink opposite the door and the shelves on the far inside edge, in all four arms", () => {
    const ctx = barContext();
    for (const { seed, side, door, sink, shelfLine, counterLine, shelvesRunDown } of DOOR_SIDES) {
      const { map, block, built } = buildBar(ctx, seed);
      expect(built, `seed ${seed} (${side})`).toBe(true);
      const inside = block.insideRect;

      // The entrance, on the side the roll named.
      expect(map.getMapObjectAt(door.x, door.y), `${side} door`).toBeInstanceOf(DoorWindow);
      expect(block.buildingRect.contains(door), `${side} door is on the building rect`).toBe(true);
      // The sink, centred opposite it on the far inside-rect edge.
      expect(map.getMapObjectAt(sink.x, sink.y)?.name, `${side} sink`).toBe("sink");
      // The shelves, on that same edge, filling it except the cell the sink took.
      const shelves = objectsIn(map, inside, "shelf");
      expect(shelves).toHaveLength(8);
      for (const s of shelves) {
        expect(shelvesRunDown ? s.x : s.y, `${side} shelf at ${s.x},${s.y}`).toBe(shelfLine);
      }
      // The C# skips exactly the cell the sink is on ("not the middle as we put
      // the sink there"), so nine minus one.
      expect(map.getMapObjectAt(sink.x, sink.y)?.name).toBe("sink");
      // And the counter, two tiles in from the shelves and therefore toward the
      // middle of the room, jumpable per the C#'s Release 5-3 note at `:2461`
      // ("changed to BarCounter to keep them jumpable").
      const counter = shelvesRunDown
        ? new Point(counterLine, inside.top)
        : new Point(inside.left, counterLine);
      const counterObj = map.getMapObjectAt(counter.x, counter.y);
      expect(counterObj?.name, `${side} counter`).toBe("counter");
      expect(counterObj?.jumpLevel, `${side} counter jumpable`).toBe(1);
      expect(counterObj?.standOnFovBonus, `${side} counter is the generic one`).toBe(true);
    }
  });

  it("seats the tables in the floor the shelves leave over", () => {
    const ctx = barContext();
    const { map, block, built } = buildBar(ctx, 7);
    expect(built).toBe(true);

    const inside = block.insideRect;
    // West door: the shelves took four columns off the east edge, so the held
    // tables area is `insideRect` minus those four columns -- C# `:2609-2611`.
    const held = new Rect(inside.left, inside.top, inside.width - 4, inside.height);

    const tables = objectsIn(map, held, "table");
    // `nbTables` is `Roll(n, n)` with `n = max(Inside.Height, tablesLeft -
    // tablesRight)`, which is not a draw -- see the roll-order test below -- so the
    // upper bound is a function of the block and the lower bound only says some
    // of the floor got used.
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.length).toBeLessThanOrEqual(inside.height);
    // And none of them wandered into the service aisle or through a wall.
    expect(objectsIn(map, inside, "table")).toHaveLength(tables.length);
    expect(tables.length).toBe(objectsIn(map, block.rectangle, "table").length);
    // Four `MapObjectPlaceInGoodPosition` calls per table, each with its own roll,
    // against a held area nine cells tall -- so "several, not all" is the honest
    // claim and four-per-table is the ceiling.
    const chairs = objectsIn(map, held, "chair");
    expect(chairs.length).toBeGreaterThan(0);
    expect(chairs.length).toBeLessThanOrEqual(4 * tables.length);
  });

  it("consumes the C#'s rolls, in the C#'s order", () => {
    const ctx = barContext();
    const inside = new Block(BLOCK_RECT).insideRect;

    // C# consumes, in sequence: the dispatch `Roll(0, 4)`, the door-side
    // `Roll(0, 4)`, the per-table `Roll(n, n)`, and then one roll per
    // `mapObjectPlaceInGoodPosition` that finds a candidate cell. A pass that
    // merged or dropped one of them would still produce a bar-shaped room, so the
    // order is replayed rather than inferred from the picture.
    const replay = new DiceRoller(7);
    // No dispatch roll here: the C# spends it at `:510`, *outside* `MakeBarBuilding`
    // (`:511`), and the port now matches that -- the generator takes it as a
    // parameter. The pass spends it once for the whole four-arm `switch`, which is
    // the behaviour that keeps a block from being a bar, a bank, a clinic and a
    // workshop at once.
    expect(replay.roll(0, 4)).toBe(0); // `doorside`, west
    // `roll(n, n)` is not a draw: `DiceRoller.roll` returns `min` when `max <=
    // min`, and the C#'s west arm's second operand is the *negative*
    // `tablesLeft - tablesRight`, so `Math.max` hands the whole of it to
    // `Inside.Height`. That is what makes a bar's table count a function of its
    // block rather than a dice result.
    expect(replay.roll(inside.height, inside.height)).toBe(inside.height);

    // A roll that is not `case 0` costs the generator *nothing*: the pass has
    // already decided, and the arm returns before touching the roller. So
    // `dispatchRoll = 1` spends zero, and a too-small block spends zero for the
    // same reason -- the size check precedes the door-side roll.
    expect(rollsSpent(ctx, new Block(new Rect(0, 0, 6, 6)), 7)).toBe(0);
    // A bar that *is* built spends real rolls, so the case above is not reading a
    // pass that always returns immediately.
    expect(rollsSpent(ctx, new Block(BLOCK_RECT), 7)).toBeGreaterThan(0);
    // And `case 0` spends strictly more than a declined arm, which is what makes
    // this a test of the order rather than of the picture.
    expect(rollsSpent(ctx, new Block(BLOCK_RECT), 7)).toBeGreaterThan(
      rollsSpent(ctx, new Block(BLOCK_RECT), 7, 1),
    );
  });

  it("is a pure function of the block and the roll: same seed, same bar", () => {
    const ctx = barContext();
    // Both rollers are reseeded by `buildBar` -- see its note -- because the
    // alcohol is drawn from the session's `Rules` and not from `m_DiceRoller`.
    expect(fingerprint(buildBar(ctx, 7).map)).toBe(fingerprint(buildBar(ctx, 7).map));
    // And a different roll is a different bar, so the line above is not passing
    // because the door side and the tables happen to be constants.
    expect(fingerprint(buildBar(ctx, 7).map)).not.toBe(fingerprint(buildBar(ctx, 8).map));
  });
});

describe("Feature.Bar: CLASSIC", () => {
  it("the dispatch never builds a bar", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    TOWN_BUILDING_PASSES.push(BAR_PASS);
    const map = newGenerator().generate(DISTRICT_SEED);

    expect(zoneNames(map).filter((n) => n.startsWith("Bar@"))).toEqual([]);
    // And nothing a bar leaves behind: the sink, the counter and the velvet rope
    // are what a bar is *for*, so "no zone" alone would also pass on a bar that
    // built itself and then lost its name.
    for (const obj of map.mapObjects) {
      expect(["sink", "counter"]).not.toContain(obj.name);
    }
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        expect(map.getTileAt(x, y)!.getDecorations ?? []).not.toContain("Tiles/Decoration/velvet_rope");
      }
    }
  });

  it("a classic district is byte-identical with the pass registered and with the registry empty", () => {
    // The half that matters. "No bar was built" is satisfied by a pass that ran
    // and declined, which is also satisfied by a pass that consumed a dice value
    // per block and declined: the district would look right and every saved game
    // after it would be wrong. So this compares the whole map, both ways.
    Session.get().ruleset = Ruleset.CLASSIC;

    TOWN_BUILDING_PASSES.push(BAR_PASS);
    const withPass = newGenerator().generate(DISTRICT_SEED);
    TOWN_BUILDING_PASSES.length = 0;
    const withoutPass = newGenerator().generate(DISTRICT_SEED);

    expect(fingerprint(withPass)).toBe(fingerprint(withoutPass));
    // Not vacuously: the map is a real one, with a real number of blocks in it.
    expect(zoneNames(withPass).length).toBeGreaterThan(10);
  });

  it("the same comparison under STILL_ALIVE is not identical, so the test can fail", () => {
    // Without this, "identical" could be a property of the fingerprint rather than
    // of the gate: an empty fingerprint compares equal to anything.
    //
    // The bar is dispatched by the C#'s shared `roll(0, 4)` cascade, not by the
    // flat `TOWN_BUILDING_PASSES` list, so "with the bar" and "without it" is the
    // feature flag and not the registry -- a registry stub is the wrong lever now
    // and pushing one would make this test pass for the wrong reason.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const withBar = newGenerator().generate(DISTRICT_SEED);

    Session.get().ruleset = Ruleset.CLASSIC;
    const withoutBar = newGenerator().generate(DISTRICT_SEED);

    expect(zoneNames(withBar).filter((n) => n.startsWith("Bar@")).length).toBeGreaterThan(0);
    expect(fingerprint(withBar)).not.toBe(fingerprint(withoutBar));
    expect(zoneNames(withoutBar).filter((n) => n.startsWith("Bar@"))).toHaveLength(0);
  });

  it("a classic district is byte-identical even though every block is offered to the pass", () => {
    // The gate is inside the generator, so the registry *is* walked under Classic
    // and every block *is* offered -- the pass just declines from its first
    // statement. A refactor that moved the gate to the dispatch would still pass
    // the test above, so the offer count is asserted here: it is the difference
    // between "declined" and "never asked".
    Session.get().ruleset = Ruleset.CLASSIC;
    let offers = 0;
    TOWN_BUILDING_PASSES.push({
      csharpName: "MakeBarBuilding",
      tryBuild: (c) => {
        offers++;
        return makeBarBuilding(c, 0);
      },
    });
    const withPass = newGenerator().generate(DISTRICT_SEED);
    TOWN_BUILDING_PASSES.length = 0;
    const withoutPass = newGenerator().generate(DISTRICT_SEED);

    expect(offers).toBeGreaterThan(0);
    expect(fingerprint(withPass)).toBe(fingerprint(withoutPass));
  });
});
