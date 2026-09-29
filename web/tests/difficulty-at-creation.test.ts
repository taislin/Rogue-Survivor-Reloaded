/**
 * `Feature.DifficultyAtCreation` — the difficulty screen, and the options it is
 * taken out of.
 *
 * Still Alive, Release 7-4. The C# original is
 * `HandleNewCharacterDifficulty(out int chosenDay)` at `RogueGame.cs:3782`, called
 * from `RogueGame.cs:2884`; the other half is a deleted block of the mid-game
 * option list at `RogueGame.cs:1557-1582`.
 *
 * **The name says "locked mid-game" and the C# does not lock anything.** What it
 * does is delete the rows from the mid-game list, under a comment saying they
 * moved to character creation. Neither `HandleOptions` nor
 * `HandleNewCharacterDifficulty` reads its `ingame` parameter — the C# comments
 * the parameter as unused at `RogueGame.cs:1509` — so there is no runtime refusal
 * anywhere, just a row that is not there. The tests here assert *that*, and the
 * screen's own tests are about what a row that is there does.
 *
 * The screen is a modal menu like `HandleNewCharacterSkill`, so it is driven
 * through `NullRogueUI.pushKeys` exactly as `tests/ruleset-picker.test.ts` drives
 * `HandleSelectRuleset` — real keys through the real loop, not a private method
 * called with a hand-picked argument.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { DiceRoller } from "@engine/DiceRoller";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import {
	DIFFICULTY_OPTIONS,
	GameOptions,
	OptionIDs,
	Options,
	OptionsCategory,
	RESCUE_DAY_RANDOM,
	RESCUE_DAY_RANDOM_MAX,
	RESCUE_DAY_RANDOM_MIN,
	stepGameOption,
	ZupDays,
} from "@engine/GameOptions";
import { RogueGame } from "@engine/RogueGame";
import { GameMode, Ruleset, Session } from "@engine/Session";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { OptionsScreen } from "@ui/OptionsScreen";
import { NullRogueUI } from "@ui/NullRogueUI";

let ui: NullRogueUI;
let game: RogueGame;

beforeAll(async () => {
	// Before constructing, per `Session.useSeed`: the constructor builds `Rules`
	// from the session seed.
	Session.useSeed(4242);
	ui = new NullRogueUI();
	game = new RogueGame(ui, new NullMusicManager());
	await game.LoadData();
});

afterEach(() => {
	Session.get().ruleset = Ruleset.CLASSIC;
	Session.get().gameMode = GameMode.GM_STANDARD;
	Session.get().armyHelicopterRescueDay = GameOptions.DEFAULT_RESCUE_DAY;
	Options.resetToDefaultValues(OptionsCategory.ALL);
});

/** The rows this screen shows for `mode`, in order. */
function difficultyRows(mode: GameMode): OptionIDs[] {
	return (
		game as unknown as { difficultyOptionList(m: GameMode): OptionIDs[] }
	).difficultyOptionList(mode);
}

/** The rows the mid-game options screen offers, under the session's ruleset. */
function optionsScreenRows(): OptionIDs[] {
	return (new OptionsScreen(new NullRogueUI()) as unknown as { list: OptionIDs[] })
		.list;
}

/** `ArrowDown` × n, as a player would press it. */
const down = (n: number): string[] => new Array<string>(n).fill("ArrowDown");

/**
 * The keys that walk the whole of `HandleNewCharacter` to the difficulty screen,
 * for a living male in standard mode under Still Alive.
 *
 * Spelled out rather than left to the idle key cycle, because the idle cycle
 * hands back Escape every fourth key and `HandleNewCharacterRace` then cancels —
 * so an "unattended" run never reaches the difficulty screen at all, and a test
 * asserting that it does would be asserting nothing. Each group is one screen:
 * ruleset (row 1 = Still Alive), game mode (standard), race (row 1 = Living,
 * which is the one that does not then ask Y/N — row 0 is *Random* and does),
 * gender (row 1 = Male), skill (row 0 = *Random*, then `y` for the Y/N).
 */
const FLOW_TO_DIFFICULTY: string[] = [
	"ArrowDown",
	"Enter",
	"Enter",
	"ArrowDown",
	"Enter",
	"ArrowDown",
	"Enter",
	"Enter",
	"y",
];

/** The same, for classic: the ruleset screen takes its row 0 and goes no further. */
const FLOW_CLASSIC: string[] = ["Enter", ...FLOW_TO_DIFFICULTY.slice(2)];

/**
 * Runs the whole flow, counting how many times the difficulty screen was reached.
 *
 * The count and the flow's own answer are both returned because either alone can
 * pass for the wrong reason: `0` calls is what a flow that *aborted early* looks
 * like just as much as what a flow that correctly skipped the screen looks like.
 */
async function runFlow(keys: string[], ruleset: Ruleset): Promise<{ calls: number; done: boolean }> {
	Session.get().ruleset = ruleset;
	const real = game.HandleNewCharacterDifficulty.bind(game);
	let calls = 0;
	game.HandleNewCharacterDifficulty = async (roller: DiceRoller) => {
		calls++;
		return real(roller);
	};
	try {
		ui.pushKeys(...keys);
		// `done` first and `calls` second: an object literal evaluates its
		// properties in order, so `{ calls, done: await ... }` reads the counter
		// *before* the flow has run and reports a flat zero.
		const done = await game.HandleNewCharacter();
		return { calls, done };
	} finally {
		game.HandleNewCharacterDifficulty = real;
	}
}

/** Run the difficulty screen with `keys`, and give back what it returned. */
async function screen(
	keys: string[],
	roller = new DiceRoller(1),
): Promise<{ ok: boolean; rescueDay: number }> {
	ui.pushKeys(...keys);
	return game.HandleNewCharacterDifficulty(roller);
}

describe("the registry", () => {
	it("is on for Still Alive and off for classic", () => {
		expect(hasFeature(Ruleset.STILL_ALIVE, Feature.DifficultyAtCreation)).toBe(true);
		expect(hasFeature(Ruleset.CLASSIC, Feature.DifficultyAtCreation)).toBe(false);
	});
});

describe("the screen opens, and can be cancelled", () => {
	it("returns ok:false on Escape", async () => {
		await expect(screen(["Escape"])).resolves.toEqual({
			ok: false,
			rescueDay: GameOptions.DEFAULT_RESCUE_DAY,
		});
	});

	it("returns ok:true on Enter", async () => {
		await expect(screen(["Enter"])).resolves.toEqual({
			ok: true,
			rescueDay: GameOptions.DEFAULT_RESCUE_DAY,
		});
	});

	it("reads keys rather than falling straight through the loop", async () => {
		// A cancel test alone proves nothing about the loop: a screen that ignored
		// every key and returned `false` would pass it. Accepting instead is what
		// says the key was read, and it is the one key the two answers differ on.
		expect((await screen(["Enter"])).ok, "Enter accepts").toBe(true);
		expect((await screen(["Escape"])).ok, "Escape cancels").toBe(false);
	});
});

describe("a difficulty option actually changes", () => {
	const rowOf = (id: OptionIDs): number =>
		difficultyRows(GameMode.GM_STANDARD).indexOf(id);

	it("steps max civilians on the row the cursor is on", async () => {
		const before = Options.maxCivilians;
		expect(rowOf(OptionIDs.GAME_MAX_CIVILIANS), "the row is on the screen").toBeGreaterThan(0);
		const result = await screen([...down(rowOf(OptionIDs.GAME_MAX_CIVILIANS)), "ArrowRight", "Enter"]);
		expect(result.ok).toBe(true);
		// +5 per press, the C#'s step (`RogueGame.cs:3985`).
		expect(Options.maxCivilians).toBe(before + 5);
	});

	it("steps a boolean row by toggling it, which is a different code path", async () => {
		// `maxCivilians` is a clamped add; the toggles are `o.x = !o.x` and are
		// immune to clamping, so a step function that only handled the numeric
		// arms would leave every boolean row dead.
		const before = Options.allowUndeadsEvolution;
		await screen([...down(rowOf(OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION)), "ArrowRight", "Enter"]);
		expect(Options.allowUndeadsEvolution).toBe(!before);
	});

	it("clamps at the last step rather than wrapping to the first", async () => {
		// OFF is the last `ZupDays` value. Wrapping would silently turn it back
		// into ONE, which reads as the screen having eaten the keypress.
		Options.zombifiedsUpgradeDays = ZupDays.OFF;
		await screen([...down(rowOf(OptionIDs.GAME_UNDEADS_UPGRADE_DAYS)), "ArrowRight", "Enter"]);
		expect(Options.zombifiedsUpgradeDays).toBe(ZupDays.OFF);
	});

	it("steps back up from the last value in the other direction", async () => {
		Options.zombifiedsUpgradeDays = ZupDays.OFF;
		await screen([...down(rowOf(OptionIDs.GAME_UNDEADS_UPGRADE_DAYS)), "ArrowLeft", "Enter"]);
		expect(Options.zombifiedsUpgradeDays).toBe(ZupDays.SEVEN);
	});
});

describe("the session field", () => {
	it("is reported, not written, by the screen", async () => {
		// The day the player chose, on the top row, so no navigation is needed.
		const result = await screen(["ArrowRight", "ArrowRight", "Enter"]);
		expect(result.ok).toBe(true);
		expect(result.rescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY + 2);
		// The C# has the screen return the day and the caller store it, so the
		// screen must not write the field itself — a screen that did would make
		// cancelling ambiguous, since it would already have committed the day.
		expect(Session.get().armyHelicopterRescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY);
	});

	it("is assigned by the flow that owns it, and only when the screen is accepted", async () => {
		// Driven through `HandleNewCharacter` rather than the screen, with the
		// screen stubbed so the two runs differ *only* in its `ok`.
		//
		// A sentinel set beforehand would not do: `reset()` is the first line of
		// `HandleNewCharacter`, so the field is a fresh default by the time the
		// stub runs. 17 is a day no default and no default-plus-step produces, so
		// "the field is 17" can only mean the flow assigned it.
		const run = async (ok: boolean): Promise<boolean> => {
			Session.get().ruleset = Ruleset.STILL_ALIVE;
			const real = game.HandleNewCharacterDifficulty.bind(game);
			game.HandleNewCharacterDifficulty = async () => ({ ok, rescueDay: 17 });
			try {
				ui.pushKeys(...FLOW_TO_DIFFICULTY);
				return await game.HandleNewCharacter();
			} finally {
				game.HandleNewCharacterDifficulty = real;
			}
		};

		expect(await run(true), "an accepted day lets the flow continue").toBe(true);
		expect(Session.get().armyHelicopterRescueDay).toBe(17);

		Session.get().armyHelicopterRescueDay = GameOptions.DEFAULT_RESCUE_DAY;
		expect(await run(false), "a cancelled day aborts character creation").toBe(false);
		expect(Session.get().armyHelicopterRescueDay, "cancelled: not assigned").toBe(
			GameOptions.DEFAULT_RESCUE_DAY,
		);
	});

	it("is left alone on cancel", async () => {
		// The screen never writes the session field at all, so a sentinel survives
		// an Escape untouched. The flow half is the test above.
		Session.get().armyHelicopterRescueDay = 7;
		GameOptions.save(Options);
		const result = await screen(["ArrowRight", "Escape"]);
		expect(result.ok).toBe(false);
		expect(Session.get().armyHelicopterRescueDay).toBe(7);
	});
});

describe("cancelling is not cosmetic", () => {
	it("drops the changes made on the screen", async () => {
		// The C#'s comment says why: "has the effect of dropping any changes to
		// the settings. this ensure we can't tweak difficulty then load into a
		// saved game that was started with different settings (ie cheat)"
		// (`RogueGame.cs:4046`).
		GameOptions.save(Options);
		Options.maxCivilians = 60;
		await screen(["Escape"]);
		expect(Options.maxCivilians).toBe(GameOptions.DEFAULT_MAX_CIVILIANS);
	});

	it("keeps them when accepted", async () => {
		// The other half of the pair, so the test above cannot pass by never
		// reloading.
		GameOptions.save(Options);
		Options.maxCivilians = 60;
		await screen(["Enter"]);
		expect(Options.maxCivilians).toBe(60);
	});
});

describe("the rescue day", () => {
	it("defaults to 21 and shows the number", () => {
		expect(GameOptions.DEFAULT_RESCUE_DAY).toBe(21);
		expect(Options.describeValue(GameMode.GM_STANDARD, OptionIDs.GAME_RESCUE_DAY)).toBe(
			"21 (default 21)",
		);
	});

	it("treats 6 as random rather than as a day, and says so", () => {
		// 6 is the C#'s floor and its "random" marker (`GameOptions.cs:707`), which
		// is why the visible day is clamped to 6 rather than 1: with a floor of 1
		// the marker would be a day the player could pick by accident.
		Options.visibleRescueDay = 5;
		expect(Options.visibleRescueDay).toBe(RESCUE_DAY_RANDOM);
		expect(Options.describeValue(GameMode.GM_STANDARD, OptionIDs.GAME_RESCUE_DAY)).toMatch(
			/^random /,
		);
	});

	it("clamps at 100 and never below the random marker", () => {
		Options.visibleRescueDay = 500;
		expect(Options.visibleRescueDay).toBe(100);
		Options.visibleRescueDay = -3;
		expect(Options.visibleRescueDay).toBe(RESCUE_DAY_RANDOM);
	});

	it("keeps showing random after a run has rolled one", () => {
		// The two-field split exists for this: the row reads the *visible* day, so
		// a player who backs out of character creation sees `random` again rather
		// than a specific number they never chose.
		Options.visibleRescueDay = RESCUE_DAY_RANDOM;
		Options.hiddenRescueDay = 19;
		expect(Options.describeValue(GameMode.GM_STANDARD, OptionIDs.GAME_RESCUE_DAY)).toMatch(
			/^random /,
		);
	});

	it("copies a chosen day through, over whatever a previous run rolled", async () => {
		// The non-random arm of the accept path. A stale `hiddenRescueDay` is the
		// case that catches an implementation which only assigns on "random".
		Options.visibleRescueDay = 18;
		Options.hiddenRescueDay = 99;
		const result = await screen(["Enter"]);
		expect(result.rescueDay).toBe(18);
	});

	it("rolls inside the C#'s window on random, and rolls differently per seed", async () => {
		// The C# rolls with `new Random()` (`RogueGame.cs:4040`), so its day is
		// unseedable. The port rolls with the game's roller so a seeded run stays
		// reproducible, and the seeds vary rather than being two views of one roll.
		const seen = new Set<number>();
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			// Seed before constructing: the constructor builds `Rules` from it.
			Session.useSeed(seed);
			Session.get().ruleset = Ruleset.STILL_ALIVE;
			Options.visibleRescueDay = RESCUE_DAY_RANDOM;
			const localUi = new NullRogueUI();
			const seeded = new RogueGame(localUi, new NullMusicManager());
			localUi.pushKeys("Enter");
			const result = await seeded.HandleNewCharacterDifficulty(
				new DiceRoller(Session.get().seed),
			);
			expect(result.rescueDay, `seed ${seed}`).toBeGreaterThanOrEqual(
				RESCUE_DAY_RANDOM_MIN,
			);
			expect(result.rescueDay, `seed ${seed}`).toBeLessThan(RESCUE_DAY_RANDOM_MAX);
			seen.add(result.rescueDay);
		}
		// Not "every seed gives a different day" — over a 14-wide window that would
		// flake. What matters is that it is rolling rather than returning a constant.
		expect(seen.size, "the roll is not constant across seeds").toBeGreaterThan(1);
	});
});

describe("R restores the shipped defaults", () => {
	it("resets the difficulty options", async () => {
		GameOptions.save(Options);
		Options.maxCivilians = 60;
		await screen(["r", "Enter"]);
		expect(Options.maxCivilians).toBe(GameOptions.DEFAULT_MAX_CIVILIANS);
	});

	it("leaves the general options alone", async () => {
		// The reason `OptionsCategory` exists at all. The C#'s difficulty arm
		// resets only the difficulty fields (`GameOptions.cs:833`), so pressing R
		// here must not throw away the music volume, the font or the view mode.
		GameOptions.save(Options);
		Options.musicVolume = 42;
		await screen(["r", "Enter"]);
		expect(Options.musicVolume).toBe(42);
	});

	it("resets to the shipped defaults rather than to the values it was entered with", async () => {
		// The C# says this on the line itself: "`prevOptions; //@@MP - used to
		// restore changes in this session, now resets defaults (Release 6-1)"
		// (`RogueGame.cs:3930`). Keeping a `prevOptions` clone the way the mid-game
		// screen does would be the more obvious implementation and the wrong one.
		const enteredWith = GameOptions.DEFAULT_MAX_CIVILIANS + 5;
		Options.maxCivilians = enteredWith;
		await screen(["r", "Enter"]);
		expect(Options.maxCivilians).toBe(GameOptions.DEFAULT_MAX_CIVILIANS);
		expect(Options.maxCivilians).not.toBe(enteredWith);
	});
});

describe("the reset arm and the row list agree", () => {
	const value = (id: OptionIDs): string => Options.describeValue(GameMode.GM_STANDARD, id);

	/** Move an option off its default, or fail saying which one would not. */
	const nudge = (id: OptionIDs): void => {
		const before = value(id);
		// `dir: 1` first, because a row already at its maximum (music volume at
		// 100, the simulation ratio at FULL) has to be stepped the other way.
		stepGameOption(id, 1);
		if (value(id) === before) stepGameOption(id, -1);
		expect(value(id), `${OptionIDs[id]} did not move in either direction`).not.toBe(
			before,
		);
	};

	it("resets every option the difficulty screen shows", () => {
		// The pair — `DIFFICULTY_OPTIONS` for membership and the `DIFFICULTY` arm
		// of `resetToDefaultValues` for behaviour — is the thing that can rot. A
		// row on the screen that `R` does not reset means a player pressing R is
		// told "defaults" while the option keeps their value, which is the exact
		// failure the C#'s split exists to prevent.
		const pristine = new GameOptions();
		for (const id of DIFFICULTY_OPTIONS) nudge(id);
		Options.resetToDefaultValues(OptionsCategory.DIFFICULTY);
		for (const id of DIFFICULTY_OPTIONS) {
			expect(value(id), `${OptionIDs[id]} survived an R`).toBe(
				pristine.describeValue(GameMode.GM_STANDARD, id),
			);
		}
		// And concretely, on the three that matter most here.
		expect(Options.maxCivilians).toBe(GameOptions.DEFAULT_MAX_CIVILIANS);
		expect(Options.resourcesAvailability).toBe(GameOptions.DEFAULT_RESOURCES_AVAILABILITY);
		expect(Options.visibleRescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY);
	});

	it("resets nothing that is on the mid-game screen and not a difficulty row", () => {
		// Read off the *real* screen list rather than a hand-written one, so a row
		// added to the screen and left out of the category is caught. Classic is the
		// ruleset that still has every row.
		Session.get().ruleset = Ruleset.CLASSIC;
		const rows = optionsScreenRows().filter((id) => !DIFFICULTY_OPTIONS.includes(id));
		expect(rows.length, "the general rows are still there").toBeGreaterThan(10);
		for (const id of rows) nudge(id);
		// The moved-to-default reading is the wrong one here: a *general* option
		// must keep the value the player gave it, so the nudged values are what has
		// to survive the reset.
		const nudged = new Map(rows.map((id) => [id, value(id)]));
		Options.resetToDefaultValues(OptionsCategory.DIFFICULTY);
		for (const id of rows) {
			expect(value(id), `${OptionIDs[id]} was reset but is not a difficulty row`).toBe(
				nudged.get(id),
			);
		}
	});
});

describe("the rows the screen shows", () => {
	it("drops the two standard-only rows outside standard mode", () => {
		const std = difficultyRows(GameMode.GM_STANDARD);
		const ci = difficultyRows(GameMode.GM_CORPSES_INFECTION);
		expect(std).toContain(OptionIDs.GAME_ZOMBIFICATION_CHANCE);
		expect(std).toContain(OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE);
		expect(ci).not.toContain(OptionIDs.GAME_ZOMBIFICATION_CHANCE);
		expect(ci).not.toContain(OptionIDs.GAME_STARVED_ZOMBIFICATION_CHANCE);
	});

	it("drops the three evolution rows in vintage", () => {
		const vtg = difficultyRows(GameMode.GM_VINTAGE);
		expect(vtg).not.toContain(OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION);
		expect(vtg).not.toContain(OptionIDs.GAME_SKELETONS_UPGRADE);
		expect(vtg).not.toContain(OptionIDs.GAME_SHAMBLERS_UPGRADE);
		expect(difficultyRows(GameMode.GM_STANDARD)).toContain(
			OptionIDs.GAME_ALLOW_UNDEADS_EVOLUTION,
		);
	});

	it("has fewer rows in vintage, which the arrow keys can see", async () => {
		// The two list tests above read the private filter, which is the thing most
		// likely to be right while the screen still shows everything. This drives
		// the real loop: pressing ArrowDown as many times as the standard list has
		// rows wraps back onto row 0 in standard, and lands five rows down in
		// vintage — so the *same* keys hit different options and only the counts
		// tell them apart.
		const std = difficultyRows(GameMode.GM_STANDARD);
		const vtg = difficultyRows(GameMode.GM_VINTAGE);
		expect(std, "the standard list").toHaveLength(16);
		expect(vtg, "the vintage list loses the two =S rows and the three -V rows").toHaveLength(11);

		Session.get().gameMode = GameMode.GM_STANDARD;
		const standard = await screen([...down(std.length), "ArrowRight", "Enter"]);
		expect(standard.rescueDay, "wrapped back onto the rescue-day row").toBe(
			GameOptions.DEFAULT_RESCUE_DAY + 1,
		);

		// Back to the shipped values first, or the standard run's +1 day above
		// would make the vintage assertion pass for the wrong reason.
		Options.resetToDefaultValues(OptionsCategory.ALL);
		Session.get().gameMode = GameMode.GM_VINTAGE;
		const vintage = await screen([...down(std.length), "ArrowRight", "Enter"]);
		// Row 5 of the vintage list is max undeads: the day is untouched and the
		// undead count moved instead.
		expect(vintage.rescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY);
		expect(Options.maxUndeads).toBe(GameOptions.DEFAULT_MAX_UNDEADS + 10);
	});

	it("never shows the rats row, though it does move off the mid-game screen", () => {
		// The one row where this port and the C#'s screen disagree: the C# has it
		// commented out (`RogueGame.cs:3790`, Release 5 removed rats upgrades) and
		// this port still has the option from classic. It moves out of the mid-game
		// list anyway — leaving it behind would be the one Still Alive difficulty
		// option a player could still change mid-game — but it gets no row here.
		for (const mode of [
			GameMode.GM_STANDARD,
			GameMode.GM_CORPSES_INFECTION,
			GameMode.GM_VINTAGE,
		]) {
			expect(difficultyRows(mode)).not.toContain(OptionIDs.GAME_RATS_UPGRADE);
		}
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		expect(optionsScreenRows()).not.toContain(OptionIDs.GAME_RATS_UPGRADE);
	});

	it("carries the rescue day and the resources knob", () => {
		const std = difficultyRows(GameMode.GM_STANDARD);
		expect(std[0]).toBe(OptionIDs.GAME_RESCUE_DAY);
		expect(std).toContain(OptionIDs.GAME_RESOURCES_AVAILABILITY);
	});
});

describe("classic is unchanged", () => {
	it("keeps every difficulty row on the mid-game options screen", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		const rows = optionsScreenRows();
		for (const id of DIFFICULTY_OPTIONS) {
			// Two exceptions, both Still-Alive-only options that classic has never
			// had at all: the rescue day, and Resources Availability, whose own row
			// is added only under `Feature.ResourcesAvailability`. Neither is a row
			// the difficulty feature took away.
			if (id === OptionIDs.GAME_RESCUE_DAY || id === OptionIDs.GAME_RESOURCES_AVAILABILITY) {
				continue;
			}
			expect(rows, `${OptionIDs[id]} is missing from classic's options`).toContain(id);
		}
	});

	it("takes exactly the difficulty rows off the mid-game screen under Still Alive", () => {
		Session.get().ruleset = Ruleset.CLASSIC;
		const classic = optionsScreenRows();
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const stillAlive = optionsScreenRows();

		// As a set difference rather than an arithmetic count, because the count has
		// two rows of slack that are easy to get wrong and one that matters: the
		// rescue day is not on either list, and Resources Availability is only
		// *added* under Still Alive, so it is not there to be taken away.
		const missing = classic.filter((id) => !stillAlive.includes(id));
		expect(missing.sort((a, b) => a - b)).toEqual(
			classic.filter((id) => DIFFICULTY_OPTIONS.includes(id)).sort((a, b) => a - b),
		);
		expect(missing.length, "and the difference is not empty").toBeGreaterThan(10);
	});

	it("does not run the screen at all, and the flow still completes", async () => {
		// `done` is the half that matters: a flow that aborted two screens early
		// would also report zero calls, and this is the test that would otherwise
		// pass for exactly the wrong reason.
		const run = await runFlow(FLOW_CLASSIC, Ruleset.CLASSIC);
		expect(run.done, "classic gets all the way through character creation").toBe(true);
		expect(run.calls, "classic must not reach the difficulty screen").toBe(0);
	});

	it("leaves the session field at its default through the flow", async () => {
		const run = await runFlow(FLOW_CLASSIC, Ruleset.CLASSIC);
		expect(run.done).toBe(true);
		expect(Session.get().armyHelicopterRescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY);
	});
});

describe("still alive runs it", () => {
	it("reaches the screen from the flow", async () => {
		// Accepted, so the flow completes and the field is written — which is the
		// other half of "reaches the screen", and the reason `calls` alone is not
		// the whole assertion.
		const run = await runFlow([...FLOW_TO_DIFFICULTY, "Enter"], Ruleset.STILL_ALIVE);
		expect(run.calls, "still alive must reach the difficulty screen").toBe(1);
		expect(run.done, "and accepting it lets the flow finish").toBe(true);
		expect(Session.get().armyHelicopterRescueDay).toBe(GameOptions.DEFAULT_RESCUE_DAY);
	});

	it("aborts the flow when the screen is cancelled", async () => {
		const run = await runFlow([...FLOW_TO_DIFFICULTY, "Escape"], Ruleset.STILL_ALIVE);
		expect(run.calls).toBe(1);
		expect(run.done, "Escape leaves character creation unfinished").toBe(false);
	});
});

describe("the mid-game screen", () => {
	it("has no difficulty row under Still Alive", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const rows = optionsScreenRows();
		for (const id of DIFFICULTY_OPTIONS) {
			expect(rows, `${OptionIDs[id]} is still editable mid-game`).not.toContain(id);
		}
	});

	it("keeps the rows that are not difficulty options", () => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const rows = optionsScreenRows();
		for (const id of [
			OptionIDs.UI_MUSIC,
			OptionIDs.UI_MUSIC_VOLUME,
			OptionIDs.GAME_CITY_SIZE,
			OptionIDs.GAME_DISTRICT_SIZE,
			OptionIDs.GAME_MAX_REINCARNATIONS,
			OptionIDs.GAME_SIMULATE_DISTRICTS,
		]) {
			expect(rows, `${OptionIDs[id]} went missing with the difficulty rows`).toContain(id);
		}
	});

	it("still steps what is left", () => {
		// The removal is a filter on the list, not a disabled screen: a screen whose
		// remaining rows did nothing would be a worse bug than the one it fixes.
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const screen = new OptionsScreen(new NullRogueUI()) as unknown as {
			adjust(option: OptionIDs, dir: -1 | 1): void;
		};
		Options.musicVolume = 50;
		screen.adjust(OptionIDs.UI_MUSIC_VOLUME, 1);
		expect(Options.musicVolume).toBe(55);
	});
});
