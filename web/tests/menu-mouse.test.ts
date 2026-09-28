import { describe, it, expect } from "vitest";
import {
  MENU_CHAR_WIDTH,
  MENU_COLUMN_GAP,
  MENU_LABEL_PREFIX,
  menuEntryWidth,
  menuValueColumnX,
  MENU_WHEEL_ROWS,
} from "@engine/RogueGame";

/**
 * A menu row's clickable band has to be the width of the text that was drawn.
 *
 * The main menu is clickable now (`HandleMainMenu` uses `MenuRowAtMouse`), and
 * the band it hit-tests against is recorded by `DrawMenuOrOptions` as it draws —
 * the point being that the click and the text cannot disagree. That only holds
 * while both derive the label width the same way, and the two are separate
 * functions: `menuEntryWidth` for the right edge of a label-only row,
 * `menuValueColumnX` for where the value column starts.
 *
 * If those drift, the symptom is not a crash. It is a row whose text overhangs
 * a click target that stops short of it, so the last character of the longest
 * entry is unclickable — and only at that one window size, because both are in
 * logical pixels and the mismatch is in the layout, not the scale. Which is why
 * this is asserted rather than eyeballed.
 */
describe("menu label width", () => {
  const entries = ["New Game", "(Load Game)", "Redefine keys", "Quit Game"];

  it("includes the ---> prefix, which is wider than the unselected form", () => {
    // The prefix is 6 glyphs ("---> "), the unselected form is 5 spaces. Sizing
    // off the unselected form is what would put the click edge inside the
    // arrow of the selected row.
    const widest = "Redefine keys".length;
    expect(menuEntryWidth(["x".repeat(widest)])).toBe(
      (MENU_LABEL_PREFIX + widest) * MENU_CHAR_WIDTH,
    );
  });

  it("scales with the number of glyphs, at the fixed menu advance", () => {
    const one = menuEntryWidth(["a"]);
    const two = menuEntryWidth(["ab"]);
    expect(two - one).toBe(MENU_CHAR_WIDTH);
  });

  it("takes the widest entry, not the last", () => {
    expect(menuEntryWidth(["a", "a much longer entry", "ab"])).toBe(
      menuEntryWidth(["a much longer entry"]),
    );
  });

  it("is zero for an empty list rather than negative", () => {
    expect(menuEntryWidth([])).toBe(0);
  });

  it("stays clear of the value column for a label-only-sized gap", () => {
    // The two must agree about the widest label: the value column starts past
    // that width plus a gap, and a label-only row's click edge is that same
    // width. A row can therefore be at most MENU_COLUMN_GAP short of the value
    // column when the padding floor is not the binding constraint, and must
    // never exceed it.
    const column = menuValueColumnX(0, entries, 0);
    const rowWidth = menuEntryWidth(entries);
    expect(rowWidth).toBeLessThanOrEqual(column);
    expect(column - rowWidth).toBe(MENU_COLUMN_GAP);
  });

  it("lets the padding floor win for short labels, without going backwards", () => {
    // menuValueColumnX takes a max(), so a generous rightPadding is honoured
    // and the column is pushed out. The label width is unaffected, which is the
    // point: the floor moves the *value*, never the label.
    const wide = 400;
    expect(menuValueColumnX(0, entries, wide)).toBe(wide);
    expect(menuEntryWidth(entries)).toBeLessThan(wide);
  });

  it("offsets both by gx, so a menu drawn off the left edge is still hit-testable", () => {
    const gx = 40;
    expect(menuEntryWidth(entries)).toBe(menuValueColumnX(0, entries, 0) - MENU_COLUMN_GAP);
    expect(menuValueColumnX(gx, entries, 0)).toBe(gx + menuValueColumnX(0, entries, 0));
  });
});

/**
 * A wheel notch moves the selection by a readable step, not by a platform's
 * idea of one.
 *
 * `UI_PeekWheel` returns *pixels*: Firefox reports lines and Chrome pixels for
 * the same gesture, and `InputHandler.wheelPixels` normalises them. A menu that
 * used the raw number as a row count would therefore move about three rows in
 * Chrome and one in Firefox, which reads as a broken wheel rather than a units
 * difference.
 */
describe("MENU_WHEEL_ROWS", () => {
  it("is one row per notch", () => {
    expect(MENU_WHEEL_ROWS).toBe(1);
  });
});
