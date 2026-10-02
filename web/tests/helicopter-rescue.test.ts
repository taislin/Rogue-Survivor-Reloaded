/**
 * `Feature.HelicopterRescue` — the endgame rescue helicopter.
 *
 * Still Alive, Release 6-3 onward. This is the feature whose *day* has been
 * written since `Feature.DifficultyAtCreation` and read by nothing; these are the
 * tests for the other three session fields and the two days they are used on.
 *
 * ## What is here and what is not
 *
 * Ported and tested: the landing-site pick (`RogueGame.cs:4470-4574`), the spawn
 * and despawn (`:28807`, `:28926`), the boarding bump (`:23298`) and the
 * `PlayerWasRescued` endgame (`:7377`), plus the AI's run for the chopper
 * (`CivilianAI.cs:522-542`).
 *
 * NOT ported, and asserted nowhere as if it were — each has its reason stated at
 * its call site in `RogueGame.ts`:
 *
 * - `CheckLandedHelicopterSFX` (`:10524`) and the flyover after the spawn
 *   (`:28869-28877`). Those are the five `Feature.AmbientAudio` helicopter
 *   tracks, and they are gated on *that* feature, not on this one.
 * - `FireEvent_RescueWave` (`:28132`). Its feral-dog leg needs an option
 *   (`GAME_MAX_ANIMALS`) and a spawner the port does not have.
 * - The advisor reveal (`:27535`) and the map-screen line (`:17026`). Both are
 *   reached only through `UniqueMaps.ArmyBase`, which is `Feature.ArmyBase`,
 *   still pending.
 *
 * ## The two C# bugs this reproduces rather than repairs
 *
 * `TileIsGoodForHelicopter` (`RogueGame.cs:4649`) returns `true` from *both* of
 * its arms, and `FindNonHelicopterSpotToMovePlayer` (`:28901`) never assigns its
 * `winningScore`. Both are pinned below, deliberately, because a port that
 * quietly repaired either would change which tiles a run's rescue square is on
 * and neither repair is a question this feature can answer from the C#.
 *
 * ## The one thing that must never change
 *
 * A Classic world. `GenerateWorld` now spends a die and writes three session
 * fields, at the *last* stage before the player is spawned. The last two tests
 * do not take that on trust: a subclass overrides the new stage away, which is
 * exactly the state the pre-change program was in, and the whole district grid
 * is then compared tile for tile.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import type { ActorAction } from "@data/ActorAction";
import { District, DistrictKind } from "@data/District";
import { Location } from "@data/Location";
import { Map as GameMap } from "@data/Map";
import { MapObject } from "@data/MapObject";
import { Models } from "@data/Models";
import { Zone } from "@data/Zone";
import { World } from "@data/World";
import { Direction } from "@engine/Direction";
import { GameOptions, SimRatio } from "@engine/GameOptions";
import { ItemFood } from "@engine/items/ItemFood";
import {
	bandForDistance,
	euclideanDistance,
	NoiseBand,
	NOISE_RADII,
} from "@engine/NoiseDistance";
import { Rect } from "@engine/Rect";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { ItemID } from "@gameplay/GameItems";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Point } from "@engine/Point";
import {
	HELICOPTER_LANDING_ZONE_TOKENS,
	isHelicopterLandingZoneName,
	RogueGame,
} from "@engine/RogueGame";
import { AchievementIDs } from "@engine/Scoring";
import { RaidType, Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { GameAmbients } from "@gameplay/GameAmbients";
import { GameImages } from "@gameplay/GameImages";
import { SkillID } from "@gameplay/Skills";
import { NullRogueUI } from "@ui/NullRogueUI";

// ── The seam under test ──────────────────────────────────────────────────────

/**
 * The world-generation stage with the helicopter stage's *writes* removed.
 *
 * The mapgen seam proved this trick already (`town-building-seam.test.ts`): a
 * subclass that overrides a new stage away *is* the pre-change program, so "did
 * my change move anything?" becomes a comparison of two runs rather than an
 * argument.
 *
 * **It calls `super` and undoes the three field writes, rather than returning
 * `true` outright.** Both halves of that matter, and the second is the reason the
 * test can be trusted at all:
 *
 * - The *returns* stay in step. `PickHelicopterRescueSite` returning false sends
 *   `StartNewGame` round its retry loop with `Session.reset()` and a **new seed**,
 *   so a real run and a stage-skipped run only compare like with like if they took
 *   the same number of attempts. Returning `true` unconditionally guaranteed they
 *   did not: the override could never retry, and a seed whose first attempt found
 *   no place to land made the two runs two different cities. That is not a
 *   hypothetical -- porting `MakeItemAlcohol` (`BarBuilding.ts`) made `m_Rules`
 *   move, the parks moved with it, `RESCUE_SEED`'s first attempt stopped finding a
 *   landing spot, and this comparison started failing on a difference that had
 *   nothing to do with the stage.
 * - The *writes* do not survive. Calling `super` spends the C#'s `m_Rules` roll
 *   and then the three `Session` assignments of `RogueGame.cs:4551-4553` are put
 *   back, so the two runs differ in nothing a map can see. `armyHelicopterRescueMap`
 *   is derived from the district ref (`Session.ts:358`), so restoring the ref and
 *   the coordinates restores all three.
 */
class NoRescueGame extends RogueGame {
	override PickHelicopterRescueSite(world: World): boolean {
		const savedRef = this.m_Session.armyHelicopterRescueDistrictRef;
		const savedCoords = this.m_Session.armyHelicopterRescueCoordinates;
		const picked = super.PickHelicopterRescueSite(world);
		this.m_Session.setHelicopterRescueSite(savedRef, savedCoords!);
		return picked;
	}
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const RESCUE_SEED = 4242;

/**
 * A real generated world.
 *
 * `StartNewGame`, not `GenerateWorld`, because the retry loop is part of what is
 * under test: `PickHelicopterRescueSite` returning false is a legal outcome and
 * that loop is the only thing that handles it, so a harness calling the
 * generator directly would test a path no player ever reaches.
 *
 * `opts.citySize = 1` is clamped up to 3 by the option setter, so this is a 3x3
 * city: nine districts, enough for at least one green one on most seeds, and
 * cheap enough to generate several times in a suite.
 */
async function generateWorld(
	ctor: typeof RogueGame,
	seed: number,
	ruleset: Ruleset,
): Promise<RogueGame> {
	// Before constructing the game: the constructor builds `Rules` from the
	// session seed, so a seed applied later would only half-pin the run.
	Session.useSeed(seed);
	const game = new ctor(new NullRogueUI(), new NullMusicManager());
	await game.LoadData();
	const opts = RogueGame.options;
	opts.citySize = 1;
	opts.simulateDistricts = SimRatio.OFF;
	opts.isAnimDelayOn = false;
	opts.isAdvisorEnabled = false;
	game.m_CharGen.isUndead = false;
	game.m_CharGen.isMale = true;
	game.m_CharGen.startingSkill = SkillID.AGILE;
	// `PlayerWasRescued` reaches `HandlePostMortem`, which registers a hi-score, and
	// the table is loaded by `Run()` rather than by `LoadData()`. A rescued run is
	// the only path in this file that needs it, and without it the endgame throws
	// on `m_HiScoreTable.register` rather than failing an assertion.
	await game.LoadHiScoreTable();
	game.session.ruleset = ruleset;
	await game.StartNewGame();
	return game;
}

/**
 * Every district's tiles, objects and zones, as one comparable string.
 *
 * Layout only: no actors, no ground items, no `isVisited`. The claim is that the
 * new stage *generates* nothing, and a digest that included the player would be
 * testing the spawn that comes after it instead.
 */
function worldLayout(game: RogueGame): string {
	const world = game.session.world!;
	const out: string[] = [];
	for (let x = 0; x < world.size; x++) {
		for (let y = 0; y < world.size; y++) {
			const d = world.getDistrict(x, y)!;
			out.push(`district ${x},${y} ${DistrictKind[d.kind]} ${d.name}`);
			for (const m of d.maps) {
				out.push(` map ${m.name} ${m.width}x${m.height}`);
				for (let mx = 0; mx < m.width; mx++) {
					for (let my = 0; my < m.height; my++) {
						const tile = m.getTileAt(mx, my)!;
						const obj = m.getMapObjectAt(mx, my);
						const deco = (tile.getDecorations ?? []).join("+");
						out.push(`  ${mx},${my} ${tile.model.id} ${deco} ${obj ? obj.imageId : "-"}`);
					}
				}
				out.push(
					`  zones ${m.zones
						.map(
							(z) =>
								`${z.name}@${z.bounds.left},${z.bounds.top},${z.bounds.width},${z.bounds.height}`,
						)
						.sort()
						.join("|")}`,
				);
			}
		}
	}
	return out.join("\n");
}

/** The three tiles a landed helicopter occupies, left to right. */
function heliSprites(map: GameMap, at: Point): (string | null)[] {
	return [0, 1, 2].map((i) => map.getMapObjectAt(at.x + i, at.y)?.imageId ?? null);
}

/** Every map object on this map the player could board. */
const heliObjects = (map: GameMap): string[] =>
	map.mapObjects.filter((o) => o.aName === "a helicopter").map((o) => o.imageId);

/**
 * The same turn number, moved to `hour` o'clock on the day it is already on.
 *
 * `WorldTime`'s `turnCounter` setter recomputes day/hour/phase/`isNight`, so a
 * test moves the number rather than poking the cached fields.
 */
function atHour(from: number, hour: number): number {
	const t = new WorldTime(from);
	return t.day * WorldTime.TURNS_PER_DAY + hour * WorldTime.TURNS_PER_HOUR;
}

/** Puts the world clock on `day`, at midday so `isNight` is not implied. */
function setDay(game: RogueGame, day: number): void {
	game.session.worldTime.turnCounter =
		day * WorldTime.TURNS_PER_DAY + WorldTime.TURNS_PER_HOUR * 12;
}

// ── The gates ────────────────────────────────────────────────────────────────

describe("Feature.HelicopterRescue: the gates", () => {
	it("is off under CLASSIC and on under STILL_ALIVE, through hasFeature", () => {
		expect(hasFeature(Ruleset.CLASSIC, Feature.HelicopterRescue)).toBe(false);
		expect(hasFeature(Ruleset.STILL_ALIVE, Feature.HelicopterRescue)).toBe(true);
	});

	it("writes no site under CLASSIC, and places nothing that could be boarded", async () => {
		// The day is still the option's default — `DifficultyAtCreation` owns it and
		// `reset()` restores it — but the *site* is this feature's, and it has to
		// stay empty. Asserted on the session rather than on "the function was not
		// called", because a stage that returned true while still writing a site
		// would satisfy the latter.
		const game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.CLASSIC);
		expect(game.session.armyHelicopterRescueDistrictRef).toBe("");
		expect(game.session.armyHelicopterRescueCoordinates).toBeNull();
		expect(game.session.armyHelicopterRescueMap).toBeNull();

		const world = game.session.world!;
		for (let x = 0; x < world.size; x++) {
			for (let y = 0; y < world.size; y++) {
				for (const m of world.getDistrict(x, y)!.maps) {
					expect(heliObjects(m), m.name).toEqual([]);
				}
			}
		}
	}, 120_000);

	it("costs nothing: a Classic city is identical with the stage and with it overridden away", async () => {
		// The byte-identical claim. Both runs are the same seed under CLASSIC; the
		// only difference is whether `PickHelicopterRescueSite` runs, and under the
		// gate it must not — so the two cities have to be the same city.
		const stageOn = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.CLASSIC);
		const withStage = worldLayout(stageOn);
		const stageOff = await generateWorld(NoRescueGame, RESCUE_SEED, Ruleset.CLASSIC);
		expect(worldLayout(stageOff)).toBe(withStage);

		// Non-vacuous: the digest is describing nine districts, and one of them is
		// the hardcoded business quarter, so a digest that silently found nothing
		// would not produce this.
		expect(withStage.length).toBeGreaterThan(10_000);
		expect(withStage).toContain(`district 0,0 ${DistrictKind[DistrictKind.BUSINESS]}`);
	}, 240_000);

	it("still costs nothing under STILL_ALIVE: the stage generates no geometry", async () => {
		// Half two, and the half that matters: the stage takes one die from
		// `m_Rules`, so the question is whether that die can reach anything. It
		// cannot, because the stage is the *last* thing `GenerateWorld` does before
		// spawning the player — every tile, object and zone above it was rolled
		// before it ran. If this ever fails, the stage has been moved above
		// generation, which is the one way it could silently reshuffle every world
		// the port makes.
		const stageOn = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		const withStage = worldLayout(stageOn);
		expect(stageOn.session.armyHelicopterRescueDistrictRef).not.toBe("");

		const stageOff = await generateWorld(NoRescueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		expect(worldLayout(stageOff)).toBe(withStage);
		// And the override really did skip it: no site was chosen.
		expect(stageOff.session.armyHelicopterRescueDistrictRef).toBe("");
		expect(stageOff.session.armyHelicopterRescueCoordinates).toBeNull();
	}, 240_000);

	it("the same seed picks the same site", async () => {
		const site = async (seed: number) => {
			const g = await generateWorld(RogueGame, seed, Ruleset.STILL_ALIVE);
			return [
				g.session.armyHelicopterRescueDistrictRef,
				g.session.armyHelicopterRescueCoordinates?.x,
				g.session.armyHelicopterRescueCoordinates?.y,
			];
		};
		const first = await site(RESCUE_SEED);
		expect(first[0]).not.toBe("");
		expect(await site(RESCUE_SEED)).toEqual(first);
		expect(await site(RESCUE_SEED)).toEqual(first);

		// Non-vacuous: a different seed lays out a different city, so "the same
		// every time" would be a property of the map generator and not of this
		// feature. It is asserted on the city rather than on the site so it cannot
		// be satisfied by two seeds that happen to land on the same park.
		const other = await generateWorld(RogueGame, 99, Ruleset.STILL_ALIVE);
		expect(worldLayout(other)).not.toBe(
			worldLayout(await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE)),
		);
	}, 300_000);
});

// ── The landing site ─────────────────────────────────────────────────────────

describe("Feature.HelicopterRescue: the landing site", () => {
	let game: RogueGame;
	let map: GameMap;
	let site: Point;

	beforeEach(async () => {
		game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		map = game.session.armyHelicopterRescueMap!;
		site = game.session.armyHelicopterRescueCoordinates!;
	}, 240_000);

	it("records the district, the coordinates and the map, and the map is that district's entry map", () => {
		expect(map).not.toBeNull();
		expect(site).toBeInstanceOf(Point);

		// C# `:4551-4553`, all three.
		const ref = game.session.armyHelicopterRescueDistrictRef;
		expect(ref).toMatch(/^[A-H][0-9]$/);
		const gx = ref.charCodeAt(0) - 65;
		const gy = Number.parseInt(ref.slice(1), 10);
		const district: District = game.session.world!.getDistrict(gx, gy)!;
		expect(district.kind).toBe(DistrictKind.GREEN);
		// The C# only ever assigns `chosenDistrict.EntryMap`, and the port's
		// `armyHelicopterRescueMap` *derives* the map from that reference — so this
		// is also the test that the derivation resolves the same map the picker saw.
		expect(map).toBe(district.entryMap);
	});

	it("is three consecutive clear tiles, all of them good for a helicopter", () => {
		// The C#'s test, `:4538-4546`: three tiles one apart in x, each passing
		// `TileIsGoodForHelicopter` and each with no map object on it.
		for (let i = 0; i < 3; i++) {
			const pt = new Point(site.x + i, site.y);
			expect(game.TileIsGoodForHelicopter(map, pt), `${pt} is a tile`).toBe(true);
			expect(map.getMapObjectAtPoint(pt), `${pt} is clear`).toBeNull();
		}
		// Consecutive along x, because the helicopter is three sprites side by side.
		expect(map.isInBoundsPoint(new Point(site.x + 2, site.y))).toBe(true);
	});

	it("lies inside a zone whose name is one of the three the C# allows", () => {
		// This is the whole of the "Park / Graveyard / court" rule: a *name*
		// substring test, not a zone attribute and not a district kind. C# `:4533`.
		expect([...HELICOPTER_LANDING_ZONE_TOKENS]).toEqual([
			"Park",
			"Graveyard",
			"court",
		]);

		const zonesAtSite = map.getZonesAt(site.x, site.y);
		expect(zonesAtSite.length).toBeGreaterThan(0);
		expect(
			zonesAtSite.some((z) => isHelicopterLandingZoneName(z.name)),
			`${site} is inside a landing-named zone, got [${zonesAtSite.map((z) => z.name).join(", ")}]`,
		).toBe(true);

		// The zone's own bounds contain all three tiles, not just the first: the
		// C# scans `z.Bounds` and so the third tile is only "good" because it is
		// still inside the zone. A site whose third tile fell outside would put a
		// helicopter's tail through a fence.
		const zone = zonesAtSite.find((z) => isHelicopterLandingZoneName(z.name))!;
		expect(zone.bounds.left).toBeLessThanOrEqual(site.x);
		expect(zone.bounds.right).toBeGreaterThanOrEqual(site.x + 2);
		expect(zone.bounds.top).toBeLessThanOrEqual(site.y);
		expect(zone.bounds.bottom).toBeGreaterThanOrEqual(site.y + 1);
	});

	it("excludes a district whose zones are none of the three", () => {
		// The negative half of the rule, which is what "excludes" means, on worlds
		// built by hand rather than generated: no seed is guaranteed to produce a
		// green district *without* a park, and a test that depended on one would be
		// a coin flip.
		//
		// Every map below is wide open — no map object anywhere — so the zone *name*
		// is the only thing that can decide each one. That is the claim.
		const oneDistrict = (
			zoneNames: string[],
			kind: DistrictKind = DistrictKind.GREEN,
		): World => {
			const world = new World(1);
			const district = new District(new Point(0, 0), kind);
			world.setDistrict(0, 0, district);
			const map = new GameMap(1, "one district", 12, 12);
			district.entryMap = map;
			for (const zoneName of zoneNames) {
				map.addZone(new Zone(zoneName, new Rect(2, 2, 6, 6)));
			}
			return world;
		};

		// A green district whose zone is called "shops": wide open, green, and still
		// no site. The C# returns false here (`:4544-4548`) and so does the port.
		expect(game.PickHelicopterRescueSite(oneDistrict(["shops"]))).toBe(false);
		// Same map, zone renamed to the one token the rule admits.
		expect(game.PickHelicopterRescueSite(oneDistrict(["Park"]))).toBe(true);
		expect(Session.get().armyHelicopterRescueDistrictRef).toBe("A0");
		expect(Session.get().armyHelicopterRescueCoordinates).toEqual(new Point(2, 2));

		// Case sensitivity, which is what a substring test gives you: "park" is not
		// "Park" and "Court" is not "court".
		for (const name of ["park", "Court", "graveyard"]) {
			Session.get().reset();
			expect(game.PickHelicopterRescueSite(oneDistrict([name])), name).toBe(false);
		}

		// **The C#'s asymmetry, pinned.** Step 1 (which districts are candidates)
		// tests for "Park" only; step 3 (which zones are scanned) also admits
		// "Graveyard" and "court". So a green district whose *only* open space is a
		// graveyard is still excluded — `Feature.Graveyard` made that zone exist in
		// Release 4 and the fork's own picker never learned about it.
		Session.get().reset();
		expect(game.PickHelicopterRescueSite(oneDistrict(["Graveyard"]))).toBe(false);
		Session.get().reset();
		expect(game.PickHelicopterRescueSite(oneDistrict(["Tennis court"]))).toBe(false);
		// Add the park step 1 asks for and it qualifies again — and then step 3 is
		// free to use the graveyard too, which is the only way the other two tokens
		// ever do anything.
		Session.get().reset();
		expect(game.PickHelicopterRescueSite(oneDistrict(["Park", "Graveyard"]))).toBe(true);
		Session.get().reset();
		expect(game.PickHelicopterRescueSite(oneDistrict(["Park", "Tennis court"]))).toBe(
			true,
		);

		// Step 1 is a separate exclusion from step 3, and both have to hold: a
		// district that is not green is not a candidate even with a park in it, and
		// a green district with no park in it is not a candidate even though step 3
		// would happily accept one of its zones.
		expect(game.PickHelicopterRescueSite(oneDistrict(["Park"], DistrictKind.SHOPPING))).toBe(
			false,
		);
		Session.get().reset();
		expect(game.PickHelicopterRescueSite(oneDistrict(["shops"]))).toBe(false);
	});

	it("excludes a zone whose rows are all blocked, and takes the first clear one", () => {
		// The other half of the constraint: three *consecutive* tiles, not three
		// tiles somewhere. A zone with objects on every tile but two adjacent ones
		// has no site, and one with a clear run of three in the middle of the zone
		// gets exactly that run — which is also what fixes the site to a particular
		// tile for a given seed.
		const blocked = (clearCols: number[]): World => {
			const world = new World(1);
			const district = new District(new Point(0, 0), DistrictKind.GREEN);
			world.setDistrict(0, 0, district);
			const map = new GameMap(1, "blocked", 12, 12);
			district.entryMap = map;
			map.addZone(new Zone("Park", new Rect(2, 2, 6, 6)));
			for (let y = 2; y < 8; y++) {
				for (let x = 2; x < 8; x++) {
					if (!clearCols.includes(x)) {
						map.placeMapObject(
							new MapObject("tree", GameImages.OBJ_TREE),
							new Point(x, y),
						);
					}
				}
			}
			return world;
		};

		// One clear column in six rows: six clear tiles and no *three in a row*.
		expect(game.PickHelicopterRescueSite(blocked([4]))).toBe(false);
		// Two columns is two, not three.
		expect(game.PickHelicopterRescueSite(blocked([4, 5]))).toBe(false);
		// Three columns, and the site is the leftmost of the run — the scan is
		// x-major (`for x { for y { } }`, `:4541-4542`), so which row of a clear
		// run is taken is fixed too, and that is what pins a run's site.
		expect(game.PickHelicopterRescueSite(blocked([4, 5, 6]))).toBe(true);
		expect(Session.get().armyHelicopterRescueCoordinates).toEqual(new Point(4, 2));
	});

	it("TileIsGoodForHelicopter is the C#'s: true for anything that exists", () => {
		// Pinned because it looks like a bug and is not this file's to fix. The C#
		// (`:4649-4658`) returns `true` from the grass/sports-court arm *and* from
		// the `// bad spot.` arm, so the first line gates nothing. A port that
		// "repaired" it would reject most parks — a park's perimeter is fenced
		// walkway and its interior is grass with trees on it — and turn a rare
		// worldgen failure into a common one.
		const grass = map.getTileAt(site.x, site.y)!.model;
		const anyTile = new Point(0, 0);
		expect(game.TileIsGoodForHelicopter(map, anyTile)).toBe(true);
		expect(game.TileIsGoodForHelicopter(map, site)).toBe(true);
		// Not just grass: every tile of every model the map has.
		for (let x = 0; x < map.width; x++) {
			for (let y = 0; y < map.height; y++) {
				expect(game.TileIsGoodForHelicopter(map, new Point(x, y))).toBe(true);
			}
		}
		expect(grass).toBeDefined();

		// The one difference from the C#, which indexes the grid unguarded and
		// throws one tile past the edge: the scan reads `x + 2` with no bounds check
		// of its own, so a park that ended two tiles from the map edge would take
		// world generation down. Off the map is not a place to land.
		expect(game.TileIsGoodForHelicopter(map, new Point(-1, 0))).toBe(false);
		expect(
			game.TileIsGoodForHelicopter(map, new Point(map.width, map.height)),
		).toBe(false);
	});
});

// ── Spawn and despawn, keyed on the day ──────────────────────────────────────

describe("Feature.HelicopterRescue: spawn and despawn", () => {
	let game: RogueGame;
	let map: GameMap;
	let site: Point;

	beforeEach(async () => {
		game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		map = game.session.armyHelicopterRescueMap!;
		site = game.session.armyHelicopterRescueCoordinates!;
	}, 240_000);

	it("the day comes from Session.armyHelicopterRescueDay, not from anywhere else", async () => {
		// The whole point of the field: the day is chosen at character creation
		// (`DifficultyAtCreation`) and nothing else in the engine may invent one.
		// Set it to a day that is neither today nor the option's default, so a
		// hardcoded 21 or "today" fails.
		const chosenDay = 11;
		expect(chosenDay).not.toBe(GameOptions.DEFAULT_RESCUE_DAY);
		game.session.armyHelicopterRescueDay = chosenDay;

		setDay(game, chosenDay - 1);
		await game.OnNewDay();
		expect(heliObjects(map), "the day before").toEqual([]);

		setDay(game, chosenDay);
		await game.OnNewDay();
		expect(heliObjects(map), "the rescue day").toHaveLength(3);

		setDay(game, chosenDay + 1);
		await game.OnNewDay();
		// Still there: `DespawnArmyHelicopter` runs at dusk, not at the next dawn.
		expect(heliObjects(map), "the day after, before dusk").toHaveLength(3);
	}, 60_000);

	it("lands the three sprites in order, on the site's three tiles", async () => {
		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();

		// C# `:28864-28866`, in order: `OBJ_HELICOPTER1`, `_2`, `_3`.
		expect(heliSprites(map, site)).toEqual([
			GameImages.OBJ_HELICOPTER1,
			GameImages.OBJ_HELICOPTER2,
			GameImages.OBJ_HELICOPTER3,
		]);
		// And nothing anywhere else on the map.
		expect(heliObjects(map)).toHaveLength(3);

		// Each one is its own object, all unbreakable and unwalkable, so the three
		// tiles become walls the player bumps into — which is where the C# puts the
		// "really escape" question.
		for (const o of map.mapObjects.filter((x) => x.aName === "a helicopter")) {
			expect(o.name).toBe("helicopter");
			expect(o.aName).toBe("a helicopter");
			expect(o.isBreakable).toBe(false);
			expect(o.isWalkable).toBe(false);
			expect(o.isJumpable).toBe(false);
		}
	}, 60_000);

	it("tells the orderable AIs on the map that a chopper is landing", async () => {
		// C# `:28878` (Release 7-5) and `OrderableAI.OnRaid` (`:538`). Observed
		// through a probe rather than through the *description* an AI would shout,
		// because the description is a string in a switch: `onRaid` throws on a
		// `RaidType` it does not know, so "it did not throw and it saw the raid" is
		// the whole contract, and the string is a bonus.
		class ProbeAI extends CivilianAI {
			heard: RaidType | null = null;
			override onRaid(raid: RaidType, location: Location, turn: number): void {
				this.heard = raid;
				super.onRaid(raid, location, turn);
			}
		}
		const bystander = new Actor(
			Models.actors.get(ActorID.MALE_CIVILIAN)!,
			game.gameFactions.get(FactionID.TheCivilians),
			"bystander",
		);
		const probe = new ProbeAI();
		bystander.controller = probe;
		// On the map, but not on the rescue square, so the spawn does not crush it.
		map.placeActor(bystander, new Point(site.x + 4, site.y));
		expect(probe.heard).toBeNull();

		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();

		expect(probe.heard).toBe(RaidType.HELICOPTER_RESCUE);
		expect(RaidType.HELICOPTER_RESCUE).not.toBe(RaidType.ARMY_SUPLLIES);
		expect(bystander.isDead, "and it is not standing on the chopper").toBe(false);
	});

	it("despawns at dusk on the rescue day, and not on any other day", async () => {
		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();
		expect(heliObjects(map)).toHaveLength(3);

		// A different day: the chopper stays where it is, because the C#'s test is
		// `WorldTime.Day == ArmyHelicopterRescue_Day` and not "is it there".
		game.session.worldTime.turnCounter += WorldTime.TURNS_PER_DAY;
		await game.OnNewNight();
		expect(heliObjects(map), "a night that is not the rescue day's").toHaveLength(3);

		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewNight();
		expect(heliObjects(map), "the rescue day's night").toEqual([]);
	}, 60_000);

	it("clears the rescue square: objects and items go, an NPC in the way dies", async () => {
		setDay(game, game.session.armyHelicopterRescueDay);

		// C# `:28820-28833`. Put something in the way of all three tiles.
		//
		// **The two occupied tiles are chosen from the square, not hardcoded.**
		// `placeActor` throws on an occupied tile, and the district has since gained
		// actors where this test used to find bare walkway -- the parks region is fed
		// properly again, so a tile the test assumed was empty is not. Parking a
		// bystander on a fixed offset asserts a property of the *dice*.
		//
		// They have to stay *inside* the square, though, which is the point of the
		// test: the C# clears three tiles and nothing else, so a bystander one tile
		// further right would neither be crushed nor have its items removed, and the
		// test would pass for the wrong reason -- or fail, having measured nothing.
		const square = [0, 1, 2].map((dx) => new Point(site.x + dx, site.y));
		const free = square.filter((p) => map.getActorAtPoint(p) === null);
		expect(
			free.length,
			`only ${free.length} of the three rescue tiles at ${square.join(", ")} are free`
		).toBeGreaterThanOrEqual(2);
		const fenceTile = free[0]!;
		const third = free[1]!;
		const fence = new MapObject("fence", GameImages.OBJ_FENCE);
		map.placeMapObject(fence, fenceTile);
		map.dropItemAt(new ItemFood(Models.items.get(ItemID.FOOD_SNACK_BAR)!), third);
		const victim = new Actor(
			Models.actors.get(ActorID.MALE_CIVILIAN)!,
			game.gameFactions.get(FactionID.TheCivilians),
			"bystander",
		);
		map.placeActor(victim, third);
		expect(map.getActorAtPoint(third)).toBe(victim);

		await game.OnNewDay();

		// The fence was removed, not survived: the helicopter sprites are there.
		expect(heliObjects(map)).toHaveLength(3);
		// The item on the third tile is gone (C# `RemoveAllItemsAt`).
		expect(map.getItemsAt(third)).toBeNull();
		// The NPC is dead rather than relocated, and left no loot (C# `:28831`).
		expect(victim.isDead).toBe(true);
		expect(map.getItemsAt(third), "and the body dropped nothing").toBeNull();
	}, 60_000);

	it("moves the player off the rescue square instead of crushing them", async () => {
		// The player's branch of the same loop (C# `:28835-28858`): nobody is
		// killed, they are moved to the best spot beside the square.
		const player = game.player!;
		const map2 = player.location.map!;
		setDay(game, game.session.armyHelicopterRescueDay);

		// Stand on the site's first tile. It is a clear tile, so this is legal.
		map2.placeActor(player, new Point(site.x, site.y));
		expect(player.location.position).toEqual(new Point(site.x, site.y));

		await game.SpawnArmyHelicopterOnMap(map2);

		expect(player.isDead).toBe(false);
		// Off the three tiles, and still on the map.
		const now = player.location.position;
		expect([0, 1, 2].some((i) => now.x === site.x + i && now.y === site.y)).toBe(false);
		expect(map2.hasActor(player)).toBe(true);
	}, 60_000);

	it("is a no-op under CLASSIC: the rescue day arrives and nothing is there", async () => {
		const classic = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.CLASSIC);
		expect(classic.session.armyHelicopterRescueMap).toBeNull();
		classic.session.armyHelicopterRescueDay = 5;
		setDay(classic, 5);
		await classic.OnNewDay();
		await classic.OnNewNight();
		const world = classic.session.world!;
		for (let x = 0; x < world.size; x++) {
			for (let y = 0; y < world.size; y++) {
				for (const m of world.getDistrict(x, y)!.maps) {
					expect(heliObjects(m), m.name).toEqual([]);
				}
			}
		}
	}, 240_000);
});

// ── Boarding it: the extraction ──────────────────────────────────────────────

describe("Feature.HelicopterRescue: the extraction", () => {
	let game: RogueGame;
	let map: GameMap;
	let site: Point;

	beforeEach(async () => {
		game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		map = game.session.armyHelicopterRescueMap!;
		site = game.session.armyHelicopterRescueCoordinates!;
		// Put the player next to the chopper rather than wherever they woke up:
		// the C# only ever lets a player board by *bumping* the object
		// (`DoPlayerBump`, `:23298`), so the test has to do the same.
		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();
		const player = game.player!;
		map.placeActor(player, new Point(site.x, site.y - 1));
		expect(map.getActorAtPoint(new Point(site.x, site.y - 1))).toBe(player);
	}, 240_000);

	it("a bump into the chopper offers to end the game, and declining leaves it running", async () => {
		// C# `:23300-23327`. Answered "no": the C# adds a message and returns
		// false, and the run continues.
		game.m_UI.UI_PostKey({ key: "n", keyCode: 78, shift: false, ctrl: false, alt: false });
		const handled = await game.DoPlayerBump(game.player!, Direction.S);
		expect(handled).toBe(false);
		expect(game.m_PlayerWasRescued).toBe(false);
		expect(game.session.scoring.hasCompletedAchievement(AchievementIDs.RESCUED_BY_HELICOPTER)).toBe(
			false,
		);
		// The message the C# promises on a refusal: `:23322`.
		// `Message.text` carries the turn prefix ("15480 Ok, but ..."), so this is a
		// substring test rather than an equality one.
		expect(
			game.m_MessageManager.history.some((m) =>
				m.text.includes("Ok, but remember, it won't wait for long..."),
			),
		).toBe(true);
		// And the player did not move.
		expect(game.player!.location.position).toEqual(new Point(site.x, site.y - 1));
	}, 60_000);

	it("accepting awards the achievement, ends the run, and takes the player off the map", async () => {
		// C# `:23310-23318`. Answered "yes".
		const player = game.player!;
		const turnsBefore = game.session.worldTime.turnCounter;
		game.m_UI.UI_PostKey({ key: "y", keyCode: 89, shift: false, ctrl: false, alt: false });
		const handled = await game.DoPlayerBump(player, Direction.S);
		expect(handled).toBe(true);

		// The achievement (C# `:23311-23313`), which is the only way a run can set
		// it, and it pays 3000 points.
		expect(
			game.session.scoring.hasCompletedAchievement(AchievementIDs.RESCUED_BY_HELICOPTER),
		).toBe(true);
		expect(game.session.scoring.achievementPoints).toBeGreaterThanOrEqual(3000);

		// `m_PlayerWasRescued`, which is what ends `GameLoop` — the player is not
		// dead, so without it the world would keep turning.
		expect(game.m_PlayerWasRescued).toBe(true);
		expect(player.isDead).toBe(false);
		expect(map.hasActor(player)).toBe(false);

		// The scoring the C# writes (`:7396-7412`).
		expect(game.session.scoring.turnsSurvived).toBe(turnsBefore);
		expect(game.session.scoring.deathReason).toBe("Rescued to Murdoch air force base");
		expect(game.session.scoring.deathPlace).toContain(map.name);
		expect(game.session.scoring.events.map((e) => e.text)).toContain("Rescued.");
	});

	it("a bump into anything else on that map is still an ordinary blocked move", async () => {
		// The negative control. Without it, "bumping the thing next to me ends the
		// game" could be an artefact of *any* bump on the rescue map ending it.
		const player = game.player!;
		const from = new Point(site.x, site.y + 2);
		const blockedBy = new Point(site.x, site.y + 3);
		// An unbreakable, unwalkable object that is not the helicopter — so this is
		// the same *kind* of bump the rescue question hangs off, and the only thing
		// that differs is the name.
		map.placeMapObject(new MapObject("crate", GameImages.OBJ_JUNK), blockedBy);
		map.placeActor(player, from);
		const before = map.hasActor(player);

		game.m_UI.UI_PostKey({ key: "y", keyCode: 89, shift: false, ctrl: false, alt: false });
		const handled = await game.DoPlayerBump(player, Direction.S);
		expect(handled).toBe(false);
		expect(game.m_PlayerWasRescued).toBe(false);
		expect(map.hasActor(player)).toBe(before);
		expect(
			game.m_MessageManager.history.some((m) => m.text.includes("Really escape")),
		).toBe(false);
	}, 60_000);
});

// ── What is still missing, asserted so it stays missing ──────────────────────

describe("Feature.HelicopterRescue: the parts that are NOT ported", () => {
	it("no ambient track is played by a spawn, and the advisor never learns the details", async () => {
		// The five helicopter ambient tracks (`HELICOPTER_FLYOVER` and
		// `STATIONARY_HELICOPTER_{FARTHEST,FAR,NEAR,VISIBLE}`) are
		// `Feature.AmbientAudio`'s, and this feature must not reach for them: the
		// spawn is where the C# plays the flyover, and the port deliberately does
		// not. Asserted through the ambient manager, which is what would have to be
		// reached for a track to start.
		const game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		const session = game.session;
		expect(session.armyHelicopterRescueMap).not.toBeNull();

		const manager = game.m_AmbientSFXManager as unknown as {
			isPlaying(id: string): boolean;
		};
		for (const id of [
			GameAmbients.HELICOPTER_FLYOVER,
			GameAmbients.STATIONARY_HELICOPTER_FARTHEST,
			GameAmbients.STATIONARY_HELICOPTER_FAR,
			GameAmbients.STATIONARY_HELICOPTER_NEAR,
			GameAmbients.STATIONARY_HELICOPTER_VISIBLE,
		]) {
			expect(manager.isPlaying(id), id).toBe(false);
		}

		// What the follow-up needs, and what this feature has now made reachable:
		// a rescue map and coordinates, and a four-band noise model to measure the
		// player against. `NoiseDistance` is the second; the first two are the
		// session fields asserted above.
		expect(session.armyHelicopterRescueCoordinates).toBeInstanceOf(Point);
		expect(session.armyHelicopterRescueMap).not.toBeNull();
		expect(bandForDistance(0)).toBe(NoiseBand.Quiet);
		expect(bandForDistance(NOISE_RADII.BOOMING + 1)).toBe(NoiseBand.Inaudible);

		// The advisor reveal is `Feature.ArmyBase`'s to trigger: the C# only fires
		// it from the underground base's power coming on (`RogueGame.cs:27535`), and
		// the port has no `UniqueMaps.ArmyBase`. There is deliberately no
		// `playerKnowsHelicopterArrivalDetails` field to set, and a rescue-day run
		// is silent about where the helicopter is going to land.
		expect(Object.keys(session)).not.toContain("playerKnowsHelicopterArrivalDetails");
	}, 240_000);
});

// ── The state a pre-feature save loads into ──────────────────────────────────

describe("Feature.HelicopterRescue: a Still Alive run with no site", () => {
	/**
	 * A Still Alive session whose save predates this feature: the world is real,
	 * the ruleset is STILL_ALIVE, the day is set — and no landing site was ever
	 * chosen, because the save has no `armyHelicopterRescueDistrictRef`.
	 *
	 * Built through the public API rather than by reaching into the session's
	 * fields: `reset()` is what clears the site, and putting the world and the
	 * current map back afterwards is what makes the rest of the session usable.
	 * That is also exactly the state `Session.load` leaves behind, since
	 * `armyHelicopterRescueMap` is *derived* from the reference and an absent key
	 * is an absent reference.
	 */
	function forgetTheSite(): Session {
		const session = Session.get();
		const world = session.world;
		const currentMap = session.currentMap;
		session.reset();
		session.world = world;
		session.currentMap = currentMap;
		return session;
	}

	it("reaches its rescue day and does nothing, instead of throwing", async () => {
		const game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		const session = forgetTheSite();
		expect(session.ruleset).toBe(Ruleset.STILL_ALIVE);
		expect(session.armyHelicopterRescueMap).toBeNull();
		expect(session.armyHelicopterRescueCoordinates).toBeNull();

		session.armyHelicopterRescueDay = 5;
		setDay(game, 5);
		// Both arms of the day-change must shrug: the C# would dereference a null
		// `ArmyHelicopterRescue_Map` here (`:8912`, `:9052`) and die, because it had
		// no way to reach a Still Alive world without a rescue in it. The port can,
		// because `armyHelicopterRescueMap` has a null answer.
		await game.OnNewDay();
		await game.OnNewNight();

		const world = session.world!;
		for (let x = 0; x < world.size; x++) {
			for (let y = 0; y < world.size; y++) {
				for (const m of world.getDistrict(x, y)!.maps) {
					expect(heliObjects(m), m.name).toEqual([]);
				}
			}
		}
	}, 240_000);

	it("does not offer a rescue from another district, even at the chopper's coordinates", async () => {
		// The bump's arm is gated on `armyHelicopterRescueMap === player.location.map`
		// as well as on the feature, and this is the test for that condition
		// specifically: the player is in a *different* district, standing at the exact
		// coordinates the rescue square occupies on the rescue map, with something
		// unwalkable in front of them so the bump reaches the arm at all.
		//
		// Drop the map test and the arm reads the *rescue* map at the player's
		// coordinates, finds the helicopter that is sitting there, and offers to end
		// the run three districts away. That is the mutation this exists to catch,
		// and it is why the fixture is built at the site's own coordinates rather
		// than at an arbitrary one.
		const game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		const rescueMap = game.session.armyHelicopterRescueMap!;
		const site = game.session.armyHelicopterRescueCoordinates!;
		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();
		expect(heliObjects(rescueMap)).toHaveLength(3);

		const world = game.session.world!;
		let other: GameMap | null = null;
		for (let x = 0; x < world.size && other === null; x++) {
			for (let y = 0; y < world.size && other === null; y++) {
				const m = world.getDistrict(x, y)!.entryMap!;
				if (m !== rescueMap) other = m;
			}
		}
		expect(other).not.toBeNull();
		const elsewhere = other!;

		const from = new Point(site.x, site.y - 1);
		// Unwalkable and unbreakable, like the helicopter itself — so the bump is
		// refused for the same reason a real one is.
		elsewhere.placeMapObject(
			new MapObject("crate", GameImages.OBJ_JUNK),
			new Point(site.x, site.y),
		);
		const player = game.player!;
		elsewhere.placeActor(player, from);
		expect(player.location.map).toBe(elsewhere);

		game.m_UI.UI_PostKey({ key: "y", keyCode: 89, shift: false, ctrl: false, alt: false });
		await game.DoPlayerBump(player, Direction.S);

		expect(game.m_PlayerWasRescued).toBe(false);
		expect(
			game.m_MessageManager.history.some((m) => m.text.includes("Really escape")),
		).toBe(false);
		expect(heliObjects(rescueMap), "and the real chopper is untouched").toHaveLength(3);
	}, 240_000);
});

// ── The AI runs for it ───────────────────────────────────────────────────────

describe("Feature.HelicopterRescue: CivilianAI step 7", () => {
	let game: RogueGame;
	let map: GameMap;
	let site: Point;
	let civilian: Actor;
	let ai: CivilianAI;

	beforeEach(async () => {
		game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.STILL_ALIVE);
		map = game.session.armyHelicopterRescueMap!;
		site = game.session.armyHelicopterRescueCoordinates!;
		// The chopper is on the ground, and the map's own clock is on the rescue day
		// at midday — the AI tests `map.LocalTime`, not the session's.
		setDay(game, game.session.armyHelicopterRescueDay);
		map.localTime.turnCounter = game.session.worldTime.turnCounter;
		expect(map.localTime.day).toBe(game.session.armyHelicopterRescueDay);
		expect(map.localTime.isNight).toBe(false);
		await game.SpawnArmyHelicopterOnMap(map);

		// Everyone else off the map. A generated district has NPCs and undeads in
		// it, and rule 4 of `CivilianAI` ("fight or flee, shout") runs *before* rule
		// 7 — so with a zombie in FOV the civilian never reaches the chopper and
		// the test would be asserting the wrong rule.
		for (const other of [...map.actors]) map.removeActor(other);

		civilian = Models.actors.get(ActorID.MALE_CIVILIAN)!.createAnonymous(
			game.gameFactions.get(FactionID.TheCivilians),
			map.localTime.turnCounter,
		);
		ai = new CivilianAI();
		ai.takeControl(civilian);
		civilian.controller = ai;
	}, 240_000);

	/**
	 * Puts the civilian `distance` tiles from the site, on a tile it can actually
	 * act from, and runs its turn.
	 *
	 * The walkable-tile search is not decoration: the rescue square is in a park,
	 * so a tile ten tiles to its east is as likely to be a wall as a path, and an
	 * actor standing on a wall cannot bump anywhere and the test would be
	 * measuring the map rather than the AI.
	 */
	function act(distance: number): {
		action: ActorAction | null;
		running: boolean;
		at: Point;
	} {
		let spot: Point | null = null;
		// The helper has to *guarantee* the property it is named for, because the
		// distance is the whole point of every caller: `act(4)` is "too near to
		// bother", `act(audioRange + 6)` is "out of earshot". A search that just
		// found some walkable tile near the target was quietly not testing that.
		//
		// It could not, in fact. The window used to be a fixed ±4, which worked only
		// while the site happened to sit where the fixed seed put it; `Feature.ArmyBase`
		// takes a block earlier in the pipeline than the site picker runs, so the
		// site moved and the ±4 window fell off the edge of the map. And a merely
		// *wider* window is not the fix either, because the window is centred on
		// `site.x + distance`: widen it past `distance` and the actor lands back on
		// top of the site, at which point "out of earshot" is measured at 0 tiles.
		// Hence the explicit check, and hence scanning outward until it holds.
		outer: for (let radius = 0; radius <= 40 && spot === null; radius++) {
			for (let dx = -radius; dx <= radius && spot === null; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
					const candidate = new Point(site.x + distance + dx, site.y + dy);
					if (euclideanDistance(candidate, site) < distance) continue;
					if (
						map.isWalkablePoint(candidate) &&
						map.getActorAtPoint(candidate) === null
					) {
						spot = candidate;
						break outer;
					}
				}
			}
		}
		expect(spot, `a walkable tile ${distance} from the site`).not.toBeNull();
		map.placeActor(civilian, spot!);
		const action = ai.getAction(game);
		return { action, running: civilian.isRunning, at: spot! };
	}

	it("a civilian in earshot runs for the chopper", () => {
		// C# `CivilianAI.cs:522-542`. Ten tiles: past the `>= 8` guard, inside the
		// model's own `AudioRange`. The action itself is a bump toward the site, and
		// the two side effects the C# sets are the run and the activity.
		expect(civilian.audioRange, "the fixture's distance is audible").toBeGreaterThanOrEqual(10);
		const { action, running, at } = act(10);
		expect(action).not.toBeNull();
		expect(running, "C# sets IsRunning").toBe(true);
		// It moves *towards* the site rather than merely running, and legally:
		// `ActionMoveStep` keeps its destination private, so the move is observed by
		// performing it and looking at where the actor ended up.
		const step = action as unknown as {
			isLegal(): boolean;
			perform(): void;
		};
		expect(step.isLegal(), "the bump it picked is legal").toBe(true);
		const before = euclideanDistance(at, site);
		step.perform();
		expect(
			euclideanDistance(civilian.location.position, site),
			`${civilian.location.position} should be closer to the chopper than ${at}`,
		).toBeLessThan(before);
	});

	it("does not run for it from closer than 8, or from too far to hear it", () => {
		// Nearer than 8: the C# wants them close enough to defend it, and it stops
		// chasing. Too far: `AudioRange` is the outer gate, and it is the metric of
		// an actor's hearing, so the distance here is Euclidean.
		expect(act(4).running, "4 tiles: already there").toBe(false);
		expect(act(4).action, "4 tiles: nothing to do about the chopper").not.toBeNull();
		const far = civilian.audioRange + 6;
		expect(act(far).running, `${far} tiles: out of earshot`).toBe(false);
	});

	it("does not run for it at night, or from another district", () => {
		expect(act(10).running, "the fixture, in daylight").toBe(true);

		// Night: the chopper has been despawned, so there is nothing to run to.
		map.localTime.turnCounter = atHour(map.localTime.turnCounter, 2);
		expect(map.localTime.isNight, "the clock really is at night").toBe(true);
		expect(act(10).running, "at night").toBe(false);
		map.localTime.turnCounter = atHour(map.localTime.turnCounter, 12);

		// A different map, at the same coordinates.
		const world = game.session.world!;
		let other: GameMap | null = null;
		for (let x = 0; x < world.size && other === null; x++) {
			for (let y = 0; y < world.size && other === null; y++) {
				const m = world.getDistrict(x, y)!.entryMap!;
				if (m !== map) other = m;
			}
		}
		other!.localTime.turnCounter = game.session.worldTime.turnCounter;
		other!.placeActor(civilian, new Point(site.x + 10, site.y));
		expect(ai.getAction(game)).not.toBeNull();
		expect(civilian.isRunning, "another district").toBe(false);
	});
});

// ── A Classic save carrying Still Alive site data ────────────────────────────

describe("Feature.HelicopterRescue: a Classic run cannot be handed a rescue", () => {
	let game: RogueGame;
	let map: GameMap;
	let site: Point;

	beforeEach(async () => {
		game = await generateWorld(RogueGame, RESCUE_SEED, Ruleset.CLASSIC);
		const player = game.player!;
		map = player.location.map!;
		// A clear, walkable spot for the site, so the spawn would succeed if it ran.
		let spot: Point | null = null;
		for (let radius = 6; radius <= 30 && spot === null; radius += 2) {
			for (let dx = -radius; dx <= radius && spot === null; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
					const c = new Point(map.width / 2 + dx, map.height / 2 + dy);
					if (
						map.isWalkablePoint(c) &&
						map.getMapObjectAtPoint(c) === null &&
						map.isWalkablePoint(new Point(c.x + 1, c.y)) &&
						map.isWalkablePoint(new Point(c.x + 2, c.y))
					) {
						spot = c;
						break;
					}
				}
			}
		}
		expect(spot, "a clear 3x1 patch to claim").not.toBeNull();
		site = spot!;
		map.placeActor(player, new Point(site.x, site.y - 1));
		// **The state under test.** A CLASSIC ruleset carrying a landing site: which
		// is what a hand-edited save, or a save written by a build that had the site
		// and a Classic ruleset, looks like. The four `hasFeature` gates outside the
		// worldgen stage exist for exactly this, and without the test below they
		// would be unobservable: a Classic world *cannot* have a site, so every
		// condition after each gate is already false and deleting the gate changes
		// nothing that any other test can see.
		game.session.setHelicopterRescueSite(
			World.CoordToString(
				map.district!.worldPosition.x,
				map.district!.worldPosition.y,
			),
			site,
		);
		expect(game.session.armyHelicopterRescueMap).toBe(map);
		expect(hasFeature(game.session.ruleset, Feature.HelicopterRescue)).toBe(false);
	}, 240_000);

	it("lands nothing on the rescue day", async () => {
		setDay(game, game.session.armyHelicopterRescueDay);
		await game.OnNewDay();
		expect(heliObjects(map), "CLASSIC, even with a site").toEqual([]);
	}, 60_000);

	it("takes nothing away at dusk", async () => {
		// The other three tiles of the site are empty ground, so a spawn-less
		// de-spawn would be invisible here — which is the point. A Classic run's map
		// must come out of `OnNewNight` exactly as it went in, whatever the session
		// claims.
		const before = worldLayout(game);
		game.session.armyHelicopterRescueDay = 9;
		setDay(game, 9);
		await game.OnNewNight();
		expect(worldLayout(game)).toBe(before);
	}, 60_000);

	it("offers no rescue, however hard the player bumps the thing", async () => {
		// Put a helicopter where the site says it is, so the only thing standing
		// between the player and the ending is the gate.
		for (let i = 0; i < 3; i++) {
			map.placeMapObject(
				game.m_TownGenerator.makeObjHelicopter(GameImages.OBJ_HELICOPTER1),
				new Point(site.x + i, site.y),
			);
		}
		game.m_UI.UI_PostKey({ key: "y", keyCode: 89, shift: false, ctrl: false, alt: false });
		await game.DoPlayerBump(game.player!, Direction.S);

		expect(game.m_PlayerWasRescued).toBe(false);
		expect(
			game.m_MessageManager.history.some((m) => m.text.includes("Really escape")),
		).toBe(false);
		expect(
			game.session.scoring.hasCompletedAchievement(AchievementIDs.RESCUED_BY_HELICOPTER),
		).toBe(false);
	}, 60_000);

	it("sends no civilian running for it", () => {
		// The map's own clock has to be on the rescue day too: the AI reads
		// `map.LocalTime.Day`, and a fresh district's local time is day 0 whatever
		// the session says.
		setDay(game, game.session.armyHelicopterRescueDay);
		map.localTime.turnCounter = game.session.worldTime.turnCounter;
		expect(map.localTime.day).toBe(game.session.armyHelicopterRescueDay);
		const civilian = Models.actors.get(ActorID.MALE_CIVILIAN)!.createAnonymous(
			game.gameFactions.get(FactionID.TheCivilians),
			map.localTime.turnCounter,
		);
		const ai = new CivilianAI();
		ai.takeControl(civilian);
		civilian.controller = ai;
		for (const other of [...map.actors]) map.removeActor(other);

		let spot: Point | null = null;
		for (let radius = 9; radius <= 14 && spot === null; radius++) {
			for (let dx = -radius; dx <= radius && spot === null; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
					const c = new Point(site.x + dx, site.y + dy);
					if (map.isWalkablePoint(c) && map.getActorAtPoint(c) === null) {
						spot = c;
						break;
					}
				}
			}
		}
		map.placeActor(civilian, spot!);
		ai.getAction(game);
		expect(civilian.isRunning, "CLASSIC, even with a site").toBe(false);
	}, 60_000);
});
