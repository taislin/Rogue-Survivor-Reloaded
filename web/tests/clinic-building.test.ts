import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { GameMode, Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeClinicBuilding } from "@gameplay/generators/buildings/makeClinicBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.Clinic` — the C#'s `MakeClinicBuilding`
 * (`BaseTownGenerator.cs:3358`), and the one call site that reaches it from
 * `BaseTownGenerator.generate()`.
 *
 * Five things are worth pinning here, and none of them is "the walls are the
 * right colour":
 *
 * 1. **The dispatch is live, and it is the *shared* one.** A generator that
 *    compiles, is registered nowhere and is called from nowhere produces no diff
 *    a reader can see and a world with no clinics in it. So the first test
 *    generates a district and looks for a `Clinic@` zone on it. The half that is
 *    easy to get wrong is the exclusivity: the bar, the bank, the clinic and the
 *    mechanic workshop are four arms of ONE `Roll(0, 4)` at `:510`, and a clinic
 *    that rolled its own case would spend two dice per block and could be offered
 *    a block the bank had already built. Hence the case is a *parameter* and the
 *    `false` for the other three cases is asserted directly.
 * 2. **The room is a room.** The C# builds a ward — a hospital door, a reception
 *    desk, a power generator, pharmacy cupboards, beds with curtains and
 *    machinery around them — and the failure that matters is a clinic whose
 *    interior is walled off from its own entrance. Reachable-from-the-door is the
 *    assertion; "there is a door somewhere" is not, since the C# does put a desk
 *    and a generator inside the room.
 * 3. **The size precondition is the C#'s, exactly.** `InsideRect < 5` returns
 *    false with the block untouched and `InsideRect == 5` builds. Note that a
 *    block of `n` has an inside rect of `n - 4`, so the boundary block is 9x9
 *    and a 7x7 block is under it — an easy off-by-four to get wrong and one the
 *    boundary assertion is here to catch.
 * 4. **The corner scan is eight-way.** `CountAdjWalls` walks `Direction.COMPASS`,
 *    which is all eight neighbours and not the four `IsADoorNSEW` looks at. That
 *    is why the C#'s generator and its cupboards appear at all: an inside-rect
 *    corner has five adjacent wall tiles under the eight-way count and two under
 *    a four-way one, so a four-way reading places neither and the pharmacy half
 *    of the clinic is silently empty.
 * 5. **CLASSIC is byte-identical.** The half that matters. A gate that ran
 *    *after* the dispatch roll would leave every Classic world one die short of
 *    the Still Alive one, which invalidates every saved game for no visible
 *    reason. So the Classic fingerprint is a committed value, it is the same
 *    value the bank and bar tests pin, and what makes it non-vacuous is the
 *    Still Alive fingerprint for the same seed: it must differ, and differ for
 *    the reason the feature exists.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four: a clinic drops pharmacy items, a shop drops
// items, a house basement spawns a rat, and every actor factory needs a faction.
beforeAll(() => {
	new GameTiles();
	new GameActors();
	new GameItems();
	new GameFactions();
});

/** A 40x40 district: nine blocks, small enough to generate, big enough to clinic. */
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
/** A 50x50 seed that builds a clinic. Swept -- see the note above. */
const ARM_SEED = 20;

/** A generator at `ARM_MAP`, for the tests that need a district that has one. */
function newArmGenerator(params = newParams(ARM_MAP, ARM_MAP)): BaseTownGenerator {
	return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

function clinicZones(map: GameMap): string[] {
	return map.zones.map((z) => z.name).filter((n) => n.startsWith("Clinic@"));
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
 * Everything a clinic can leave on a district, as one sorted list. Any of these
 * appearing under CLASSIC is the bug the feature gate exists to prevent, and
 * listing them rather than counting `Clinic@` zones means a clinic that somehow
 * lost its zone is still caught.
 */
function clinicTraces(map: GameMap): string[] {
	const out: string[] = [];
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			const obj = map.getMapObjectAt(x, y);
			if (obj && /clinic_/.test(obj.imageId)) out.push(`object ${obj.imageId}@${x},${y}`);
			for (const deco of map.getTileAt(x, y)!.getDecorations ?? [])
				if (deco === GameImages.DECO_CLINIC_SIGN) out.push(`deco ${deco}@${x},${y}`);
		}
	}
	return out.sort();
}

/** The block a `Clinic@x-y` zone was cut from, as a fresh `Block`. */
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
 * A roller whose **first** `roll(0, 4)` is a door side and whose every other roll
 * is the real one.
 *
 * There is no dispatch arm here any more. The C# spends the dispatch `Roll(0, 4)`
 * at `BaseTownGenerator.cs:510`, outside `MakeClinicBuilding` (`:513`), and the
 * port matches that: the generator takes the case as a parameter. So the first
 * `roll(0, 4)` the clinic itself makes is its door side at `:3394`, and pinning
 * only that one is unambiguous — `mapObjectPlaceInGoodPosition` also rolls
 * `(0, goodList.Count)`, and `Count` is 4 often enough that intercepting every
 * `(0, 4)` would have rewritten the bed, curtain and machinery picks as well.
 */
function clinicRoller(opts: { doorSide?: number; seed?: number } = {}): DiceRoller {
	const { doorSide = 0, seed = 1 } = opts;
	const roller = new DiceRoller(seed);
	const real = roller.roll.bind(roller);
	let pinned = false;
	roller.roll = (min: number, max: number) => {
		if (min !== 0 || max !== 4 || pinned) return real(min, max);
		pinned = true;
		return doorSide;
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
 * the C#'s 5x5 floor and for a reception desk diagonally inside every entrance.
 */
const ARM = new Rect(1, 1, 20, 14);

/**
 * Interior tiles reachable from `from` on *tile* walkability, ignoring the
 * furniture.
 *
 * Not `map.isWalkable`, which also asks the map object: the C#'s bed count is
 * `Round(Max(...)*0.8)` with no regard for the twelve-odd cells its own beds,
 * curtains and machinery go on to fill, so a clinic's floor is expected to be
 * busier than its tile map says. Tile walkability is the question actually being
 * asked: is the ward a connected area, or does the entrance open onto a wall.
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
const originalGameMode = Session.get().gameMode;
afterEach(() => {
	Session.get().ruleset = originalRuleset;
	Session.get().gameMode = originalGameMode;
});

// ── Reached from the district generator ─────────────────────────────────────

describe("clinic building, from BaseTownGenerator.generate()", () => {
	it("builds clinics on still-empty blocks, and the C#'s zone names them", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const map = newArmGenerator().generate(ARM_SEED);

		// Named `Clinic` by the C# at `:3528` and made unique by `makeUniqueZone`,
		// which appends the block's centre as `Clinic@x-y`.
		const names = clinicZones(map);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) expect(name).toMatch(/^Clinic@\d+-\d+$/);
		// The C#'s cap is `Round(40 / 10 / 2.5)` = 2 clinics on a 40-wide map.
		expect(names.length).toBeLessThanOrEqual(2);
	});

	it("takes the shared dispatch die, so no block is two businesses at once", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const map = newArmGenerator().generate(ARM_SEED);

		// The exclusivity claim, on a real district. Each of the three built
		// buildings zones its own block with `makeUniqueZone`, so the zone rects are
		// a direct witness of which block each one claimed -- and a block claimed
		// twice is the bug two independently-rolling generators would have produced.
		// The key is the zone rect, which is `buildingRect` and therefore
		// block-specific.
		const rectOf = (z: { name: string; bounds: Rect }): string => `${z.bounds.left},${z.bounds.top}`;
		const blocksOf = (prefix: string) =>
			new Set(map.zones.filter((z) => z.name.startsWith(`${prefix}@`)).map(rectOf));
		const clinics = blocksOf("Clinic");
		const banks = blocksOf("Bank");
		const bars = blocksOf("Bar");

		// Anti-vacuity: the intersection below says nothing if every set is empty.
		expect([clinics.size, banks.size, bars.size].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
		for (const [a, b] of [
			[clinics, banks],
			[clinics, bars],
			[banks, bars]
		]) {
			const shared = [...a].filter((k) => b.has(k));
			expect(shared, `blocks claimed by both of two cascade arms: ${shared}`).toEqual([]);
		}
	});

	it("walls the building rect, tiles the inside, and leaves the ward reachable from its door", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const map = newArmGenerator().generate(ARM_SEED);
		const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
		const wall = Models.tiles.get(TileID.WALL_STONE)!;
		const tiles = Models.tiles.get(TileID.FLOOR_TILES)!;
		const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;

		for (const zone of map.zones.filter((z) => z.name.startsWith("Clinic@"))) {
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
					// Walkway, or the concrete the C# cuts the doorway through at
					// `:3399` — the clinic is the one of the three buildings that
					// names a floor other than the walkway, and `placeDoor` lays it
					// down *under* the door, which is the whole reason it is ordered
					// that way (`TownBuilding.placeDoor`).
					expect(
						tile.model === walkway || tile.model === concrete,
						`perimeter ${x},${y} is wall or a doorway`
					).toBe(true);
					if (map.getMapObjectAt(x, y) instanceof DoorWindow) doorsOnWall.push(new Point(x, y));
				}
			}
			// Exactly one public entrance, on the building rect, and a *hospital*
			// door as the C# says at `:3399`. The doorway is cut through concrete
			// rather than the walkway the bar and the bank use, which is the one
			// place the three buildings differ and worth pinning.
			expect(doorsOnWall).toHaveLength(1);
			const entrance = map.getMapObjectAtPoint(doorsOnWall[0]) as DoorWindow;
			expect(entrance.imageId).toBe(GameImages.OBJ_HOSPITAL_DOOR_CLOSED);
			expect(map.getTileAt(doorsOnWall[0].x, doorsOnWall[0].y)!.model).toBe(concrete);

			// The inside is floor tile and flagged inside, so the darkness and the
			// AI both treat it as a room.
			for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
				for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
					const tile = map.getTileAt(x, y)!;
					expect(tile.model, `inside ${x},${y}`).toBe(tiles);
					expect(tile.isInside, `inside ${x},${y} flagged`).toBe(true);
				}
			}

			// The room is not sealed: step in off the entrance, and the tile there
			// is floor, it can see a door, and a real part of the inside rect is
			// reachable. The size of that part is deliberately a floor and not the
			// C#'s geometry: a clinic whose beds, cupboards and generator fill the
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

	it("gives the clinic its desk, its generator, its cupboards, its beds and its sign", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const traces = clinicTraces(newArmGenerator().generate(ARM_SEED));

		// One trace per desk, cupboard, curtain, machine and bed, plus the sign:
		// the C# puts the sign with `DecorateOutsideWalls` on the first empty tile
		// with an adjacent door, which is the wall either side of the entrance.
		const withImage = (imageId: string) => traces.filter((t) => t.includes(imageId));
		for (const imageId of [
			GameImages.OBJ_CLINIC_DESK,
			GameImages.OBJ_CLINIC_CUPBOARD,
			GameImages.OBJ_CLINIC_CURTAIN,
			GameImages.OBJ_CLINIC_MACHINERY,
			GameImages.OBJ_CLINIC_BED
		]) {
			expect(withImage(imageId).length, `${imageId} placed`).toBeGreaterThan(0);
		}
		expect(withImage(GameImages.DECO_CLINIC_SIGN).length).toBeGreaterThan(0);

		// The power generator is named, not drawn from a `clinic_` sprite, so it is
		// the one C# `:3475` places that `clinicTraces` cannot see. It is also the
		// C#'s `placedGenerator` latch, and the assertion that matters is that it
		// is on a cell with three adjacent walls — which is only true because
		// `countAdjWalls` is eight-way.
		const generators = mapObjectsNamed(newArmGenerator().generate(ARM_SEED), "power generator");
		expect(generators.length).toBeGreaterThan(0);
	});
});

/** Every map object on a map whose `name` is `name`, as `{ imageId, x, y }`. */
function mapObjectsNamed(map: GameMap, name: string): { imageId: string; x: number; y: number }[] {
	const out: { imageId: string; x: number; y: number }[] = [];
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			const obj = map.getMapObjectAt(x, y);
			if (obj && obj.name === name) out.push({ imageId: obj.imageId, x, y });
		}
	}
	return out;
}

// ── The generator itself ────────────────────────────────────────────────────

describe("makeClinicBuilding", () => {
	it("returns false and touches nothing when the inside rect is under 5x5", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// A 6x6 block has a 2x2 inside rect, so the size check is what refuses.
		// The dispatch case is `2` — the C#'s `case 2` — so the `false` here is the
		// size check and nothing else.
		const map = plot();
		const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
		expect(makeClinicBuilding(contextFor(map, new Block(new Rect(2, 2, 6, 6)), clinicRoller()), 2)).toBe(false);

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
		expect(makeClinicBuilding(contextFor(map, new Block(new Rect(2, 2, 9, 9)), clinicRoller()), 2)).toBe(true);
		expect(clinicZones(map)).toHaveLength(1);
	});

	it("declines every block past the C#'s per-map cap", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// `clinicsLimit = Round(map.Width / 10 / 2.5)`, with the C#'s integer
		// division: 40 -> 2, 100 -> 4. Offering five eligible blocks to a
		// 40-wide map must yield two clinics and three blocks left alone.
		const map = plot();
		const blocks = [
			new Block(new Rect(1, 1, 9, 9)),
			new Block(new Rect(12, 1, 9, 9)),
			new Block(new Rect(23, 1, 9, 9)),
			new Block(new Rect(1, 12, 9, 9)),
			new Block(new Rect(12, 12, 9, 9))
		];
		const roller = clinicRoller();
		expect(blocks.filter((b) => makeClinicBuilding(contextFor(map, b, roller), 2))).toHaveLength(2);

		const wide = plot(100, 100);
		const wideBlocks = [0, 1, 2, 3, 4, 5].map((i) => new Block(new Rect(1 + i * 11, 1, 9, 9)));
		const wideRoller = clinicRoller();
		expect(wideBlocks.filter((b) => makeClinicBuilding(contextFor(wide, b, wideRoller), 2))).toHaveLength(4);
	});

	it("skips the blocks the dispatch roll does not pick", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// C# `:510` `switch (roll2)`: one case in four reaches the clinic, and the
		// roll is spent whether or not it does. 0, 1 and 3 are the bar, the bank and
		// the mechanic workshop. This is the assertion that keeps the clinic from
		// growing a roll of its own: a generator that took no `dispatchRoll` and
		// picked its own case would pass every other test here and spend a second
		// die per block doing it.
		const map = plot();
		const roller = clinicRoller();
		const entered = (roll2: number): boolean =>
			makeClinicBuilding(contextFor(map, new Block(new Rect(1, 1, 9, 9)), roller), roll2);
		expect([0, 1, 3].map(entered)).toEqual([false, false, false]);
		// A refused case costs the block nothing: the map is still empty.
		expect(map.zones).toHaveLength(0);
		expect(map.mapObjects).toHaveLength(0);

		expect(entered(2), "case 2 is the clinic").toBe(true);
		expect(clinicZones(map)).toHaveLength(1);
	});

	it("builds all four door sides, each with its desk diagonally inside the entrance", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// The C# writes the same three statements out four times with the axes
		// swapped, so the four arms are the claim worth pinning: the entrance on
		// the rolled side, a hospital door in the wall, and the reception desk one
		// tile diagonally inward from it — below on the west, above on the east,
		// left on the north, right on the south.
		//
		// `ARM` is 20x14 at (1,1), so `buildingRect` is (2,2,18,12) — right 20,
		// bottom 14 — and `midX`/`midY` are 11/8.
		const arms = [
			{ name: "west", door: [2, 8], desk: [3, 7] },
			{ name: "east", door: [19, 8], desk: [18, 9] },
			{ name: "north", door: [11, 2], desk: [10, 3] },
			{ name: "south", door: [11, 13], desk: [12, 12] }
		];
		const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;

		arms.forEach((arm, side) => {
			const map = plot();
			const b = new Block(ARM);
			expect(makeClinicBuilding(contextFor(map, b, clinicRoller({ doorSide: side })), 2), `clinic, ${arm.name} side`).toBe(
				true
			);

			// The entrance is on the rolled side, a hospital door in a concrete hole.
			const entrance = map.getMapObjectAt(arm.door[0], arm.door[1]);
			expect(entrance, `entrance on the ${arm.name} wall`).toBeInstanceOf(DoorWindow);
			expect((entrance as DoorWindow).imageId).toBe(GameImages.OBJ_HOSPITAL_DOOR_CLOSED);
			expect(map.getTileAt(arm.door[0], arm.door[1])!.model).toBe(concrete);

			// The desk is one tile diagonally inside, and it is the C#'s
			// `isWalkable` test on a cell that nothing else has claimed, so it is
			// always placed.
			const desk = map.getMapObjectAt(arm.desk[0], arm.desk[1]);
			expect(desk, `reception desk inside the ${arm.name} door`).not.toBeNull();
			expect(desk!.name).toBe("reception desk");
			expect(desk!.imageId).toBe(GameImages.OBJ_CLINIC_DESK);
			expect(map.getTileAt(arm.desk[0], arm.desk[1])!.model).toBe(Models.tiles.get(TileID.FLOOR_TILES)!);
		});
	});

	it("counts beds off the door side, at the C#'s 0.8 and with the held area never shrunk", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// The C# declares four "held area" locals at `:3387-3390` and never adjusts
		// them, so the two `nbTables` arms at `:3448`/`:3452` reduce to a function
		// of the inside rect, and `insideRoom` at `:3458` is `b.InsideRect`. On
		// `ARM` that inside rect is 16 wide and 10 high:
		//
		//   west/east : Max(3 - 19, 10)  = 10 beds -> Round(10 * 0.8)  = 8
		//   north/south: Max(16, 13 - 3)  = 16 beds -> Round(16 * 0.8) = 13
		//
		// `roll(n, n)` costs no die, so the whole difference is the arm and not the
		// seed. A clinic that held its area back, or that read the arm the wrong
		// way round, gives the same count on both and this fails.
		const bedsFor = (doorSide: number): number => {
			const map = plot();
			expect(makeClinicBuilding(contextFor(map, new Block(ARM), clinicRoller({ doorSide })), 2)).toBe(true);
			return mapObjectsNamed(map, "bed").length;
		};
		// Two of each arm, so a single unlucky bed placement is not read as a
		// miscount: the room fills, and the count the C# asks for is the count the
		// loop runs, not the count that finds floor.
		expect([bedsFor(0), bedsFor(1)]).toEqual([8, 8]);
		expect([bedsFor(2), bedsFor(3)]).toEqual([13, 13]);
	});

	it("scans eight neighbours for the generator and the cupboards", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// C# `:3470` is `CountAdjWalls(...) < 3`, and `CountAdjWalls` walks
		// `Direction.COMPASS` — all eight. Inside a rectangular room the *four*-way
		// reading gives an inside-rect corner two wall neighbours and nothing else
		// three, so the generator and the cupboards would never be placed at all and
		// the pharmacy half of the clinic would silently be an empty room. This is
		// the assertion for that: the latch the C# records and the 40% behind it
		// both have to fire.
		const map = plot();
		expect(makeClinicBuilding(contextFor(map, new Block(ARM), clinicRoller({ doorSide: 0 })), 2)).toBe(true);

		const generators = mapObjectsNamed(map, "power generator");
		expect(generators, "one generator per clinic (C# :3466)").toHaveLength(1);
		expect(generators[0].imageId).toBe(GameImages.OBJ_POWERGEN_OFF);
		for (const g of generators) {
			// Wherever it landed, it landed on a cell the eight-way scan calls a
			// corner.
			expect(borrowedContext!.countAdjWalls(map, g.x, g.y), `generator at ${g.x},${g.y}`).toBeGreaterThanOrEqual(3);
		}

		// The 40% cupboards, and the item each one drops: the C# at `:3479-3483`
		// draws the pharmacy item and only then returns the object, so a cupboard
		// on an occupied cell still gets a floor item.
		const cupboards = mapObjectsNamed(map, "shelf").filter((o) => o.imageId === GameImages.OBJ_CLINIC_CUPBOARD);
		expect(cupboards.length, "a 40% roll on every later corner").toBeGreaterThan(0);
	});

	it("never leaves a spray scent on a clinic floor, and drops a bed's item on the bed", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// C# `:3481` and `:3514`: `if (it as ItemSprayScent != null) it =
		// MakeItemLargeMedikit()`. Case 5 of the pharmacy roll *is* the stench
		// killer, so without the guard roughly one drop in seven would be a smell
		// lying on a clinic bed. The guard costs no die, so the drop count is the
		// number of cupboards and beds either way.
		for (const doorSide of [0, 1, 2, 3]) {
			const map = plot();
			expect(makeClinicBuilding(contextFor(map, new Block(ARM), clinicRoller({ doorSide })), 2)).toBe(true);

			const scents: string[] = [];
			for (const inv of map.groundInventories) {
				for (const it of inv.items) {
					if (it.imageId === GameImages.ITEM_STENCH_KILLER) scents.push(it.imageId);
				}
			}
			expect(scents, `clinic, door side ${doorSide}`).toEqual([]);

			// One item per bed, on the bed's own cell, and one per cupboard.
			const beds = mapObjectsNamed(map, "bed");
			const cupboards = mapObjectsNamed(map, "shelf").filter((o) => o.imageId === GameImages.OBJ_CLINIC_CUPBOARD);
			let floorItems = 0;
			for (const inv of map.groundInventories) floorItems += inv.countItems;
			expect(floorItems).toBe(beds.length + cupboards.length);
		}
	});

	it("is deterministic for a given block and roller", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		// World generation is seeded, so `ctx.roller` is the only randomness
		// allowed. Same roller and same block, same map; a different roller has
		// to give a different answer, or the first assertion is vacuous.
		const build = (seed: number): string => {
			const map = plot();
			expect(makeClinicBuilding(contextFor(map, new Block(ARM), clinicRoller({ doorSide: 1, seed })), 2)).toBe(true);
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

describe("clinic building under CLASSIC", () => {
	it("is never reached, even on a block the dispatch roll picks", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		// The case is the clinic's own, so the `false` here is the feature gate and
		// not luck: the C# would have built on it.
		const map = plot();
		expect(makeClinicBuilding(contextFor(map, new Block(ARM), clinicRoller({ doorSide: 1 })), 2)).toBe(false);
		expect(map.zones).toHaveLength(0);
		expect(map.mapObjects).toHaveLength(0);
		expect(map.getTileAt(3, 3)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS)!);
	});

	it("leaves a CLASSIC district with no trace of a clinic", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		const map = newArmGenerator().generate(ARM_SEED);

		expect(clinicZones(map)).toEqual([]);
		// Desk, cupboards, curtains, machinery, beds and the sign beside the door:
		// the C# has no other use for any of them, so their absence is a stronger
		// statement than the absence of a zone.
		expect(clinicTraces(map)).toEqual([]);
	});

	it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
		// Recorded from this seed with the dispatch present and the feature off,
		// and the same value the bar and bank tests pin: a CLASSIC world pays
		// nothing for the clinic, not even a die. The clinic gate runs before
		// anything else, and `cascadeEnabled` gates the whole arm above the roll,
		// which is the only way that is true — `Feature.Clinic` in that condition
		// is the one line this port had to add to `BaseTownGenerator.generate()`.
		Session.get().ruleset = Ruleset.CLASSIC;
		// **At `MAP`/`SEED`, not at `ARM_MAP`/`ARM_SEED`**: the committed value is a
		// 40x40 seed-1 fingerprint and seven suites assert it, so the district that
		// produces it is not the one the content assertions above moved to.
		const classic = fingerprint(newGenerator().generate(SEED));
		expect(classic).toBe("9bb5e4907bc3f62c");

		// The two assertions that give the committed value meaning. A fingerprint
		// that ignored the world would pass the first line for any value; one that
		// returned a per-seed constant would pass both.
		expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
	});

	it("still draws no antiviral pills under a game mode that has none", () => {
		// C# `Rules.cs:5760` `HasAntiviralPills` is true in Corpses & Infection, and
		// in Vintage only with the `ANTIVIRAL_PILLS` difficulty option — an option
		// this port has not grown, so the game mode is the whole predicate. The
		// arm is reachable: case 6 of the pharmacy roll.
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		Session.get().gameMode = GameMode.GM_STANDARD;
		const standard = plot();
		expect(makeClinicBuilding(contextFor(standard, new Block(ARM), clinicRoller()), 2)).toBe(true);
		expect(medicineNames(standard)).not.toContain(GameImages.ITEM_PILLS_ANTIVIRAL);

		Session.get().gameMode = GameMode.GM_CORPSES_INFECTION;
		const corpses = plot();
		expect(makeClinicBuilding(contextFor(corpses, new Block(ARM), clinicRoller()), 2)).toBe(true);
		expect(medicineNames(corpses), "case 6 reaches the antiviral arm").toContain(GameImages.ITEM_PILLS_ANTIVIRAL);
	});
});

/** The `imageId` of every item on a map's floor. */
function medicineNames(map: GameMap): string[] {
	const out: string[] = [];
	for (const inv of map.groundInventories) for (const it of inv.items) out.push(it.imageId);
	return out;
}
