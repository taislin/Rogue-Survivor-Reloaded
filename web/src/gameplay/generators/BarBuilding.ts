/**
 * `Feature.Bar` — C# `BaseTownGenerator.cs:2387-2668` `MakeBarBuilding`.
 *
 * A bar is one room with a service wall: a wooden door on one side, a velvet
 * rope on the walkway outside it, a sink dead opposite, a run of bottle shelves
 * along the inside-rect edge the door is *not* on, a counter two tiles in from
 * them, and then the floor that is left over — which is the only part the
 * furniture placement cares about, so the C# shrinks the held tables area by
 * four tiles toward the shelves before it counts any tables.
 *
 * ## The `roll(0, 4)` at the top is the C#'s `switch (roll2) case 0`
 *
 * C# `:510-513` reaches the bar as one case of a per-block dispatch:
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
 * The seam's `TOWN_BUILDING_PASSES` is a flat list, not that cascade, and five
 * other buildings want the same roll — so a pass that needs the cascade rolls for
 * itself, which is what `TownBuildingPass.tryBuild` documents. One roll, one
 * case, one bar offered per five blocks, and the roll happens *before* the size
 * check because that is the order the C# consumed it.
 *
 * ## The feature gate is here and not at the call site
 *
 * `Feature.Bar` is on for Still Alive and off for Classic, and a bar under
 * Classic is a bug rather than a cosmetic difference: it moves dice. The gate is
 * the generator's first statement — ahead of the dispatch roll, for the reason
 * `BaseMapGenerator.makeObjWreckedCar` puts its fuel roll inside one
 * (`:565-576`): a roll that is taken and discarded still moves every roll after
 * it. It sits here rather than at a call site for the reason `Feature.TileFires`
 * has exactly one reader — one place to get right instead of N that can
 * disagree.
 *
 * ## What the seam could not hand over
 *
 * Five factories the C# reaches for are `protected` on the port's generators and
 * absent from `TownBuildingContext` (see "What is deliberately NOT here" in
 * `./TownBuilding`), and one item factory is not in the port at all:
 *
 * | C# | port | wanted as |
 * | --- | --- | --- |
 * | `MakeObjShelf` `BaseMapGenerator.cs:595` | `:635`, `protected` | `ctx.makeObjShelf` |
 * | `MakeObjTable` `:681` | `:723`, `protected` | `ctx.makeObjTable` |
 * | `MakeObjChair` `:693` | `:739`, `protected` | `ctx.makeObjChair` |
 * | `MakeObjKitchenSink` `:904` | — | `ctx.makeObjKitchenSink` |
 * | `MakeObjCounter` `:956` | — | `ctx.makeObjCounter` |
 *
 * The five map objects are transcribed property-for-property below, so hoisting
 * them onto the context is a delete rather than a rewrite. Three of them are
 * *not* what the port's own `protected` copies carry — the fork made shelves,
 * tables and chairs `BURNABLE`, made tables six kilos instead of two, dropped the
 * chair's `JumpLevel` and gave it `IsWalkable` instead — and the C#'s values are
 * the ones used here, because a Stage 5 building is the fork's building. Each
 * divergence is called out at its factory rather than papered over.
 *
 * `Rectangle.Intersect` is the only helper that comes along, for the same
 * reason: `BaseTownGenerator.intersectRect` (`:1873`) is private and `Rect` has
 * no mutating intersect. `IsADoorNSEW` (`MapGenerator.cs:450`) does *not* need
 * copying — it asks about the four compass neighbours and nothing else, which is
 * `CountAdjDoors(map, x, y) > 0` exactly, and `countAdjDoors` is on the context.
 *
 * ## The one thing not ported: the alcohol
 *
 * C# drops `MakeItemAlcohol()` on every bottle shelf and again on every counter
 * (`:2453`, `:2462`, and the same pair in each of the other three arms). That
 * factory (`BaseMapGenerator.cs:1965`) is not in the port, and cannot be without
 * more than a generator:
 *
 * - it rolls `m_Game.Rules.RollChance(66)` and then calls `MakeItemBeer` or
 *   `MakeItemLiquorForMolotov` — a *second* roller, the session's `Rules`, not the
 *   district's `m_DiceRoller` this pass owns;
 * - `MakeItemBeer` (`:1764`) could be transcribed: all four of its models exist,
 *   as `ItemID.MEDICINE_ALCOHOL_BEER_*`;
 * - `MakeItemLiquorForMolotov` (`:1946`) could not: `LIQUOR_AMBER` and
 *   `LIQUOR_CLEAR` are `GameItems.cs:152-153` rows the port has never appended,
 *   and appending them means two new `ItemID`s in a file six other agents are
 *   editing.
 *
 * So the shelves and counters are `isContainer` and empty. A beer-only factory
 * invented here instead would spend the *district's* dice on rolls the C# spends
 * on `Rules`, and would put beer where the fork puts liquor on a third of its
 * drops — a divergence in both the dice stream and the content, bought for one
 * missing pair of item rows. Restoring it is three steps: append the two models,
 * add `makeItemAlcohol` to `BaseMapGenerator`, hand it to the context.
 */

import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import type { DiceRoller } from '@engine/DiceRoller';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Point } from '@engine/Point';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from './TownBuilding';

// ── Constants ───────────────────────────────────────────────────────────────

/** C# `:2394` — "cap the number per map based on its dimensions". */
const BARS_PER_MAP_WIDTH = 10;
const BARS_PER_WIDTH_DIVISOR = 2.5;
/** C# `:2441`, `:2481`, `:2521`, `:2561` — the service wall's depth, four times. */
const SERVICE_WALL_DEPTH = 4;
/** C# `:2457`, `:2497`, `:2537`, `:2577` — the counter stands this far in. */
const COUNTER_INSET = 2;

// ── Per-district state ──────────────────────────────────────────────────────

/**
 * `barsCount` in the C# is a `ref int` the dispatch loop declares and resets for
 * every district (`:471`); `TownBuildingContext` has no place for a `ref`. Keying
 * the count on the district's `DiceRoller` gives it exactly the lifetime the
 * C#'s local had — `BaseTownGenerator.generate()` builds a new roller per map,
 * which is where the C# re-declares the variable — and two generators driven in
 * one process keep two counts rather than sharing one.
 */
let barsBuilt: { roller: DiceRoller; count: number } | null = null;

/**
 * The four `doorside` arms of C# `:2426-2585`, as one record.
 *
 * The C# writes the same twenty lines out four times with the axes swapped. What
 * actually differs is the door cell, the rope cell, the sink cell, which
 * inside-rect edge the shelves stand against, and which way the counter walks
 * inward from it — so the counter is always `shelfLine + step`, and `step` also
 * says which way the held tables area moves (see its use below).
 */
interface BarSide {
	/** The entrance, on the building rect. */
	readonly door: Point;
	/** The walkway cell the queue rope goes on, one tile outside the door. */
	readonly rope: Point;
	/** The sink, centred opposite the door. */
	readonly sink: Point;
	/** The inside-rect coordinate the bottle shelves stand against. */
	readonly shelfLine: number;
	/** Inward step from the shelves to the counter. */
	readonly step: number;
	/** True when the shelf sweep runs along x (north/south doors), false along y. */
	readonly sweepsX: boolean;
	/** The coordinate along the sweep that the sink occupies. */
	readonly centre: number;
}

// ── The C# method ───────────────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:2387` `MakeBarBuilding(map, b, ref barsCount)`.
 *
 * Returns `true` when the block became a bar, which is how the C#'s
 * `placed = MakeBarBuilding(...)` says the block is finished with.
 */
export function makeBarBuilding(ctx: TownBuildingContext, dispatchRoll: number): boolean {
	// Behind `Feature.Bar` from the first statement: see the module header.
	if (!hasFeature(Session.get().ruleset, Feature.Bar)) return false;

	const { map, block, roller } = ctx;
	const b = block;
	const inside = b.insideRect;

	// C# `:511`, `case 0` of the shared `roll(0, 4)`. The roll is spent by the
	// *pass*, not here: in the C# the bar, the bank, the clinic and the mechanic
	// workshop are four arms of one `switch`, so rolling per-generator would
	// spend four dice where the C# spends one and let two of them claim the same
	// block. See the module header.
	if (dispatchRoll !== 0) return false;

	//////////////////////
	// 0. Check suitability
	//////////////////////
	if (inside.width < 5 || inside.height < 5) return false;
	// C# integer division, so `Width / 10` truncates *before* the divide by 2.5:
	// a 45-wide map gets 45/10 = 4 (int) -> 1.6 -> 2 bars, not 45/10 = 4.5 ->
	// 1.8 -> 2. The same answer here by luck; the truncation is the C#'s and
	// `Math.floor` is the honest spelling of it.
	const barsLimit = Math.round(Math.floor(map.width / BARS_PER_MAP_WIDTH) / BARS_PER_WIDTH_DIVISOR);
	if (barsBuilt === null || barsBuilt.roller !== roller) barsBuilt = { roller, count: 0 };
	if (barsBuilt.count >= barsLimit) return false;
	++barsBuilt.count;

	///////////////////////////
	// 1. Walkway, floor & walls
	///////////////////////////
	ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
	ctx.tileRectangle(map, Models.tiles.get(TileID.WALL_LIGHT_BROWN)!, b.buildingRect);
	ctx.tileFill(map, Models.tiles.get(TileID.FLOOR_PLANKS)!, inside, (tile) => {
		tile.isInside = true;
	});

	/////////////////////////////
	// 2. Entry door with a rope
	/////////////////////////////
	// C# `:2412-2413`. Integer division, so `Math.trunc` rather than a bare `/`:
	// the port's `/` is float division and the C#'s is not.
	const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
	const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);

	// The whole inside rect is the held area for now, and the arm that wins gives
	// four tiles of it to the service wall. The C#'s comment at `:2415-2416` is
	// that this held area is where the tables go, and the door side is decided
	// first precisely so that it can be reduced.
	let tablesAreaBottom = inside.bottom;
	let tablesAreaTop = inside.top;
	let tablesAreaLeft = inside.left;
	let tablesAreaRight = inside.right;

	// make doors on one side. C# `:2423-2586`.
	const doorside = roller.roll(0, 4);
	let side: BarSide;
	switch (doorside) {
		case 0: // west
			side = {
				door: new Point(b.buildingRect.left, midY),
				rope: new Point(b.buildingRect.left - 1, midY),
				sink: new Point(inside.right - 1, midY),
				shelfLine: inside.right - 1,
				step: -COUNTER_INSET,
				sweepsX: false,
				centre: midY,
			};
			break;
		case 1: // east
			side = {
				door: new Point(b.buildingRect.right - 1, midY),
				rope: new Point(b.buildingRect.right, midY),
				sink: new Point(inside.left, midY),
				shelfLine: inside.left,
				step: COUNTER_INSET,
				sweepsX: false,
				centre: midY,
			};
			break;
		case 2: // north
			side = {
				door: new Point(midX, b.buildingRect.top),
				rope: new Point(midX, b.buildingRect.top - 1),
				sink: new Point(midX, inside.bottom - 1),
				shelfLine: inside.bottom - 1,
				step: -COUNTER_INSET,
				sweepsX: true,
				centre: midX,
			};
			break;
		default: // south. `roll(0, 4)` is half-open, so 0..3 is exhaustive.
			side = {
				door: new Point(midX, b.buildingRect.bottom - 1),
				rope: new Point(midX, b.buildingRect.bottom),
				sink: new Point(midX, inside.top),
				shelfLine: inside.top,
				step: COUNTER_INSET,
				sweepsX: true,
				centre: midX,
			};
			break;
	}
	// C# `:2441`, `:2481`, `:2521`, `:2561`. Which of the four held-area
	// adjustments applies is not a free choice: the shelves stand against
	// `shelfLine`, and the arm that shelves against the *larger* edge takes four
	// tiles off that edge while the arm that shelves against the *smaller* one
	// pushes the far edge out by four. `step` is negative in the first case and
	// positive in the second, so one sign decides all four arms.
	if (side.sweepsX) {
		if (side.step < 0) tablesAreaBottom -= SERVICE_WALL_DEPTH;
		else tablesAreaTop += SERVICE_WALL_DEPTH;
	} else {
		if (side.step < 0) tablesAreaRight -= SERVICE_WALL_DEPTH;
		else tablesAreaLeft += SERVICE_WALL_DEPTH;
	}

	ctx.placeDoor(
		map,
		side.door.x,
		side.door.y,
		Models.tiles.get(TileID.FLOOR_WALKWAY)!,
		ctx.makeObjWoodenDoor()
	);
	// "place velvet entry rope ... get rid of cars" (C# `:2430-2432`): the
	// walkway ring is where `AddWreckedCarsOutside` puts them, and a car standing
	// on the rope would hide the decoration. The rope cell is always inside
	// `Block.rectangle`, which C# `:2403` has already made walkway floor.
	const parked = map.getMapObjectAt(side.rope.x, side.rope.y);
	if (parked) map.removeMapObject(parked);
	map.getTileAt(side.rope.x, side.rope.y)?.addDecoration(GameImages.DECO_VELVET_ROPE);
	// center the sink opposite the door
	map.placeMapObject(makeObjKitchenSink(GameImages.OBJ_KITCHEN_SINK), side.sink);

	// create the shelves and counters. C# `:2442-2464`, `:2482-2504`,
	// `:2522-2544`, `:2562-2584` — the same two statements four times with the
	// axes swapped. (The C#'s `westtile = map.GetTileAt(...)` lines in the middle
	// of each arm assign a local that is never read again; they are leftover
	// debugging and are not transliterated.)
	const counterLine = side.shelfLine + side.step;
	// The C#'s two loops bound themselves differently and the difference is a
	// tile: `for (i = 1; i <= InsideRect.Height; i++) { y = Bottom - i; }` against
	// `for (i = 0; i <= InsideRect.Width; i++) { x = Left + i; }`. The north/south
	// arms therefore visit `InsideRect.Right` / `InsideRect.Top`, which is the
	// *wall* ring — the `isWalkable` tests are what keep that extra cell from
	// growing a shelf.
	const first = side.sweepsX ? 0 : 1;
	const last = side.sweepsX ? inside.width : inside.height;
	for (let i = first; i <= last; i++) {
		const sweep = side.sweepsX ? inside.left + i : inside.bottom - i;
		const shelf = side.sweepsX ? new Point(sweep, side.shelfLine) : new Point(side.shelfLine, sweep);
		const counter = side.sweepsX ? new Point(sweep, counterLine) : new Point(counterLine, sweep);

		// "place a shelf with alcohol, but not the middle as we put the sink there"
		// — the alcohol is the one thing not ported; see the module header. The
		// middle cell is skipped because the sink is already on it.
		if (map.isWalkable(shelf.x, shelf.y) && sweep !== side.centre) {
			map.placeMapObject(makeObjShelf(GameImages.OBJ_BAR_SHELVES), shelf);
		}

		// place a bar counter another 2 tiles in from the shelves
		if (map.isWalkable(counter.x, counter.y)) {
			map.placeMapObject(makeObjCounter(GameImages.OBJ_KITCHEN_COUNTER), counter);
		}
	}

	// add building image next to doors. C# `:2589`.
	ctx.decorateOutsideWalls(map, b.buildingRect, (x, y) =>
		map.getMapObjectAt(x, y) === null && ctx.countAdjDoors(map, x, y) >= 1 ? GameImages.DECO_BAR : null
	);

	/////////
	// 3. Add tables and chairs
	/////////
	// C# `:2596-2607`. On the arms that shelf against the *larger* inside-rect edge
	// the service wall took four tiles off that edge, so the difference below is
	// negative and `Math.max` hands the whole of it to the inside-rect dimension
	// — which is why the west and north arms need no arithmetic here at all.
	// `roll(n, n)` is then not a draw: `DiceRoller.roll` returns `min` when
	// `max <= min`, so on those two arms the table count is a function of the
	// block and the roll costs nothing.
	const bySide = side.sweepsX
		? Math.max(inside.width, tablesAreaBottom - tablesAreaTop)
		: Math.max(tablesAreaLeft - tablesAreaRight, inside.height);
	const nbTables = roller.roll(bySide, bySide);

	// C# `:2609-2611`.
	const tablesAreaWidth = Math.abs(tablesAreaLeft - tablesAreaRight);
	const tablesAreaHeight = Math.abs(tablesAreaBottom - tablesAreaTop);
	const insideRoom = new Rect(tablesAreaLeft, tablesAreaTop, tablesAreaWidth, tablesAreaHeight);
	for (let i = 0; i < nbTables; i++) {
		ctx.mapObjectPlaceInGoodPosition(
			map,
			insideRoom,
			// `!IsADoorNSEW`, which is `CountAdjDoors == 0` — see the module header.
			(pt) => ctx.countAdjDoors(map, pt.x, pt.y) === 0,
			roller,
			(pt) => {
				// four chairs around. C# `:2620-2637`. Four separate calls and not
				// a loop: each is its own roll, and the C# writes them out.
				const adjTableRect = intersectRect(new Rect(pt.x - 1, pt.y - 1, 3, 3), insideRoom);
				const notTheTable = (pt2: Point) => !pt2.equals(pt) && ctx.countAdjDoors(map, pt2.x, pt2.y) === 0;
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjChair(GameImages.OBJ_CHAIR)
				);
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjChair(GameImages.OBJ_CHAIR)
				);
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjChair(GameImages.OBJ_CHAIR)
				);
				ctx.mapObjectPlaceInGoodPosition(map, adjTableRect, notTheTable, roller, () =>
					makeObjChair(GameImages.OBJ_CHAIR)
				);

				// table. C# `:2651-2652`, returned rather than placed so it lands
				// on the cell `mapObjectPlaceInGoodPosition` chose.
				return makeObjTable(GameImages.OBJ_TABLE);
			}
		);
	}

	/////////
	// 4. Zone
	/////////
	// demark building. C# `:2661-2664`.
	map.addZone(ctx.makeUniqueZone('Bar', b.buildingRect));
	// walkway zones.
	ctx.makeWalkwayZones(map, b);

	// Done.
	return true;
}

// ── Factories and helpers the context does not carry ────────────────────────

/**
 * C# `System.Drawing.Rectangle.Intersect`, which replaces the receiver with the
 * overlap and leaves it `Rectangle.Empty` when the two do not meet.
 * `BaseTownGenerator.intersectRect` (`:1873`) is the same function, private.
 */
function intersectRect(a: Rect, b: Rect): Rect {
	if (!a.intersects(b)) return Rect.Empty;
	const left = Math.max(a.left, b.left);
	const top = Math.max(a.top, b.top);
	const right = Math.min(a.right, b.right);
	const bottom = Math.min(a.bottom, b.bottom);
	return new Rect(left, top, right - left, bottom - top);
}

/**
 * C# `BaseMapGenerator.cs:595` `MakeObjShelf`.
 *
 * `BURNABLE` is the fork's; the port's own `protected makeObjShelf` (`:635`) is
 * still vanilla's `UNINFLAMMABLE`. The C#'s is used here — a Stage 5 building is
 * the fork's building — and the two are reconciled when the factory is promoted
 * to `TownBuildingContext`, which has to change both call sites at once.
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

/** C# `BaseMapGenerator.cs:681` `MakeObjTable`. Also `BURNABLE` and 6 kg upstream. */
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

/**
 * C# `BaseMapGenerator.cs:693` `MakeObjChair`.
 *
 * Two differences from the port's `protected makeObjChair` (`:739`), and the
 * second is load-bearing for a bar: the fork has no `JumpLevel` on a chair and
 * gives it `IsWalkable` instead (Release 4), so a bar's chairs are things a
 * survivor stands on and steps over. The C#'s are used here; see
 * {@link makeObjShelf}.
 */
function makeObjChair(imageId: string): MapObject {
	const chair = new MapObject(
		'chair',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		// The C#'s `BASE_HITPOINTS / 3` is integer division, so 13 and not
		// 13.333: a chair with fractional hit points is a bar chair that reports a
		// third of its health forever. `Math.floor` is the spelling that matters.
		Math.floor(DoorWindow.BASE_HITPOINTS / 3)
	);
	chair.isMaterialTransparent = true;
	chair.givesWood = true;
	chair.isMovable = true;
	chair.isWalkable = true;
	chair.weight = 1;
	return chair;
}

/** C# `BaseMapGenerator.cs:904` `MakeObjKitchenSink`. The port has no copy. */
function makeObjKitchenSink(imageId: string): MapObject {
	const sink = new MapObject(
		'sink',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.UNINFLAMMABLE,
		DoorWindow.BASE_HITPOINTS * 4
	);
	sink.isMaterialTransparent = true;
	// `IsContainer = true //@@MP (Release 5-3)` — the C#'s own comment.
	sink.isContainer = true;
	sink.jumpLevel = 1;
	sink.givesWood = true;
	return sink;
}

/**
 * C# `BaseMapGenerator.cs:956` `MakeObjCounter` — "Generic counter useful for
 * bars, shops, etc". The port has no copy.
 *
 * `MakeObjKitchenCounter` (`:944`) is a *different* object that shares this one's
 * name and sprite; `StandOnFovBonus` is the flag that tells them apart, and it
 * is why `MakeObjCounter` and not the kitchen one is what the bar calls. The C#
 * comment at `:2461` records the change: Release 5-3 switched the bar counter
 * "to BarCounter to keep them jumpable".
 */
function makeObjCounter(imageId: string): MapObject {
	const counter = new MapObject(
		'counter',
		imageId,
		MapObjectBreak.BREAKABLE,
		MapObjectFire.BURNABLE,
		DoorWindow.BASE_HITPOINTS * 4
	);
	counter.jumpLevel = 1;
	counter.isMaterialTransparent = true;
	counter.givesWood = true;
	counter.standOnFovBonus = true;
	return counter;
}
