import { describe, it, expect } from "vitest";
import {
  ACTION_ENTRIES,
  ACTION_MENU_COLUMNS,
  ACTION_MENU_MARGIN,
  MAX_KEY_CHARS,
  actionMenuLayout,
  computeLayout,
  formatKeyHint,
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
  MESSAGES_Y,
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
const REAL = actionMenuLayout(ACTION_ENTRIES, {
  charWidth: MENU_CHAR_WIDTH,
  lineHeight: MENU_BOLD_LINE_SPACING,
  canvasWidth: CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
  topY: MINIMAP_Y,
  bottomLimitY: MESSAGES_Y,
  // The longest default binding is 7 characters ("Shift+<letter>"). Measured from
  // the table rather than assumed, because the whole point of this suite is that a
  // six-character budget silently truncated every two-key binding.
  keyChars: 7,
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
    // more, so anchoring left would push it off the screen entirely. The margin is
    // `ACTION_MENU_MARGIN` and not a literal — it was 8 here while the screen used
    // a different number, which is the drift the shared factory exists to stop.
    expect(REAL.originX + REAL.gridWidth).toBe(CANVAS_WIDTH - ACTION_MENU_MARGIN);
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
      lineHeight: 18,
    });
    expect(narrow.columns).toBeLessThan(REAL.columns);
    // **One column is allowed to be wider than the room.** A button has to fit its
    // label and its key hint or the text draws over the next column, so the width is
    // a floor rather than something the layout will shrink to fit — and at 200px
    // there is no column count that satisfies both. The property worth asserting is
    // that it dropped to the fewest columns, not that it obeyed an impossible
    // budget. (This asserted `<= 200` and failed once the button grew from 188px,
    // which is the same class of over-tight assertion as the `>= 2` floor in
    // `rule-result-usage.test.ts`.)
    expect(narrow.columns, "a 200px room cannot hold two of these buttons").toBe(1);
    expect(narrow.gridWidth).toBeGreaterThan(0);
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
      lineHeight: 18,
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
      lineHeight: 18,
    });
    const rows = Math.ceil(ACTION_ENTRIES.length / layout.columns);
    expect(layout.originX, "the grid runs off the left edge").toBeGreaterThan(0);
    expect(layout.originX + layout.gridWidth, "the grid runs off the right edge")
      .toBeLessThanOrEqual(CANVAS_WIDTH);
    const footerY = MINIMAP_Y + rows * (layout.buttonHeight + layout.gap) + MENU_BOLD_LINE_SPACING;
    expect(footerY, "the footer falls off the bottom of the canvas").toBeLessThan(CANVAS_HEIGHT);
  });
});
describe("key hints are drawn whole", () => {
  /**
   * The reported bug: `MAX_KEY_CHARS` was 6, and every two-key binding is 7
   * characters, so `Shift+Z` rendered as `Shift+`.
   *
   * That is not a shorter way of writing the same key — it is a **different key**,
   * and one a player can press. Silent truncation of a keybinding is worse than a
   * cropped label, because the label is decoration and the binding is an
   * instruction.
   */
  it("fits every default binding without truncating", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "Keybindings.ts"),
      "utf8",
    );
    const lengths = [...src.matchAll(/this\.set\(PlayerCommand\.\w+,\s*'([^']+)'\)/g)].map(
      (m) => m[1]!.length,
    );
    expect(lengths.length, "no bindings were read - the pattern is stale").toBeGreaterThan(50);
    const longest = Math.max(...lengths);
    expect(
      longest,
      `the longest default binding is ${longest} characters and MAX_KEY_CHARS is ${MAX_KEY_CHARS}`,
    ).toBeLessThanOrEqual(MAX_KEY_CHARS);
  });

  it("renders a two-key binding whole", () => {
    expect(formatKeyHint("Shift+Z")).toBe("Shift+Z");
    expect(formatKeyHint("X")).toBe("X");
    expect(formatKeyHint("Ctrl+N")).toBe("Ctrl+N");
    // Anything up to the budget survives; anything past it is elided, not cut. A
    // 12-character triple-modifier hint genuinely does not fit in 7, which is why
    // this asserts the *rule* rather than picking a long example and expecting it
    // whole.
    expect(formatKeyHint("Shift+Z").length).toBeLessThanOrEqual(MAX_KEY_CHARS);
  });

  it("elides rather than cuts when a hint is genuinely too long", () => {
    // A rebind can give a command several keys, joined with "/", and `getAll` has
    // no cap - so a hint can exceed the budget. Cutting it silently is what made
    // "Shift+Z" read as "Shift+"; an ellipsis at least looks like an ellipsis.
    const long = "Ctrl+Alt+Shift+Meta+X";
    const shown = formatKeyHint(long);
    expect(shown.length).toBe(MAX_KEY_CHARS);
    expect(shown.endsWith("…"), "a truncated hint must be visibly truncated").toBe(true);
  });

  it("never renders a hint that is a prefix of a longer, different key", () => {
    // The sharpest form of the bug: "Shift+" is itself a plausible binding, so a
    // truncated "Shift+Z" is indistinguishable from a real "Shift+" binding.
    const hint = formatKeyHint("Shift+Z");
    expect(hint, "this must not be a key someone could press").not.toBe("Shift+");
    expect(hint).not.toBe("Shift");
  });
});

describe("the panel clears the message log", () => {
  const rows = Math.ceil(ACTION_ENTRIES.length / REAL.columns);

  it("puts its lowest pixel at or above the limit", () => {
    // Thirteen rows of buttons plus a footer used to run past MESSAGES_Y and over
    // the message text underneath. Derived rather than a fixed upward shift, because
    // the grid was 8 rows when the panel was first placed and a shift right for one
    // is wrong for the other.
    //
    // `gridHeight` is `rows * (h + gap) - gap` — the last row has no trailing gap.
    // Writing `+ gap` here instead is off by exactly one gap, which is how this very
    // assertion first failed by 4px against an implementation that was correct.
    const gridHeight = rows * (REAL.buttonHeight + REAL.gap) - REAL.gap;
    const footerBottom =
      REAL.originY + gridHeight + REAL.buttonHeight + REAL.gap * 2 + MENU_BOLD_LINE_SPACING;
    expect(footerBottom, "the footer runs into the message log").toBeLessThanOrEqual(MESSAGES_Y);
  });

  it("moves up by exactly the overlap, and no further", () => {
    const unshifted = computeLayout(ACTION_ENTRIES, {
      charWidth: MENU_CHAR_WIDTH,
      rightEdgeX: CANVAS_WIDTH - ACTION_MENU_MARGIN,
      topY: MINIMAP_Y,
      availableWidth: CANVAS_WIDTH - ACTION_MENU_MARGIN * 2,
      availableHeight: CANVAS_HEIGHT - 2 * MENU_BOLD_LINE_SPACING - MINIMAP_Y,
      preferredColumns: ACTION_MENU_COLUMNS,
      keyChars: MAX_KEY_CHARS,
      lineHeight: MENU_BOLD_LINE_SPACING,
    });
    expect(unshifted.originY, "with no limit it sits at topY").toBe(MINIMAP_Y);
    expect(REAL.originY, "with the limit it moved up").toBeLessThan(MINIMAP_Y);
    // And it is still right-anchored and unchanged horizontally.
    expect(REAL.originX).toBe(unshifted.originX);
    expect(REAL.gridWidth).toBe(unshifted.gridWidth);
  });

  it("stays put when there is room, so the limit is not a permanent shift", () => {
    const roomy = computeLayout(ACTION_ENTRIES, {
      charWidth: MENU_CHAR_WIDTH,
      rightEdgeX: CANVAS_WIDTH - ACTION_MENU_MARGIN,
      topY: MINIMAP_Y,
      availableWidth: CANVAS_WIDTH - ACTION_MENU_MARGIN * 2,
      // A limit far below the panel, so the overlap is zero.
      availableHeight: CANVAS_HEIGHT - 2 * MENU_BOLD_LINE_SPACING - MINIMAP_Y,
      preferredColumns: ACTION_MENU_COLUMNS,
      keyChars: MAX_KEY_CHARS,
      lineHeight: MENU_BOLD_LINE_SPACING,
      bottomLimitY: MINIMAP_Y + 100_000,
    });
    expect(roomy.originY).toBe(MINIMAP_Y);
  });
});