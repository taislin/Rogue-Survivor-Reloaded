/**
 * `Feature.Bank` — C# `BaseTownGenerator.cs:4253` `MakeBankBuilding`.
 *
 * A bank is the C#'s one building that is a *room with a security boundary*
 * rather than a set of rooms: a line of safes against one inside-rect edge, a
 * hospital wall two tiles in front of them with an iron vault door opposite the
 * public entrance, a teller counter line four tiles in, and the customer floor
 * on the far side of the counters. The door side is rolled first and decides
 * which edge the safes go on, so the four arms of the C#'s `switch (doorside)`
 * are the same twenty lines with the axes swapped — they are written below as
 * four arms of a table and one shared loop, because the axes are the only thing
 * that differs (see {@link BankSide}).
 *
 * ## The `roll(0, 4)` at the top is the C#'s `switch (roll2)`
 *
 * C# `:508`/`:512` reaches the bank as one case of a per-block dispatch:
 *
 * ```csharp
 * int roll2 = m_DiceRoller.Roll(0, 4);
 * switch (roll2)
 * {
 *     case 0: placed = MakeBarBuilding(map, b, ref barsCount); break;
 *     case 1: placed = MakeBankBuilding(map, b, ref banksCount); break;
 *     ...
 * }
 * ```
 *
 * The seam's `TOWN_BUILDING_PASSES` is a flat list, not that `if (!placed) ...
 * else if` cascade, and the other three buildings in that `switch` want the same
 * roll — so a pass that needs the cascade rolls for itself, which is what
 * `TownBuildingPass.tryBuild` documents. One roll, one case, one bank offered per
 * five blocks, and the roll happens *before* the size check because that is the
 * order the C# consumed it.
 *
 * The call site is `BaseTownGenerator.generate()`'s own pass, right after the
 * CHAR buildings and before the parks, which is the stage the C# has it in. It
 * is not in `TOWN_BUILDING_PASSES` yet, for the reason that registry's doc
 * comment gives: flattening the cascade into a list is somebody's decision to
 * make with the world fingerprints in front of them, not a side effect of porting
 * one of its four branches. Registering it there
 * (`{ csharpName: 'MakeBankBuilding', tryBuild: makeBankBuilding }`) is then a
 * one-line change, and the direct call comes out in the same edit.
 *
 * ## The feature gate is here and not at the call site
 *
 * `Feature.Bank` is on for Still Alive and off for Classic, and a bank under
 * Classic is a bug rather than a cosmetic difference: it moves dice. The gate is
 * the generator's first statement rather than something every future call site
 * has to remember, for the reason `Feature.TileFires` has exactly one reader —
 * one place to get right instead of N that can disagree. It has to come *before*
 * the dispatch roll and not after it: a gate that only stopped the build would
 * still spend the die, and every Classic world would come out one roll short of
 * the Still Alive one for a building neither of them has.
 *
 * ## The blocks it is offered
 *
 * The C# reaches the bank from inside the per-block business cascade, so the
 * bank only sees blocks the CHAR building declined — and in the port it never
 * declines one, `makeCHARBuilding` always returns a type, so the cascade's
 * "else" arm has nothing in it. The bank therefore gets its own pass over the
 * blocks the CHAR pass left, which is a superset of the C#'s population: the
 * same stage, the same caps, the same `roll(0, 4)`, but offered more blocks.
 * That is the one behavioural difference from the reference, and it is bounded
 * by `banksLimit` — the C# also stops at the cap, it just gets there through
 * more rolls.
 *
 * ## What the seam could not hand over
 *
 * The C# reaches for five factories the port's `MapGenerator` keeps `protected`
 * and the context does not carry — see `TownBuilding`'s "What is deliberately
 * NOT here": `makeObjTable`, `makeObjCouch`, and the three bank-only ones
 * (`MakeObjBankTeller`, `BaseMapGenerator.cs:1030`; `MakeObjOpenBankSafe`,
 * `:997`; `MakeObjClosedBankSafe`, `:1009`). They are re-declared below,
 * transliterated, so the C# method can be ported whole rather than truncated.
 * They are the candidates for the next addition to `TownBuildingContext`;
 * promoting them means deleting the copies here, and `makeObjTable` /
 * `makeObjCouch` are the two where the port's own copies already differ from the
 * C#'s (see {@link makeObjTable}).
 *
 * Two helpers come along for the same reason: `IsADoorNSEW`
 * (`MapGenerator.cs:450`) and `Rectangle.Intersect`, the latter of which
 * `BaseTownGenerator` has as a private `intersectRect`.
 */

import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import type { DiceRoller } from '@engine/DiceRoller';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * C# `:4296`/`:4314`/`:4332`/…: the customer area gives up six tiles to the back
 * room. The C# writes that `6` at the top of each of its four arms, separately
 * from the two- and four-tile steps that place the vault wall and the counters.
 */
const BACK_ROOM_DEPTH = 6;
/** C# `:4494` — "don't want too many safes or it would be too easy". */
const OPEN_BANK_SAFE_CHANCE = 40;
/** C# `:4260` — the per-map cap is `map.Width / 10 / 2.5`, rounded. */
const BANKS_PER_MAP_WIDTH = 10;
const BANKS_PER_WIDTH_DIVISOR = 2.5;

// ── Per-district state ──────────────────────────────────────────────────────

/**
 * `banksCount` in the C# is a `ref int` the dispatch loop declares and resets
 * for every district (`:471`); `TownBuildingContext` has no place for a `ref`.
 * Keying the count on the district's `DiceRoller` gives it exactly the lifetime
 * the C#'s local had — `BaseTownGenerator.generate()` builds a new roller per
 * map, which is where the C# re-declares the variable — and two generators
 * driven in one process keep two counts rather than sharing one.
 */
let banksBuilt: { roller: DiceRoller; count: number } | null = null;

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * The four `doorside` arms of C# `:4291-4426`, as one record.
 *
 * The C# writes the same twenty lines out four times with the axes swapped. What
 * actually differs is the door cell, which inside-rect edge the safes stand
 * against (`safes`), which way the counter line walks inward from it (`step`),
 * and whether the sweep runs along x or y (`sweepsX`) — so the vault wall is
 * always `safes + 2 * step`, the counters always `safes + 4 * step`, and the
 * cell at the centre of the sweep is the vault door and the openable counter
 * door opposite the public entrance.
 */
interface BankSide {
	/** The public entrance, on the building rect. */
	readonly door: Point;
	/** The coordinate of the inside-rect edge the safes stand against. */
	readonly safes: number;
	/** Inward step: the vault wall is `safes + 2 * step`, counters `+ 4 * step`. */
	readonly step: number;
	/** True when the sweep runs along x (north/south doors), false along y. */
	readonly sweepsX: boolean;
	/** The sweep coordinate the vault door and counter door go at. */
	readonly centre: number;
}

/**
 * C# `BaseTownGenerator.cs:4253` `MakeBankBuilding(map, b, ref banksCount)`.
 *
 * Returns `true` when the block became a bank, which is how the C#'s
 * `placed = MakeBankBuilding(...)` says the block is finished with.
 */
export function makeBankBuilding(ctx: TownBuildingContext, dispatchRoll: number): boolean {
	// Behind `Feature.Bank` from the first statement: see the module header.
	if (!hasFeature(Session.get().ruleset, Feature.Bank)) return false;

	const { map, block, roller } = ctx;
	const b = block;
	const inside = b.insideRect;

	// C# `:508`/`:512`, `case 1` of the dispatch roll. See the module header: the
	// cascade is not in the seam, so the pass rolls for itself.
	// C# `:512`, `case 1` of the shared `roll(0, 4)`. The roll is spent by the
	// pass, for the reason given in `BarBuilding`'s header: the four arms of the
	// C#'s `switch` share one die.
	if (dispatchRoll !== 1) return false;

	////////////////////////
	// 0. Check suitability
	////////////////////////
	if (inside.width < 5 || inside.height < 5) return false;
	// C# integer division, so `Width / 10` truncates *before* the divide by 2.5:
	// a 45-wide map gets 45/10 = 4 (int) -> 1.6 -> 2 banks, not 45/10 = 4.5 ->
	// 1.8 -> 2. The same answer here by luck; the truncation is the C#'s and
	// `Math.floor` is the honest spelling of it.
	const banksLimit = Math.round(Math.floor(map.width / BANKS_PER_MAP_WIDTH) / BANKS_PER_WIDTH_DIVISOR);
	if (banksBuilt === null || banksBuilt.roller !== roller) banksBuilt = { roller, count: 0 };
	if (banksBuilt.count >= banksLimit) return false;
	++banksBuilt.count;

	/////////////////////////////
	// 1. Walkway, floor & walls
	/////////////////////////////
	ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
	ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, b.buildingRect);
	ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!, inside, (tile) => {
		tile.isInside = true;
	});

	/////////////////////////////
	// 2. Entry door, then the back room behind it
	/////////////////////////////
	// C# `:4277-4278`. Integer division again: `Width / 2` truncates.
	const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
	const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

	// The whole inside rect is the held customer area until the door side is
	// known; the arm that wins then takes BACK_ROOM_DEPTH off the far edge, and
	// what is left is where the tables go.
	let customerAreaBottom = inside.bottom;
	let customerAreaTop = inside.top;
	let customerAreaLeft = inside.left;
	let customerAreaRight = inside.right;

	// make doors on one side.
	const doorside = roller.roll(0, 4);
	let side: BankSide;
	switch (doorside) {
		case 0: // west
			side = { door: new Point(b.buildingRect.left, midY), safes: inside.right - 1, step: -1, sweepsX: false, centre: midY };
			customerAreaRight -= BACK_ROOM_DEPTH;
			break;
		case 1: // east
			side = { door: new Point(b.buildingRect.right - 1, midY), safes: inside.left, step: 1, sweepsX: false, centre: midY };
			customerAreaLeft += BACK_ROOM_DEPTH;
			break;
		case 2: // north
			side = { door: new Point(midX, b.buildingRect.top), safes: inside.bottom - 1, step: -1, sweepsX: true, centre: midX };
			customerAreaBottom -= BACK_ROOM_DEPTH;
			break;
		default: // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive.
			side = { door: new Point(midX, b.buildingRect.bottom - 1), safes: inside.top, step: 1, sweepsX: true, centre: midX };
			customerAreaTop += BACK_ROOM_DEPTH;
			break;
	}
	ctx.placeDoor(
		map,
		side.door.x,
		side.door.y,
		Models.tiles.get(TileID.FLOOR_WALKWAY)!,
		ctx.makeObjGlassDoor()
	);

	// The C#'s two loops bound themselves differently, and the difference is a
	// tile: `for (i = 1; i <= InsideRect.Height; i++) { y = Bottom - i; }`
	// against `for (i = 0; i <= InsideRect.Width; i++) { x = Left + i; }`.
	const first = side.sweepsX ? 0 : 1;
	const last = side.sweepsX ? inside.width : inside.height;
	const sweepAt = (i: number) => (side.sweepsX ? inside.left + i : inside.bottom - i);
	/** The C#'s `new Point(x, y)`, spelled for whichever axis the sweep is not on. */
	const cellAt = (sweep: number, coord: number) =>
		side.sweepsX ? new Point(sweep, coord) : new Point(coord, sweep);

	for (let i = first; i <= last; i++) {
		const sweep = sweepAt(i);
		// The centre of the sweep is skipped by the wall and counter tests and
		// caught by their `else if`, which is why neither of them needs a second
		// walkability check: at the centre the first clause is false whatever
		// `IsWalkable` said.
		const onCentre = sweep === side.centre;

		// place safes along the wall
		const safe = cellAt(sweep, side.safes);
		if (map.isWalkable(safe.x, safe.y)) placeBankSafe(ctx, safe);

		// place a wall another 2 tiles in from the safes
		const wall = cellAt(sweep, side.safes + 2 * side.step);
		if (map.isWalkable(wall.x, wall.y) && !onCentre) {
			map.setTileModelAt(wall.x, wall.y, Models.tiles.get(TileID.WALL_HOSPITAL)!);
		} else if (onCentre) {
			// center the secure door opposite the main entrance
			placeBankVaultDoor(ctx, wall);
		}

		// place the counters, with an openable door opposite the main entrance
		const counter = cellAt(sweep, side.safes + 4 * side.step);
		if (map.isWalkable(counter.x, counter.y) && !onCentre) {
			map.placeMapObject(makeObjBankTeller(GameImages.OBJ_BANK_TELLER), counter);
		} else if (onCentre) {
			ctx.placeDoor(
				map,
				counter.x,
				counter.y,
				Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!,
				ctx.makeObjWoodenDoor()
			);
		}
	}

	// add building image next to doors.
	ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
		map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_BANK_SIGN : null
	);

	/////////
	// 3. Tables
	/////////
	// C# `:4437-4448`. `Roll(n, n)` is not a draw: `DiceRoller.roll` returns
	// `min` when `max <= min`, so the table count is a function of the block, and
	// the two arms differ only in which axis they measure. `Math.trunc` rather
	// than `Math.floor` because the north/south arm's operand is negative
	// (`Inside.Height - 6`) and C# integer division truncates toward zero; the
	// `Math.max` beside it swallows the difference either way.
	const bySide = side.sweepsX
		? Math.max(inside.width, Math.trunc((customerAreaBottom - customerAreaTop) / 6))
		: Math.max(customerAreaLeft - customerAreaRight, Math.trunc(inside.height / 6));
	const nbTables = roller.roll(bySide, bySide);

	const tablesAreaWidth = Math.abs(customerAreaLeft - customerAreaRight);
	const tablesAreaHeight = Math.abs(customerAreaBottom - customerAreaTop);
	const insideRoom = new Rect(customerAreaLeft, customerAreaTop, tablesAreaWidth, tablesAreaHeight);
	for (let i = 0; i < nbTables; i++) {
		ctx.mapObjectPlaceInGoodPosition(
			map,
			insideRoom,
			(pt) => !isADoorNSEW(map, pt.x, pt.y),
			roller,
			(pt) => {
				// two chairs around, C# `:4461-4470`.
				const adjTableRect = intersectRect(new Rect(pt.x - 1, pt.y - 1, 3, 3), insideRoom);
				const notTheTable = (pt2: Point) => !pt2.equals(pt) && !isADoorNSEW(map, pt2.x, pt2.y);
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjCouch(GameImages.OBJ_COUCH)
				);
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjCouch(GameImages.OBJ_COUCH)
				);

				// table.
				return makeObjTable(GameImages.OBJ_TABLE);
			}
		);
	}

	/////////
	// 4. Zone
	/////////
	// demark building.
	map.addZone(ctx.makeUniqueZone('Bank', b.buildingRect));
	// walkway zones.
	ctx.makeWalkwayZones(map, b);

	// Done.
	return true;
}

// ── C# `BaseTownGenerator.cs:4492` and `:4500` ───────────────────────────────

/** C# `BaseTownGenerator.cs:4492` `PlaceBankSafe`. */
function placeBankSafe(ctx: TownBuildingContext, safept: Point): void {
	// "don't want too many safes or it would be too easy"
	if (ctx.roller.rollChance(OPEN_BANK_SAFE_CHANCE))
		ctx.map.placeMapObject(makeObjOpenBankSafe(GameImages.OBJ_BANK_SAFE_OPEN), safept);
	else ctx.map.placeMapObject(makeObjClosedBankSafe(GameImages.OBJ_BANK_SAFE_CLOSED), safept);
}

/**
 * C# `BaseTownGenerator.cs:4500` `PlaceBankVaultDoor`.
 *
 * The C#'s third arm is `MakeObjIronDoor(DoorWindow.STATE_LOCKED)`, and the
 * port's `DoorWindow` has no locked state — it carries `STATE_CLOSED`,
 * `STATE_OPEN` and `STATE_BROKEN` and nothing else, and `setState` ignores an
 * unknown value, so asking for one would leave a door that is neither open nor
 * readable. The roll stays a three-way one so the dice stream and the spread of
 * "not the public door" doors both survive; `STATE_CLOSED` is the closest thing
 * the port has, and adding a locked door is a change to `DoorWindow` and
 * `Rules`, not to a generator.
 */
function placeBankVaultDoor(ctx: TownBuildingContext, pt: Point): void {
	const door = ctx.makeObjIronDoor();
	switch (ctx.roller.roll(0, 3)) {
		case 0:
			door.setState(DoorWindow.STATE_OPEN);
			break;
		case 1:
			door.setState(DoorWindow.STATE_BROKEN);
			break;
		default:
			door.setState(DoorWindow.STATE_CLOSED);
			break;
	}
	ctx.map.placeMapObject(door, pt);
}

// ── Factories and helpers the seam could not hand over ──────────────────────

/**
 * C# `MapGenerator.cs:450` `IsADoorNSEW` — static there, static here, because it
 * is a question about the map and the seam has no room for the generator's
 * statics. Diagonals are ignored, per its own doc comment.
 */
function isADoorNSEW(map: GameMap, x: number, y: number): boolean {
	if (map.getMapObjectAt(x, y + 1) instanceof DoorWindow) return true;
	if (map.getMapObjectAt(x, y - 1) instanceof DoorWindow) return true;
	if (map.getMapObjectAt(x + 1, y) instanceof DoorWindow) return true;
	if (map.getMapObjectAt(x - 1, y) instanceof DoorWindow) return true;
	return false;
}

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

/** C# `BaseMapGenerator.cs:1030` `MakeObjBankTeller`. */
function makeObjBankTeller(imageId: string): MapObject {
	const teller = new MapObject('bank teller', imageId);
	teller.isMaterialTransparent = true;
	return teller;
}

/**
 * C# `BaseMapGenerator.cs:997` `MakeObjOpenBankSafe`.
 *
 * `IsMetal` and `HoverDescription` are not carried by the port's `MapObject` and
 * are left off for the reason `BaseMapGenerator.makeObjFireBarrel` gives at
 * `:617`: `isMetal` is read by other features — fuel stations, the camp
 * fuel-pump explosion — and adding a flag field to a core class as a side effect
 * of a generator is how that goes wrong.
 */
function makeObjOpenBankSafe(imageId: string): MapObject {
	const safe = new MapObject('open bank safe', imageId);
	safe.isWalkable = true;
	safe.isMovable = false;
	return safe;
}

/** C# `BaseMapGenerator.cs:1009` `MakeObjClosedBankSafe`. */
function makeObjClosedBankSafe(imageId: string): MapObject {
	const safe = new MapObject('closed bank safe', imageId);
	safe.isMovable = false;
	return safe;
}

/**
 * C# `BaseMapGenerator.cs:681` `MakeObjTable`.
 *
 * The Still Alive values, which are *not* the ones the port's own protected
 * `makeObjTable` carries: the fork made tables `BURNABLE` and six kilos, the
 * port's copy is still vanilla's `UNINFLAMMABLE` and two. The C#'s are used
 * here because a Stage 5 building is the fork's building, and the divergence is
 * reported rather than papered over — promoting the factory to the context is
 * the fix, and it should fix both call sites at once.
 */
function makeObjTable(imageId: string): MapObject {
	const table = new MapObject(
		'table',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		DoorWindow.BASE_HITPOINTS
	);
	table.isMaterialTransparent = true;
	table.jumpLevel = 1;
	table.givesWood = true;
	table.isMovable = true;
	table.weight = 6;
	return table;
}

/** C# `BaseMapGenerator.cs:927` `MakeObjCouch`. The port has no `makeObjCouch` at all. */
function makeObjCouch(imageId: string): MapObject {
	const couch = new MapObject(
		'couch',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		DoorWindow.BASE_HITPOINTS * 4
	);
	couch.isMaterialTransparent = true;
	couch.jumpLevel = 1;
	couch.givesWood = true;
	couch.isMovable = true;
	couch.isCouch = true;
	couch.weight = 3;
	return couch;
}
