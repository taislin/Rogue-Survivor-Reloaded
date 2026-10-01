/**
 * World decay — the engine half. C# `RogueGame.cs:9246-9410` and `:9412-9797`,
 * all of it `//@@MP (Release 7-6)`.
 *
 * The data half landed in the commit before this one: `TileModel.canDecay`,
 * `Tile.decayPhase`, `Tile.insertDecoration`, and the 108 models that carry the
 * flag. What is missing until now is everything that *reads* them, and the shape
 * of that reader is where all the reference's surprises are.
 *
 * ## What this file is actually for
 *
 * Five behaviours, and two of them are traps:
 *
 * 1. **`canDecay` is a per-model flag and the sweep honours it absolutely.** 34 of
 *    the 142 models never decay, grass and dirt and the ponds among them.
 * 2. **Draw order is half the feature.** Decay is *inserted* at index 0 so blood
 *    and scorch draw over it -- except on interior walls, which *append*, so there
 *    it draws over them. That asymmetry is the C#'s and it is the thing a tidy-up
 *    would silently lose.
 * 3. **The subway is declined by the map's lighting, not by its wall model.**
 *    `GameTiles.cs:506` registers `WALL_SUBWAY` as `CanDecay = true` and says in a
 *    comment that the below-ground case is handled in `ApplyWorldDecayPhase`. There
 *    is no `WALL_SUBWAY` test in the C# anywhere; the mechanism is
 *    `map.Lighting == Lighting.OUTSIDE` plus the fact that `GenerateSubwayMap`
 *    builds a `DARKNESS` map out of nothing but `IsInside` tiles
 *    (`BaseTownGenerator.cs:937` and `:1101`). The test below drives the *same*
 *    wall model on a dark map and on a lit one, which is the only way to show the
 *    decision is the lighting.
 * 4. **The option is a period, not an offset, and the world decays exactly three
 *    times ever.** `day / daysBeforeWorldDecays` must be exactly 1, 2 or 3.
 * 5. **The master switch lives at the call site, not in the method.** The C#'s
 *    `s_Options.IsWorldDecayOn` is in `AdvancePlay(District, SimFlags)`, so testing
 *    it means driving the turn loop, which is what the last section does.
 *
 * ## What the reference has that the port does not
 *
 * `ChooseRelevantDecayDecorationForTile` has a terminal `throw`, and in the port it
 * is reachable for a reason it is not in the C#: the port registers
 * `PARKING_ASPHALT_NS` and `PARKING_ASPHALT_EW` as tile models and marks both
 * `canDecay`, where the C# declares the two *images* and never registers a model at
 * all. The C#'s own comment on the spot explains the gap ("don't need to do this one
 * at the moment"). Nothing was added to hide it; the test "throws on a decayed tile
 * model the table does not name" pins the throw so that a future case for parking
 * asphalt is a deliberate change rather than an accident.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { District, DistrictKind } from "@data/District";
import { Faction } from "@data/Faction";
import { Lighting, Map as GameMap } from "@data/Map";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { World } from "@data/World";
import { Car } from "@engine/mapobjects/MapObjects";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { TileID } from "@gameplay/GameTiles";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;

/**
 * The three ported methods, reached the way `tests/item-despawn.test.ts` reaches
 * `DespawnJunkInDistrict`: through a one-line cast rather than by widening a
 * private method's visibility for a test's benefit. All three are `private` in the
 * C# too.
 */
interface Decayable {
	CheckIfWorldDecays(map: GameMap): void;
	ApplyWorldDecayPhase(phase: number, map: GameMap): void;
	ChooseRelevantDecayDecorationForTile(tile: unknown): string;
}
const decay = () => game as unknown as Decayable;

/** The C#'s `CheckIfWorldDecays`: the day gate and the three-phase cadence. */
const checkIfWorldDecays = (m: GameMap = map): void => decay().CheckIfWorldDecays(m);
/** The C#'s `ApplyWorldDecayPhase`: one pass of one phase over one map. */
const applyPhase = (phase: number, m: GameMap = map): void =>
	decay().ApplyWorldDecayPhase(phase, m);

const pave = (id: TileID, w = 30, h = 30): void => {
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) map.setTileModelAt(x, y, Models.tiles.get(id)!);
	}
};

const tileAt = (x: number, y: number) => map.getTileAt(x, y)!;
const decosAt = (x: number, y: number): readonly string[] =>
	tileAt(x, y).getDecorations ?? [];
const put = (x: number, y: number, id: TileID, isInside = false): void => {
	map.setTileModelAt(x, y, Models.tiles.get(id)!);
	tileAt(x, y).isInside = isInside;
};

/** Every phase-1 drawing for one image, in the C#'s array order. */
const PHASE1: Record<string, readonly string[]> = {
	[GameImages.TILE_FLOOR_WALKWAY]: [
		GameImages.DECO_FLOOR_WALKWAY_DECAY_V1_PHASE1,
		GameImages.DECO_FLOOR_WALKWAY_DECAY_V2_PHASE1,
		GameImages.DECO_FLOOR_WALKWAY_DECAY_V3_PHASE1,
	],
	[GameImages.TILE_WALL_BRICK]: [
		GameImages.DECO_WALL_BRICK_DECAY_V1_PHASE1,
		GameImages.DECO_WALL_BRICK_DECAY_V2_PHASE1,
		GameImages.DECO_WALL_BRICK_DECAY_V3_PHASE1,
	],
	[GameImages.TILE_WALL_STONE]: [
		GameImages.DECO_WALL_STONE_DECAY_V1_PHASE1,
		GameImages.DECO_WALL_STONE_DECAY_V2_PHASE1,
	],
	[GameImages.TILE_WALL_WOOD_PLANKS]: [
		GameImages.DECO_WALL_PLANKS_DECAY_V1_PHASE1,
		GameImages.DECO_WALL_PLANKS_DECAY_V2_PHASE1,
	],
	[GameImages.TILE_FLOOR_CONCRETE]: [
		GameImages.DECO_FLOOR_CONCRETE_DECAY_V1_PHASE1,
		GameImages.DECO_FLOOR_CONCRETE_DECAY_V2_PHASE1,
		GameImages.DECO_FLOOR_CONCRETE_DECAY_V3_PHASE1,
	],
	[GameImages.TILE_FLOOR_OFFICE]: [
		GameImages.DECO_FLOOR_OFFICE_DECAY_V1_PHASE1,
		GameImages.DECO_FLOOR_OFFICE_DECAY_V2_PHASE1,
		GameImages.DECO_FLOOR_OFFICE_DECAY_V3_PHASE1,
	],
};

beforeEach(() => {
	new GameActors();
	Session.useSeed(1);
	// **Not** `new GameTiles()` on top of this. `RogueGame`'s constructor builds
	// the tile registry and `GameTiles`' constructor publishes itself as
	// `Models.tiles`, so constructing a second one here would leave `Tile.model`
	// resolving through *that* registry while `m_GameTiles` still pointed at the
	// first -- and the sweep's four `tile.model === m_GameTiles.get(...)` identity
	// tests (the 25% trickle list: the two roads, walkway and asphalt) would all be
	// false, silently. Same trap `tests/replace-destroyed-wall.test.ts` writes down
	// for `Map.isBuildingFloorTileAt`.
	game = new RogueGame(new NullRogueUI());
	Session.get().ruleset = Ruleset.STILL_ALIVE;
	map = new GameMap(1, "test", 30, 30);
	Session.get().currentMap = map;
	player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
	player.controller = new PlayerController();
	map.placeActor(player, new Point(15, 15));
	game.m_Player = player;
	// The two global options every test here moves, restored afterwards.
	RogueGame.Options().isWorldDecayOn = true;
	RogueGame.Options().daysBeforeWorldDecays = 7;
	pave(TileID.FLOOR_GRASS);
});

// ── 1. The guards on the tile half ────────────────────────────────────────────

describe("world decay: the guards on the tile half", () => {
	it("never touches a tile whose model cannot decay", () => {
		// Grass, dirt, the ponds and the two carpets are the 34. The assertion is
		// that *nothing at all* happens -- not a phase, not a decoration -- because
		// the flag is the first `continue` in the loop and there is nothing after it
		// that could act on a tile it has skipped.
		put(12, 12, TileID.FLOOR_GRASS);
		put(13, 12, TileID.FLOOR_DIRT);
		put(14, 12, TileID.FLOOR_RED_CARPET);
		put(15, 12, TileID.FLOOR_POND_CENTER);
		for (const id of [
			TileID.FLOOR_GRASS,
			TileID.FLOOR_DIRT,
			TileID.FLOOR_RED_CARPET,
			TileID.FLOOR_POND_CENTER,
		] as const) {
			expect(Models.tiles.get(id)!.canDecay, TileID[id]).toBe(false);
		}

		for (const phase of [1, 2, 3]) applyPhase(phase);

		for (const x of [12, 13, 14, 15]) {
			expect(decosAt(x, 12), `x=${x}`).toEqual([]);
			expect(tileAt(x, 12).decayPhase, `x=${x}`).toBe(0);
		}
	});

	it("never revisits a tile that is already at the phase being applied", () => {
		// The high-water mark, and the reason the phase is a *tile* field rather
		// than something read off the decoration list: it is what makes a second
		// pass a no-op and a save/reload safe.
		put(12, 12, TileID.WALL_BRICK);
		applyPhase(1);
		const afterFirst = [...decosAt(12, 12)];
		expect(tileAt(12, 12).decayPhase).toBe(1);

		applyPhase(1);
		expect(decosAt(12, 12)).toEqual(afterFirst);
		expect(tileAt(12, 12).decayPhase).toBe(1);
	});

	it("never touches a wall that has already been blown open", () => {
		// `ApplyWorldDecayPhase` asks whether any decoration contains `_damaged`
		// before it does anything else with the tile, and a hole in a wall is a
		// hole for ever: there is no rubble drawing to weather. The same coupling
		// the scorch guard has, on the same substring.
		put(12, 12, TileID.WALL_BRICK);
		tileAt(12, 12).addDecoration(GameImages.DECO_WALL_BRICK_DAMAGED);
		expect(Models.tiles.get(TileID.WALL_BRICK)!.canDecay).toBe(true);

		applyPhase(1);

		expect(decosAt(12, 12)).toEqual([GameImages.DECO_WALL_BRICK_DAMAGED]);
		expect(tileAt(12, 12).decayPhase).toBe(0);
	});

	it("replaces the previous phase's drawing rather than stacking a second one", () => {
		// The removal is keyed on the `_phase` substring, so a tile that has decayed
		// once ends the second pass with exactly one decay drawing on it.
		put(12, 12, TileID.WALL_BRICK);
		applyPhase(1);
		applyPhase(2);
		applyPhase(3);

		expect(decosAt(12, 12)).toHaveLength(1);
		expect(decosAt(12, 12)[0]).toMatch(/^Tiles\/Decoration\/decay\/brick_wall_v\d_phase3$/);
		expect(tileAt(12, 12).decayPhase).toBe(3);
	});

	it("carries every unrelated decoration across all three phases", () => {
		// The sweep rewrites only what contains `_phase`. Blood, vomit and scorch
		// must survive a week of weather, and they do.
		put(12, 12, TileID.FLOOR_CONCRETE);
		tileAt(12, 12).addDecoration(GameImages.DECO_BLOODIED_FLOOR);
		tileAt(12, 12).addDecoration(GameImages.DECO_SCORCH_MARK_CENTER_FLOOR);

		for (const phase of [1, 2, 3]) applyPhase(phase);

		expect(decosAt(12, 12)).toEqual([
			expect.stringMatching(/_phase3$/),
			GameImages.DECO_BLOODIED_FLOOR,
			GameImages.DECO_SCORCH_MARK_CENTER_FLOOR,
		]);
	});
});

// ── 2. Draw order, and the asymmetry the C# keeps ─────────────────────────────

describe("world decay: draw order", () => {
	it("puts the decay drawing *under* blood and scorch, on an outdoor tile", () => {
		// `insertDecoration(deco, 0)`: decorations are drawn in list order, so
		// index 0 is the bottom of the pile. This is the reason the method exists.
		put(12, 12, TileID.WALL_BRICK);
		tileAt(12, 12).addDecoration(GameImages.DECO_BLOODIED_WALL);
		tileAt(12, 12).addDecoration(GameImages.DECO_SCORCH_MARK_INNER_WALL);

		applyPhase(1);

		expect(decosAt(12, 12)).toEqual([
			expect.stringMatching(/brick_wall_v\d_phase1$/),
			GameImages.DECO_BLOODIED_WALL,
			GameImages.DECO_SCORCH_MARK_INNER_WALL,
		]);
	});

	it("puts the decay drawing *over* blood, on an interior wall", () => {
		// The reference's own asymmetry, preserved: an interior wall takes the
		// `addDecoration` arm and lands on top of the pile, because it has one
		// generic drawing for a whole building rather than a per-model one. So
		// blood on an indoor wall draws *under* its decay grime. Reading the two
		// arms as one and picking the right insert position would "fix" this and be
		// wrong.
		put(12, 12, TileID.WALL_BRICK, true);
		tileAt(12, 12).addDecoration(GameImages.DECO_BLOODIED_WALL);

		applyPhase(1);

		expect(decosAt(12, 12)).toEqual([
			GameImages.DECO_BLOODIED_WALL,
			GameImages.DECO_WALL_GENERIC_INTERIOR_DECAY_PHASE1,
		]);
		expect(tileAt(12, 12).decayPhase).toBe(1);
	});

	it("gives every interior wall the same generic drawing, whatever its material", () => {
		// `DECO_WALL_GENERIC_INTERIOR_DECAY_PHASE<n>` has no `_V<n>` because there is
		// one drawing per phase for the whole building, not one per wall material.
		for (const [i, wall] of [
			TileID.WALL_BRICK,
			TileID.WALL_CHAR_OFFICE,
			TileID.WALL_MALL,
			TileID.WALL_HOSPITAL,
		].entries()) {
			const x = 10 + i * 2;
			put(x, 12, wall, true);
			applyPhase(1);
			expect(decosAt(x, 12), TileID[wall]).toEqual([
				GameImages.DECO_WALL_GENERIC_INTERIOR_DECAY_PHASE1,
			]);
		}
	});
});

// ── 3. The below-ground ladder, and the subway ────────────────────────────────

describe("world decay: the subway, and everything else below ground", () => {
	it("does not decay a subway wall, because the map is not lit from outside", () => {
		// **The special case the `GameTiles` comment points at.** `WALL_SUBWAY` is
		// registered `CanDecay = true` -- there is no subway-specific test in the
		// C# and there must not be one here -- and it still never decays, because
		// `GenerateSubwayMap` builds the map with `Lighting.DARKNESS`
		// (`BaseTownGenerator.cs:937`) and marks every tile `IsInside` (`:1101`),
		// which is the pair `ApplyWorldDecayPhase`'s ladder reads.
		put(12, 12, TileID.WALL_SUBWAY, true);
		map.lighting = Lighting.DARKNESS;
		expect(Models.tiles.get(TileID.WALL_SUBWAY)!.canDecay, "the flag stays true").toBe(
			true,
		);
		expect(map.lighting, "and the map is a dark one").toBe(Lighting.DARKNESS);

		applyPhase(1);

		expect(decosAt(12, 12)).toEqual([]);
		expect(tileAt(12, 12).decayPhase).toBe(0);
	});

	it("decays the same wall on a surface map, which is the control for the above", () => {
		// Same model, same `IsInside`, one field different -- the map's lighting.
		// If the subway test passed for some other reason (a wrong `canDecay`, a
		// filter that skips walls, a broken `isInside` read) this one fails, because
		// the tile is otherwise byte-identical.
		put(12, 12, TileID.WALL_SUBWAY, true);
		map.lighting = Lighting.OUTSIDE;

		applyPhase(1);

		// An *interior* wall, so it takes the generic whole-building drawing rather
		// than a per-material one. That it decays at all is the point.
		expect(decosAt(12, 12)).toEqual([GameImages.DECO_WALL_GENERIC_INTERIOR_DECAY_PHASE1]);
		expect(tileAt(12, 12).decayPhase).toBe(1);
	});

	it("takes the stone drawing outdoors, because subway walls are registered as stone", () => {
		// The same alias `ReplaceDestroyedWall` relies on, and the trap for anyone
		// keying the reader on `TileID` instead of `imageId`: `WALL_SUBWAY` and
		// `WALL_POLICE_STATION` are registered with `GameImages.TILE_WALL_STONE`,
		// so they arrive here already spelled `Tiles/wall_stone`.
		for (const [i, wall] of [TileID.WALL_STONE, TileID.WALL_POLICE_STATION, TileID.WALL_SUBWAY].entries()) {
			const x = 10 + i * 3;
			put(x, 12, wall, false);
			expect(Models.tiles.get(wall)!.imageId, TileID[wall]).toBe(GameImages.TILE_WALL_STONE);
		}

		applyPhase(1);

		for (let i = 0; i < 3; i++) {
			const x = 10 + i * 3;
			expect(decosAt(x, 12), `x=${x}`).toEqual([
				expect.stringMatching(/^Tiles\/Decoration\/decay\/stone_wall_v\d_phase1$/),
			]);
		}
	});

	it("does not decay interior walls of any below-ground map, lit or not", () => {
		// The generalisation the subway comment is really about. `LIT` is what the
		// mall's underground car park and the CHAR facility are, and the ladder
		// tests `== Lighting.OUTSIDE` rather than `!= Lighting.DARKNESS`, so both
		// are declined.
		for (const lighting of [Lighting.DARKNESS, Lighting.LIT]) {
			put(12, 12, TileID.WALL_BRICK, true);
			map.lighting = lighting;
			applyPhase(1);
			expect(decosAt(12, 12), `lighting ${lighting}`).toEqual([]);
		}
	});

	it("stops an interior floor at exactly phase 2, and only a quarter at a time", () => {
		// Two guards in one arm, and the first one is an *equality* rather than the
		// `>=` the outdoor arm uses. That is the C# (`if (tile.DecayPhase == 2)
		// continue;`) and it is worth pinning: an indoor floor that missed both
		// earlier passes is still eligible for phase 3, and the four indoor-floor
		// cases in the reader answer that with a phase-2 drawing. `RollChance(25)`
		// is the second guard, and it is why only some of any twenty tiles move on
		// any one pass -- "it looks more organic if a trickle of tiles decay each
		// day". Seed 1 makes the split fixed.
		const phases = (): number[] =>
			Array.from({ length: 20 }, (_, i) => tileAt(5 + i, 20).decayPhase);

		for (let x = 5; x < 25; x++) put(x, 20, TileID.FLOOR_OFFICE, true);
		map.lighting = Lighting.DARKNESS;

		applyPhase(1);
		const atPhase1 = phases().filter((p) => p === 1).length;
		expect(atPhase1, "some but not all of the twenty").toBeGreaterThan(0);
		expect(atPhase1, "because the arm rolls at 25%").toBeLessThan(20);

		applyPhase(2);
		const afterFirst2 = phases();
		const atPhase2 = afterFirst2.filter((p) => p === 2).length;
		expect(atPhase2, "phase 2 reached the tiles phase 1 missed").toBeGreaterThan(0);
		expect(
			afterFirst2.filter((p) => p === 1).length,
			"the ones it reached moved on rather than being redrawn",
		).toBeLessThan(atPhase1);
		// No tile is carrying two decay drawings, which is the `_phase` removal pass
		// doing its job on a tile that already had one.
		for (let x = 5; x < 25; x++) {
			expect(
				decosAt(x, 20).filter((d) => d.includes("_phase")).length,
				`x=${x}`,
			).toBeLessThanOrEqual(1);
		}

		// Phase 3 skips the tiles that are *at* 2 and nothing else, so those are
		// frozen for ever while the stragglers can still creep up.
		const frozen = afterFirst2
			.map((p, i) => (p === 2 ? i : -1))
			.filter((i) => i >= 0);
		expect(frozen.length).toBe(atPhase2);
		for (let pass = 0; pass < 6; pass++) applyPhase(3);
		const afterPhase3 = phases();
		for (const i of frozen) {
			expect(afterPhase3[i], `tile ${i + 5} sat at 2`).toBe(2);
		}
		expect(
			afterPhase3.filter((p) => p === 3).length,
			"and the `== 2` guard let the stragglers through to 3",
		).toBeGreaterThan(0);
	});
});

// ── 4. The cadence ────────────────────────────────────────────────────────────

describe("world decay: the cadence", () => {
	/**
	 * Put the session clock on a given in-game day, at hour 18.
	 *
	 * `CheckIfWorldDecays` reads `m_Session.WorldTime.Day`, and the port's `WorldTime`
	 * derives the day from the turn counter, so the day *is* the counter.
	 */
	const setDay = (day: number): void => {
		(game.m_Session as unknown as { m_WorldTime: WorldTime }).m_WorldTime =
			new WorldTime(day * WorldTime.TURNS_PER_DAY + 18 * WorldTime.TURNS_PER_HOUR);
		expect(game.m_Session.worldTime.day, `the clock really is on day ${day}`).toBe(day);
	};

	it("does nothing at all before the option's day", () => {
		for (let day = 0; day < 7; day++) {
			setDay(day);
			put(12, 12, TileID.WALL_BRICK);
			checkIfWorldDecays();
			expect(tileAt(12, 12).decayPhase, `day ${day}`).toBe(0);
			expect(decosAt(12, 12), `day ${day}`).toEqual([]);
		}
	});

	it("applies phase 1, 2 and 3 on days 7, 14 and 21, and never a fourth time", () => {
		// The whole shape of the feature: exactly three passes, ever, and only on
		// days that are an exact multiple of the option.
		for (const [day, phase] of [
			[7, 1],
			[14, 2],
			[21, 3],
		] as const) {
			setDay(day);
			put(12, 12, TileID.WALL_BRICK);
			checkIfWorldDecays();
			expect(tileAt(12, 12).decayPhase, `day ${day}`).toBe(phase);
			expect(decosAt(12, 12)[0], `day ${day}`).toMatch(
				new RegExp(`brick_wall_v\\d_phase${phase}$`),
			);
		}

		// Day 28 is a multiple of 7 but the quotient is 4, and there is no phase 4.
		for (const day of [22, 28, 35, 100]) {
			setDay(day);
			put(12, 12, TileID.WALL_BRICK);
			checkIfWorldDecays();
			expect(tileAt(12, 12).decayPhase, `day ${day} must not advance`).toBe(3);
		}
	});

	it("does nothing on a day that is not a multiple of the option", () => {
		// The integrality test. Day 8 with the default 7 gives 8/7, which is not an
		// integer, and the C# returns there -- "not an interger", its own spelling.
		for (const day of [8, 9, 13, 15, 20]) {
			setDay(day);
			put(12, 12, TileID.WALL_BRICK);
			checkIfWorldDecays();
			expect(tileAt(12, 12).decayPhase, `day ${day}`).toBe(0);
		}
	});

	it("reads the option as a period, not an offset", () => {
		// 14 does not mean "start in a fortnight and then never again": it means
		// phase 1 on day 14, phase 2 on day 28, phase 3 on day 42. The C# divides,
		// and the setter's own doc comment says so.
		RogueGame.Options().daysBeforeWorldDecays = 14;

		setDay(13);
		put(12, 12, TileID.WALL_BRICK);
		checkIfWorldDecays();
		expect(tileAt(12, 12).decayPhase, "day 13 is inside a 14-day window").toBe(0);

		setDay(14);
		checkIfWorldDecays();
		expect(tileAt(12, 12).decayPhase).toBe(1);
		expect(decosAt(12, 12)[0]).toMatch(/brick_wall_v\d_phase1$/);

		// Day 28 is the second pass, not a repeat of the first: a tile already at 1
		// moves to 2 rather than being redrawn, and a fresh tile starts at 2 too --
		// nothing is ever "still waiting for phase 1".
		setDay(28);
		put(13, 12, TileID.WALL_BRICK);
		checkIfWorldDecays();
		expect(tileAt(12, 12).decayPhase).toBe(2);
		expect(decosAt(12, 12)).toHaveLength(1);
		expect(decosAt(12, 12)[0]).toMatch(/brick_wall_v\d_phase2$/);
		expect(tileAt(13, 12).decayPhase).toBe(2);
		expect(decosAt(13, 12)[0]).toMatch(/brick_wall_v\d_phase2$/);
	});

	it("clamps the option to 7..28 and defaults to 7", () => {
		// The release arm of the C#'s setter; see `GameOptions.daysBeforeWorldDecays`
		// for why the `#if DEBUG` floor of 1 is not reachable from a browser build.
		RogueGame.Options().daysBeforeWorldDecays = 1;
		expect(RogueGame.Options().daysBeforeWorldDecays).toBe(7);
		RogueGame.Options().daysBeforeWorldDecays = 99;
		expect(RogueGame.Options().daysBeforeWorldDecays).toBe(28);
		expect(new (Object.getPrototypeOf(RogueGame.Options()).constructor)()
			.daysBeforeWorldDecays).toBe(7);
	});
});

// ── 5. The reader's table ─────────────────────────────────────────────────────

describe("world decay: which drawing a tile gets", () => {
	it("picks one of the variants for the tile's own image", () => {
		// Driven per image so the assertion is about the table rather than about the
		// roll, and twenty tiles per image so the two rolls in the arm can land:
		// `ChooseRelevantDecayDecorationForTile` rolls over the variants (and the
		// array *length* is the range, so a two-variant wall and a three-variant one
		// behave differently), and the outdoor arm rolls at 25% for four of the six
		// images here. `trickled` records which is which -- that split is the C#'s
		// `else if` list, and getting it wrong would show up as "all twenty" where
		// the C# would give a quarter.
		const cases: readonly [TileID, boolean, boolean][] = [
			// [tile, isInside, trickled at 25%]
			[TileID.FLOOR_WALKWAY, false, true],
			[TileID.WALL_BRICK, false, false],
			[TileID.WALL_STONE, false, false],
			[TileID.WALL_WOOD_PLANKS, false, false],
			[TileID.FLOOR_CONCRETE, false, false],
			[TileID.FLOOR_OFFICE, false, false],
		];
		let row = 4;
		for (const [id, inside] of cases) {
			const image = Models.tiles.get(id)!.imageId;
			expect(PHASE1[image], `${TileID[id]} must have a phase-1 row here`).toBeDefined();
			for (let x = 0; x < 20; x++) put(x, row, id, inside);
			row += 2;
		}

		applyPhase(1);

		row = 4;
		for (const [id, , trickled] of cases) {
			const allowed = PHASE1[Models.tiles.get(id)!.imageId]!;
			const drawn = Array.from({ length: 20 }, (_, x) => decosAt(x, row));
			for (const decos of drawn) {
				if (decos.length === 0) continue;
				expect(allowed, `${TileID[id]}`).toContain(decos[0]);
			}
			const count = drawn.filter((d) => d.length > 0).length;
			expect(count, `${TileID[id]}: some`).toBeGreaterThan(0);
			if (trickled) {
				expect(count, `${TileID[id]}: a quarter of twenty, not all`).toBeLessThan(20);
			} else {
				expect(count, `${TileID[id]}: every one of the twenty`).toBe(20);
			}
			row += 2;
		}
	});

	it("keys the court floors on a substring, because each court is dozens of tiles", () => {
		// `ImageID.Contains("basketball")` / `Contains("tennis")` rather than an id
		// comparison: the C#'s comment is "need to use this broad method, as courts
		// are made up of dozens of unique tiles". One of each proves the substring
		// arm; the exact court tile is irrelevant to the reader, which is the point.
		//
		// Twenty of each, because the court arms are also in the 25% trickle list --
		// the C#'s `else if` puts them alongside the roads -- so a pair of tiles
		// would usually produce nothing at all and the test would pass for the
		// wrong reason.
		expect(Models.tiles.get(TileID.FLOOR_BASKETBALL_COURT_18)!.imageId).toContain(
			"basketball",
		);
		expect(Models.tiles.get(TileID.FLOOR_TENNIS_COURT_10)!.imageId).toContain("tennis");
		for (let x = 0; x < 20; x++) put(x, 12, TileID.FLOOR_BASKETBALL_COURT_18);
		for (let x = 0; x < 20; x++) put(x, 14, TileID.FLOOR_TENNIS_COURT_10);

		applyPhase(1);

		const drawn = (y: number, family: string): number => {
			let n = 0;
			for (let x = 0; x < 20; x++) {
				const decos = decosAt(x, y);
				if (decos.length === 0) continue;
				n++;
				expect(decos[0], `x=${x}`).toMatch(
					new RegExp(`^Tiles/Decoration/decay/${family}_v\\d_phase1$`),
				);
			}
			return n;
		};
		const basketball = drawn(12, "basketball_court");
		const tennis = drawn(14, "tennis_court");
		for (const [label, n] of [
			["basketball", basketball],
			["tennis", tennis],
		] as const) {
			expect(n, `${label}: some but not all of the twenty`).toBeGreaterThan(0);
			expect(n, `${label}: the arm rolls at 25%`).toBeLessThan(20);
		}
	});

	it("gives the four indoor floors a phase-2 drawing even when asked for phase 3", () => {
		// `case 2: case 3:` returning the phase-2 array, and the C#'s reason on each:
		// "I include three in case entrance tiles count as !IsInside, and are thus
		// missed by the filters in the calling parent function".
		//
		// Driven from phase 1 rather than phase 0, because the high-water mark
		// (`tile.decayPhase >= phase`) refuses a tile that is already at the phase
		// being applied -- asking for phase 1 on a phase-3 tile is a no-op, which is
		// itself worth knowing and is what the previous test pins. Phase 3 from 1 is
		// the state the C#'s comment describes: a doorway tile the generator left
		// marked outdoor, which the indoor arm therefore never stopped.
		for (const [x, floor] of [
			[12, TileID.FLOOR_TILES],
			[13, TileID.FLOOR_WHITE_TILE],
			[14, TileID.FLOOR_OFFICE],
			[15, TileID.FLOOR_PLANKS],
		] as const) {
			put(x, 12, floor, false);
			tileAt(x, 12).decayPhase = 1;
		}

		applyPhase(3);

		for (const [x, , family] of [
			[12, TileID.FLOOR_TILES, "shop_tile"],
			[13, TileID.FLOOR_WHITE_TILE, "white_floor_tile"],
			[14, TileID.FLOOR_OFFICE, "office_floor"],
			[15, TileID.FLOOR_PLANKS, "planks_floor"],
		] as const) {
			expect(tileAt(x, 12).decayPhase, `x=${x}`).toBe(3);
			expect(decosAt(x, 12), `x=${x}`).toEqual([
				expect.stringMatching(
					new RegExp(`^Tiles/Decoration/decay/${family}_v\\d_phase2$`),
				),
			]);
		}
	});

	it("spreads the big outdoor floors out instead of decaying them all at once", () => {
		// The `else if` arm: roads, walkway and asphalt outside are rolled at 25%,
		// "it looks more organic if a trickle of tiles decay each day". Thirty road
		// tiles, deterministic seed, and the assertion is that the pass reached some
		// and not all -- the same shape as the indoor-floor test, and the only honest
		// way to test a percentage roll.
		for (let x = 0; x < 30; x++) put(x, 25, TileID.ROAD_ASPHALT_NS);
		applyPhase(1);
		const phases = Array.from({ length: 30 }, (_, x) => tileAt(x, 25).decayPhase);
		const touched = phases.filter((p) => p === 1).length;
		expect(touched, "some but not all of the thirty").toBeGreaterThan(0);
		expect(touched, "the arm rolls at 25%").toBeLessThan(30);
		// Whatever it did, every drawing it laid is a road one.
		for (let x = 0; x < 30; x++) {
			const decos = decosAt(x, 25);
			if (decos.length === 0) continue;
			expect(decos[0], `x=${x}`).toMatch(
				/^Tiles\/Decoration\/decay\/road_asphalt_NS_v\d_phase1$/,
			);
		}
	});

	it("throws on a decayed tile model the table does not name", () => {
		// **A landmine the C# does not have, and the reason this test exists.**
		// `PARKING_ASPHALT_NS`/`_EW` are images the C# declares and preloads
		// (`GameImages.cs:219-220`, Release 7-3) and never registers as tile models;
		// the port registers both *and* marks them `canDecay`, and the reader has
		// no case for them. The C#'s own comment on the spot is "don't need to do
		// this one at the moment, as it's only used in the mall underground parking
		// so far" -- which is true in the C# and is a latently-false claim here.
		// Nothing places either model, so the throw is unreachable in play; this
		// pins it so that adding a case for it is a deliberate change rather than
		// an accident someone notices in a bug report.
		put(12, 12, TileID.PARKING_ASPHALT_NS);
		expect(Models.tiles.get(TileID.PARKING_ASPHALT_NS)!.canDecay).toBe(true);
		expect(() => applyPhase(1)).toThrow(/unexpected tile model.*parking_asphalt_ns/);
	});
});

// ── 6. Map objects ────────────────────────────────────────────────────────────

describe("world decay: the map-object half", () => {
	const FENCE_PHASE1 = [
		GameImages.OBJ_CHAINWIRE_FENCE_V1_PHASE1,
		GameImages.OBJ_CHAINWIRE_FENCE_V2_PHASE1,
		GameImages.OBJ_CHAINWIRE_FENCE_V3_PHASE1,
		GameImages.OBJ_CHAINWIRE_FENCE_V4_PHASE1,
	];

	const fenceAt = (x: number, y: number): MapObject => {
		const obj = new MapObject("chainwire fence", GameImages.OBJ_CHAINWIRE_FENCE);
		map.placeMapObject(obj, new Point(x, y));
		return obj;
	};

	it("rusts an outdoor chainwire fence, and leaves an indoor one alone", () => {
		// The arm's own guard is `!tile.IsInside` on the tile the object *stands
		// on* -- not on the object, not on the map. So the same sprite decays on a
		// pavement and does not decay inside a shop. Thirty fences so the 33% roll
		// has somewhere to land; seed 1 makes the split fixed.
		const outdoor: MapObject[] = [];
		const indoor: MapObject[] = [];
		for (let x = 0; x < 30; x++) {
			const at = new Point(x, 28);
			map.placeMapObject(new MapObject("fence", GameImages.OBJ_CHAINWIRE_FENCE), at);
			outdoor.push(map.getMapObjectAtPoint(at)!);
		}
		for (let x = 0; x < 10; x++) {
			const at = new Point(x, 29);
			map.placeMapObject(new MapObject("fence", GameImages.OBJ_CHAINWIRE_FENCE), at);
			// The tile under an indoor object is the tile that decides.
			tileAt(x, 29).isInside = true;
			indoor.push(map.getMapObjectAtPoint(at)!);
		}

		applyPhase(1);

		const changed = outdoor.filter((o) => o.imageId !== GameImages.OBJ_CHAINWIRE_FENCE);
		expect(changed.length, "some of the thirty outdoor fences").toBeGreaterThan(0);
		expect(changed.length, "and not all of them -- it rolls at 33%").toBeLessThan(30);
		for (const o of changed) expect(FENCE_PHASE1, o.imageId).toContain(o.imageId);
		for (const o of outdoor.filter((o) => o.imageId === GameImages.OBJ_CHAINWIRE_FENCE)) {
			expect(FENCE_PHASE1).not.toContain(o.imageId);
		}
		for (const o of indoor) {
			expect(o.imageId, "an indoor fence never decays").toBe(
				GameImages.OBJ_CHAINWIRE_FENCE,
			);
		}
	});

	it("skips an object that is not on the map, where the C# would crash", () => {
		// The C# does `map.GetTileAt(mapObj.Location.Position).IsInside` and
		// `GetTileAt` never returns null. The port's does return null for a
		// position off the map, and `Map.placeMapObject` does not range-check --
		// so an object can be registered past the edge. Skipping it is the only
		// answer that does not turn that into a crash during a sweep over every
		// object in every district, and it is the one place the port's map-object
		// half is deliberately more forgiving than the reference.
		const strays: MapObject[] = [];
		for (const at of [new Point(-1, 28), new Point(30, 28), new Point(12, -1), new Point(12, 30)]) {
			const obj = new MapObject("stray fence", GameImages.OBJ_CHAINWIRE_FENCE);
			map.placeMapObject(obj, at);
			strays.push(obj);
		}

		expect(() => applyPhase(1)).not.toThrow();
		for (const o of strays) expect(o.imageId).toBe(GameImages.OBJ_CHAINWIRE_FENCE);
	});

	it("does not re-roll a fence that already wears the phase being applied", () => {
		// The `phase<n>` substring test, and the reason the check exists: without
		// it, every later pass would draw a *different* variant onto the same fence
		// and the 33% roll would keep churning it.
		const obj = fenceAt(12, 28);
		const before = obj.imageId;
		for (let i = 0; i < 5; i++) applyPhase(1);
		expect(obj.imageId === before || FENCE_PHASE1.includes(obj.imageId)).toBe(true);

		const settled = obj.imageId;
		for (let i = 0; i < 5; i++) applyPhase(1);
		expect(obj.imageId, "a phase-1 fence is stable across repeated passes").toBe(settled);
	});

	it("renames a car by swapping its trailing digit for the phase", () => {
		// **The port's one real divergence, and it is in the ids rather than in the
		// logic.** The C#'s car sprites are `car_red_phase0`..`_phase3` and the "last
		// character is the decay phase" trick works on them. The port's car factory
		// (`BaseMapGenerator.CARS`) names cars after the *vanilla* `car1..car4`, so
		// the trailing digit says which car it is rather than how rusty, and this
		// arm swaps one car for another instead of weathering it. Transcribed
		// exactly -- the ids belong to `generators/`, which this change does not
		// touch, and the C#'s own `int.Parse` would throw on a name not ending in a
		// digit where `parseInt` yields `NaN` and leaves the 33% roll in charge.
		//
		// First half: the C#'s roll-free path. `0 < phase - 1` is true for phase 3,
		// so an object two or more phases behind is moved with no dice spent at all.
		const behind = new Car(
			"wrecked car",
			"MapObjects/car_phase0",
			MapObjectBreak.BROKEN,
			0,
		);
		map.placeMapObject(behind, new Point(12, 27));
		applyPhase(3);
		expect(behind.imageId).toBe("MapObjects/car_phase3");

		// Second half: the roll path, on thirty real port cars. `car3`'s trailing
		// `3` is not behind phase 2, so only the 33% roll moves them.
		const cars: Car[] = [];
		for (let x = 0; x < 30; x++) {
			const car = new Car("wrecked car", GameImages.OBJ_CAR3, MapObjectBreak.BROKEN, 0);
			map.placeMapObject(car, new Point(x, 26));
			cars.push(car);
		}
		applyPhase(2);
		const moved = cars.filter((c) => c.imageId !== GameImages.OBJ_CAR3);
		expect(moved.length, "some of the thirty").toBeGreaterThan(0);
		expect(moved.length, "and not all -- it rolls at 33%").toBeLessThan(30);
		for (const c of moved) expect(c.imageId).toBe("MapObjects/car2");
	});

	it("leaves a picket fence alone, because nothing ever places one", () => {
		// Dead in the reference and dead here: `GameImages.cs:610-612` declares the
		// three phase-0 picket-fence sprites and no C# generator asks for them. The
		// arm and its three-way direction reader are transcribed regardless, and
		// this drives them by hand so they are not untested code -- an object whose
		// image merely *contains* `picket_fence` is enough to reach it.
		const obj = new MapObject("picket fence", "MapObjects/picket_fence_NS_left");
		map.placeMapObject(obj, new Point(12, 26));

		applyPhase(1);

		expect(obj.imageId).toBe(GameImages.OBJ_PICKET_FENCE_NS_LEFT_V1_PHASE1);
		applyPhase(2);
		expect(obj.imageId).toBe(GameImages.OBJ_PICKET_FENCE_NS_LEFT_V1_PHASE2);
	});
});

// ── 7. The gate, which is at the call site ────────────────────────────────────

describe("world decay: the option gate in the turn loop", () => {
	// The C# puts both gates in `AdvancePlay(District, SimFlags)` (`:5618`), not in
	// `CheckIfWorldDecays`, so testing `isWorldDecayOn` means driving the turn loop.
	// That is affordable because the sunset branch's only other work is
	// `OnNewNight()`, which for a living player is a single `UpdatePlayerFOV`.

	/** One district at world position (0,0), holding `map` as its surface map. */
	const districtOver = (): District => {
		const district = new District(new Point(0, 0), DistrictKind.GENERAL);
		Session.get().world = new World(1);
		const world = Session.get().world!;
		world.setDistrict(0, 0, district);
		district.entryMap = map;
		map.district = district;
		Session.get().currentMap = map;
		// `District.entryMap`'s setter puts the map in `district.maps`, and the
		// first thing `advancePlayDistrict` does is play every map in the district
		// one turn at a time. This test is about the gate, not about a map turn, so
		// the list is emptied again -- and `map.district` re-pointed, because
		// `removeMap` clears it and the branch needs `district` to be the current
		// map's district.
		district.removeMap(map);
		map.district = district;
		expect(district.maps).toHaveLength(0);
		return district;
	};

	/**
	 * The four `CheckForEvent_*` arms that a day-7 sunset would otherwise be
	 * allowed to roll, and the only way the turn loop gets past the decay gate.
	 *
	 * Stubbed rather than allowed to fire, and deliberately: a biker or gangsta
	 * raid would drop actors onto the map this file is measuring tiles on. The
	 * strike-of-midnight and strike-of-midday arms (zombie invasion, refugees) are
	 * already inert at hour 18 and are left alone.
	 */
	const noRaids = (g: RogueGame): void => {
		const stub = g as unknown as Record<string, unknown>;
		for (const name of [
			"CheckForEvent_BikersRaid",
			"CheckForEvent_GangstasRaid",
			"CheckForEvent_BlackOpsRaid",
			"CheckForEvent_CHARScientists",
			"CheckForEvent_SewersInvasion",
		]) {
			stub[name] = () => false;
		}
	};

	/**
	 * Day 7 on the *last turn of hour 17*, so the turn loop's own
	 * `worldTime.turnCounter++` crosses into hour 18 -- sunset, the branch the decay
	 * gate lives in. An hour is `TURNS_PER_HOUR` = 30 turns, so parking anywhere
	 * earlier in hour 17 would leave the clock in hour 17 after the increment and
	 * the sunset branch would never be entered; these tests would then be asserting
	 * nothing at all, which is the failure mode to watch for here.
	 */
	const setClock = (day: number, hour: number): void => {
		(game.m_Session as unknown as { m_WorldTime: WorldTime }).m_WorldTime = new WorldTime(
			day * WorldTime.TURNS_PER_DAY +
				hour * WorldTime.TURNS_PER_HOUR +
				WorldTime.TURNS_PER_HOUR -
				1,
		);
		expect(game.m_Session.worldTime.day, `on day ${day}`).toBe(day);
		expect(game.m_Session.worldTime.hour, `on hour ${hour}`).toBe(hour);
		expect(game.m_Session.worldTime.isNight, "and it starts in daylight").toBe(false);
	};

	it("decays the world on the sunset turn once the option says so", async () => {
		noRaids(game);
		const district = districtOver();
		setClock(7, 17);
		put(12, 12, TileID.WALL_BRICK);
		map.localTime.turnCounter = game.m_Session.worldTime.turnCounter + 1;
		expect(tileAt(12, 12).decayPhase).toBe(0);

		await game.AdvancePlay(district, 0 as never);

		expect(game.m_Session.worldTime.hour, "the loop advanced into the night").toBe(18);
		expect(tileAt(12, 12).decayPhase, "phase 1 landed on day 7").toBe(1);
		expect(decosAt(12, 12)[0]).toMatch(/brick_wall_v\d_phase1$/);
	});

	it("decays nothing when the master switch is off, however late the game runs", async () => {
		// The point of the gate being a master switch: the option's own help text
		// promises that with it off the day count "is ignored", and this is where
		// that is true. Day 7 is well past the window, so only the switch can be
		// what stops it.
		noRaids(game);
		RogueGame.Options().isWorldDecayOn = false;
		const district = districtOver();
		setClock(7, 17);
		put(12, 12, TileID.WALL_BRICK);
		map.localTime.turnCounter = game.m_Session.worldTime.turnCounter + 1;

		await game.AdvancePlay(district, 0 as never);

		expect(game.m_Session.worldTime.hour).toBe(18);
		expect(tileAt(12, 12).decayPhase).toBe(0);
		expect(decosAt(12, 12)).toEqual([]);
	});

	it("decays nothing on a sunset before the option's day", async () => {
		noRaids(game);
		RogueGame.Options().daysBeforeWorldDecays = 14;
		const district = districtOver();
		// Day 7, which is inside a 14-day window rather than on its first day.
		setClock(7, 17);
		put(12, 12, TileID.WALL_BRICK);
		map.localTime.turnCounter = game.m_Session.worldTime.turnCounter + 1;

		await game.AdvancePlay(district, 0 as never);

		expect(game.m_Session.worldTime.hour).toBe(18);
		expect(tileAt(12, 12).decayPhase, "day 7 is inside a 14-day window").toBe(0);
	});

	it("does not run on a turn that is not a sunset", async () => {
		// The gate lives in the `!wasNight && isNight` arm, so a turn that stays in
		// daylight is not a decay turn even on the right day. This is the arm's
		// placement being real rather than incidental: the sweep is a *nightly*
		// event.
		noRaids(game);
		const district = districtOver();
		// Day 7, hour 8 -> the increment lands on hour 9, morning.
		setClock(7, 8);
		put(12, 12, TileID.WALL_BRICK);
		map.localTime.turnCounter = game.m_Session.worldTime.turnCounter + 1;

		await game.AdvancePlay(district, 0 as never);

		expect(game.m_Session.worldTime.hour).toBe(9);
		expect(tileAt(12, 12).decayPhase).toBe(0);
	});
});
