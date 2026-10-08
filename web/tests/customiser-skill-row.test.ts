/**
 * The customiser's skill row: what a selection describes, what Enter commits,
 * and whether the row is on the canvas at all.
 *
 * The row's entries are `*Random*` followed by the living skills, so entry `i`
 * is skill `i - 1 + FIRST_LIVING` -- the conversion `RogueGame.cs:2011` does on
 * Enter. The port cast the index straight through, which described (and, worse,
 * committed) the entry one to the right: picking Unsuspicious handed a living
 * character `Z_AGILE`.
 *
 * The row is also the widest thing on the screen at 2720 px against a 1366 px
 * canvas, so half of it was drawn past the right edge where `CanvasUI` clips it
 * while LEFT/RIGHT could still walk the selection onto it.
 *
 * Driven through `NullRogueUI.pushKeys` exactly as
 * `tests/difficulty-at-creation.test.ts` drives the screens around this one:
 * real keys through the real loop, not a private method called with a hand-
 * picked argument.
 */

import { beforeAll, afterEach, describe, expect, it } from "vitest";

import { DiceRoller } from "@engine/DiceRoller";
import { LAST_APPEARANCE_KEY } from "@engine/NewGameConfig";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import {
	CANVAS_WIDTH,
	MENU_CHAR_WIDTH,
	RogueGame,
	optionRowLines,
} from "@engine/RogueGame";
import { Session } from "@engine/Session";
import { storage } from "@engine/storage";
import { SkillID, Skills } from "@gameplay/Skills";
import { NullRogueUI } from "@ui/NullRogueUI";

let ui: NullRogueUI;
let game: RogueGame;

beforeAll(async () => {
	Session.useSeed(4242);
	ui = new NullRogueUI();
	game = new RogueGame(ui, new NullMusicManager());
	await game.LoadData();
});

afterEach(() => {
	// Enter commits the look to storage, so the next screen opens on this
	// character's layers rather than on its own.
	storage.removeItem(LAST_APPEARANCE_KEY);
	ui.recordText = false;
});

/** The row the screen builds: `*Random*`, then every living skill in order. */
const skillEntries: string[] = ["*Random*"];
for (let i = Skills.FIRST_LIVING; i <= Skills.LAST_LIVING; i++) {
	skillEntries.push(Skills.name(i as SkillID));
}

/** The skill an entry stands for, converting the way the C# converts it. */
function skillOf(entry: number): SkillID {
	return (entry - 1 + Skills.FIRST_LIVING) as SkillID;
}

/**
 * Walks to the skill row, moves `entry` steps right from `*Random*`, and
 * confirms. Row order is race, sex, skill, so two downs land on the skill row.
 */
async function chooseSkill(entry: number): Promise<void> {
	ui.recordText = true;
	ui.pushKeys(
		"ArrowDown",
		"ArrowDown",
		...new Array<string>(entry).fill("ArrowRight"),
		"Enter",
	);
	const ok = await game.HandleNewCharacterDetails(new DiceRoller(1));
	expect(ok).toBe(true);
}

/**
 * The last description line drawn, which is the frame the Enter was pressed on.
 *
 * Both shapes of it: the skill's own stat line, and the line `*Random*` puts
 * there instead.
 */
function shownDescription(): string | undefined {
	return ui.drawnLines
		.filter((l) => l.includes(" max - ") || l === "(a skill will be picked at random)")
		.at(-1);
}

describe("the description under the row", () => {
	it.each(Array.from({ length: skillEntries.length - 1 }, (_, i) => i + 1))(
		"describes entry %i with that entry's skill",
		async (entry) => {
			await chooseSkill(entry);
			const id = skillOf(entry);
			expect(shownDescription()).toBe(
				`${Skills.maxSkillLevel(id)} max - ${game.DescribeSkillShort(id)}`,
			);
		},
	);

	it("*Random* says it will be rolled", async () => {
		await chooseSkill(0);
		expect(shownDescription()).toBe("(a skill will be picked at random)");
	});
});

describe("the skill Enter commits", () => {
	it.each(Array.from({ length: skillEntries.length - 1 }, (_, i) => i + 1))(
		"commits entry %i as that entry's skill",
		async (entry) => {
			await chooseSkill(entry);
			expect(game.m_CharGen.startingSkill).toBe(skillOf(entry));
			// The last entry is the one a bare cast sends into the undead block:
			// `Z_AGILE` on a character who is still human.
			expect(game.m_CharGen.startingSkill).toBeLessThanOrEqual(Skills.LAST_LIVING);
		},
	);

	it("*Random* commits a rolled living skill", async () => {
		await chooseSkill(0);
		expect(game.m_CharGen.startingSkill).toBeGreaterThanOrEqual(Skills.FIRST_LIVING);
		expect(game.m_CharGen.startingSkill).toBeLessThanOrEqual(Skills.LAST_LIVING);
	});
});

describe("the row's layout", () => {
	const lines = optionRowLines("Skill ", skillEntries, 0);

	it("gives every entry exactly one cell, in order", () => {
		expect(lines.flat().map((cell) => cell.index)).toEqual(
			skillEntries.map((_, i) => i),
		);
	});

	it("keeps every cell inside the canvas", () => {
		for (const line of lines) {
			for (const cell of line) {
				// `< Agile >` and `  Agile  ` are the same width, so this is the
				// cell's real right edge whatever is selected.
				const right =
					cell.x + (skillEntries[cell.index].length + 4) * MENU_CHAR_WIDTH;
				expect(right).toBeLessThanOrEqual(CANVAS_WIDTH);
			}
		}
	});

	it("needs more than one line to do that", () => {
		expect(lines.length).toBeGreaterThan(1);
	});

	it("starts the entries past the label column, on every line", () => {
		const entryX = ("Skill ".length + 3) * MENU_CHAR_WIDTH;
		for (const line of lines) {
			expect(line[0]?.x).toBe(entryX);
		}
	});

	it("draws the row on as many lines as it reports", () => {
		const draw = (
			game as unknown as {
				DrawOptionRow(
					label: string,
					options: readonly string[],
					selected: number,
					gx: number,
					gy: number,
					active: boolean,
				): number;
			}
		).DrawOptionRow.bind(game);
		// The caller advances `gy` by this number, so a row drawn on three lines
		// but reported as one would put the appearance rows on top of it.
		expect(draw("Skill ", skillEntries, 0, 0, 0, true)).toBe(lines.length);
	});
});
