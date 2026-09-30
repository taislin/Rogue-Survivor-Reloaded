/**
 * `Feature.FireStation` — C# `BaseTownGenerator.cs:3181-3356` `MakeFireStation`.
 *
 * A fire station is the C#'s only building with an *upper* size bound: an inside
 * rect of at most 6x6, so at most a 10x10 block. Everything else in the C#'s
 * fourteen asks for a minimum, because everything else is a building that wants
 * room; this one is a garage that wants a small one, which is why it lives in the
 * parks cascade rather than the business one — it is built from the leftovers.
 *
 * ## What the C# spends 176 lines on
 *
 * Three roller doors down one wall with an asphalt driveway off them, the
 * police-station's CadetBlue wall (reused, not a new tile model), a concrete
 * floor flagged indoors, one power generator on the first wall-adjacent tile and
 * then workbenches and fire barrels at 10% each, a third of those tiles carrying
 * a fire axe, a hazard suit, a flamethrower or an extinguisher, and — at 5% per
 * interior tile, until one lands — a two-tile fire truck oriented by the *door*
 * side rather than by the room. The zone is named `Fire station`.
 *
 * ## The dispatch is the C#'s parks cascade, and there is no roll of its own
 *
 * C# `:563` reaches it from the middle of the parks region, not from a
 * `switch`:
 *
 * ```csharp
 * if (m_DiceRoller.RollChance(m_Params.ParkBuildingChance))
 * {
 *     if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
 *     {
 *         if (MakeFuelStation(map, b, fuelStationsPlaced)) { … goto Completed; }
 *         if (!fireStationPlaced && MakeFireStation(map, b)) { … goto Completed; }
 *         int rolled = m_DiceRoller.Roll(0, 99);
 *         …
 * ```
 *
 * So it is neither an arm of the shared `roll(0, 4)` the bar and bank split nor
 * a generator with its own chance roll: it shares the one
 * `RollChance(ParkBuildingChance)` that gates the whole region, and it is the
 * only gate between it and the `Roll(0, 99)` green cascade. Its own `roll(0, 4)`
 * (`:3205`) is the *door side*, taken inside the method after the size check.
 *
 * That is why the call site is `BaseTownGenerator.makeFireStation`, folded into
 * the parks loop rather than given a pass of its own at the seam: a pass that
 * rolled `parkBuildingChance` for itself would spend a second die per block and
 * offer the building the blocks the C# had already spent that die on. See the
 * note there.
 *
 * ## `fireStationPlaced` is initialised to `true` in the C#, and that is a bug
 *
 * `:547` is `bool fireStationPlaced = true;` and `:563` is
 * `if (!fireStationPlaced && MakeFireStation(map, b))`, so `!fireStationPlaced` is
 * `false` from the first block and **`MakeFireStation` is dead code in the
 * reference**: `:565`'s `fireStationPlaced = true` can only ever re-assign `true`.
 * The `//only one per district` comment on `:563` is the intent, and the intent
 * needs `false`. This port starts from `false`, in
 * `BaseTownGenerator.makeFireStation`; porting the reference's behaviour here
 * would mean shipping a building the reference never builds.
 *
 * ## The fuel pump this building does not have
 *
 * `MakeFuelPump` (`BaseMapGenerator.cs:1105`, Release 7-1) and `PlaceFuelPump`
 * (`:3175`, Release 7-3) sit *twelve lines above* this method and belong to
 * `MakeFuelStation` (`:2811`) alone — grep the reference and `PlaceFuelPump` has
 * nine call sites, every one of them in `MakeFuelStation`. `MakeFireStation` places
 * a power generator, a workbench, a fire barrel, a fire truck and four pieces of
 * fire kit, and no pump. `Feature.FuelStation` owns the model and is still pending,
 * so inventing one here would be a content addition with a fuel-explosion
 * dependency behind it and nothing in the reference asking for it. Nothing was
 * left out of this port as a result; `tests/fire-station-building.test.ts` says so
 * explicitly, so that the absence cannot become permanent by accident.
 *
 * Nothing here needs `Feature.TileFires` or `Feature.ExtendedAudio` either: the
 * C# method draws no tile fire and names no sound. The fire barrels it places are
 * `MapObject`s with `FireState = BURNABLE` and no fuel, which is `Feature.FireBarrels`
 * rather than either of those.
 *
 * ## The feature gate is here and not at the call site
 *
 * `Feature.FireStation` is on for Still Alive and off for Classic, and a fire
 * station under Classic is a bug rather than a cosmetic difference: it moves
 * dice. The gate is the generator's first statement rather than something every
 * future call site has to remember, for the reason `Feature.TileFires` has
 * exactly one reader — one place to get right instead of N that can disagree.
 * It has to come *before* the size check and therefore before the door-side roll,
 * and it is free to come first: the C#'s first roll is inside the method and
 * after the suitability return, so a Classic district spends nothing here even
 * though it still spends the parks' own `RollChance` on the surrounding
 * building.
 *
 * ## What the seam could not hand over
 *
 * Nine factories the C# reaches for are not on `TownBuildingContext` (see "What
 * is deliberately NOT here" in `../TownBuilding`): three do not exist in the port
 * at all, and six are there but out of a building file's reach — two `protected`
 * on `BaseMapGenerator`, four public methods on it, none on the seam:
 *
 * | C# | port | wanted as |
 * | --- | --- | --- |
 * | `MakeObjRollerDoor` `BaseMapGenerator.cs:421` | — | `ctx.makeObjRollerDoor` |
 * | `MakeObjPowerGenerator` `:789` | `:817`, `protected` | `ctx.makeObjPowerGenerator` |
 * | `MakeObjWorkbench` `:989` | — | `ctx.makeObjWorkbench` |
 * | `MakeObjFireBarrel` `:758` | `:609`, `protected` | `ctx.makeObjFireBarrel` |
 * | `MakeObjFireTruck` `:1133` | — | `ctx.makeObjFireTruck` |
 * | `MakeItemFireAxe` `:2119` | `:1264`, public | `ctx.makeItemFireAxe` |
 * | `MakeItemFireHazardSuit` `:1856` | `:1275`, public | `ctx.makeItemFireHazardSuit` |
 * | `MakeItemFlamethrower` `:1901` | `:1286`, public | `ctx.makeItemFlamethrower` |
 * | `MakeItemFireExtinguisher` `:2300` | `:1269`, public | `ctx.makeItemFireExtinguisher` |
 *
 * All nine are transcribed below. Six of them are the port's own copy verbatim;
 * `makeItemFlamethrower` is the exception, because the C# zeroes the ammo and the
 * port's copy leaves the constructor's `maxAmmo`, so a flamethrower found in a
 * fire station is empty and one found anywhere else is loaded. The divergence is
 * recorded at the factory, and hoisting these onto the context is where it has to
 * be settled.
 *
 * `Map.RemoveMapObjectAt` (`Data/Map.cs:890`) comes along for the driveway tile,
 * which is the two lines the C# writes there four times: the port's `Map` has
 * `removeMapObject` but no by-position form.
 */

import type { Item } from '@data/Item';
import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Session } from '@engine/Session';
import { Barrel, DoorWindow, PowerGenerator } from '@engine/mapobjects/MapObjects';
import { ItemBodyArmor } from '@engine/items/ItemBodyArmor';
import { ItemSprayPaint } from '@engine/items/ItemMisc';
import { ItemMeleeWeapon, ItemRangedWeapon } from '@engine/items/ItemWeapon';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/** C# `:3272` — a third of the wall-adjacent tiles carry a piece of fire kit. */
const FIRE_KIT_CHANCE = 33;
/** C# `:3279` — the flamethrower is the rarest of the four, and 15% on top. */
const FLAMETHROWER_CHANCE = 15;
/** C# `:3291` — a workbench, on the tiles the generator did not take. */
const WORKBENCH_CHANCE = 10;
/** C# `:3293` — an unlit fire barrel, at the same price. */
const FIRE_BARREL_CHANCE = 10;
/** C# `:3304` — "5%" per inside tile, until the truck is down. */
const FIRE_TRUCK_CHANCE = 5;

// ── Per-district state ──────────────────────────────────────────────────────

/**
 * `fireStationPlaced` in the C# is a `bool` the parks region of `generate()`
 * declares and resets for every district (`:547`); `TownBuildingContext` has no
 * place for a `ref`. Keying it on the district's `DiceRoller` gives it exactly
 * the lifetime the C#'s local had — `BaseTownGenerator.generate()` builds a new
 * roller per map, which is where the C# re-declares the variable — and two
 * generators driven in one process keep two flags rather than sharing one. Same
 * shape as `libraryBuilt` in `./makeLibraryBuilding`.
 *
 * **Initialised to `false` here, where the C# writes `true`.** See the module
 * header: in the reference this flag makes `:563` unreachable.
 */
let fireStationBuilt: { roller: DiceRoller; built: boolean } | null = null;

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3181` `MakeFireStation(map, b)`.
 *
 * Returns `true` when the block became a fire station, which is how the C#'s
 * `if (!fireStationPlaced && MakeFireStation(map, b))` says the block is finished
 * with. The one-per-district flag is checked *here* rather than at the call site,
 * as the library's is: the C# tests it at `:563` and this method's first roll is
 * after the suitability return, so the two placements cannot be told apart from
 * the outside.
 */
export function makeFireStationBuilding(ctx: TownBuildingContext): boolean {
  // Behind `Feature.FireStation` from the first statement: see the module header.
  if (!hasFeature(Session.get().ruleset, Feature.FireStation)) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:3186`. An upper bound, and the only one among the C#'s fourteen: a 6x6
  // inside is a 10x10 block, since `Block` insets twice. With the default
  // `minBlockSize` of 11 that is exactly one block size -- the smallest
  // `makeBlocks` cuts, `minBlockSize` less the one-tile road ring on each side --
  // so at the default settings this building is offered the leftovers and nothing
  // else, which is why it lives in the parks cascade and not the business one.
  if (b.insideRect.width > 6 || b.insideRect.height > 6) return false;

  // C# `:563`'s `!fireStationPlaced`, the Release 7-3 "only one per district" cap.
  // The C# checks it at the *call site*; in here it is the same answer, because
  // this method's only roll is the door side below and that is spent after this
  // — so a district that already has a fire station spends no dice on the
  // blocks it declines.
  if (fireStationBuilt === null || fireStationBuilt.roller !== roller) fireStationBuilt = { roller, built: false };
  if (fireStationBuilt.built) return false;
  fireStationBuilt.built = true;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:3192-3194`. The police station's wall, reused: `WALL_POLICE_STATION` is
  // the fork's CadetBlue stone (`GameTiles.ts:225`), which is the one the C#'s
  // own `MakePoliceStation` draws, so a fire station is a police station's
  // material and nothing else. The `isInside` decorator goes on the floor fill
  // rather than the walls, for the reason `makeChurchBuilding` puts it there: it
  // is what makes the bay dark at night, and it leaves the doorway reading as a
  // hole in an outdoor wall from the street.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_POLICE_STATION)!, b.buildingRect);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, b.insideRect, (tile) => {
    tile.isInside = true;
  });

  ///////////////////////////////
  // 2. Entry door with shop ids
  //    Add driveway
  ///////////////////////////////
  // C# `:3201-3202`. `b.Rectangle`'s centre rather than the building rect's, and
  // C# integer division, so `Math.trunc` rather than `Math.floor` to say so.
  const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

  // make doors on one side. C# `:3205`, the C#'s own roll and the only one the
  // dispatch does not make. `roll(0, 4)` is half-open, so 0..3 and the four arms
  // are exhaustive.
  const doorside = roller.roll(0, 4);
  const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;
  // The C# writes each arm out in full; they differ only in the axis the three
  // doors step along and in the one tile outside the wall they open onto, so
  // what varies is these two values. The door cells are listed in the C#'s own
  // order — the centre one first, then the two beside it — and that order is
  // kept even though no dice turn on it, because the arms read as four
  // transcriptions of one another otherwise.
  let doorCells: readonly Point[];
  let driveway: Point;
  switch (doorside) {
    case 0: // west. C# `:3208-3219`
      doorCells = [
        new Point(b.buildingRect.left, midY),
        new Point(b.buildingRect.left, midY - 1),
        new Point(b.buildingRect.left, midY + 1),
      ];
      driveway = new Point(b.buildingRect.left - 1, midY);
      break;
    case 1: // east. C# `:3220-3231`
      doorCells = [
        new Point(b.buildingRect.right - 1, midY),
        new Point(b.buildingRect.right - 1, midY - 1),
        new Point(b.buildingRect.right - 1, midY + 1),
      ];
      driveway = new Point(b.buildingRect.right, midY);
      break;
    case 2: // north. C# `:3232-3243`
      doorCells = [
        new Point(midX, b.buildingRect.top),
        new Point(midX - 1, b.buildingRect.top),
        new Point(midX + 1, b.buildingRect.top),
      ];
      driveway = new Point(midX, b.buildingRect.top - 1);
      break;
    default: // south. C# `:3244-3255`
      doorCells = [
        new Point(midX, b.buildingRect.bottom - 1),
        new Point(midX - 1, b.buildingRect.bottom - 1),
        new Point(midX + 1, b.buildingRect.bottom - 1),
      ];
      driveway = new Point(midX, b.buildingRect.bottom);
      break;
  }
  for (const cell of doorCells) ctx.placeDoor(map, cell.x, cell.y, concrete, makeObjRollerDoor());

  // place driveway. C# `:3215-3217` and its three twins: clear whatever is
  // standing there ("get rid of cars" — the driveway is one tile *outside* the
  // building rect, on the block's edge, which is where `AddWreckedCarsOutside`
  // will have parked one), then asphalt.
  removeMapObjectAt(map, driveway.x, driveway.y);
  map.setTileModelAt(driveway.x, driveway.y, Models.tiles.get(TileID.FLOOR_ASPHALT)!);

  // add building image next to doors.
  // C# `:3259`. The same `>= 1` test the church and the bank use: a wall tile
  // with nothing on it and a door next to it, which for a three-tile roller door
  // is the two tiles above and below the middle one.
  ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
    map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_FIRE_STATION : null
  );

  ///////////
  // 3. Add workbenches, generators and fire truck
  ///////////
  // C# `:3266-3297`. `MapObjectFill` walks the inside rect column-major (x
  // outer, y inner) and calls this per tile, so the roll order below is the
  // walk order and the *first* eligible tile takes the generator without
  // spending a die at all.
  let placedGenerator = false; // we only want to place one generator
  ctx.mapObjectFill(map, b.insideRect, (pt) => {
    // C# `:3270-3271`. A strict `< 3`, so a tile in the middle of the floor is
    // never a candidate: the furniture goes against the walls.
    if (ctx.countAdjWalls(map, pt.x, pt.y) < 3) return null;

    // C# `:3272-3284`. The four pieces of kit, and it is the C#'s order:
    // 33% first, then the `roll(0, 4)` that picks which, then the flamethrower's
    // own 15% *inside* case 2 — so case 2 costs two dice and the other three cost
    // one. The item is dropped whether or not the `MapObjectFill` that asked for
    // it goes on to place the workbench or the barrel, which is why the drop is
    // above the return rather than inside it.
    if (roller.rollChance(FIRE_KIT_CHANCE)) {
      switch (roller.roll(0, 4)) {
        case 0:
          map.dropItemAt(makeItemFireAxe(), pt);
          break;
        case 1:
          map.dropItemAt(makeItemFireHazardSuit(), pt);
          break;
        case 2:
          if (roller.rollChance(FLAMETHROWER_CHANCE)) map.dropItemAt(makeItemFlamethrower(), pt);
          break;
        case 3:
          map.dropItemAt(makeItemFireExtinguisher(), pt);
          break;
        default:
          // The C#'s own `default: throw new InvalidOperationException`, kept
          // because it is what makes the switch exhaustive. `roll(0, 4)` cannot
          // reach it.
          throw new Error('unhandled roll');
      }
    }

    if (!placedGenerator) {
      placedGenerator = true;
      return makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON);
    } else if (roller.rollChance(WORKBENCH_CHANCE)) return makeObjWorkbench(GameImages.OBJ_WORKBENCH);
    else if (roller.rollChance(FIRE_BARREL_CHANCE)) return makeObjFireBarrel(GameImages.OBJ_EMPTY_BARREL);
    else return null;
  });

  // C# `:3299-3342`. At most one, and it is two tiles: `MakeObjFireTruck`'s own
  // comment (`BaseMapGenerator.cs:1133`) has the truck as a 32x64 east-west or
  // 64x32 north-south image cut in half, laid down back-to-front. Which pair of
  // halves is a function of the *door side*, not of the room, which is why the
  // C#'s `switch (doorside)` reads a local from `:3205` two hundred lines up.
  //
  // The loop order is column-major in the C# (`x` outer) and stays that way: the
  // truck lands on the first eligible tile in that order and the order is the
  // dice. `!placedFireTruck &&` short-circuits, so the remaining tiles are
  // walked without spending a die on each — which is why this is a `continue`
  // rather than a `break` that would have been the same map and one roll short.
  let placedFireTruck = false; // we only want to place one at most
  for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
    for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
      if (placedFireTruck || !roller.rollChance(FIRE_TRUCK_CHANCE)) continue;

      // C# `:3306-3307`. A *loose* wall test here, unlike the strict `< 3` above:
      // the truck wants the open middle of the room, not a corner.
      if (ctx.countAdjWalls(map, x, y) > 2) continue;

      const back = map.getTileAt(x, y);
      // C# `:3310`. `IsInside` as well as `IsWalkable`: an inside-rect tile that
      // is not flagged inside is one the walls have since eaten.
      if (!back || !back.isInside || !back.model.isWalkable || map.getMapObjectAt(x, y) !== null) continue;

      // A west or east door means the truck lies east-west and the front is the
      // tile to the *right* (`:3317`); a north or south door means north-south
      // and the front is the tile *below* (`:3329`).
      const eastWest = doorside === 0 || doorside === 1;
      const frontX = eastWest ? x + 1 : x;
      const frontY = eastWest ? y : y + 1;
      // Never off the map: the inside rect is one tile in from the building rect,
      // so `x + 1` and `y + 1` land on the building rect's far wall, which is on
      // it. The C# relies on the same arithmetic and would throw on a null tile.
      const front = map.getTileAt(frontX, frontY);
      if (!front || !front.isInside || !front.model.isWalkable || map.getMapObjectAt(frontX, frontY) !== null) continue;

      map.placeMapObject(
        makeObjFireTruck(eastWest ? GameImages.OBJ_FIRE_TRUCK_EW_BACK : GameImages.OBJ_FIRE_TRUCK_NS_BACK),
        new Point(x, y)
      );
      map.placeMapObject(
        makeObjFireTruck(eastWest ? GameImages.OBJ_FIRE_TRUCK_EW_FRONT : GameImages.OBJ_FIRE_TRUCK_NS_FRONT),
        new Point(frontX, frontY)
      );
      placedFireTruck = true;
    }
  }

  ///////////
  // 4. Zone
  ///////////
  // demark building. C# `:3349-3350`. The C#'s string is `"Fire station"` with a
  // lower-case second word, unlike `"Church"` and `"Bank"`; the `@x-y` suffix is
  // `makeUniqueZone`'s.
  map.addZone(ctx.makeUniqueZone('Fire station', b.buildingRect));
  // walkway zones. C# `:3352`.
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:3355`.
  return true;
}

// ── Factories the context does not carry yet ────────────────────────────────
//
// Transcribed from the C# for the reason the module header gives. Three of the
// nine do not exist in the port at all; the other six are here but out of a
// building file's reach — two `protected` on `BaseMapGenerator`, four public
// methods on it, none of them on the seam — and every one of the six is
// property-for-property the same as its copy there except `makeItemFlamethrower`,
// which is not.

/**
 * C# `BaseMapGenerator.cs:421` `MakeObjRollerDoor`. Release 4.
 *
 * The C#'s sixth constructor argument is `DoorWindow.STATE_CLOSED`, and the
 * port's `DoorWindow` has no such parameter — it sets `STATE_CLOSED` in its own
 * constructor, so the default is the C#'s explicit value and the argument has
 * nowhere to go.
 *
 * `IsMetal` (Release 5-4) is not carried by the port's `MapObject`; see
 * {@link makeObjFireBarrel} for why it is left off here too.
 */
function makeObjRollerDoor(): DoorWindow {
  return new DoorWindow(
    'roller door',
    GameImages.OBJ_ROLLER_DOOR_CLOSED,
    GameImages.OBJ_ROLLER_DOOR_OPEN,
    GameImages.OBJ_ROLLER_DOOR_BROKEN,
    6 * DoorWindow.BASE_HITPOINTS
  );
}

/**
 * C# `BaseMapGenerator.cs:789` `MakeObjPowerGenerator`. Release 5-7.
 *
 * Identical to the port's own `protected` copy at
 * `BaseMapGenerator.makeObjPowerGenerator` (`:817`), flag included — both drop
 * `IsMetal` because the port's `MapObject` has no such field.
 */
function makeObjPowerGenerator(offImageId: string, onImageId: string): PowerGenerator {
  return new PowerGenerator('power generator', offImageId, onImageId);
}

/** C# `BaseMapGenerator.cs:989` `MakeObjWorkbench`. The whole of it is the container. */
function makeObjWorkbench(workbenchImageId: string): MapObject {
  const workbench = new MapObject('workbench', workbenchImageId);
  workbench.isContainer = true; //@@MP (Release 5-3)
  return workbench;
}

/**
 * C# `BaseMapGenerator.cs:758` `MakeObjFireBarrel`. Release 7-6.
 *
 * Unbreakable, burnable, four kilos, and walkable, which is what makes it a
 * thing you stand on rather than an obstacle. `isContainer` is "in case items
 * were left there when the barrel was unlit", the C#'s own comment.
 *
 * Also the reference for the two flags the port's `MapObject` cannot carry, and
 * every factory below inherits that answer: `IsMetal` (Release 5-4) and
 * `HoverDescription` (Release 7-6) are not fields here. `isMetal` in particular
 * is read by other features — fuel stations, the camp fuel-pump explosion — and
 * adding a flag to a core class as a side effect of a generator is how that goes
 * wrong, so it is left for whoever wires those features.
 */
function makeObjFireBarrel(barrelImageId: string): Barrel {
  const barrel = new Barrel('receptacle', barrelImageId, MapObjectBreak.UNBREAKABLE, 0);
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true; // in case items were left there when the barrel was unlit
  barrel.isMovable = true;
  barrel.isWalkable = true;
  barrel.weight = 4;
  barrel.fireState = MapObjectFire.BURNABLE;
  return barrel;
}

/**
 * C# `BaseMapGenerator.cs:1133` `MakeObjFireTruck`. Release 7-3.
 *
 * `JumpLevel = 1` and `StandOnFovBonus = true` are the load-bearing pair: the
 * truck is tall enough to see over and opaque enough to hide behind, and it is
 * the one object in a fire station that a survivor gets a sightline from.
 */
function makeObjFireTruck(fireTruckImageId: string): MapObject {
  const fireTruck = new MapObject('fire truck', fireTruckImageId);
  fireTruck.jumpLevel = 1;
  fireTruck.standOnFovBonus = true;
  fireTruck.isMovable = false;
  return fireTruck;
}

/** C# `BaseMapGenerator.cs:2119` `MakeItemFireAxe`. */
function makeItemFireAxe(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FIRE_AXE)!);
}

/** C# `BaseMapGenerator.cs:1856` `MakeItemFireHazardSuit`. */
function makeItemFireHazardSuit(): Item {
  const suit = new ItemBodyArmor(Models.items.get(ItemID.ARMOR_FIRE_HAZARD_SUIT)!);
  suit.isForbiddenToAI = true;
  return suit;
}

/**
 * C# `BaseMapGenerator.cs:1901` `MakeItemFlamethrower`.
 *
 * **The one factory here that is not a copy of the port's.** The C# sets
 * `Ammo = 0` — a flamethrower is found empty and has to be fueled from a fuel
 * can — and the port's `ItemRangedWeapon` constructor defaults `ammo` to
 * `model.maxAmmo`, so the port's own `makeItemFlamethrower`
 * (`BaseMapGenerator.ts:1286`) hands out a loaded one. The C#'s zero is what
 * this generator uses, and hoisting the factory onto the context has to settle
 * which of the two the rest of the port means.
 */
function makeItemFlamethrower(): Item {
  const flamethrower = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_FLAMETHROWER)!);
  flamethrower.ammo = 0;
  return flamethrower;
}

/** C# `BaseMapGenerator.cs:2300` `MakeItemFireExtinguisher`. Release 7-6. */
function makeItemFireExtinguisher(): Item {
  const extinguisher = new ItemSprayPaint(Models.items.get(ItemID.FIRE_EXTINGUISHER)!);
  // No point in the AI having these: there is no code to handle them.
  extinguisher.isForbiddenToAI = true;
  return extinguisher;
}

/**
 * C# `Map.RemoveMapObjectAt` (`Data/Map.cs:890`), kept as a named helper for the
 * one place the C# writes it — the driveway tile — so the C# line it stands for
 * is findable. The port's `Map` has `removeMapObject` but no by-position form.
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const mapObj = map.getMapObjectAt(x, y);
  if (mapObj === null) return;
  map.removeMapObject(mapObj);
}
