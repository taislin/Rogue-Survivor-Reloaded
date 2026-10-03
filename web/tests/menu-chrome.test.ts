import { describe, it, expect, beforeEach } from "vitest";

import {
	drawFootnote,
	drawHeader,
	drawMenuOrOptions,
	getMenuRowBands,
	menuEntryWidth,
	menuRowAt,
	menuValueColumnX,
	resetMenuRowBands,
	MENU_BOLD_LINE_SPACING,
	MENU_CHAR_WIDTH,
	MENU_COLUMN_GAP,
	MENU_LABEL_PREFIX,
	MENU_LINE_SPACING,
} from "@engine/MenuChrome";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Color } from "@engine/Color";
import { GAME_VERSION } from "@engine/GameVersion";
import { CANVAS_HEIGHT } from "@engine/CanvasSize";

/**
 * Menu chrome: the label/value list every full-screen menu draws, and the
 * hit-testing that goes with it.
 *
 * Extracted from `RogueGame` as §6.5's second Wave 1 region. What is worth testing
 * here is the part that had to move together — `drawMenuOrOptions` records each
 * row's band as it draws, and `menuRowAt` reads those bands back. That coupling is
 * invisible in the source when the two live 100 lines apart, which is most of why
 * the band recording was extracted with the drawing rather than left behind.
 *
 * The tests drive the module functions directly. `RogueGame` keeps the same six
 * methods as delegations, and `panel-hitboxes.test.ts` / `hud-layout.test.ts`
 * already exercise those, so the class is not the thing under test here.
 */

/** A `gy` cursor, as `DrawMenuOrOptions` takes. */
const cursor = (start = 0): { value: number } => ({ value: start });

beforeEach(() => {
	resetMenuRowBands();
});

describe("MenuChrome.drawMenuOrOptions: bands", () => {
	it("records one band per row, indexed by the caller's entry number", () => {
		const ui = new NullRogueUI();
		drawMenuOrOptions(
			ui,
			1,
			Color.White,
			["first", "second", "third"],
			Color.Yellow,
			null,
			40,
			cursor(100),
		);
		const bands = getMenuRowBands();
		expect(bands.map((b) => b.index)).toEqual([0, 1, 2]);
		// Each row's top is the previous row's bottom, so the bands tile the list
		// rather than overlapping — which is what stops a click landing one low.
		expect(bands[0]!.top).toBe(100);
		expect(bands[1]!.top).toBe(100 + MENU_BOLD_LINE_SPACING);
		expect(bands[2]!.top).toBe(100 + 2 * MENU_BOLD_LINE_SPACING);
	});

	it("replaces the bands rather than accumulating them", () => {
		// A menu draws its list once per frame after a `UI_Clear`, so one call is
		// the whole frame's list. Accumulating would leave a stale band from a
		// differently-shaped menu, and a click landing on a row that is not there.
		const ui = new NullRogueUI();
		drawMenuOrOptions(ui, 0, Color.White, ["a", "b", "c"], Color.Yellow, null, 0, cursor());
		expect(getMenuRowBands()).toHaveLength(3);
		drawMenuOrOptions(ui, 0, Color.White, ["only"], Color.Yellow, null, 0, cursor());
		expect(getMenuRowBands()).toHaveLength(1);
	});

	it("indexes a windowed list by entry number, not row number", () => {
		// This is the property that makes a scrolling menu hit-test correctly: the
		// visible row 0 of a window starting at entry 17 must report 17.
		const ui = new NullRogueUI();
		const entries = Array.from({ length: 10 }, (_, i) => `e${i}`);
		drawMenuOrOptions(ui, 7, Color.White, entries, Color.Yellow, null, 0, cursor(), false, 256, 4);
		expect(getMenuRowBands().map((b) => b.index)).toEqual([5, 6, 7, 8]);
	});

	it("extends a label-only row past the label, and a valued row to the value column", () => {
		const ui = new NullRogueUI();
		const entries = ["ab"];
		drawMenuOrOptions(ui, 0, Color.White, entries, Color.Yellow, null, 40, cursor());
		expect(getMenuRowBands()[0]!.right).toBe(40 + menuEntryWidth(entries));

		resetMenuRowBands();
		const values = ["v"];
		drawMenuOrOptions(ui, 0, Color.White, entries, Color.Yellow, values, 40, cursor());
		expect(getMenuRowBands()[0]!.right).toBe(menuValueColumnX(40, entries, 256));
	});

	it("throws when the value column does not match the label column", () => {
		// Kept from the original: a caller passing mismatched arrays would
		// otherwise index past the end of `values` a few rows later.
		expect(() =>
			drawMenuOrOptions(
				new NullRogueUI(),
				0,
				Color.White,
				["a", "b"],
				Color.Yellow,
				["only one"],
				0,
				cursor(),
			),
		).toThrow(RangeError);
	});

	it("advances gy past every row it drew", () => {
		const gy = cursor(50);
		drawMenuOrOptions(
			new NullRogueUI(),
			0,
			Color.White,
			["a", "b", "c"],
			Color.Yellow,
			null,
			0,
			gy,
		);
		expect(gy.value).toBe(50 + 3 * MENU_BOLD_LINE_SPACING);
	});

	it("advances gy further for a windowed list, to leave room for the scroll hint", () => {
		// The "(n/N - list scrolls)" line is drawn below the window, so a caller
		// that returns `gy` as the next y has to clear it.
		const gy = cursor();
		drawMenuOrOptions(
			new NullRogueUI(),
			0,
			Color.White,
			["a", "b", "c", "d", "e"],
			Color.Yellow,
			null,
			0,
			gy,
			false,
			256,
			2,
		);
		expect(gy.value).toBe(2 * MENU_BOLD_LINE_SPACING + MENU_LINE_SPACING);
	});
});

describe("MenuChrome.menuRowAt", () => {
	it("finds the row under a point, and null outside every band", () => {
		const ui = new NullRogueUI();
		drawMenuOrOptions(
			ui,
			0,
			Color.White,
			["first", "second"],
			Color.Yellow,
			null,
			40,
			cursor(100),
		);
		expect(menuRowAt(45, 101)).toBe(0);
		expect(menuRowAt(45, 101 + MENU_BOLD_LINE_SPACING)).toBe(1);
		expect(menuRowAt(5, 101)).toBe(null); // left of the list
		expect(menuRowAt(45, 99)).toBe(null); // above the list
		expect(menuRowAt(45, 100 + 2 * MENU_BOLD_LINE_SPACING)).toBe(null); // below
	});

	it("returns null before anything has drawn", () => {
		// A menu can be asked where the cursor is before its first frame, so this
		// is a miss rather than a throw.
		expect(getMenuRowBands()).toEqual([]);
		expect(menuRowAt(100, 100)).toBe(null);
	});

	it("includes the top edge and excludes the bottom, so rows cannot both match", () => {
		const ui = new NullRogueUI();
		drawMenuOrOptions(ui, 0, Color.White, ["a", "b"], Color.Yellow, null, 0, cursor(100));
		// The boundary between the two rows belongs to exactly one of them.
		const boundary = 100 + MENU_BOLD_LINE_SPACING;
		expect(menuRowAt(5, boundary - 1)).toBe(0);
		expect(menuRowAt(5, boundary)).toBe(1);
	});
});

describe("MenuChrome column measurement", () => {
	it("puts the value column past the widest label, or at the floor", () => {
		// `rightPadding` is a floor: short labels keep the C#'s generous gap, and
		// anything wider is measured so the column moves rather than overlapping.
		expect(menuValueColumnX(0, ["ab"], 256)).toBe(256);
		const wide = menuValueColumnX(0, ["x".repeat(80)], 256);
		expect(wide).toBe((MENU_LABEL_PREFIX + 80) * MENU_CHAR_WIDTH + MENU_COLUMN_GAP);
		expect(wide).toBeGreaterThan(256);
	});

	it("adds gx to both, so a menu can be drawn anywhere", () => {
		expect(menuValueColumnX(40, ["ab"], 256)).toBe(40 + 256);
	});

	it("measures label width with the same prefix and glyph width the text uses", () => {
		// Shared deliberately: a row's clickable width and the string that was
		// drawn cannot drift apart when the prefix or the font constant changes.
		expect(menuEntryWidth(["ab"])).toBe((MENU_LABEL_PREFIX + 2) * MENU_CHAR_WIDTH);
	});
});

describe("MenuChrome header and footnote", () => {
	/** `NullRogueUI` drops every paint call, which is its purpose, so record these two. */
	class ProbeUI extends NullRogueUI {
		readonly bold: Array<{ color: Color; text: string; x: number; y: number }> = [];
		override UI_DrawStringBoldLarge(
			color: Color,
			text: string,
			x: number,
			y: number,
		): void {
			this.bold.push({ color, text, x, y });
		}
	}

	it("DrawHeader names the game and the version", () => {
		const ui = new ProbeUI();
		drawHeader(ui);
		expect(ui.bold).toHaveLength(1);
		expect(ui.bold[0]!.text).toBe(`ROGUE SURVIVOR - ${GAME_VERSION}`);
		expect(ui.bold[0]!.color).toBe(Color.Red);
		expect(ui.bold[0]!.x).toBe(0);
		expect(ui.bold[0]!.y).toBe(0);
	});

	it("DrawFootnote brackets the text, keeps the caller's colour, and sits on the last line", () => {
		const ui = new ProbeUI();
		drawFootnote(ui, Color.LightGray, "hello");
		expect(ui.bold).toHaveLength(1);
		expect(ui.bold[0]!.text).toBe("<hello>");
		expect(ui.bold[0]!.color).toBe(Color.LightGray);
		expect(ui.bold[0]!.y).toBe(CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING);
	});
});