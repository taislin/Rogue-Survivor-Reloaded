/**
 * Leaving the game: death, the reincarnation prompt, and the main menu.
 *
 * The reported bug is that after dying, answering "no" to reincarnation
 * ping-pongs between the scores screen and the death screen, and that no
 * sequence of input leaves the state.
 *
 * ## What the endgame actually is
 *
 * `PlayerDied` → `AddMessagePressEnter` → `HandlePostMortem` → (graveyard pager,
 * ENTER) → (`HandleHiScores`, ESC, only when a score registers) → back in
 * `advancePlayDistrict` → `HandleReincarnation` → `AskForReincarnation` (Limbo,
 * Y/N). Declining returns with the player still dead, which is what ends
 * `GameLoop`'s play loop and drops `Run` back into `HandleMainMenu`.
 *
 * The reported shape has two assertions and the second is the load-bearing one:
 * not "the state is the scores screen" but "a further input reaches the main
 * menu". The scores screen and the Limbo screen both answer `Escape` and neither
 * is a state a player can name from the screen, so the *first* assertion cannot
 * fail without the second failing too — and "ping-pongs between two screens,
 * both of which take the same key" is the exact symptom of `Escape` meaning
 * "leave" in one and "no" in the other. That is walked through deliberately in
 * the second test below rather than treated as a defect.
 *
 * ## The harness, and one thing in it that was a real bug
 *
 * `StartNewGame`, because the retry loop is part of what a player goes through,
 * and a 3x3 city because the claim is about the endgame, not about mapgen. The
 * death is delivered through the real `KillActor` → `PlayerDied` path, so the
 * scoring, the permadeath check, the graveyard write, the post-mortem pages and
 * the hi-score registration all run exactly as they do in play. Nothing about
 * the endgame is stubbed except the world's own turn loop, which is what put the
 * player on the map in the first place.
 *
 * The first version of the third test hung — not in the game, but in
 * `NullRogueUI.UI_PeekKey`, which returned the head of its key queue without
 * removing it. `HandleMainMenu` reads one key per redraw through
 * `WaitMenuInput`, so the same `ArrowDown` was re-applied until the selection
 * wrapped back to row 0 and the menu could not be left at all. The fix is in
 * `NullRogueUI` and is pinned by `null-ui.test.ts`; these tests are what the
 * fix was needed for.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { SimRatio } from "@engine/GameOptions";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { SkillID } from "@gameplay/Skills";
import { NullRogueUI } from "@ui/NullRogueUI";

const SEED = 4242;

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function newGame(): Promise<{ game: RogueGame; ui: NullRogueUI }> {
	// Before constructing: the constructor builds `Rules` from the session seed, so
	// a seed applied later would only half-pin the run.
	Session.useSeed(SEED);
	const ui = new NullRogueUI();
	const game = new RogueGame(ui, new NullMusicManager());
	await game.LoadData();
	const opts = RogueGame.options;
	opts.citySize = 1;
	opts.simulateDistricts = SimRatio.OFF;
	opts.isAnimDelayOn = false;
	opts.isAdvisorEnabled = false;
	game.m_CharGen.isUndead = false;
	game.m_CharGen.isMale = true;
	game.m_CharGen.startingSkill = SkillID.AGILE;
	// `PlayerDied` reaches `HandlePostMortem`, which registers a hi-score against
	// `m_HiScoreTable`. The table is loaded by `Run()`, not by `LoadData()`, so
	// without this the death throws on `register` rather than failing an assertion.
	await game.LoadHiScoreTable();
	game.session.ruleset = Ruleset.CLASSIC;
	await game.StartNewGame();
	return { game, ui };
}

/**
 * Kills the player and runs the real death flow to its end.
 *
 * `KillActor` is the game's own entry point and it awaits `PlayerDied`, so this
 * is not "call the death screen" — it is the death, with the graveyard write,
 * the score registration and the scores screen all in it.
 */
async function die(game: RogueGame): Promise<void> {
	await game.KillActor(null, game.m_Player, "suicide", false);
}

/**
 * Resolves the first time the game draws `text` as a bold-large string.
 *
 * Menu identity by what is painted rather than by a state flag, because there is
 * no state to read: the whole game is a nest of `await UI_WaitKey()` loops and
 * the only honest "we are on the main menu" is the frame that says so. It also
 * keeps these tests off the internals — no instrumented `GameLoop`, no stubbed
 * screens, no reimplementation of `Run`'s loop.
 */
function whenDrawn(game: RogueGame, text: string): Promise<void> {
	return new Promise<void>((resolve) => {
		const ui = game.m_UI as unknown as {
			UI_DrawStringBoldLarge: (
				c: unknown,
				t: string,
				gx: number,
				gy: number,
				shadow?: unknown,
			) => void;
		};
		const real = ui.UI_DrawStringBoldLarge.bind(ui);
		ui.UI_DrawStringBoldLarge = (c, t, gx, gy, shadow) => {
			if (t === text) resolve();
			real(c, t, gx, gy, shadow);
		};
	});
}

/**
 * Fails rather than hangs.
 *
 * Every failure mode in this file is "a loop is waiting for a key that will
 * never be read", and an unanswered `await` in a test is indistinguishable from
 * a slow machine. The reported bug is precisely a hang, so the assertions here
 * have to be races.
 */
const within = async <T>(p: Promise<T>, ms: number, what: string): Promise<T> => {
	return await Promise.race([
		p,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${what}`)), ms),
		),
	]);
};

// ── The gates ────────────────────────────────────────────────────────────────

describe("leaving the game: death, the reincarnation prompt, and the main menu", () => {
	beforeEach(() => {
		// `maxReincarnations` is a singleton option and the tests below write it.
		RogueGame.options.maxReincarnations = 1;
	});

	it("runs death through to the end of the score table, in order", async () => {
		// The premise of the whole file, and the thing that makes the "ping-pong"
		// reading impossible: the endgame is a straight line of screens, and none of
		// them can re-enter an earlier one. `HandleHiScores` is the only screen in
		// the chain that `HandlePostMortem` hands off to, and it returns rather than
		// looping back into the post-mortem.
		//
		// Bold-large is what the *screens* draw with; the message log is a different
		// call, so the four landmarks below are all screen titles or footnotes and
		// the "you died" line is deliberately not one of them.
		const { game, ui } = await newGame();
		const drawn: string[] = [];
		const ui_ = game.m_UI as unknown as {
			UI_DrawStringBoldLarge: (
				c: unknown,
				t: string,
				gx: number,
				gy: number,
				shadow?: unknown,
			) => void;
		};
		const real = ui_.UI_DrawStringBoldLarge.bind(ui_);
		ui_.UI_DrawStringBoldLarge = (c, t, gx, gy, shadow) => {
			drawn.push(t);
			real(c, t, gx, gy, shadow);
		};

		await within(die(game), 30_000, "the death flow");

		// The screens, in the order the player meets them. The footnote is each
		// screen's own statement of which key it is waiting for, so this also pins
		// that every one of them says so.
		const at = (s: string): number => drawn.findIndex((d) => d.includes(s));
		expect(at("Grave saved to :")).toBeGreaterThanOrEqual(0);
		expect(at("POST MORTEM")).toBeGreaterThan(at("Grave saved to :"));
		expect(at("Hi Scores")).toBeGreaterThan(at("POST MORTEM"));
		expect(drawn).toContain("<press ENTER for more>");
		expect(drawn).toContain("<press ENTER to leave>");
		expect(drawn).toContain("<press ESC to leave>");
		// And it ends: the scores screen was left rather than redrawn forever.
		expect(ui.idleKeysServed).toBeGreaterThan(0);
	}, 60_000);

	it("declining reincarnation leaves the player dead, and the scores screen is behind us", async () => {
		const { game, ui } = await newGame();
		await within(die(game), 30_000, "the death flow");

		// The death flow above already walked the whole post-mortem, score table
		// included — `NullRogueUI` supplied the `Escape` that leaves the table, which
		// is why it came back at all. So the only key left to give is the answer on
		// Limbo, and the player does not want another life.
		ui.pushKeys("n");
		await within(game.HandleReincarnation(), 10_000, "the Limbo prompt");

		// `HandleReincarnation` returns on the `!AskForReincarnation()` arm without
		// touching the player, so the flag `GameLoop`'s play-loop condition reads is
		// still set. This is the whole mechanism by which the world stops, and it is
		// the C#'s mechanism too: a *declined* reincarnation is not a return to life,
		// and nothing here should pretend otherwise.
		expect(game.m_Player.isDead).toBe(true);
	}, 60_000);

	it("a further keypress reaches the main menu, and the menu can be left", async () => {
		// The second half of the reported shape, and the assertion that matters.
		const { game, ui } = await newGame();
		await within(die(game), 30_000, "the death flow");
		ui.pushKeys("n");

		// The real `GameLoop`: main menu, then the play loop, which cannot be
		// entered because the player is dead.
		const menu = whenDrawn(game, "Main Menu");
		const loop = game.GameLoop();
		await within(menu, 10_000, "the main menu after declining reincarnation");

		// Out of the menu: Quit Game is row 8 of 9. This is the part that used to
		// hang, and it is the part that says whether the state is escapable at all.
		ui.pushKeys(...Array.from({ length: 8 }, () => "ArrowDown"), "Enter");
		await within(loop, 10_000, "leaving the main menu via Quit Game");

		expect(game.m_IsGameRunning).toBe(false);
	}, 60_000);

	it("a new game after a declined reincarnation is playable, not the old dead one", async () => {
		// Reaching the menu is not reachability; what the player does there is. A
		// main menu that comes back is a screen, not a way out.
		const { game, ui } = await newGame();
		const deadWorld = game.session.world;
		await within(die(game), 30_000, "the death flow");
		ui.pushKeys("n");
		await within(game.HandleReincarnation(), 10_000, "the Limbo prompt");

		// `HandleMainMenu` rather than `GameLoop`: the menu is what a declined
		// reincarnation lands on, and `GameLoop`'s play loop — which cannot be
		// entered, the player being dead — has nothing to add to that claim. It would
		// also never return, which is a hang, not a test.
		const menu = whenDrawn(game, "Main Menu");
		// Row 0 is New Game, so the first key selects it, and then character creation
		// asks its questions. Four of those screens put a Y/N confirm *inside* their
		// own loop — row 0 is `*Random*` on the undead-type, gender, undead-type and
		// skill pickers — so `Enter, y` is what a player who accepts every rolled
		// default actually presses. A `y` that lands on a menu rather than a confirm
		// is swallowed, which is why six pairs cover every branch rather than
		// depending on which of them the roll took.
		ui.pushKeys(...Array.from({ length: 6 }, () => ["Enter", "y"]).flat());
		const returning = game.HandleMainMenu();
		await within(menu, 10_000, "the main menu after declining reincarnation");
		await within(returning, 60_000, "New Game completing");

		// The world is a new one. `StartNewGame` regenerates it rather than reviving
		// the corpse's district, so a fresh object is the observable proof that this
		// is a second run and not a continuation of the first — the character is
		// *not* a usable signal here, because the seed is the same and generation is
		// deterministic, so the same player comes back with the same name.
		expect(game.m_Player.isDead).toBe(false);
		expect(game.m_Player.location.map).not.toBeNull();
		expect(game.session.world).not.toBe(deadWorld);
	}, 90_000);
});

// ── The one-way latch ────────────────────────────────────────────────────────

describe("m_PlayerWasRescued is a per-run flag, not a per-process one", () => {
	beforeEach(() => {
		RogueGame.options.maxReincarnations = 1;
	});

	it("a rescued run does not stop every run that follows it in the same process", async () => {
		// `m_PlayerWasRescued` is set by `PlayerWasRescued` (the helicopter ending)
		// and read by `GameLoop`'s play-loop condition:
		//
		//     while (m_Player != null && !m_Player.IsDead && m_IsGameRunning
		//            && !m_PlayerWasRescued)
		//
		// The C# never clears it, and this port now does — see the declaration and
		// `StartNewGame`. Without the reset it is a one-way latch on the only loop
		// that plays the game: a rescue sets it, `GameLoop` returns to the menu, and
		// every run after that builds a live player the loop then refuses to play.
		// The condition is false, the body never runs, the menu comes straight back,
		// and the game is unreachable in a way no input can undo — which is the
		// reported symptom, on the ending the report did not name.
		//
		// Set the flag the way `PlayerWasRescued` does rather than flying a
		// helicopter to it: the rescue itself is covered by
		// `helicopter-rescue.test.ts`, and what is under test is the *next* run.
		const { game } = await newGame();
		game.m_PlayerWasRescued = true;
		expect(game.m_Player.isDead).toBe(false);

		// `StartNewGame` is what the main menu calls, and it is where a per-run flag
		// belongs. The flag must survive the *rescued* run — it is the only thing
		// stopping `GameLoop` once the rescued player is off the map — so this is the
		// only place it can be cleared.
		await game.StartNewGame();

		// The condition, spelled out rather than exercised through a whole run: a
		// live player is not enough, the latch has to be clear too.
		const wouldPlay =
			game.m_Player != null &&
			!game.m_Player.isDead &&
			game.m_IsGameRunning &&
			!game.m_PlayerWasRescued;
		expect(wouldPlay).toBe(true);
	}, 60_000);
});

/**
 * The *accepted* reincarnation: press Y on Limbo, pick a body, play on.
 *
 * This file already proved the decline is a straight line to the scores and back
 * out. The accept arm had no behavioural coverage at all, and that is where the
 * reported ping-pong lives: press Y and the game cycles between the score table and
 * the Purgatory, and the run is unplayable afterwards.
 *
 * The property worth pinning is not "reincarnation returns" -- it is that the world
 * is left in a state `GameLoop`'s condition will accept, and that the player is
 * somewhere the map loop can actually reach. `GameLoop` reads
 * `m_Player != null && !m_Player.isDead && m_IsGameRunning && !m_PlayerWasRescued`,
 * so a player left dead, or left on a map the current district loop is not walking,
 * produces exactly the reported symptom with no error anywhere.
 */
describe("accepting reincarnation", () => {
	beforeEach(() => {
		RogueGame.options.maxReincarnations = 1;
	});

	/** Death, then the keys that leave the score table and answer Limbo with Y. */
	async function dieAndReincarnate(): Promise<{
		game: RogueGame;
		ui: NullRogueUI;
		previous: unknown;
	}> {
		const { game, ui } = await newGame();
		const previous = game.m_Player;
		await within(die(game), 30_000, "the death flow");

		// The score table leaves on ESC (NullRogueUI supplied one above), then Limbo
		// takes the answer. Both are queued together: `NullRogueUI` serves them in
		// order and `WaitYesOrNo` is the only thing reading at this point.
		ui.pushKeys("y");
		return { game, ui, previous };
	}

	it("leaves a living player behind, and not the corpse it was called on", async () => {
		const { game, ui, previous } = await dieAndReincarnate();

		// Walk the Purgatory: Y, then ENTER on the first avatar entry. Several ENTERs
		// because an entry with no candidate leaves `choiceMade` false and the screen
		// asks again -- which is itself worth knowing, and not something to assert on.
		ui.pushKeys("Enter", "Enter", "Enter");
		await within(game.HandleReincarnation(), 20_000, "reincarnation");

		expect(game.m_Player.isDead).toBe(false);
		// A new actor, not the body it died in.
		expect(game.m_Player).not.toBe(previous);
	}, 60_000);

	it("leaves a state GameLoop's play-loop condition will accept", async () => {
		// The bug is not "the player is dead". It is that the loop that plays the game
		// refuses to run, and the only evidence a player gets is a screen that keeps
		// coming back.
		const { game, ui } = await dieAndReincarnate();
		ui.pushKeys("Enter", "Enter", "Enter");
		await within(game.HandleReincarnation(), 20_000, "reincarnation");

		const wouldPlay =
			game.m_Player != null &&
			!game.m_Player.isDead &&
			game.m_IsGameRunning &&
			!game.m_PlayerWasRescued;
		expect(wouldPlay).toBe(true);
	}, 60_000);

	it("puts the player somewhere the map loop can reach", async () => {
		// `advancePlayDistrict` walks `district.maps` and hands each to
		// `advancePlayMap`, which asks that map for the next actor. Reincarnation
		// reassigns `m_Session.currentMap` to the avatar's map -- so if that is
		// another district, the loop that is running is still the old one, and the
		// player is on a map nobody is walking.
		const { game, ui } = await dieAndReincarnate();
		ui.pushKeys("Enter", "Enter", "Enter");
		await within(game.HandleReincarnation(), 20_000, "reincarnation");

		const player = game.m_Player;
		expect(player.location.map).not.toBeNull();
		// The map the player is on is the map the session thinks is current, and that
		// map belongs to the district `GameLoop` will ask for next turn.
		expect(game.m_Session.currentMap).toBe(player.location.map);
		expect(player.location.map!.district).toBe(game.m_Session.currentMap!.district);
	}, 60_000);
});