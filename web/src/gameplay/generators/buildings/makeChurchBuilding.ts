/**
 * `MakeChurchBuilding` — C# `BaseTownGenerator.cs:2187-2385`.
 *
 * Behind `Feature.Church`, which is on for Still Alive and off for Classic: the
 * C# gates nothing, but this port gates every content addition the fork
 * introduced, and a church under Classic would be content the C# never shipped
 * silently appearing in a ruleset that is defined by shipping nothing extra.
 * The gate lives at the *dispatch* site, `BaseTownGenerator.makeChurchBuildings`
 * — including the dice roll, because a gated roll that is merely not acted on
 * still moves every roll after it.
 *
 * ## What the C# spends 199 lines on
 *
 * A nave. Rows of pews either side of a carpeted central alley, a single wooden
 * door on one of the two long walls, a lectern on the wall opposite the door
 * with a CHAR book on it, and two glass display cases flanking the lectern, each
 * holding one antique melee weapon, with a painted hanging on the wall beyond
 * each. The doorway gets the `church_sign` decoration. The zone is named
 * `Church`.
 *
 * The pews are what makes it a church rather than a shed, and their shape is the
 * fiddliest thing in the method: the alley rect is the inside rect shrunk by one
 * *row* (pews never touch the wall that runs along the nave) or by one *column*,
 * chosen by whether the block is wider than it is tall, and the "every other
 * line" test alternates on whichever axis the nave runs along. See §2.
 */

import { Item } from '@data/Item';
import { Models } from '@data/Models';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { ItemMeleeWeapon } from '@engine/items/ItemWeapon';
import { ItemEntertainment } from '@engine/items/ItemMisc';
import { ItemGrenade } from '@engine/items/ItemExplosive';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Factories the context does not carry yet ────────────────────────────────
//
// Five things this method needs are not on `TownBuildingContext`, and three of
// them do not exist in the port at all:
//
//   | C# | port | wanted as |
//   | --- | --- | --- |
//   | `MakeObjBench` | `BaseMapGenerator.ts:650`, `protected` | `ctx.makeObjBench` |
//   | `MakeObjDrawer` | `BaseMapGenerator.ts:707`, `protected` | `ctx.makeObjDrawer` |
//   | `MakeObjDisplayCase` | — | `ctx.makeObjDisplayCase` |
//   | `MakeItemCHARBook` | — | `ctx.makeItemCHARBook` |
//   | `MakeItemRandomAntiqueWeapon` | — | `ctx.makeItemRandomAntiqueWeapon` |
//
// They live here rather than on the seam because `TownBuilding.ts` is shared and
// a building may not widen it; the two that already exist are transcribed
// property-for-property (with the line numbers above) so hoisting them is a
// delete, not a rewrite. Nothing else in the port calls them, so this is the
// only copy in the building path.

/** C# `BaseMapGenerator.cs:1255` `MakeObjDisplayCase`. Still Alive 7-6. */
function makeObjDisplayCase(caseImageID: string): MapObject {
  const displayCase = new MapObject(
    'display case',
    caseImageID,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS
  );
  displayCase.isContainer = true;
  displayCase.givesWood = true;
  displayCase.isMovable = true;
  displayCase.isMaterialTransparent = true;
  displayCase.breaksWhenFiredThrough = true;
  displayCase.weight = 10;
  return displayCase;
}

/** C# `BaseMapGenerator.cs:1694` `MakeItemCHARBook`. Still Alive 7-6. */
function makeItemCHARBook(): Item {
  return new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK_CHAR)!);
}

/**
 * C# `BaseMapGenerator.cs:2161` `MakeItemRandomAntiqueWeapon`.
 *
 * **Rolls on the district's roller, not the C#'s `m_Game.Rules`.** The C# takes
 * this off the `Rules` roller, which is a *different* stream from the town
 * generator's, so in the C# an antique weapon costs the district's dice stream
 * nothing. The seam has one roller and reaching past it for `ctx.game.rules`
 * would be exactly the coupling `./TownBuilding` exists to remove, so the four
 * rolls per church come off `ctx.roller` instead. The order inside the method —
 * one `Roll(0, 9)`, plus a second roll for the grenade's stack size — is the
 * C#'s, and the 0..8 -> weapon mapping below is the C#'s case for case.
 *
 * `roll(0, 9)` returns 0..8, so the C#'s `default: throw` arm is unreachable and
 * has no counterpart here.
 */
function makeItemRandomAntiqueWeapon(ctx: TownBuildingContext): Item {
  switch (ctx.roller.roll(0, 9)) {
    case 0:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FLAIL)!);
    case 1:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SCIMITAR)!);
    case 2:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_MACE)!);
    case 3:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SPIKED_MACE)!);
    case 4:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SPEAR)!);
    case 5:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SICKLE)!);
    case 6: {
      // The C#'s `MakeItemHolyHandGrenade` rolls a stack size off the *same*
      // stream, after the weapon roll: two of the ten draws are two rolls.
      const model = Models.items.get(ItemID.EXPLOSIVE_HOLY_HAND_GRENADE)!;
      const grenade = new ItemGrenade(model, Models.items.get(ItemID.EXPLOSIVE_HOLY_HAND_GRENADE_PRIMED)!);
      grenade.quantity = ctx.roller.roll(1, model.stackingLimit);
      return grenade;
    }
    case 7: {
      // C# `BaseMapGenerator.cs:2292`. The only one of the nine that is not a
      // weapon, and `IsForbiddenToAI` is the whole of it.
      const book = new Item(Models.items.get(ItemID.UNIQUE_BOOK_OF_ARMAMENTS)!);
      book.isForbiddenToAI = true;
      return book;
    }
    case 8:
      return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_KATANA)!);
    default:
      // The C#'s own `default: throw`, kept because it is what makes the switch
      // exhaustive. `roll(0, 9)` cannot reach it; see the note above.
      throw new Error('unhandled roll');
  }
}

/** A pew: C# `MakeObjBench(OBJ_CHURCH_PEW)`, see the table above. */
function makeObjPew(): MapObject {
  // `BaseMapGenerator.ts:650`, transcribed. `isCouch` is the load-bearing flag:
  // survivors sit on pews like any other bench, and dropping it would make the
  // nave a place you walk through rather than a place you wait out the night.
  const pew = new MapObject(
    'bench',
    GameImages.OBJ_CHURCH_PEW,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 2
  );
  pew.isMaterialTransparent = true;
  pew.jumpLevel = 1;
  pew.isCouch = true;
  pew.givesWood = true;
  return pew;
}

/** A lectern: C# `MakeObjDrawer(OBJ_LECTERN)`, see the table above. */
function makeObjLectern(): MapObject {
  // `BaseMapGenerator.ts:707`, transcribed.
  const lectern = new MapObject(
    'drawer',
    GameImages.OBJ_LECTERN,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS
  );
  lectern.isMaterialTransparent = true;
  lectern.isContainer = true;
  lectern.givesWood = true;
  lectern.isMovable = true;
  lectern.weight = 6;
  return lectern;
}

// ── The generator ───────────────────────────────────────────────────────────

export function makeChurchBuilding(ctx: TownBuildingContext): boolean {
  const { map, block: b } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:2192`. A 5x5 inside is a 9x9 block, since `Block` insets twice; it is
  // the smallest that still fits a central alley with a pew row on each side.
  if (b.insideRect.width < 5 || b.insideRect.height < 5) return false;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:2198-2200`.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, b.buildingRect);
  // The `isInside` decorator is what makes the nave dark at night and muffled,
  // so it goes on the floor fill rather than on the walls: the walls are one tile
  // out and stay outdoors, which is how the doorway reads from the street.
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, b.insideRect, (tile) => {
    tile.isInside = true;
  });

  //////////////////////////////////////////
  // 2. Make rows of pews.
  //////////////////////////////////////////
  // C# `:2206-2246`. The nave runs along the block's *longer* axis, so the
  // central alley runs along it too and the pews face across it.
  let alleysStartX = b.insideRect.left;
  let alleysStartY = b.insideRect.top;
  let alleysEndX = b.insideRect.right;
  let alleysEndY = b.insideRect.bottom;
  const horizontalAlleys = b.rectangle.width >= b.rectangle.height;
  let centralAlley: number;

  if (horizontalAlleys) {
    // Inset by a column at each end: the pews must not touch the gable walls.
    ++alleysStartX;
    --alleysEndX;
    centralAlley = b.insideRect.left + Math.floor(b.insideRect.width / 2);
  } else {
    // Inset by a row instead, so the pews leave the long walls clear.
    ++alleysStartY;
    --alleysEndY;
    centralAlley = b.insideRect.top + Math.floor(b.insideRect.height / 2);
  }
  // C# `Rectangle.FromLTRB` takes a right and a bottom, `Rect` takes a width and
  // a height, so the alley rect is the C#'s LTRB with the last two subtracted.
  const alleysRect = new Rect(
    alleysStartX,
    alleysStartY,
    alleysEndX - alleysStartX,
    alleysEndY - alleysStartY
  );

  ctx.mapObjectFill(map, alleysRect, (pt) => {
    let addShelf: boolean;

    if (horizontalAlleys) {
      addShelf = (pt.y - alleysRect.top) % 2 === 1 && pt.x !== centralAlley;
      if (pt.x === centralAlley) map.setTileModelAt(pt.x, pt.y, Models.tiles.get(TileID.FLOOR_RED_CARPET)!);
    } else {
      addShelf = (pt.x - alleysRect.left) % 2 === 1 && pt.y !== centralAlley;
      if (pt.y === centralAlley) map.setTileModelAt(pt.x, pt.y, Models.tiles.get(TileID.FLOOR_RED_CARPET)!);
    }

    // `CountAdjWalls == 0` is the C#'s only guard on a pew (`:2245`), and it
    // matters for a reason that is not obvious: the lectern, the display cases
    // and the door are all placed *after* this fill, so a pew that has already
    // been placed on a tile one of them wants would keep the later placement from
    // happening — `MapObjectPlace` and `MapObjectFill` both refuse an occupied
    // tile silently. The guard as written does not prevent that (it counts
    // *walls*, and the lectern lands on floor), and the C# has the same gap; it
    // is recorded rather than fixed, because fixing it would move every
    // church's layout in every save.
    if (addShelf && ctx.countAdjWalls(map, pt.x, pt.y) === 0) return makeObjPew();
    else return null;
  });

  ///////////////////////////////
  // 3. Entry door with shop ids
  //    Add lectern and hangings.
  ///////////////////////////////
  // C# `:2257-2370`.
  const midX = b.rectangle.left + Math.floor(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.floor(b.rectangle.height / 2);
  const churchHangings = [
    GameImages.DECO_CHURCH_HANGING1,
    GameImages.DECO_CHURCH_HANGING2,
    GameImages.DECO_CHURCH_HANGING3,
    GameImages.DECO_CHURCH_HANGING4,
  ];
  const chosenHanging = churchHangings[ctx.roller.roll(0, churchHangings.length)];

  // The four arms below are the same room with the door on a different wall: the
  // door goes on a long wall when the nave runs north-south and on a gable wall
  // when it runs east-west, and the lectern always goes on the wall opposite the
  // door. `acrossX`/`acrossY` is the unit step *across* the nave, which is the
  // axis the two display cases fan out along, and `caseSigns` is the order the
  // C# places them in — the order their two antique-weapon rolls come off the
  // roller. Both are folded out so the "lectern, two cases, two hangings"
  // furniture is written once instead of the C#'s four times; the rolls, their
  // count and their order are the C#'s.
  let doorX: number;
  let doorY: number;
  let lecternX: number;
  let lecternY: number;
  let acrossX: number;
  let acrossY: number;
  let caseSigns: readonly number[];

  if (!horizontalAlleys) {
    // The nave runs north-south, so "across" is the y axis. The C# writes the
    // *south* case first in both long-wall arms (`:2278`, `:2300`).
    acrossX = 0;
    acrossY = 1;
    caseSigns = [-1, 1];
    if (ctx.roller.rollChance(50)) {
      // west door (`:2269`), lectern east. C# `:2265-2288`.
      doorX = b.buildingRect.left;
      doorY = midY;
      lecternX = b.buildingRect.right - 2;
      lecternY = midY;
    } else {
      // east door (`:2292`), lectern west. C# `:2292-2310`.
      doorX = b.buildingRect.right - 1;
      doorY = midY;
      lecternX = b.buildingRect.left + 1;
      lecternY = midY;
    }
  } else {
    // The nave runs east-west, so "across" is the x axis. Both gable-wall arms
    // place the *east* case first (`:2329`, `:2352`) and the west one second
    // (`:2335`, `:2358`) — the opposite sense to the long-wall arms, and the
    // reason `caseSigns` is a per-axis list rather than a constant.
    acrossX = 1;
    acrossY = 0;
    caseSigns = [1, -1];
    if (ctx.roller.rollChance(50)) {
      // north door (`:2321`), lectern south. C# `:2316-2339`.
      doorX = midX;
      doorY = b.buildingRect.top;
      lecternX = midX;
      lecternY = b.buildingRect.bottom - 2;
    } else {
      // south door (`:2344`), lectern north. C# `:2344-2362`.
      doorX = midX;
      doorY = b.buildingRect.bottom - 1;
      lecternX = midX;
      lecternY = b.buildingRect.top + 1;
    }
  }

  ctx.placeDoor(map, doorX, doorY, Models.tiles.get(TileID.FLOOR_WALKWAY)!, ctx.makeObjWoodenDoor());

  // The lectern goes on the wall opposite the door, and the door's neighbour
  // holds the church's only book. C# `:2273-2275`, `:2295-2297`, `:2324-2326`
  // and `:2347-2349`: the same three lines in all four arms.
  const lecternPos = new Point(lecternX, lecternY);
  map.placeMapObject(makeObjLectern(), lecternPos);
  map.dropItemAt(makeItemCHARBook(), lecternPos); // C# `:2275`, Still Alive 7-6.

  // Two glass display cases flanking the lectern, each holding one antique melee
  // weapon, with a painted hanging on the wall beyond each. C# `:2278-2288`
  // (west door), `:2300-2310` (east), `:2329-2339` (north), `:2352-2362` (south).
  for (const sign of caseSigns) {
    const casePos = new Point(lecternX + sign * acrossX, lecternY + sign * acrossY);
    map.placeMapObject(makeObjDisplayCase(GameImages.OBJ_DISPLAY_CASE), casePos);
    map.dropItemAt(makeItemRandomAntiqueWeapon(ctx), casePos);

    // One tile past the case, so the hanging is on the wall the case stands
    // against rather than on the case itself (`:2282`).
    map
      .getTileAt(lecternX + 2 * sign * acrossX, lecternY + 2 * sign * acrossY)!
      .addDecoration(chosenHanging);
  }

  // add building image next to doors.
  // C# `:2370`. A church_sign on the wall tile beside the door, and the
  // `>= 1` is what makes it a *door* sign: a wall tile with a door next to it.
  ctx.decorateOutsideWalls(
    map,
    b.buildingRect,
    (x, y) => (map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_CHURCH : null)
  );

  ///////////
  // 4. Zone
  ///////////
  // demark building. C# `:2376-2378`.
  const buildingName = 'Church';
  map.addZone(ctx.makeUniqueZone(buildingName, b.buildingRect));
  // C# `:2379`, Release 6-6. The flag the two church-bell ambients read at
  // sunset; see `Map.hasChurch`.
  map.hasChurch = true;
  // walkway zones. C# `:2380`.
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:2383`.
  return true;
}
