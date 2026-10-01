import { beforeAll, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { Lighting, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Ruleset, Session } from "@engine/Session";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameMusics } from "@gameplay/GameSounds";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Parameters } from "@gameplay/generators/BaseTownGenerator";

/**
 * `Feature.ShoppingMall` — the last unwired feature, and the only generator in the C#
 * that replaces a district's block layout rather than filling a block.
 *
 * The file drives the **real** `BaseTownGenerator.generate()` with
 * `Parameters.generateShoppingMall` on, rather than calling `makeShoppingMall` on a
 * hand-made plot, because three of the four things worth asserting here do not exist
 * below `generate()`: the mall's position comes from `MakeMallBlocks`, its six stairs
 * come from the linking in `MakeShoppingMall`, and the `map.Width > 50` road test needs
 * a map whose width *is* the district size.
 *
 * What is asserted, and why each of these rather than something tidier:
 *
 * 1. **A `Shopping Mall` zone, in a district that is a `District`, with two extra
 *    maps.** The two extra maps are the upper level and the car park, and they are the
 *    only evidence that `District.addUniqueMap` ran — the C#'s
 *    `m_Params.District.AddUniqueMap` at `:9916-9918`. The **ground floor is the
 *    district's own entry map** and is deliberately *not* re-added: the C# registers it
 *    a second time as `UniqueMaps.ShoppingMall_GroundFloor`, and `UniqueMaps` is an
 *    inline graph class whose slot table is hand-written (`specs.ts:962`), so a third
 *    alias for a map the graph already carries is a change nobody in this branch owns.
 * 2. **Six exits, all AI exits, on the exact six ground-floor tiles the C# names.**
 *    Twelve `AddExit` calls, six pairs, four up to the `+1` level and two down to the
 *    `-1`, and every one `isAnAIExit: true`. The count matters twice over: the C#'s
 *    stair positions are *offset from `mallBlock.InsideRect`*, which is two tiles
 *    inside the building rect the ground floor works from, so an off-by-two reads as
 *    "five exits and a mystery decoration".
 * 3. **Twelve shops, laid out with the C#'s overlaps.** The four rows are at
 *    `t+0`, `t+10`, `t+25` and `t+35`, each eleven tall, so rows 1/2 and rows 3/4
 *    *share a row*. That is the reference's layout and not a slip, and it is pinned
 *    here twice: once by the per-shop floor models, and once by asserting which shop
 *    wins the shared row (the later one, because `TileFill` over `TileRectangle`).
 * 4. **The dealership has no shelves**, because the C#'s shops dictionary at `:10108`
 *    has eleven entries for twelve rectangles and `shopBlock7` is not one of them. The
 *    only objects inside it are the eight display cars and the seating that `:10147-10169`
 *    places by hand.
 * 5. **Determinism**, from the real generator rather than from a single method, so the
 *    whole chain — the split, the narrow parks, the displays, the dealership — is
 *    pinned rather than just the part that is easy to get right.
 */

const SEED = 1;

/**
 * `DEFAULT_DISTRICT_SIZE`. Also the *smallest* district the mall exists in, so the
 * three quads `MakeMallBlocks` does not take are all degenerate here (`0x50`, `50x0`
 * and `0x0`) and all three go to `MakeNarrowPark` rather than back to `MakeBlocks`.
 * That is deliberate: it is the case a player gets by never touching the option.
 */
const DISTRICT_SIZE = 50;

/** `MallQuadSplit` gives the mall the north-west 50x50, then the ring takes one off each side. */
const MALL_RECT = new Rect(1, 1, 48, 48);
/** `Block` insets twice, so this is the `:390` comment's "46x46 block". */
const MALL_BUILDING_RECT = new Rect(2, 2, 46, 46);
/** And `GenerateShoppingMallGroundFloor`'s own `l`/`t` are the building rect's edges. */
const L = MALL_BUILDING_RECT.left;
const T = MALL_BUILDING_RECT.top;

const rules = new Rules(new DiceRoller(20250929));
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

function newDistrict(): District {
  // `DistrictKind.SHOPPING` is the kind whose `GenerateDistrictEntryMap` arm is "more
  // shops, less other types" (`RogueGame.cs:4967-4973`), and it is the kind the fork's
  // own world generator is free to roll (`GenerateDistrictKind` is a plain
  // `m_Rules.Roll`, and `(0,0)` is hardcoded BUSINESS). Nothing forces the mall into a
  // shopping district and this test does not claim it does -- the kind is asserted
  // because it is the input the C# branches on for `ShopBuildingChance`, and a reader
  // who wonders whether the mall is gated on it deserves an answer.
  return new District(new Point(0, 0), DistrictKind.SHOPPING);
}

function newParams(size = DISTRICT_SIZE): Parameters {
  const params = new Parameters();
  params.district = newDistrict();
  params.mapWidth = size;
  params.mapHeight = size;
  params.generateShoppingMall = true;
  return params;
}

/** Generate a mall district and return the map plus the district it belongs to. */
function generateMallDistrict(seed = SEED, size = DISTRICT_SIZE): { map: GameMap; district: District } {
  const district = newDistrict();
  const params = newParams(size);
  params.district = district;
  const map = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params).generate(seed);
  // What `GenerateDistrictEntryMap` does at `:5008-5014`: install the surface map as
  // the district's entry *after* generation, so the district ends up with three maps.
  district.entryMap = map;
  return { map, district };
}

/** Two hashes over tiles, objects, decorations, `isInside` and ground stacks. */
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

/** Every tile of the map, as `[x, y]`, for the "exactly six" assertions. */
function everyTile(map: GameMap): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x < map.width; x++) for (let y = 0; y < map.height; y++) out.push([x, y]);
  return out;
}

function modelAt(map: GameMap, x: number, y: number) {
  return map.getTileAt(x, y)!.model;
}

/**
 * The twelve shop rectangles, as `[dx, dy, width, height, floorTileId]` relative to the
 * ground floor's own `l`/`t`. Transcribed from C# `:9984-10042` -- four rows of three,
 * columns 13/13/14, row offsets 0/10/25/35 and height 11 each.
 *
 * The **column widths are not uniform**: 13, 13, 14. A "tidy grid" port would make
 * them 14 and the mall would be two tiles narrower on the east, which moves every shop
 * in the right-hand column and the east entrance run.
 */
const SHOPS: readonly (readonly [number, number, number, number, TileID])[] = [
  [0, 0, 13, 11, TileID.FLOOR_PLANKS], // 1 barber
  [16, 0, 13, 11, TileID.FLOOR_BLUE_CARPET], // 2 books
  [32, 0, 14, 11, TileID.FLOOR_BLUE_CARPET], // 3 clothing
  [0, 10, 13, 11, TileID.FLOOR_WHITE_TILE], // 4 clothing
  [16, 10, 13, 11, TileID.FLOOR_TILES], // 5 clothing (the C#'s comment)
  [32, 10, 14, 11, TileID.FLOOR_WHITE_TILE], // 6 sporting goods
  [0, 25, 13, 11, TileID.FLOOR_BLUE_CARPET], // 7 car dealership - the `//electronics` comment is stale
  [16, 25, 13, 11, TileID.FLOOR_PLANKS], // 8 mobiles
  [32, 25, 14, 11, TileID.FLOOR_RED_CARPET], // 9 books
  [0, 35, 13, 11, TileID.FLOOR_OFFICE], // 10 pharmacy
  [16, 35, 13, 11, TileID.FLOOR_TILES], // 11 liquor
  [32, 35, 14, 11, TileID.FLOOR_PLANKS], // 12 clothing
];

/**
 * The 70 shopfronts, C# `:10046-10057`, as `[dx, dy]` relative to the ground floor's
 * own `l`/`t`.
 *
 * It is a `KeyValuePairWithDuplicates` in the C# — a **list**, not a dictionary — and
 * the duplicates are load-bearing: `{12, 3}` and `{12, 4}` are the same `x` at
 * different `y`, which a `Dictionary<int, int>` would have thrown on. Every pair sets
 * `FLOOR_WHITE_TILE`, so a shopfront is a hole in the `WALL_MALL` perimeter, and the
 * six comment lines in the C# are the per-store grouping and say nothing about the
 * order.
 */
const ENTRY_POINTS: readonly (readonly [number, number])[] = [
  // stores 1-3, north/south
  [12, 3], [12, 4], [12, 5], [16, 3], [16, 4], [16, 5], [28, 3], [28, 4], [28, 5], [32, 3], [32, 4], [32, 5],
  // stores 4-6, north/south
  [12, 17], [12, 18], [12, 19], [12, 20], [16, 13], [16, 14], [16, 15], [28, 13], [28, 14], [28, 15], [32, 17], [32, 18], [32, 19], [32, 20],
  // stores 4-6, east/west
  [9, 20], [10, 20], [11, 20], [21, 20], [22, 20], [23, 20], [33, 20], [34, 20], [35, 20],
  // stores 7-9, east/west
  [9, 25], [10, 25], [11, 25], [12, 25], [21, 25], [22, 25], [23, 25], [32, 25], [33, 25], [34, 25], [35, 25],
  // stores 7-9, north/south
  [12, 26], [12, 27], [12, 28], [16, 28], [16, 29], [16, 30], [28, 28], [28, 29], [28, 30], [32, 26], [32, 27], [32, 28],
  // stores 10-12, north/south
  [12, 38], [12, 39], [12, 40], [16, 38], [16, 39], [16, 40], [28, 38], [28, 39], [28, 40], [32, 38], [32, 39], [32, 40],
];

describe("Feature.ShoppingMall — the mall district", () => {
  it("puts a 48x48 mall block in the north-west corner and builds on it", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { map, district } = generateMallDistrict();

    // The district exists and is the kind it was made with. The C# does not gate the
    // mall on `DistrictKind`, so this is an assertion about the *input*, not a claim.
    expect(district.kind).toBe(DistrictKind.SHOPPING);
    expect(district.worldPosition).toEqual(new Point(0, 0));

    // One entry map and the two linked levels: `District.addUniqueMap` ran for the
    // upper level and the car park. The ground floor is `entryMap` itself.
    expect(district.countMaps).toBe(3);

    // The mall's zone, over the building rect, which is `Block`-derived and not the
    // 48x48 block: `MakeUniqueZone("Shopping Mall", block.BuildingRect)` at `:10174`.
    const mallZones = map.zones.filter((z) => z.name.startsWith("Shopping Mall@"));
    expect(mallZones).toHaveLength(1);
    expect(mallZones[0]!.bounds).toEqual(MALL_BUILDING_RECT);

    // The block itself: `MakeMallBlocks` is a *fixed* 50x50 split of the city rect,
    // less a one-tile road ring, so the mall is always the north-west 48x48. Its
    // **perimeter is `FLOOR_WALKWAY`** (`TileRectangle(FLOOR_WALKWAY, block.Rectangle)`
    // at `:9931`) and the *building* rect's perimeter is `WALL_MALL` — the corners at
    // `MALL_RECT` are walkway, not wall, and a port that confused the two would put a
    // shop's wall on the block's corner.
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY);
    const roadEW = Models.tiles.get(TileID.ROAD_ASPHALT_EW);
    const wallMall = Models.tiles.get(TileID.WALL_MALL);
    expect(modelAt(map, MALL_RECT.left, MALL_RECT.top), "block corner is walkway").toBe(walkway);
    expect(modelAt(map, MALL_RECT.right - 1, MALL_RECT.bottom - 1), "block corner is walkway").toBe(walkway);
    expect(modelAt(map, MALL_BUILDING_RECT.left, MALL_BUILDING_RECT.top), "mall wall").toBe(wallMall);
    expect(modelAt(map, MALL_BUILDING_RECT.right - 1, MALL_BUILDING_RECT.bottom - 1), "mall wall").toBe(wallMall);
    // The ring road is *outside* the block, and at 50 wide the `map.Width > 50` inner
    // roads are not drawn -- so the only asphalt is the four outer sides.
    expect(modelAt(map, MALL_RECT.right - 1, MALL_RECT.top - 1), "north ring road").toBe(roadEW);
    expect(modelAt(map, MALL_RECT.left, MALL_RECT.bottom), "south ring road").toBe(roadEW);
    expect(modelAt(map, MALL_RECT.left, MALL_RECT.bottom), "south ring road").toBe(roadEW);
    // Sampled *away* from the corners, because at `(0, 0)` the north road was drawn
    // first and `MakeRoad`'s "don't overwrite roads" decorator left it east-west -- so
    // the west road starts at `(0, 1)`, and that is the decorator being load-bearing
    // rather than incidental.
    expect(modelAt(map, 0, 25), "west ring road").toBe(Models.tiles.get(TileID.ROAD_ASPHALT_NS));
    expect(modelAt(map, 49, 25), "east ring road").toBe(Models.tiles.get(TileID.ROAD_ASPHALT_NS));
    // ... and at 55 the two *inner* roads exist, one tile inside the mall. That
    // `map.Width > 50` comparison is load-bearing at both ends, so it is asserted at
    // both ends rather than only at the default.
    const wider = generateMallDistrict(SEED, 55);
    expect(modelAt(wider.map, 49, 25), "the inner east road, 55 wide").toBe(
      Models.tiles.get(TileID.ROAD_ASPHALT_NS),
    );
    expect(modelAt(wider.map, 25, 49), "the inner south road, 55 wide").toBe(roadEW);

    // The ground floor is indoors and it is *lit outside* -- the C#'s
    // `Lighting = Lighting.OUTSIDE` is commented out at `:10173`, so the district's
    // own OUTSIDE survives, and only `IsInside` marks the interior. That combination
    // is what lets the mall read as a building from the street.
    expect(map.getTileAt(L + 1, T + 1)!.isInside).toBe(true);
    expect(map.lighting).toBe(Lighting.OUTSIDE);
    // **The mall's own music assignment is dead, and that is the C#'s doing.**
    // `MakeShoppingMall:9881` sets `map.BgMusic = upperlevel.BgMusic = parking.BgMusic
    // = GameMusics.SHOPPING_MALL`, and then `Generate` overwrites the surface map with
    // `GameMusics.SURFACE` at `:537` -- which is the last statement of the method, after
    // the mall has run. So a mall district plays the surface tune and the two levels
    // play the mall's, which is exactly backwards from what the C# appears to ask for
    // and is what the port does. Asserted rather than "fixed".
    expect(map.bgMusic).toBe(GameMusics.SURFACE);
    expect(
      district.maps.filter((m) => m.name !== "Base City").map((m) => m.bgMusic),
      "the two levels do get the mall's tune"
    ).toEqual([GameMusics.SHOPPING_MALL, GameMusics.SHOPPING_MALL]);
  });

  it("does not exist under Classic, and Classic's block layout is the ordinary one", () => {
    // Two locks, and this asserts both halves of the pair: the generator's own gate
    // (`makeShoppingMall`'s first statement) and `Parameters.generateShoppingMall`,
    // which `RogueGame.ts` never sets. The second half is what actually keeps every
    // Classic world byte-identical today -- the flag is `false` for every district --
    // and the first is what would still hold if somebody wired the flag in.
    Session.get().ruleset = Ruleset.CLASSIC;
    const params = new Parameters();
    params.district = newDistrict();
    params.mapWidth = params.mapHeight = DISTRICT_SIZE;
    const map = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params).generate(SEED);

    expect(map.zones.some((z) => z.name.startsWith("Shopping Mall@"))).toBe(false);

    // With the flag on but the feature off, the block list is *still* the mall's --
    // because `MakeMallBlocks` runs before `makeShoppingMall` gets a chance to decline.
    // That asymmetry is real and is why the gate has to be on both: see the two-line
    // note at `Parameters.generateShoppingMall`.
    params.generateShoppingMall = true;
    const gated = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params).generate(SEED);
    expect(gated.zones.some((z) => z.name.startsWith("Park@"))).toBe(true);
    expect(gated.zones.some((z) => z.name.startsWith("Shopping Mall@"))).toBe(false);
  });

  it("has six AI exits, on the C#'s six ground-floor stair tiles", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { map, district } = generateMallDistrict();

    // `MakeShoppingMall` offsets from `mallBlock.InsideRect`, which is `Block`'s
    // third inset -- two tiles inside the building rect the ground floor works from.
    const l = MALL_RECT.left + 2;
    const t = MALL_RECT.top + 2;
    const toUpper: [number, number][] = [
      [l + 13, t + 21], [l + 13, t + 22], [l + 29, t + 21], [l + 29, t + 22],
    ];
    const toParking: [number, number][] = [[l + 21, t + 21], [l + 21, t + 22]];

    const expected = [...toUpper, ...toParking];
    expect(expected).toHaveLength(6);

    // Exactly six on the whole map, not six-and-something-else.
    const onMap = everyTile(map)
      .filter(([x, y]) => map.getExitAt(new Point(x, y)) !== null)
      .map(([x, y]) => [x, y] as [number, number]);
    expect(onMap).toHaveLength(6);

    // By name, not by index: `District.entryMap` is assigned *after* generation, so the
    // two levels are at indexes 0 and 1 and the surface map lands last.
    const upper = district.maps.find((m) => m.name === "Shopping Mall - Upper Level")!;
    const parking = district.maps.find((m) => m.name === "Shopping Mall - Parking")!;
    expect(upper.name).toBe("Shopping Mall - Upper Level");
    expect(parking.name).toBe("Shopping Mall - Parking");
    expect(upper.width).toBe(51);
    expect(parking.width).toBe(51);

    for (const [i, [x, y]] of expected.entries()) {
      const exit = map.getExitAt(new Point(x, y))!;
      expect(exit, `no exit at ${x},${y}`).not.toBeNull();
      // Every one of the C#'s twelve `AddExit` calls passes `true`.
      expect(exit.isAnAIExit, `exit ${i} at ${x},${y} is an AI exit`).toBe(true);
      // Four up to the `+1` level and two down to the `-1`, and the stair decoration is
      // on the *ground* tile going up and the other one coming down -- both of which the
      // C# spells out per pair rather than per side.
      const isUp = i < 4;
      const target = isUp ? upper : parking;
      expect(exit.toMap, `exit ${i} target`).toBe(target);
      const tile = map.getTileAt(x, y)!;
      expect(tile.getDecorations).toContain(isUp ? GameImages.DECO_STAIRS_UP : GameImages.DECO_STAIRS_DOWN);
    }

    // And the far ends land on the C#'s coordinates on a 51x51 level: `(18, 25)`,
    // `(18, 26)`, `(34, 25)`, `(34, 26)` upstairs and `(1, 25)`, `(1, 26)` down. The
    // upper level's *fit-out* is not ported, so these assert shell-and-stairs rather
    // than a food court.
    for (const pt of [[18, 25], [18, 26], [34, 25], [34, 26]] as [number, number][]) {
      expect(upper.getExitAt(new Point(pt[0], pt[1])), `upper ${pt}`).not.toBeNull();
    }
    for (const pt of [[1, 25], [1, 26]] as [number, number][]) {
      expect(parking.getExitAt(new Point(pt[0], pt[1])), `parking ${pt}`).not.toBeNull();
    }
  });

  it("places its twelve shops, with the C#'s one-row overlaps", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { map } = generateMallDistrict();
    const wallMall = Models.tiles.get(TileID.WALL_MALL);

    expect(SHOPS).toHaveLength(12);
    const whiteTile = Models.tiles.get(TileID.FLOOR_WHITE_TILE);
    for (const [dx, dy, w, h, floor] of SHOPS) {
      // `TileRectangle(WALL_MALL, shopRect)` then `TileFill(floor, shop.BuildingRect)`.
      // One tile in is the floor, because `Block` insets the building rect by one on
      // every side. The *perimeter* is asserted wholesale just below rather than at a
      // corner: shop 9's north-west corner is `(32, 25)`, which is itself an entry point,
      // so a corner probe would be asserting white tile and look like a bug.
      const label = `shop at ${L + dx},${T + dy}`;
      expect(modelAt(map, L + dx + 1, T + dy + 1), `${label}: floor`).toBe(Models.tiles.get(floor));
      expect(modelAt(map, L + dx + 2, T + dy + 2), `${label}: inner floor`).toBe(Models.tiles.get(floor));
      expect(map.getTileAt(L + dx + 1, T + dy + 1)!.isInside, `${label}: indoors`).toBe(true);

      // **The perimeter, wholesale.** Every perimeter tile is `WALL_MALL` *except* the
      // ones in `ENTRY_POINTS` -- the 70 white-tile shopfronts at
      // `:10046-10057`. Stating it as a set difference rather than spot-checking six
      // coordinates is what pins the whole list: a port that dropped an entry point, or
      // moved one, or forgot that the list is `KeyValuePairWithDuplicates` and not a
      // dictionary, all fail here.
      const onPerimeter = (x: number, y: number): boolean =>
        x === L + dx || x === L + dx + w - 1 || y === T + dy || y === T + dy + h - 1;
      const wantDoors = new Set(
        ENTRY_POINTS.filter(
          ([ex, ey]) => ex >= dx && ex < dx + w && ey >= dy && ey < dy + h
        ).map(([ex, ey]) => `${L + ex},${T + ey}`)
      );
      const gotDoors = new Set<string>();
      for (let x = L + dx; x < L + dx + w; x++) {
        for (let y = T + dy; y < T + dy + h; y++) {
          if (!onPerimeter(x, y)) continue;
          if (modelAt(map, x, y) === whiteTile) gotDoors.add(`${x},${y}`);
          else expect(modelAt(map, x, y), `${label}: perimeter ${x},${y}`).toBe(wallMall);
        }
      }
      expect(gotDoors, `${label}: its own shopfronts`).toEqual(wantDoors);
    }
    expect(ENTRY_POINTS).toHaveLength(70);

    // **The overlap, pinned in both directions.** Rows 1/2 share `t+10` and rows 3/4
    // share `t+35`, because both rows are eleven tall and start ten apart. Where they
    // overlap the **later** row's *wall* lands on the earlier row's last row — it is
    // `TileRectangle`, not `TileFill`, because each shop's building rect is one tile
    // inside its own rect — so both shared rows come out `WALL_MALL` and neither is
    // floor. Transcribed, not tidied into a grid.
    expect(modelAt(map, L + 1, T + 10), "rows 1/2 overlap: shop 4's wall wins").toBe(wallMall);
    expect(modelAt(map, L + 1, T + 35), "rows 3/4 overlap: shop 10's wall wins").toBe(wallMall);
    // And the last row each of those shops actually *owns* still carries its own floor,
    // which is what says the overlap is one row and not a mis-ordered whole column.
    expect(modelAt(map, L + 1, T + 9), "shop 1's last own floor row").toBe(
      Models.tiles.get(TileID.FLOOR_PLANKS),
    );
    expect(modelAt(map, L + 1, T + 34), "shop 7's last own floor row").toBe(
      Models.tiles.get(TileID.FLOOR_BLUE_CARPET),
    );
    expect(modelAt(map, L + 1, T + 36), "shop 10's first own floor row").toBe(
      Models.tiles.get(TileID.FLOOR_OFFICE),
    );
    // The gap between the second and third rows is the east-west corridor: four rows
    // deep (`t+21 .. t+24`), which is where six of the stairways land and where the
    // C#'s `{9,20} .. {35,25}` entry-point runs sit.
    for (const y of [21, 22, 23, 24]) {
      expect(modelAt(map, L + 22, T + y), `corridor row t+${y}`).toBe(
        Models.tiles.get(TileID.FLOOR_WHITE_TILE),
      );
    }

    // The three shop columns are 13/13/14 wide and start at `l`, `l+16` and `l+32`, so
    // there are three walkway tiles between each pair -- and they are what the mall's
    // north-south entrances open onto. The perimeter loop above has already asserted
    // the walls; this is the gap.
    for (const x of [13, 14, 15, 29, 30, 31]) {
      expect(modelAt(map, L + x, T + 15), `gap column l+${x}`).toBe(
        Models.tiles.get(TileID.FLOOR_WHITE_TILE),
      );
    }

    // Twenty glass doors around the outside: four per side at the C#'s coordinates.
    // `PlaceDoor` puts the floor down first and then the object, and `mapObjectPlace`
    // declines an occupied tile, so a door that did not land would show up as a wall.
    let doors = 0;
    for (let x = L; x < MALL_BUILDING_RECT.right; x++) {
      for (let y = T; y < MALL_BUILDING_RECT.bottom; y++) {
        if (map.getTileAt(x, y)!.model === whiteTile && map.getMapObjectAt(x, y)) doors++;
      }
    }
    expect(doors).toBeGreaterThanOrEqual(20);

    // **Eleven registers, ten checkouts.** The C# places a checkout at eleven points
    // (`:9975-9976`) and then *removes* any that landed inside the barber's, by name
    // (`:10142-10143`, "remove the checkout as it looks out of place here"). The one at
    // `(l+1, t+9)` is inside shop 1, so the floor ends with ten. Asserting the count
    // rather than eleven is what says the removal is deliberate.
    const checkouts: string[] = [];
    for (let x = L; x < MALL_BUILDING_RECT.right; x++) {
      for (let y = T; y < MALL_BUILDING_RECT.bottom; y++) {
        if (map.getMapObjectAt(x, y)?.name === "checkout") checkouts.push(`${x},${y}`);
      }
    }
    expect(checkouts).toHaveLength(10);
    expect(checkouts).not.toContain(`${L + 1},${T + 9}`);
    expect(checkouts).toContain(`${L + 17},${T + 9}`);
  });

  it("fills eleven of the twelve shops with displays, and the dealership by hand", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const { map } = generateMallDistrict();

    // **What `MakeMallShopDisplays` can place, by sprite.** Twelve ids, and this is
    // the honest way to say "a display": keyed on the sprite rather than on the
    // factory's `_name`, because the mobiles and electronics arms place a *table* and
    // the dealership has tables of its own, and a name-based set cannot tell those
    // apart. `OBJ_SHOP_SHELF`, `OBJ_BOOK_SHELVES`, `OBJ_FRIDGE` and `OBJ_COUCH` were
    // already declared on `GameImages` for the shop and the bar; the other eight are
    // this feature's.
    const DISPLAY_SPRITES = new Set([
      GameImages.OBJ_WIGS_DISPLAY1,
      GameImages.OBJ_WIGS_DISPLAY2,
      GameImages.OBJ_WIGS_DISPLAY3,
      GameImages.OBJ_SHOP_SHELF,
      GameImages.OBJ_BOOK_SHELVES,
      GameImages.OBJ_CLOTHES_WALL1,
      GameImages.OBJ_CLOTHES_WALL2,
      GameImages.OBJ_SHOES_WALL,
      GameImages.OBJ_FRIDGE,
      GameImages.OBJ_TELEVISION,
      GameImages.OBJ_LAPTOPS_TABLE,
      GameImages.OBJ_MOBILES_TABLE,
    ]);
    /** The C#'s `ALLEYS` window: `b.BuildingRect`, one tile inside the shop's own walls. */
    const inShop = (index: number): string[] => {
      const [dx, dy, w, h] = SHOPS[index];
      const out: string[] = [];
      for (let x = L + dx + 1; x < L + dx + w - 1; x++) {
        for (let y = T + dy + 1; y < T + dy + h - 1; y++) {
          const obj = map.getMapObjectAt(x, y);
          if (obj && DISPLAY_SPRITES.has(obj.imageId)) out.push(obj.name);
        }
      }
      return out;
    };
    /** Every object name in a shop's `BuildingRect`, displays or not. */
    const namesIn = (index: number): string[] => {
      const [dx, dy, w, h] = SHOPS[index];
      const out: string[] = [];
      for (let x = L + dx + 1; x < L + dx + w - 1; x++) {
        for (let y = T + dy + 1; y < T + dy + h - 1; y++) {
          const obj = map.getMapObjectAt(x, y);
          if (obj) out.push(obj.name);
        }
      }
      return out;
    };

    // Shop 1 is the barber and what it keeps is wigs displays *by name* -- which is not
    // cosmetic: the barber's outer-row rewrite at `:10126` finds its shelves by
    // comparing `TheName == "the wigs display"`, so this asserts the string as much as
    // the count. Its two outer display rows became barber chairs and basins.
    const barber = inShop(0);
    expect(barber.length).toBeGreaterThan(0);
    expect(new Set(barber)).toEqual(new Set(["wigs display"]));
    expect(new Set(namesIn(0))).toEqual(new Set(["wigs display", "chair", "basin"]));

    // **Shop 7 gets no displays at all.** The C#'s shops dictionary (`:10108-10110`)
    // has eleven entries for twelve `Block`s and `shopBlock7` is not one of them; it is
    // the car dealership, and `:10147-10169` fills it by hand.
    expect(inShop(6)).toEqual([]);
    expect(new Set(namesIn(6))).toEqual(new Set(["display car", "couch", "table", "chair"]));
    // ... and the cars are eight, drawn out of the same four-sprite `CARS` table the
    // wrecked cars use, and all of them unbreakable scenery.
    let cars = 0;
    for (let x = L; x < L + 13; x++) {
      for (let y = T + 25; y < T + 36; y++) {
        if (map.getMapObjectAt(x, y)?.name === "display car") cars++;
      }
    }
    expect(cars).toBe(8);

    // Every other shop has at least one, so "seven gets none" is a fact about shop 7
    // rather than about the whole floor.
    const withDisplays = SHOPS.map((_, i) => i).filter((i) => inShop(i).length > 0);
    expect(withDisplays).not.toContain(6);
    expect(withDisplays.length).toBe(11);
  });

  it("builds the same district twice from one seed, and different ones from different seeds", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const twice = [fingerprint(generateMallDistrict().map), fingerprint(generateMallDistrict().map)];
    expect(twice[0]).toBe(twice[1]);

    // And the seed is really consulted -- the dealership's eight display cars and the
    // shop displays' `roll(0, 3)` / `roll(0, 6)` are the cheapest place to see it.
    const prints = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => fingerprint(generateMallDistrict(s).map)));
    expect(prints.size, "the district roller is really being consulted").toBeGreaterThan(1);
  });

  it("keeps the district-size floor at 30 for Classic and 50 for Still Alive", () => {
    // The C# raised this floor globally in Release 7-3 (`GameOptions.cs:476`,
    // `//@@MP - was 30`) and could: it has one ruleset. This port has two, and
    // `districtSize` is read by world generation, so a global 50 would move the
    // pinned Classic fingerprint `e097b9d976ffac15` -- which is asserted by seven
    // test files and eleven sites, and which `tests/bank-building.test.ts:606` shows
    // the value of. The floor is therefore ruleset-dependent, and this is the whole of
    // the fork's half of it.
    const options = Options.clone();
    try {
      Session.get().ruleset = Ruleset.CLASSIC;
      options.districtSize = 10;
      expect(options.districtSize, "Classic keeps the vanilla floor").toBe(30);

      Session.get().ruleset = Ruleset.STILL_ALIVE;
      options.districtSize = 10;
      expect(options.districtSize, "Still Alive cannot go below the mall's 50x50 split").toBe(50);

      // And above the floor both rulesets behave identically -- the fork does not
      // touch the rest of the option's range.
      Session.get().ruleset = Ruleset.CLASSIC;
      options.districtSize = 45;
      expect(options.districtSize).toBe(45);
    } finally {
      Session.get().ruleset = Ruleset.CLASSIC;
      Options.copyFrom(options);
    }
  });
});

import { Options } from "@engine/GameOptions";