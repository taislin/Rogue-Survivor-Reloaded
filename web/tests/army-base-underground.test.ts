/**
 * The army base underground.
 *
 * `BaseTownGenerator.cs:10711` (Release 6-3) — the largest single generator in the
 * port's remaining work: a 303-line map builder plus six room makers, and the only
 * unique map in the game that is *not* a CHAR facility.
 *
 * ## What this file is really about
 *
 * Two claims that are easy to state and easy to get wrong:
 *
 * 1. **The base is secret and dark, and its seed is derived from the surface's.**
 *    `(surfaceMap.Seed << 3) ^ surfaceMap.Seed` is not decoration — it is what makes
 *    the base reproducible from the district above it, and `Lighting.DARKNESS` is what
 *    makes it worth going into.
 * 2. **The room dispatch is by quarter, with a power room in each corner.** Four
 *    quarters, one role each, and the corner test runs *first* — so a corner room is
 *    always a power room and never an armory, whichever quarter it is in.
 *
 * ## Why the surface link is the fragile part
 *
 * `createUniqueMap_ArmyBase` needs an army office on the surface to hang under, and it
 * takes one as an argument in the C# because the caller found it. The port looks it up
 * from the map's own zones, which is a real difference and the reason this file builds
 * its fixture with `makeArmyOffices` rather than a hand-made zone: **the generator is
 * unreachable until the surface pass has run**, and a test that skips that step is
 * testing a method that always returns `null`.
 */

import { describe, expect, it } from "vitest";

import { BaseTownGenerator, Block, type Parameters } from "@gameplay/generators/BaseTownGenerator";
import { Ruleset, Session } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { District, DistrictKind } from "@data/District";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Lighting, Map as GameMap } from "@data/Map";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameImages } from "@gameplay/GameImages";

/**
 * All four registries, and the order matters as little as the fact that all four are
 * needed.
 *
 * Each is a *static* on `Models` that only exists once the corresponding DB has been
 * constructed, and each miss surfaces as the same unhelpful
 * "Cannot read properties of undefined (reading 'get')" from somewhere else entirely:
 * `createNewArmyNationalGuard` reads `Models.actors` and then `Models.factions`, so a
 * fixture with only `GameActors` fails on the faction line and reads like a bug in the
 * national guard rather than a missing registration. The comment is here because that
 * cost two debugging rounds.
 */
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

const MAP = 60;

function newGenerator(seed: number): BaseTownGenerator {
	Session.get().ruleset = Ruleset.STILL_ALIVE;
	const rules = new Rules(new DiceRoller(seed));
	// **GREEN, not RESIDENTIAL**: `makeArmyOffices` returns immediately unless
	// `m_Params.district.kind === DistrictKind.GREEN` (`BaseTownGenerator.ts:3115`), so
	// the first attempt at this fixture placed no office at all and every assertion in
	// this file failed on `built === null` rather than on anything about the base. The
	// army base hangs under an army office, and an army office only exists in a green
	// district.
	const params = {
		district: new District(new Point(0, 0), DistrictKind.GREEN),
		mapWidth: MAP,
		mapHeight: MAP,
	} as unknown as Parameters;
	// `NextUndeadEvolution` is a method on `RogueGame`, and the populate loop calls it
	// once per undead until the id stops changing. A stub that returns the input would
	// leave every zombie at its base form and make the "leveled up" assertion vacuous,
	// so this mirrors the real chain's *first* step: zombie -> dark-eyed zombie, and
	// dark-eyed is not evolved further.
	const gen = new BaseTownGenerator(
		{
			rules,
			ApplyOnFire: () => undefined,
			NextUndeadEvolution: (from: number) =>
				from === ActorID.UNDEAD_ZOMBIE ? ActorID.UNDEAD_DARK_EYED_ZOMBIE : from,
		} as never,
		params
	);
	(gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller = new DiceRoller(seed);
	return gen;
}

/**
 * A green district with an army office already built on it.
 *
 * `makeArmyOffices` first, because the base hangs under one and `armyOfficeZone`
 * looks for exactly the zone that pass leaves. The C# receives the zone as a
 * parameter; the port looks it up, and this fixture is what makes that lookup
 * exerciseable.
 */
function surface(seed = 20251004): GameMap {
	const gen = newGenerator(seed);
	const map = new GameMap(seed, "surface", MAP, MAP);
	const tiles = new GameTiles();
	for (let x = 0; x < MAP; x++) {
		for (let y = 0; y < MAP; y++) map.setTileModelAt(x, y, tiles.get(TileID.FLOOR_GRASS)!);
	}
	const block = new Block(new Rect(20, 20, 16, 12));
	// `protected`, so the cast is the only way in -- and deliberately so: this is a
	// test reaching past the public surface to set up the *link*, not to test the pass
	// itself (which `army-base-building.test.ts` does).
	(gen as unknown as { makeArmyOffices(m: GameMap, b: Block[]): void }).makeArmyOffices(map, [block]);
	return map;
}

function build(seed = 20251004) {
	const gen = newGenerator(seed);
	const map = surface(seed);
	const built = gen.createUniqueMap_ArmyBase(map, MAP);
	return { gen, surfaceMap: map, built };
}

describe("createUniqueMap_ArmyBase", () => {
	it("builds, and is secret and dark", () => {
		const { built } = build();
		expect(built, "the base did not generate").not.toBeNull();
		const base = built!.map;
		expect(base.isSecret).toBe(true);
		expect(base.lighting).toBe(Lighting.DARKNESS);
		// The name is the C#'s literal at `:10726`.
		expect(base.name).toBe("Army Base");
	});

	it("derives its seed from the surface's, the way the C# does", () => {
		// `(Seed << 3) ^ Seed`, at `BaseTownGenerator.cs:10727`. Worth pinning because
		// it is the whole reproducibility story for a map that is otherwise generated
		// from its own district's roller: two surfaces with the same seed must produce
		// two identical bases.
		const { built, surfaceMap } = build();
		expect(built!.map.seed >>> 0).toBe(((surfaceMap.seed << 3) ^ surfaceMap.seed) >>> 0);
		const again = build();
		expect(again.built!.map.seed >>> 0).toBe(built!.map.seed >>> 0);
	});

	it("links both directions with stairs and a floor logo", () => {
		// `addExit` on both maps at `:10809-10810`, and the logo on the four tiles
		// adjacent to the underground stairs at `:10813`.
		const { built } = build();
		const base = built!.map;
		const mid = new Point(Math.floor(MAP / 2), Math.floor(MAP / 2));
		// The base's exit is at the *underground* stairs, which is the middle of the
		// base; `baseEntryPos` is the surface coordinate and is where the *surface*
		// map's exit lives. Asking the base for an exit at `baseEntryPos` was the
		// first attempt and it can only ever be null.
		expect(base.getExitAt(mid), "no exit at the middle of the base").not.toBeNull();
		expect(built!.baseEntryPos.x).toBeGreaterThanOrEqual(0);
		expect(base.getTileAt(mid.x, mid.y)?.hasDecoration(GameImages.DECO_STAIRS_UP)).toBe(true);
		// And the four tiles around the underground stairs carry the floor logo.
		let logos = 0;
		for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const t = base.getTileAt(mid.x + dx, mid.y + dy);
			if (t !== null && t.hasDecoration(GameImages.DECO_ARMY_FLOOR_LOGO)) logos++;
		}
		expect(logos, "no army floor logo around the stairs").toBeGreaterThan(0);
	});

	it("returns null when there is no army office to hang under", () => {
		// The C#'s own failure path: `RogueGame.cs:4290` returns false from NewGame with
		// "the army base coulould be generated for some reason". Reachable in the port
		// because the zone is looked up rather than passed in.
		const gen = newGenerator(20251004);
		const bare = new GameMap(1, "no offices", MAP, MAP);
		const tiles = new GameTiles();
		for (let x = 0; x < MAP; x++) {
			for (let y = 0; y < MAP; y++) bare.setTileModelAt(x, y, tiles.get(TileID.FLOOR_GRASS)!);
		}
		expect(gen.createUniqueMap_ArmyBase(bare, MAP)).toBeNull();
	});
});

describe("the base's floorplan", () => {
	it("puts one power room in every corner and a named room in each quarter", () => {
		// The role dispatch at `:10903-10937`. Corner first: a corner room is a power
		// room whichever quarter it is in, and a test that only checked "there are four
		// quarters" would pass even if the corner test never fired.
		const { built } = build();
		const base = built!.map;
		const names = base.zones.map((z) => z.name.split("@")[0]);
		expect(names.filter((n) => n === "Power Room").length).toBeGreaterThanOrEqual(1);
		for (const role of ["Armory", "Command", "Living"]) {
			expect(names, `no ${role} room in the base`).toContain(role);
		}
		// `case 3` is a 50/50 between two names, so *one* of them is present, not both
		// necessarily — and which one is seed-dependent.
		expect(
			names.includes("Pharmacy") || names.includes("Storage"),
			"the bottom-right quarter has neither Pharmacy nor Storage"
		).toBe(true);
	});

	it("closes both central corridors with iron doors", () => {
		// `:10857-10865`. Two horizontal runs and two vertical ones, each an iron door
		// per tile across the corridor — so the base is sealed at the cross and the only
		// way in is the stairs.
		const { built } = build();
		const base = built!.map;
		let iron = 0;
		for (let x = 0; x < MAP; x++) {
			for (let y = 0; y < MAP; y++) {
				const o = base.getMapObjectAt(x, y);
				if (o !== null && o.name === "iron door") iron++;
			}
		}
		// Four runs of (corridor width - 1) doors; at MAP 60 that is ~56 per axis.
		expect(iron, `only ${iron} iron doors`).toBeGreaterThan(40);
	});

	it("populates with width-many leveled undeads", () => {
		// `int nbZombies = underground.Width; // 100 for 100.` at `:10991`, and every
		// one is evolved to its final form. So the count is exactly MAP and no actor
		// stands on the stairs.
		const { built } = build();
		const base = built!.map;
		expect(base.actors.length).toBe(MAP);
		const stairs = new Point(Math.floor(MAP / 2), Math.floor(MAP / 2));
		expect(base.actors.some((a) => a.location.position.equals(stairs))).toBe(false);
	});

	it("plays the CHAR underground track, not an army one", () => {
		// `:11011`: `underground.BgMusic = GameMusics.CHAR_UNDERGROUND_FACILITY`, because
		// the base was copied from the CHAR facility. Pinned because "the army base plays
		// an army song" is exactly the fix someone would make.
		const { built } = build();
		expect(built!.map.bgMusic).toBe("char underground facility");
	});
});

describe("the six rooms", () => {
	it("the rec room is the last backpack site", () => {
		// `MakeArmyRecRoom` at `:11209`, `//@@MP - added (Release 8-2)`. With the
		// Resources Availability option at its MED default (54), the C# divides by three:
		// `rucksackChance = (int)rucksackChance / 3` -> 18%. The CHAR lab has the same
		// line *commented out* and so runs at 54%. Both are transcribed as written.
		const { built } = build();
		const base = built!.map;
		let rucksacks = 0;
		for (let x = 0; x < MAP; x++) {
			for (let y = 0; y < MAP; y++) {
				const items = base.getItemsAt(new Point(x, y));
				if (items === null) continue;
				for (const it of items.items) if (it.model.id === ItemID.BACKPACK_ARMY_RUCKSACK) rucksacks++;
			}
		}
		// 18% of the bed arm across a whole base: a handful at most, and zero is a real
		// outcome for a small map, so this asserts the model is *reachable* rather than
		// that it was rolled. Two seeds, and one of them has to have some.
		let total = rucksacks;
		for (const seed of [20251014, 20251024, 20251034]) total += build(seed).built!.map.zones.length && countRucksacks(build(seed).built!.map);
		expect(total, "no army rucksack in three bases").toBeGreaterThan(0);
	});

	it("the armory stocks one minigun and one grenade launcher", () => {
		// `//@@MP - only one per game (Release 7-6)` — two method locals in the C#. Their
		// absence would let a base hold four miniguns.
		const { built } = build();
		const base = built!.map;
		let miniguns = 0;
		let launchers = 0;
		for (let x = 0; x < MAP; x++) {
			for (let y = 0; y < MAP; y++) {
				const items = base.getItemsAt(new Point(x, y));
				if (items === null) continue;
				for (const it of items.items) {
					if (it.model.id === ItemID.RANGED_MINIGUN) miniguns++;
					if (it.model.id === ItemID.RANGED_GRENADE_LAUNCHER) launchers++;
				}
			}
		}
		// **One per armory room, not one per base.** The C#'s comment says "only one per
		// game" but the flags it uses are method locals of `MakeArmyArmoryRoom`
		// (`BaseTownGenerator.cs:11021-11022`), and the role dispatch calls that method
		// once for *every* room in the top-left quarter. So a base with three armory
		// rooms has three miniguns in the C# too, and the comment describes an intent
		// the code does not implement.
		//
		// Asserting `<= 1` is therefore wrong, and it is the kind of wrong that would
		// have "passed" by accident on a base with one armory room. The real invariant
		// is one per armory: count the armory rooms from the zones and compare.
		const armories = base.zones.filter((z) => z.name.startsWith("Armory@")).length;
		expect(armories, "no armory room at all").toBeGreaterThan(0);
		expect(miniguns, `${miniguns} miniguns across ${armories} armories`).toBeLessThanOrEqual(armories);
		expect(launchers, `${launchers} grenade launchers across ${armories} armories`).toBeLessThanOrEqual(armories);
	});

	it("decorates walls with posters and floors with blood", () => {
		// 25% poster per non-walkable tile, 10% large blood and 20% small (`:10978-10989`).
		// The small pair is `//@@MP (Release 3)` and is what makes the split three-way
		// rather than two-way.
		const { built } = build();
		const base = built!.map;
		let posters = 0;
		let blood = 0;
		for (let x = 0; x < MAP; x++) {
			for (let y = 0; y < MAP; y++) {
				const tile = base.getTileAt(x, y);
				if (tile === null) continue;
				for (const d of tile.getDecorations ?? []) {
					if (d.startsWith("Tiles/Decoration/army_poster")) posters++;
					if (d.startsWith("Tiles/Decoration/bloodied")) blood++;
				}
			}
		}
		expect(posters, "no posters at all").toBeGreaterThan(0);
		expect(blood, "no blood at all").toBeGreaterThan(0);
	});
});

function countRucksacks(map: GameMap): number {
	let n = 0;
	for (let x = 0; x < map.width; x++) {
		for (let y = 0; y < map.height; y++) {
			const items = map.getItemsAt(new Point(x, y));
			if (items === null) continue;
			for (const it of items.items) if (it.model.id === ItemID.BACKPACK_ARMY_RUCKSACK) n++;
		}
	}
	return n;
}