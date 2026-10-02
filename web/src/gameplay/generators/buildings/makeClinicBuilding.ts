/**
 * `Feature.Clinic` — C# `BaseTownGenerator.cs:3358` `MakeClinicBuilding`.
 *
 * A clinic is one room with a reception desk in it: a hospital door on one rolled
 * side, a reception desk a tile diagonally inside it, a power generator on the
 * first cell a corner scan reaches, pharmacy cupboards on the later ones that draw
 * 40%, and then `Round(count * 0.8)` beds, each with a curtain and a piece of
 * machinery in the ring around it and a pharmacy item dropped on the mattress. The
 * four arms of the C#'s `switch (doorside)` differ only in the door cell and the
 * desk cell, so they are one table and one `switch` below.
 *
 * ## The `dispatchRoll` is the C#'s `switch (roll2) case 2`
 *
 * C# `:510`/`:513` reaches the clinic as one case of a per-block dispatch that
 * the bar (`:511`), the bank (`:512`) and the mechanic workshop (`:514`) also
 * want:
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
 * dispatch. Rolling a second `roll(0, 4)` here to pick a case would spend two
 * dice where the C# spends one and would let the clinic and the bank be offered
 * the same block, which is the whole content of the `switch` — two agents doing
 * that independently is what produced two dispatch rolls per block before
 * `BaseTownGenerator.generate()` grew the shared cascade. The die is spent by the
 * pass in `BaseTownGenerator.generate()`, and it is spent *before* the size check
 * because that is the order the C# consumed it.
 *
 * ## The feature gate is here and not at the call site
 *
 * `Feature.Clinic` is on for Still Alive and off for Classic, and a clinic under
 * Classic is a bug rather than a cosmetic difference: it moves dice. The gate is
 * the generator's first statement for the reason `Feature.TileFires` has exactly
 * one reader — one place to get right instead of N that can disagree. It has to
 * come *before* the dispatch case is even looked at, and the second gate is at
 * the call site: the cascade's `roll(0, 4)` is necessarily outside each arm's
 * gate, since that is what makes the four arms mutually exclusive, so the whole
 * arm is gated by `cascadeEnabled` in `BaseTownGenerator.generate()`. Skip that
 * one line and every Classic world spends a die per block for a building neither
 * ruleset has.
 *
 * ## The held area the C# never holds back
 *
 * C# `:3386-3390` declares four locals — "hold the area within the clinic, after
 * the door position is determined we'll use this held area to place objects" — and
 * then, unlike the bar (`:2415-2416`, where the shelves take four tiles) and the
 * bank (`:4296`, where the safes take six), it never adjusts them. `insideRoom` at
 * `:3458` is therefore `b.InsideRect` exactly, and the two `nbTables` arms at
 * `:3448`/`:3452` reduce to `Max(-InsideRect.Width, InsideRect.Height)` and
 * `Max(InsideRect.Width, InsideRect.Height)` because `left - right` is `-width`.
 *
 * The locals are transliterated rather than simplified away: they are what makes
 * the two `nbTables` arms legible as arms, and a C# that started shrinking them
 * would have somewhere to land. The consequences are called out at each use.
 *
 * ## What the seam could not hand over
 *
 * The factories the C# reaches for are `protected` on the port's generators and
 * absent from `TownBuildingContext` — see "What is deliberately NOT here" in
 * `../TownBuilding`: the map objects `makeObjReceptionDesk`
 * (`BaseMapGenerator.cs:1038`), `makeObjPowerGenerator` (`:789`), `makeObjShelf`
 * (`:595`), `makeObjCurtain` (`:1058`), `makeObjMachinery` (`:1049`) and
 * `makeObjBed` (`:643`), and the item factories behind `makeShopPharmacyItem`
 * (`BaseTownGenerator.cs:7435`) and `makeItemLargeMedikit`
 * (`BaseMapGenerator.cs:1331`). They are re-declared below, transliterated, so
 * the C# method is ported whole rather than truncated. They are the candidates
 * for the next addition to `TownBuildingContext`; promoting them means deleting
 * the copies here, and `makeObjShelf` is the one where the port's own `protected`
 * copy (`:635`) already differs from the C#'s — see {@link makeObjShelf}.
 *
 * `IsADoorNSEW` (`MapGenerator.cs:450`) does *not* need copying, for the reason
 * `BarBuilding`'s header gives: it asks about the four compass neighbours and
 * nothing else, which is `CountAdjDoors(map, x, y) > 0` exactly, and
 * `countAdjDoors` is on the context. `Rectangle.Intersect` does come along — the
 * port's `Rect` has no mutating intersect and `BaseTownGenerator.intersectRect`
 * is private.
 */

import type { Item } from '@data/Item';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { GameMode, Session } from '@engine/Session';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { ItemMedicine } from '@engine/items/ItemMedicine';
import { ItemSprayScent } from '@engine/items/ItemMisc';
import { DoorWindow, PowerGenerator } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/** C# `:3365` — "cap the number per map based on its dimensions". */
const CLINICS_PER_MAP_WIDTH = 10;
const CLINICS_PER_WIDTH_DIVISOR = 2.5;
/** C# `:3477` — a cupboard, against one of the corners the generator did not take. */
const CLINIC_CUPBOARD_CHANCE = 40;
/** C# `:3490` — `//@@MP - reduced a tad (Release 7-3)`, applied to the bed count. */
const CLINIC_BED_COUNT_SCALE = 0.8;
/** C# `:3470` — the generator wants a cell with three walls around it. */
const CLINIC_MIN_ADJ_WALLS = 3;

// ── Per-district state ──────────────────────────────────────────────────────

/**
 * `clinicsCount` in the C# is a `ref int` the dispatch loop declares and resets
 * for every district (`:471`); `TownBuildingContext` has no place for a `ref`.
 * Keying the count on the district's `DiceRoller` gives it exactly the lifetime
 * the C#'s local had — `BaseTownGenerator.generate()` builds a new roller per
 * map, which is where the C# re-declares the variable — and two generators
 * driven in one process keep two counts rather than sharing one.
 */
let clinicsBuilt: { roller: DiceRoller; count: number } | null = null;

/**
 * The four `doorside` arms of C# `:3395-3433`, as one record.
 *
 * The C# writes out the same three statements four times with the axes swapped.
 * What differs is the door cell, the floor the doorway is cut through and the
 * desk cell, and the desk is always one tile diagonally inward from the door —
 * below it on the west, above it on the east, left of it on the north, right of it
 * on the south — so the arm is a pair of points and nothing else.
 */
interface ClinicSide {
	/** The entrance, on the building rect. */
	readonly door: Point;
	/** The reception desk, one tile diagonally inside the entrance. */
	readonly desk: Point;
	/** True when the door is on the north or south wall, which decides the `nbTables` arm. */
	readonly sweepsX: boolean;
}

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3358` `MakeClinicBuilding(map, b, ref clinicsCount)`.
 *
 * Returns `true` when the block became a clinic, which is how the C#'s
 * `placed = MakeClinicBuilding(...)` says the block is finished with.
 */
export function makeClinicBuilding(ctx: TownBuildingContext, dispatchRoll: number): boolean {
	// Behind `Feature.Clinic` from the first statement: see the module header.
	if (!hasFeature(Session.get().ruleset, Feature.Clinic)) return false;

	const { map, block, roller } = ctx;
	const b = block;
	const inside = b.insideRect;

	// C# `:510`/`:513`, `case 2` of the shared `roll(0, 4)`. The die is spent by
	// the pass, not here; see the module header.
	if (dispatchRoll !== 2) return false;

	//////////////////////
	// 0. Check suitability
	//////////////////////
	if (inside.width < 5 || inside.height < 5) return false;
	// C# integer division, so `Width / 10` truncates *before* the divide by 2.5:
	// a 45-wide map gets 45/10 = 4 (int) -> 1.6 -> 2 clinics, not 45/10 = 4.5 ->
	// 1.8 -> 2. The same answer here by luck; the truncation is the C#'s and
	// `Math.floor` is the honest spelling of it.
	const clinicsLimit = Math.round(Math.floor(map.width / CLINICS_PER_MAP_WIDTH) / CLINICS_PER_WIDTH_DIVISOR);
	if (clinicsBuilt === null || clinicsBuilt.roller !== roller) clinicsBuilt = { roller, count: 0 };
	if (clinicsBuilt.count >= clinicsLimit) return false;
	++clinicsBuilt.count;

	///////////////////////////
	// 1. Walkway, floor & walls
	///////////////////////////
	ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
	ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_STONE)!, b.buildingRect);
	ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_TILES)!, inside, (tile) => {
		tile.isInside = true;
	});

	/////////////////////////////
	// 2. Entry door with shop ids
	//    Add lectern and hangings.
	/////////////////////////////
	// C# `:3383-3384`. Integer division, so `Math.trunc` rather than a bare `/`:
	// the port's `/` is float division and the C#'s is not.
	const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
	const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

	// The held area, C# `:3387-3390`. Never adjusted after this — see the module
	// header — so the four locals and `inside` stay the same rect all the way to
	// `insideRoom`.
	const tablesAreaBottom = inside.bottom;
	const tablesAreaTop = inside.top;
	const tablesAreaLeft = inside.left;
	const tablesAreaRight = inside.right;

	// make doors on one side. C# `:3394-3433`.
	const doorside = roller.roll(0, 4);
	let side: ClinicSide;
	switch (doorside) {
		case 0: // west
			side = {
				door: new Point(b.buildingRect.left, midY),
				desk: new Point(b.buildingRect.left + 1, midY - 1),
				sweepsX: false,
			};
			break;
		case 1: // east
			side = {
				door: new Point(b.buildingRect.right - 1, midY),
				desk: new Point(b.buildingRect.right - 2, midY + 1),
				sweepsX: false,
			};
			break;
		case 2: // north
			side = {
				door: new Point(midX, b.buildingRect.top),
				desk: new Point(midX - 1, b.buildingRect.top + 1),
				sweepsX: true,
			};
			break;
		default: // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive.
			side = {
				door: new Point(midX, b.buildingRect.bottom - 1),
				desk: new Point(midX + 1, b.buildingRect.bottom - 2),
				sweepsX: true,
			};
			break;
	}
	// C# `:3399`, `:3408`, `:3417`, `:3426`. The doorway is cut through *concrete*,
	// not the walkway the bar and the bank use: the C# names the floor at all four
	// call sites, and this is the only one of the three buildings that does.
	ctx.placeDoor(
		map,
		side.door.x,
		side.door.y,
		Models.tiles.get(TileID.FLOOR_CONCRETE)!,
		ctx.makeObjHospitalDoor()
	);

	// place desk by the door. C# `:3402-3404` and its three siblings: "make sure we
	// haven't somehow got a wall or other inaccessible spot". The check is on the
	// *map*, so the door tile the desk sits diagonally off does not count — the
	// desk can land on the doorway's own floor.
	if (map.isWalkable(side.desk.x, side.desk.y)) {
		map.placeMapObject(makeObjReceptionDesk(GameImages.OBJ_CLINIC_DESK), side.desk);
	}

	// add building image next to doors. C# `:3436`.
	ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
		map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_CLINIC_SIGN : null
	);

	/////////
	// 3. Work out dimensions for placement
	/////////
	// C# `:3443-3454`. `roll(n, n)` is not a draw: `DiceRoller.roll` returns `min`
	// when `max <= min`, so the bed count is a function of the block and the roll
	// costs nothing. `Math.max` is doing the work in both arms, because the held
	// area was never shrunk: `left - right` is `-InsideRect.Width`, and a rect's
	// width is positive, so the west/east arm hands the whole difference to
	// `InsideRect.Height`.
	const bySide = side.sweepsX
		? Math.max(inside.width, tablesAreaBottom - tablesAreaTop)
		: Math.max(tablesAreaLeft - tablesAreaRight, inside.height);
	let nbTables = roller.roll(bySide, bySide);

	const tablesAreaWidth = Math.abs(tablesAreaLeft - tablesAreaRight);
	const tablesAreaHeight = Math.abs(tablesAreaBottom - tablesAreaTop);
	const insideRoom = new Rect(tablesAreaLeft, tablesAreaTop, tablesAreaWidth, tablesAreaHeight);

	/////////
	// 4. Add beds, curtains, cupboards,
	/////////
	// C# `:3466-3487`, the cupboards. The one generator and the 40% are one pass
	// over the inside rect, and the *order* matters: the first cell with three
	// walls takes the generator and every later one draws the 40%, so the
	// generator lands on the first corner the scan reaches in `mapObjectFill`'s
	// x-then-y walk. `placedGenerator` is set even if the placement is then
	// refused for an occupied cell, because the C# sets it before returning the
	// object and `mapObjectFill` is what decides.
	let placedGenerator = false;
	ctx.mapObjectFill(map, inside, (pt) => {
		if (ctx.countAdjWalls(map, pt.x, pt.y) < CLINIC_MIN_ADJ_WALLS) return null;
		if (!placedGenerator) {
			placedGenerator = true;
			return makeObjPowerGenerator(GameImages.OBJ_POWERGEN_OFF, GameImages.OBJ_POWERGEN_ON);
		}
		if (roller.rollChance(CLINIC_CUPBOARD_CHANCE)) {
			// The item goes down whatever `mapObjectFill` then does with the
			// cupboard: C# `:3482` drops it and only then returns the object.
			map.dropItemAt(clinicPharmacyItem(roller), pt);
			return makeObjShelf(GameImages.OBJ_CLINIC_CUPBOARD);
		}
		return null;
	});

	// C# `:3490`, `//@@MP - reduced a tad (Release 7-3)`, and it is applied *after*
	// the cupboard pass so a generator that filled the room does not also cut the
	// bed count. `Math.round` is C#'s banker's rounding and JS's agree here: the
	// operand is a whole number times 0.8, and no integer times 0.8 is a .5.
	nbTables = Math.round(nbTables * CLINIC_BED_COUNT_SCALE);

	// C# `:3491-3521`, the beds. Each one is four separate placements in the C#'s
	// order — the bed cell, then a curtain in the ring around it, then machinery
	// in the same ring, then the pharmacy item on the mattress — and the order is
	// the dice: the curtain's `MapObjectPlaceInGoodPosition` roll happens before
	// the machinery's, and both happen before the pharmacy item's `Roll(0, 7)`.
	for (let i = 0; i < nbTables; i++) {
		ctx.mapObjectPlaceInGoodPosition(
			map,
			insideRoom,
			// `!IsADoorNSEW`, which is `CountAdjDoors == 0` — see the module header.
			(pt) => ctx.countAdjDoors(map, pt.x, pt.y) === 0,
			roller,
			(pt) => {
				// curtain and machinery around, with item on the bed
				const adjBedRect = intersectRect(new Rect(pt.x - 1, pt.y - 1, 3, 3), insideRoom);
				const notTheBed = (pt2: Point) => !pt2.equals(pt) && ctx.countAdjDoors(map, pt2.x, pt2.y) === 0;
				ctx.mapObjectPlaceInGoodPosition(map, adjBedRect, notTheBed, roller, () =>
					makeObjCurtain(GameImages.OBJ_CLINIC_CURTAIN)
				);
				ctx.mapObjectPlaceInGoodPosition(map, adjBedRect, notTheBed, roller, () =>
					makeObjMachinery(GameImages.OBJ_CLINIC_MACHINERY)
				);

				// item.
				map.dropItemAt(clinicPharmacyItem(roller), pt);

				// bed.
				return makeObjBed(GameImages.OBJ_CLINIC_BED);
			}
		);
	}

	/////////
	// 5. Zone
	/////////
	// demark building. C# `:3528-3529`.
	map.addZone(ctx.makeUniqueZone('Clinic', b.buildingRect));
	// walkway zones.
	ctx.makeWalkwayZones(map, b);

	// Done.
	return true;
}

// ── The clinic's pharmacy item ──────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:3480-3481` and `:3512-3514`, the spray-scent guard,
 * written once because the two call sites are the same two lines.
 *
 * A pharmacy shelf and a clinic bed are the two places a spray scent has no
 * business being, and the C# is explicit that the check is on the *type* and not
 * on the roll: case 5 of {@link makePharmacyItem} is the stench killer, and a
 * clinic holding one is a smell, not medicine. The large medikit is the C#'s
 * replacement and it costs no die, so a clinic's dice stream is the same either
 * way.
 */
function clinicPharmacyItem(roller: DiceRoller): Item {
	const it = makePharmacyItem(roller);
	return it instanceof ItemSprayScent ? makeItemLargeMedikit() : it;
}

/**
 * C# `BaseTownGenerator.cs:7435` `MakeShopPharmacyItem`.
 *
 * The C#'s seven arms and its one `m_DiceRoller.Roll(0, 7)`, on the district's
 * roller. Two of the arms are conditional on state the port does not carry; both
 * are resolved the way the port's own state resolves, and both are called out.
 *
 * `MakeShopPharmacyItem` is a `public` method on `BaseTownGenerator` in the port
 * too, but the seam hands a building a {@link TownBuildingContext} and not the
 * generator, and the port's copy is not the same function: it rolls `(0, 6)` and
 * has no antiviral arm. A clinic that used it would spend one die fewer per drop
 * than the C# does and never produce antiviral pills at all.
 */
function makePharmacyItem(roller: DiceRoller): Item {
	const randomItem = roller.roll(0, 7);
	switch (randomItem) {
		case 0:
			return makeItemSmallMedikit();
		case 1:
			return makeItemLargeMedikit();
		case 2:
			return makeItemPillsSLP();
		case 3:
			return makeItemPillsSTA();
		case 4:
			// C# `:7444-7445`: pills of sanity "if Sanity is enabled", a small
			// medikit otherwise. The port has no `SANITY` difficulty option
			// (`GameOptions.ts:135` lists it as not grown), so the C#'s condition
			// is constantly true and its `else` is the arm that cannot run.
			return makeItemPillsSAN();
		case 5:
			return makeItemStenchKiller();
		case 6:
			return hasAntiviralPills() ? makeItemPillsAntiviral() : makeItemSmallMedikit();
		default:
			throw new RangeError('unhandled roll');
	}
}

/**
 * C# `Engine/Rules.cs:5760` `HasAntiviralPills`.
 *
 * True in Corpses & Infection, and in Vintage only alongside the `ANTIVIRAL_PILLS`
 * difficulty option. The port has no `ANTIVIRAL_PILLS` option
 * (`GameOptions.ts:135`), so the second disjunct is constantly false and the game
 * mode is the whole predicate. `GameMode` is the `Rules` layer this question has
 * always belonged to and is a different axis from the `Ruleset` the feature gate
 * above asks about, so reading it here is not a ruleset branch.
 */
function hasAntiviralPills(): boolean {
	return Session.get().gameMode === GameMode.GM_CORPSES_INFECTION;
}

// ── Factories and helpers the seam does not carry ───────────────────────────

/**
 * C# `System.Drawing.Rectangle.Intersect`, which replaces the receiver with the
 * overlap and leaves it `Rectangle.Empty` when the two do not meet.
 * `BaseTownGenerator.intersectRect` is the same function, and private.
 */
function intersectRect(a: Rect, b: Rect): Rect {
	if (!a.intersects(b)) return Rect.Empty;
	const left = Math.max(a.left, b.left);
	const top = Math.max(a.top, b.top);
	const right = Math.min(a.right, b.right);
	const bottom = Math.min(a.bottom, b.bottom);
	return new Rect(left, top, right - left, bottom - top);
}

/** C# `BaseMapGenerator.cs:1038` `MakeObjReceptionDesk`. Also used by the mall. */
function makeObjReceptionDesk(imageId: string): MapObject {
	const desk = new MapObject('reception desk', imageId);
	// `IsContainer = true //@@MP (Release 5-3)` — the C#'s own comment.
	desk.isContainer = true;
	desk.jumpLevel = 1;
	desk.isMaterialTransparent = true;
	desk.standOnFovBonus = true;
	return desk;
}

/**
 * C# `BaseMapGenerator.cs:789` `MakeObjPowerGenerator`.
 *
 * `IsMetal` is not carried by the port's `MapObject` and is left off for the
 * reason `makeBankBuilding`'s safes give: `isMetal` is read by other features —
 * fuel stations, the camp fuel-pump explosion — and adding a flag field to a core
 * class as a side effect of a generator is how that goes wrong.
 */
function makeObjPowerGenerator(offImageId: string, onImageId: string): PowerGenerator {
	return new PowerGenerator('power generator', offImageId, onImageId);
}

/**
 * C# `BaseMapGenerator.cs:595` `MakeObjShelf`.
 *
 * `BURNABLE` is the fork's; the port's own `protected makeObjShelf` (`:635`) is
 * still vanilla's `UNINFLAMMABLE`. The C#'s is used here — a Stage 5 building is
 * the fork's building — and the two are reconciled when the factory is promoted
 * to `TownBuildingContext`, which has to change the bar's call site at the same
 * time.
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

/** C# `BaseMapGenerator.cs:1058` `MakeObjCurtain`. */
function makeObjCurtain(imageId: string): MapObject {
	const curtain = new MapObject(
		'curtain',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		// The C#'s `BASE_HITPOINTS / 6` is integer division, so 6 and not 6.67: a
		// curtain that reports a sixth of its health forever is a curtain the
		// player cannot break. `Math.floor` is the spelling that matters.
		Math.floor(DoorWindow.BASE_HITPOINTS / 6)
	);
	curtain.isWalkable = true;
	curtain.isMovable = true;
	curtain.weight = 1;
	return curtain;
}

/** C# `BaseMapGenerator.cs:1049` `MakeObjMachinery`. */
function makeObjMachinery(imageId: string): MapObject {
	const machinery = new MapObject(
		'machinery',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		DoorWindow.BASE_HITPOINTS * 2
	);
	machinery.isMaterialTransparent = true;
	// `IsContainer = true //@@MP (Release 5-3)` — the C#'s own comment.
	machinery.isContainer = true;
	return machinery;
}

/** C# `BaseMapGenerator.cs:643` `MakeObjBed`. */
function makeObjBed(imageId: string): MapObject {
	const bed = new MapObject(
		'bed',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		DoorWindow.BASE_HITPOINTS * 2
	);
	bed.isMaterialTransparent = true;
	bed.isCouch = true;
	bed.jumpLevel = 1;
	bed.givesWood = true;
	bed.isMovable = true;
	bed.standOnFovBonus = true;
	bed.weight = 6;
	return bed;
}

/**
 * C# `BaseMapGenerator.cs:1323` `MakeItemSmallMedikit`.
 *
 * The C# also rolls `Quantity = m_Rules.Roll(1, StackingLimit)`, and that roll is
 * **not** transliterated: `m_Rules` is the session's `Rules` roller, a second
 * stream the district roller does not own, so spending it here would move every
 * rule the port resolves from it and make a clinic depend on process-global state
 * the generator cannot see. This is the same line `BarBuilding`'s header draws
 * over `MakeItemAlcohol`, and it is a *smaller* loss: the port's own
 * `makeItemSmallMedikit`, `makeItemPillsSTA` and `makeItemPillsSLP` have already
 * dropped the quantity roll, so this copy agrees with them rather than introducing
 * a second behaviour. The stacks a clinic hands out are single items.
 */
function makeItemSmallMedikit(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_SMALL_MEDIKIT));
}

/** C# `BaseMapGenerator.cs:1331` `MakeItemLargeMedikit`. No quantity roll upstream. */
function makeItemLargeMedikit(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_LARGE_MEDIKIT));
}

/**
 * C# `BaseMapGenerator.cs:1344` `MakeItemPillsSLP`, quantity roll dropped for the
 * reason {@link makeItemSmallMedikit} gives.
 */
function makeItemPillsSLP(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SLP));
}

/** C# `BaseMapGenerator.cs:1336` `MakeItemPillsSTA`, quantity roll dropped likewise. */
function makeItemPillsSTA(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_STA));
}

/** C# `BaseMapGenerator.cs:1352` `MakeItemPillsSAN`. No quantity roll upstream. */
function makeItemPillsSAN(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_SAN));
}

/** C# `BaseMapGenerator.cs:1360` `MakeItemPillsAntiviral`, quantity roll dropped. */
function makeItemPillsAntiviral(): Item {
	return new ItemMedicine(Models.items.get(ItemID.MEDICINE_PILLS_ANTIVIRAL));
}

/** C# `BaseMapGenerator.cs:1576` `MakeItemStenchKiller`. Never survives the guard. */
function makeItemStenchKiller(): Item {
	return new ItemSprayScent(Models.items.get(ItemID.SCENT_SPRAY_STENCH_KILLER));
}
