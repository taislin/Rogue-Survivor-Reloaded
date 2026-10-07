/**
 * `Feature.MechanicWorkshop` - C# `BaseTownGenerator.cs:2670-2809`
 * `MakeMechanicWorkshop` (Release 4).
 *
 * A mechanic workshop is a garage: a stone shell with a concrete floor, three
 * roller doors down one rolled side with a tile of asphalt outside them where the
 * street was, a `DECO_MECHANIC` sign on the wall beside the doors, one power
 * generator, workbenches and fire barrels along the walls with construction tools
 * dropped on the same tiles, and wrecked cars parked on the floor. The zone is
 * `Mechanic`.
 *
 * ## It is fork content, which is what the feature gate says
 *
 * **Vanilla has no `MakeMechanicWorkshop`.** `src\Gameplay\Generators\BaseTownGenerator.cs`
 * - the untouched alpha10 reference, and the tree with no `//@@MP` marker in it at
 * all - has no method of that name and no `Workshop` anywhere; the fork added it in
 * Release 4. The comment this dispatch used to carry called it "vanilla and not
 * part of this port's set", which was wrong in both halves, and the arm was left
 * empty on the strength of it.
 *
 * So it is a `Feature` like its three siblings, off for Classic and on for Still
 * Alive, and a workshop under Classic would move dice - which is the reason the
 * gate is the generator's first statement rather than a condition at the call
 * site, the same reason `Feature.TileFires` has exactly one reader.
 *
 * ## The `dispatchRoll` is the C#'s `switch (roll2) case 3`
 *
 * C# `:508-515` reaches the workshop as one case of a per-block dispatch that the
 * bar (`:511`), the bank (`:512`) and the clinic (`:513`) also want:
 *
 * ```csharp
 * int roll2 = m_DiceRoller.Roll(0, 4);
 * switch (roll2)
 * {
 *     case 0: placed = MakeBarBuilding(map, b, ref barsCount); break;
 *     case 1: placed = MakeBankBuilding(map, b, ref banksCount); break;
 *     case 2: placed = MakeClinicBuilding(map, b, ref clinicsCount); break;
 *     case 3: placed = MakeMechanicWorkshop(map, b, ref mechanicsCount); break;
 * }
 * ```
 *
 * So the case arrives as a parameter and this generator never rolls for its own
 * dispatch: the die is spent once per block by `BaseTownGenerator.generate()`,
 * ahead of every arm's size and cap check, which is what makes the four mutually
 * exclusive. Rolling again in here would spend two dice where the C# spends one
 * and would let the workshop and the clinic be handed the same block.
 *
 * An empty case 3 was a *fall-through to the general store and then the office*,
 * because `placed` stayed false and the caller kept going. The arm now runs, so
 * the store and the office get only the blocks the workshop declines for itself.
 *
 * ## Both bounds, and a cap the C# writes as a `ref`
 *
 * `:2675-2678` is the one place among the C#'s fourteen that puts an *upper* bound
 * on the inside rect - 5..7 on each axis - and a garage wanting a small bay is the
 * whole reason. It is checked before the cap, in that order, so a block too big
 * costs the district no charge against `mechanicsLimit`.
 *
 * `:2679` caps the district at `Round((map.Width / 10) / 4)` workshops, with
 * `map.Width / 10` as C# integer division and therefore truncated before the
 * divide by 4 - `Math.floor` is the honest spelling of that, as in
 * `makeClinicBuilding`. The count is a `ref` the caller owns and resets per
 * district; here it is a module-level record keyed on the district's roller, which
 * is how the bar, the bank, the clinic and the fire station do it.
 *
 * ## The two fills
 *
 * `:2762-2780` puts furniture against the walls: a tile with fewer than three
 * wall neighbours is never a candidate, every candidate takes a construction tool
 * one time in five on the way past, the first one takes the district's single
 * power generator, and the rest are a 10% fire barrel over a workbench. The drop
 * is *not* inside an `else` - a tile that takes the 20% goes on to take a barrel
 * or a bench as well.
 *
 * `:2782-2795` is the second pass and it is the workshop's own, not shared with
 * the furniture: `RollChance(WreckedCarChance)` per interior tile, and the car
 * only lands where the tile is flagged indoors *and* is walkable.
 */

import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Session } from '@engine/Session';
import { Barrel, Car, DoorWindow, PowerGenerator } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

/** C# `:2679` - `map.Width / 10`, C# integer division. */
const MECHANICS_PER_MAP_WIDTH = 10;
/** C# `:2679` - the `/ 4` the truncation is divided by. */
const MECHANICS_PER_WIDTH_DIVISOR = 4;
/** C# `:2768` - `RollChance(20)`, a tool dropped on a wall-adjacent tile. */
const CONSTRUCTION_TOOL_CHANCE = 20;
/** C# `:2776` - `RollChance(10)`, a fire barrel rather than a workbench. */
const FIRE_BARREL_CHANCE = 10;

/**
 * C# `:514`'s `ref int mechanicsCount`, which the caller resets per district.
 * The district's roller is the key for the reason `clinicsBuilt`'s is: it is read
 * once, when the context is built, and it is a new object per `generate()`.
 */
let mechanicsBuilt: { roller: DiceRoller; count: number } | null = null;

/**
 * C# `BaseTownGenerator.cs:2670-2809` `MakeMechanicWorkshop`. Returns whether the
 * block was taken, as the C# does.
 */
export function makeMechanicWorkshop(ctx: TownBuildingContext, dispatchRoll: number): boolean {
  // Behind `Feature.MechanicWorkshop` from the first statement: see the module header.
  if (!hasFeature(Session.get().ruleset, Feature.MechanicWorkshop)) return false;

  const { map, block: b, roller } = ctx;

  // C# `:514`, `case 3` of the shared `roll(0, 4)`. The die is spent by the
  // caller, not here; see the module header.
  if (dispatchRoll !== 3) return false;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:2675-2678`. The upper bound first, in the C#'s order: 5..7 on both axes.
  if (b.insideRect.width > 7 || b.insideRect.height > 7) return false;
  if (b.insideRect.width < 5 || b.insideRect.height < 5) return false;

  // C# `:2679`. Integer division first, so the truncation is the C#'s and not a
  // rounding of the ratio.
  const mechanicsLimit = Math.round(
    Math.floor(map.width / MECHANICS_PER_MAP_WIDTH) / MECHANICS_PER_WIDTH_DIVISOR
  );
  if (mechanicsBuilt === null || mechanicsBuilt.roller !== roller) mechanicsBuilt = { roller, count: 0 };
  if (mechanicsBuilt.count >= mechanicsLimit) return false;
  ++mechanicsBuilt.count;

  /////////////////////////////
  // 1. Walkway, floor & walls
  /////////////////////////////
  // C# `:2688-2690`. Walkway over the whole block, a stone shell on the building
  // rect, then concrete inside with `IsInside` on the floor fill - the same
  // arrangement as the fire station, which is the other garage in the C#.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, b.buildingRect);
  ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_CONCRETE)!, b.insideRect, (tile) => {
    tile.isInside = true;
  });

  ///////////////////////////////
  // 2. Entry door with shop ids
  //    Add driveway
  ///////////////////////////////
  // C# `:2697-2698`. `b.Rectangle`'s centre rather than the building rect's, and
  // C# integer division, so `Math.trunc` rather than a bare `/`.
  const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
  const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

  // make doors on one side. C# `:2701`. `roll(0, 4)` is half-open in both trees -
  // the reference rolls `Random.Next(min, max)`, which is exclusive of `max` - so
  // 0..3 and the four sides are exhaustive, which is why the C#'s `switch` has no
  // `default` and this one needs a `default` only because the port's `switch` is
  // typed.
  const doorside = roller.roll(0, 4);
  const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;
  // The C# writes each arm out in full; they differ only in the axis the three
  // doors step along and in the one tile outside the wall they open onto, so what
  // varies is these two values. The door cells are in the C#'s own order - centre
  // first, then the two beside it - kept even though no dice turn on it, because
  // otherwise the four arms stop reading as transcriptions of one another.
  let doorCells: readonly Point[];
  let driveway: Point;
  switch (doorside) {
    case 0: // west. C# `:2704-2715`
      doorCells = [
        new Point(b.buildingRect.left, midY),
        new Point(b.buildingRect.left, midY - 1),
        new Point(b.buildingRect.left, midY + 1),
      ];
      driveway = new Point(b.buildingRect.left - 1, midY);
      break;
    case 1: // east. C# `:2716-2727`
      doorCells = [
        new Point(b.buildingRect.right - 1, midY),
        new Point(b.buildingRect.right - 1, midY - 1),
        new Point(b.buildingRect.right - 1, midY + 1),
      ];
      driveway = new Point(b.buildingRect.right, midY);
      break;
    case 2: // north. C# `:2728-2739`
      doorCells = [
        new Point(midX, b.buildingRect.top),
        new Point(midX - 1, b.buildingRect.top),
        new Point(midX + 1, b.buildingRect.top),
      ];
      driveway = new Point(midX, b.buildingRect.top - 1);
      break;
    default: // south. C# `:2740-2751`
      doorCells = [
        new Point(midX, b.buildingRect.bottom - 1),
        new Point(midX - 1, b.buildingRect.bottom - 1),
        new Point(midX + 1, b.buildingRect.bottom - 1),
      ];
      driveway = new Point(midX, b.buildingRect.bottom);
      break;
  }
  for (const cell of doorCells) ctx.placeDoor(map, cell.x, cell.y, concrete, makeObjRollerDoor());

  // place driveway. C# `:2711-2713` and its three twins: clear whatever is
  // standing there ("get rid of cars" - the driveway is one tile *outside* the
  // building rect, on the block's edge, where `AddWreckedCarsOutside` will have
  // parked one), then asphalt.
  removeMapObjectAt(map, driveway.x, driveway.y);
  map.setTileModelAt(driveway.x, driveway.y, Models.tiles.get(TileID.FLOOR_ASPHALT)!);

  // add building image next to doors. C# `:2755`. The `>= 1` test the fire
  // station and the church use: a wall tile with nothing on it and a door beside
  // it, which for a three-tile roller door is the two tiles either side of the
  // middle one.
  ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
    map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_MECHANIC : null
  );

  ///////////
  // 3. Add workbenches and cars
  ///////////
  // C# `:2762-2780`. `MapObjectFill` walks the inside rect column-major (x outer,
  // y inner) and calls this per tile, so the roll order below is the walk order
  // and the *first* eligible tile takes the generator without spending a die.
  let placedGenerator = false; //@@MP - we only want to place one generator (Release 6-2)
  ctx.mapObjectFill(map, b.insideRect, (pt) => {
    // C# `:2766-2767`. A strict `< 3`, so the middle of the floor is never a
    // candidate: the furniture goes against the walls.
    if (ctx.countAdjWalls(map, pt.x, pt.y) < 3) return null;

    // C# `:2768-2769`, the `else if` the C# binds to the wall test. The drop is
    // *not* inside an `else` of its own: a tile that takes the 20% goes on to
    // take a generator, a barrel or a workbench as well.
    if (roller.rollChance(CONSTRUCTION_TOOL_CHANCE)) map.dropItemAt(ctx.makeShopConstructionItem(), pt);

    // C# `:2771-2779`. One generator for the room, then a 10% fire barrel over a
    // workbench, and a workbench is the floor rather than the fallback - every
    // wall-adjacent tile ends up with something on it.
    if (!placedGenerator) {
      placedGenerator = true;
      return makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON);
    } else if (roller.rollChance(FIRE_BARREL_CHANCE)) return makeObjFireBarrel(GameImages.OBJ_EMPTY_BARREL);
    else return makeObjWorkbench(GameImages.OBJ_WORKBENCH);
  });

  // C# `:2782-2795`. The second fill, and the workshop's own: the roll is spent
  // before the tile is looked at, exactly as in the C#, so a car that does not
  // fit has still cost the die.
  ctx.mapObjectFill(map, b.insideRect, (pt) => {
    if (!roller.rollChance(ctx.params.wreckedCarChance)) return null;
    const tile = map.getTileAt(pt.x, pt.y);
    // C# `:2788`. `IsInside` as well as `IsWalkable` - an inside-rect tile that
    // is not flagged inside is one the walls have since eaten.
    if (!tile || !tile.isInside || !tile.model.isWalkable) return null;
    return makeObjWreckedCar(roller);
  });

  ///////////
  // 4. Zone
  ///////////
  // demark building. C# `:2802-2803`. The `@x-y` suffix is `makeUniqueZone`'s.
  map.addZone(ctx.makeUniqueZone('Mechanic', b.buildingRect));
  // walkway zones. C# `:2805`.
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:2808`.
  return true;
}

// ── Factories the context does not carry yet ────────────────────────────────
//
// Transcribed from the C# for the reason the fire station's copy of the same
// section gives: two are `protected` on `BaseMapGenerator` and the rest are not
// on the seam, and every one of them is property-for-property the same as its
// copy there.

/**
 * C# `BaseMapGenerator.cs:421` `MakeObjRollerDoor`. Release 4.
 *
 * Byte-identical to `makeFireStationBuilding.ts`'s, `makeFarmBuilding.ts`'s and
 * `makeJunkyard.ts`'s. The C#'s sixth constructor argument is
 * `DoorWindow.STATE_CLOSED`, which the port's `DoorWindow` sets in its own
 * constructor, so it has nowhere to go; `IsMetal` (Release 5-4) is not carried
 * either, for the reason `makeObjFireBarrel` records.
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

/** C# `BaseMapGenerator.cs:989` `MakeObjWorkbench`. The whole of it is the container. */
function makeObjWorkbench(workbenchImageId: string): MapObject {
  const workbench = new MapObject('workbench', workbenchImageId);
  workbench.isContainer = true; //@@MP (Release 5-3)
  return workbench;
}

/** C# `BaseMapGenerator.cs:789` `MakeObjPowerGenerator`. Release 6-2 gives the workshop one. */
function makeObjPowerGenerator(offImageId: string, onImageId: string): PowerGenerator {
  return new PowerGenerator('power generator', offImageId, onImageId);
}

/**
 * C# `BaseMapGenerator.cs:758` `MakeObjFireBarrel`. Release 7-6.
 *
 * Unbreakable, burnable, four kilos, walkable. `isContainer` is "in case items
 * were left there when the barrel was unlit", the C#'s own comment. `IsMetal`
 * (Release 5-4) and `HoverDescription` (Release 7-6) are not fields the port's
 * `MapObject` has, and every factory in this section inherits that answer - see
 * `makeFireStationBuilding.ts`, which is where the reasoning is written out.
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

/** C# `BaseMapGenerator.cs:552`, `MakeObjWreckedCar`'s five models. */
const WRECKED_CARS = [
  GameImages.OBJ_CAR_BLUE_PHASE0,
  GameImages.OBJ_CAR_GREEN_PHASE0,
  GameImages.OBJ_CAR_RED_PHASE0,
  GameImages.OBJ_CAR_WHITE_PHASE0,
  GameImages.OBJ_POLICE_CAR_PHASE0,
];

/** C# `:559` - `roller.Roll(0, 30)`, a wrecked car's tank. */
const WRECKED_CAR_FUEL_MAX = 30;

/**
 * C# `BaseMapGenerator.cs:557-560` `MakeObjWreckedCar`, through `MakeObjCar`
 * (`:565-577`) for the field list. The port's own copy at `BaseMapGenerator`
 * rolls the fuel first and picks from vanilla's four cars rather than the fork's
 * five phase-0 models, which is why this is a transcription and not a call.
 *
 * **`isMetal` is the one field here that `makeJunkyard.ts:495`'s otherwise
 * identical copy of this factory leaves off**, and the C# sets it: `MakeObjCar`
 * `:575`, Release 5-4. It is carried because the reference carries it - a wrecked
 * car is metal, and `isMetal` is what the push and break paths ask - so the two
 * port copies of this factory now disagree and the disagreement is this comment
 * rather than a silent one. Aligning them is a one-line change to the other.
 *
 * The port's `roll` is `[min, max)`, so `roll(0, 5)` is the five models the C#'s
 * `Roll(0, CARS.Length)` reaches, and `roll(0, 30)` is `Roll(0,30)` at `:559`.
 */
function makeObjWreckedCar(roller: DiceRoller): MapObject {
  const imageId = WRECKED_CARS[roller.roll(0, WRECKED_CARS.length)];
  const car = new Car('wrecked car', imageId, MapObjectBreak.BROKEN, roller.roll(0, WRECKED_CAR_FUEL_MAX));
  car.isMaterialTransparent = true;
  car.jumpLevel = 1;
  car.isMovable = true;
  car.weight = 100;
  car.standOnFovBonus = true;
  car.isMetal = true; //@@MP (Release 5-4), C# `:575`
  return car;
}

/**
 * C# `Map.RemoveMapObjectAt` (`Data/Map.cs:890`). The port's `Map` has
 * `removeMapObject(obj)` and no by-position form, so every building file that
 * transcribes a `RemoveMapObjectAt` writes this same four-line helper.
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const mapObj = map.getMapObjectAt(x, y);
  if (mapObj === null) return;
  map.removeMapObject(mapObj);
}
