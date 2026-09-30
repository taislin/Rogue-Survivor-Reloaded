/**
 * `Feature.Junkyard` — C# `BaseTownGenerator.cs:3537-3683` `MakeJunkyard`.
 *
 * A junkyard is the C#'s one building with no walls: a walkway ring, a dirt yard,
 * a chain wire fence around the building rect, three roller doors and an asphalt
 * driveway on one rolled side, and then a 60%-per-tile fill of wrecked cars, junk
 * piles and barrels, most of the junk and the barrels also dropping a salvaged
 * tool or weapon *underneath* the pile.
 * There is no `insideRect` wall to speak of, which is why the C# never marks the
 * dirt `IsInside` (`:3549`, with the old `IsInside` decorator commented out
 * underneath it) — a junkyard is outdoors with a fence round it.
 *
 * ## The dispatch is the *last* arm of the green cascade, and takes its roll
 *
 * C# `:546-585` is the "Parks" region, and the junkyard is its tail:
 *
 * ```csharp
 * foreach (Block b in emptyBlocks)
 * {
 *     if (m_DiceRoller.RollChance(m_Params.ParkBuildingChance))
 *     {
 *         if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
 *         {
 *             if (MakeFuelStation(map, b, fuelStationsPlaced)) goto Completed;
 *             if (!fireStationPlaced && MakeFireStation(map, b)) goto Completed;
 *             int rolled = m_DiceRoller.Roll(0, 99);
 *             // the four conditions below are abridged; `:572-580` as written
 *             if (rolled >= 65)      greenSuccess = MakeParkBuilding(map, b, false);
 *             else if (rolled < 64)  greenSuccess = MakeFarmBuilding(map, b);
 *             else if (rolled < 29)  greenSuccess = MakeAnimalShelterBuilding(map, b);
 *             else if (rolled < 19)  greenSuccess = MakeParkBuilding(map, b, true);
 *             else                   greenSuccess = MakeJunkyard(map, b);   // :581
 *         }
 *         Completed: ...
 *     }
 * }
 * ```
 *
 * So it is *not* an arm of the business `roll(0, 4)` the bar and bank share, and
 * it does not roll for its own dispatch either: like them it takes the cascade's
 * die as a parameter, because four other buildings want it. The band is
 * `rolled < 10` — the trailing `else`, and the only one of the five with no
 * `>=` guard of its own — which is why {@link JUNKYARD_ROLL_MAX} exists rather
 * than a `case`.
 *
 * The two `RollChance`/`Roll` calls that gate the region are spent by the pass
 * (`BaseTownGenerator.makeJunkyards`), not here, for the reason
 * `TownBuildingPass.tryBuild` gives: the pass owns the cascade so the four
 * sibling arms can share the one die. Under CLASSIC the pass is gated *before*
 * either, so a classic district spends nothing at all.
 *
 * ## Two things the C# writes that never happen, kept anyway
 *
 * Both are dead in the reference and both are transliterated rather than fixed,
 * because fixing either would move every junkyard in every save:
 *
 * - **The three roller doors are refused.** `:3551` fills the whole `BuildingRect`
 *   with chain wire fence, and `:3579`/`:3591`/`:3603`/`:3615` then place the
 *   doors on three tiles of that same perimeter. `PlaceDoor` (`:1321`) sets the
 *   floor tile and hands the door to `MapObjectPlace` (`Engine/MapGenerator.cs:257`),
 *   which silently declines a tile that already has an object. The yard therefore
 *   has a fence where its gate is, and `CountAdjDoors` is 0 everywhere in it.
 * - **The sign is unreachable.** `:3628` asks `DecorateOutsideWalls` for a
 *   `DECO_JUNKYARD` on any wall tile next to a door, and
 *   `DecorateOutsideWalls` (`BaseMapGenerator.cs:1304`) *skips walkable tiles* —
 *   but `:3557` has already laid `FLOOR_DIRT` under the entire perimeter, and
 *   dirt is walkable. The callback never runs. `DECO_JUNKYARD` is still declared
 *   in `GameImages` so the transliteration is complete, and
 *   `tests/junkyard-building.test.ts` asserts the no-op rather than a sign.
 *
 * ## The `roll(0, 99)` bands do not add up to the comments
 *
 * `:3645-3664` reads `>= 80` (20 values), `>= 40 && < 79` (39 values) and an
 * `else` (0..39 plus the 79 itself, 41 values). The `//40%` comments on both arms
 * are off by one, and the C#'s 79 is the tell: it reads like a typo for `< 80`
 * that was never corrected. Spelled as the C# spells it, because a junkyard's
 * contents are what they are and re-deriving them from the comments would move
 * one tile in twenty of every yard.
 *
 * ## What the seam could not hand over
 *
 * The C# reaches for six `makeObj*` factories and ten `makeItem*` factories, none
 * of which is on `TownBuildingContext` and several of which the port has no copy
 * of at all. All sixteen are re-declared below, transliterated, so the C# method
 * is ported whole rather than truncated. They are the candidates for the next
 * addition to the context; promoting them means deleting the copies here.
 *
 * | C# | port | wanted as |
 * | --- | --- | --- |
 * | `MakeObjRollerDoor` `BaseMapGenerator.cs:421` | — | `ctx.makeObjRollerDoor` |
 * | `MakeObjFence` `:444` | `:486`, `protected`, and *not the same fence* | `ctx.makeObjChainwireFence` |
 * | `MakeObjJunk` `:728` | `:785`, `protected`, vanilla values | `ctx.makeObjJunk` |
 * | `MakeObjBarrels` `:743` | `:801`, `protected`, vanilla values | `ctx.makeObjBarrels` |
 * | `MakeObjFireBarrel` `:758` | `:609`, `protected`, identical | `ctx.makeObjFireBarrel` |
 * | `MakeObjWreckedCar` `:557` | `:577`, `protected`, different `CARS` | `ctx.makeObjWreckedCar` |
 * | `MakeItemSiphonKit` `:1880` | — | `ctx.makeItemSiphonKit` |
 * | `MakeItemPaintThinner` `:1568` | — | `ctx.makeItemPaintThinner` |
 * | the other eight `makeItem*` | public on `BaseMapGenerator` | `ctx.makeItem*` |
 *
 * The five map-object copies are *not* the port's own. `makeObjFence` in the port
 * is vanilla's wooden fence — it gives wood and is called `fence` — where the
 * C#'s is a metal chain wire fence that does not; `makeObjJunk` and
 * `makeObjBarrels` carry vanilla's hit points, break states and weights where the
 * fork made them containers, jumpable and unbreakable. The Still Alive values are
 * the ones used here, for the reason `makeBankBuilding`'s `makeObjTable` gives: a
 * Stage 5 building is the fork's building, and the divergence is reported rather
 * than papered over.
 *
 * ## Which roller the junkyard's items are drawn from
 *
 * `MakeJunkyardItem` (`:7842`) opens with `m_DiceRoller.Roll(0, 15)` — the
 * *district's* roller, the one on the context, so the pick itself is faithful.
 * Four of the ten factories it then reaches for roll *again*, for a stack size or
 * a colour, and those rolls come off `m_Game.Rules` (`:1397`, `:1551`, `:1682`,
 * `:1690`) — a **second, unrelated** `DiceRoller`, so in the C# a junkyard's
 * crowbar stack size costs the district's dice nothing. Reaching past
 * `ctx.roller` for `ctx.game.rules` would be exactly the coupling
 * `./TownBuilding` exists to remove, so those four come off `ctx.roller` instead,
 * the order inside each factory is the C#'s, and the divergence is recorded here
 * and in {@link makeJunkyardItem}.
 */

import { Item } from '@data/Item';
import { Models } from '@data/Models';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Session } from '@engine/Session';
import { Barrel, Car, DoorWindow } from '@engine/mapobjects/MapObjects';
import { ItemLight } from '@engine/items/ItemLight';
import { ItemSprayPaint, ItemSprayPaintModel } from '@engine/items/ItemMisc';
import { ItemTrap } from '@engine/items/ItemTrap';
import { ItemMeleeWeapon, ItemRangedWeapon } from '@engine/items/ItemWeapon';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * C# `:580`, the junkyard's band of the green cascade's `Roll(0, 99)`: the
 * trailing `else`, so everything below 10. The four arms above it are an ordinary
 * park (`>= 65`), a farm (`30..64`), a dog pound (`20..29`) and a graveyard
 * (`10..19`), and none of the four is ported — see the module header.
 */
export const JUNKYARD_ROLL_MAX = 10;

/** C# `:3638` — the per-tile chance that a yard tile holds anything at all. */
const JUNK_PER_TILE_CHANCE = 60;

/** C# `:3645` — 80..99 is the wrecked car, a fifth of the junk. */
const WRECKED_CAR_ROLL_MIN = 80;

/** C# `:3647` — `>= 40 && < 79`, written the way the C# writes it. See header. */
const JUNK_PILE_ROLL_MIN = 40;
const JUNK_PILE_ROLL_MAX = 79;

/** C# `:3656` — barrels against a fire barrel, inside the 40% arm. */
const BARRELS_CHANCE = 60;

/** C# `:3651`/`:3662` — `itemRoller <= 60` off a `Roll(0, 99)`. */
const JUNK_ITEM_ROLL_MAX = 60;

/** C# `BaseMapGenerator.cs:552`, `MakeObjWreckedCar`'s five models. */
const WRECKED_CARS = [
  GameImages.OBJ_CAR_BLUE_PHASE0,
  GameImages.OBJ_CAR_GREEN_PHASE0,
  GameImages.OBJ_CAR_RED_PHASE0,
  GameImages.OBJ_CAR_WHITE_PHASE0,
  GameImages.OBJ_POLICE_CAR_PHASE0,
];

/** C# `:559` — `roller.Roll(0, 30)`, a wrecked car's tank. */
const WRECKED_CAR_FUEL_MAX = 30;

/** C# `:7844` — `MakeJunkyardItem`'s `Roll(0, 15)`, i.e. 0..14. */
const JUNKYARD_ITEM_ROLLS = 15;

/** C# `:1551` — `MakeItemSprayPaint`'s `Rules.Roll(0, 4)`, i.e. four colours. */
const SPRAY_PAINT_COLOURS = 4;

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3537` `MakeJunkyard(map, b)`.
 *
 * `dispatchRoll` is the green cascade's `Roll(0, 99)` at `:570`, spent by the
 * pass for the reason the module header gives. Returns `true` when the block
 * became a junkyard, which is how the C#'s `greenSuccess = MakeJunkyard(map, b)`
 * says the block is finished with.
 */
export function makeJunkyard(ctx: TownBuildingContext, dispatchRoll: number): boolean {
  // Behind `Feature.Junkyard` from the first statement: the pass gates its own
  // rolls (see the module header), and the gate inside the generator is what makes
  // a *direct* call under Classic a no-op rather than a junkyard.
  if (!hasFeature(Session.get().ruleset, Feature.Junkyard)) return false;

  // The trailing `else` of the green cascade. Spelled as the C# spells it, so a
  // roll that is some other arm's is declined here and nowhere else.
  if (dispatchRoll >= JUNKYARD_ROLL_MAX) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:3542`. A 5x5 inside is a 9x9 block, `Block` insetting twice; it is the
  // smallest yard that can hold a car with a walkway round it.
  if (b.insideRect.width < 5 || b.insideRect.height < 5) return false;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:3548-3562`. There are no walls: the fence *is* the boundary, and the
  // dirt goes right up to it.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  // No `isInside` decorator, and that is the C#'s own Release 5-3 decision: the
  // commented-out line at `:3550` is the version that would have darkened the
  // yard, so a junkyard is lit like the street outside it.
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_DIRT)!, b.insideRect);
  ctx.mapObjectFill(map, b.buildingRect, (pt) => {
    const placeFence =
      pt.x === b.buildingRect.left ||
      pt.x === b.buildingRect.right - 1 ||
      pt.y === b.buildingRect.top ||
      pt.y === b.buildingRect.bottom - 1;
    if (!placeFence) return null;
    map.setTileModelAt(pt.x, pt.y, Models.tiles.get(TileID.FLOOR_DIRT)!);
    return makeObjChainwireFence(GameImages.OBJ_CHAINWIRE_FENCE);
  });

  ///////////////////////////////
  // 2. Entry door with shop ids
  //    Add lectern and hangings.
  ///////////////////////////////
  // C# `:3570-3628`. The section comment above is the C#'s own copy-paste from
  // the shop and is left out; the four arms are otherwise identical apart from
  // the axis, so they are written out as the C# writes them — one difference per
  // arm is easier to check against `:3577-3624` than a table is.
  const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

  // make doors on one side.
  const doorside = roller.roll(0, 4);
  let driveway: Point;
  switch (doorside) {
    case 0: {
      // west
      const x = b.buildingRect.left;
      ctx.placeDoor(map, x, midY, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, x, midY - 1, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, x, midY + 1, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      driveway = new Point(x - 1, midY);
      break;
    }
    case 1: {
      // east
      const x = b.buildingRect.right - 1;
      ctx.placeDoor(map, x, midY, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, x, midY - 1, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, x, midY + 1, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      driveway = new Point(x + 1, midY);
      break;
    }
    case 2: {
      // north
      const y = b.buildingRect.top;
      ctx.placeDoor(map, midX, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, midX - 1, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, midX + 1, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      driveway = new Point(midX, y - 1);
      break;
    }
    default: {
      // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive.
      const y = b.buildingRect.bottom - 1;
      ctx.placeDoor(map, midX, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, midX - 1, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      ctx.placeDoor(map, midX + 1, y, Models.tiles.get(TileID.FLOOR_DIRT)!, makeObjRollerDoor());
      driveway = new Point(midX, y + 1);
      break;
    }
  }

  // place driveway: get rid of cars, and asphalt where the gate was.
  // C# `:3585-3586` and its three twins. The junkyard is the one building that
  // clears an object off a tile it did not put there: `AddWreckedCarsOutside`
  // runs at the end of `generate()` and a car parked on the driveway would be
  // inside the fence.
  const drivewayObj = map.getMapObjectAt(driveway.x, driveway.y);
  if (drivewayObj) map.removeMapObject(drivewayObj);
  map.setTileModelAt(driveway.x, driveway.y, Models.tiles.get(TileID.FLOOR_ASPHALT)!);

  // add building image next to doors.
  // C# `:3628`. Dead in the reference and dead here: the perimeter is walkable
  // dirt by now, and `DecorateOutsideWalls` skips walkable tiles. Transcribed so
  // the day the fence stops covering the perimeter the sign appears, as written.
  ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
    map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_JUNKYARD : null
  );

  ///////////
  // 3. Add junk
  ///////////
  // C# `:3635-3670`. The order is the C#'s and it is the whole of the
  // determinism: one roll to ask whether the tile holds anything at all
  // (`:3638`), one to say what (`:3644`), and then the contents -- two more for a
  // car (`:559`), one more for the drums/fire split (`:3656`) and one more for
  // the salvage roll (`:3650`), which is followed by the model's own pick
  // (`:7844`) and, for three of the ten models, a stack size.
  ctx.mapObjectFill(map, b.insideRect, (pt) => {
    if (!roller.rollChance(JUNK_PER_TILE_CHANCE)) return null;

    // C# `:3641`. The comment above the test in the C# records that the
    // `tile.IsInside &&` half was removed in Release 5-3, and dirt is walkable,
    // so in practice this is always true for an inside-rect tile.
    if (!map.getTileAt(pt.x, pt.y)!.model.isWalkable) return null;

    // C# `:3644`. 80..99 is a wrecked car, 40..78 a junk pile, everything else
    // barrels.
    const rolled = roller.roll(0, 99);
    if (rolled >= WRECKED_CAR_ROLL_MIN) {
      return makeObjWreckedCar(roller);
    }

    if (rolled >= JUNK_PILE_ROLL_MIN && rolled < JUNK_PILE_ROLL_MAX) {
      const thing = makeObjJunk(GameImages.OBJ_JUNK);
      dropJunkyardItem(ctx, pt);
      return thing;
    }

    // C# `:3656-3659`. The two arms are a stack of drums and a single fuel barrel,
    // and the fuel barrel is the one that can be lit -- which is why this is the
    // arm worth arriving at.
    const thing = roller.rollChance(BARRELS_CHANCE)
      ? makeObjBarrels(GameImages.OBJ_BARRELS)
      : makeObjFireBarrel(GameImages.OBJ_EMPTY_BARREL);
    dropJunkyardItem(ctx, pt);
    return thing;
  });

  ///////////
  // 4. Zone
  ///////////
  // demark building. C# `:3677`.
  map.addZone(ctx.makeUniqueZone('Junkyard', b.buildingRect));
  // walkway zones. C# `:3679`.
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:3682`.
  return true;
}

// ── C# `BaseTownGenerator.cs:3650` and `:3661` ───────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3650`/`:3661` — the same three lines in both junk
 * arms: a `Roll(0, 99)`, and its 61 lowest values (0..60 of the 99 it can return)
 * drop a salvaged item on the tile the object is going on.
 *
 * `DropItemAt` is called *before* the object is placed, because the C#'s
 * `MapObjectFill` places the returned object after the callback returns — so the
 * item lands under the junk pile, inside it, since `MakeObjJunk` and
 * `MakeObjBarrels` are both containers. That is the point: a junkyard is a place
 * to loot, and the loot is in the pile.
 */
function dropJunkyardItem(ctx: TownBuildingContext, pt: Point): void {
  if (ctx.roller.roll(0, 99) <= JUNK_ITEM_ROLL_MAX) {
    ctx.map.dropItemAt(makeJunkyardItem(ctx), pt);
  }
}

// ── C# `BaseTownGenerator.cs:7842` ───────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:7842` `MakeJunkyardItem` — one `Roll(0, 15)` over ten
 * models, six draws of barbed wire.
 *
 * **The pick is the district's; four of the factories' own rolls are `Rules`.**
 * The `roll(0, 15)` below is `m_DiceRoller`, so it is `ctx.roller` and costs the
 * district one die exactly as in the reference. But `MakeItemCrowbar`
 * (`BaseMapGenerator.cs:1397`), `MakeItemSprayPaint` (`:1551`), `MakeItemSpikes`
 * (`:1682`) and `MakeItemBarbedWire` (`:1690`) each roll *again* off
 * `m_Game.Rules`, which carries its own unrelated `DiceRoller`. Reaching past
 * `ctx.roller` for `ctx.game.rules` is the coupling `./TownBuilding` exists to
 * remove, so those four come off `ctx.roller` and the district pays for a
 * crowbar's stack size. The count and the order inside each factory are the
 * C#'s, so a junkyard whose salvage is a crowbar, a tin of spikes, a tin of
 * barbed wire or a can of paint costs one die more here than in the reference —
 * which is the price of a seam with one roller, and the reason the church's
 * antique weapons are documented the same way.
 *
 * `roll(0, 15)` returns 0..14, so the C#'s `default: throw` arm is unreachable
 * and has no counterpart here.
 */
function makeJunkyardItem(ctx: TownBuildingContext): Item {
  switch (ctx.roller.roll(0, JUNKYARD_ITEM_ROLLS)) {
    case 0:
      return makeItemPipeWrench();
    case 1:
      return makeItemCrowbar(ctx);
    case 2:
      return makeItemHugeHammer();
    case 3:
      return makeItemSprayPaint(ctx);
    case 4:
      return makeItemBigFlashlight();
    case 5:
      return makeItemSpikes(ctx);
    case 6:
      return makeItemShotgun();
    case 7:
      return makeItemSiphonKit();
    case 8:
      return makeItemPaintThinner();
    default:
      // 9..14, all barbed wire. Written as the C#'s six `case` labels collapse
      // to a `default`, which is the same set of rolls.
      return makeItemBarbedWire(ctx);
  }
}

// ── Factories the seam could not hand over: map objects ─────────────────────

/**
 * C# `BaseMapGenerator.cs:444` `MakeObjFence` — "chain wire and IS jumpable".
 *
 * Not the port's own `makeObjFence` (`BaseMapGenerator.ts:486`), which is
 * vanilla's *wooden* fence: it is called `fence` and it gives wood. The C#'s
 * says `chain wire fence` and does not, which is the difference between a fence
 * you can saw through for planks and one you cannot. `IsMetal` (Release 5-4) is
 * not carried by the port's `MapObject` at all and is left off for the reason
 * `BaseMapGenerator.makeObjFireBarrel` gives at `:617`.
 */
function makeObjChainwireFence(imageId: string): MapObject {
  const fence = new MapObject(
    'chain wire fence',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 10
  );
  fence.isMaterialTransparent = true;
  fence.jumpLevel = 1;
  fence.standOnFovBonus = true;
  return fence;
}

/** C# `BaseMapGenerator.cs:421` `MakeObjRollerDoor`. Static there, static here. */
function makeObjRollerDoor(): DoorWindow {
  // Six times a wooden door's hit points and no wood, so a survivor who wants
  // through a junkyard gate has to go over the fence instead.
  return new DoorWindow(
    'roller door',
    GameImages.OBJ_ROLLER_DOOR_CLOSED,
    GameImages.OBJ_ROLLER_DOOR_OPEN,
    GameImages.OBJ_ROLLER_DOOR_BROKEN,
    6 * DoorWindow.BASE_HITPOINTS
  );
}

/**
 * C# `BaseMapGenerator.cs:557` `MakeObjWreckedCar` / `:565` `MakeObjCar`.
 *
 * **The argument order is the C#'s and it is the opposite of the port's.** C#
 * evaluates `CARS[roller.Roll(0, 5)]` before `roller.Roll(0, 30)`, so the model
 * comes off the roller first and the fuel second. The port's protected
 * `makeObjWreckedCar` (`:577`) rolls the fuel first — and picks from vanilla's
 * `car1..car4` rather than the fork's five phase-0 models. Transcribed from the
 * C# here, which is the whole of the argument for promoting it to the context
 * and fixing both call sites at once.
 *
 * The fuel roll has no `Feature.FireBarrels` gate here, unlike the port's copy at
 * `:578`. That gate exists because `addWreckedCarsOutside` runs in every
 * ruleset; this factory has one caller and it sits behind `Feature.Junkyard`, so
 * the gate could not change the answer.
 */
function makeObjWreckedCar(roller: TownBuildingContext['roller']): MapObject {
  const imageId = WRECKED_CARS[roller.roll(0, WRECKED_CARS.length)];
  const car = new Car('wrecked car', imageId, MapObjectBreak.BROKEN, roller.roll(0, WRECKED_CAR_FUEL_MAX));
  car.isMaterialTransparent = true;
  car.jumpLevel = 1;
  car.isMovable = true;
  car.weight = 100;
  car.standOnFovBonus = true;
  return car;
}

/**
 * C# `BaseMapGenerator.cs:728` `MakeObjJunk`, the Still Alive values.
 *
 * The fork made junk breakable but strong, burnable, jumpable, and above all a
 * *container* (Release 5-3) — the port's protected `makeObjJunk` (`:785`) is
 * vanilla's: one hit point, unburnable, no `JumpLevel`, no `StandOnFovBonus`, no
 * container, six kilos. `DropItemAt` in {@link dropJunkyardItem} puts the salvage
 * *under* the pile, so without `isContainer` the junkyard's loot would be
 * unreachable — which is the one difference here that is behaviour and not
 * flavour.
 */
function makeObjJunk(imageId: string): MapObject {
  const junk = new MapObject(
    'junk',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.BURNABLE,
    DoorWindow.BASE_HITPOINTS * 3
  );
  junk.isPlural = true;
  junk.isMaterialTransparent = true;
  junk.jumpLevel = 1;
  junk.standOnFovBonus = true;
  junk.isMovable = true;
  junk.isContainer = true;
  junk.givesWood = true;
  junk.weight = 15;
  return junk;
}

/**
 * C# `BaseMapGenerator.cs:743` `MakeObjBarrels`, the Still Alive values.
 *
 * The fork made this unbreakable (Release 6-2) and immovable (Release 7-6) and a
 * container, where the port's protected `makeObjBarrels` (`:801`) is breakable,
 * movable, gives wood and weighs ten kilos. Unbreakable is the load-bearing one: a
 * yard whose drum stack can be torn apart is a yard with no drum stack.
 */
function makeObjBarrels(imageId: string): MapObject {
  const barrels = new MapObject(
    'barrels',
    imageId,
    MapObjectBreak.UNBREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 2
  );
  barrels.isPlural = true;
  barrels.isMaterialTransparent = true;
  barrels.isMovable = false;
  barrels.isContainer = true;
  return barrels;
}

/**
 * C# `BaseMapGenerator.cs:758` `MakeObjFireBarrel` — a *lit-able* barrel, and the
 * single most useful tile a junkyard puts down.
 *
 * Identical to the port's protected `makeObjFireBarrel` (`:609`) field for field,
 * and carried again here only because the method is `protected` and the context
 * does not have it. `hoverDescription` (Release 7-6) is not a field the port's
 * `MapObject` has, for the reason `BaseMapGenerator` gives at `:617`: adding a
 * field to a core class as a side effect of a generator is how that goes wrong.
 */
function makeObjFireBarrel(imageId: string): Barrel {
  const barrel = new Barrel('receptacle', imageId, MapObjectBreak.UNBREAKABLE, 0);
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true;
  barrel.isMovable = true;
  barrel.isWalkable = true;
  barrel.weight = 4;
  barrel.fireState = MapObjectFire.BURNABLE;
  return barrel;
}

// ── Factories the seam could not hand over: items ───────────────────────────

/** C# `BaseMapGenerator.cs:1743` `MakeItemPipeWrench`. */
function makeItemPipeWrench(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PIPE_WRENCH)!);
}

/** C# `BaseMapGenerator.cs:912` (port `:1426`). */
function makeItemHugeHammer(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_HUGE_HAMMER)!);
}

/** C# `BaseMapGenerator.cs:1640` (port `:1074`). */
function makeItemBigFlashlight(): Item {
  return new ItemLight(Models.items.get(ItemID.LIGHT_BIG_FLASHLIGHT)!);
}

/** C# `BaseMapGenerator.cs:1499` (port `:970`). */
function makeItemShotgun(): Item {
  return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_SHOTGUN)!);
}

/**
 * C# `BaseMapGenerator.cs:1393` `MakeItemCrowbar` (port `:885`).
 *
 * The stack size comes off `ctx.roller` where the C# reads `m_Rules` — see
 * {@link makeJunkyardItem}.
 */
function makeItemCrowbar(ctx: TownBuildingContext): Item {
  const model = Models.items.get(ItemID.MELEE_CROWBAR)!;
  const item = new ItemMeleeWeapon(model);
  item.quantity = ctx.roller.roll(1, model.stackingLimit);
  return item;
}

/**
 * C# `BaseMapGenerator.cs:1547` `MakeItemSprayPaint` (port `:1009`).
 *
 * Two departures from the port's copy, both the C#'s: the colour roll comes off
 * `ctx.roller` rather than `ctx.game.rules` (see {@link makeJunkyardItem}), and
 * `IsForbiddenToAI` (Release 7-6) is set, which the port's factory has not
 * picked up — "no point in them having these".
 */
function makeItemSprayPaint(ctx: TownBuildingContext): Item {
  const paints = [
    ItemID.SPRAY_PAINT1,
    ItemID.SPRAY_PAINT2,
    ItemID.SPRAY_PAINT3,
    ItemID.SPRAY_PAINT4,
  ];
  const paintModel = Models.items.get(paints[ctx.roller.roll(0, SPRAY_PAINT_COLOURS)]) as ItemSprayPaintModel;
  const item = new ItemSprayPaint(paintModel);
  item.isForbiddenToAI = true;
  return item;
}

/**
 * C# `BaseMapGenerator.cs:1678` `MakeItemSpikes` (port `:1101`).
 *
 * The C# rolls the stack size against **barbed wire's** limit rather than spikes'
 * own, and so does this — which is not a no-op, because the two limits are 8 and
 * 3: a roll of 4 to 8 gives the C#'s spikes a stack its own model would not allow.
 * It reads as a copy-paste from `MakeItemBarbedWire` two functions below, and it
 * is transliterated rather than corrected for the same reason the doors and the
 * sign are: the reference's junkyard is the thing being ported.
 */
function makeItemSpikes(ctx: TownBuildingContext): Item {
  const item = new ItemTrap(Models.items.get(ItemID.TRAP_SPIKES)!);
  item.quantity = ctx.roller.roll(1, Models.items.get(ItemID.TRAP_BARBED_WIRE)!.stackingLimit);
  return item;
}

/** C# `BaseMapGenerator.cs:1686` `MakeItemBarbedWire` (port `:1108`). */
function makeItemBarbedWire(ctx: TownBuildingContext): Item {
  const model = Models.items.get(ItemID.TRAP_BARBED_WIRE)!;
  const item = new ItemTrap(model);
  item.quantity = ctx.roller.roll(1, model.stackingLimit);
  return item;
}

/**
 * C# `BaseMapGenerator.cs:1880` `MakeItemSiphonKit`. Not in the port at all; the
 * model row is `ItemID.SIPHON_KIT`, hand-written at `GameItems.ts:846-854`.
 */
function makeItemSiphonKit(): Item {
  const item = new Item(Models.items.get(ItemID.SIPHON_KIT)!);
  item.isForbiddenToAI = true;
  return item;
}

/**
 * C# `BaseMapGenerator.cs:1568` `MakeItemPaintThinner`. Not in the port at all;
 * the model row is `ItemID.PAINT_THINNER` (`GameItems.ts:746`).
 *
 * A thinner rather than a paint, so it is an `ItemSprayPaint` over the thinner's
 * own model and *no* colour roll is taken — which is the whole difference from
 * {@link makeItemSprayPaint}, and the reason the two cannot be one function.
 */
function makeItemPaintThinner(): Item {
  const item = new ItemSprayPaint(Models.items.get(ItemID.PAINT_THINNER) as ItemSprayPaintModel);
  item.isForbiddenToAI = true;
  return item;
}
