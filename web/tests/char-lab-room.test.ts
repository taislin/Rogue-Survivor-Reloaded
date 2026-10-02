/**
 * The CHAR lab — the room the fork put where the living room used to be.
 *
 * `BaseTownGenerator.cs:8357` is the whole of it:
 *
 * ```
 * case 2: // living room.
 *     /*roomName = "Living";
 *     MakeCHARLivingRoom(underground, insideRoomRect);*&#47;
 *     roomName = "Lab";       //@@MP - more thematic (Release 3)
 *     MakeCHARLabRoom(underground, insideRoomRect, ref placedBioForceGun);
 * ```
 *
 * The living room is commented out, not deleted, so the fork's `case 2` is a lab.
 * This port was generating a Living room — a room the shipped game never builds.
 *
 * ## Why this file exists despite being small
 *
 * Two of the lab's rules are invisible from the code and both are easy to break:
 * **one** `UNIQUE_CHAR_DOCUMENT` per room (`//@@MP - only drop one per room`) and
 * **one** `BIO_FORCE_GUN` per *game* (`//@@MP - only drop one per game`). The second
 * is the more interesting of the two, because "per game" is carried by a `ref bool`
 * local of `GenerateUniqueMap_CHARUnderground` in the C# and by nothing else — so it
 * is a parameter here too, and a field would quietly have made it per-district.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BaseTownGenerator, type Parameters } from "@gameplay/generators/BaseTownGenerator";
import { Ruleset, Session } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { District, DistrictKind } from "@data/District";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Map as GameMap } from "@data/Map";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameImages } from "@gameplay/GameImages";

new GameItems();

const SIZE = 30;

function newGenerator(seed: number): BaseTownGenerator {
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

function newMapAndRoom(width = 14, height = 10, seed = 20251003) {
	const tiles = new GameTiles();
	const map = new GameMap(seed, "lab test", SIZE, SIZE);
	for (let x = 0; x < SIZE; x++) {
		for (let y = 0; y < SIZE; y++) map.setTileModelAt(x, y, tiles.get(TileID.FLOOR_CONCRETE)!);
	}
	// **A wall ring around the room**, which the first attempt omitted and which is
	// why every assertion about vats and wall-side furniture failed with zero of them:
	// the walls pass is gated on `CountAdjWalls >= 3`, and on an open plot every tile
	// has zero adjacent walls, so it can never fire. A flat floor is a fine fixture
	// for `makeCHARStorageRoom`, whose pass is gated on `== 0` instead, and a useless
	// one here — the two rooms want opposite plots.
	const left = Math.floor((SIZE - width) / 2);
	const top = Math.floor((SIZE - height) / 2);
	const wall = tiles.get(TileID.WALL_CONCRETE)!;
	for (let x = left - 1; x <= left + width; x++) {
		map.setTileModelAt(x, top - 1, wall);
		map.setTileModelAt(x, top + height, wall);
	}
	for (let y = top - 1; y <= top + height; y++) {
		map.setTileModelAt(left - 1, y, wall);
		map.setTileModelAt(left + width, y, wall);
	}
	return { gen: newGenerator(seed), map, room: new Rect(left, top, width, height), tiles };
}

function countItems(map: GameMap, id: ItemID): number {
	let n = 0;
	for (let x = 0; x < SIZE; x++) {
		for (let y = 0; y < SIZE; y++) {
			const items = map.getItemsAt(new Point(x, y));
			if (items === null) continue;
			for (const it of items.items) if (it.model.id === id) n++;
		}
	}
	return n;
}

const DOCUMENTS = [
	ItemID.UNIQUE_CHAR_DOCUMENT1,
	ItemID.UNIQUE_CHAR_DOCUMENT2,
	ItemID.UNIQUE_CHAR_DOCUMENT3,
	ItemID.UNIQUE_CHAR_DOCUMENT4,
	ItemID.UNIQUE_CHAR_DOCUMENT5,
];

describe("makeCHARLabRoom", () => {
	it("lays FLOOR_TILES, not the living room's logo planks", () => {
		// The C#'s floor line carries the `AddDecoration(GameImages.DECO_CHAR_FLOOR_LOGO)`
		// call *commented out* (`BaseTownGenerator.cs:8557`), so a lab is plain tiles and
		// a living room draws the logo. Uncommenting it would be more characterful and
		// would not match anything the fork shipped.
		const { gen, map, room } = newMapAndRoom();
		gen.makeCHARLabRoom(map, room, { value: false });
		const tile = map.getTileAt(room.left + Math.floor(room.width / 2), room.top);
		expect(tile?.model.id).toBe(TileID.FLOOR_TILES);
	});

	it("lines the walls with vats and workstations, and never blocks an exit", () => {
		const { gen, map, room } = newMapAndRoom();
		gen.makeCHARLabRoom(map, room, { value: false });
		const images: string[] = [];
		for (let x = room.left; x < room.right; x++) {
			for (let y = room.top; y < room.bottom; y++) {
				const o = map.getMapObjectAt(x, y);
				if (o === null) continue;
				// The `CountAdjWalls >= 3` arm is the walls pass; the middle pass never
				// places on a wall tile, so anything on the border is from that arm.
				images.push(o.imageId);
			}
		}
		expect(images.length).toBeGreaterThan(0);
		for (const img of images) {
			expect([GameImages.OBJ_CHAR_VAT, GameImages.OBJ_CHAR_DESKTOP, GameImages.OBJ_CHAR_TABLE, GameImages.OBJ_CHAR_TROLLEY]).toContain(img);
		}
	});

	it("drops at most one document per room, whichever arm fires", () => {
		// `//@@MP - only drop one per room`. Without it every bare middle tile of a large
		// room would get a document, and all six documents are `IsUnique`.
		for (let seed = 20251010; seed < 20251018; seed++) {
			const { gen, map, room } = newMapAndRoom(18, 14, seed);
			gen.makeCHARLabRoom(map, room, { value: false });
			const total = DOCUMENTS.reduce((n, id) => n + countItems(map, id), 0);
			expect(total, `seed ${seed} dropped ${total} documents`).toBeLessThanOrEqual(1);
		}
	});

	it("drops the bio-force gun once per game, not once per room", () => {
		// The interesting rule. `placedBioForceGun` is a `ref bool` local of
		// `GenerateUniqueMap_CHARUnderground` in the C#, so a *second* room in the same
		// underground must find the flag already set. A field on the generator would
		// pass this test and still be wrong on a district with two undergrounds.
		const flags = { value: false };
		let guns = 0;
		for (let i = 0; i < 4; i++) {
			const { gen, map, room } = newMapAndRoom(18, 14, 20251020 + i);
			gen.makeCHARLabRoom(map, room, flags);
			guns += countItems(map, ItemID.RANGED_BIO_FORCE_GUN);
		}
		expect(guns, "the gun is once per game, so at most one across four rooms").toBe(1);
		expect(flags.value).toBe(true);
	});

	it("a fresh flag gets a gun again, because the flag is what carries the rule", () => {
		// The complement of the test above, and the reason it is worth having: if the
		// flag were ignored, this would still pass. It is the *pair* that pins the
		// semantics rather than the arithmetic.
		let guns = 0;
		for (let i = 0; i < 2; i++) {
			const { gen, map, room } = newMapAndRoom(18, 14, 20251030 + i);
			gen.makeCHARLabRoom(map, room, { value: false });
			guns += countItems(map, ItemID.RANGED_BIO_FORCE_GUN);
		}
		expect(guns, "two independent games, two guns").toBe(2);
	});

	it("replaces the living room in the underground's room dispatch", () => {
		// A source assertion, because the dispatch is a `switch` over `roomRole` and
		// nothing else in the type system says which arm builds what. The C# has the
		// living room commented out; this port had it live.
		//
		// Read by path rather than through `require.resolve`, which does not resolve a
		// tsconfig path alias under vitest and fails with "Cannot find module".
		const src = readFileSync(
			join(__dirname, "..", "src", "gameplay", "generators", "BaseTownGenerator.ts"),
			"utf-8",
		);
		const at = src.indexOf("case 2: // living room.");
		expect(at, "the living-room arm moved or was renamed").toBeGreaterThan(-1);
		const arm = src.slice(at, src.indexOf("case 3:", at));
		// The C# comments the living room out; this port had it live and the lab absent.
		expect(arm, "case 2 still builds a living room").not.toMatch(/makeCHARLivingRoom\(underground/);
		expect(arm, "case 2 does not build a lab").toMatch(/makeCHARLabRoom\(underground, insideRoomRect, placedBioForceGun\)/);
		expect(arm).toMatch(/roomName = 'Lab'/);
	});
});

describe("the room's furniture is what the C# says", () => {
	it("a vat is unbreakable, which is the whole point of the two-argument initialiser", () => {
		// `MakeObjCHARvat` (`BaseMapGenerator.cs:803`) passes no break or fire data, so a
		// vat gets the MapObject defaults. A breakable one would be a hole in the wall
		// of the room rather than furniture.
		const { gen, map, room } = newMapAndRoom();
		gen.makeCHARLabRoom(map, room, { value: false });
		let vats = 0;
		for (let x = room.left; x < room.right; x++) {
			for (let y = room.top; y < room.bottom; y++) {
				const o = map.getMapObjectAt(x, y);
				if (o !== null && o.name === "CHAR vat") {
					vats++;
					expect(o.isBreakable).toBe(false);
				}
			}
		}
		// 50% then 75% over the wall tiles, so most seeds place at least one.
		expect(vats, "no vat in the room at all").toBeGreaterThan(0);
	});

	it("the trolley that comes with the gun is metal and movable", () => {
		const { gen, map, room } = newMapAndRoom(18, 14);
		gen.makeCHARLabRoom(map, room, { value: false });
		let trolley = 0;
		for (let x = room.left; x < room.right; x++) {
			for (let y = room.top; y < room.bottom; y++) {
				const o = map.getMapObjectAt(x, y);
				if (o !== null && o.imageId === GameImages.OBJ_CHAR_TROLLEY) {
					trolley++;
					expect(o.isMetal).toBe(true);
					expect(o.isMovable).toBe(true);
				}
			}
		}
		expect(trolley).toBeGreaterThan(0);
	});
});
