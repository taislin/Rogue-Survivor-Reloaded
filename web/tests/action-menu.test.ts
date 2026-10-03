import { describe, it, expect } from "vitest";
import {
  ACTION_ENTRIES,
  ACTION_MENU_COLUMNS,
  MAX_KEY_CHARS,
  computeLayout,
  layoutButtons,
  buttonAt,
  moveSelection,
  longestLabel,
} from "@ui/ActionMenu";
import { PlayerCommand } from "@engine/PlayerCommand";

/**
 * The action menu's layout, hit-testing and keyboard navigation.
 *
 * Kept out of the drawing deliberately: every question here is one that can be
 * settled without a browser, and each of them was answered wrongly at least once
 * while writing the screen that uses it.
 */

/** `RogueGame.MENU_CHAR_WIDTH`. */
const CHAR = 10;
/** The canvas, and where the minimap sits vertically, at the shipped tile sizes. */
const CANVAS_WIDTH = 1366;
const CANVAS_HEIGHT = 768;
const MINIMAP_Y = 187;

/**
 * The layout the screen actually builds.
 *
 * Derived here the same way the screen derives it, from the font metric and the
 * room available. **Hardcoding pixel numbers in this file is what let the first
 * version through**: it compared a 62px button against a label length in
 * *characters*, and the only place that mix-up is visible is on screen.
 */
const REAL = computeLayout(ACTION_ENTRIES, {
  charWidth: CHAR,
  rightEdgeX: CANVAS_WIDTH - 8,
  topY: MINIMAP_Y,
  availableWidth: CANVAS_WIDTH - 16,
  availableHeight: CANVAS_HEIGHT - 2 * 18 - MINIMAP_Y,
  preferredColumns: ACTION_MENU_COLUMNS,
  keyChars: 8,
});

describe("the action list", () => {
  it("is only main in-game actions", () => {
    // Three groups are excluded on purpose, and the reasons are load-bearing
    // enough to be assertions rather than a comment:
    //
    // - movement, because a button labelled "North" is a lie the moment you turn,
    //   and there is no label for "relative to facing"
    // - the inventory slots, because the panel is already clickable
    // - the meta commands, because "Quit Game" on a clickable grid is a good way
    //   to lose a run
    const commands = ACTION_ENTRIES.map((e) => e.command);
    expect(commands).not.toContain(PlayerCommand.MOVE_N);
    expect(commands).not.toContain(PlayerCommand.MOVE_S);
    expect(commands).not.toContain(PlayerCommand.ITEM_SLOT_0);
    expect(commands).not.toContain(PlayerCommand.QUIT_GAME);
    expect(commands).not.toContain(PlayerCommand.SAVE_GAME);
    expect(commands).not.toContain(PlayerCommand.OPTIONS_MODE);
    expect(commands).not.toContain(PlayerCommand.ACTION_MENU);
  });

  it("includes the ones that were asked for", () => {
    const commands = ACTION_ENTRIES.map((e) => e.command);
    for (const wanted of [
      PlayerCommand.SLEEP,
      PlayerCommand.BARRICADE_MODE,
      PlayerCommand.BREAK_MODE,
      PlayerCommand.WAIT_OR_SELF,
      PlayerCommand.WAIT_LONG,
      PlayerCommand.BUILD_SMALL_FORTIFICATION,
      PlayerCommand.BUILD_LARGE_FORTIFICATION,
    ]) {
      expect(commands, `${PlayerCommand[wanted]}`).toContain(wanted);
    }
  });

  it("has no duplicate commands", () => {
    const commands = ACTION_ENTRIES.map((e) => e.command);
    expect(new Set(commands).size, "a command appears twice").toBe(commands.length);
  });

  it("labels every entry", () => {
    for (const e of ACTION_ENTRIES) {
      expect(e.label.length, `${PlayerCommand[e.command]} has no label`).toBeGreaterThan(0);
    }
  });
});

describe("computeLayout", () => {
  it("makes a button wide enough for its label *and* its key hint", () => {
    // The bug this exists for: the width was compared against a length in
    // characters while the budget is in pixels, so every column drew over the next.
    const needed = (longestLabel(ACTION_ENTRIES) + MAX_KEY_CHARS) * CHAR;
    expect(REAL.buttonWidth).toBeGreaterThanOrEqual(needed);
  });

  it("keeps the whole grid on the canvas", () => {
    expect(REAL.originX, "the grid runs off the left edge").toBeGreaterThanOrEqual(0);
    expect(
      REAL.originX + REAL.gridWidth,
      "the grid runs off the right edge",
    ).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it("anchors to the right margin and grows leftward", () => {
    // The minimap leaves ~340px to its right and a grid sized to its labels wants
    // more, so anchoring left would push it off the screen entirely.
    expect(REAL.originX + REAL.gridWidth).toBe(CANVAS_WIDTH - 8);
  });

  it("fits the height it was given", () => {
    const rows = Math.ceil(ACTION_ENTRIES.length / REAL.columns);
    const height = rows * (REAL.buttonHeight + REAL.gap) - REAL.gap;
    expect(height).toBeLessThanOrEqual(CANVAS_HEIGHT - 2 * 18 - MINIMAP_Y);
  });

  it("falls back to fewer columns when the room is narrow", () => {
    const narrow = computeLayout(ACTION_ENTRIES, {
      charWidth: CHAR,
      rightEdgeX: 400,
      topY: 0,
      availableWidth: 200,
      availableHeight: 600,
      preferredColumns: 3,
      keyChars: 8,
    });
    expect(narrow.columns).toBeLessThan(REAL.columns);
    expect(narrow.gridWidth).toBeLessThanOrEqual(200);
  });

  it("never asks for zero columns", () => {
    const tiny = computeLayout(ACTION_ENTRIES, {
      charWidth: CHAR,
      rightEdgeX: 50,
      topY: 0,
      availableWidth: 10,
      availableHeight: 600,
      preferredColumns: 3,
      keyChars: 8,
    });
    expect(tiny.columns).toBeGreaterThanOrEqual(1);
    expect(tiny.gridWidth).toBeGreaterThan(0);
  });
});

describe("layoutButtons", () => {
  it("gives every entry a distinct rectangle", () => {
    const buttons = layoutButtons(ACTION_ENTRIES, REAL);
    expect(buttons).toHaveLength(ACTION_ENTRIES.length);
    const keys = buttons.map((b) => `${b.rect.x},${b.rect.y}`);
    expect(new Set(keys).size, "two buttons share a rectangle").toBe(keys.length);
  });

  it("does not let one column overlap the next", () => {
    // The symptom of the pixel/character mix-up, asserted directly: a button's
    // right edge has to stay inside its own column.
    const buttons = layoutButtons(ACTION_ENTRIES, REAL);
    for (const b of buttons) {
      const col = Math.round((b.rect.x - REAL.originX) / (REAL.buttonWidth + REAL.gap));
      const limit = REAL.originX + col * (REAL.buttonWidth + REAL.gap) + REAL.buttonWidth;
      expect(b.rect.right, `${b.entry.label} overlaps the next column`).toBeLessThanOrEqual(limit);
    }
  });

  it("fills column by column, not row by row", () => {
    // With the shipped layout the columns are 6/6/4. Filling down the first column
    // is what keeps the six building actions together instead of splitting them
    // across a row boundary - and row-major looks correct in a screenshot.
    const rows = Math.ceil(ACTION_ENTRIES.length / REAL.columns);
    const buttons = layoutButtons(ACTION_ENTRIES, REAL);
    expect(buttons[0]!.rect.x).toBe(buttons[1]!.rect.x);
    expect(buttons[0]!.rect.y).not.toBe(buttons[1]!.rect.y);
    expect(buttons[0]!.rect.x).not.toBe(buttons[rows]!.rect.x);
    expect(buttons[0]!.rect.y).toBe(buttons[rows]!.rect.y);
  });
});

describe("buttonAt", () => {
  const buttons = layoutButtons(ACTION_ENTRIES, REAL);

  it("finds the button under a point", () => {
    const b = buttons[3]!;
    const hit = buttonAt(buttons, { x: b.rect.x + 2, y: b.rect.y + 2 } as never);
    expect(hit?.index).toBe(3);
  });

  it("returns null outside the grid, so a stray click closes rather than picks", () => {
    expect(buttonAt(buttons, { x: -50, y: -50 } as never)).toBeNull();
    expect(buttonAt(buttons, { x: 5_000, y: 5_000 } as never)).toBeNull();
  });

  it("treats the right and bottom edges as outside", () => {
    // Half-open, so two adjacent buttons cannot both claim a shared edge pixel.
    const b = buttons[0]!;
    expect(buttonAt(buttons, { x: b.rect.right, y: b.rect.y } as never)).toBeNull();
    expect(buttonAt(buttons, { x: b.rect.x, y: b.rect.bottom } as never)).toBeNull();
  });
});

describe("moveSelection", () => {
  const n = ACTION_ENTRIES.length;
  const c = REAL.columns;

  it("stays in range and always lands on a real entry", () => {
    for (let i = 0; i < n; i++) {
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const) {
        const next = moveSelection(i, key, n, c);
        expect(next, `${key} from ${i}`).toBeGreaterThanOrEqual(0);
        expect(next, `${key} from ${i}`).toBeLessThan(n);
      }
    }
  });

  it("keeps the row when moving between columns", () => {
    // Moving one entry along would send Left from the top of column two into the
    // middle of column one, which is what makes a grid feel broken.
    const rows = Math.ceil(n / c);
    const topOfSecondColumn = rows; // row 0, column 1
    const next = moveSelection(topOfSecondColumn, "ArrowLeft", n, c);
    expect(next % rows).toBe(topOfSecondColumn % rows);
  });

  it("handles a short last column", () => {
    // Columns are filled in turn and the last is short (6/6/4), so modelling the
    // grid as a rectangle is what produced 16 and 17 - indices past the end of a
    // sixteen-entry list.
    const rows = Math.ceil(n / c);
    expect(n % c, "only interesting when the last column is short").not.toBe(0);
    for (let i = 0; i < rows + (rows - 1); i++) {
      const from = Math.min(i, n - 1);
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const) {
        const next = moveSelection(from, key, n, c);
        expect(next, `${key} from ${from} landed outside the list`).toBeLessThan(n);
        expect(next).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("wraps rather than sticking at an edge", () => {
    expect(moveSelection(0, "ArrowUp", n, c)).toBeGreaterThan(0);
    expect(moveSelection(n - 1, "ArrowDown", n, c)).toBeLessThan(n);
  });

  it("survives an empty list", () => {
    expect(moveSelection(0, "ArrowDown", 0, c)).toBe(0);
  });
});
