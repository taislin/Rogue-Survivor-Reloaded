/**
 * Menu chrome — the label/value list every full-screen menu draws, its
 * hit-testing, and the two lines of header/footnote furniture around it.
 *
 * ## Why this is a module
 *
 * `plans/BROWSER_PORT_PLAN.md` §6.5 makes this Wave 1's second extraction and
 * measures it at 222 lines with **zero** outbound edges. That holds on the current
 * file: the region is `DrawMenuOrOptions`, `MenuRowAt`, `MenuRowAtMouse`,
 * `WaitMenuInput`, `DrawHeader` and `DrawFootnote`, and the only thing any of them
 * touches is `IRogueUI` and five layout constants.
 *
 * It moves for a reason beyond the line count. `DrawMenuOrOptions` records where
 * each row landed as it drew, into `m_MenuRowBands`, and `MenuRowAt` reads those
 * bands back. That is a hidden coupling between a draw call and a hit-test: the
 * hit-test is only correct for the list drawn by the *most recent* draw, and the
 * two live on opposite sides of 100 lines of unrelated code. Here they sit in one
 * file with the state they share, so the coupling is visible rather than inferred.
 *
 * ## The state that moved with it
 *
 * `m_MenuRowBands` was a private field on `RogueGame`. It is module state here for
 * the same reason the bands exist at all: one frame draws one list, so the bands
 * are a frame's scratch space rather than anything a game owns. It is reset on
 * every `drawMenuOrOptions` call — see that function for why accumulating across
 * calls is a click landing on a row that is not there.
 *
 * ## What stays on `RogueGame`
 *
 * The six methods remain as one-line delegations, because 43 call sites across
 * `RogueGame`, `OptionsScreen` and the tests use these names and §6.10 forbids a
 * signature a caller can notice.
 */

import type { IRogueUI } from "@engine/IRogueUI";
import type { GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { Point } from "@engine/Point";
import { Color } from "@engine/Color";
import { CANVAS_HEIGHT } from "@engine/CanvasSize";
import { GAME_VERSION } from "@engine/GameVersion";

/**
 * Line steps for full-screen menus and reading screens, paired with the 12pt
 * menu font (`UI_DrawStringLarge`). The HUD keeps 12/14; menus have room, so
 * they get airier leading to match the larger glyphs.
 */
export const MENU_LINE_SPACING: number = 16;
export const MENU_BOLD_LINE_SPACING: number = 18;

/**
 * Nominal advance of one glyph in the 12pt menu font, in logical pixels.
 *
 * The font stack is `"Lucida Console", "Courier New", monospace` -- all three
 * are 0.6em monospace, so 0.6 * 16px = 9.6px. Rounded up to 10 to leave a
 * little slack, because this is used to place a column *before* drawing, and
 * a column that is a pixel short overlaps rather than merely looking tight.
 *
 * It is also what makes menu hit-testing possible at all. The port's menus are
 * drawn with `UI_DrawStringBoldLarge`, a bitmap font on a fixed grid rather than
 * a proportional one, so a label's pixel width is its character count times this.
 * That is why `menuValueColumnX` measures from `e.length` instead of measuring
 * the rendered text, and why it is a constant rather than a per-call measurement.
 */
export const MENU_CHAR_WIDTH: number = 10;

/** Blank columns between a menu label and its value text. */
export const MENU_COLUMN_GAP: number = 24;

/**
 * Glyphs `drawMenuOrOptions` puts in front of every label: `"---> "` when the
 * row is selected, five spaces when it is not. The selected form is the wider
 * of the two, and it is the one that has to clear the value column -- so it is
 * also the one that has to fit inside the row's clickable band, or a click on
 * the marker misses.
 */
export const MENU_LABEL_PREFIX: number = 6;

/**
 * Where one menu row was drawn, in logical canvas pixels.
 *
 * `top`/`bottom` are the *band* the row occupies, not the glyph box: the
 * baseline-to-baseline span. A row's text sits at `top`, so the band starts
 * where the previous row's descender ends — which is what stops rows
 * overlapping and a click landing one row low. See `menuRowBands`.
 */
export interface MenuRowBand {
	/**
	 * Index into the caller's `entries` array, not the visible row number.
	 *
	 * Which is what makes a scrolling list hit-test correctly: the visible row 0
	 * of a window that starts at entry 17 records `index: 17`.
	 */
	index: number;
	top: number;
	bottom: number;
	left: number;
	right: number;
}

/**
 * Where each menu row was drawn last frame, for mouse hit-testing.
 *
 * Written by `drawMenuOrOptions` as it draws, so a click is resolved against the
 * same numbers that placed the text rather than a second set of layout maths that
 * can disagree with the first. That is the bug `OptionsScreen` already documents
 * for its own rows — an earlier version spanned `baseline ± line`, so every row
 * covered a strip of its neighbour's and a click landed one row low, consistently.
 *
 * Replaced (not appended to) at the top of every `drawMenuOrOptions` call, because
 * a menu draws its list once per frame after a `UI_Clear` and the bands must
 * describe *this* frame. Anything drawn outside that helper is not here, which is
 * the reason a menu that is not built on it has no mouse support rather than a
 * broken one.
 *
 * It was a private field on `RogueGame`. Module state rather than game state
 * because a frame's bands are scratch: nothing else on the class reads them, and
 * leaving them here puts the coupling that matters — a hit-test that is only valid
 * for the most recent draw — in the same file as both halves of it.
 */
let menuRowBands: MenuRowBand[] = [];

/** Test seam: clears the recorded bands. */
export function resetMenuRowBands(): void {
	menuRowBands = [];
}

/** The bands recorded by the last draw. Exposed for tests and hit-test debugging. */
export function getMenuRowBands(): readonly MenuRowBand[] {
	return menuRowBands;
}

/**
 * X of the value column: past the widest *label*, not at a fixed offset.
 *
 * `rightPadding` is a floor, not the answer: it keeps the generous gap the C#
 * menus had for their short labels, and anything wider than that is measured from
 * the text so the column moves rather than overlapping. See the comment in
 * `drawMenuOrOptions` for why the fixed offset stopped working at 12pt.
 */
export function menuValueColumnX(
	gx: number,
	entries: readonly string[],
	rightPadding: number,
): number {
	let labelGlyphs = 0;
	for (const e of entries)
		labelGlyphs = Math.max(labelGlyphs, MENU_LABEL_PREFIX + e.length);
	return (
		gx + Math.max(rightPadding, labelGlyphs * MENU_CHAR_WIDTH + MENU_COLUMN_GAP)
	);
}

/**
 * Width of the widest menu label, in pixels, including the `---> ` prefix.
 *
 * The right edge of a label-only row's clickable band. Shares its measurement
 * with `menuValueColumnX` on purpose: both derive the label width from
 * `MENU_LABEL_PREFIX + e.length` over the same `MENU_CHAR_WIDTH`, so a row's
 * clickable width and the text that was drawn cannot drift apart when the font
 * constant or the prefix changes.
 */
export function menuEntryWidth(entries: readonly string[]): number {
	let labelGlyphs = 0;
	for (const e of entries)
		labelGlyphs = Math.max(labelGlyphs, MENU_LABEL_PREFIX + e.length);
	return labelGlyphs * MENU_CHAR_WIDTH;
}

/**
 * C# `DrawMenuOrOptions` — RogueGame.cs:19932
 *
 * Draws the label list, the optional value column, and records each row's band as
 * it goes.
 */
export function drawMenuOrOptions(
	ui: IRogueUI,
	currentChoice: number,
	entriesColor: Color,
	entries: string[],
	valuesColor: Color,
	values: string[] | null,
	gx: number,
	gy: { value: number },
	valuesOnNewLine = false,
	rightPadding = 256,
	/**
	 * Maximum rows to draw. When the list is longer, a window around the
	 * selection is shown and follows it as it moves (arrow keys wrap, so every
	 * entry stays reachable). Lets long lists — 53 keybindings, 30 skills —
	 * use the large menu size instead of shrinking to fit.
	 *
	 * Omit for short lists, which draw whole as before.
	 */
	maxRows?: number,
): void {
	// The value column starts past the widest *label*, not at a fixed offset.
	// See `menuValueColumnX` for why a flat offset stopped working at 12pt.
	const right = menuValueColumnX(gx, entries, rightPadding);

	// Fresh for this call — see the comment on `menuRowBands` above.
	menuRowBands = [];

	if (values != null && entries.length !== values.length)
		throw new RangeError("values length!= choices length");

	// Scroll window: keep the selection visible, clamped to the list.
	let first = 0;
	let count = entries.length;
	if (maxRows !== undefined && maxRows < count) {
		const half = Math.floor(maxRows / 2);
		first = Math.min(Math.max(0, currentChoice - half), count - maxRows);
		count = maxRows;
	}

	// display.
	for (let r = 0; r < count; r++) {
		const i = first + r;
		const choiceStr =
			i === currentChoice ? `---> ${entries[i]}` : `     ${entries[i]}`;
		// Record the row's clickable band as it is drawn, so a menu that wants
		// mouse input can hit-test against the same numbers that put the text
		// on screen rather than recomputing them here. Reset per call, not
		// accumulated: every menu draws its list once per frame after a
		// `UI_Clear`, so one call is the whole frame's list, and a stale entry
		// surviving into a differently-shaped menu is a click landing on a row
		// that is not there.
		menuRowBands.push({
			index: i,
			top: gy.value,
			bottom: gy.value + MENU_BOLD_LINE_SPACING,
			left: gx,
			right: values == null ? gx + menuEntryWidth(entries) : right,
		});
		ui.UI_DrawStringBoldLarge(entriesColor, choiceStr, gx, gy.value);

		if (values != null) {
			const valueStr =
				i === currentChoice && !valuesOnNewLine
					? `${values[i]} <---`
					: values[i];

			if (valuesOnNewLine) {
				gy.value += MENU_BOLD_LINE_SPACING;
				ui.UI_DrawStringBoldLarge(
					valuesColor,
					valueStr,
					gx + right,
					gy.value,
				);
			} else {
				ui.UI_DrawStringBoldLarge(
					valuesColor,
					valueStr,
					right,
					gy.value,
				);
			}
		}

		gy.value += MENU_BOLD_LINE_SPACING;
	}

	// Scroll position hint when windowed.
	if (count < entries.length) {
		ui.UI_DrawStringLarge(
			Color.Gray,
			`(${currentChoice + 1}/${entries.length} - list scrolls)`,
			gx,
			gy.value,
		);
		gy.value += MENU_LINE_SPACING;
	}
}

/**
 * The menu row under a screen point, or null. Takes **logical canvas
 * coordinates** — the space the menus are drawn in.
 *
 * `UI_GetMousePosition` reports CSS pixels, so a caller must convert first.
 * `menuRowAtMouse` does that, and every menu uses it rather than dividing by the
 * scale itself: the scale is a *display* property of the canvas, and a menu's
 * layout is in logical pixels regardless of how big the window is. Getting this
 * wrong is invisible at 1366 CSS px — where scale is 1 — and wrong by that factor
 * everywhere else.
 *
 * Reads the bands `drawMenuOrOptions` recorded, so this is a lookup rather than a
 * second piece of layout maths. Last match wins, so a row drawn lower on screen
 * wins over one that shares its band. The bands do not overlap, so this only
 * matters if a caller drew two lists into the same frame's bands, which
 * `drawMenuOrOptions` cannot do.
 */
export function menuRowAt(x: number, y: number): number | null {
	let hit: number | null = null;
	for (const band of menuRowBands) {
		if (x >= band.left && x <= band.right && y >= band.top && y < band.bottom)
			hit = band.index;
	}
	return hit;
}

/**
 * The menu row under the mouse, or null, converting CSS pixels to logical
 * first. This is what a menu should call; `menuRowAt` is the raw lookup.
 */
export function menuRowAtMouse(ui: IRogueUI, mousePos: Point): number | null {
	return menuRowAt(
		Math.trunc(mousePos.x / ui.UI_GetCanvasScaleX()),
		Math.trunc(mousePos.y / ui.UI_GetCanvasScaleY()),
	);
}

/** What `waitMenuInput` reports: one input event, or that the cursor moved. */
export interface MenuInput {
	key: GameKeyEvent | null;
	mousePos: Point;
	mouseButtons: MouseButton | null;
	wheel: number;
	moved: boolean;
}

/**
 * Waits for a key, a mouse button, a wheel notch, or the cursor moving.
 *
 * The menu equivalent of `WaitKeyOrMouse`, and it exists for the same reason
 * `OptionsScreen.waitForInput` does: a menu whose selection follows the cursor
 * has to redraw when the cursor moves, and `UI_WaitKey` only wakes on a key —
 * so hover would mean polling, and a blocking wait cannot poll.
 *
 * Returns the cursor movement as a *result* rather than as activity, so a
 * caller can move its selection without also treating the brush as a click.
 * That distinction is the whole reason this is not just `WaitKeyOrMouse`:
 * in the play loop, a cursor that moves is a look request; in a menu, it is a
 * hover.
 *
 * `UI_PeekMouseButtons` and `UI_PeekWheel` consume, so a press and a notch
 * are each delivered once and a held button is not re-reported. That is
 * load-bearing and not a detail: this polls, so a non-consuming version would
 * return immediately and forever and repaint the menu in a tight loop with
 * the keyboard never getting a turn. The same is already true of
 * `UI_PeekKey`, which is why the properties are spelled out in `IRogueUI`.
 */
export async function waitMenuInput(
	ui: IRogueUI,
	prevMouse: Point,
): Promise<MenuInput> {
	for (;;) {
		const key = ui.UI_PeekKey();
		if (key !== null) {
			return {
				key,
				mousePos: ui.UI_GetMousePosition(),
				mouseButtons: null,
				wheel: 0,
				moved: false,
			};
		}
		const wheel = ui.UI_PeekWheel();
		if (wheel !== 0) {
			return {
				key: null,
				mousePos: ui.UI_GetMousePosition(),
				mouseButtons: null,
				wheel,
				moved: false,
			};
		}
		const mousePos = ui.UI_GetMousePosition();
		const mouseButtons = ui.UI_PeekMouseButtons();
		if (mouseButtons !== null) {
			return { key: null, mousePos, mouseButtons, wheel: 0, moved: false };
		}
		if (!mousePos.equals(prevMouse)) {
			return {
				key: null,
				mousePos,
				mouseButtons: null,
				wheel: 0,
				moved: true,
			};
		}
		await new Promise<void>((r) => setTimeout(r, 0));
	}
}

/** C# `DrawHeader` — RogueGame.cs:19975 */
export function drawHeader(ui: IRogueUI): void {
	ui.UI_DrawStringBoldLarge(
		Color.Red,
		`ROGUE SURVIVOR - ${GAME_VERSION}`,
		0,
		0,
	);
}

/** C# `DrawFootnote` — RogueGame.cs:19980 */
export function drawFootnote(ui: IRogueUI, color: Color, text: string): void {
	ui.UI_DrawStringBoldLarge(
		color,
		`<${text}>`,
		0,
		CANVAS_HEIGHT - MENU_BOLD_LINE_SPACING,
	);
}
