import { describe, it, expect } from "vitest";
import {
  ACTION_ENTRIES,
  ACTION_MENU_COLUMNS,
  DEFAULT_LAYOUT,
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

describe("layoutButtons", () => {
  it("fits inside the minimap box it is drawn over", () => {
    // 100x100 map tiles at 2px each is a 200x200 box. A single column of 16
    // entries at this row height would be ~250px and overflow, which is the whole
    // reason this is a grid.
    const buttons = layoutButtons(ACTION_ENTRIES, {
      ...DEFAULT_LAYOUT,
      originX: 620,
      originY: 300,
      buttonWidth: 62,
      buttonHeight: 14,
      columns: ACTION_MENU_COLUMNS,
      gap: 2,
    });
    const right = Math.max(...buttons.map((b) => b.rect.right));
    const bottom = Math.max(...buttons.map((b) => b.rect.bottom));
    expect(right - 620, "grid is wider than the 200px minimap box").toBeLessThanOrEqual(200);
    expect(bottom - 300, "grid is taller than the 200px minimap box").toBeLessThanOrEqual(200);
  });

  it("gives every entry a distinct rectangle", () => {
    const buttons = layoutButtons(ACTION_ENTRIES);
    expect(buttons).toHaveLength(ACTION_ENTRIES.length);
    const keys = buttons.map((b) => `${b.rect.x},${b.rect.y}`);
    expect(new Set(keys).size, "two buttons share a rectangle").toBe(keys.length);
  });

  it("fills column by column, not row by row", () => {
    // With three columns and 16 entries the columns are 6/6/4. Filling down the
    // first column is what keeps the six building actions together instead of
    // splitting them across a row boundary - and it is the part that is easy to
    // get subtly wrong, since row-major looks correct in a screenshot.
    const buttons = layoutButtons(ACTION_ENTRIES, {
      ...DEFAULT_LAYOUT,
      columns: ACTION_MENU_COLUMNS,
    });
    const rows = Math.ceil(ACTION_ENTRIES.length / ACTION_MENU_COLUMNS);
    // Consecutive entries share a column: same x, different y.
    expect(buttons[0]!.rect.x).toBe(buttons[1]!.rect.x);
    expect(buttons[0]!.rect.y).not.toBe(buttons[1]!.rect.y);
    // One column down is a different column.
    expect(buttons[0]!.rect.x).not.toBe(buttons[rows]!.rect.x);
    expect(buttons[0]!.rect.y).toBe(buttons[rows]!.rect.y);
  });

  it("keeps a long label inside its button", () => {
    // A label wider than the button would run into the next column's hotkey hint.
    const width = DEFAULT_LAYOUT.buttonWidth;
    expect(longestLabel(ACTION_ENTRIES)).toBeLessThanOrEqual(width - 7);
  });
});

describe("buttonAt", () => {
  const buttons = layoutButtons(ACTION_ENTRIES, DEFAULT_LAYOUT);

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
  const c = ACTION_MENU_COLUMNS;

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
    const n2 = ACTION_ENTRIES.length;
    const rows = Math.ceil(n2 / c);
    const topOfSecondColumn = rows; // row 0, column 1
    const next = moveSelection(topOfSecondColumn, "ArrowLeft", n2, c);
    expect(next % rows).toBe(topOfSecondColumn % rows);
  });

  it("handles a short last column", () => {
    // 16 entries in 3 columns is 6/6/4, so the last column has no row 4 or 5.
    // Modelling it as a rectangle is what produced 16 and 17 - indices past the
    // end of the list - for ArrowRight out of the middle of column two.
    const rows = Math.ceil(n / c);
    expect(n % c, "this case is only interesting when the last column is short").not.toBe(0);
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
