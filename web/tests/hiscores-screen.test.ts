/**
 * The hi-scores screen's header: does it sit over the columns it heads?
 *
 * The reported shape is the column header — `Rank | Name, Skills, Death … |
 * Playing time` — being visibly left of the values underneath it. The header and
 * a row put their `|` at the *same character indices* (5, 33, 42, 53, 62, 71,
 * 80, 97), so on a monospace face they line up if and only if both reach the
 * screen at the same advance. They did not: the header went through
 * `UI_DrawStringBold` (the 10pt HUD face, 8px a character) while the body went
 * through `UI_DrawStringBoldLarge` (the 12pt menu face, 9.6px), which puts the
 * labels 1.6px left per column — ~155px out by the last pipe. The C# drew the
 * whole screen with one bold font (`src/RogueForm.cs:57`) and could not
 * diverge; the port split it into two faces and then used both on one table.
 *
 * The rest of the report is the scroll redraw: `HandleHiScores` clears and
 * repaints the header on every cursor key, and that path skipped the rule and
 * stepped the table differently from the first paint — so the first keypress
 * made the rule disappear and the rows jump up under it.
 *
 * Driven through the real `HandleHiScores` with real keys, the shape
 * `tests/customiser-skill-row.test.ts` uses, rather than by calling the two
 * draw methods by hand: what is under test is which face each line reaches the
 * screen with and at what y, and both are only true of the code that runs.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { HiScore, HiScoreTable } from "@engine/HiScoreTable";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	MENU_BOLD_LINE_SPACING,
	MENU_CHAR_WIDTH,
	RogueGame,
} from "@engine/RogueGame";
import { Session } from "@engine/Session";
import { NullRogueUI } from "@ui/NullRogueUI";

/** What a line was drawn with, and where. */
interface Draw {
	api: "bold" | "boldLarge" | "large";
	text: string;
	gx: number;
	gy: number;
	/** Which `UI_Clear` this line belongs to: 0 the first paint, 1 a scroll. */
	frame: number;
}

const RULE = "---------+".repeat(12);
const HEADER = "Rank | Name, Skills, Death       |  Score |Difficulty|Survival|  Kills |Achievm.|      Game Time | Playing time";

/** Indexes of every `|` in a line — the columns, as characters. */
function pipes(text: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < text.length; i++) if (text[i] === "|") out.push(i);
	return out;
}

/** A score row: rank, name, points — the shape `HandleHiScores` formats. */
function isRow(text: string): boolean {
	// Leading spaces included: the rank is padded to three columns, so entry 1
	// is `  1. | …` and a `^\d` match sees only entries of 100 or more.
	return /^\s*\d+\. \| /.test(text);
}

/**
 * Instruments both text faces and the frame boundary, and returns the record.
 *
 * `NullRogueUI` records bold-large strings only, and records them without a
 * position — both halves of this report are about position, and the half about
 * the face needs the *other* call observed too, so the two methods are wrapped
 * here rather than added to the null UI's recording (which is deliberately
 * text-only; see `NullRogueUI.drawnLines`).
 */
function recordDraws(ui: NullRogueUI): Draw[] {
	const target = ui as unknown as Record<string, unknown>;
	const draws: Draw[] = [];
	let frame = -1;

	const realClear = target.UI_Clear as (color: unknown) => void;
	target.UI_Clear = function (this: NullRogueUI, color: unknown): void {
		frame++;
		realClear.call(ui, color);
	};

	const wrap = (name: string, api: Draw["api"]): void => {
		const real = target[name] as (
			color: unknown,
			text: string,
			gx: number,
			gy: number,
		) => void;
		target[name] = function (
			this: NullRogueUI,
			color: unknown,
			text: string,
			gx: number,
			gy: number,
		): void {
			draws.push({ api, text, gx, gy, frame });
			real.call(ui, color, text, gx, gy);
		};
	};
	wrap("UI_DrawStringBold", "bold");
	wrap("UI_DrawStringBoldLarge", "boldLarge");
	// Recorded for the paging line, which is the redraw's own evidence — it is
	// drawn with the plain menu face and is not part of the header block.
	wrap("UI_DrawStringLarge", "large");

	return draws;
}

/**
 * The screen with a table under it: enough entries to page, so the scroll
 * redraw is reached rather than only the first paint.
 */
async function openScores(entries: number): Promise<{
	game: RogueGame;
	ui: NullRogueUI;
	draws: Draw[];
}> {
	Session.useSeed(4242);
	const ui = new NullRogueUI();
	const game = new RogueGame(ui, new NullMusicManager());

	const table = new HiScoreTable(HiScoreTable.DEFAULT_MAX_ENTRIES);
	for (let i = 0; i < entries; i++) {
		const hi = new HiScore();
		hi.name = `Player ${i + 1}`;
		hi.totalPoints = (entries - i) * 100;
		hi.difficultyPercent = 100;
		hi.survivalPoints = 2026;
		hi.killPoints = 150;
		hi.achievementPoints = 1000;
		hi.turnSurvived = 144;
		hi.playingTimeSeconds = 408;
		hi.skillsDescription = "Agile";
		hi.death = "killed by a zombie";
		table.register(hi);
	}
	// Through the screen's own entry point rather than by assigning
	// `game.m_HiScoreTable`: that is how the game gets its table (`Run()` calls
	// `LoadHiScoreTable`), it round-trips the entries the way a saved table
	// does, and it keeps `roguegame-surface`'s count of members the outside
	// world touches on the product's own references rather than this test's.
	HiScoreTable.save(table);
	await game.LoadHiScoreTable();

	// Attached after the load: `LoadHiScoreTable` clears the screen twice, and
	// the recorder counts those as frames — frame 0 has to be the scores
	// screen's own first paint.
	const draws = recordDraws(ui);
	return { game, ui, draws };
}

const ruleIn = (draws: Draw[], frame: number): Draw | undefined =>
	draws.find((d) => d.frame === frame && d.text.startsWith(RULE));
const headerIn = (draws: Draw[], frame: number): Draw | undefined =>
	draws.find((d) => d.frame === frame && d.text === HEADER);
const rowsIn = (draws: Draw[], frame: number): Draw[] =>
	draws.filter((d) => d.frame === frame && isRow(d.text));

let game: RogueGame;
let ui: NullRogueUI;
let draws: Draw[];

beforeAll(async () => {
	// Ten entries: eight fit a page, so a cursor key really scrolls and the
	// redraw path is exercised rather than assumed.
	({ game, ui, draws } = await openScores(10));
	// One scroll, then out. Both are queued before the screen starts reading.
	ui.pushKeys("ArrowDown", "Escape");
	await game.HandleHiScores();
});

describe("the hi-scores header is on the columns it heads", () => {
	it("draws the rule, the header and every row through one face", () => {
		// The alignment invariant, stated the way the screen can break it: two
		// faces means two advances means the columns cannot all be right. The
		// rule and the header were the ones on the small face; a row moving to
		// it would be the same bug from the other side.
		const onTheTable = [
			ruleIn(draws, 0),
			headerIn(draws, 0),
			...rowsIn(draws, 0),
		];
		expect(onTheTable.every((d) => d !== undefined)).toBe(true);
		for (const d of onTheTable) expect(d!.api).toBe("boldLarge");

		// And never through the other call, on either frame — the scroll
		// redraw draws its own copy of the header.
		const small = draws.filter(
			(d) =>
				d.api === "bold" &&
				(d.text.startsWith(RULE) || d.text === HEADER || isRow(d.text)),
		);
		expect(small).toEqual([]);
	});

	it("steps the header between the rule and the first row by one leading", () => {
		// The vertical half of "lined up": the header belongs to the block, and
		// the block is on one rhythm. First paint and redraw are asserted
		// against the same arithmetic below rather than against each other, so
		// both are pinned to the layout and not merely to their agreement.
		const title = draws.find((d) => d.frame === 0 && d.text === "Hi Scores")!;
		const rule = ruleIn(draws, 0)!;
		const header = headerIn(draws, 0)!;
		const row = rowsIn(draws, 0)[0]!;
		// Each entry opens with its own all-dash rule, one leading under the
		// header; the row's text line follows that. It is not `ruleIn`: the
		// framing rules are the `---------+` ones, and a first row asserted
		// directly against the header would be a leading short.
		const entryRule = draws.find(
			(d) => d.frame === 0 && /^-{20,}$/.test(d.text),
		)!;

		expect(title).toBeDefined();
		expect(entryRule).toBeDefined();
		for (const d of [title, rule, header, entryRule, row]) expect(d.gx).toBe(0);
		expect(rule.gy).toBe(title.gy + MENU_BOLD_LINE_SPACING);
		expect(header.gy).toBe(rule.gy + MENU_BOLD_LINE_SPACING);
		expect(entryRule.gy).toBe(header.gy + MENU_BOLD_LINE_SPACING);
		expect(row.gy).toBe(entryRule.gy + MENU_BOLD_LINE_SPACING);
	});

	it("puts the header's pipes on the row's pipes", () => {
		// Character-level: the two strings agree column for column, which is
		// what makes the face above the whole test — same characters, same
		// advance, same x. A header edited into a different column layout would
		// pass every assertion above and still sit over the wrong values.
		const header = headerIn(draws, 0)!;
		const row = rowsIn(draws, 0)[0]!;
		expect(pipes(header.text)).toEqual(pipes(row.text));
		expect(pipes(header.text).length).toBeGreaterThanOrEqual(8);
	});
});

describe("the hi-scores header survives a scroll", () => {
	it("redraws the rule and the header where they were", () => {
		// The reported second half: the scroll repaint cleared the screen and
		// put the header back *without* the rule, one leading higher. So the
		// assertion is that a scrolled frame still has the rule, at the first
		// paint's coordinates — the rule being present at all is the half that
		// used to fail.
		const firstRule = ruleIn(draws, 0)!;
		const scrolledRule = ruleIn(draws, 1)!;
		const scrolledHeader = headerIn(draws, 1)!;

		expect(scrolledRule).toBeDefined();
		expect(scrolledRule.gy).toBe(firstRule.gy);
		expect(scrolledHeader.gy).toBe(headerIn(draws, 0)!.gy);
		expect(rowsIn(draws, 1)[0]!.gy).toBe(rowsIn(draws, 0)[0]!.gy);
		expect(scrolledHeader.api).toBe("boldLarge");
	});

	it("really scrolled", () => {
		// Without this, the test above passes on a screen that never redrew:
		// `frame` 1 would be empty and `ruleIn(draws, 1)` undefined — which the
		// assertions would reject, but only by being undefined comparisons. The
		// paging line is the redraw's own evidence, and it also pins the page
		// arithmetic (eight entries at this leading) that the header's own
		// leading feeds into.
		expect(draws.find((d) => d.frame === 0 && d.text.includes("cursor/PgUp"))?.text).toBe(
			"(1-8/10 - cursor/PgUp/PgDn to scroll)",
		);
		expect(draws.find((d) => d.frame === 1 && d.text.includes("cursor/PgUp"))?.text).toBe(
			"(2-9/10 - cursor/PgUp/PgDn to scroll)",
		);
	});
});

describe("the hi-scores header block fits the canvas", () => {
	it("keeps the rule and the header inside the right edge", () => {
		// Moving both to the 12pt face widens them by a fifth. The rule is the
		// longer of the two (120 characters) and nothing on the screen is wider
		// than it, so if the rule fits the header does; measured at the nominal
		// advance `MENU_CHAR_WIDTH`, which is what the rest of the layout uses.
		const widest = Math.max(RULE.length, HEADER.length);
		expect(widest * MENU_CHAR_WIDTH).toBeLessThanOrEqual(CANVAS_WIDTH);
	});

	it("leaves the footnote its own last line", () => {
		// The block gained two leadings when it moved onto the menu rhythm, so
		// the page has to still end where the footnote is drawn rather than on
		// top of it. Nothing throws when they collide; the lines just overlap.
		const footnotes = draws.filter((d) => d.text === "<press ESC to leave>");
		expect(footnotes.length).toBeGreaterThan(0);
		for (const d of footnotes) {
			expect(d.gy).toBe(CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING);
		}
	});
});
