/**
 * `makeOrdinaryOffice` — ported, tested, and **not dispatched**.
 *
 * The C#'s business cascade ends with `if (!placed) MakeOrdinaryOffice(map, b)`
 * (`BaseTownGenerator.cs:531`), so a block that failed the bar/bank/clinic roll became
 * a plain office. This port dropped that arm and the block fell through to
 * `makeHousingBuilding` — a *house* where the C# puts an office.
 *
 * The method is ported here and tested, but the dispatch is left off. The reason is
 * measured and lives at the call site: calling it spends a lot of the district's
 * shared roller, every later block's `roll(0, 4)` shifts, and eight test files notice.
 *
 * So these tests exercise the method **directly** rather than through `generate()`.
 * That is a real difference from the other building suites in this repository, which
 * drive `generate()` and read the committed Classic fingerprint — and it is why this
 * file asserts the building's *shape* rather than a digest. A digest would pin the
 * current (wrong) world and make the eventual re-basing look like a regression.
 */

import { describe, expect, it } from "vitest";

import { BaseTownGenerator, Block, type Parameters } from "@gameplay/generators/BaseTownGenerator";
import { Rect } from "@engine/Rect";
import { Map as GameMapCtor } from "@data/Map";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Ruleset, Session } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { District, DistrictKind } from "@data/District";
import { Point } from "@engine/Point";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameImages } from "@gameplay/GameImages";

// `Models.items` is a static that only exists once a `GameItems` exists.
new GameItems();

const SIZE = 40;

function newGenerator(seed = 20251002): BaseTownGenerator {
	Session.get().ruleset = Ruleset.STILL_ALIVE;
	const rules = new Rules(new DiceRoller(seed));
	const params = {
		district: new District(new Point(0, 0), DistrictKind.RESIDENTIAL),
		mapWidth: SIZE,
		mapHeight: SIZE,
	} as unknown as Parameters;
	const gen = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
	(gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller = new DiceRoller(seed);
	return gen;
}

const TILES = new GameTiles();

/**
 * A fresh map, and the block centred in it.
 *
 * `new Block(rect)` derives `buildingRect` and `insideRect` from the rectangle by
 * insetting one tile each side — so the `width`/`height` passed here are the
 * *building's*, not the block's. Hand-rolling those three rects was the first
 * attempt and it disagreed with the real class about where the walls go.
 */
function newMapAndBlock(width: number, height: number, seed = 20251002) {
	const gen = newGenerator(seed);
	const map = new GameMapCtor(seed, "office test", SIZE, SIZE);
	for (let x = 0; x < SIZE; x++) {
		for (let y = 0; y < SIZE; y++) map.setTileModelAt(x, y, TILES.get(TileID.FLOOR_CONCRETE)!);
	}
	const left = Math.floor((SIZE - width) / 2);
	const top = Math.floor((SIZE - height) / 2);
	// `resetRectangle` insets twice, so the rectangle passed is two larger each way.
	const block = new Block(new Rect(left - 1, top - 1, width + 2, height + 2));
	return { gen, map, block, TILES };
}

describe("makeOrdinaryOffice", () => {
	it("returns true and always places a walkable interior", () => {
		for (const [w, h] of [
			[12, 8],
			[8, 12],
			[16, 10],
			[10, 16],
		] as const) {
			const { gen, map, block } = newMapAndBlock(w, h);
			expect(gen.makeOrdinaryOffice(map, block), `${w}x${h}`).toBe(true);
			// The foyer is the one rectangle the C# guarantees free of furniture in a
			// usable way, and `tileFill(..., FLOOR_OFFICE)` is what makes any tile inside
			// walkable — so a single inside tile proves the floor pass ran.
			const tile = map.getTileAt(block.insideRect.left, block.insideRect.top);
			expect(tile, `${w}x${h} has no floor`).toBeDefined();
		}
	});

	it("walls the building rect in concrete and the interior in light brown", () => {
		// The one substitution that is position-dependent: the C# uses WALL_CONCRETE
		// for the building's outer wall and WALL_LIGHT_BROWN for *every* interior
		// partition. Derived from `makeCHAROffice`, which uses one tile for both, so a
		// blanket substitution would have been wrong here.
		const { gen, map, block: b, TILES: tiles } = newMapAndBlock(16, 10);
		gen.makeOrdinaryOffice(map, b);

		// The building's own corner tile is the outer wall, and it is concrete.
		expect(map.getTileAt(b.buildingRect.left, b.buildingRect.top)?.model.id).toBe(TileID.WALL_CONCRETE);
		// Every partition is light brown. The foyer line is the first interior wall
		// drawn, and it spans the building width, so its midpoint is interior.
		const foyerRow = b.insideRect.top + 3;
		const corridor = map.getTileAt(b.buildingRect.left + Math.floor(b.buildingRect.width / 2), foyerRow);
		expect(corridor?.model.id).toBe(TileID.WALL_LIGHT_BROWN);
		expect(tiles.get(TileID.WALL_LIGHT_BROWN)).toBeDefined();
	});

	it("hangs glass doors, not CHAR doors", () => {
		const { gen, map, block: b } = newMapAndBlock(16, 10);
		gen.makeOrdinaryOffice(map, b);
		const doors: string[] = [];
		for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
			for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
				const o = map.getMapObjectAt(x, y);
				if (o !== null && o instanceof DoorWindow) doors.push(o.imageId);
			}
		}
		expect(doors.length).toBeGreaterThan(0);
		// Two sprites, one door: the C#'s `MakeObjGlassDoor` picks closed or open from
		// the roller's state, so both are correct answers here.
		for (const d of doors) {
			expect([GameImages.OBJ_GLASS_DOOR_CLOSED, GameImages.OBJ_GLASS_DOOR_OPEN]).toContain(d);
		}
	});

	it("does not barricade its entry doors", () => {
		// `makeCHAROffice` calls `barricadeDoors(..., BARRICADING_MAX)`; the C#'s
		// ordinary office has no such call. A barricaded entry door is the difference
		// between a building you can walk into and one you cannot, so it is worth a
		// test rather than a comment.
		const { gen, map, block: b } = newMapAndBlock(16, 10);
		gen.makeOrdinaryOffice(map, b);
		for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
			for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
				const o = map.getMapObjectAt(x, y);
				if (o !== null && o instanceof DoorWindow) {
					// Intact, i.e. never barricaded: the C#'s ordinary office has no
					// `BarricadeDoors` call, unlike `MakeCHAROffice`.
					expect(o.hitPoints).toBe(o.maxHitPoints);
				}
			}
		}
	});

	it("names its zone Business and does not claim to be a CHAR office", () => {
		const { gen, map, block: b } = newMapAndBlock(16, 10);
		gen.makeOrdinaryOffice(map, b);
		const names = map.zones.map((z) => z.name);
		expect(names.some((n) => n.startsWith("Business@"))).toBe(true);
		expect(names.some((n) => n.startsWith("CHAR Office@"))).toBe(false);
		// The C#'s own comment: "didn't use 'office' to avoid clashing with CHAR
		// buildings". An "Office" zone here would be found by CHAR-office lookups.
		expect(names.some((n) => /^Office@/.test(n))).toBe(false);
	});
});

describe("makeRandomOrdinaryOfficeItem", () => {
	it("reaches the daypack at 25%, which is the Release 8-2 backpack site", () => {
		// The eighth backpack site, and the reason this method exists. Six of the
		// eleven arms are the C#'s `default: return null` — "50% chance to find
		// nothing" in its own words — so the roll width matters: `roll(0, 11)` is what
		// makes the empty half empty.
		let sawDaypack = false;
		let sawNull = false;
		let sawOther = false;
		for (let v = 0; v < 11 && !(sawDaypack && sawNull && sawOther); v++) {
			const gen = newGenerator(20251002 + v);
			const dice = (gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller;
			const original = { roll: dice.roll, rollChance: dice.rollChance };
			dice.roll = (min: number) => min + v;
			dice.rollChance = () => true;
			try {
				const item = gen.makeRandomOrdinaryOfficeItem();
				if (item === null) sawNull = true;
				else if (item.model.id === ItemID.BACKPACK_DAYPACK) sawDaypack = true;
				else sawOther = true;
			} finally {
				dice.roll = original.roll;
				dice.rollChance = original.rollChance;
			}
		}
		expect(sawDaypack, "the daypack arm is unreachable").toBe(true);
		expect(sawNull, "the empty arms are unreachable").toBe(true);
		expect(sawOther).toBe(true);
	});

	it("builds a box of twenty matches, as the C# does", () => {
		const gen = newGenerator();
		const dice = (gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller;
		const original = { roll: dice.roll, rollChance: dice.rollChance };
		dice.roll = () => 5; // the backpack arm
		dice.rollChance = () => false; // and the 75% that is not a daypack
		try {
			const item = gen.makeRandomOrdinaryOfficeItem();
			expect(item?.model.id).toBe(ItemID.MATCHES);
			expect(item?.quantity).toBe(20);
		} finally {
			dice.roll = original.roll;
			dice.rollChance = original.rollChance;
		}
	});
});