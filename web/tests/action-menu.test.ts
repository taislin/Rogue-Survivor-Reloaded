import { describe, it, expect } from "vitest";
import {
  ACTION_ENTRIES,
  ACTION_MENU_COLUMNS,
  ACTION_MENU_MARGIN,
  MAX_KEY_CHARS,
  computeLayout,
  layoutButtons,
  buttonAt,
  moveSelection,
  longestLabel,
} from "@ui/ActionMenu";
import { PlayerCommand } from "@engine/PlayerCommand";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MINIMAP_Y,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MENU_CHAR_WIDTH,
  MENU_BOLD_LINE_SPACING,
} from "@engine/RogueGame";

/**
 * The action menu's layout, hit-testing and keyboard navigation.
 *
 * Kept out of the drawing deliberately: every question here is one that can be
 * settled without a browser, and each of them was answered wrongly at least once
 * while writing the screen that uses it.
 */

/** `RogueGame.MENU_CHAR_WIDTH`, imported rather than retyped - see below. */
const CHAR = MENU_CHAR_WIDTH;

/**
 * The canvas, and where the minimap sits vertically, **imported from
 * `RogueGame` rather than written here**.
 *
 * These were literals, and `MINIMAP_Y` was wrong by 288px: 187 against a real 475,
 * because it was transcribed from an early draft of the layout and the minimap's
 * position is derived —
 *
 *     MESSAGES_Y = TILE_VIEW_HEIGHT * TILE_SIZE + 4      = 676
 *     MINIMAP_Y  = MESSAGES_Y - MINITILE_SIZE * MAP_MAX_HEIGHT - 1 = 475
 *
 * so it is not a number anyone can read off the screen and copy. A wrong `topY`
 * does not fail a layout test, it just quietly tests a layout nobody ships. Same
 * argument as the font metric, one level up: every constant the screen derives its
 * geometry from now comes from the module that defines it.
 */

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

  it("never leaves the list, whatever the column count", () => {
    // Columns are filled in turn and the last is short whenever the count does not
    // divide evenly — 16 in 3 columns is 6/6/4. Modelling that as a rectangle is
    // what produced indices 16 and 17 for a sixteen-entry list.
    //
    // Checked across several column counts rather than only the shipped one,
    // because the shipped layout happens to divide evenly (16 in 2) and would
    // leave the short-column case untested the moment the column count changed.
    for (const cols of [2, 3, 4, 5, 6, 7]) {
      const rows = Math.ceil(n / cols);
      expect(Math.min(rows * cols, n), `${cols} columns`).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const) {
          const next = moveSelection(i, key, n, cols);
          expect(next, `${key} from ${i} at ${cols} columns landed outside the list`).toBeLessThan(n);
          expect(next).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("reaches every entry, so nothing is unreachable", () => {
    // Walk it the way a player does: down a column, then right, then down again.
    // ArrowDown alone only ever cycles within one column, which is correct -
    // expecting it to cross columns is the bug this test was written against.
    for (const cols of [2, 3, 5]) {
      const rows = Math.ceil(n / cols);
      const seen = new Set<number>();
      let at = 0;
      seen.add(at);
      for (let col = 0; col < cols; col++) {
        const target = Math.min(rows, Math.max(0, n - col * rows));
        for (let step = 0; step < target + 1; step++) {
          at = moveSelection(at, "ArrowDown", n, cols);
          seen.add(at);
        }
        at = moveSelection(at, "ArrowRight", n, cols);
        seen.add(at);
      }
      expect(seen.size, `${cols} columns cannot reach every entry`).toBe(n);
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

describe("the action list covers what a player reaches for", () => {
  /**
   * The menu shipped with sixteen entries and no way to trade, lead a follower,
   * push, pull, mark enemies or unload a gun - all of which have a keybinding, a
   * handler, and are things you do mid-run. A menu that lists "Give Item" but not
   * "Trade" is not a shorter menu, it is the only place a player could discover
   * those actions exist.
   *
   * Pinned by name rather than by count, because the failure was a *missing* action
   * rather than a wrong number: a count would have gone from 16 to 25 silently.
   */
  const REQUIRED: Array<[PlayerCommand, string]> = [
    [PlayerCommand.NEGOCIATE_TRADE, "Trade"],
    [PlayerCommand.PULL_MODE, "Pull"],
    [PlayerCommand.PUSH_MODE, "Push"],
    [PlayerCommand.SWITCH_PLACE, "Swap Place"],
    [PlayerCommand.LEAD_MODE, "Take Lead"],
    [PlayerCommand.ORDER_MODE, "Order"],
    [PlayerCommand.MARK_ENEMIES_MODE, "Mark Enemies"],
    [PlayerCommand.UNLOAD_AMMO, "Unload Ammo"],
    [PlayerCommand.SWAP_INVENTORY, "Swap Bag"],
  ];

  it.each(REQUIRED)("offers %s as %j", (command, label) => {
    const entry = ACTION_ENTRIES.find((e) => e.command === command);
    expect(entry, `${label} is missing from the action menu`).toBeDefined();
    expect(entry!.label).toBe(label);
  });

  it("has no duplicate commands, so no button dispatches the same action twice", () => {
    const seen = new Set<PlayerCommand>();
    for (const e of ACTION_ENTRIES) {
      expect(seen.has(e.command), `${e.label} appears twice`).toBe(false);
      seen.add(e.command);
    }
  });

  it("has no duplicate labels", () => {
    const seen = new Set<string>();
    for (const e of ACTION_ENTRIES) {
      expect(seen.has(e.label), `"${e.label}" appears twice`).toBe(false);
      seen.add(e.label);
    }
  });

  /**
   * The property that makes a button equivalent to its key: the play loop's own
   * `switch` must have a `case` for it. An entry naming a command with no case
   * would compile, draw, highlight, and do nothing - and there is no way to notice
   * without pressing it in a running game.
   *
   * A source scan, deliberately, and narrowly: it is the only thing that can
   * compare a list against a `switch` 8,000 lines away. It matches `case
   * PlayerCommand.NAME:` exactly, so it cannot be satisfied by a mention in prose.
   */
  it("only names commands the play loop has a case for", () => {
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "RogueGame.ts"),
      "utf8",
    );
    // `PlayerCommand[NEGOCIATE_TRADE]` rather than `${e.command}`: the enum is
    // numeric, so interpolating the value yields the ordinal ("32"), and the
    // pattern silently matches nothing. That is what the first version of this
    // test did, and it reported all 25 entries as missing — which reads like a
    // catastrophic bug rather than a broken regex.
    const missing = ACTION_ENTRIES.filter((e) => {
      const name = PlayerCommand[e.command];
      expect(name, `${e.command} is not a member of PlayerCommand`).toBeTruthy();
      return !new RegExp(`case\\s+PlayerCommand\\.${name}\\b`).test(src);
    }).map((e) => `${e.label} (${PlayerCommand[e.command]})`);
    expect(missing, "these buttons would draw but do nothing").toEqual([]);
  });

  it("still omits the groups that are deliberately not actions", () => {
    const commands = ACTION_ENTRIES.map((e) => e.command);
    // Movement is relative to facing, so a button labelled "North" is a lie the
    // moment you turn.
    for (const dir of [
      PlayerCommand.MOVE_N,
      PlayerCommand.MOVE_NE,
      PlayerCommand.MOVE_E,
      PlayerCommand.MOVE_S,
      PlayerCommand.MOVE_W,
    ] as const) {
      expect(commands, `${dir} has no correct button label`).not.toContain(dir);
    }
    // The inventory panel's job, and already clickable there.
    expect(commands).not.toContain(PlayerCommand.ITEM_SLOT_0);
    // Meta commands. "Quit Game" on a grid you might click is a good way to lose a
    // run.
    expect(commands).not.toContain(PlayerCommand.QUIT_GAME);
    expect(commands).not.toContain(PlayerCommand.SAVE_GAME);
  });

  it("fits the two-column layout with room to spare", () => {
    // 25 entries in 2 columns is 13 rows. The panel starts at the minimap's top
    // edge, so the grid has to clear the bottom of the canvas with the footer under
    // it - and a longer list would silently run off the screen instead of failing.
    const layout = computeLayout(ACTION_ENTRIES, {
      charWidth: MENU_CHAR_WIDTH,
      rightEdgeX: CANVAS_WIDTH - ACTION_MENU_MARGIN,
      topY: MINIMAP_Y,
      availableWidth: CANVAS_WIDTH - ACTION_MENU_MARGIN * 2,
      availableHeight: CANVAS_HEIGHT - 2 * MENU_BOLD_LINE_SPACING - MINIMAP_Y,
      preferredColumns: ACTION_MENU_COLUMNS,
      keyChars: 6,
    });
    const rows = Math.ceil(ACTION_ENTRIES.length / layout.columns);
    expect(layout.originX, "the grid runs off the left edge").toBeGreaterThan(0);
    expect(layout.originX + layout.gridWidth, "the grid runs off the right edge")
      .toBeLessThanOrEqual(CANVAS_WIDTH);
    const footerY = MINIMAP_Y + rows * (layout.buttonHeight + layout.gap) + MENU_BOLD_LINE_SPACING;
    expect(footerY, "the footer falls off the bottom of the canvas").toBeLessThan(CANVAS_HEIGHT);
  });
});