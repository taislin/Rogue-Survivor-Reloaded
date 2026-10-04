import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Session } from "@engine/Session";
import { AdvisorHint } from "@engine/GameHints";
import { Options } from "@engine/GameOptions";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameItems } from "@gameplay/GameItems";

/**
 * The advisor hint banner, and the bug where ESC never closed the last one.
 *
 * ## The reported shape
 *
 * "ESC still does not close the hints. If there are several it moves on to the next,
 * but the last one never clears."
 *
 * That is exactly right, and it is why it survived: ESC *did* work. It set
 * `m_AdvisorHintPending` back to -1, which is precisely the condition that lets the
 * next hint be picked up, so for every hint but the last the banner visibly
 * changed. On the last one `GetAdvisorFirstAvailableHint` returned -1 — nothing left
 * to show — and the teardown branch tested only `!isAdvisorEnabled`, so it fell
 * through and left the box on screen permanently.
 *
 * A defect that shows as "works, works, works, then doesn't" is very hard to see by
 * playing and impossible to reach without exhausting the whole queue.
 *
 * `RogueGame.updateAdvisorHintBanner` is that branch lifted out of the ~400-line
 * play loop, which is what let it be driven here at all. The loop's structure is
 * what hid the defect.
 */

let game: RogueGame;
let ui: NullRogueUI;

/** The banner's private state, which these tests read. */
interface Banner {
	m_HintAvailableOverlay: { lines: string[] | null } | null;
	m_AdvisorHintPending: number;
	HasOverlay(o: unknown): boolean;
}
const banner = (g: RogueGame): Banner => g as unknown as Banner;

/** What the play loop does on ESC, verbatim — nothing more, nothing less. */
function pressEscapeOnBanner(): void {
	banner(game).m_AdvisorHintPending = -1;
}

/** True while a hint is up. */
const bannerUp = (): boolean => banner(game).m_HintAvailableOverlay?.lines != null;

beforeAll(async () => {
	new GameActors();
	new GameItems();
	new GameTiles();
	Session.useSeed(4242);
	ui = new NullRogueUI();
	game = new RogueGame(ui, new NullMusicManager());
	await game.LoadData();
});

beforeEach(async () => {
	// The given-hints store is module state, and every hint the banner shows is
	// marked given as it is displayed — so a test that shows one hint changes what
	// the next test sees. Reset through the game's own path (`R` on the hints
	// screen) rather than reaching into the store, which would make these tests
	// depend on a seam that does not exist.
	ui.pushKeys("r", "Escape");
	await game.HandleHintsScreen();
	Options.isAdvisorEnabled = true;

	// A fresh banner: `m_HintAvailableOverlay` outlives the frame, so a leftover
	// would otherwise read as this test's own.
	const b = banner(game);
	b.m_HintAvailableOverlay = null;
	b.m_AdvisorHintPending = -1;
});

/**
 * A bare floor map with a living player on it.
 *
 * Which hints that makes applicable is deliberately not assumed. The first version
 * of this file arranged the world so that exactly one hint applied, on the reasoning
 * that an empty floor has no enemies, doors, items, followers or corpses — and
 * `AdvisorHint.MOUSE_LOOK` is applicable regardless of any of that, so the
 * arrangement did not hold and three tests failed for the wrong reason. Draining the
 * real queue is both simpler and closer to what a player does.
 */
function newWorld(): void {
	const map = new GameMap(1234, "advisor banner", 30, 30);
	const floor = Models.tiles.get(TileID.FLOOR_CONCRETE);
	for (let x = 0; x < 30; x++)
		for (let y = 0; y < 30; y++) map.setTileModelAt(x, y, floor);
	const player = new Actor(
		Models.actors.get(ActorID.MALE_CIVILIAN),
		new Faction("Testers", "tester"),
		"you",
	);
	player.controller = new PlayerController();
	map.placeActor(player, new Point(10, 10));
	game.m_Player = player;
}

/**
 * Reads and dismisses every hint this world makes available, the way a player does.
 *
 * Bounded by the hint count rather than looping forever: if nothing ever drains,
 * that is a failure worth reporting rather than hanging on.
 */
function exhaustAvailableHints(): number {
	let dismissed = 0;
	while (dismissed <= AdvisorHint._COUNT) {
		game.updateAdvisorHintBanner();
		if (banner(game).m_AdvisorHintPending < 0) break; // queue is empty
		pressEscapeOnBanner();
		dismissed++;
	}
	return dismissed;
}

describe("the advisor banner", () => {
	beforeEach(newWorld);

	it("shows a hint, marked given as it appears", () => {
		game.updateAdvisorHintBanner();
		const b = banner(game);
		expect(b.m_AdvisorHintPending, "no hint was picked up").toBeGreaterThanOrEqual(0);
		expect(b.m_HintAvailableOverlay?.lines?.join("\n")).toContain("HINT :");
		expect(b.m_HintAvailableOverlay?.lines?.join("\n")).toContain("<ESC to close>");
	});

	it("keeps showing the same hint while it is pending", () => {
		// The guard that stops hints flashing past unread: a hint is marked given
		// the moment it is displayed, so without the `pending < 0` check the next
		// frame would overwrite it before it had been read.
		game.updateAdvisorHintBanner();
		const first = banner(game).m_AdvisorHintPending;
		game.updateAdvisorHintBanner();
		game.updateAdvisorHintBanner();
		expect(banner(game).m_AdvisorHintPending).toBe(first);
		expect(bannerUp()).toBe(true);
	});

	it("a banner that is still pending is NOT torn down mid-read", () => {
		// Every frame while a player reads a hint lands on this path. The fix for
		// the bug below must not turn it into "the hint flashes and vanishes".
		game.updateAdvisorHintBanner();
		expect(banner(game).m_AdvisorHintPending).toBeGreaterThanOrEqual(0);
		game.updateAdvisorHintBanner();
		expect(bannerUp()).toBe(true);
	});

	it("ESC shows the next hint when there is one — the half that worked", () => {
		const first = ((): number => {
			game.updateAdvisorHintBanner();
			const p = banner(game).m_AdvisorHintPending;
			expect(p, "precondition: a hint is up").toBeGreaterThanOrEqual(0);
			return p;
		})();
		pressEscapeOnBanner();
		game.updateAdvisorHintBanner();
		const b = banner(game);
		expect(b.m_AdvisorHintPending, "the dismissed hint came straight back").not.toBe(
			first,
		);
		expect(bannerUp(), "no hint replaced it, so there was no successor").toBe(true);
	});

	it("ESC on the LAST hint takes the banner down — the reported bug", () => {
		const dismissed = exhaustAvailableHints();
		expect(
			dismissed,
			"no hint was ever shown, so this test would pass without proving anything",
		).toBeGreaterThan(1);
		expect(banner(game).m_AdvisorHintPending, "the queue did not drain").toBe(-1);

		// The last ESC has already happened above. This is the frame that used to
		// leave the banner on screen for good: there is nothing left to show, and
		// with only the advisor-off test in the teardown branch nothing took the box
		// down.
		game.updateAdvisorHintBanner();
		expect(
			bannerUp(),
			"the banner survived ESC on the last hint - it is still on the overlay stack",
		).toBe(false);
		expect(banner(game).m_HintAvailableOverlay?.lines).toBe(null);
	});

	it("stays down once the queue is empty", () => {
		// The other half: the fix must be a teardown, not a one-frame flicker.
		exhaustAvailableHints();
		for (let i = 0; i < 5; i++) game.updateAdvisorHintBanner();
		expect(bannerUp()).toBe(false);
	});

	it("shows nothing at all when the advisor is switched off", () => {
		Options.isAdvisorEnabled = false;
		game.updateAdvisorHintBanner();
		expect(banner(game).m_AdvisorHintPending).toBe(-1);
		expect(bannerUp()).toBe(false);
	});

	it("does not offer a hint to a dead player or an undead one", () => {
		// The guard the extraction had to keep: `m_Player` null, dead, or undead all
		// skip the banner entirely.
		const b = banner(game);
		game.m_Player!.isDead = true;
		game.updateAdvisorHintBanner();
		expect(bannerUp()).toBe(false);
		expect(b.m_AdvisorHintPending).toBe(-1);
	});
});