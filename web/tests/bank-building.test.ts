import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeBankBuilding } from "@gameplay/generators/buildings/makeBankBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.Bank` — the C#'s `MakeBankBuilding` (`BaseTownGenerator.cs:4253`),
 * and the one call site that reaches it from `BaseTownGenerator.generate()`.
 *
 * Four things are worth pinning here, and none of them is "the walls are the
 * right colour":
 *
 * 1. **The dispatch is live.** A generator that compiles, is registered nowhere
 *    and is called from nowhere produces no diff a reader can see and a world
 *    with no banks in it. So the first test generates a district and looks for
 *    a `Bank@` zone on it.
 * 2. **The room is a room.** The C# builds a security boundary — a line of
 *    safes, a vault wall, a counter line — and the failure that matters is a
 *    bank whose public floor is walled off from its own entrance.
 *    Reachable-from-the-door is the assertion; "there is a door somewhere" is
 *    not, and the C# does put doors in the counter line and the vault wall.
 * 3. **The size precondition is the C#'s, exactly.** `InsideRect < 5` returns
 *    false with the block untouched and `InsideRect == 5` builds. Note that a
 *    block of `n` has an inside rect of `n - 4`, so the boundary block is 9x9
 *    and a 7x7 block is under it — an easy off-by-four to get wrong and one the
 *    boundary assertion is here to catch.
 * 4. **CLASSIC is byte-identical.** The half that matters. A gate that ran
 *    *after* the dispatch roll would leave every Classic world one die short of
 *    the Still Alive one, which invalidates every saved game for no visible
 *    reason. So the Classic fingerprint is a committed value, and what makes it
 *    non-vacuous is the Still Alive fingerprint for the same seed: it must
 *    differ, and differ for the reason the feature exists.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four: a shop drops items, a house basement
// spawns a rat, and every actor factory needs a faction.
beforeAll(() => {
	new GameTiles();
	new GameActors();
	new GameItems();
	new GameFactions();
});

/** A 40x40 district: nine blocks, small enough to generate, big enough to bank. */
const MAP = 40;
const SEED = 1;

function newParams(width = MAP, height = MAP): Parameters {
	const params = new Parameters();
	params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
	params.mapWidth = width;
	params.mapHeight = height;
	return params;
}

/** `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it. */
function newGenerator(params = newParams()): BaseTownGenerator {
	return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * The size and seed the *content* assertions run at, which are deliberately not
 * the ones ``9bb5e4907bc3f62c`` is pinned at.
 *
 * **50x50 is the smallest district the reference will ever generate**
 * (`districtsSizeFloor`, Release 7-3 -- the C# raised `DistrictSize` from 30 to 50
 * when it added `GenerateShoppingMall`), so the 40x40 below is smaller than
 * anything a player sees. That matters now that the business region is one loop
 * again. The C#'s interior at `:496` is reached only when a district's business
 * region offers a block whose `rolled` is 30 or more, because `:479`'s
 * `|| charOfficesCount == 0` forces a CHAR attempt on the district's *first* such
 * block and `MakeCHARBuilding` does not decline. At 40x40 that needs two
 * business-region blocks inside a five-block district, and over 60 seeds it never
 * happens -- which left every content assertion below iterating an empty set and
 * passing vacuously. At 50x50 the arms are reachable.
 *
 * The seed is swept, not chosen: it is a seed at this size that builds the
 * building in question. `MAP`/`SEED` are untouched because the Classic
 * fingerprint is a 40x40 seed-1 value that seven suites assert.
 */

/** The reference's own minimum district, for the content assertions above. */
const ARM_MAP = 50;
/** A 50x50 seed that builds a bank. Swept -- see the note above. */
const ARM_SEED = 22;

/** A generator at `ARM_MAP`, for the tests that need a district that has one. */
function newArmGenerator(params = newParams(ARM_MAP, ARM_MAP)): BaseTownGenerator {
	return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

function bankZones(map: GameMap): string[] {
	return map.zones.map((z) => z.name).filter((n) => n.startsWith("Bank@"));
}

/**
 * A whole-district fingerprint: every tile's model, its map object, its
 * decorations and its inside flag, through two independent accumulators. A
 * 40x40 district is 1 600 cells with around 60 map objects and 1 200 zones, so
 * the thing worth asserting is one number, and one hash function is one number
 * too few.
 */
function fingerprint(map: GameMap): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			const tile = map.getTileAt(x, y)!;
			const obj = map.getMapObjectAt(x, y);
			const cell = `${tile.model.id}|${obj ? obj.imageId : "-"}|${(tile.getDecorations ?? []).join(",")}|${
				tile.isInside ? 1 : 0
			}`;
			for (let i = 0; i < cell.length; i++) {
				h1 = Math.imul(h1 ^ cell.charCodeAt(i), 16777619) >>> 0;
				h2 = (Math.imul(h2 + cell.charCodeAt(i) + i, 2654435761) ^ (h2 >>> 7)) >>> 0;
			}
		}
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Everything a bank can leave on a district, as one sorted list. Any of these
 * appearing under CLASSIC is the bug the feature gate exists to prevent, and
 * listing them rather than counting `Bank@` zones means a bank that somehow lost
 * its zone is still caught.
 */
function bankTraces(map: GameMap): string[] {
	const out: string[] = [];
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			const obj = map.getMapObjectAt(x, y);
			if (obj && /bank_(teller|safe)/.test(obj.imageId)) out.push(`object ${obj.imageId}@${x},${y}`);
			for (const deco of map.getTileAt(x, y)!.getDecorations ?? [])
				if (deco === GameImages.DECO_BANK_SIGN) out.push(`deco ${deco}@${x},${y}`);
		}
	}
	return out.sort();
}

/** The block a `Bank@x-y` zone was cut from, as a fresh `Block`. */
function blockOf(zone: { bounds: Rect }): Block {
	const b = zone.bounds;
	return new Block(new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2));
}

/**
 * A `TownBuildingContext` with the generator's real placement primitives, rather
 * than a re-declaration of them: the delegates are private on
 * `BaseTownGenerator`, so a stub in `TOWN_BUILDING_PASSES` is the only way to get
 * the genuine article. The map, the block and the roller are then swapped per
 * test, which is exactly what `buildingContext()` does per block.
 */
let borrowedContext: TownBuildingContext | null = null;
function contextFor(map: GameMap, block: Block, roller: DiceRoller): TownBuildingContext {
	if (!borrowedContext) throw new Error("captureContext() first");
	return { ...borrowedContext, map, block, roller };
}
function captureContext(): void {
	const saved = TOWN_BUILDING_PASSES.slice();
	let captured: TownBuildingContext | null = null;
	TOWN_BUILDING_PASSES.push({
		csharpName: "MakeBorrowContextBuilding",
		tryBuild: (ctx) => {
			captured ??= ctx;
			return false;
		},
	});
	try {
		Session.get().ruleset = Ruleset.CLASSIC;
		newArmGenerator().generate(ARM_SEED);
	} finally {
		TOWN_BUILDING_PASSES.length = 0;
		TOWN_BUILDING_PASSES.push(...saved);
	}
	expect(captured).not.toBeNull();
	borrowedContext = captured as unknown as TownBuildingContext;
}
beforeAll(captureContext);

/**
 * A roller whose `Roll(0, 4)` calls are scripted, and whose every other roll is
 * the real one.
 *
 * The C# spends exactly two of them on a bank attempt, back to back: the
 * per-block dispatch at `:508` (`switch (roll2)`, one case in five reaches this
 * building) and the door side at `:4288`. `dispatch` and `doorSides` script those
 * two, cycling, so a test can choose which of the C#'s four arms to exercise
 * without depending on what a seed happens to produce — while the safes' 40%
 * roll, the vault door's three-way roll, the table count and the good-position
 * picks stay real and stay in the C#'s order.
 *
 * The door side is matched by position rather than by counting `[0, 4)` calls,
 * because `mapObjectPlaceInGoodPosition` rolls `[0, n)` too and `n` can be 4. The
 * door side is the only `[0, 4)` roll that *immediately follows* the dispatch
 * roll, so the flag is what makes the pairing unambiguous.
 */
/**
 * A roller whose every `roll(0, 4)` is a *door side*.
 *
 * There is no dispatch arm here any more. The C# spends the dispatch `Roll(0, 4)`
 * at `BaseTownGenerator.cs:510`, outside `MakeBankBuilding` (`:512`), and the port
 * matches that: the generator takes the case as a parameter. So the first
 * `roll(0, 4)` the bank itself makes is its door side, which is the whole reason
 * this used to be able to script "a dispatch the bank declined" -- it can no
 * longer, because declining is the pass's decision and the bank is not entered.
 */
function bankRoller(opts: { doorSides?: number[]; seed?: number } = {}): DiceRoller {
	const { doorSides = [0], seed = 1 } = opts;
	const roller = new DiceRoller(seed);
	const real = roller.roll.bind(roller);
	const pick = (script: number[], i: number) => (script.length ? script[i % script.length] : 0);
	let doorSideRolls = 0;
	roller.roll = (min: number, max: number) => {
		if (min !== 0 || max !== 4) return real(min, max);
		return pick(doorSides, doorSideRolls++);
	};
	return roller;
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
	const map = new GameMap(11, "plot", width, height);
	const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
	for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
	return map;
}

/**
 * The block used for the arm-by-arm tests: 20x14, so the derived rects are
 * `buildingRect = (2,2,18,12)` and `insideRect = (3,3,16,10)` with its right edge
 * at 19 and its bottom edge at 13, and `midX = 11`, `midY = 8`. Big enough for
 * the C#'s 5x5 floor and for a six-tile-deep back room on every side.
 */
const ARM = new Rect(1, 1, 20, 14);

/**
 * Interior tiles reachable from `from` on *tile* walkability, ignoring the
 * furniture.
 *
 * Not `map.isWalkable`, which also asks the map object: the C#'s table count is
 * `Roll(InsideRect.Width, ...)` with no regard for the six-tile-deep area it
 * places them in, so a bank with a tall inside rect comes out with more tables
 * and chairs than floor, and an object-level flood fill then measures the C#'s
 * furniture rather than its room. Tile walkability is the question actually
 * being asked: is the public floor a connected area, or is the entrance opening
 * onto a wall.
 */
function floorReachableFrom(map: GameMap, from: Point, rect: Rect): Point[] {
	const seen = new Set<string>([`${from.x},${from.y}`]);
	const queue: Point[] = [from];
	while (queue.length) {
		const p = queue.shift()!;
		for (const next of [
			new Point(p.x + 1, p.y),
			new Point(p.x - 1, p.y),
			new Point(p.x, p.y + 1),
			new Point(p.x, p.y - 1)
		]) {
			const key = `${next.x},${next.y}`;
			const tile = map.getTileAt(next.x, next.y);
			if (seen.has(key) || !rect.contains(next) || !tile || !tile.model.isWalkable) continue;
			seen.add(key);
			queue.push(next);
		}
	}
	return [...seen].map((k) => {
		const [x, y] = k.split(",").map(Number);
		return new Point(x, y);
	});
}

const originalRuleset = Session.get().ruleset;
afterEach(() => {
	Session.get().ruleset = originalRuleset;
});

// ── Reached from the district generator ─────────────────────────────────────

describe("bank building, from BaseTownGenerator.generate()", () => {
	it("builds banks on still-empty blocks, and the C#'s zone names them", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const map = newArmGenerator().generate(ARM_SEED);

		// Named `Bank` by the C# at `:4284` and made unique by `makeUniqueZone`,
		// which appends the block's centre as `Bank@x-y`.
		const names = bankZones(map);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) expect(name).toMatch(/^Bank@\d+-\d+$/);
		// The C#'s cap is `Round(40 / 10 / 2.5)` = 2 banks on a 40-wide map.
		expect(names.length).toBeLessThanOrEqual(2);
	});

	it("walls the building rect, carpets the inside, and leaves the room reachable from its door", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const map = newArmGenerator().generate(ARM_SEED);
		const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
		const wall = Models.tiles.get(TileID.WALL_LIGHT_BROWN)!;
		const carpet = Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!;
		const vaultWall = Models.tiles.get(TileID.WALL_HOSPITAL)!;

		for (const zone of map.zones.filter((z) => z.name.startsWith("Bank@"))) {
			const b = blockOf(zone);
			expect(zone.bounds.equals(b.buildingRect)).toBe(true);

			// The perimeter is wall, except at the doorway: `placeDoor` lays the
			// floor tile *under* the door, which is the whole reason it is ordered
			// that way (`TownBuilding.placeDoor`).
			const doorsOnWall: Point[] = [];
			for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
				for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
					const onEdge =
						x === b.buildingRect.left ||
						x === b.buildingRect.right - 1 ||
						y === b.buildingRect.top ||
						y === b.buildingRect.bottom - 1;
					if (!onEdge) continue;
					const tile = map.getTileAt(x, y)!;
					if (tile.model === wall) continue;
					expect(tile.model, `perimeter ${x},${y} is wall or a doorway`).toBe(walkway);
					if (map.getMapObjectAt(x, y) instanceof DoorWindow) doorsOnWall.push(new Point(x, y));
				}
			}
			// Exactly one public entrance, on the building rect, and a glass door
			// as the C# says at `:4293`.
			expect(doorsOnWall).toHaveLength(1);
			const entrance = map.getMapObjectAtPoint(doorsOnWall[0]) as DoorWindow;
			expect(entrance.imageId).toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);

			// The inside is blue carpet and flagged inside, so the darkness and
			// the AI both treat it as a room. The one thing that is not carpet is
			// the C#'s vault wall, which it drops *inside* the room, two tiles in
			// from the safes (`:4309`).
			let vaultTiles = 0;
			for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
				for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
					const tile = map.getTileAt(x, y)!;
					if (tile.model === vaultWall) ++vaultTiles;
					else expect(tile.model, `inside ${x},${y}`).toBe(carpet);
					expect(tile.isInside, `inside ${x},${y} flagged`).toBe(true);
				}
			}
			expect(vaultTiles, "the vault wall is inside the room").toBeGreaterThan(0);

			// The room is not sealed: step in off the entrance, and the tile there
			// is floor, it can see a door, and a real part of the inside rect is
			// reachable. The size of that part is deliberately a floor and not the
			// C#'s geometry: a bank whose counters, tables and vault wall fill the
			// inside rect is correct, one whose entrance opens onto a wall is not.
			const door = doorsOnWall[0];
			let inward: Point;
			if (door.x === b.buildingRect.left) inward = new Point(door.x + 1, door.y);
			else if (door.x === b.buildingRect.right - 1) inward = new Point(door.x - 1, door.y);
			else if (door.y === b.buildingRect.top) inward = new Point(door.x, door.y + 1);
			else inward = new Point(door.x, door.y - 1);
			expect(map.isWalkable(inward.x, inward.y), `inside the door at ${inward}`).toBe(true);
			expect(borrowedContext!.countAdjDoors(map, inward.x, inward.y)).toBeGreaterThanOrEqual(1);
			expect(floorReachableFrom(map, inward, b.insideRect).length).toBeGreaterThan(b.insideRect.width);
		}
	});

	it("gives the bank its counters, its safes and its sign", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const traces = bankTraces(newArmGenerator().generate(ARM_SEED));

		// One trace per teller counter and per safe, plus the sign: the C# puts it
		// with `DecorateOutsideWalls` on the first empty tile with an adjacent
		// door, which is the wall either side of the entrance.
		const tellers = traces.filter((t) => t.includes(GameImages.OBJ_BANK_TELLER));
		const safes = traces.filter((t) => t.includes("bank_safe"));
		expect(tellers.length).toBeGreaterThan(0);
		expect(safes.length).toBeGreaterThan(0);
		// C# `:4494` rolls 40% for the open one, so a district with banks has
		// both, and the open one is walkable furniture rather than a wall.
		expect(safes.some((t) => t.includes(GameImages.OBJ_BANK_SAFE_OPEN))).toBe(true);
		expect(safes.some((t) => t.includes(GameImages.OBJ_BANK_SAFE_CLOSED))).toBe(true);
		expect(traces.some((t) => t.includes(GameImages.DECO_BANK_SIGN))).toBe(true);
	});
});

// ── The generator itself ────────────────────────────────────────────────────

describe("makeBankBuilding", () => {
	it("returns false and touches nothing when the inside rect is under 5x5", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// A 6x6 block has a 2x2 inside rect, so the size check is what refuses.
		// The dispatch roll is scripted to `1` — the C#'s `case 1` — so the
		// `false` here is the size check and nothing else.
		const map = plot();
		const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
		expect(makeBankBuilding(contextFor(map, new Block(new Rect(2, 2, 6, 6)), bankRoller()), 1)).toBe(false);

		expect(map.zones).toHaveLength(0);
		expect(map.mapObjects).toHaveLength(0);
		for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) expect(map.getTileAt(x, y)!.model).toBe(grass);
	});

	it("accepts an inside rect of exactly 5x5, the C#'s boundary", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// `InsideRect.Width < 5` is a strict `<`, so 5 builds — and 5 means a 9x9
		// block, since a block of n has an inside rect of n - 4. A generator that
		// wrote `<=` would hand this block to the housing pass instead, and that
		// off-by-one is invisible anywhere else.
		const map = plot();
		expect(makeBankBuilding(contextFor(map, new Block(new Rect(2, 2, 9, 9)), bankRoller()), 1)).toBe(true);
		expect(bankZones(map)).toHaveLength(1);
	});

	it("declines every block past the C#'s per-map cap", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// `banksLimit = Round(map.Width / 10 / 2.5)`, with the C#'s integer
		// division: 40 -> 2, 100 -> 4. Offering five eligible blocks to a
		// 40-wide map must yield two banks and three blocks left alone.
		const map = plot();
		const blocks = [
			new Block(new Rect(1, 1, 9, 9)),
			new Block(new Rect(12, 1, 9, 9)),
			new Block(new Rect(23, 1, 9, 9)),
			new Block(new Rect(1, 12, 9, 9)),
			new Block(new Rect(12, 12, 9, 9))
		];
		const roller = bankRoller();
		expect(blocks.filter((b) => makeBankBuilding(contextFor(map, b, roller), 1))).toHaveLength(2);

		const wide = plot(100, 100);
		const wideBlocks = [0, 1, 2, 3, 4, 5].map((i) => new Block(new Rect(1 + i * 11, 1, 9, 9)));
		const wideRoller = bankRoller();
		expect(wideBlocks.filter((b) => makeBankBuilding(contextFor(wide, b, wideRoller), 1))).toHaveLength(4);
	});

	it("skips the blocks the dispatch roll does not pick", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// C# `:508` `switch (roll2)`: one case in five reaches the bank, and the
		// roll is spent whether or not it does. 0, 2 and 3 are the other three
		// buildings in that switch.
		const map = plot();
		const blocks = [
			new Block(new Rect(1, 1, 9, 9)),
			new Block(new Rect(12, 1, 9, 9)),
			new Block(new Rect(23, 1, 9, 9)),
			new Block(new Rect(1, 12, 9, 9))
		];
		// The cascade's `switch` is the only thing that can decline a block now, so
		// this replays its four cases: 0 bar, 1 bank, 2 clinic, 3 mechanic. The bank
		// is entered on `case 1` alone and the other three are not the bank's.
		void blocks;
		const roller = bankRoller();
		const entered = (roll2: number): boolean =>
			makeBankBuilding(contextFor(map, new Block(new Rect(1, 1, 9, 9)), roller), roll2);
		expect([0, 2, 3].map(entered)).toEqual([false, false, false]);
		expect(entered(1), "case 1 is the bank").toBe(true);
		expect(bankZones(map)).toHaveLength(1);
	});

	it("builds all four door sides, each with its back room against the far edge", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// The C# writes the same twenty lines out four times with the axes
		// swapped, so the four arms are the claim worth pinning: the entrance on
		// the rolled side, the safes on the opposite inside-rect edge, the
		// hospital wall two tiles in from them, the counters four in, and the
		// centre of the sweep carrying the vault door and the openable counter
		// door instead.
		//
		// `ARM` is 20x14 at (1,1), so `insideRect` is (3,3,16,10) — right 19,
		// bottom 13 — and `midX`/`midY` are 11/8. The west/east arms sweep
		// y 12..3 and the north/south arms sweep x 3..19, the last of which is
		// the building wall: C# `:4365` loops `i = 0..InsideRect.Width`
		// inclusive, one cell further than the west/east arms' `i = 1..Height`
		// at `:4297`.
		const arms = [
			{ name: "west", door: [2, 8], sweeps: "y", from: 12, to: 3, safes: 18, wall: 16, counters: 14, centre: 8 },
			{ name: "east", door: [19, 8], sweeps: "y", from: 12, to: 3, safes: 3, wall: 5, counters: 7, centre: 8 },
			{ name: "north", door: [11, 2], sweeps: "x", from: 3, to: 19, safes: 12, wall: 10, counters: 8, centre: 11 },
			{ name: "south", door: [11, 13], sweeps: "x", from: 3, to: 19, safes: 3, wall: 5, counters: 7, centre: 11 }
		];
		const hospital = Models.tiles.get(TileID.WALL_HOSPITAL)!;

		arms.forEach((arm, side) => {
			const map = plot();
			const b = new Block(ARM);
			expect(makeBankBuilding(contextFor(map, b, bankRoller({ doorSides: [side] })), 1), `bank, ${arm.name} side`).toBe(
				true
			);

			// The entrance is on the rolled side, and a glass door in the wall.
			const entrance = map.getMapObjectAt(arm.door[0], arm.door[1]);
			expect(entrance, `entrance on the ${arm.name} wall`).toBeInstanceOf(DoorWindow);
			expect((entrance as DoorWindow).imageId).toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);
			expect(map.getTileAt(arm.door[0], arm.door[1])!.model).toBe(Models.tiles.get(TileID.FLOOR_WALKWAY)!);

			const sweep: number[] = [];
			for (
				let s = arm.from;
				arm.sweeps === "y" ? s >= arm.to : s <= arm.to;
				s += arm.sweeps === "y" ? -1 : 1
			)
				sweep.push(s);
			/** The swept cell `coord` tiles along the axis the sweep does not run. */
			const at = (s: number, coord: number) =>
				arm.sweeps === "y" ? new Point(coord, s) : new Point(s, coord);
			const objAt = (s: number, coord: number) => map.getMapObjectAtPoint(at(s, coord));

			// The safes stand on the far edge for the whole sweep, and the one
			// swept cell that is a wall rather than floor gets nothing — which is
			// the north/south arms' extra `i` iteration, and the reason they place
			// 16 safes where the west/east arms place 10.
			const safeCells = sweep.filter((s) => objAt(s, arm.safes)?.imageId.startsWith("MapObjects/bank_safe"));
			expect(safeCells, `safes on the ${arm.name} edge`).toHaveLength(side <= 1 ? 10 : 16);
			for (const s of safeCells) expect(map.getTileAt(at(s, arm.safes).x, at(s, arm.safes).y)!.model).not.toBe(hospital);

			// The vault wall runs the whole sweep too, and the iron door is
			// centred on it, opposite the entrance.
			const wallCells = sweep.filter((s) => map.getTileAt(at(s, arm.wall).x, at(s, arm.wall).y)!.model === hospital);
			expect(wallCells.length, `vault wall on the ${arm.name} edge`).toBeGreaterThanOrEqual(9);
			const vault = objAt(arm.centre, arm.wall);
			expect(vault, `vault door on the ${arm.name} centre`).toBeInstanceOf(DoorWindow);
			expect((vault as DoorWindow).imageId).toMatch(/^MapObjects\/iron_door_/);
			// The C# rolls open / broken / locked; the port has no locked door,
			// so all three land on one of the two ids it can draw.
			expect(["MapObjects/iron_door_open", "MapObjects/iron_door_broken", "MapObjects/iron_door_closed"]).toContain(
				vault!.imageId
			);

			// The counter line: a teller on every swept cell but the centre, and a
			// wooden door in the middle of it, the C#'s way through to the vault.
			const tellers = sweep.filter((s) => objAt(s, arm.counters)?.imageId === GameImages.OBJ_BANK_TELLER);
			expect(tellers.length, `tellers on the ${arm.name} line`).toBeGreaterThan(0);
			const counterDoors = sweep.filter(
				(s) => s !== arm.centre && objAt(s, arm.counters) instanceof DoorWindow
			);
			expect(counterDoors, `no stray door in the ${arm.name} counter line`).toHaveLength(0);
			expect(objAt(arm.centre, arm.counters)?.imageId).toBe(GameImages.OBJ_WOODEN_DOOR_CLOSED);
		});
	});

	it("puts the tables and their chairs in the customer area, not in the vault", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// The C# holds the customer area back six tiles from the safes (`:4296`)
		// and places `nbTables` of them in what is left (`:4453-4476`), two
		// chairs each. On `ARM` with a west door the area is
		// `Rect(left 3, top 3, width |3-13| = 10, height |13-3| = 10)`.
		const map = plot();
		const b = new Block(ARM);
		expect(makeBankBuilding(contextFor(map, b, bankRoller({ doorSides: [0] })), 1)).toBe(true);

		const customer = new Rect(3, 3, 10, 10);
		const vault = new Rect(15, 3, 4, 10);
		const inArea = (r: Rect) => {
			const found: string[] = [];
			for (let x = r.left; x < r.right; x++)
				for (let y = r.top; y < r.bottom; y++) {
					const name = map.getMapObjectAt(x, y)?.name;
					if (name === "table" || name === "couch") found.push(name);
				}
			return found;
		};

		// `nbTables` is `Roll(n, n)` with `n = Max(6 - width, height / 6)`, and
		// `roll` returns `min` when `max <= min`: so `Max(-10, 1)` — one table,
		// and the two chairs the C# puts around it.
		expect(inArea(customer).sort()).toEqual(["couch", "couch", "table"]);
		// And nothing of it landed behind the counters, which is the property the
		// held area exists for.
		expect(inArea(vault)).toEqual([]);
	});

	it("is deterministic for a given block and roller", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// World generation is seeded, so `ctx.roller` is the only randomness
		// allowed. Same roller and same block, same map; a different roller has
		// to give a different answer, or the first assertion is vacuous.
		const build = (seed: number): string => {
			const map = plot();
			expect(makeBankBuilding(contextFor(map, new Block(ARM), bankRoller({ doorSides: [1], seed })), 1)).toBe(true);
			const out: string[] = [];
			for (let x = 0; x < MAP; x++)
				for (let y = 0; y < MAP; y++) {
					const obj = map.getMapObjectAt(x, y);
					out.push(`${map.getTileAt(x, y)!.model.id}/${obj ? obj.imageId : "-"}`);
				}
			return out.join(",");
		};
		expect(build(20250929)).toBe(build(20250929));
		expect(build(20250929)).not.toBe(build(4242));
	});
});

// ── CLASSIC ─────────────────────────────────────────────────────────────────

describe("bank building under CLASSIC", () => {
	it("is never reached, even on a block the dispatch roll picks", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		// The roll is scripted to the bank's own case, so the `false` here is the
		// feature gate and not luck: the C# would have built on it.
		const map = plot();
		expect(makeBankBuilding(contextFor(map, new Block(ARM), bankRoller({ doorSides: [1] })), 1)).toBe(false);
		expect(map.zones).toHaveLength(0);
		expect(map.mapObjects).toHaveLength(0);
		expect(map.getTileAt(3, 3)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS)!);
	});

	it("leaves a CLASSIC district with no trace of a bank", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		const map = newArmGenerator().generate(ARM_SEED);

		expect(bankZones(map)).toEqual([]);
		// Teller counters, both safes, and the sign beside the door: the C# has no
		// other use for any of them, so their absence is a stronger statement
		// than the absence of a zone.
		expect(bankTraces(map)).toEqual([]);
	});

	it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
		// Recorded from this seed with the dispatch present and the feature off,
		// and the same value the pre-bank generator produced: a CLASSIC world
		// pays nothing for the bank, not even a die. The bank gate runs before
		// `roll(0, 4)`, which is the only way that is true.
		Session.get().ruleset = Ruleset.CLASSIC;
		// **At `MAP`/`SEED`, not at `ARM_MAP`/`ARM_SEED`**: the committed value is a
		// 40x40 seed-1 fingerprint and seven suites assert it, so the district that
		// produces it is not the one the content assertions above moved to.
		const classic = fingerprint(newGenerator().generate(SEED));
		expect(classic).toBe("9bb5e4907bc3f62c");

		// The two assertions that give the committed value meaning. A
		// fingerprint that ignored the world would pass the first line for any
		// value; one that returned a per-seed constant would pass both.
		expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
	});
});
