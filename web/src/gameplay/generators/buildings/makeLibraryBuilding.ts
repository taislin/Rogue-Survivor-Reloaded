/**
 * `Feature.Library` — C# `BaseTownGenerator.cs:1908-2185` `MakeLibraryBuilding`.
 *
 * A library is shelves: a carpeted hall, every other line of a grid of bookcases
 * with a walkable aisle down the middle, one to three glass doors on one long or
 * gable wall, a second glass door wherever a roll lands on a wall that is still
 * solid, a book on every bookcase, and a single checkout counter in the corner of
 * the door's own side — the C# evicts whatever is standing there first, though as
 * §5 shows it never has anything to evict.
 *
 * The geometry is the church's geometry: the shelf grid is the same "every other
 * line, never on the central alley" fill, and the alley runs along the block's
 * *longer* axis, so the room reads the same whichever way the block was cut.
 *
 * ## The library does **not** share the business cascade's `roll(0, 4)`
 *
 * C# `:499-509`:
 *
 * ```csharp
 * if (!hasLibrary && MakeLibraryBuilding(map, b))   // :501
 * {
 *     hasLibrary = true;
 *     placed = true;
 * }
 * else
 * {
 *     int roll2 = m_DiceRoller.Roll(0, 4);          // :510
 *     switch (roll2) { case 0: bar; case 1: bank; ... }
 * }
 * ```
 *
 * The library is the `if` *above* the switch, not a case in it, and it is tried
 * first. So there are two things a port could get wrong here and the bank got
 * right by taking its case as a parameter: **the library spends no dispatch die
 * of its own**, and **a block the library takes must not also be charged the
 * `roll(0, 4)`**. The second is the reason this pass sits immediately *before*
 * `generate()`'s bar/bank cascade: the cascade iterates the blocks the library
 * pass left behind, so a block that became a library is out of the pool before
 * the switch's roll is ever reached — the C#'s control flow, reproduced by pool
 * membership rather than by a nested `if`.
 *
 * The C# reaches the library from inside the per-block business loop, which this
 * port has no branch for (`makeCHARBuilding` never declines a block), so the
 * library is offered a superset of the C#'s blocks. Same as the bank's, and
 * bounded by the C#'s own cap.
 *
 * **What this costs, and it is a cost, not a free refactor.** In the C# the
 * library's own rolls are spent at the library block's position *inside* that
 * loop — between the `roll(0, 4)` of the block before it and the one after. A
 * separate pass cannot put them there: it runs to the end of the pool first, so
 * the library's rolls land ahead of the whole cascade instead of in the middle of
 * it, and every roll after the library's block shifts. Which is exactly what
 * `TownBuildingPass.tryBuild` says registering a building does, and why the
 * Still Alive world fingerprints move when one is added. A CLASSIC world does not
 * move at all, because the gate is ahead of the first roll.
 *
 * ## The feature gate is here and not only at the call site
 *
 * `Feature.Library` is on for Still Alive and off for Classic, and a library
 * under Classic is a bug rather than a cosmetic difference: it moves dice. The
 * gate is the generator's first statement, for the reason `Feature.TileFires` has
 * exactly one reader — one place to get right instead of N that can disagree —
 * and the pass gates itself too, so a Classic district never even reaches the
 * call. The gate has to come before everything, which is cheap here: the
 * generator's first roll is the door side at `:1977`, and it is *inside* the size
 * check, so a CLASSIC district spends no die at all for a building neither ruleset
 * has.
 *
 * ## The one C# branch not ported: `RogueGame.Options.IsSanityEnabled`
 *
 * C# `:2064` guards the shelf items behind a difficulty option, default ON. The
 * port has no `Options` object and no `isSanityEnabled` — it is a per-game
 * toggle no `BaseTownGenerator` method can see — so the books are always dropped,
 * which is the option's default and the only state the port can represent. This
 * is a divergence, not a translation: a player who turned the option off gets
 * books in the C# and books here. Restoring it means carrying the option, which
 * is a change to `GameOptions` and to `Session`, not to a generator.
 *
 * ## What the seam could not hand over
 *
 * The C# reaches for three factories the port's `MapGenerator` keeps `protected`
 * or does not have at all — see "What is deliberately NOT here" in
 * `./TownBuilding`:
 *
 * | C# | port | wanted as |
 * | --- | --- | --- |
 * | `MakeObjShelf` `BaseMapGenerator.cs:595` | `:635`, `protected` | `ctx.makeObjShelf` |
 * | `MakeObjCheckout` `:967` | — | `ctx.makeObjCheckout` |
 * | `MakeItemBook(DiceRoller)` `:1699` | `:1115`, and it takes no roller | `ctx.makeItemBook` |
 *
 * They are re-declared below, transliterated, so the C# method ports whole rather
 * than truncated. They are the candidates for the next addition to
 * `TownBuildingContext`; promoting them is a delete. `makeObjShelf` and
 * `makeItemBook` are the two where the port's own copies already differ from the
 * C#'s: the fork made shelves `BURNABLE` (the port's is still vanilla's
 * `UNINFLAMMABLE`) and gave `MakeItemBook` three coloured novel models and a
 * roller, where the port's takes none and returns the one vanilla book.
 *
 * Two more helpers come along for the same reason — `TopOrBottomCornersFree`
 * (`:1870`) and `LeftOrRightCornersFree` (`:1891`) are `private static` on the
 * C# class and private here. The library has no tables, chairs or drinks: the
 * C#'s furniture is bookcases and a checkout, and the shelf grid is the same
 * "every other line, never the central aisle" fill the church uses.
 */

import type { Item } from '@data/Item';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import type { Map as GameMap } from '@data/Map';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { ItemEntertainment } from '@engine/items/ItemMisc';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/** C# `:2035`, the local the C# hands to `MakeUniqueZone` at `:2178`. */
const LIBRARY_ZONE_NAME = 'Library';

// ── Per-district state ──────────────────────────────────────────────────────

/**
 * `hasLibrary` in the C# is a `bool` the per-block business loop declares and
 * resets for every district (`:469`); `TownBuildingContext` has no place for a
 * `ref`. Keying it on the district's `DiceRoller` gives it exactly the lifetime
 * the C#'s local had — `BaseTownGenerator.generate()` builds a new roller per
 * map, which is where the C# re-declares the variable — and two generators driven
 * in one process keep two flags rather than sharing one.
 */
let libraryBuilt: { roller: DiceRoller; built: boolean } | null = null;

/**
 * The four `strDoorSide` arms of C# `:1975-2032`, as one record.
 *
 * The C# writes the same three `PlaceDoor` calls out four times with the axes
 * swapped, plus a `switch` at `:2042` and a `switch` at `:2085` that both
 * re-decide the side. What actually differs is the wall's fixed coordinate, its
 * centre door's coordinate along that wall, and whether the side is a west/east
 * one — which is also what decides whether the C#'s "how big is the shop" test
 * at `:1984` reads `InsideRect.Height` or `InsideRect.Width`, and what the
 * cash register's corner search walks.
 */
interface LibrarySide {
  /** C# `strDoorSide`, the C#'s own `switch` key at `:2085`. */
  readonly name: 'west' | 'east' | 'north' | 'south';
  /** The wall's fixed coordinate: a column for west/east, a row for north/south. */
  readonly wall: number;
  /** The centre door's coordinate along the wall; also the pair's centre at `:1986`. */
  readonly centre: number;
  /** True for a west/east wall, so the size tests read the inside rect's height. */
  readonly verticalWall: boolean;
}

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:1908` `MakeLibraryBuilding(map, b)`.
 *
 * Returns `true` when the block became a library, which is how the C#'s
 * `if (!hasLibrary && MakeLibraryBuilding(map, b))` says the block is finished
 * with — and, because the C#'s `else` arm is the business cascade, a library
 * also *costs the block its `roll(0, 4)`*. See the module header; the pass in
 * `BaseTownGenerator.generate()` reproduces that by running before the cascade.
 */
export function makeLibraryBuilding(ctx: TownBuildingContext): boolean {
  // Behind `Feature.Library` from the first statement: see the module header.
  if (!hasFeature(Session.get().ruleset, Feature.Library)) return false;

  const { map, block, roller } = ctx;
  const b = block;
  const inside = b.insideRect;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:1913-1914`. A 10x10 inside is a 14x14 block, since `Block` insets
  // twice; it is the smallest that still leaves a central aisle with a bookcase
  // row on each side and, at that size, a second door either side of the first.
  if (inside.width < 10 || inside.height < 10) return false;

  // C# `:501`'s `!hasLibrary`, the Release 5-3 "only 1 library per district" cap.
  if (libraryBuilt === null || libraryBuilt.roller !== roller) libraryBuilt = { roller, built: false };
  if (libraryBuilt.built) return false;
  libraryBuilt.built = true;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:1919-1921`. The `isInside` decorator is what makes the hall dark at
  // night and muffled, so it goes on the carpet fill rather than on the walls:
  // the walls are one tile out and stay outdoors, which is how the doorway reads
  // from the street.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, b.buildingRect);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!, inside, (tile) => {
    tile.isInside = true;
  });

  //////////////////////////////////////////
  // 2. Make sections alleys with displays.
  //////////////////////////////////////////
  // C# `:1927-1962`. The grid runs along the block's *longer* axis, so the
  // central aisle runs along it too and the bookcases stand across it. This is
  // the church's geometry at `:2206-2246` with two differences the C# itself
  // makes: no carpet down the central aisle, and no `CountAdjWalls == 0` guard on
  // a bookcase. The church needs the guard because its lectern and display cases
  // are placed *after* the pew fill; a library places nothing after the bookcases
  // but books, and the C# does not guard them either.
  let alleysStartX = inside.left;
  let alleysStartY = inside.top;
  let alleysEndX = inside.right;
  let alleysEndY = inside.bottom;
  const horizontalAlleys = b.rectangle.width >= b.rectangle.height;
  let centralAlley: number;

  if (horizontalAlleys) {
    // Inset by a column at each end: the bookcases must not touch the gable
    // walls.
    ++alleysStartX;
    --alleysEndX;
    centralAlley = inside.left + Math.floor(inside.width / 2);
  } else {
    // Inset by a row instead, so the bookcases leave the long walls clear.
    ++alleysStartY;
    --alleysEndY;
    centralAlley = inside.top + Math.floor(inside.height / 2);
  }
  // C# `Rectangle.FromLTRB` takes a right and a bottom, `Rect` takes a width and
  // a height, so the alley rect is the C#'s LTRB with the last two subtracted.
  const alleysRect = new Rect(alleysStartX, alleysStartY, alleysEndX - alleysStartX, alleysEndY - alleysStartY);

  ctx.mapObjectFill(map, alleysRect, (pt) => {
    const addShelf = horizontalAlleys
      ? (pt.y - alleysRect.top) % 2 === 1 && pt.x !== centralAlley
      : (pt.x - alleysRect.left) % 2 === 1 && pt.y !== centralAlley;
    return addShelf ? makeObjShelf(GameImages.OBJ_BOOK_SHELVES) : null;
  });

  ///////////////////////////////
  // 3. Entry door with shop ids
  //    Might add window(s).
  ///////////////////////////////
  // C# `:1970-2032`.
  const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);

  // One `RollChance(50)` and not two: the C# rolls `west` on a horizontal-alley
  // block and `north` on a vertical-alley one, so exactly one is ever spent.
  let side: LibrarySide;
  if (horizontalAlleys) {
    side = roller.rollChance(50)
      ? { name: 'west', wall: b.buildingRect.left, centre: midY, verticalWall: true }
      : { name: 'east', wall: b.buildingRect.right - 1, centre: midY, verticalWall: true };
  } else {
    side = roller.rollChance(50)
      ? { name: 'north', wall: b.buildingRect.top, centre: midX, verticalWall: false }
      : { name: 'south', wall: b.buildingRect.bottom - 1, centre: midX, verticalWall: false };
  }

  // The cell on the chosen wall at coordinate `along`, spelled for whichever axis
  // the wall does not run along.
  //
  // The entrance goes through this rather than through a `wall, centre` argument
  // pair because that pair is only right for a *column* wall: for north and south
  // the two have to be swapped, and writing them straight into `placeDoor` puts
  // the door at `(top, midX)` — a cell two rows above the building, in the field.
  const onWall = (along: number): Point =>
    side.verticalWall ? new Point(side.wall, along) : new Point(along, side.wall);

  const entrance = onWall(side.centre);
  ctx.placeDoor(
    map,
    entrance.x,
    entrance.y,
    Models.tiles.get(TileID.FLOOR_WALKWAY)!,
    ctx.makeObjGlassDoor()
  );
  // "adds up to two more doors depending on how big the shop is" — C# `:1984`. The
  // threshold is the *other* axis from the wall: a west/east wall has to be long
  // enough in y for its pair, and the C#'s `>= 8` / `>= 12` are on `InsideRect.
  // Height` there and on `InsideRect.Width` in the north/south arms. Neither pair
  // costs a roll: `PlaceDoor` is unconditional.
  const wallLength = side.verticalWall ? inside.height : inside.width;
  if (wallLength >= 8) {
    const near = onWall(side.centre - 1);
    ctx.placeDoor(map, near.x, near.y, Models.tiles.get(TileID.FLOOR_WALKWAY)!, ctx.makeObjGlassDoor());
    if (wallLength >= 12) {
      const far = onWall(side.centre + 1);
      ctx.placeDoor(map, far.x, far.y, Models.tiles.get(TileID.FLOOR_WALKWAY)!, ctx.makeObjGlassDoor());
    }
  }

  // add building image next to doors. C# `:2036`. A `library` sign on the wall
  // tile beside the door, and the `>= 1` is what makes it a *door* sign: a wall
  // tile with a door next to it.
  ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
    map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_LIBRARY : null
  );

  // window. C# `:2038-2057`. A second glass door, on a rolled side, and only if
  // the wall it lands on is still solid: on a square-ish block the roll lands
  // back on the entrance the C# has already cut, and the `IsWalkable` test at
  // `:2052` is what stops a second door stacking on the first.
  let wx: number;
  let wy: number;
  switch (roller.roll(0, 4)) {
    case 0: // north
      wx = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
      wy = b.buildingRect.top;
      break;
    case 1: // south
      wx = b.buildingRect.left + Math.floor(b.buildingRect.width / 2);
      wy = b.buildingRect.bottom - 1;
      break;
    case 2: // west
      wx = b.buildingRect.left;
      wy = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
      break;
    default: // east. `roll(0, 4)` is half-open, so 0..3 is exhaustive and the
      // C#'s own `default: throw` at `:2048` cannot be reached.
      wx = b.buildingRect.right - 1;
      wy = b.buildingRect.top + Math.floor(b.buildingRect.height / 2);
      break;
  }
  if (!map.getTileAt(wx, wy)!.model.isWalkable) {
    ctx.placeDoor(map, wx, wy, Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!, ctx.makeObjGlassDoor());
  }

  ///////////////////////////
  // 4. Add items to shelves.
  ///////////////////////////
  // C# `:2064-2075`, minus the `IsSanityEnabled` guard; see the module header.
  // One book per bookcase, and the C#'s `MakeItemBook(m_DiceRoller)` spends a
  // roll of the *district's* stream per book, off the same stream as everything
  // else in this method.
  ctx.itemsDrop(
    map,
    inside,
    (pt) => map.getMapObjectAtPoint(pt)?.imageId === GameImages.OBJ_BOOK_SHELVES,
    () => makeItemBook(roller)
  );

  ///////////////////
  // 5. Counter in an corner near the door
  ///////////////////
  // C# `:2082-2171`. The C# writes the same corner search out four times with the
  // axes swapped; what differs is only which inside-rect edge the corner is
  // measured along, which is `verticalWall` again. The C#'s
  // `TopOrBottomCornersFree` / `LeftOrRightCornersFree` return 1 / 2 / 3 for
  // "only the first free" / "only the second" / "both", and 0 — its `default`, and
  // the C#'s `skipThisRegister` — when neither is, which needs an exit on both
  // candidate cells. A library places no exits, so the zero arm is unreachable
  // here; it is kept because it is the C#'s and because the helpers are shared
  // with the shop, which does have basements.
  const fixed = side.verticalWall
    ? side.name === 'west'
      ? inside.left
      : inside.right - 1
    : side.name === 'north'
      ? inside.top
      : inside.bottom - 1;
  const first = side.verticalWall ? inside.top : inside.left;
  const second = side.verticalWall ? inside.bottom - 1 : inside.right - 1;
  const freeCode = side.verticalWall
    ? topOrBottomCornersFree(map, fixed, inside.top, inside.bottom - 1)
    : leftOrRightCornersFree(map, fixed, inside.left, inside.right - 1);

  let corner: Point | null = null;
  switch (freeCode) {
    case 1: // only the first corner is free
      corner = side.verticalWall ? new Point(fixed, first) : new Point(first, fixed);
      break;
    case 2: // only the second
      corner = side.verticalWall ? new Point(fixed, second) : new Point(second, fixed);
      break;
    case 3: {
      // both free, pick one at random. The one roll the C# spends here, and it
      // is only spent when there is a choice to make.
      const chosen = roller.rollChance(50) ? first : second;
      corner = side.verticalWall ? new Point(fixed, chosen) : new Point(chosen, fixed);
      break;
    }
    default: // neither free: the C#'s `skipThisRegister`
      break;
  }

  if (corner !== null) {
    // "remove any blocking object in the shop. it should only ever be a shelf if
    // anything, as we checked for exits already" — C# `:2163-2167`. The port's
    // `Map` has `RemoveMapObject(obj)` and no `RemoveMapObjectAt(x, y)`, so the
    // object is looked up first; same statement, one extra line.
    //
    // In practice nothing is ever there, and the C#'s own hunch is right for the
    // wrong reason: the corner is always on an inside-rect edge, and the alley rect
    // is inset by a *column* on the two sides whose corner is a column and by a
    // *row* on the two whose corner is a row — so the corner cell is always
    // outside the alley rect, and the bookcases never reach it.
    const blocker = map.getMapObjectAt(corner.x, corner.y);
    if (blocker) map.removeMapObject(blocker);
    // "make sure we haven't somehow got a wall or other inaccessible spot"
    if (map.isWalkable(corner.x, corner.y)) {
      map.placeMapObject(makeObjCheckout(GameImages.OBJ_CASH_REGISTER), corner);
    }
  }

  ///////////
  // 6. Zone
  ///////////
  // shop building. C# `:2178`.
  map.addZone(ctx.makeUniqueZone(LIBRARY_ZONE_NAME, b.buildingRect));
  // walkway zones. C# `:2180`.
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:2184`.
  return true;
}

// ── C# `BaseTownGenerator.cs:1870-1905` ─────────────────────────────────────

/**
 * "Given two different Y coordinates along the same vertical, which has no exit
 * on it?" Returns 1 = y1 only, 2 = y2 only, 3 = both — the C#'s own bitmask, and
 * the reason `case 3` is the one that costs a roll.
 */
function topOrBottomCornersFree(map: GameMap, x: number, y1: number, y2: number): number {
  let code = 0;
  if (map.getExitAtXY(x, y1) === null) code += 1;
  if (map.getExitAtXY(x, y2) === null) code += 2;
  return code;
}

/** The x-axis twin, C# `:1891`. */
function leftOrRightCornersFree(map: GameMap, y: number, x1: number, x2: number): number {
  let code = 0;
  if (map.getExitAtXY(x1, y) === null) code += 1;
  if (map.getExitAtXY(x2, y) === null) code += 2;
  return code;
}

// ── Factories the context does not carry ────────────────────────────────────

/**
 * C# `BaseMapGenerator.cs:595` `MakeObjShelf`.
 *
 * `BURNABLE` is the fork's; the port's own `protected makeObjShelf` (`:635`) is
 * still vanilla's `UNINFLAMMABLE`. The C#'s is used here — a Stage 5 building is
 * the fork's building — and the two are reconciled when the factory is promoted
 * to `TownBuildingContext`, which has to change the bar's copy at the same time.
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
 * C# `BaseMapGenerator.cs:967` `MakeObjCheckout`. The port has no copy.
 *
 * The `JumpLevel = 1` the C# comments *out* at `:975` is left commented out here
 * too: a checkout counter you can jump onto would be a shelf of cash you can hop
 * over, and the C# decided against it in Release 5-3.
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
  // `IsContainer = true //@@MP (Release 5-3)` — the C#'s own comment.
  checkout.isContainer = true;
  checkout.givesWood = true;
  return checkout;
}

/**
 * C# `BaseMapGenerator.cs:1699` `MakeItemBook(DiceRoller)`.
 *
 * The port's own `makeItemBook` (`:1115`) takes no roller and returns the single
 * vanilla book; the fork added "more sprites for books" in Release 7-6 and made
 * the choice a roll. The C#'s is used here, and the roll is the district's —
 * `:2074` passes `m_DiceRoller` explicitly, unlike `MakeItemMagazines` beside it,
 * which draws off `Rules` — so it comes off `ctx.roller` with no reinterpretation.
 */
function makeItemBook(roller: DiceRoller): Item {
  const novels = [
    Models.items.get(ItemID.ENT_BOOK_BLUE)!,
    Models.items.get(ItemID.ENT_BOOK_GREEN)!,
    Models.items.get(ItemID.ENT_BOOK_RED)!,
  ];
  return new ItemEntertainment(novels[roller.roll(0, novels.length)]);
}
