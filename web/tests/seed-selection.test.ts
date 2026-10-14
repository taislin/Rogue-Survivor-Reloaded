import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DiceRoller } from "@engine/DiceRoller";
import { RogueGame } from "@engine/RogueGame";
import { Rules } from "@engine/Rules";
import { Session } from "@engine/Session";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { NullRogueUI } from "@ui/NullRogueUI";

/**
 * The world seed screen: `RogueGame.HandleSelectSeed`.
 *
 * A run has always *had* a seed — `Session.reset()` rolls one off the clock and
 * the whole city is generated from it — and until now there was no way to see it,
 * let alone choose it. This screen puts that one number in front of the player:
 * pre-filled with the roll the session already made, so a player who does not
 * care presses ENTER and gets exactly the game they always got, and editable, so
 * a player who does care can type the seed of a world they want to replay.
 *
 * ## The three things worth testing here, and none of them is the drawing
 *
 * 1. **The field opens on the session's seed, selected.** Typing must *replace*
 *    the roll rather than append to it — the difference between typing "42" and
 *    getting seed 42 versus seed 1073741823-and-some-more. That is the whole
 *    reason the screen is usable at all, and it is one boolean in the source.
 * 2. **An emptied field is not a seed of 0.** `Number("")` is 0, so a field the
 *    player trimmed by hand would otherwise start a zero-seeded run. Keeping the
 *    roll is what the length check is for.
 * 3. **Confirming reseeds the rules roller, not just the session.** A seed that
 *    only reached `Session.seed` would make the map reproducible and the
 *    gameplay random — half a deterministic run, which `Session.useSeed` argues
 *    at length is worse than none. So the confirm rebuilds `m_Rules`, and the
 *    test asserts it by *rolling*: a roller is seed and state, and the only way
 *    to see which seed it is on is to ask it for a number.
 *
 * Driven with real keys through the real modal loop, the way
 * `tests/ruleset-picker.test.ts` drives the picker above it.
 */

/** A seed the flow can be pinned to, so "what did the screen open on" is known. */
const PINNED = 4242;

/** The first number a freshly seeded roller says. */
const firstRoll = (seed: number): number => new DiceRoller(seed).roll(0, 0x7fffffff);

let ui: NullRogueUI;
let game: RogueGame;

beforeAll(async () => {
	// Before constructing, per `Session.useSeed`: the game's constructor builds
	// `Rules` from the session seed, so a seed applied afterwards would leave the
	// rules roller on whatever the constructor saw.
	Session.useSeed(PINNED);
	ui = new NullRogueUI();
	game = new RogueGame(ui, new NullMusicManager());
	await game.LoadData();
});

beforeEach(() => {
	// Back to the pinned seed every time: `reset()` re-derives it, and with
	// `m_ForcedSeed` set that is always `PINNED`.
	Session.useSeed(PINNED);
	// **And the queue emptied.** A test that stops short of the key it pushed —
	// because the screen it was driving accepted one key earlier — leaves the
	// rest in the queue, and the next test's first wait is handed *that*. The
	// idle cycle has the same hazard in the other direction: it hands back Enter,
	// then Escape, then `n`, then `y`, so a test that pushes nothing gets a
	// different key depending on how many keys the test before it failed to
	// consume. Both are why every test below states its keys and this line runs.
	ui.UI_FlushQueuedKeys();
});

afterEach(() => {
	// The clock-roll test drops the forced seed to get a real one; every other
	// test here needs it back, and so does the next file's `beforeAll` if this
	// one ever stops running in its own process.
	Session.useSeed(PINNED);
	vi.restoreAllMocks();
});

describe("HandleSelectSeed", () => {
	it("opens on the session's seed and keeps it on ENTER", async () => {
		// The pre-fill is the whole "you do not have to care about this" half: the
		// number on screen is the roll `reset()` already made, so pressing through
		// the screen reproduces the game there has always been.
		ui.pushKeys("Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(PINNED);
	});

	it("keeps a clock-derived roll when the player types nothing", async () => {
		// The other half of the pre-fill, and the one that says *random* rather
		// than *constant*: with no forced seed, `reset()` rolls off the clock and
		// the screen must hand that number back untouched.
		Session.useSeed(0);
		Session.get().reset();
		const rolled = Session.get().seed;
		expect(rolled, "reset() rolled something").toBeGreaterThan(0);

		ui.pushKeys("Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(rolled);
	});

	it("replaces the roll with the digits typed, rather than appending to them", async () => {
		// **The headline.** A pre-filled field that appended would turn "42" into
		// a ten-digit number nobody typed, and the player would have no way to
		// enter a short seed at all.
		ui.pushKeys("4", "2", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(42);
	});

	it("appends the digits after the first one", async () => {
		// The other side of the same flag: replace once, then accumulate. A field
		// that replaced on *every* digit would only ever hold one digit.
		ui.pushKeys("1", "2", "3", "4", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(1234);
	});

	it("trims a typed number one character at a time", async () => {
		ui.pushKeys("1", "2", "3", "Backspace", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(12);
	});

	it("clears a field that still holds its roll in one press", async () => {
		// One press, not ten, because the field opens selected: a player who wants
		// to type over a nine-digit roll should not have to delete it first.
		ui.pushKeys("7", "Backspace", "Backspace", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		// "7" was typed, so the first Backspace trims it and the second empties the
		// field — which is the next test's case, reached from the typed side.
		expect(Session.get().seed).toBe(PINNED);
	});

	it("treats an emptied field as 'keep the roll', not as a seed of zero", async () => {
		// `Number("")` is 0, so this is the test that keeps a player who trimmed
		// the field from starting a zero-seeded run by accident.
		ui.pushKeys("Backspace", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(PINNED);
		expect(Session.get().seed).not.toBe(0);
	});

	it("rolls another on R, and keeps the roll it made", async () => {
		// Stubbed rather than observed, so the assertion is a number and not
		// "it changed". `Math.floor(0.5 * 0x7fffffff)` is the roll `R` makes.
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		ui.pushKeys("r", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(Math.floor(0.5 * 0x7fffffff));
	});

	it("lets a digit replace the roll R just made", async () => {
		// A roll the player asked for is still a roll: after `R` the field is
		// selected again, so typing "7" gets seed 7 and not a ten-digit one.
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		ui.pushKeys("r", "7", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(7);
	});

	it("caps the field at nine digits", async () => {
		// The cap is what keeps a typed number inside what the roller's 32-bit
		// state can hold: a tenth digit is dropped rather than folded into a value
		// the player cannot see they typed. (`reset()` can roll ten digits; those
		// are generated, not typed, and nothing caps them.)
		ui.pushKeys("1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(123456789);
	});

	it("accepts the widest seed the field can hold without it wrapping", async () => {
		// The other half of the cap: nine nines is 999,999,999, comfortably inside
		// 2^32, so the number typed is the number the run gets.
		ui.pushKeys("9", "9", "9", "9", "9", "9", "9", "9", "9", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(999999999);
	});

	it("ignores every key that is not a digit, a trim, a roll or a confirm", async () => {
		// A text field that answered to `h` by opening the manual would be a field
		// nobody could type in, so the screen swallows what it does not use rather
		// than passing it on.
		ui.pushKeys("a", "ArrowUp", "ArrowDown", " ", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(PINNED);
	});

	it("cancels on ESCAPE and leaves the seed alone", async () => {
		// Escape *cancels* rather than falling back to the roll: a player who
		// backs out of the new-game flow halfway expects the main menu, and the
		// half-typed seed must not survive the cancel.
		ui.pushKeys("7", "Escape");
		await expect(game.HandleSelectSeed()).resolves.toBe(false);
		expect(Session.get().seed).toBe(PINNED);
	});

	it("reseeds the rules roller with the confirmed seed", async () => {
		// The reason the confirm does more than write the session. `m_Rules` was
		// built from the seed the game object was constructed with, so a seed
		// chosen here would otherwise leave every gameplay roll on the *previous*
		// run's roller: a reproducible map wrapped around an irreproducible game.
		//
		// Asking the roller for a number is the only way to see which seed it is
		// on, which is what makes this an assertion rather than a comment. The
		// roller is put back on the pinned seed first so the two numbers below
		// describe *this* confirm rather than whatever the test above it left.
		game.m_Rules = new Rules(new DiceRoller(PINNED));
		expect(game.m_Rules.roll(0, 0x7fffffff)).toBe(firstRoll(PINNED));

		ui.pushKeys("4", "2", "Enter");
		await expect(game.HandleSelectSeed()).resolves.toBe(true);
		expect(Session.get().seed).toBe(42);
		expect(game.m_Rules.roll(0, 0x7fffffff)).toBe(firstRoll(42));
	});
});

describe("the flow that owns it", () => {
	/** `HandleNewCharacterDetails`, captured. Public, so reached directly. */
	interface DetailsSpy {
		calls: number;
		roller: DiceRoller | null;
	}

	/**
	 * Replaces the character screen with a recorder.
	 *
	 * Deliberately *not* a wrapper round the real screen: the real one spends the
	 * roller it is given, and the assertion below is that roller's first roll. A
	 * wrapper would hand back a roller already advanced and the test would be
	 * comparing against a number the screen moved.
	 */
	function spyOnDetails(): DetailsSpy {
		const spy: DetailsSpy = { calls: 0, roller: null };
		game.HandleNewCharacterDetails = async (roller: DiceRoller) => {
			spy.calls++;
			spy.roller = roller;
			return true;
		};
		return spy;
	}

	function restoreDetails(): void {
		game.HandleNewCharacterDetails = RogueGame.prototype.HandleNewCharacterDetails;
	}

	it("hands the character screens a roller seeded from the confirmed one", async () => {
		// The seed used to be allocated before the pickers ran, which was harmless
		// while nothing could change it. Now that the player can, the roller has to
		// be built from what they confirmed — or a run started on 42 would roll its
		// character, and every `*Random*` layer with it, off the seed `reset()`
		// threw away.
		const spy = spyOnDetails();
		try {
			// ENTER takes the ruleset and mode defaults, then digits and ENTER on
			// the seed screen.
			ui.pushKeys("Enter", "4", "2", "Enter");
			await expect(game.HandleNewCharacter()).resolves.toBe(true);
		} finally {
			restoreDetails();
		}
		expect(spy.calls, "the character screen was reached").toBe(1);
		expect(spy.roller!.roll(0, 0x7fffffff)).toBe(firstRoll(42));
		expect(Session.get().seed).toBe(42);
	});

	it("leaves that roller fresh however many rolls R made", async () => {
		// `R` rolls off `Math.random` rather than off anything the run owns, and
		// this is where that is observable: two presses of it, and the roller the
		// character is built from is still the *first* roll of the confirmed seed.
		// Had `R` spent from the run's own dice, the seed would be the same and
		// every roll after it would have moved.
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const rolled = Math.floor(0.5 * 0x7fffffff);

		const spy = spyOnDetails();
		try {
			ui.pushKeys("Enter", "r", "r", "Enter");
			await expect(game.HandleNewCharacter()).resolves.toBe(true);
		} finally {
			restoreDetails();
		}
		expect(Session.get().seed).toBe(rolled);
		expect(spy.roller!.roll(0, 0x7fffffff)).toBe(firstRoll(rolled));
	});

	it("is not skipped by the quick start, which is a shortcut for the character", async () => {
		// Shift+ENTER on the picker says "these settings, random *character*". A
		// seed the player typed is a setting — the one thing on this screen worth
		// an extra keypress — so the seed screen stays in front of it.
		const quickStart = vi.fn();
		const g = game as unknown as {
			applyQuickStartCharacter(roller: DiceRoller): void;
		};
		const realQuickStart = g.applyQuickStartCharacter.bind(game);
		g.applyQuickStartCharacter = (roller: DiceRoller) => quickStart(roller);
		const details = spyOnDetails();
		try {
			ui.pushShiftKey("Enter");
			ui.pushKeys("4", "2", "Enter");
			await expect(game.HandleNewCharacter()).resolves.toBe(true);
		} finally {
			g.applyQuickStartCharacter = realQuickStart;
			restoreDetails();
		}
		expect(details.calls, "the character screen was skipped").toBe(0);
		expect(quickStart, "the quick-start character was made instead").toHaveBeenCalledTimes(1);
		expect(Session.get().seed).toBe(42);
	});

	it("aborts the flow when the seed screen is cancelled", async () => {
		// Escape on any screen of the flow backs the whole run out, and this one
		// is no exception: nothing after it may run.
		const details = spyOnDetails();
		try {
			ui.pushKeys("Enter", "Escape");
			await expect(game.HandleNewCharacter()).resolves.toBe(false);
		} finally {
			restoreDetails();
		}
		expect(details.calls).toBe(0);
		expect(Session.get().seed).toBe(PINNED);
	});
});
