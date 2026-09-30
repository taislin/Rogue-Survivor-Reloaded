/**
 * `Feature.FuelStation` — C# `BaseTownGenerator.cs:2811-3179` `MakeFuelStation`,
 * plus the two `Place*` helpers at `:3166-3179`.
 *
 * The only building in the C# with a *window* rather than a bound in one
 * dimension: an inside rect of 8x8 to 11x11 (`:2816-2819`). Every other generator
 * asks for a minimum, because every other one is a building that wants room; this
 * is the one that wants room *and* wants the forecourt the forecourt costs, which
 * is why it sits in the parks cascade and not the business one — it is built from
 * the leftovers, and the leftovers are the wrong shape most of the time.
 *
 * ## The dispatch is the second slot of the parks `&&` chain
 *
 * C# `:555-562`:
 *
 * ```csharp
 * if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
 * {
 *     if (MakeFuelStation(map, b, fuelStationsPlaced)) { ++fuelStationsPlaced; goto Completed; }
 *     if (!fireStationPlaced && MakeFireStation(map, b)) { … goto Completed; }
 *     int rolled = m_DiceRoller.Roll(0, 99);
 * ```
 *
 * So it shares the one `RollChance(ParkBuildingChance)` that gates the whole
 * region, sits **after** the two sports courts and **before** the fire station,
 * and is reached for every block that got past the courts. That last part is why
 * `BaseTownGenerator.makeFuelStation` is folded into the parks loop rather than
 * given a pass of its own at the seam: a pass would roll `parkBuildingChance` for
 * itself, spend a second die per block, and be offered the blocks that lost the
 * first one — which the C# never offers it.
 *
 * ## Both `doorside` switches have a hole, and the hole is unreachable
 *
 * `:2839` is `int doorside = m_DiceRoller.Roll(0, 4);`, and the switches at `:2841`
 * and `:3064` each handle `case 0..3` with **no default**. Read like a half-open
 * range that looks like a five-way choice missing its fifth arm: a fuel station
 * with no forecourt, no doors and no pumps, one time in five.
 *
 * It is not that. `DiceRoller.Roll` is `m_Rng.Next(min, max)`
 * (`Engine/DiceRoller.cs:37-45`), and .NET's `Random.Next(min, max)` is
 * **exclusive of max**, so `Roll(0, 4)` yields 0, 1, 2, 3 and `case 4` is dead
 * code. The port's `DiceRoller.roll` is `[min, max)` for the same reason
 * (`DiceRoller.ts:23-29`).
 *
 * **So the missing `default` is load-bearing documentation of the roll's range and
 * must not be "fixed".** Adding one would be harmless today and would paper over
 * the fact that these two switches are total *only* because the roll is half-open;
 * changing either to `roll(0, 5)`, or to an inclusive roller, would then silently
 * produce a fuel station with no way in. Both switches are written here with their
 * hole intact and with no `default`, and the reachability argument is recorded at
 * each.
 *
 * ## `fuelStationsLimit` divides before it multiplies
 *
 * `:2820` is
 * `double fuelStationsLimit = Math.Round(((double)(map.Width / 10)) / 2.5);`
 * The cast is applied to the *result* of `map.Width / 10`, not to `map.Width`, and
 * both operands are `int` — so this is **integer division that truncates**, then a
 * widening cast, then a real division by 2.5. `Math.floor` is what keeps it; a
 * faithful-looking `(map.width / 10) / 2.5` in TypeScript would keep the fraction
 * and move the cap on most map widths.
 *
 * `Math.round` stands in for `Math.Round` even though C#'s is banker's rounding:
 * the value rounded is `trunc(width / 10) / 2.5 = n * 0.4`, and `n * 2/5` can never
 * land exactly on a half (`4n - 10m = 5` has no integer solution), so the two
 * roundings never disagree here.
 *
 * ## The counter resets per district and the cap does not
 *
 * `fuelStationsPlaced` is declared at `:548`, inside the parks region, which is
 * inside the per-district loop; `fuelStationsLimit` is computed from `map.Width`,
 * the *whole* map. So each district gets a fresh allowance of the same map-wide
 * number rather than a share of it, and a map gets more fuel stations than the
 * comment at `:2820` claims ("cap the number of stations per map"). Both halves are
 * kept: the counter is keyed on the district's roller below, and the cap still
 * reads the whole map's width.
 *
 * ## The forecourt is three rows or columns of asphalt, and the C# writes it four
 * ## ways that all compute the same strip
 *
 * `:2854`, `:2906`, `:2958` and `:3010` build the forecourt with three different
 * origins and two different index expressions (`h = (bBottom + y) - 3` for south,
 * `g = (bRight + x) - 3` for east). They agree, because `Rect.bottom` / `Rect.right`
 * are exclusive exactly as `System.Drawing.Rectangle`'s are (`Rect.ts:16-17`), so
 * `b.bottom - 3 .. b.bottom - 1` is the three rows inside the wall. The four arms
 * are written as the C# writes them rather than factored into one loop; the
 * arithmetic that makes them agree is the fact worth being able to check, and
 * {@link forecourt} says so where the three statements it does share live.
 *
 * ## The pump row is the same on all four sides
 *
 * `PlaceFuelPump` (`:3175`) sets `FLOOR_CONCRETE` and then places the pump, and
 * each arm spells out the intervening tiles as explicit
 * `SetTileModelAt(FLOOR_CONCRETE)` calls. The call *order* differs between north
 * (`:2885-2891`) and south (`:2937-2943`) but the finished row does not: pumps at
 * `mid - 3`, `mid`, `mid + 3` with bare concrete between, seven tiles across, one
 * row in from the front wall. Kept literally, order included, since it costs
 * nothing and the alternative hides it.
 *
 * ## `RemoveMapObjectAt` and the cars
 *
 * `:2850`, `:2902`, `:2954`, `:3006` clear one tile for the price board and the
 * forecourt loops clear their whole strip: the C# is undoing the parked cars that
 * `addWreckedCarsOutside` has already dropped, so a forecourt does not come with a
 * car in it. The port's `Map` has `removeMapObject` but no by-position form, so
 * {@link removeMapObjectAt} stands in for `Data/Map.cs:890`, as it does in
 * `makeFireStationBuilding`.
 *
 * ## What the shelves stock, and why the shelf item is seamed
 *
 * `:3142-3151` drops a siphon kit at 15% and a general shop item otherwise. The
 * general item is `MakeShopGeneralItem` (`BaseTownGenerator.cs:7607`), a `roll(0, 6)`
 * over six more `protected` factories that reach the generator's own roller — far
 * too much to copy into a building file with a context and no `this`, so it is on
 * `TownBuildingContext` instead. `ctx.makeObjFuelPump` is on the seam for the same
 * reason and the stronger one: `Feature.TileFires` still owes `ExplodeFuelPump`
 * (`RogueGame.cs:20123`), and a second copy of the pump's 800 hitpoints is a second
 * place for the two to disagree.
 */

import { Item } from '@data/Item';
import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Rect } from '@engine/Rect';
import { Board, DoorWindow } from '@engine/mapobjects/MapObjects';
import { Session } from '@engine/Session';
import { ItemSprayPaint } from '@engine/items/ItemMisc';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * C# `:3150`. `RollChance(15) ? MakeItemSiphonKit() : MakeShopGeneralItem()`.
 *
 * An inline literal in the C#, lifted here as every other roll in this project is
 * lifted: a literal buried in a lambda is a literal nobody finds when they come
 * looking for the dice this method spends.
 */
const SIPHON_KIT_ON_SHELF_CHANCE = 15;

/**
 * C# `:2851`, `:2903`, `:2955`, `:3007` — the same board four times, verbatim down
 * to the prices. It is a `string[]` in the C# because `Board` takes one and the
 * fuel station passes exactly one line; the array is not a list of prices to be
 * read, it is a one-element message.
 */
const PRICE_BOARD_TEXT = ['Super: 1.17, Regular: 1.14'];

// ── Per-district state ─────────────────────────────────────────────────────────

/**
 * `fuelStationsPlaced` in the C# is an `int` the parks region declares at `:548`
 * and resets for every district; `TownBuildingContext` has no place for a `ref`.
 * Keying it on the district's `DiceRoller` gives it exactly the lifetime the C#'s
 * local had and keeps two generators in one process from sharing a count. Same
 * shape and reasoning as `fireStationBuilt` in `./makeFireStationBuilding` and
 * `libraryBuilt` in `./makeLibraryBuilding`.
 */
let fuelStationsPlaced: { roller: DiceRoller; count: number } | null = null;

// ── The C# method ─────────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:2811` `MakeFuelStation(map, b, fuelStationsPlaced)`.
 *
 * Returns `true` when the block became a fuel station, which is how `:557`'s
 * `if (MakeFuelStation(…))` tells the parks loop the block is finished with.
 *
 * The count is incremented by the *caller* in the C# — `:559`, inside the `if`,
 * before `goto Completed` — and by the line below here instead. The two are
 * equivalent because every path past the limit check returns `true` and none of
 * them can fail afterwards, so there is no interleaving in which the C# would
 * increment and this would not. Mutating it in here is the same choice
 * `makeFireStationBuilding` and `makeLibraryBuilding` make with their flags, and
 * it keeps the per-district lifetime in one place instead of splitting the state
 * across the seam.
 */
export function makeFuelStationBuilding(ctx: TownBuildingContext): boolean {
  // Behind `Feature.FuelStation` from the first statement, and it has to precede
  // the suitability checks: under Classic a fuel station is not a cosmetic
  // difference, it is a `Roll(0, 4)` the reference district never spends.
  if (!hasFeature(Session.get().ruleset, Feature.FuelStation)) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:2816-2819`. A window on both axes, and the only one in the C#: `>= 8`
  // because the forecourt eats four tiles off one side, `<= 11` because a larger
  // inside rect would leave shop floor the generator has nothing to put in.
  if (b.insideRect.width < 8 || b.insideRect.width > 11) return false;
  if (b.insideRect.height < 8 || b.insideRect.height > 11) return false;

  // C# `:2820`. `map.Width / 10` is `int / int` and truncates; see the module
  // header on why `Math.floor` is not optional here.
  const fuelStationsLimit = Math.round(Math.floor(map.width / 10) / 2.5);

  if (fuelStationsPlaced === null || fuelStationsPlaced.roller !== roller) {
    fuelStationsPlaced = { roller, count: 0 };
  }
  // C# `:2821`, tested as `(double)fuelStationsPlaced >= fuelStationsLimit`. The
  // cast is on the counter and is there only so the C# could compare an `int`
  // against a `double` without an implicit-conversion warning.
  if (fuelStationsPlaced.count >= fuelStationsLimit) return false;
  fuelStationsPlaced.count++;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:2827-2829`. The `isInside` decorator goes on the floor fill rather than
  // the walls for the reason `makeFireStationBuilding` and `makeChurchBuilding`
  // put it there: it is what makes the shop dark at night, and it leaves the
  // doorway reading as a hole in an outdoor wall from the street. Step 2 then
  // *takes it back off* the forecourt, which is why the forecourt sets
  // `IsInside = false` at `:2863` and its eleven siblings rather than merely
  // leaving the tile alone.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_FUEL_STATION)!, b.buildingRect);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!, b.insideRect, (tile) => {
    tile.isInside = true;
  });

  ///////////////////////////////
  // 2. Entry door with shop ids, driveway and forecourt
  ///////////////////////////////
  // C# `:2835-2836`. `b.Rectangle`'s centre rather than the building rect's, and
  // the same choice `makeFireStationBuilding` makes: the price board goes on the
  // *outer* edge one tile past the wall, so the midpoint has to be the block's.
  const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);

  // C# `:2839`. **Half-open**, so 0..3 — see the module header on why the missing
  // `case 4` below is dead code rather than a bug.
  const doorside = roller.roll(0, 4);

  switch (doorside) {
    case 0: {
      // north. C# `:2843-2893`.
      // Driveways: two 3x1 strips off the top edge. `TileRectangle` first,
      // `RemoveMapObjectAt` second, and the order matters — the C# is careful
      // about it because the board goes where the car was.
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.left, b.buildingRect.top - 1, 3, 1)
      );
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.right - 3, b.buildingRect.top - 1, 3, 1)
      );
      removeMapObjectAt(map, midX, b.buildingRect.top - 1);
      ctx.mapObjectPlace(map, midX, b.buildingRect.top - 1, makeObjBoard(PRICE_BOARD_TEXT));

      forecourt(ctx, new Rect(b.buildingRect.left, b.buildingRect.top, b.buildingRect.width, 3));

      // Front wall, three rows down, and `IsInside` off so the strip reads as
      // outdoors from the forecourt side.
      frontWallNorth(ctx);

      // Doors and signage. The two signboards sit at `midX +/- 2` with three glass
      // doors between, so the front reads as a shop front.
      const wallY = b.buildingRect.top + 3;
      addDecoration(map, midX + 2, wallY, GameImages.DECO_SHOP_FUEL_STATION);
      placeFuelStationDoor(ctx, midX + 1, wallY);
      placeFuelStationDoor(ctx, midX, wallY);
      placeFuelStationDoor(ctx, midX - 1, wallY);
      addDecoration(map, midX - 2, wallY, GameImages.DECO_SHOP_FUEL_STATION);

      // Pumps. Seven tiles at `midX - 3 .. midX + 3`: concrete, concrete, pump,
      // pump, concrete, concrete, pump. The C# interleaves the bare-concrete
      // `SetTileModelAt` calls between the three `PlaceFuelPump` calls; written as
      // two runs here because the row is the same as the south arm's and only the
      // call order differs.
      placeFuelPump(ctx, midX - 3, b.buildingRect.top + 1);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(midX - 2, b.buildingRect.top + 1, 2, 1)
      );
      placeFuelPump(ctx, midX, b.buildingRect.top + 1);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(midX + 1, b.buildingRect.top + 1, 2, 1)
      );
      placeFuelPump(ctx, midX + 3, b.buildingRect.top + 1);
      break;
    }
    case 1: {
      // south. C# `:2895-2945`. `buildingRect.bottom` is exclusive (`Rect.ts:17`),
      // so the driveways sit on the three tiles *below* the building, at `bottom`.
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.left, b.buildingRect.bottom, 3, 1)
      );
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.right - 3, b.buildingRect.bottom, 3, 1)
      );
      removeMapObjectAt(map, midX, b.buildingRect.bottom);
      ctx.mapObjectPlace(map, midX, b.buildingRect.bottom, makeObjBoard(PRICE_BOARD_TEXT));

      forecourt(ctx, new Rect(b.buildingRect.left, b.buildingRect.bottom - 3, b.buildingRect.width, 3));

      const wallY = b.buildingRect.bottom - 4;
      frontWall(ctx, new Rect(b.buildingRect.left, wallY, b.buildingRect.width, 1));

      // Signage mirrored from the north arm — the boards are at `midX - 2` and
      // `midX + 2` here, the opposite order, which the C# writes out rather than
      // sharing.
      addDecoration(map, midX - 2, wallY, GameImages.DECO_SHOP_FUEL_STATION);
      placeFuelStationDoor(ctx, midX - 1, wallY);
      placeFuelStationDoor(ctx, midX, wallY);
      placeFuelStationDoor(ctx, midX + 1, wallY);
      addDecoration(map, midX + 2, wallY, GameImages.DECO_SHOP_FUEL_STATION);

      // Same seven-tile row as north, two rows in from the bottom.
      placeFuelPump(ctx, midX - 3, b.buildingRect.bottom - 2);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(midX - 2, b.buildingRect.bottom - 2, 2, 1)
      );
      placeFuelPump(ctx, midX, b.buildingRect.bottom - 2);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(midX + 1, b.buildingRect.bottom - 2, 2, 1)
      );
      placeFuelPump(ctx, midX + 3, b.buildingRect.bottom - 2);
      break;
    }
    case 2: {
      // west. C# `:2947-2997`.
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.left - 1, b.buildingRect.top, 1, 3)
      );
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.left - 1, b.buildingRect.bottom - 3, 1, 3)
      );
      removeMapObjectAt(map, b.buildingRect.left - 1, midY);
      ctx.mapObjectPlace(map, b.buildingRect.left - 1, midY, makeObjBoard(PRICE_BOARD_TEXT));

      forecourt(ctx, new Rect(b.buildingRect.left, b.buildingRect.top, 3, b.buildingRect.height));

      const wallX = b.buildingRect.left + 3;
      frontWall(ctx, new Rect(wallX, b.buildingRect.top, 1, b.buildingRect.height));

      addDecoration(map, wallX, midY - 2, GameImages.DECO_SHOP_FUEL_STATION);
      placeFuelStationDoor(ctx, wallX, midY - 1);
      placeFuelStationDoor(ctx, wallX, midY);
      placeFuelStationDoor(ctx, wallX, midY + 1);
      addDecoration(map, wallX, midY + 2, GameImages.DECO_SHOP_FUEL_STATION);

      // A *column* this time: pumps at `midY - 3`, `midY`, `midY + 3`, in the
      // column `left + 1`.
      placeFuelPump(ctx, b.buildingRect.left + 1, midY - 3);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(b.buildingRect.left + 1, midY - 2, 1, 2)
      );
      placeFuelPump(ctx, b.buildingRect.left + 1, midY);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(b.buildingRect.left + 1, midY + 1, 1, 2)
      );
      placeFuelPump(ctx, b.buildingRect.left + 1, midY + 3);
      break;
    }
    case 3: {
      // east. C# `:2999-3049`.
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.right, b.buildingRect.top, 1, 3)
      );
      ctx.tileRectangle(
        map,
        Models.tiles.get(TileID.FLOOR_ASPHALT)!,
        new Rect(b.buildingRect.right, b.buildingRect.bottom - 3, 1, 3)
      );
      removeMapObjectAt(map, b.buildingRect.right, midY);
      ctx.mapObjectPlace(map, b.buildingRect.right, midY, makeObjBoard(PRICE_BOARD_TEXT));

      forecourt(ctx, new Rect(b.buildingRect.right - 3, b.buildingRect.top, 3, b.buildingRect.height));

      const wallX = b.buildingRect.right - 4;
      frontWall(ctx, new Rect(wallX, b.buildingRect.top, 1, b.buildingRect.height));

      addDecoration(map, wallX, midY - 2, GameImages.DECO_SHOP_FUEL_STATION);
      placeFuelStationDoor(ctx, wallX, midY - 1);
      placeFuelStationDoor(ctx, wallX, midY);
      placeFuelStationDoor(ctx, wallX, midY + 1);
      addDecoration(map, wallX, midY + 2, GameImages.DECO_SHOP_FUEL_STATION);

      placeFuelPump(ctx, b.buildingRect.right - 2, midY - 3);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(b.buildingRect.right - 2, midY - 2, 1, 2)
      );
      placeFuelPump(ctx, b.buildingRect.right - 2, midY);
      ctx.tileFill(
        map,
        Models.tiles.get(TileID.FLOOR_CONCRETE)!,
        new Rect(b.buildingRect.right - 2, midY + 1, 1, 2)
      );
      placeFuelPump(ctx, b.buildingRect.right - 2, midY + 3);
      break;
    }
    // No `default`, deliberately. The C#'s switch at `:2841` has none either, and
    // `Roll(0, 4)` is half-open, so 0..3 is total. See the module header: adding
    // a `default` here would be harmless today and would hide the fact that this
    // switch is only exhaustive because the roll is.
  }

  //////////////////////////////////////////
  // 3. Make sections alleys with displays.
  //////////////////////////////////////////
  const { rect: alleysRect, horizontalAlleys } = makeAlleys(b, doorside);

  ctx.mapObjectFill(map, alleysRect, (pt) => {
    // C# `:3099-3102`. Every *other* tile along the alley's short axis gets a
    // shelf, so the rows read as gondolas rather than a wall of shelving.
    const addShelf = horizontalAlleys
      ? (pt.y - alleysRect.top) % 2 === 1
      : (pt.x - alleysRect.left) % 2 === 1;
    return addShelf ? makeObjShelf(GameImages.OBJ_SHOP_SHELF) : null;
  });

  ///////////
  // 4. Add register
  ///////////
  // C# `:3115-3135`. One register, and only on a tile with five walls around it —
  // a real corner. The fire extinguisher is dropped on the *same* tile before the
  // register goes over it, so it ends up under the counter.
  let placedRegister = false;
  ctx.mapObjectFill(map, b.insideRect, (pt) => {
    if (!map.isWalkable(pt.x, pt.y)) return null;
    const tile = map.getTileAt(pt.x, pt.y);
    if (tile === null || !tile.isInside) return null;
    if (ctx.countAdjWalls(map, pt.x, pt.y) < 5) return null;

    if (!placedRegister) {
      map.dropItemAt(makeItemFireExtinguisher(), pt);
      placedRegister = true;
      return makeObjCheckout(GameImages.OBJ_CASH_REGISTER);
    }
    return null;
  });

  ///////////////////////////
  // 5. Add items to shelves.
  ///////////////////////////
  // C# `:3142-3151`. The predicate is the shelf's *image*, not its type, exactly
  // as the C# has it — so a shelf from another building sharing the sprite would
  // also stock, which is the C#'s behaviour and not worth correcting here.
  ctx.itemsDrop(
    map,
    b.insideRect,
    (pt) => map.getMapObjectAt(pt.x, pt.y)?.imageId === GameImages.OBJ_SHOP_SHELF,
    () => (roller.rollChance(SIPHON_KIT_ON_SHELF_CHANCE) ? makeItemSiphonKit() : ctx.makeShopGeneralItem())
  );

  ///////////
  // 6. Zone
  ///////////
  // C# `:3157-3160`. `Fuel station`, capitalised as the C# spells it, and the
  // walkway zones after it — every one of the fourteen does this pair.
  map.addZone(ctx.makeUniqueZone('Fuel station', b.buildingRect));
  ctx.makeWalkwayZones(map, b);

  // Done
  return true;
}

// ── Alleys ────────────────────────────────────────────────────────────────────

/**
 * C# `:3058-3092`, both `doorside` switches and the `FromLTRB`.
 *
 * `Rectangle.FromLTRB(startX, startY, endX, endY)` sets `Right` and `Bottom`
 * directly, so the rect is `width = endX - startX` — end-exclusive, the same
 * convention `Rect` already has (`Rect.ts:16-17`). Note what that makes the range:
 * `endX` starts at `insideRect.right`, which is *one past* the inside rect, so on
 * the un-forecourted axis the alleys run one tile beyond the shop floor. That is
 * the C#, and it is why the shelf fill can reach a tile the walls were not drawn
 * on.
 *
 * The switch sets `horizontalAlleys` *and* pulls in by four on the forecourt's
 * axis in the same arm; the trim by one on the other axis is the `if` at `:3082`.
 * Both are reproduced rather than merged, because the two `switch (doorside)`es in
 * the C# are separate statements and a reader checking one against the other
 * should find them identical.
 *
 * No `default`, no `case 4`, same as everywhere else in this file: `roll(0, 4)` is
 * half-open, so the switch is total.
 */
function makeAlleys(
  b: TownBuildingContext['block'],
  doorside: number
): { rect: Rect; horizontalAlleys: boolean } {
  // C# `:3058-3061`.
  let startX = b.insideRect.left;
  let startY = b.insideRect.top;
  let endX = b.insideRect.right;
  let endY = b.insideRect.bottom;

  // C# `:3063`. The initialiser is what a missing case would fall back to.
  let horizontalAlleys = false;
  switch (doorside) {
    case 0: // north
      horizontalAlleys = true;
      startY += 4; // account for the forecourt
      break;
    case 1: // south
      horizontalAlleys = true;
      endY -= 4;
      break;
    case 2: // west
      startX += 4;
      break;
    case 3: // east
      endX -= 4;
      break;
  }

  // C# `:3082-3091`.
  if (horizontalAlleys) {
    startX += 1;
    endX -= 1;
  } else {
    startY += 1;
    endY -= 1;
  }

  return { rect: new Rect(startX, startY, endX - startX, endY - startY), horizontalAlleys };
}

// ── The forecourt and the front wall ───────────────────────────────────────────

/**
 * C# `:2855-2866` and its three twins at `:2907`, `:2959`, `:3011`.
 *
 * Asphalt over the strip, `IsInside` explicitly **false** even though step 1 just
 * set it true everywhere inside the building — the forecourt is outdoors, and the
 * night-darkening from step 1 must not reach it — and every map object removed, so
 * the strip does not come with the cars `addWreckedCarsOutside` parked on it.
 *
 * One helper for four arms whose index arithmetic differs (`h = (bBottom + y) - 3`
 * south, `g = (bRight + x) - 3` east, plain `bLeft + x` north and west). They agree
 * because the caller has already resolved each strip's origin, which is the only
 * part that differs; see the module header.
 */
function forecourt(ctx: TownBuildingContext, rect: Rect): void {
  const map = ctx.map;
  const asphalt = Models.tiles.get(TileID.FLOOR_ASPHALT)!;
  ctx.doForEachTile(map, rect, (pt) => {
    map.setTileModelAt(pt.x, pt.y, asphalt);
    setNotInside(map, pt.x, pt.y);
    removeMapObjectAt(map, pt.x, pt.y);
  });
}

/**
 * C# `:2869-2875`, the north arm, which is the one written out as a named
 * function because it is the first and the reader wants the shape before three
 * copies of it. South, west and east inline the same four statements through
 * {@link frontWall}, whose rect they each compute from a different corner.
 */
function frontWallNorth(ctx: TownBuildingContext): void {
  const r = ctx.block.buildingRect;
  frontWall(ctx, new Rect(r.left, r.top + 3, r.width, 1));
}

/**
 * C# `:2869-2875` and the same four statements at `:2921-2927`, `:2973-2979`,
 * `:3025-3031`: wall tile, then `IsInside = false` over the same rect.
 *
 * `IsInside` goes off because the C# turned it on for the whole inside rect in
 * step 1 and this strip is the building's face — it should read as outdoors from
 * the forecourt, which is the other half of why the forecourt does the same.
 */
function frontWall(ctx: TownBuildingContext, rect: Rect): void {
  const map = ctx.map;
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_FUEL_STATION)!, rect);
  ctx.doForEachTile(map, rect, (pt) => {
    setNotInside(map, pt.x, pt.y);
  });
}

// ── The two `Place*` helpers ──────────────────────────────────────────────────

/**
 * C# `PlaceFuelStationDoor` — `BaseTownGenerator.cs:3166-3173`.
 *
 * Removes whatever is there first, which is the forecourt's doing: the three door
 * tiles are inside the front wall and step 2's forecourt loop has already been
 * over them, so this is belt-and-braces in the C# and kept as such.
 */
function placeFuelStationDoor(ctx: TownBuildingContext, x: number, y: number): void {
  const map = ctx.map;
  removeMapObjectAt(map, x, y);
  ctx.placeDoor(map, x, y, Models.tiles.get(TileID.FLOOR_TILES)!, ctx.makeObjGlassDoor());
}

/**
 * C# `PlaceFuelPump` — `BaseTownGenerator.cs:3175-3179`.
 *
 * Concrete first, pump second, and the concrete is not cosmetic: the pump is
 * `UNINFLAMMABLE` but *breakable*, so the tile under it is forecourt-matching
 * concrete rather than whatever the alley fill left. The pump itself is
 * `ctx.makeObjFuelPump`, the seam's — one copy of the 800 hitpoints, shared with
 * the `ExplodeFuelPump` that `Feature.TileFires` still owes.
 */
function placeFuelPump(ctx: TownBuildingContext, x: number, y: number): void {
  ctx.map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
  ctx.mapObjectPlace(ctx.map, x, y, ctx.makeObjFuelPump(GameImages.OBJ_FUEL_PUMP));
}

// ── Small tile helpers ────────────────────────────────────────────────────────

/**
 * C# `map.GetTileAt(x, y).IsInside = false`, as at `:2863`, `:2874`, `:2915`,
 * `:2926`, `:2966`, `:2977`, `:3018`, `:3029`.
 *
 * The C# would throw on a tile outside the map. These coordinates are all derived
 * from the building rect so they are in bounds, but the null check is the
 * difference between a generator that cannot crash a district and one that can.
 */
function setNotInside(map: GameMap, x: number, y: number): void {
  const tile = map.getTileAt(x, y);
  if (tile === null) return;
  tile.isInside = false;
}

/** C# `AddDecoration`, as at `:2878` and its eleven siblings. */
function addDecoration(map: GameMap, x: number, y: number, imageId: string): void {
  const tile = map.getTileAt(x, y);
  if (tile === null) return;
  tile.addDecoration(imageId);
}

// ── Transcribed factories ─────────────────────────────────────────────────────

/**
 * C# `BaseMapGenerator.cs:797` `MakeObjBoard`.
 *
 * The port's own `BaseMapGenerator.makeObjBoard` (`:903`) is identical, but it is
 * not on the seam and this file has a context rather than a `this`. The image is
 * fixed here rather than passed, because the C#'s only caller of this shape is the
 * fuel station and the four call sites all name the same board.
 */
function makeObjBoard(text: string[]): MapObject {
  return new Board('board', GameImages.OBJ_FUEL_PRICE_BOARD, text);
}

/**
 * C# `BaseMapGenerator.cs:595` `MakeObjShelf`.
 *
 * **`BURNABLE` is the fork's and the port's `protected makeObjShelf` is not.** The
 * same divergence and the same local copy as `BarBuilding.ts:421`, for the same
 * reason: a Stage 5 building is the fork's building. Reconciling the two is the
 * seam's job — `makeObjShelf` would have to move onto `TownBuildingContext` and
 * change `BaseMapGenerator.ts:717` in the same commit, which is a different change
 * from this one and would reach Classic shops.
 */
function makeObjShelf(imageId: string): MapObject {
  const shelf = new MapObject(
    'shelf',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS
  );
  shelf.isContainer = true;
  shelf.givesWood = true;
  shelf.isMovable = true;
  shelf.weight = 6;
  return shelf;
}

/**
 * C# `BaseMapGenerator.cs:967` `MakeObjCheckout`. Identical to the copy in
 * `makeLibraryBuilding.ts:479`, which also records that the C#'s commented-out
 * `JumpLevel = 1` stays commented out.
 */
function makeObjCheckout(imageId: string): MapObject {
  const checkout = new MapObject(
    'checkout',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS * 4
  );
  checkout.isMaterialTransparent = true;
  checkout.isContainer = true;
  checkout.givesWood = true;
  return checkout;
}

/**
 * C# `BaseMapGenerator.cs:2300` `MakeItemFireExtinguisher`. Same as
 * `makeFireStationBuilding.ts:524`; the model row is `ItemID.FIRE_EXTINGUISHER`
 * and `ItemSprayPaint` is the C#'s own choice — an extinguisher is not a weapon
 * here, only its trigger behaviour matters.
 */
function makeItemFireExtinguisher(): Item {
  const extinguisher = new ItemSprayPaint(Models.items.get(ItemID.FIRE_EXTINGUISHER)!);
  // No point in the AI having these: there is no code to handle them.
  extinguisher.isForbiddenToAI = true;
  return extinguisher;
}

/**
 * C# `BaseMapGenerator.cs:1880` `MakeItemSiphonKit`. Same as `makeJunkyard.ts:648`;
 * the model row is `ItemID.SIPHON_KIT` (`GameItems.ts:950-956`), hand-written and
 * plural.
 */
function makeItemSiphonKit(): Item {
  const item = new Item(Models.items.get(ItemID.SIPHON_KIT)!);
  item.isForbiddenToAI = true;
  return item;
}

/**
 * C# `Map.RemoveMapObjectAt` (`Data/Map.cs:890`), for the places the forecourt, the
 * driveways and `PlaceFuelStationDoor` clear a car. The port's `Map` has
 * `removeMapObject` but no by-position form; kept as a named helper so the C# line
 * it stands for stays findable.
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const mapObj = map.getMapObjectAt(x, y);
  if (mapObj === null) return;
  map.removeMapObject(mapObj);
}