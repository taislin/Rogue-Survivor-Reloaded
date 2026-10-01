/**
* `Feature.ShoppingMall` — C# `BaseTownGenerator.cs`, Release 7-3, seven methods:
 * `MallQuadSplit` (`:1224-1248`), `MakeMallBlocks` (`:1250-1305`),
 * `MakeShoppingMall` (`:9861-9926`), `GenerateShoppingMallGroundFloor`
 * (`:9928-10176`), `GenerateShoppingMall_UpperLevel` (`:10178-10488`),
 * `GenerateShoppingMall_Parking` (`:10490-10612`) and `MakeMallShopDisplays`
 * (`:10614-10706`).
 *
 * The mall is the only generator in the C# that **replaces the block layout** rather
 * than filling a block somebody else cut, so it is the only one that is not a
 * `Make…(map, b)` per-block method and the only one that is not a
 * `TOWN_BUILDING_PASSES` entry. It has two call sites in `Generate`:
 *
 * ```csharp
 * if (m_Params.GenerateShoppingMall) //@@MP - mall must have a 46x46 block (Release 7-3)
 *     MakeMallBlocks(map, ref blocks, cityRectangle);
 * else
 *     MakeBlocks(map, true, ref blocks, cityRectangle);
 * ```
 *
 * (`:390-393`, in the block-cutting stage) and, ahead of the police station in the
 * "single-block Unique buildings" region:
 *
 * ```csharp
 * if (m_Params.GenerateShoppingMall)
 * {
 *     Block mallBlock;
 *     MakeShoppingMall(map, blocks, out mallBlock);
 *     emptyBlocks.Remove(mallBlock);
 * }
 * ```
 *
 * (`:409-414`). Both are mirrored in `BaseTownGenerator.generate()`; the flag itself
 * is `Parameters.generateShoppingMall`.
 *
 * ## The one piece of wiring this branch does not own
 *
 * The C# picks the mall's district in `RogueGame`, not in the generator: a third
 * `m_Rules.Roll(0, noSpecialDistricts.Count)` at `RogueGame.cs:4239`, drawn *after*
 * the police station (`:4233`) and the hospital (`:4236`) have each taken one out of
 * the pool — "Only ONE special building max per district" (`:4226`) — and then
 * `genParams.GenerateShoppingMall = (district.WorldPosition == mallDistrictPos)` at
 * `:5006`. In this port all three of those are in `RogueGame.ts`, which this branch
 * was told not to touch, so the flag has no writer yet and the exact patch is the
 * request the plan records (same shape as `ShelterBackpacks`):
 *
 * ```ts
 * // 1. RogueGame.ts, beside noSpecialDistricts.splice(districtIdx, 1) at :30696
 * districtIdx = this.m_Rules.roll(0, noSpecialDistricts.length);
 * const mallDistrictPos = noSpecialDistricts[districtIdx];
 * noSpecialDistricts.splice(districtIdx, 1);
 *
 * // 2. pass it to generateDistrictEntryMap (the :30726 call site) and add the
 * //    parameter to the signature at :31746.
 *
 * // 3. in GenerateDistrictEntryMap, beside the two lines at :31806-31810:
 * genParams.generateShoppingMall = district.worldPosition.equals(mallDistrictPos);
 * ```
 *
 * **Until that lands the mall is unreachable in a real game**, and the flag being
 * `false` everywhere is *load-bearing*: it is what keeps every Classic world
 * byte-identical, because `MakeMallBlocks` spends dice (`MapObjectFill` in
 * `MakeNarrowPark`) and changes the whole block list. The feature gate below is the
 * second lock on the same door.
 *
 * ## The 50x50 split is fixed, and `map.Width > 50` is load-bearing
 *
 * `MallQuadSplit` (`:1224-1248`) does not roll. It hard-codes
 * `leftWidthSplit = topHeightSplit = 50` — "static split point" — so the mall is
 * always the *north-west* 50x50 corner of the district, and the other three quads go
 * back to `MakeBlocks`. That is why the C# raised `DistrictSize`'s floor from 30 to 50
 * in the same release (`GameOptions.cs:476`, `//@@MP - was 30 (Release 7-3)`); see
 * `districtsSizeFloor` in `@engine/GameOptions` for why this port makes that floor
 * ruleset-dependent instead of global.
 *
 * A 50x50 quad loses one ring road to a 48x48 block, which `Block` insets twice into a
 * 46x46 building rect — the `:390` comment's "46x46 block" is the *building* rect, and
 * the block itself is 48x48. Then:
 *
 * ```csharp
 * //Complete the bordering of the mall
 * if (map.Width > 50) //not for 50x50, as that would double-up
 * ```
 *
 * (`:1274-1278`). At exactly 50 the outer ring's east and south roads *are* the
 * mall's inner border, so the two extra roads would be drawn twice on the same tiles.
 * The comparison is on `map.Width` rather than on the quad, and it is load-bearing at
 * every district size: transcribing it as `>` on the split width, or dropping it, gives
 * a double-road row at 50 and a missing one everywhere above.
 *
 * ## Twelve shops, one of them with no shelves, and two one-tile overlaps
 *
 * Four rows of three. The row offsets are `0`, `10`, `25`, `35` with a height of 11,
 * so **rows 1 and 2 share the row at `t+10`, and rows 3 and 4 share the row at
 * `t+35`.** That is not a typo to be tidied into `0/11/22/33`: the four rows together
 * have to cover `t+0 .. t+45`, which is the building rect's 46 tiles, and the
 * shared rows are what make the wall between the top two shops and the second pair
 * land on the shop's own perimeter. `Tiling` shop 4 over shop 1's last row is what
 * puts a wall at `t+10` across the *whole* width, which is why the entry points for
 * shops 1-6 (`:10047-10048`) punch through it. Transcribed as written.
 *
 * The shops dictionary (`:10108-10110`) has **eleven** entries for twelve rectangles:
 * `shopBlock7` is not in it. That is not an omission to repair — shop 7 is the car
 * dealership, and the C# fills it by hand at `:10147-10169` with eight display cars,
 * two tables and six chairs, which is why the `DEALERSHIP` arm of
 * `MakeMallShopDisplays` returns `null` for its display and why no `MapObjectFill`
 * ever reaches it. The `//electronics` comment on `:10015` is stale: the two
 * `DECO_SHOP_DEALERSHIP` signs at `:10085` and `:10092` say what it is.
 *
 * `MakeMallShopDisplays` is then called with the *shop's own* `Block`, so the
 * shelves sit one tile inside the shop's wall on all four sides and the "alleys" are
 * inset on one axis only — the axis `horizontalAlleys` picks from
 * `b.Rectangle.Width >= b.Rectangle.Height`.
 *
* ## Six `AddExit` pairs, and two furnished levels
 *
 * `MakeShoppingMall` links three maps: the district's own surface map (the mall's
 * ground floor), a `+1` food court / cinema / supermarket level and a `-1` car park,
 * both 51x51. Twelve `AddExit` calls form **six pairs** — four to the upper level
 * (`:9887-9902`) and two to the parking (`:9905-9912`) — and every one of the twelve
 * passes `isAnAIExit: true`, so a survivor who knows the mall will use the stairs
 * rather than path around it.
 *
 * Both levels are **ported whole**: the shells (`:10186-10193`, `:10499-10506`) and the
 * fit-outs behind them — the food court, the pool, the supermarket, the two bathrooms
 * and the two cinemas at `:10194-10488`, and the entry rooms, the two power rooms, the
 * parking bays, the pillars, the railings and the abandoned cars at `:10508-10608`.
 * Each method's own header carries the detail; this section only says why they were
 * worth doing.
 *
 * **They cost nothing under Classic, and that is structural rather than lucky.** The
 * two levels are built by `generateShoppingMall`, whose first statement is the
 * `Feature.ShoppingMall` gate, and `generate()` only calls it under
 * `Parameters.generateShoppingMall` — which nothing sets, so the district's `m_DiceRoller`
 * never spends a die on either fit-out. Neither method is a `TOWN_BUILDING_PASSES` entry
 * and neither reads `ctx.block`, so there is no second route in. The upper level's
 * 24-counter row alone costs 72 dice and its supermarket's 160 shelves cost 160 more.
 *
 * **A previous note here claimed the parking level could not be ported at all** because
 * `GameTiles.PARKING_ASPHALT_NS` / `_EW` were "not registered models". That was wrong:
 * they are registered at `GameTiles.ts:402-403` (`= 133` and `= 134`) over
 * `GameImages.TILE_PARKING_ASPHALT_EW` / `_NS`, which were themselves already declared
 * at `:210-211` for world decay — so the *images* being present was never the evidence
 * anybody needed, and the *models* are present too. `WALL_PILLAR_CONCRETE` (`:140`) is
 * at `:409` for the same reason. What the earlier claim got right was the conclusion it
 * drew from the wrong premise, and that conclusion is now simply false.
 *
 * `m_Game.Session.UniqueMaps.ShoppingMall_{GroundFloor,UpperLevel,Parking}` (`:9921-9923`)
 * are **not** ported. `ShoppingMall_GroundFloor` is an *alias* for the
 * district's entry map — the very same `Map` object `district.entryMap` already points
 * at — so registering it would store a second name for a map the graph already carries,
 * and `UniqueMaps` is an inline graph class whose slots are a hand-written table
 * (`specs.ts:962`, `uniqueMapSlots`) that this branch also does not own. The two level
 * maps are reachable through `District.addUniqueMap` (`:9916-9918`), which the port's
 * `District` has and which is what actually makes a map part of the district.
 *
 * ## Rollers
 *
 * `ctx.roller` is the district's, which is what `MakeMallBlocks`, `MakeNarrowPark`,
 * the shop displays, the dealership, both levels and `MakeShopGroceryItem` all spend —
 * the C# spends `m_DiceRoller` there too. Three exceptions, all *deliberate*, all
 * reaching past it: `MakeItemAlcohol` (`:7409-7410`), which rolls `m_Game.Rules`;
 * `MakeRandomMallShopItem`'s `MakeItemBook` / `MakeItemMagazines`; and the upper
 * level's `MakeItemSnackBar`, which is the third of the three `m_Rules` factories
 * (`BaseMapGenerator.cs:1852`). See {@link makeRandomMallShopItem}.
 */

import { Item } from '@data/Item';
import { Map as GameMap, Lighting } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import type { ItemFoodModel } from '@engine/items/ItemFood';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { Barrel, DoorWindow, Car, PowerGenerator } from '@engine/mapobjects/MapObjects';
import { ItemEntertainment, ItemBarricadeMaterial, ItemSprayScent } from '@engine/items/ItemMisc';
import { ItemFood } from '@engine/items/ItemFood';
import { ItemLight } from '@engine/items/ItemLight';
import { ItemMedicine } from '@engine/items/ItemMedicine';
import { ItemTracker } from '@engine/items/ItemTracker';
import { ItemMeleeWeapon } from '@engine/items/ItemWeapon';
import { GameImages } from '@gameplay/GameImages';
import type { TileModel } from '@data/TileModel';
import { ItemID } from '@gameplay/GameItems';
import { GameMusics } from '@gameplay/GameSounds';
import { GameTiles, TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';
import { Block } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/** C# `:10645` / `:10647` — `((pt.Y - alleysRect.Top) % 2 == 1)`. The odd rows. */
const MALL_SHELF_ODD_ROW = 1;
/** C# `:10186` / `:10499` — the upper level and the car park are both 51x51. */
const MALL_LEVEL_SIZE = 51;

/**
 * C# `Direction.cs:86` `COMPASS_NSEW`, Release 7-3, as `:10260` walks it: the four
 * cardinals in the order **N, S, E, W**.
 *
 * **Not `Direction.COMPASS_4`.** The C# has *both* orders side by side and they
 * differ only in the middle pair — `COMPASS_NESW` (`:81`, vanilla, "renamed to more
 * meaningful") is `N, E, S, W`, and `COMPASS_NSEW` (`:86`, Release 7-3, added for
 * this very loop) is `N, S, E, W`. The port's `Direction.COMPASS_4` is the
 * *vanilla* one, so reaching for it here would silently transpose two of the four
 * chairs around every food-court table.
 *
 * It happens not to matter on this layout — the twenty `tablePoints` at `:10251`
 * are four tiles apart on both axes, so no two tables ever claim the same chair
 * tile and no placement is declined whatever the order — and the order is still
 * spelled out, because that is the kind of thing that stops mattering and then
 * gets tidied.
 */
const FOOD_COURT_CHAIR_DIRECTIONS: readonly Direction[] = [
  Direction.N,
  Direction.S,
  Direction.E,
  Direction.W,
];

/** C# `:10213` / `:10226` — `m_DiceRoller.Roll(0, 5)`, once for the board, once for the counter. */
const FOOD_COURT_VARIANTS = 5;
/** C# `:10236` — `m_DiceRoller.Roll(0, 4)` over the four things a counter carries. */
const FOOD_COURT_COUNTER_ITEMS = 4;
/** C# `:10221` — `new Point(pt.X, pt.Y - 2)`: the price board hangs on the wall behind. */
const FOOD_COURT_PRICEBOARD_ROWS_UP = 2;
/** C# `:10466` — `m_DiceRoller.RollChance(20)` for the snack bar on a cinema seat. */
const CINEMA_SEAT_SNACK_CHANCE = 20;
/** C# `:10501` — `m_DiceRoller.RollChance(20)` for the car in a parking bay. */
const PARKING_CAR_CHANCE = 20;

/**
 * C# `BaseMapGenerator.cs` — the five price boards of `:10215-10219`, in the C#'s switch
 * order. The roll is `Roll(0, 5)` on the district's roller, and it is the *first* of the
 * three the food court's twenty-four counter tiles spend each.
 */
const FOOD_COURT_PRICEBOARDS: readonly string[] = [
  GameImages.DECO_FOOD_COURT_PRICEBOARD1,
  GameImages.DECO_FOOD_COURT_PRICEBOARD2,
  GameImages.DECO_FOOD_COURT_PRICEBOARD3,
  GameImages.DECO_FOOD_COURT_PRICEBOARD4,
  GameImages.DECO_FOOD_COURT_PRICEBOARD5,
];

/** C# `:10228-10232` — the five food-court counters, same roll and same order as above. */
const FOOD_COURT_COUNTERS: readonly string[] = [
  GameImages.OBJ_FOOD_COURT_COUNTER1,
  GameImages.OBJ_FOOD_COURT_COUNTER2,
  GameImages.OBJ_FOOD_COURT_COUNTER3,
  GameImages.OBJ_FOOD_COURT_COUNTER4,
  GameImages.OBJ_FOOD_COURT_COUNTER5,
];

// ── The C#'s shop-kind enum ──────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:264` `MallShopType`, Release 7-3. A `protected enum` on the
 * generator with `BARBER` first, so the numeric values are `0..9` and are load-bearing
 * in one place only — the C# never persists one.
 *
 * `GROCERY` and `DEALERSHIP` are unreachable through the ground floor's shops
 * dictionary (shop 7 is the dealership and is not in it at all) and are declared
 * because `MakeMallShopDisplays` switches on the type and the C# keeps its arms
 * exhaustive with a `default: throw`.
 */
export enum MallShopType {
  BARBER,
  BOOKSTORE,
  LIQUOR,
  GROCERY,
  PHARMACY,
  SPORTING_GOODS,
  ELECTRONICS,
  MOBILES,
  DEALERSHIP,
  CLOTHING,
}

// ── `MallQuadSplit` ──────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:1224-1248` `MallQuadSplit`, Release 7-3.
 *
 * **No dice.** The C#'s first two lines are `// static split point.` and then
 * `int leftWidthSplit = 50; int topHeightSplit = 50;`, against a signature that takes
 * `minWidth`/`minHeight` and a body that compares them — a method shaped exactly like
 * `quadSplit` and with every roll taken out of it. The two `if` lines below are the
 * C#'s, and on this path they are dead: `minBlockSize` is `48 + ring = 49` and the
 * split is 50, so `50 < 49` is false either way.
 *
 * That matters for a reason that is not obvious from the signature: because there is no
 * roll here, the *shape* of the rest of the district is a pure function of its size,
 * and the district size is an option a player can change. A 55-wide district therefore
 * has a mall in the same north-west corner as a 100-wide one, and only the three
 * leftover quads differ.
 *
 * `rightWidthSplit` / `bottomHeightSplit` are the C#'s, which means a district smaller
 * than 50 produces **negative** right/bottom splits and the quads run off the map. That
 * is unreachable through the floor in `@engine/GameOptions` (50 everywhere the mall
 * exists) and is transcribed rather than clamped, because a clamp here would be the
 * second place that has to know the floor.
 */
function mallQuadSplit(
  rect: Rect,
  minWidth: number,
  minHeight: number
): { topLeft: Rect; topRight: Rect; bottomLeft: Rect; bottomRight: Rect } {
  // static split point.
  let leftWidthSplit = 50;
  let topHeightSplit = 50;

  // Ensure splitting does not produce rects below minima.
  if (leftWidthSplit < minWidth) leftWidthSplit = minWidth;
  if (topHeightSplit < minHeight) topHeightSplit = minHeight;

  const rightWidthSplit = rect.width - leftWidthSplit;
  const bottomHeightSplit = rect.height - topHeightSplit;

  // Make the quads. The C# also hands back `splitX`/`splitY`; nothing in
  // `MakeMallBlocks` reads them (`Rectangle` has no `Left`/`Top` *mutation* the
  // method needs either -- see the note on the ring below), so they are not carried.
  const splitX = rect.left + leftWidthSplit;
  const splitY = rect.top + topHeightSplit;

  return {
    topLeft: new Rect(rect.left, rect.top, leftWidthSplit, topHeightSplit),
    topRight: new Rect(splitX, rect.top, rightWidthSplit, topHeightSplit),
    bottomLeft: new Rect(rect.left, splitY, leftWidthSplit, bottomHeightSplit),
    bottomRight: new Rect(splitX, splitY, rightWidthSplit, bottomHeightSplit),
  };
}

// ── `MakeMallBlocks` ────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:1250-1305` `MakeMallBlocks`, Release 7-3.
 *
 * Cuts the district's blocks with the mall in the north-west corner instead of
 * `makeBlocks`. Three steps, in the C#'s order: split, ring the roads, recurse the
 * three leftover quads.
 *
 * The road ring is `makeBlocks`'s own four `MakeRoad` calls over the *whole city
 * rectangle* (`:1269-1272`) — the outer edge of the district, not the edge of the mall
 * quad — and then the two inner roads that finish bordering the mall, behind the
 * `map.Width > 50` test. See the module header for why that test is load-bearing.
 *
 * `makeBlocks` is `protected` on `BaseTownGenerator` and not on the seam, so the three
 * recursions are delegated in from the caller rather than reached for. That is the one
 * thing this function cannot do for itself, and it is the reason it takes a callbacks
 * object instead of a `ctx`.
 *
 * The ring adjustment is `topLeft.Offset(ring, ring)` on the C#'s mutable `Rectangle`
 * after `Width -= 2 * ring`. `Rect` is immutable here, so it is one new `Rect`, and
 * `rect.left/rect.top` are 0 for a city rectangle — so the offset and the subtraction
 * could have been folded into the constructor. They are not, because the C# writes
 * them as three statements after the `if (map.Width > 50)` block and folding them would
 * hide that the ring is applied *after* the inner roads are drawn on top of them.
 */
export function makeMallBlocks(
  map: GameMap,
  list: Block[],
  rect: Rect,
  ctx: TownBuildingContext,
  recurse: (map: GameMap, list: Block[], rect: Rect) => void
): void {
  const ring = 1; // dont change, keep to 1 (0=no roads, >1 = out of map)
  const roadEW = Models.tiles.get(TileID.ROAD_ASPHALT_EW)!;
  const roadNS = Models.tiles.get(TileID.ROAD_ASPHALT_NS)!;

  ////////////
  // 1. Split
  ////////////
  // +N to account for the road ring.
  const minBlockSize = 48 + ring;
  const maxBlockSize = 48 + ring;
  const quad = mallQuadSplit(rect, minBlockSize, maxBlockSize);

  ///////////////////
  // 2. Termination?
  ///////////////////
  // Outer ring road. Over the *whole city rectangle*, not the mall quad: these are
  // `makeBlocks`' own four calls at `:1269-1272` and the district edge is where they
  // belong.
  makeMallRoad(ctx, map, roadEW, new Rect(rect.left, rect.top, rect.width, ring)); // north side
  makeMallRoad(ctx, map, roadEW, new Rect(rect.left, rect.bottom - 1, rect.width, ring)); // south side
  makeMallRoad(ctx, map, roadNS, new Rect(rect.left, rect.top, ring, rect.height)); // west side
  makeMallRoad(ctx, map, roadNS, new Rect(rect.right - 1, rect.top, ring, rect.height)); // east side

  //Complete the bordering of the mall
  if (map.width > 50) {
    //not for 50x50, as that would double-up
    //
    // `quad.topLeft` is still the *un-adjusted* 50x50 quad here, which is what the C#
    // asks for: its east road is at `topLeft.Right - 1 == rect.Left + 49` and its
    // south road at `topLeft.Bottom - 1 == rect.Top + 49`, i.e. the *inner* border,
    // one tile inside the outer ring the four calls above already drew. Reading it
    // before the ring adjustment below, in that order, is the whole method.
    makeMallRoad(ctx, map, roadNS, new Rect(quad.topLeft.right - 1, rect.top, ring, quad.topLeft.height)); // east side
    makeMallRoad(ctx, map, roadEW, new Rect(rect.left, quad.topLeft.bottom - 1, quad.topLeft.width, ring)); // south side
  }

  // Adjust rect. `Rect` is immutable in the web port, so the C#'s
  // `Width -= 2 * ring; Height -= 2 * ring; Offset(ring, ring)` is one new `Rect`.
  const topLeft = new Rect(
    quad.topLeft.x + ring,
    quad.topLeft.y + ring,
    quad.topLeft.width - 2 * ring,
    quad.topLeft.height - 2 * ring
  );

  // Add mall block.
  list.push(new Block(topLeft));

  //////////////
  // 3. Recurse in non-mall quads
  //////////////
  if (quad.topRight.width >= 7 && quad.topRight.height >= 7) {
    //nothing too small, otherwise we get deformed buildings
    recurse(map, list, quad.topRight);
  } else {
    makeNarrowPark(map, new Block(quad.topRight), ctx);
  }

  if (quad.bottomLeft.width >= 7 && quad.bottomLeft.height >= 7) recurse(map, list, quad.bottomLeft);
  else makeNarrowPark(map, new Block(quad.bottomLeft), ctx);

  if (quad.bottomRight.width >= 7 && quad.bottomRight.height >= 7) recurse(map, list, quad.bottomRight);
  else makeNarrowPark(map, new Block(quad.bottomRight), ctx);
}

/**
 * `makeRoad`, C# `BaseTownGenerator.cs:1307-1317`.
 *
 * `protected` on the port's generator and not on the seam, and `MakeMallBlocks` is the
 * only thing in this file that needs it. The port's version is a `tileFill` whose
 * decorator refuses to overwrite an existing road, then a `road` zone — which is
 * transcribed here rather than delegated, because the *other* half of it (`isRoadModel`,
 * which reads the `GameTiles` model table) is also not on the seam.
 *
 * The decorator is the load-bearing part: the mall's inner roads are drawn on top of
 * tiles that may already be paved, and `isRoadModel` is what stops a road being paved
 * a second time in a different orientation.
 */
function makeMallRoad(ctx: TownBuildingContext, map: GameMap, roadModel: TileModel, rect: Rect): void {
  const tiles = Models.tiles as GameTiles;
  ctx.tileFill(map, roadModel, rect, (_tile, prevModel, x, y) => {
    // don't overwrite roads!
    if (tiles.isRoadModel(prevModel)) map.setTileModelAt(x, y, prevModel);
  });
  map.addZone(ctx.makeUniqueZone('road', rect));
}

// ── `MakeShoppingMall` ──────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:9861-9926` `MakeShoppingMall`, Release 7-3.
 *
 * Returns the block the mall became, which is what `Generate` splices out of
 * `emptyBlocks` at `:413` — or `null` when the feature is off, which is the answer
 * `Parameters.generateShoppingMall === false` already gives and which is what keeps
 * Classic on `makeBlocks`.
 *
 * `mallBlock = freeBlocks[0]` — the commented-out `Roll` on `:9871` says the mall is
 * *always* the first block, and that is deliberate rather than unfinished: `MakeMallBlocks`
 * pushes the mall first (`:1286`) and `MakeBlocks` recurses top-left first, so the list
 * is already in a stable order and rolling would only have made the mall's position
 * depend on how the rest of the district happened to cut.
 *
 * The ground-floor points are offset from `mallBlock.InsideRect` (`l`, `t`), which is
 * **two tiles inside** the building rect that `GenerateShoppingMallGroundFloor` computes
 * its own `l`, `t` from. They are not the same origin and the difference is two tiles,
 * which is why every stairway in the reference is at `l+13` rather than `l+15`. Kept as
 * written rather than normalised onto one origin.
 *
 * Every one of the twelve `AddExit` calls passes `isAnAIExit: true`, so a survivor who
 * knows the mall walks the stairs rather than pathing around the block. Six pairs: four
 * to the upper level (`:9887-9902`) and two to the parking (`:9905-9912`).
 */
export function makeShoppingMall(map: GameMap, freeBlocks: Block[], ctx: TownBuildingContext): Block | null {
  // Behind `Feature.ShoppingMall` from the first statement: a mall under Classic
  // would spend dice in `MakeNarrowPark` and change the whole block list, which is a
  // different failure from a missing building, not a smaller one.
  if (!hasFeature(Session.get().ruleset, Feature.ShoppingMall)) return null;

  const mallBlock = freeBlocks[0];

  // 1. Generate ground floor.
  generateShoppingMallGroundFloor(map, mallBlock, ctx);

  // 2. Generate other levels maps.
  const upperlevel = generateShoppingMallUpperLevel((map.seed >> 1) ^ map.seed, ctx);
  const parking = generateShoppingMallParking((map.seed << 1) ^ map.seed, ctx);

// alpha10 music
  //
  // **The surface map's half of this is dead in the C# and dead here.** `Generate`'s
  // last statement is `map.BgMusic = GameMusics.SURFACE` (`BaseTownGenerator.ts:537`,
  // after this method has run), so a mall district plays the surface tune while its
  // two levels play the mall's. Transcribed as written; `tests/shopping-mall-building`
  // asserts it so it cannot be "fixed" by accident.
  map.bgMusic = upperlevel.bgMusic = parking.bgMusic = GameMusics.SHOPPING_MALL;

  // 3. Link maps.
  const l = mallBlock.insideRect.left;
  const t = mallBlock.insideRect.top;
  // ground <-> upper level
  const groundStairs1 = new Point(l + 13, t + 21); //ground
  const upperStairs1 = new Point(18, 25); //upper
  ctx.addExit(map, groundStairs1, upperlevel, upperStairs1, GameImages.DECO_STAIRS_UP, true);
  ctx.addExit(upperlevel, upperStairs1, map, groundStairs1, GameImages.DECO_STAIRS_DOWN, true);
  const groundStairs2 = new Point(l + 13, t + 22);
  const upperStairs2 = new Point(18, 26);
  ctx.addExit(map, groundStairs2, upperlevel, upperStairs2, GameImages.DECO_STAIRS_UP, true);
  ctx.addExit(upperlevel, upperStairs2, map, groundStairs2, GameImages.DECO_STAIRS_DOWN, true);
  const groundStairs3 = new Point(l + 29, t + 21); //ground
  const upperStairs3 = new Point(34, 25); //upper
  ctx.addExit(map, groundStairs3, upperlevel, upperStairs3, GameImages.DECO_STAIRS_UP, true);
  ctx.addExit(upperlevel, upperStairs3, map, groundStairs3, GameImages.DECO_STAIRS_DOWN, true);
  const groundStairs4 = new Point(l + 29, t + 22);
  const upperStairs4 = new Point(34, 26);
  ctx.addExit(map, groundStairs4, upperlevel, upperStairs4, GameImages.DECO_STAIRS_UP, true);
  ctx.addExit(upperlevel, upperStairs4, map, groundStairs4, GameImages.DECO_STAIRS_DOWN, true);

  // ground <-> parking
  const groundStairs5 = new Point(l + 21, t + 21);
  const parkingStairs1 = new Point(1, 25);
  ctx.addExit(map, groundStairs5, parking, parkingStairs1, GameImages.DECO_STAIRS_DOWN, true);
  ctx.addExit(parking, parkingStairs1, map, groundStairs5, GameImages.DECO_STAIRS_UP, true);
  const groundStairs6 = new Point(l + 21, t + 22); //ground
  const parkingStairs2 = new Point(1, 26); //upper
  ctx.addExit(map, groundStairs6, parking, parkingStairs2, GameImages.DECO_STAIRS_DOWN, true);
  ctx.addExit(parking, parkingStairs2, map, groundStairs6, GameImages.DECO_STAIRS_UP, true);

  // 4. Add linked maps to district.
  const district = ctx.params.district;
  if (district) {
    district.addUniqueMap(upperlevel);
    district.addUniqueMap(parking);
  }
  // The C# also does `m_Params.District.AddUniqueMap(map)` at :9916 — the ground floor
  // — and then `m_Game.Session.UniqueMaps.ShoppingMall_GroundFloor = map`. Neither is
  // ported: the first would re-add the district's own entry map, and the second is an
  // alias for it. See the module header.

  // done!
  return mallBlock;
}

// ── The two levels ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:10178-10488` `GenerateShoppingMall_UpperLevel`, Release 7-3.
 *
 * 311 C# lines in five regions: the shell, the **food court** (north-west 25x22), the
 * **supermarket** (north-east 25x22), the **central row** (two public bathrooms, a
 * seating strip and a cinema foyer) and the **cinemas** (the whole southern 21 rows,
 * a corridor with four bins and two auditoria).
 *
 * ## The floor plan comment at `:10195-10199` is the map's only documentation
 *
 * ```csharp
 * // Floor plan.
 * // 2. top left: food court
 * // 3. top right: supermarket
 * // 4. central row
 * // 5. bottom: cinemas
 * ```
 *
 * It numbers from 2, because the `1.` above it is "Create map", and the four labels
 * are the regions below. Kept as written — the numbering is the C#'s and it is not a
 * gap.
 *
 * ## The 24-counter row spends 72 district dice, and the C#'s order is the map
 *
 * `MapObjectFill(map, new Rectangle(1, 2, 24, 1), …)` (`:10208`) is one row of 24
 * tiles, and each tile costs **three** `m_DiceRoller` rolls: the price board
 * (`Roll(0, 5)`), the counter (`Roll(0, 5)`) and the item on it (`Roll(0, 4)`, the
 * Release 7-6 addition at `:10235`). `MapObjectFill` walks `x` outer and `y` inner
 * (`MapGenerator.cs:271-282`), so for a one-row rect the twenty-four tiles are in
 * `x` order and the dice fall that way. The counter's *return value* is created last
 * but placed after the whole fill's callback for that tile — the item is dropped
 * before the counter exists on the tile, exactly as in `MakeMallShopDisplays`.
 *
 * The price board goes on `pt.Y - 2` (`:10221`), which is `y == 0`: the **north
 * perimeter wall** laid down by the shell's `TileRectangle(WALL_MALL, map.Rect)`.
 * So the row of 24 price boards is a run of wall decoration along the top of the
 * building, and the counters are two rows below it.
 *
 * ## `HasWaterTiles = true` is now honest
 *
 * `:10189` sets it with the comment "the pool with plam trees". The pool is
 * `FLOOR_FOOD_COURT_POOL` at `:10277-10278`, and `GameTiles.ts:301` registers that
 * model with `isWater = true`, so the flag and the tiles agree — **and the water is a
 * ten-tile ring rather than a twelve-tile rectangle**, because the C# uses
 * `TileRectangle` for it. It is set from the map's own initialiser position in the C# and
 * is set here in the same place — before the floor fill — because the pool tile is the
 * only thing that makes it true and the reader is `CivilianAI`'s "on fire, find water"
 * arm, which this port has not reached (`Actor.isOnFire` does not exist yet; see
 * `Map.hasWaterTiles` and the identical assignment on the pond at
 * `BaseTownGenerator.ts:3036`).
 *
 * ## The supermarket's shelf aisles are the *same* `MakeMallShopDisplays` code
 *
 * `:10309-10348` is a copy of `MakeMallShopDisplays` (`:10639`) with the switch
 * collapsed to a single arm: `MakeShopGroceryItem()` on every odd row, `OBJ_SHOP_SHELF`
 * for the display. `supermarketInsideRect` is 23 wide and 17 tall, so
 * `horizontalAlleys` is true, `centralAlley` is `27 + 23 / 2 == 38`, and `alleysRect`
 * is `(28, 2, 21, 17)`. The division is transposed rather than hoisted onto the
 * existing method, for the reason {@link makeMallShopDisplays} gives: the two copies
 * would then have to be told which one they are.
 */
export function generateShoppingMallUpperLevel(seed: number, ctx: TownBuildingContext): GameMap {
  //////////////////
  // 1. Create map.
  // 2. Floor plan.
  //////////////////

  // 1. Create map.
  const map = new GameMap(seed, 'Shopping Mall - Upper Level', MALL_LEVEL_SIZE, MALL_LEVEL_SIZE);
  map.lighting = Lighting.DARKNESS;
  map.hasWaterTiles = true; //the pool with plam trees. HasWaterTiles is used by the AI if they are on fire and looking for somewhere to extinguish themselves
  ctx.doForEachTile(map, map.rect, (pt) => {
    const tile = map.getTileAt(pt.x, pt.y);
    if (tile) tile.isInside = true;
  });
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_WHITE_TILE)!, map.rect);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, map.rect);

  // Floor plan.
  // 2. top left: food court
  // 3. top right: supermarket
  // 4. central row
  // 5. bottom: cinemas

  //////////////////////////
  // 2. top left: food court
  //////////////////////////
  // zone
  const foodCourtRect = new Rect(1, 1, 25, 22);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, new Rect(1, 22, 4, 1)); //little piece of wall running internally
  map.addZone(ctx.makeUniqueZone('food court', foodCourtRect));

  // counters
  ctx.mapObjectFill(map, new Rect(1, 2, 24, 1), (pt) => {
    //place the price board on the wall behind the counter
    addDecoration(
      map,
      new Point(pt.x, pt.y - FOOD_COURT_PRICEBOARD_ROWS_UP),
      FOOD_COURT_PRICEBOARDS[ctx.roller.roll(0, FOOD_COURT_VARIANTS)]!
    );

    //select which counter we'll have
    const counterImage = FOOD_COURT_COUNTERS[ctx.roller.roll(0, FOOD_COURT_VARIANTS)]!;

    //add an item to the counter            //@@MP (Release 7-6)
    // The third and last roll of each tile, and the drop happens *before* the counter
    // is offered — so the four arms below are not a second pass over the row.
    switch (ctx.roller.roll(0, FOOD_COURT_COUNTER_ITEMS)) {
      case 0: map.dropItemAt(makeItemCookedChicken(), pt); break;
      case 1: map.dropItemAt(makeItemFryingPan(), pt); break;
      case 2: map.dropItemAt(makeItemCleaver(), pt); break;
      case 3: map.dropItemAt(makeItemKitchenKnife(), pt); break;
    }

    //now place the counter
    return makeObjCounter(counterImage);
  });

  // chairs and tables
  const tablePoints: readonly (readonly [number, number])[] = [
    [3, 7], [3, 11], [3, 15], [3, 19], [7, 7], [7, 11], [7, 15], [7, 19], [11, 7], [11, 19], [16, 7], [16, 19],
    [20, 7], [20, 11], [20, 15], [20, 19], [24, 7], [24, 11], [24, 15], [24, 19],
  ];
  for (const [tableX, tableY] of tablePoints) {
    const tablePT = new Point(tableX, tableY);
    //central table with a chair each at NSEW
    ctx.mapObjectPlace(map, tablePT.x, tablePT.y, makeObjTable(GameImages.OBJ_FOOD_COURT_TABLE));
    for (const d of FOOD_COURT_CHAIR_DIRECTIONS) {
      const next = d.applyTo(tablePT);
      ctx.mapObjectPlace(map, next.x, next.y, makeObjChair(GameImages.OBJ_FOOD_COURT_CHAIR));
    }
  }

  // pool with palm trees
  //-outer edge
  const poolOuter = new Rect(11, 11, 6, 5);
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, poolOuter);
  //-plants on corners
  const poolPlants: readonly (readonly [number, number])[] = [[11, 11], [11, 15], [16, 11], [16, 15]];
  for (const [plantX, plantY] of poolPlants) {
    ctx.mapObjectPlace(map, plantX, plantY, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT));
  }
  //-pool
  //
  // **`TileRectangle`, not `TileFill`** — and that is the whole reason the two palm trees
  // below stand on dry floor. `Rectangle(12, 12, 4, 3)` is a *perimeter*, so it lays ten
  // water tiles and leaves `(13, 13)` and `(14, 13)` on the white tile the shell filled.
  // The pool is therefore a one-tile-wide ring of water around a two-tile island, and the
  // "palm tree in the middle" of `:10279` is two palm trees on that island. The C#'s.
  const poolWater = new Rect(12, 12, 4, 3);
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_FOOD_COURT_POOL)!, poolWater);
  //-palm tree in the middle
  ctx.mapObjectPlace(map, 13, 13, makeObjTree(GameImages.OBJ_FOOD_COURT_PALM_TREE));
  ctx.mapObjectPlace(map, 14, 13, makeObjTree(GameImages.OBJ_FOOD_COURT_PALM_TREE));

  //bins dotted around the place
  const foodCourtBins: readonly (readonly [number, number])[] = [
    [1, 5], [1, 21], [10, 13], [13, 10], [14, 10], [13, 16], [14, 16], [17, 13], [13, 22], [14, 22], [25, 22],
  ];
  for (const [binX, binY] of foodCourtBins) {
    ctx.mapObjectPlace(map, binX, binY, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN));
  }

  //////////////////////////
  // 3. top right: supermarket
  //////////////////////////
  //walls and floor
  const supermarketRect = new Rect(26, 1, 25, 22);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, supermarketRect);
  ctx.tileFill(
    map,
    Models.tiles.get(TileID.FLOOR_TILES)!,
    new Rect(supermarketRect.left + 1, supermarketRect.top + 1, 23, 20)
  );
  map.addZone(ctx.makeUniqueZone('Supermarket', supermarketRect));
  //entry
  addDecoration(map, new Point(27, 22), GameImages.DECO_SHOP_GROCERY);
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WHITE_TILE)!, new Rect(28, 22, 5, 1));
  addDecoration(map, new Point(33, 22), GameImages.DECO_SHOP_GROCERY);
  //shelves
  //
  // A transcription of `MakeMallShopDisplays`' alley walk with the switch collapsed
  // to one arm. `supermarketInsideRect` is 23 wide and 17 tall, so `horizontalAlleys`
  // is `true`, `centralAlley` is `27 + 23 / 2 == 38` and `alleysRect` is
  // `FromLTRB(28, 2, 49, 19)` — 21 by 17, and **not** the supermarket rect: it is
  // one tile in on the x axis only, because `horizontalAlleys` insets x. See the
  // method header.
  const supermarketInsideRect = new Rect(27, 2, 23, 17);
  let alleysStartX = supermarketInsideRect.left;
  let alleysStartY = supermarketInsideRect.top;
  let alleysEndX = supermarketInsideRect.right;
  let alleysEndY = supermarketInsideRect.bottom;
  const horizontalAlleys = supermarketInsideRect.width >= supermarketInsideRect.height;
  let centralAlley: number;

  if (horizontalAlleys) {
    ++alleysStartX;
    --alleysEndX;
    centralAlley = supermarketInsideRect.left + Math.floor(supermarketInsideRect.width / 2);
  } else {
    ++alleysStartY;
    --alleysEndY;
    centralAlley = supermarketInsideRect.top + Math.floor(supermarketInsideRect.height / 2);
  }
  // `Rectangle.FromLTRB(left, top, right, bottom)` - the C#'s ends are exclusive
  // corners, not widths. **Both ends are already inset above**, which is the load-bearing
  // half of the `++`/`--` pair: `FromLTRB(28, 2, 49, 19)` is twenty-one wide, and
  // subtracting from the *original* right would make it twenty-two and put a seventeenth
  // shelf column at `x == 49` against the supermarket's east wall.
  const alleysRect = new Rect(alleysStartX, alleysStartY, alleysEndX - alleysStartX, alleysEndY - alleysStartY);

  ctx.mapObjectFill(map, alleysRect, (pt) => {
    // Only the horizontal arm is reachable (`23 >= 17` is fixed at these literals),
    // and the vertical one is transcribed rather than dropped so that the copy stays
    // a copy of the C# and not a second, differently-shaped thing.
    let addShelf: boolean;

    if (horizontalAlleys) addShelf = (pt.y - alleysRect.top) % 2 === MALL_SHELF_ODD_ROW && pt.x !== centralAlley;
    else addShelf = (pt.x - alleysRect.left) % 2 === MALL_SHELF_ODD_ROW && pt.y !== centralAlley;

    if (!addShelf) return null;

    // **The item is dropped before the shelf is offered, and the offer is declined
    // on a taken tile** (`MapObjectFill` checks after the callback), so a grocery
    // shelf that could not be placed still leaves its item on the floor. The same
    // property the module header records for the ground floor's displays.
    map.dropItemAt(makeShopGroceryItem(ctx), pt);
    return makeObjShelf(GameImages.OBJ_SHOP_SHELF);
  });

  //checkouts
  //
  // Eight, every other tile from `x+34` to `x+48` on `y == 20` — a gap of two between
  // each, so the queue runs along the bottom of the store rather than against it.
  const checkoutXs: readonly number[] = [34, 36, 38, 40, 42, 44, 46, 48];
  for (const checkoutX of checkoutXs) {
    ctx.mapObjectPlace(map, checkoutX, 20, makeObjCheckout(GameImages.OBJ_SUPERMARKET_CHECKOUT));
  }

  ////////////////////////////
  // 4. central row
  ////////////////////////////
  //bathrooms
  //
  // **Two cubicles stacked at `x` 1-2 with the doors in the `x == 3` column, and the
  // wall between them is drawn *over* the north cubicle's door tile.** `:10366` sets
  // `(3, 24)` to `WALL_MALL` and `:10367` lays `Rectangle(1, 25, 3, 2)` — the two rows
  // *below* it — so the sequence is: south door, north fixtures, north door column
  // turned to wall, the two-row divider, south fixtures, south door. Kept in that
  // order because the order is what puts `(3, 24)` and `(3, 27)` into the wall and
  // leaves `(3, 25)` and `(3, 26)` as the cubicle mouths.
  ctx.mapObjectPlace(map, 3, 23, ctx.makeObjWoodenDoor());
  ctx.mapObjectPlace(map, 1, 24, makeObjToilet(GameImages.OBJ_TOILET));
  ctx.mapObjectPlace(map, 2, 24, makeObjBathroomBasin(GameImages.OBJ_BATHROOM_BASIN));
  map.setTileModelAt(3, 24, Models.tiles.get(TileID.WALL_MALL)!);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, new Rect(1, 25, 3, 2)); //wall between bathrooms
  map.setTileModelAt(3, 27, Models.tiles.get(TileID.WALL_MALL)!);
  ctx.mapObjectPlace(map, 1, 27, makeObjToilet(GameImages.OBJ_TOILET));
  ctx.mapObjectPlace(map, 2, 27, makeObjBathroomBasin(GameImages.OBJ_BATHROOM_BASIN));
  ctx.mapObjectPlace(map, 3, 28, ctx.makeObjWoodenDoor());

  //plants and seating
  //
  // One row at `y == 28`, transcribed as `[x, sprite]` because the object differs
  // every few tiles and the C# writes one call per line in that order.
  const centralRow: readonly (readonly [number, MapObject])[] = [
    [6, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [7, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [8, makeObjCouch(GameImages.OBJ_COUCH)],
    [9, makeObjCouch(GameImages.OBJ_COUCH)],
    [10, makeObjCouch(GameImages.OBJ_COUCH)],
    [11, makeObjCouch(GameImages.OBJ_COUCH)],
    [12, makeObjCouch(GameImages.OBJ_COUCH)],
    [13, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [14, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [23, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [24, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [25, makeObjCouch(GameImages.OBJ_COUCH)],
    [26, makeObjCouch(GameImages.OBJ_COUCH)],
    [27, makeObjCouch(GameImages.OBJ_COUCH)],
    [28, makeObjCouch(GameImages.OBJ_COUCH)],
    [29, makeObjCouch(GameImages.OBJ_COUCH)],
    [30, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [31, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
  ];
  for (const [furnitureX, furniture] of centralRow) {
    ctx.mapObjectPlace(map, furnitureX, 28, furniture);
  }

  //cinema entry
  //
  // The waiting area: two benches either side of a bin on each of `y == 23` and
  // `y == 28`, and nothing at all between `x` 15 and 22 — that gap is the way in
  // from the food court and the supermarket.
  const cinemaWaiting: readonly (readonly [number, number, MapObject])[] = [
    [38, 23, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [39, 23, makeObjBench(GameImages.OBJ_BENCH)],
    [40, 23, makeObjBench(GameImages.OBJ_BENCH)],
    [39, 28, makeObjBench(GameImages.OBJ_BENCH)],
    [40, 28, makeObjBench(GameImages.OBJ_BENCH)],
    [38, 28, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
  ];
  for (const [waitX, waitY, waitObj] of cinemaWaiting) {
    ctx.mapObjectPlace(map, waitX, waitY, waitObj);
  }

  //cinema foyer
  //
  // **Both cinema signs ride a `WALL_MALL` tile**, which is not an accident: `:10402` and
  // `:10404` lay two two-tile wall runs at `x == 41`, leaving `y` 25 and 26 as the two-tile
  // entry, and the signs go on the inner tile of each run. Transcribed in the C#'s order,
  // which puts the wall down before the decoration in both cases.
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, new Rect(41, 23, 1, 2)); //north side of the entry
  addDecoration(map, new Point(41, 24), GameImages.DECO_CINEMA_SIGN);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, new Rect(41, 27, 1, 2)); //south side of the entry
  addDecoration(map, new Point(41, 27), GameImages.DECO_CINEMA_SIGN);
  const cinemaFoyer = new Rect(42, 23, 8, 6);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_RED_CARPET)!, cinemaFoyer);
  // **Six reception desks in one column at `x == 48`, against the foyer's east wall**
  // — and `OBJ_BANK_TELLER`, not a cinema sprite: the C# reuses the bank counter.
  for (let deskY = 23; deskY <= 28; deskY++) {
    ctx.mapObjectPlace(map, 48, deskY, makeObjReceptionDesk(GameImages.OBJ_BANK_TELLER));
  }
  const foyerNorthSide: readonly number[] = [42, 43, 44, 45];
  for (const couchX of foyerNorthSide) {
    ctx.mapObjectPlace(map, couchX, 23, makeObjCouch(GameImages.OBJ_COUCH)); //north side of the entry
  }
  ctx.mapObjectPlace(map, 46, 29, makeObjDrawer(GameImages.OBJ_LECTERN)); //ticket check
  const foyerSouthSide: readonly number[] = [42, 43, 44];
  for (const couchX of foyerSouthSide) {
    ctx.mapObjectPlace(map, couchX, 28, makeObjCouch(GameImages.OBJ_COUCH)); //south side of the entry
  }

  //////////////////
  // 5. bottom: cinemas
  //////////////////
  //-walls
  //
  // The corridor wall runs the full width at `y == 29`, and the only hole in it is
  // the three red-carpet tiles at `x` 45-47 — directly under the foyer's south side,
  // so the foyer's six desks and seven couches all look onto a three-tile mouth into
  // the corridor, **one tile of which the ticket drawer then stands in.**
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_MALL)!, new Rect(1, 29, 50, 1)); //wall ecapsulating corridor
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_RED_CARPET)!, new Rect(45, 29, 3, 1)); //entry to corridor
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_RED_CARPET)!, new Rect(1, 30, 49, 20)); //corridor and cinemas
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_RED_CURTAINS)!, new Rect(1, 30, 1, 21)); //left wall
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_RED_CURTAINS)!, new Rect(1, 50, 50, 1)); //bottom wall
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_RED_CURTAINS)!, new Rect(50, 30, 1, 21)); //right wall
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_RED_CURTAINS)!, new Rect(1, 32, 50, 1)); //top wall
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_RED_CURTAINS)!, new Rect(26, 32, 1, 19)); //cinema dividing wall
  //-bins in corridor
  const corridorBins: readonly (readonly [number, number])[] = [[2, 30], [2, 31], [49, 30], [49, 31]];
  for (const [binX, binY] of corridorBins) {
    ctx.mapObjectPlace(map, binX, binY, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN));
  }
  //-doors and signs
  //
  // A real `Dictionary<int, int>` here, not one of the `KeyValuePairWithDuplicates`
  // lists — eight distinct `x` values, so a dictionary would not have thrown. Written
  // as pairs anyway, because `foreach` over that dictionary is insertion order in
  // practice and the order is when the doors and then the signs land.
  const cinemaDoorPoints: readonly (readonly [number, number])[] = [
    [3, 32], [4, 32], [23, 32], [24, 32], [28, 32], [29, 32], [47, 32], [48, 32],
  ];
  for (const [doorX, doorY] of cinemaDoorPoints) {
    map.setTileModelAt(doorX, doorY, Models.tiles.get(TileID.FLOOR_RED_CARPET)!);
    ctx.mapObjectPlace(map, doorX, doorY, ctx.makeObjWoodenDoor());
  }
  // **CINEMA2 on the left (`x` 5 and 22), CINEMA1 on the right (`x` 30 and 46)** —
  // and cinema 1 is the one at `x` 28..48, which the seat rows below also call the
  // smaller. So the C#'s numbering is the *west* auditorium's `2`.
  addDecoration(map, new Point(5, 32), GameImages.DECO_CINEMA2);
  addDecoration(map, new Point(22, 32), GameImages.DECO_CINEMA2);
  addDecoration(map, new Point(30, 32), GameImages.DECO_CINEMA1);
  addDecoration(map, new Point(46, 32), GameImages.DECO_CINEMA1);
  //-seats
  const rowStarts: readonly (readonly [number, number])[] = [
    [4, 34], [4, 36], [4, 38], [4, 40], [4, 42], [4, 44], [29, 34], [29, 36], [29, 38], [29, 40], [29, 42], [29, 44],
  ];
  for (const [rowStartX, rowStartY] of rowStarts) {
    let rowWidth = 20;
    if (rowStartX === 29) rowWidth = 19; //cinema1, slightly smaller

    ctx.mapObjectFill(map, new Rect(rowStartX, rowStartY, rowWidth, 1), (pt) => {
      // `//@@MP (Release 7-6)` — one seat in five has something on it, and the item is
      // dropped whether or not the seat itself goes down.
      if (ctx.roller.rollChance(CINEMA_SEAT_SNACK_CHANCE)) map.dropItemAt(makeItemSnackBar(ctx.game.rules), pt);
      return makeObjSeat(GameImages.OBJ_CINEMA_SEAT);
    });
  }
  //-screens
  //
  // Two `Rectangle`s one tile high at `y == 49`, and the numbering agrees with the
  // signs above: **cinema1 is the east auditorium and cinema2 the west.** What is *not*
  // symmetric is the width — the east one gets a 21-tile screen and 19-seat rows and
  // the west one gets a 22-tile screen and 20-seat rows, so cinema1 is the smaller of
  // the pair on both counts, exactly as `//cinema1, slightly smaller` says at `:10460`.
  // They do not meet either: `x` 25, `x == 26` and `x` 27 are curtain, so the two
  // screens are separated by the dividing wall and its two shoulders.
  const cinema1Screen = new Rect(28, 49, 21, 1);
  ctx.mapObjectFill(map, cinema1Screen, () => makeObjCinemaScreen(GameImages.OBJ_CINEMA_SCREEN));
  const cinema2Screen = new Rect(3, 49, 22, 1);
  ctx.mapObjectFill(map, cinema2Screen, () => makeObjCinemaScreen(GameImages.OBJ_CINEMA_SCREEN));

  // done.
  return map;
}

/**
 * C# `BaseTownGenerator.cs:10490-10612` `GenerateShoppingMall_Parking`, Release 7-3.
 *
 * 123 C# lines in three steps: the shell, the **entry and power rooms** (a five-wide
 * walkway strip down the west side, split by a concrete wall at `x == 4` with six
 * openings) and the **parking** (three edge rows and sixteen twenty-one-tile columns,
 * with a pillar or a railing between every pair of bays).
 *
 * ## `PARKING_ASPHALT_EW` / `_NS` are real tile models and always were
 *
 * The tile at `:10586` is set twenty-one times per column and the abandoned-car test
 * at `:10599` compares `Tile.Model` against both of them, so the whole step depends
 * on those two models being registered. They are: `GameTiles.ts:402-403` registers
 * `PARKING_ASPHALT_EW` (`= 133`) and `PARKING_ASPHALT_NS` (`= 134`) as grey, walkable,
 * inside models over `GameImages.TILE_PARKING_ASPHALT_EW` / `_NS`, and
 * `WALL_PILLAR_CONCRETE` (`:140`) at `:409`. **The images were already declared for
 * world decay** (`:210-211`, `:217`); only the models were the open question, and they
 * are there.
 *
 * ## The orientation is the C#'s, and it is the whole trick
 *
 * * **The edges are `NS`, the bays are `EW`.** `:10574` lays the top and bottom rows
 *   `PARKING_ASPHALT_NS` and `:10575` lays the right-hand column `PARKING_ASPHALT_EW`,
 *   while every one of the sixteen columns' own bay tiles is `EW` (`:10586`). A car
 *   parked on a bay tile is therefore drawn east-west and a car on the top or bottom
 *   row north-south, which is what the sprites encode and why both models appear in the
 *   abandoned-car test rather than one.
 * * **The right-hand column is `EW` and the other two are `NS`** even though all three
 *   are edge runs, and nothing in the geometry requires it. Transcribed.
 *
 * ## The power rooms are ringed, not filled, and that is `CountAdjWalls`' eight directions
 *
 * `:10543-10550` and `:10561-10568` place a generator on every tile of the two power
 * rooms with `CountAdjWalls(map, pt) >= 3`. `CountAdjWalls` is `CountForEachAdjacent`
 * over **`Direction.COMPASS`** — all *eight* neighbours, diagonals included
 * (`MapGenerator.cs:405-420`) — so "three walls" counts corners, and each room gets an
 * **L of twenty-one generators**: both side columns for all ten rows, plus the single
 * far-end tile between them. The near-end tile of that column (`(2, 1)` and `(2, 49)`)
 * is the one that reaches three; `(2, 2)` and `(2, 48)` reach two and are left as the
 * doorway in.
 *
 * Worth stating because a reader who takes `COMPASS_4` gets a different map: on the four
 * cardinals alone the same test places **no generator at all**, since the room is three
 * wide and ten tall and no tile has three cardinal walls.
 *
 * ## Six openings, and the pillar/railing alternation
 *
 * `:10512-10517` punches `x == 4` at `y` 15-16, 25-26 and 35-36 — three doorways, each
 * two tiles, and one of them is at exactly the stair pair `(1, 25)` / `(1, 26)` the
 * ground floor's `AddExit` lands on. Inside each column loop (`:10584-10592`) the
 * divider at `x + 1` is a `WALL_PILLAR_CONCRETE` tile when `i % 5 == 0` and an
 * `OBJ_RAILING` map object otherwise, so a bay pair is five wide: a pillar at the head
 * of every run of five and four railings, and the pillar *overwrites the tile* rather
 * than standing on it.
 */
export function generateShoppingMallParking(seed: number, ctx: TownBuildingContext): GameMap {
  //////////////////
  // 1. Create map.
  // 2. Entry and power rooms.
  // 3. Parking.
  //////////////////

  // 1. Create map.
  const map = new GameMap(seed, 'Shopping Mall - Parking', MALL_LEVEL_SIZE, MALL_LEVEL_SIZE);
  map.lighting = Lighting.DARKNESS;
  ctx.doForEachTile(map, map.rect, (pt) => {
    const tile = map.getTileAt(pt.x, pt.y);
    if (tile) tile.isInside = true;
  });
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_ASPHALT)!, map.rect); //for the car spaces area
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, new Rect(1, 1, 5, 50)); //for the entry and power rooms area
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_CONCRETE)!, map.rect);

  /////////////////////////
  // 2. Entry and power rooms.
  /////////////////////////
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_CONCRETE)!, new Rect(4, 1, 1, 49)); //wall separating stairs and power rooms from car spaces
  //-openings from entry to parking area
  const parkingOpenings: readonly (readonly [number, number])[] = [
    [4, 15], [4, 16], [4, 25], [4, 26], [4, 35], [4, 36],
  ];
  for (const [openingX, openingY] of parkingOpenings) {
    map.setTileModelAt(openingX, openingY, Models.tiles.get(TileID.FLOOR_WALKWAY)!);
  }
  //-bins, plants and benches
  //
  // One run down the `x == 1` column, `y` 16-22 and `y` 29-35, so the walkway strip
  // gets the same bin/bench alternation as the food court and nothing at all between
  // the two runs — which is where the stair column at `y` 25-26 lands.
  const parkingFurniture: readonly (readonly [number, MapObject])[] = [
    [16, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [17, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [18, makeObjBench(GameImages.OBJ_BENCH)],
    [19, makeObjBench(GameImages.OBJ_BENCH)],
    [20, makeObjBench(GameImages.OBJ_BENCH)],
    [21, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [22, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [29, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
    [30, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [31, makeObjBench(GameImages.OBJ_BENCH)],
    [32, makeObjBench(GameImages.OBJ_BENCH)],
    [33, makeObjBench(GameImages.OBJ_BENCH)],
    [34, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT)],
    [35, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN)],
  ];
  for (const [furnitureY, furniture] of parkingFurniture) {
    ctx.mapObjectPlace(map, 1, furnitureY, furniture);
  }

  //-power room north.
  //--door
  map.setTileModelAt(1, 11, Models.tiles.get(TileID.WALL_CONCRETE)!);
  ctx.mapObjectPlace(map, 2, 11, ctx.makeObjIronDoor());
  map.setTileModelAt(3, 11, Models.tiles.get(TileID.WALL_CONCRETE)!);
  //--zone
  const powerRoomNorth = new Rect(1, 1, 3, 10);
  map.addZone(ctx.makeUniqueZone('power room', powerRoomNorth));
  //--power generators.
  //
  // **An L of twenty-one, not a full grid and not an empty room** — see the method header
  // for why the diagonals count. The walk is transcribed whole, gate included, because the
  // room's shape is a fact about the *walls* and not about how the generator placed things.
  ctx.doForEachTile(map, powerRoomNorth, (pt) => {
    if (ctx.countAdjWalls(map, pt.x, pt.y) < 3) return;
    ctx.mapObjectPlace(map, pt.x, pt.y, makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON));
  });

  //-power room south.
  //--door
  map.setTileModelAt(1, 39, Models.tiles.get(TileID.WALL_CONCRETE)!);
  ctx.mapObjectPlace(map, 2, 39, ctx.makeObjIronDoor());
  map.setTileModelAt(3, 39, Models.tiles.get(TileID.WALL_CONCRETE)!);
  //--zone
  const powerRoomSouth = new Rect(1, 40, 3, 10);
  map.addZone(ctx.makeUniqueZone('power room', powerRoomSouth));
  //--power generators.
  ctx.doForEachTile(map, powerRoomSouth, (pt) => {
    if (ctx.countAdjWalls(map, pt.x, pt.y) < 3) return;
    ctx.mapObjectPlace(map, pt.x, pt.y, makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON));
  });

  ////////////////
  // 3. Parking.
  ////////////////
  //-edges
  ctx.tileRectangle(map, Models.tiles.get(TileID.PARKING_ASPHALT_NS)!, new Rect(6, 1, 42, 1)); //top row
  ctx.tileRectangle(map, Models.tiles.get(TileID.PARKING_ASPHALT_EW)!, new Rect(49, 2, 1, 47)); //right side column
  ctx.tileRectangle(map, Models.tiles.get(TileID.PARKING_ASPHALT_NS)!, new Rect(6, 49, 42, 1)); //bottom row
  //-central columns
  //
  // Sixteen columns of *two* bay strips (`x` and `x + 2`) with a divider at `x + 1`,
  // five tiles apart along `x` and split into a northern run and a southern one by the
  // open middle of the car park (`y` 25 and 26, which is where the third doorway is).
  // The two runs start at `y == 4` and `y == 27` and are both 21 long, so the last bay
  // of each is at `y == 24` and `y == 47`.
  const parkingColumns: readonly (readonly [number, number])[] = [
    //--north of dividing lanes
    [9, 4], [14, 4], [19, 4], [24, 4], [29, 4], [34, 4], [39, 4], [44, 4],
    //--south of dividing lanes
    [9, 27], [14, 27], [19, 27], [24, 27], [29, 27], [34, 27], [39, 27], [44, 27],
  ];
  for (const [columnX, columnY] of parkingColumns) {
    for (let i = 0; i <= 20; ++i) {
      map.setTileModelAt(columnX, columnY + i, Models.tiles.get(TileID.PARKING_ASPHALT_EW)!); //parking spot
      // The divider is a *tile* every fifth step and a *map object* otherwise, so the
      // pillars are part of the floor and the railings stand on the asphalt.
      if (i % 5 === 0) {
        map.setTileModelAt(columnX + 1, columnY + i, Models.tiles.get(TileID.WALL_PILLAR_CONCRETE)!); //load-bearing pillar
      } else {
        //railing
        ctx.mapObjectPlace(map, columnX + 1, columnY + i, makeObjIronRailing(GameImages.OBJ_RAILING));
      }
      map.setTileModelAt(columnX + 2, columnY + i, Models.tiles.get(TileID.PARKING_ASPHALT_EW)!); //parking spot
    }
  }

  //-cars
  //
  // One 20%-per-bay roll, and the *only* test is the tile model: anything that is not
  // `PARKING_ASPHALT_EW` or `PARKING_ASPHALT_NS` is skipped without spending a die.
  // The rect is `(6, 2, 44, 48)`, so it covers the bottom `NS` row at `y == 49` and the
  // right-hand `EW` column at `x == 49` but **stops one row short of the top row at
  // `y == 1`** — so the top row is a real bay strip that the generator lays down and then
  // never rolls for, and cars appear on the other two edges and on the sixteen columns'
  // own bays. The C#'s rect, kept.
  const parkingAsphaltEW = Models.tiles.get(TileID.PARKING_ASPHALT_EW)!;
  const parkingAsphaltNS = Models.tiles.get(TileID.PARKING_ASPHALT_NS)!;
  ctx.mapObjectFill(map, new Rect(6, 2, 44, 48), (pt) => {
    const model = map.getTileAt(pt.x, pt.y)?.model;
    if (model === parkingAsphaltEW || model === parkingAsphaltNS) {
      // Two district dice per car that lands: the 20% and then `MakeObjAbandonedCar`'s
      // own `Roll(0, 4)` for the sprite and `Roll(30, 98)` for the fuel.
      if (ctx.roller.rollChance(PARKING_CAR_CHANCE)) return makeObjAbandonedCar(ctx.roller);
    }

    return null;
  });

  // done.
  return map;
}

// ── `GenerateShoppingMallGroundFloor` ────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:9928-10176` `GenerateShoppingMallGroundFloor`, Release 7-3.
 *
 * Five steps and 248 lines: fill and enclose, entrances and signs, seats/plants/bins/
 * registers, twelve shops, and then the two hand-built interiors (the barber's, the
 * dealership's). The C# also has `surfaceMap.Lighting = Lighting.OUTSIDE;` commented
 * out at `:10173` with the note *"doesn't work, makes the sky not visible even when
 * outside for some reason…"* — that stays commented out, i.e. absent, and the district
 * surface map's own `OUTSIDE` lighting is what applies.
 */
function generateShoppingMallGroundFloor(surfaceMap: GameMap, block: Block, ctx: TownBuildingContext): void {
  const { roller } = ctx;

  // Fill & Enclose Building.
  ctx.tileRectangle(surfaceMap, Models.tiles.get(TileID.FLOOR_WALKWAY)!, block.rectangle);
  ctx.tileRectangle(surfaceMap, Models.tiles.get(TileID.WALL_MALL)!, block.buildingRect);
  ctx.tileFill(surfaceMap, Models.tiles.get(TileID.FLOOR_WHITE_TILE)!, block.insideRect);
  ctx.doForEachTile(surfaceMap, block.insideRect, (pt) => {
    const tile = surfaceMap.getTileAt(pt.x, pt.y);
    if (tile) tile.isInside = true;
  });
  //to fix jank
  // These four are the *building* rect's edges, not the inside rect's: the C# spells
  // them as `InsideRect.Left - 1` and friends, which is the same number twice. Kept
  // as `buildingRect` because the port's `Block` derives all three from one rect and
  // the arithmetic would be four chances to get `bottom` wrong. `insideRect.bottom` is
  // `buildingRect.bottom` and `insideRect.right` is `buildingRect.right` — verified
  // against `Block.resetRectangle`, which insets by 1 on each side and by 2 in size.
  const l = block.buildingRect.left;
  const t = block.buildingRect.top;
  const b = block.buildingRect.bottom;
  const r = block.buildingRect.right;

  // 1. mall entrances with signs.
  const doorList: readonly Point[] = [
    new Point(l, t + 21), new Point(l, t + 22), new Point(l, t + 23), new Point(l, t + 24), //east
    new Point(l + 13, t), new Point(l + 14, t), new Point(l + 15, t), new Point(l + 29, t), new Point(l + 30, t), new Point(l + 31, t), //north
    new Point(r, t + 21), new Point(r, t + 22), new Point(r, t + 23), new Point(r, t + 24), //east
    new Point(l + 13, b), new Point(l + 14, b), new Point(l + 15, b), new Point(l + 29, b), new Point(l + 30, b), new Point(l + 31, b), //south
  ];
  // The first comment in the C# says `east` for the *west* wall list and `east` again
  // for the real east list. Both are transcribed with their own C# comment, because
  // they say so.
  for (const doorPoint of doorList) {
    removeMapObjectAt(surfaceMap, doorPoint.x, doorPoint.y);
    ctx.placeDoor(surfaceMap, doorPoint.x, doorPoint.y, Models.tiles.get(TileID.FLOOR_WHITE_TILE)!, ctx.makeObjGlassDoor());
  }
  const the = [
    new Point(l + 12, t), new Point(l + 28, t), new Point(r, t + 25), new Point(l + 12, b), new Point(l + 28, b), new Point(l, t + 20),
  ];
  for (const thePoint of the) addDecoration(surfaceMap, thePoint, GameImages.DECO_MALL_SIGN_THE);

  const mall = [
    new Point(l + 16, t), new Point(l + 32, t), new Point(r, t + 20), new Point(l + 16, b), new Point(l + 32, b), new Point(l, t + 25),
  ];
  for (const mallPoint of mall) addDecoration(surfaceMap, mallPoint, GameImages.DECO_MALL_SIGN_MALL);

  // 2. seats, plants, bins and registers
  const seats: readonly Point[] = [
    new Point(l + 15, t + 8), new Point(l + 15, t + 9), new Point(l + 15, t + 10), new Point(l + 29, t + 8), new Point(l + 29, t + 9), new Point(l + 29, t + 10),
    new Point(l + 15, t + 33), new Point(l + 15, t + 34), new Point(l + 15, t + 35), new Point(l + 29, t + 33), new Point(l + 29, t + 34), new Point(l + 29, t + 35),
  ];
  for (const seatPoint of seats) ctx.mapObjectPlace(surfaceMap, seatPoint.x, seatPoint.y, makeObjBench(GameImages.OBJ_BENCH));

  const plants: readonly Point[] = [
    new Point(l + 15, t + 7), new Point(l + 15, t + 11), new Point(l + 29, t + 7), new Point(l + 29, t + 11),
    new Point(l + 15, t + 32), new Point(l + 15, t + 36), new Point(l + 29, t + 32), new Point(l + 29, t + 36),
  ];
  for (const plantPoint of plants) ctx.mapObjectPlace(surfaceMap, plantPoint.x, plantPoint.y, makeObjPottedPlant(GameImages.OBJ_POTTED_PLANT));

  // **The bins are on absolute map coordinates, not on `l`/`t` (`:9971`).** Every
  // other list in this method is `l +` / `t +`; these four are bare `15, 24` /
  // `15, 25` / `33, 24` / `33, 25`. For a mall in a district whose rect starts at 0
  // (every district — `cityRectangle` is `new Rect(0, 0, map.Width, map.Height)`)
  // that happens to put them at the right place, because `l` is 2 for a 48x48 block
  // and `t` is 2 as well; so `l+13` is 15 and `t+22` is 24. Two of the four line up by
  // that coincidence and two do not: `15, 25` is `l+13, t+23` while the seating it
  // serves is at `l+15, t+33`. Transcribed verbatim, because "fixing" it would move
  // two bins for a reason no reader could reconstruct.
  const bins: readonly Point[] = [new Point(15, 24), new Point(15, 25), new Point(33, 24), new Point(33, 25)];
  for (const binPoint of bins) ctx.mapObjectPlace(surfaceMap, binPoint.x, binPoint.y, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN));

  const registers: readonly Point[] = [
    new Point(l + 1, t + 9), new Point(l + 17, t + 9), new Point(l + 33, t + 1), new Point(l + 1, t + 19), new Point(l + 27, t + 19), new Point(l + 44, t + 11),
    new Point(l + 17, t + 26), new Point(l + 33, t + 34), new Point(l + 11, t + 44), new Point(l + 17, t + 36), new Point(l + 33, t + 36),
  ];
  // `OBJ_CLINIC_DESK`, not a mall sprite: the C# reuses the clinic's desk
  // (`:9978`), and `GameImages.ts`'s own comment on that constant says so.
  for (const registerPoint of registers) ctx.mapObjectPlace(surfaceMap, registerPoint.x, registerPoint.y, makeObjCheckout(GameImages.OBJ_CLINIC_DESK));

  // 3. Make shops
  // walls
  //
  // The four rows are `t+0`, `t+10`, `t+25`, `t+35`, each 11 tall, in three columns
  // of 13/13/14. **Rows 1 and 2 overlap by one row and rows 3 and 4 overlap by one
  // row**, which is the C#'s layout and not a slip — see the module header. The floors
  // are painted per shop *inside* its own `Block`, so a later row's floor wins on the
  // shared row; that is why the row order below is the C#'s.
  type MallShop = { block: Block; floor: number };
  const shopBlock1 = new Block(new Rect(l, t, 13, 11)); //barber
  const shopBlock2 = new Block(new Rect(l + 16, t, 13, 11)); //books
  const shopBlock3 = new Block(new Rect(l + 32, t, 14, 11)); //clothing
  const shopBlock4 = new Block(new Rect(l, t + 10, 13, 11)); //clothing
  const shopBlock5 = new Block(new Rect(l + 16, t + 10, 13, 11)); //clothing
  const shopBlock6 = new Block(new Rect(l + 32, t + 10, 14, 11)); //sporting goods
  const shopBlock7 = new Block(new Rect(l, t + 25, 13, 11)); //car dealership - the `//electronics` comment at :10015 is stale
  const shopBlock8 = new Block(new Rect(l + 16, t + 25, 13, 11)); //mobiles
  const shopBlock9 = new Block(new Rect(l + 32, t + 25, 14, 11)); //books
  const shopBlock10 = new Block(new Rect(l, t + 35, 13, 11)); //pharmacy
  const shopBlock11 = new Block(new Rect(l + 16, t + 35, 13, 11)); //liquor
  const shopBlock12 = new Block(new Rect(l + 32, t + 35, 14, 11)); //clothing

  const shops: readonly MallShop[] = [
    { block: shopBlock1, floor: TileID.FLOOR_PLANKS },
    { block: shopBlock2, floor: TileID.FLOOR_BLUE_CARPET },
    { block: shopBlock3, floor: TileID.FLOOR_BLUE_CARPET },
    { block: shopBlock4, floor: TileID.FLOOR_WHITE_TILE },
    { block: shopBlock5, floor: TileID.FLOOR_TILES },
    { block: shopBlock6, floor: TileID.FLOOR_WHITE_TILE },
    { block: shopBlock7, floor: TileID.FLOOR_BLUE_CARPET },
    { block: shopBlock8, floor: TileID.FLOOR_PLANKS },
    { block: shopBlock9, floor: TileID.FLOOR_RED_CARPET },
    { block: shopBlock10, floor: TileID.FLOOR_OFFICE },
    { block: shopBlock11, floor: TileID.FLOOR_TILES },
    { block: shopBlock12, floor: TileID.FLOOR_PLANKS },
  ];
  for (const shop of shops) {
    ctx.tileRectangle(surfaceMap, Models.tiles.get(TileID.WALL_MALL)!, shop.block.rectangle);
    ctx.tileFill(surfaceMap, Models.tiles.get(shop.floor)!, shop.block.buildingRect);
  }

  // make entryways for each shop
  //
  // `KeyValuePairWithDuplicates` — a list of pairs, not a dictionary, and the
  // duplicates matter: `{12,17}` and friends repeat the same x at different y, which
  // a `Dictionary<int,int>` would have thrown on. Every pair is written as an
  // `[x, y]` tuple and applied as white tile.
  const entryPoints: readonly (readonly [number, number])[] = [
    //, stores 1-3, north/south
    [12, 3], [12, 4], [12, 5], [16, 3], [16, 4], [16, 5], [28, 3], [28, 4], [28, 5], [32, 3], [32, 4], [32, 5],
    //stores 4-6, north/south
    [12, 17], [12, 18], [12, 19], [12, 20], [16, 13], [16, 14], [16, 15], [28, 13], [28, 14], [28, 15], [32, 17], [32, 18], [32, 19], [32, 20],
    //stores 4-6, east/west
    [9, 20], [10, 20], [11, 20], [21, 20], [22, 20], [23, 20], [33, 20], [34, 20], [35, 20],
    //stores 7-9, east/west
    [9, 25], [10, 25], [11, 25], [12, 25], [21, 25], [22, 25], [23, 25], [32, 25], [33, 25], [34, 25], [35, 25],
    //stores 7-9, north/south
    [12, 26], [12, 27], [12, 28], [16, 28], [16, 29], [16, 30], [28, 28], [28, 29], [28, 30], [32, 26], [32, 27], [32, 28],
    //stores 10-12, north/south
    [12, 38], [12, 39], [12, 40], [16, 38], [16, 39], [16, 40], [28, 38], [28, 39], [28, 40], [32, 38], [32, 39], [32, 40],
  ];
  for (const entryPoint of entryPoints) {
    surfaceMap.setTileModelAt(l + entryPoint[0], t + entryPoint[1], Models.tiles.get(TileID.FLOOR_WHITE_TILE)!);
  }

  // add signage to each store
  //
  // 42 `AddDecoration` calls, transcribed as (dx, dy, image) triples. The C# writes
  // them out one per line; grouping them by store keeps the order — which is the order
  // the decorations land on the tiles, and a tile can take two — without pretending
  // the C# had a loop.
  const signage: readonly (readonly [number, number, string])[] = [
    // stores 1-3
    [12, 2, GameImages.DECO_SHOP_BARBER],
    [12, 6, GameImages.DECO_SHOP_BARBER],
    [16, 2, GameImages.DECO_SHOP_BOOKSTORE],
    [16, 6, GameImages.DECO_SHOP_BOOKSTORE],
    [28, 2, GameImages.DECO_SHOP_BOOKSTORE],
    [28, 6, GameImages.DECO_SHOP_BOOKSTORE],
    [32, 2, GameImages.DECO_SHOP_CLOTHES_STORE],
    [32, 6, GameImages.DECO_SHOP_CLOTHES_STORE],
    // stores 4-6
    // --north-south
    [12, 16, GameImages.DECO_SHOP_CLOTHES_STORE],
    [16, 12, GameImages.DECO_SHOP_SPORTSWEAR],
    [16, 16, GameImages.DECO_SHOP_SPORTSWEAR],
    [28, 12, GameImages.DECO_SHOP_SPORTSWEAR],
    [28, 16, GameImages.DECO_SHOP_SPORTSWEAR],
    [32, 16, GameImages.DECO_SHOP_ELECTRONICS],
    // --east-west
    [8, 20, GameImages.DECO_SHOP_CLOTHES_STORE],
    [20, 20, GameImages.DECO_SHOP_SPORTSWEAR],
    [24, 20, GameImages.DECO_SHOP_SPORTSWEAR],
    [36, 20, GameImages.DECO_SHOP_ELECTRONICS],
    // stores 7-9
    // --north-south
    [12, 29, GameImages.DECO_SHOP_DEALERSHIP],
    [16, 27, GameImages.DECO_SHOP_MOBILES],
    [16, 31, GameImages.DECO_SHOP_MOBILES],
    [28, 27, GameImages.DECO_SHOP_MOBILES],
    [28, 31, GameImages.DECO_SHOP_MOBILES],
    [32, 29, GameImages.DECO_SHOP_BOOKSTORE],
    // --east-west
    [8, 25, GameImages.DECO_SHOP_DEALERSHIP],
    [20, 25, GameImages.DECO_SHOP_MOBILES],
    [24, 25, GameImages.DECO_SHOP_MOBILES],
    [36, 25, GameImages.DECO_SHOP_BOOKSTORE],
    // stores 10-12
    [12, 37, GameImages.DECO_SHOP_PHARMACY],
    [12, 41, GameImages.DECO_SHOP_PHARMACY],
    [16, 37, GameImages.DECO_SHOP_LIQUOR],
    [16, 41, GameImages.DECO_SHOP_LIQUOR],
    [28, 37, GameImages.DECO_SHOP_LIQUOR],
    [28, 41, GameImages.DECO_SHOP_LIQUOR],
    [32, 37, GameImages.DECO_SHOP_CLOTHES_STORE],
    [32, 41, GameImages.DECO_SHOP_CLOTHES_STORE],
  ];
  for (const [dx, dy, image] of signage) addDecoration(surfaceMap, new Point(l + dx, t + dy), image);

  // create displays/shelves
  //
  // Eleven pairs for twelve `Block`s: **`shopBlock7` is not here.** It is the
  // dealership, filled by hand further down, and its absence is what makes the
  // `DEALERSHIP` arm of `MakeMallShopDisplays` a `display = null`. See the module
  // header — this is transcribed, not repaired.
  const displays: readonly (readonly [Block, MallShopType])[] = [
    [shopBlock1, MallShopType.BARBER],
    [shopBlock2, MallShopType.BOOKSTORE],
    [shopBlock3, MallShopType.CLOTHING],
    [shopBlock4, MallShopType.CLOTHING],
    [shopBlock5, MallShopType.SPORTING_GOODS],
    [shopBlock6, MallShopType.ELECTRONICS],
    [shopBlock8, MallShopType.MOBILES],
    [shopBlock9, MallShopType.BOOKSTORE],
    [shopBlock10, MallShopType.PHARMACY],
    [shopBlock11, MallShopType.LIQUOR],
    [shopBlock12, MallShopType.CLOTHING],
  ];
  for (const [shopBlock, shopType] of displays) {
    makeMallShopDisplays(surfaceMap, shopBlock, shopType, ctx);
  }

  // other shops without the normal shelves style
  //
  // Barber shop
  //
  // The barber shop has a slightly different layout to all the other ordinary stores
  // (Release 7-6). Assumes that the barber shop is #1 and that the position and
  // dimension haven't been altered. Replace the two outer rows (northmost and
  // southmost) of display tables with chairs and adjacent sinks.
  //
  // `shopRect1` is the C#'s *rectangle*, not the block, so this walk covers the shop's
  // walls as well as its floor — which is the point: the test at `:10129` reads two
  // tiles north of each display and asks whether that is walkable, and on the top row
  // the answer is "no, that is the wall".
  ctx.doForEachTile(surfaceMap, shopBlock1.rectangle, (pt) => {
    const shopObj = surfaceMap.getMapObjectAtPoint(pt);
    if (shopObj !== null && shopObj.theName === 'the wigs display') {
      //it's a display for wigs
      //only check north and south of the object, as all the displays on the ends of four rows are adjacent to the west or east wall
      if (!tileIsWalkable(surfaceMap, pt.x, pt.y - 2)) {
        //there's a wall 2 tiles to the north, so this is an outer row of displays
        surfaceMap.removeMapObject(shopObj); //get rid of the wig display so we can replace it
        ctx.mapObjectPlace(surfaceMap, pt.x, pt.y, makeObjChair(GameImages.OBJ_BARBER_CHAIR));
        ctx.mapObjectPlace(surfaceMap, pt.x, pt.y - 1, makeObjBathroomBasin(GameImages.OBJ_BATHROOM_BASIN));
      } else if (!tileIsWalkable(surfaceMap, pt.x, pt.y + 2)) {
        //there's a wall 2 tiles to the north, so this is an outer row of displays
        surfaceMap.removeMapObject(shopObj); //get rid of the wig display so we can replace it
        ctx.mapObjectPlace(surfaceMap, pt.x, pt.y, makeObjChair(GameImages.OBJ_BARBER_CHAIR));
        ctx.mapObjectPlace(surfaceMap, pt.x, pt.y + 1, makeObjBathroomBasin(GameImages.OBJ_BATHROOM_BASIN));
      }
    } else if (shopObj !== null && shopObj.theName === 'the checkout') {
      //remove the checkout as it looks out of place here
      surfaceMap.removeMapObject(shopObj);
    }
  });

  // Car dealership
  //
  // `MakeObjDisplayCar(m_DiceRoller)` eight times, then tables, chairs and couches.
  // Eight rolls on the district's roller, which is the C#'s `m_DiceRoller`.
  const displayCars: readonly (readonly [number, number])[] = [
    [3, 28], [6, 27], [9, 28], [5, 30], [7, 30], [3, 32], [6, 33], [9, 32],
  ];
  for (const [dx, dy] of displayCars) ctx.mapObjectPlace(surfaceMap, l + dx, t + dy, makeObjDisplayCar(roller));

  //tables, chairs, couches
  ctx.mapObjectPlace(surfaceMap, l + 2, t + 26, makeObjChair(GameImages.OBJ_CHAIR));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 26, makeObjTable(GameImages.OBJ_TABLE));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 27, makeObjChair(GameImages.OBJ_CHAIR));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 29, makeObjCouch(GameImages.OBJ_COUCH));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 30, makeObjCouch(GameImages.OBJ_COUCH));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 31, makeObjCouch(GameImages.OBJ_COUCH));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 33, makeObjChair(GameImages.OBJ_CHAIR));
  ctx.mapObjectPlace(surfaceMap, l + 1, t + 34, makeObjTable(GameImages.OBJ_TABLE));
  ctx.mapObjectPlace(surfaceMap, l + 2, t + 34, makeObjChair(GameImages.OBJ_CHAIR));
  ctx.mapObjectPlace(surfaceMap, l + 11, t + 33, makeObjChair(GameImages.OBJ_CHAIR));
  ctx.mapObjectPlace(surfaceMap, l + 11, t + 34, makeObjTable(GameImages.OBJ_TABLE));
  ctx.mapObjectPlace(surfaceMap, l + 10, t + 34, makeObjChair(GameImages.OBJ_CHAIR));

  // Zone.
  //surfaceMap.Lighting = Lighting.OUTSIDE;  //@@MP - doesn't work, makes the sky not visible even when outside for some reason...
  surfaceMap.addZone(ctx.makeUniqueZone('Shopping Mall', block.buildingRect));
  ctx.makeWalkwayZones(surfaceMap, block);
}

// ── `MakeMallShopDisplays` ──────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:10614-10706` `MakeMallShopDisplays`, Release 7-3 (7-6 for
 * the barber arm).
 *
 * One `MapObjectFill` over the shop's "alleys": every second row (or column, if the
 * shop is taller than it is wide) except the centre one, filled with whatever display
 * the shop type calls for. The one `if` that decides is
 * `((pt.Y - alleysRect.Top) % 2 == 1) && pt.X != centralAlley`.
 *
 * Two things in the C# that are transcribed rather than tidied:
 *
 *  - **The roll comes *before* the switch, and the switch's arms roll again.** A
 *    `BARBER`, `CLOTHING` or `ELECTRONICS` shelf costs two district dice (the
 *    `Roll(0, 3)` / `Roll(0, 3)` / `Roll(0, 6)`) while the other four cost none.
 *  - **The dropped items are not tied to the display being placed.**
 *    `map.DropItemAt(MakeRandomMallShopItem(shopType), pt)` runs before `return
 *    display`, and `MapObjectFill` declines an occupied tile — so a shelf that cannot
 *    be placed still leaves its item on the floor. That is the C#'s behaviour and it is
 *    what makes a bookstore's book count independent of how many bookshelves fit.
 *
 * `RogueGame.Options.IsSanityEnabled` at `:10671` is **not** ported: the port has no
 * such option, and the option's default is the only representable state, so the
 * condition is dropped and the book always drops. Same call `makeLibraryBuilding`
 * documents for the same C# option.
 */
function makeMallShopDisplays(map: GameMap, b: Block, shopType: MallShopType, ctx: TownBuildingContext): void {
  // Make sections alleys with displays.
  let alleysStartX = b.buildingRect.left;
  let alleysStartY = b.buildingRect.top;
  let alleysEndX = b.buildingRect.right;
  let alleysEndY = b.buildingRect.bottom;
  const horizontalAlleys = b.rectangle.width >= b.rectangle.height;
  let centralAlley: number;

  if (horizontalAlleys) {
    ++alleysStartX;
    --alleysEndX;
    centralAlley = b.insideRect.left + Math.floor(b.insideRect.width / 2);
  } else {
    ++alleysStartY;
    --alleysEndY;
    centralAlley = b.insideRect.top + Math.floor(b.insideRect.height / 2);
  }
  // `Rectangle.FromLTRB(left, top, right, bottom)` - the C#'s ends are exclusive
  // corners, not widths.
  const alleysRect = new Rect(alleysStartX, alleysStartY, alleysEndX - alleysStartX, alleysEndY - alleysStartY);

  //make shelves/displays
  ctx.mapObjectFill(map, alleysRect, (pt) => {
    let addShelf: boolean;

    if (horizontalAlleys) addShelf = ((pt.y - alleysRect.top) % 2 === MALL_SHELF_ODD_ROW) && pt.x !== centralAlley;
    else addShelf = ((pt.x - alleysRect.left) % 2 === MALL_SHELF_ODD_ROW) && pt.y !== centralAlley;

    if (!addShelf) return null;

    //different style of display depending on the store type
    let display: MapObject | null = null;
    switch (shopType) {
      case MallShopType.BARBER:
        switch (ctx.roller.roll(0, 3)) {
          case 0: display = makeObjWigsDisplay(GameImages.OBJ_WIGS_DISPLAY1); break;
          case 1: display = makeObjWigsDisplay(GameImages.OBJ_WIGS_DISPLAY2); break;
          case 2: display = makeObjWigsDisplay(GameImages.OBJ_WIGS_DISPLAY3); break;
        }
        break;
      case MallShopType.LIQUOR:
      case MallShopType.SPORTING_GOODS:
      case MallShopType.GROCERY:
      case MallShopType.PHARMACY:
        display = makeObjShelf(GameImages.OBJ_SHOP_SHELF);
        map.dropItemAt(makeRandomMallShopItem(shopType, ctx), pt);
        break;
      case MallShopType.BOOKSTORE:
        display = makeObjBookshelves(GameImages.OBJ_BOOK_SHELVES);
        // if (RogueGame.Options.IsSanityEnabled) - no such option in the port, and
        // its default is the only representable state. See the header.
        map.dropItemAt(makeRandomMallShopItem(shopType, ctx), pt);
        break;
      case MallShopType.CLOTHING:
        switch (ctx.roller.roll(0, 3)) {
          case 0: display = makeObjClothesDisplay(GameImages.OBJ_CLOTHES_WALL1); break;
          case 1: display = makeObjClothesDisplay(GameImages.OBJ_CLOTHES_WALL2); break;
          case 2: display = makeObjClothesDisplay(GameImages.OBJ_SHOES_WALL); break;
        }
        break;
      case MallShopType.MOBILES:
        display = makeObjTable(GameImages.OBJ_MOBILES_TABLE);
        map.dropItemAt(makeItemCellPhone(), pt);
        break;
      case MallShopType.DEALERSHIP: display = null; break;
      case MallShopType.ELECTRONICS:
        switch (ctx.roller.roll(0, 6)) {
          case 0: display = makeObjFridge(GameImages.OBJ_FRIDGE); break;
          case 1: display = makeObjTelevision(GameImages.OBJ_TELEVISION); break;
          case 2: display = makeObjTable(GameImages.OBJ_LAPTOPS_TABLE); break;
          case 3: display = makeObjHouseholdMachine(GameImages.OBJ_WASHING_MACHINE, 'washing machine'); break;
          case 4: display = makeObjHouseholdMachine(GameImages.OBJ_DRYER, 'dryer'); break;
          case 5: display = makeObjHouseholdMachine(GameImages.OBJ_DISHWASHER, 'dishwasher'); break;
        }
        break;
      default:
        throw new RangeError('unhandled mall shop type');
    }

    return display;
  });
}

// ── `MakeRandomMallShopItem` ────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:7400-7420` `MakeRandomMallShopItem`, Release 7-3.
 *
 * **The only place in this file that reaches past `ctx.roller`, and it does so on
 * purpose.** `MakeItemAlcohol` (`:1965`) rolls `m_Game.Rules.RollChance(66)` and its
 * two children roll `m_Game.Rules` again — a *different* `DiceRoller` from the town
 * generator's, so in the C# a liquor bottle's colour and quantity cost the district's
 * dice nothing. `MakeItemBook` and `MakeItemMagazines` do the same for their cover.
 *
 * The alternative — spending those on `ctx.roller` — is what `makeChurchBuilding` and
 * `makeJunkyard` do, and the argument there is that the seam exists so a building
 * cannot reach the generator's roller. That argument is weaker here than it was there:
 * the roll is *in the item factory*, not in the building, and the port already has the
 * answer twice. `BarBuilding.ts:328` and `:341` call `makeItemAlcohol(ctx.game.rules)`
 * for exactly this, and this is the same bottle in a different shop — a second copy
 * that spends the district's stream where the bar's copy does not would make two
 * buildings disagree about the cost of a bottle. So `ctx.game.rules` it is, and the
 * three factories below are the third copy in the project (the other two are
 * `BarBuilding.ts:558-623`), which is the cost of a seam that has to be extended
 * rather than a private helper being duplicated once.
 */
function makeRandomMallShopItem(shop: MallShopType, ctx: TownBuildingContext): Item {
  switch (shop) {
    case MallShopType.BOOKSTORE:
      if (ctx.game.rules.rollChance(80)) return makeItemBook(ctx.game.rules);
      return makeItemMagazines(ctx.game.rules);
    case MallShopType.LIQUOR:
      return makeItemAlcohol(ctx.game.rules);
    case MallShopType.GROCERY:
      return makeShopGroceryItem(ctx);
    case MallShopType.PHARMACY:
      return makeShopPharmacyItem(ctx);
    case MallShopType.SPORTING_GOODS:
      return makeShopSportsWearItem(ctx);
    default:
      throw new RangeError('unhandled mallshoptype');
  }
}

/**
 * C# `BaseMapGenerator.cs:1699-1705` `MakeItemBook(DiceRoller)`, Release 7-6.
 *
 * Three models (the `BOOK_CHAR` fourth is *not* in the C#'s table — see the note at
 * `GameItems.ts:517`) and no quantity, so the stack size is the model's.
 */
function makeItemBook(rules: DiceRoller): Item {
  const novels = [ItemID.ENT_BOOK_BLUE, ItemID.ENT_BOOK_GREEN, ItemID.ENT_BOOK_RED];
  return new ItemEntertainment(Models.items.get(novels[rules.roll(0, novels.length)])!);
}

/**
 * C# `BaseMapGenerator.cs:1706-1714` `MakeItemMagazines(DiceRoller)`, Release 7-6.
 *
 * Four covers, and `Quantity = m_Rules.Roll(1, model.StackingLimit)` — a *second* roll,
 * on `m_Rules`, after the cover. Both are the C#'s and both are on the rules roller,
 * which is why this factory is not a `ctx.roller` one.
 */
function makeItemMagazines(rules: DiceRoller): Item {
  const covers = [ItemID.ENT_MAGAZINE1, ItemID.ENT_MAGAZINE2, ItemID.ENT_MAGAZINE3, ItemID.ENT_MAGAZINE4];
  const model = Models.items.get(covers[rules.roll(0, covers.length)])!;
  const magazines = new ItemEntertainment(model);
  magazines.quantity = rules.roll(1, model.stackingLimit);
  return magazines;
}

/** C# `BaseMapGenerator.cs:1965-1984` `MakeItemAlcohol`. Third copy; see the header. */
function makeItemAlcohol(rules: DiceRoller): Item {
  if (rules.rollChance(66)) {
    const beer = makeItemBeer(rules);
    const copy = new ItemMedicine(beer.model);
    copy.quantity = beer.quantity;
    return copy;
  }
  const liquor = makeItemLiquorForMolotov(rules);
  const copy = new Item(liquor.model);
  copy.quantity = liquor.quantity;
  return copy;
}

/** C# `BaseMapGenerator.cs:1764-1783` `MakeItemBeer`. */
function makeItemBeer(rules: DiceRoller): Item {
  const BEER_QUANTITY = 6;
  const beers = [
    ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_BROWN,
    ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN,
    ItemID.MEDICINE_ALCOHOL_BEER_CAN_BLUE,
    ItemID.MEDICINE_ALCOHOL_BEER_CAN_RED,
  ];
  const model = Models.items.get(beers[rules.roll(0, 4)])!;
  const beer = new ItemMedicine(model);
  beer.quantity = BEER_QUANTITY;
  return beer;
}

/** C# `BaseMapGenerator.cs:1946-1963` `MakeItemLiquorForMolotov`. */
function makeItemLiquorForMolotov(rules: DiceRoller): Item {
  const LIQUOR_QUANTITY = 6;
  const liquors = [ItemID.LIQUOR_AMBER, ItemID.LIQUOR_CLEAR];
  const model = Models.items.get(liquors[rules.roll(0, 2)])!;
  const liquor = new Item(model);
  liquor.quantity = LIQUOR_QUANTITY;
  return liquor;
}

/**
 * C# `BaseTownGenerator.cs:7422-7433` `MakeShopGroceryItem`, Release 5-5.
 *
 * **The C# is not the port's copy.** The port's `makeShopGroceryItem`
 * (`BaseTownGenerator.ts:4259`) is vanilla's `RollChance(50)` between canned food and
 * groceries; Release 5-5 replaced it with a three-way `Roll(0, 3)` and a vegetables
 * arm. The C#'s is transcribed here, which means an ordinary shop's groceries and a
 * mall grocery shelf's disagree in the port — a real divergence, and the right side of
 * it, because this is a Stage 5 building. Recorded at the factory so hoisting it onto
 * the seam has to settle which of the two the rest of the port means.
 *
 * `roll(0, 3)` returns 0..2, so the C#'s `default: throw` is unreachable.
 */
function makeShopGroceryItem(ctx: TownBuildingContext): Item {
  const roll = ctx.roller.roll(0, 3); //@@MP - added vegies and changed roll type (Relase 5-5)
  switch (roll) {
    case 0: return makeItemCannedFood(ctx.game.rules);
    case 1: return makeItemGroceries(ctx.game.rules);
    case 2: return makeItemVegetables(ctx.game.rules);
    default: throw new RangeError('unhandled roll');
  }
}

/**
 * C# `BaseTownGenerator.cs:7435-7454` `MakeShopPharmacyItem`, Release 5-2 / 7-6.
 *
 * Again not the port's copy: the port's is `Roll(0, 6)` from vanilla, this is
 * `Roll(0, 7)`. Two of the seven arms are conditional and both conditions are
 * **deliberately absent**, which is what the C# does when the port has no way to ask:
 *
 *  - `case 4`'s `RogueGame.Options.IsSanityEnabled` (Release 5-2) — the port has no
 *    such option and its default is the only representable state, so the sanity pills
 *    always come out. Same call `makeLibraryBuilding` documents.
 *  - `case 6`'s `Rules.HasAntiviralPills(m_Game.Session.GameMode)` (Release 7-6) —
 *    `Rules.hasAntiviralPills` does not exist in the port, so this takes the
 *    **small medikit** branch, which is the `else`. `tests/shopping-mall-building`
 *    says so at the assertion, because an inlined rule is the sort of thing that reads
 *    as a decision rather than a gap.
 */
function makeShopPharmacyItem(ctx: TownBuildingContext): Item {
  const randomItem = ctx.roller.roll(0, 7);
  switch (randomItem) {
    case 0: return makeItemSmallMedikit(ctx.game.rules);
    case 1: return makeItemLargeMedikit();
    case 2: return makeItemPillsSLP();
    case 3: return makeItemPillsSTA();
    case 4: return makeItemPillsSAN(); //@@MP - if Sanity is disabled ... (Release 1), fixed (Release 5-2); no such option in the port
    case 5: return makeItemStenchKiller();
    case 6: return makeItemSmallMedikit(ctx.game.rules); //@@MP - re-worked (Release 7-6); no `HasAntiviralPills` in the port, so the else branch
    default: throw new RangeError('unhandled roll');
  }
}

/**
 * C# `BaseTownGenerator.cs:7456-7483` `MakeShopSportsWearItem`, Release 7-1 / 7-3 / 7-6.
 *
 * `Roll(0, 14)` against the port's `Roll(0, 10)`, and the arms differ from the port's
 * too: a sleeping bag at `case 7` (7-3), glowsticks at `11`/`12` (7-1), a fishing rod
 * at `13` (7-6), and `case 10`'s sanity check — absent for the reason above, so it is a
 * magazine rather than a stench killer.
 */
function makeShopSportsWearItem(ctx: TownBuildingContext): Item {
  const roll = ctx.roller.roll(0, 14);
  switch (roll) {
    case 0:
    case 1: return makeItemHockeyStick();
    case 2: return makeItemGolfClub();
    case 3:
    case 4: return makeItemIronGolfClub();
    case 5:
    case 6: return makeItemBaseballBat();
    case 7: return makeItemSleepingBag(); //@@MP (Release 7-3)
    case 8:
    case 9: return makeItemTennisRacket();
    case 10: return makeItemMagazines(ctx.game.rules); //@@MP - `IsSanityEnabled` check (Release 7-6), absent in the port
    case 11:
    case 12: return makeItemGlowsticksBox(); //@@MP (Release 7-1)
    case 13: return makeItemFishingRod(); //@@MP (Release 7-6)
    default: throw new RangeError('unhandled roll');
  }
}

// ── The leaf item factories the three shop arms above reach for ──────────────
//
// C# `BaseMapGenerator.cs`. Every one of them is `public` on the port's
// `BaseMapGenerator` and out of a building file's reach, and each is one or three
// lines, so they are transcribed rather than added to the seam. `rules` is
// `m_Game.Rules` where the C# says so and `ctx.roller` where it says `m_DiceRoller`,
// and the parameter name says which - see the module header.

/** C# `BaseMapGenerator.cs:1075-1081` `MakeItemCannedFood`. Canned food never perishes. */
function makeItemCannedFood(rules: DiceRoller): Item {
  const model = Models.items.get(ItemID.FOOD_CANNED_FOOD)!;
  const item = new ItemFood(model);
  item.quantity = rules.roll(1, model.stackingLimit);
  return item;
}

/** C# `BaseMapGenerator.cs:1063-1073` `MakeItemGroceries`. */
function makeItemGroceries(rules: DiceRoller): Item {
  const model = Models.items.get(ItemID.FOOD_GROCERIES) as ItemFoodModel;
  const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
  const min = Math.floor(max / 2);
  const freshUntil = Session.get().worldTime.turnCounter + rules.roll(min, max);
  return new ItemFood(model, freshUntil);
}

/** C# `BaseMapGenerator.cs:1731-1741` `MakeItemVegetables`, Release 5-5. */
function makeItemVegetables(rules: DiceRoller): Item {
  const model = Models.items.get(ItemID.FOOD_VEGETABLES) as ItemFoodModel;
  const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
  const min = Math.floor(max / 2);
  const freshUntil = Session.get().worldTime.turnCounter + rules.roll(min, max);
  return new ItemFood(model, freshUntil);
}

/** C# `BaseMapGenerator.cs:1680-1690` `MakeItemSmallMedikit`, which rolls its stack. */
function makeItemSmallMedikit(rules: DiceRoller): Item {
  const model = Models.items.get(ItemID.MEDICINE_SMALL_MEDIKIT)!;
  const item = new ItemMedicine(model);
  item.quantity = rules.roll(1, model.stackingLimit);
  return item;
}

/** C# `BaseMapGenerator.cs:1539` `MakeItemLargeMedikit`. */
function makeItemLargeMedikit(): Item {
  return new ItemMedicine(Models.items.get(ItemID.MEDICINE_LARGE_MEDIKIT)!);
}

/** C# `BaseMapGenerator.cs:1047` `MakeItemPillsSLP`. */
function makeItemPillsSLP(): Item {
  return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SLP)!);
}

/** C# `BaseMapGenerator.cs:1042` `MakeItemPillsSTA`. */
function makeItemPillsSTA(): Item {
  return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_STA)!);
}

/** C# `BaseMapGenerator.cs:1052` `MakeItemPillsSAN`. */
function makeItemPillsSAN(): Item {
  return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SAN)!);
}

/** C# `BaseMapGenerator.cs:1231` `MakeItemStenchKiller`. */
function makeItemStenchKiller(): Item {
  return new ItemSprayScent(Models.items.get(ItemID.SCENT_SPRAY_STENCH_KILLER)!);
}

/** C# `BaseMapGenerator.cs:1512` `MakeItemHockeyStick`. */
function makeItemHockeyStick(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_HOCKEY_STICK)!);
}

/** C# `BaseMapGenerator.cs:1102` `MakeItemGolfClub`. */
function makeItemGolfClub(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_GOLFCLUB)!);
}

/** C# `BaseMapGenerator.cs:1106` `MakeItemIronGolfClub`. */
function makeItemIronGolfClub(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_IRON_GOLFCLUB)!);
}

/** C# `BaseMapGenerator.cs:1090` `MakeItemBaseballBat`. */
function makeItemBaseballBat(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BASEBALLBAT)!);
}

/** C# `BaseMapGenerator.cs:1726` `MakeItemTennisRacket`. */
function makeItemTennisRacket(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_TENNIS_RACKET)!);
}

/** C# `BaseTownGenerator.cs:3766` `MakeItemSleepingBag`, Release 7-3. A plain `Item`. */
function makeItemSleepingBag(): Item {
  return new Item(Models.items.get(ItemID.SLEEPING_BAG)!);
}

/** C# `BaseTownGenerator.cs:3777` `MakeItemGlowsticksBox`, Release 7-1. A plain `Item`. */
function makeItemGlowsticksBox(): Item {
  return new Item(Models.items.get(ItemID.GLOWSTICKS_BOX)!);
}

/** C# `BaseMapGenerator.cs:1029-1032` `MakeItemFishingRod`. */
function makeItemFishingRod(): Item {
  return new Item(Models.items.get(ItemID.FISHING_ROD)!);
}

// ── `MakeNarrowPark` ─────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:5809-5856` `MakeNarrowPark`, Release 7-3.
 *
 * The fallback for a block too small to house: grass, no walkway, no fence, trees at
 * 25% and benches at 5% per tile, an item at 5%, a `Park` zone.
 *
 * **It is here because `MakeMallBlocks` needs it**, not because it is part of the
 * mall: at a 50-wide district the three quads the mall does not take are
 * `0 x 50`, `50 x 0` and `0 x 0`, and at 55 they are `5 x 50`, `50 x 5` and `5 x 5` —
 * all under the `>= 7` test at `:1291`, so all three go here rather than to
 * `MakeBlocks`. Since `DEFAULT_DISTRICT_SIZE` is 50 and the option steps by five, a
 * default-sized mall district is *entirely* mall plus three degenerate narrow parks.
 *
 * Its other caller, the housing fallback at `:604-605`, is **not** ported: the port's
 * housing loop calls `makeHousingBuilding` unconditionally and has no such arm. That is
 * pre-existing Release 7-3 conformance debt recorded in the plan's `Graveyard`
 * section, not something this feature introduced, and fixing it would change every
 * Classic world.
 *
 * The C#'s step numbering skips 4 (`// 1`, `// 2`, `// 3`, `// 5`, `// done`), which
 * is its own.
 */
function makeNarrowPark(map: GameMap, b: Block, ctx: TownBuildingContext): boolean {
  /////////////////////////////
  // 1. Grass (no walkway nor fence)
  /////////////////////////////
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_GRASS)!, b.buildingRect);

  ///////////////////////////////
  // 2. Random trees and benches
  ///////////////////////////////
  //trees
  ctx.mapObjectFill(map, b.buildingRect, () => {
    if (ctx.roller.rollChance(PARK_TREE_CHANCE)) return makeObjParkTree(ctx.roller);
    return null;
  });

  //benches
  ctx.mapObjectFill(map, b.buildingRect, () => {
    if (ctx.roller.rollChance(PARK_BENCH_CHANCE)) return makeObjBench(GameImages.OBJ_BENCH);
    return null;
  });

  ////////////
  // 3. Items
  ////////////
  ctx.itemsDrop(
    map,
    b.buildingRect,
    (pt) => map.getMapObjectAtPoint(pt) === null && ctx.roller.rollChance(PARK_ITEM_CHANCE),
    () => makeRandomParkItem(ctx)
  );

  ///////////
  // 5. Zone
  ///////////
  map.addZone(ctx.makeUniqueZone('Park', b.buildingRect));
  ctx.makeWalkwayZones(map, b);

  // Done.
  return true;
}

/** C# `BaseTownGenerator.cs:83` / `:91` / `:110` — the three park constants. */
const PARK_TREE_CHANCE = 25;
const PARK_BENCH_CHANCE = 5;
const PARK_ITEM_CHANCE = 5;

/** C# `BaseMapGenerator.cs:528` `PARK_TREES`, Release 7-3. */
const PARK_TREES: readonly string[] = [GameImages.OBJ_TREE1, GameImages.OBJ_TREE2, GameImages.OBJ_TREE3, GameImages.OBJ_TREE4];

/** C# `BaseTownGenerator.cs:4589-4609` `MakeRandomParkItem`. District roller. */
function makeRandomParkItem(ctx: TownBuildingContext): Item {
  const randomItem = ctx.roller.roll(0, 8);
  switch (randomItem) {
    case 0: return makeItemSprayPaint(ctx.game.rules);
    case 1: return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BASEBALLBAT)!);
    case 2: return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SLP)!);
    case 3: return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_STA)!);
    case 4: return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SAN)!);
    case 5: return new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT)!);
    case 6: return makeItemCellPhone();
    case 7: return new ItemBarricadeMaterial(Models.items.get(ItemID.BAR_WOODEN_PLANK)!);
    default: throw new RangeError('unhandled item roll');
  }
}

// ── Factories ───────────────────────────────────────────────────────────────

/**
 * C# `BaseMapGenerator.cs:530` `MakeObjParkTree(DiceRoller)` — four tree sprites, and
 * the roll is the district's.
 */
function makeObjParkTree(roller: DiceRoller): MapObject {
  return makeObjTree(PARK_TREES[roller.roll(0, PARK_TREES.length)]!);
}

/**
 * C# `BaseMapGenerator.cs:535-543` `MakeObjTree`, Release 7-6.
 *
 * `DoorWindow.BASE_HITPOINTS * 20` — the Release 7-6 "*made breakable*" hit-point
 * bump. The port's own `protected makeObjTree` (`BaseMapGenerator.ts:691`) is the
 * vanilla `* 10`; this is the fork's, and `makeAnimalShelterBuilding` reached the same
 * conclusion.
 */
function makeObjTree(treeImageId: string): MapObject {
  const tree = new MapObject('tree', treeImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 20);
  tree.givesWood = true;
  return tree;
}

/**
 * C# `BaseMapGenerator.cs:617` `MakeObjBench`.
 *
 * **`isMovable` is *not* set**, even though the port's `protected makeObjBench`
 * (`BaseMapGenerator.ts:835`) sets it. `IsMovable` is Release 7-6 and the C#'s arm
 * carries `IsCouch`, `IsMaterialTransparent`, `JumpLevel`, `GivesWood`, `Weight` and
 * the doubled hit points but no `IsMovable` — so the C#'s own copies disagree with
 * each other about the same factory, and the one transcribed here is the one the mall
 * gets. Recorded rather than reconciled.
 */
function makeObjBench(benchImageId: string): MapObject {
  const bench = new MapObject('bench', benchImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 2);
  bench.isMaterialTransparent = true;
  bench.jumpLevel = 1;
  bench.isCouch = true;
  bench.isMovable = true;
  bench.givesWood = true;
  return bench;
}

/** C# `BaseMapGenerator.cs:860-870` `MakeObjPottedPlant`, Release 4's `IsWalkable`. */
function makeObjPottedPlant(pottedPlantImageId: string): MapObject {
  const plant = new MapObject('potted plant', pottedPlantImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, Math.floor(DoorWindow.BASE_HITPOINTS / 6));
  plant.isMaterialTransparent = true;
  plant.isMovable = true;
  plant.isWalkable = true; //@@MP (Release 4)
  plant.weight = 1;
  return plant;
}

/**
 * C# `BaseMapGenerator.cs:758` `MakeObjFireBarrel`, Release 7-6.
 *
 * Identical to `makeFireStationBuilding`'s copy (`:468`) and to the port's own
 * `protected` one. `isMetal` and `hoverDescription` are not fields on the port's
 * `MapObject`, so they are left off here as everywhere else.
 */
function makeObjFireBarrel(barrelImageId: string): Barrel {
  const barrel = new Barrel('receptacle', barrelImageId, MapObjectBreak.UNBREAKABLE, 0);
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true; // in case items were left there when the barrel was unlit
  barrel.isMovable = true;
  barrel.isWalkable = true;
  barrel.weight = 4;
  return barrel;
}

/** C# `BaseMapGenerator.cs:967` `MakeObjCheckout`, Release 5-3's `IsContainer`. */
function makeObjCheckout(checkoutImageId: string): MapObject {
  const checkout = new MapObject('checkout', checkoutImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 4);
  checkout.isMaterialTransparent = true;
  checkout.isContainer = true; //@@MP (Release 5-3)
  //JumpLevel = 1, //@@MP (Release 5-3)
  checkout.givesWood = true;
  return checkout;
}

/** C# `BaseMapGenerator.cs:915-925` `MakeObjBookshelves`. */
function makeObjBookshelves(bookshelvesImageId: string): MapObject {
  const bookshelves = new MapObject('bookshelves', bookshelvesImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
  bookshelves.isContainer = true;
  bookshelves.isPlural = true;
  bookshelves.givesWood = true;
  bookshelves.isMovable = true;
  bookshelves.weight = 10;
  return bookshelves;
}

/**
 * C# `BaseMapGenerator.cs:606-616` `MakeObjClothesDisplay`, Release 7-6.
 *
 * `isMovable` + the hover line is the whole point of this one — it is a clothes rail
 * you bump to change outfit — and `hoverDescription` is **not** a field on the port's
 * `MapObject`, so the mechanic is lost and only the flag survives. Recorded rather
 * than worked around.
 */
function makeObjClothesDisplay(shelfImageId: string): MapObject {
  const display = new MapObject('clothes display', shelfImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
  display.givesWood = true;
  display.isMovable = true;
  display.weight = 6;
  // HoverDescription = "Bump into it to change your outfit." - no such field.
  return display;
}

/**
 * C# `BaseMapGenerator.cs:1278-1288` `MakeObjWigsDisplay`, Release 7-6.
 *
 * The name `"wigs display"` is **load-bearing and not cosmetic**: the barber's
 * outer-row rewrite at `:10126` finds its shelves by comparing
 * `shopObj.TheName == "the wigs display"` and replaces them with chairs and basins.
 * Rename the string and the barber's back two rows stay wigs.
 */
function makeObjWigsDisplay(tableImageId: string): MapObject {
  const display = new MapObject('wigs display', tableImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
  display.isMaterialTransparent = true;
  display.givesWood = true;
  display.isMovable = true;
  display.weight = 2;
  // HoverDescription = "Bump into it to change your hairstyle." - no such field.
  return display;
}

/** C# `BaseMapGenerator.cs:871-882` `MakeObjTelevision`, Release 7-6's `JumpLevel`. */
function makeObjTelevision(televisionImageId: string): MapObject {
  const television = new MapObject('television', televisionImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, Math.floor(DoorWindow.BASE_HITPOINTS / 3));
  television.isMaterialTransparent = true;
  television.isMovable = true;
  television.weight = 3;
  television.jumpLevel = 1; //@@MP (Release 7-6)
  television.givesWood = true;
  return television;
}

/**
 * C# `BaseMapGenerator.cs:1227-1236` `MakeObjHouseholdMachine`.
 *
 * `name` is a *parameter*, and the three call sites pass `"washing machine"`,
 * `"dryer"` and `"dishwasher"` — so the map object's name (and therefore everything
 * the player is told about it) comes from the call site, not from the sprite. All three
 * are `isMetal` (Release 5-4), which the port's `MapObject` has no field for.
 */
function makeObjHouseholdMachine(machineImageId: string, name: string): MapObject {
  const machine = new MapObject(name, machineImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, DoorWindow.BASE_HITPOINTS * 6);
  machine.isMaterialTransparent = true;
  machine.jumpLevel = 1;
  machine.standOnFovBonus = true;
  return machine;
}

/** C# `BaseMapGenerator.cs:927-940` `MakeObjCouch`, Release 6-6's `IsCouch`. */
function makeObjCouch(couchImageId: string): MapObject {
  const couch = new MapObject('couch', couchImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 4);
  couch.isMaterialTransparent = true;
  couch.jumpLevel = 1;
  couch.givesWood = true;
  couch.isMovable = true;
  couch.isCouch = true; //@@MP (Release 6-6)
  return couch;
}

/** C# `BaseMapGenerator.cs:1208-1215` `MakeObjBathroomBasin`. */
function makeObjBathroomBasin(basinImageId: string): MapObject {
  const basin = new MapObject('basin', basinImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, DoorWindow.BASE_HITPOINTS * 2);
  basin.isMaterialTransparent = true;
  basin.isContainer = true;
  return basin;
}

/**
 * C# `BaseMapGenerator.cs:924-938` `MakeObjChair`.
 *
 * `Math.floor` on the hit points because the C#'s `DoorWindow.BASE_HITPOINTS / 3` is
 * `int / int`; the port's own copy writes the same guard for the same reason.
 */
function makeObjChair(chairImageId: string): MapObject {
  const chair = new MapObject('chair', chairImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, Math.floor(DoorWindow.BASE_HITPOINTS / 3));
  chair.isMaterialTransparent = true;
  chair.jumpLevel = 1;
  chair.givesWood = true;
  chair.isMovable = true;
  chair.weight = 1;
  return chair;
}

/** C# `BaseMapGenerator.cs:908-922` `MakeObjTable`. */
function makeObjTable(tableImageId: string): MapObject {
  const table = new MapObject('table', tableImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, DoorWindow.BASE_HITPOINTS);
  table.isMaterialTransparent = true;
  table.jumpLevel = 1;
  table.givesWood = true;
  table.isMovable = true;
  table.weight = 2;
  return table;
}

/** C# `BaseMapGenerator.cs:956-968` `MakeObjFridge`. */
function makeObjFridge(fridgeImageId: string): MapObject {
  const fridge = new MapObject('fridge', fridgeImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, DoorWindow.BASE_HITPOINTS * 6);
  fridge.isContainer = true;
  fridge.isMovable = true;
  fridge.weight = 10;
  return fridge;
}

/**
 * C# `BaseMapGenerator.cs:595-603` `MakeObjShelf`.
 *
* **`MapObjectFire.BURNABLE`, where the port's own `protected makeObjShelf`
 * (`BaseMapGenerator.ts:820`) passes `0`, i.e. `UNINFLAMMABLE`.** That is a
 * pre-existing port divergence from vanilla - and Release 7-6 moved the C#'s shelf to
 * `BURNABLE`, so the two now disagree in the other direction too. The C#'s value is
 * used, because a Stage 5 building is the fork's building; `makeBarBuilding` reached
 * the same call for the same factory. Recorded here because hoisting it onto the seam
 * has to settle it.
 */
function makeObjShelf(shelfImageId: string): MapObject {
  const shelf = new MapObject('shelf', shelfImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
  shelf.isContainer = true;
  shelf.givesWood = true;
  shelf.isMovable = true;
  shelf.weight = 6;
  return shelf;
}

/**
 * C# `BaseMapGenerator.cs:582` `MakeObjDisplayCar(DiceRoller)` — the mall's only reader
 * of the `CARS` table as a *whole* car.
 *
 * `MakeObjCar(..., MapObject.Break.UNBREAKABLE, 0)` at `:565-578`: unbreakable, **zero
 * hit points**, transparent, jumpable, movable, 100 kilos, stand-on FOV bonus, and
 * `IsMetal`. Eight of these in the dealership, one `roll(0, 4)` each on the district's
 * roller.
 */
function makeObjDisplayCar(roller: DiceRoller): Car {
  const CARS = [GameImages.OBJ_CAR1, GameImages.OBJ_CAR2, GameImages.OBJ_CAR3, GameImages.OBJ_CAR4];
  const car = new Car('display car', CARS[roller.roll(0, CARS.length)]!, MapObjectBreak.UNBREAKABLE, 0);
  car.breakState = MapObjectBreak.UNBREAKABLE;
  car.isMaterialTransparent = true;
  car.jumpLevel = 1;
  car.isMovable = true;
  car.weight = 100;
  car.standOnFovBonus = true;
  return car;
}

/**
 * C# `BaseMapGenerator.cs:590-593` `MakeObjAbandonedCar(DiceRoller)` — the car park's
 * reader of the same `CARS` table, Release 7-3.
 *
 * `MakeObjCar(..., MapObject.Break.UNBREAKABLE, roller.Roll(30, 98))` at `:565-578`, so
 * the flag block above is the C#'s except for two things this factory adds:
 *
 * - **`fuelUnits` is `roller.Roll(30, 98)`, not zero.** A display car gets an empty tank
 *   (`MakeObjDisplayCar` passes `0`) and an abandoned one gets 30-98 units, so a car park
 *   is worth siphoning and a dealership is not. `Car.MAX_FUEL_UNITS` is 99, so the roll
 *   can never quite fill one.
 * - **Two more dice per car** — the sprite's `Roll(0, 4)` and the fuel — on top of the
 *   20% that asked for the car at all.
 *
 * **The C#'s `CARS` table is re-spelled here rather than shared with
 * {@link makeObjDisplayCar}.** That is the same four ids and the same two-line read, and
 * a shared `const` would have been the tidier answer; the existing factory's header
 * already records it as "the mall's only reader of the `CARS` table as a *whole car*",
 * which stops being true either way it is spelled.
 */
function makeObjAbandonedCar(roller: DiceRoller): Car {
  const CARS = [GameImages.OBJ_CAR1, GameImages.OBJ_CAR2, GameImages.OBJ_CAR3, GameImages.OBJ_CAR4];
  const car = new Car('abandoned car', CARS[roller.roll(0, CARS.length)]!, MapObjectBreak.UNBREAKABLE, roller.roll(30, 98));
  car.breakState = MapObjectBreak.UNBREAKABLE;
  car.isMaterialTransparent = true;
  car.jumpLevel = 1;
  car.isMovable = true;
  car.weight = 100;
  car.standOnFovBonus = true;
  return car;
}

/**
 * C# `BaseMapGenerator.cs:956-965` `MakeObjCounter`, Release 5-3.
 *
 * The food court's twenty-four counters. Unusually for this file's furniture it is
 * **neither movable nor a container** and it has no weight of its own beyond the
 * default: it is a built-in fixture, four times a checkout's hit points, jumpable, and
 * standing on it widens your field of view — which is the only reason a player would
 * ever step on a counter.
 */
function makeObjCounter(counterImageId: string): MapObject {
  const counter = new MapObject('counter', counterImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 4);
  counter.jumpLevel = 1;
  counter.isMaterialTransparent = true;
  counter.givesWood = true;
  counter.standOnFovBonus = true;
  return counter;
}

/**
 * C# `BaseMapGenerator.cs:1238-1247` `MakeObjSeat`.
 *
 * A cinema seat: breakable and **burnable**, twice a base hit point, and **not**
 * movable — you cannot carry a cinema seat out of a cinema, which is what separates it
 * from {@link makeObjChair} next door in the food court.
 */
function makeObjSeat(seatImageId: string): MapObject {
  const seat = new MapObject('seat', seatImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS * 2);
  seat.isMaterialTransparent = true;
  seat.givesWood = true;
  seat.standOnFovBonus = true;
  seat.jumpLevel = 1;
  return seat;
}

/**
 * C# `BaseMapGenerator.cs:1249-1252` `MakeObjCinemaScreen`.
 *
 * **A single base hit point and nothing else** — no transparency, no wood, no jump
 * level, no stand-on bonus. The one object in this file with no flags at all, and the
 * C#'s own way of saying a screen is scenery: 43 of them get laid down in two runs and
 * none of them can be walked through, sat on, or used as fuel.
 */
function makeObjCinemaScreen(screenImageId: string): MapObject {
  return new MapObject('screen', screenImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
}

/** C# `BaseMapGenerator.cs:1217-1225` `MakeObjToilet` — jumpable, and standing on it gives FOV. */
function makeObjToilet(toiletImageId: string): MapObject {
  const toilet = new MapObject('toilet', toiletImageId, MapObjectBreak.BREAKABLE, MapObjectFire.UNINFLAMMABLE, DoorWindow.BASE_HITPOINTS);
  toilet.isMaterialTransparent = true;
  toilet.jumpLevel = 1;
  toilet.standOnFovBonus = true;
  return toilet;
}

/**
 * C# `BaseMapGenerator.cs:1038-1047` `MakeObjReceptionDesk`, Release 5-3's `IsContainer`.
 *
 * The cinema foyer hands this factory the **bank teller's sprite** (`:10408-10413`) — six
 * of them in a column — so the name the player is told is "a reception desk" and the
 * drawing is a bank counter. The C# does the same thing to the mall's registers, which
 * take `OBJ_CLINIC_DESK`.
 */
function makeObjReceptionDesk(receptionDeskImageId: string): MapObject {
  const desk = new MapObject('reception desk', receptionDeskImageId);
  desk.isContainer = true; //@@MP (Release 5-3)
  desk.jumpLevel = 1;
  desk.isMaterialTransparent = true;
  desk.standOnFovBonus = true;
  return desk;
}

/**
 * C# `BaseMapGenerator.cs:668-679` `MakeObjDrawer`.
 *
 * The one object in the cinema foyer that is not a couch: the ticket check at `(46, 29)`,
 * drawn with the church's `OBJ_LECTERN`. Six kilos, movable, container, jumpable — a
 * drawer you can pick up and empty, unlike the six reception desks either side of it.
 */
function makeObjDrawer(drawerImageId: string): MapObject {
  const drawer = new MapObject('drawer', drawerImageId, MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE, DoorWindow.BASE_HITPOINTS);
  drawer.isMaterialTransparent = true;
  drawer.jumpLevel = 1;
  drawer.isContainer = true;
  drawer.givesWood = true;
  drawer.isMovable = true;
  drawer.weight = 6;
  return drawer;
}

/**
 * C# `BaseMapGenerator.cs:477-486` `MakeObjIronRailing`, Release 7-6.
 *
 * The default `MapObject(name, imageID)` constructor, so **`UNBREAKABLE` with zero hit
 * points** — a railing you can neither break nor burn, only vault — plus transparency,
 * a jump level, `IsAn` (the indefinite article: "an iron railing") and `IsMetal`.
 *
 * `isMetal` *is* a field on the port's `MapObject` (`MapObject.ts:140`, added for the
 * fuel station's pumps after {@link makeObjHouseholdMachine} was written and documented
 * as not having one), so it is set here and is genuinely absent from that older factory.
 * The two disagree inside one file now, and the disagreement is recorded at both ends
 * rather than resolved: the older one is the ground floor's own shelf of electronics,
 * the newer one is this file's.
 */
function makeObjIronRailing(fenceImageId: string): MapObject {
  const railing = new MapObject('iron railing', fenceImageId);
  railing.isMaterialTransparent = true;
  railing.jumpLevel = 1;
  railing.isAn = true;
  railing.isMetal = true;
  return railing;
}

/**
 * C# `BaseMapGenerator.cs:789-795` `MakeObjPowerGenerator`, Release 5-7 — the whole of it
 * is one `IsMetal` on a `StateMapObject`.
 *
 * The car park's two power rooms get twenty-one of these each (see the
 * `generateShoppingMallParking` header), which makes this the third call site in the port
 * after the clinic's and the farm shed's. The three existing building copies
 * (`makeClinicBuilding.ts:462`, `makeFarmBuilding.ts:920`, `makeFireStationBuilding.ts:443`)
 * all say the same thing, and a fourth is the cost of a seam that has to be extended
 * rather than a private helper duplicated once.
 */
function makeObjPowerGenerator(offImageId: string, onImageId: string): PowerGenerator {
  const generator = new PowerGenerator('power generator', offImageId, onImageId);
  generator.isMetal = true; //@@MP (Release 5-4)
  return generator;
}

// ── Item factories reached through `MakeRandomMallShopItem` ──────────────────

/** C# `BaseMapGenerator.cs:1203-1205` `MakeItemCellPhone`. */
function makeItemCellPhone(): Item {
  return new ItemTracker(Models.items.get(ItemID.TRACKER_CELL_PHONE)!);
}

/**
 * C# `BaseMapGenerator.cs:1207-1244` `MakeItemSprayPaint`.
 *
 * Four paints and a colour roll — and **the roll is on `rules`, not `ctx.roller`**,
 * which is the C#'s `m_Game.Rules`. `makeJunkyard.ts:603` takes the opposite view and
 * documents it at length; this file follows `BarBuilding` instead, because the two
 * alcohol-adjacent factories (`makeItemAlcohol`, `makeRandomMallShopItem`) already
 * commit to the rules roller and a half-and-half seam is harder to reason about than
 * either answer. `isForbiddenToAI` (Release 7-6, "no point in them having these") is
 * set.
 */
function makeItemSprayPaint(rules: DiceRoller): Item {
  const paints = [ItemID.SPRAY_PAINT1, ItemID.SPRAY_PAINT2, ItemID.SPRAY_PAINT3, ItemID.SPRAY_PAINT4];
  const it = new ItemBarricadeMaterial(Models.items.get(paints[rules.roll(0, 4)])!);
  it.isForbiddenToAI = true;
  return it;
}

// ── The four items a food-court counter carries, and the cinema's snack bar ───

/**
 * C# `BaseMapGenerator.cs:2238-2245` `MakeItemCookedChicken`, Release 7-6.
 *
 * **No dice at all** — the only one of the five factories below that rolls nothing, and
 * the only one with arithmetic. `freshUntil` is the plain
 * `WorldTime.TURNS_PER_DAY * BestBeforeDays` offset from the current turn, which is the
 * same shape `MakeItemRawChicken` (`:2229-2236`) has and *not* the half-to-full roll
 * {@link makeItemGroceries} does.
 *
 * The C#'s `ItemFood(model, freshUntil, true, true)` has its two booleans as the
 * raw/cooked pair, and those live on the *model* in the port
 * (`ItemFoodModel.canBeCooked`) rather than on the instance, so only the `freshUntil`
 * half is representable — cooked chicken is not cookable, which is what
 * `COOKED_CHICKEN`'s model row already says.
 *
 * `// FIXME: should be map local time.` on `:2240` is the C#'s and is not ported: the
 * port reads `Session.get().worldTime.turnCounter`, which is the same global clock the
 * C# is complaining about.
 */
function makeItemCookedChicken(): Item {
  const model = Models.items.get(ItemID.FOOD_COOKED_CHICKEN) as ItemFoodModel;
  const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
  const freshUntil = Session.get().worldTime.turnCounter + max;
  return new ItemFood(model, freshUntil);
}

/** C# `BaseMapGenerator.cs:2089-2092` `MakeItemFryingPan` — no quantity, so the model's. */
function makeItemFryingPan(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FRYING_PAN)!);
}

/** C# `BaseMapGenerator.cs:2054-2057` `MakeItemCleaver` — no quantity, so the model's. */
function makeItemCleaver(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_CLEAVER)!);
}

/** C# `BaseMapGenerator.cs:2069-2072` `MakeItemKitchenKnife` — no quantity, so the model's. */
function makeItemKitchenKnife(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_KITCHEN_KNIFE)!);
}

/**
 * C# `BaseMapGenerator.cs:1848-1854` `MakeItemSnackBar`, Release 7-1.
 *
 * `Quantity = m_Rules.Roll(1, …StackingLimit)` — **on `m_Rules`**, so `rules` and not
 * `ctx.roller`, exactly like {@link makeItemMagazines} and `makeItemSprayPaint` above.
 * One cinema seat in five carries one, so the twelve `rowStarts` of `:10454` cost at
 * most 235 rules dice and at least none.
 */
function makeItemSnackBar(rules: DiceRoller): Item {
  const model = Models.items.get(ItemID.FOOD_SNACK_BAR)!;
  const snackBar = new ItemFood(model);
  snackBar.quantity = rules.roll(1, model.stackingLimit);
  return snackBar;
}

// ── Small helpers ───────────────────────────────────────────────────────────

/**
 * C# `Map.RemoveMapObjectAt` (`Data/Map.cs:890`), for the mall's twenty entrance
 * tiles. The port's `Map` has `removeMapObject` but no by-position form.
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const mapObj = map.getMapObjectAt(x, y);
  if (mapObj === null) return;
  map.removeMapObject(mapObj);
}

/** `Tile.AddDecoration`, which returns void and can be handed an out-of-bounds point. */
function addDecoration(map: GameMap, pt: Point, imageId: string): void {
  map.getTileAt(pt.x, pt.y)?.addDecoration(imageId);
}

/** `Tile.Model.IsWalkable`, and out of bounds reads `false` rather than throwing. */
function tileIsWalkable(map: GameMap, x: number, y: number): boolean {
  return map.getTileAt(x, y)?.model.isWalkable ?? false;
}