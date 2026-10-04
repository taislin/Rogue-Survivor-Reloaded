import { describe, it, expect, beforeAll } from "vitest";
import {
  RogueGame,
  MINIMAP_Y,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MENU_CHAR_WIDTH,
  MENU_BOLD_LINE_SPACING,
} from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Session } from "@engine/Session";
import {
  ACTION_ENTRIES,
  ACTION_MENU_COLUMNS,
  ACTION_MENU_MARGIN,
  computeLayout,
  layoutButtons,
} from "@ui/ActionMenu";

/**
 * The action menu, driven end to end.
 *
 * The property that matters and is invisible in a unit test of the grid: **the
 * menu paints an opaque panel behind itself.** `RedrawPlayScreen` leaves the map on
 * the canvas, and the first version drew the buttons straight onto it, so the map
 * showed through the gaps and behind the labels. It looked like a styling choice
 * and was a missing fill.
 *
 * The geometry below is **derived exactly as the screen derives it**, rather than
 * copied by hand. A hand-written copy is how the second version shipped a grid
 * whose columns overlapped: the width had been compared against a label length in
 * characters while the budget is in pixels.
 */

let game: RogueGame;
let ui: NullRogueUI;

// The screen's own inset, imported rather than retyped. See `ACTION_MENU_MARGIN`:
// it sets both the panel's position and its column budget, so a second copy here
// measures a layout the screen never used.
const MARGIN = ACTION_MENU_MARGIN;

beforeAll(async () => {
  Session.useSeed(4242);
  ui = new NullRogueUI();
  ui.recordText = true;
  game = new RogueGame(ui, new NullMusicManager());
  await game.LoadData();
});

function realLayout() {
  return computeLayout(ACTION_ENTRIES, {
    charWidth: MENU_CHAR_WIDTH,
    rightEdgeX: CANVAS_WIDTH - MARGIN,
    topY: MINIMAP_Y,
    // The whole canvas, because the panel is opaque, modal and grows leftward.
    availableWidth: CANVAS_WIDTH - MARGIN * 2,
    availableHeight: CANVAS_HEIGHT - 2 * MENU_BOLD_LINE_SPACING - MINIMAP_Y,
    preferredColumns: ACTION_MENU_COLUMNS,
    keyChars: 8,
  });
}

describe("the action menu screen", () => {
  /**
   * Opens the menu with `keys` as the keys it will see.
   *
   * **One sacrificial key first, and that is not a quirk of the test.**
   * `WaitKeyOrMouse` opens with `UI_PeekKey()`, which *consumes* — that is the C#
   * contract, and it is what stops a held key auto-repeating into the menu. In game
   * the key that opened the menu was already consumed by the turn loop's own wait,
   * so the peek finds nothing pending and the player presses afresh. A test that
   * queues keys has no such key, so its first one is eaten and every assertion
   * lands a step out.
   */
  async function openWith(...keys: string[]): Promise<unknown> {
    ui.clearRecordedText();
    ui.pushKeys("Shift", ...keys);
    return await game.HandleActionMenu();
  }

  it("paints an opaque panel that covers every button", async () => {
    await openWith("Escape");

    expect(ui.drawnFills.length, "no fill was painted, so the map shows through").toBeGreaterThan(0);
    const panel = ui.drawnFills[0]!;

    const layout = realLayout();
    for (const b of layoutButtons(ACTION_ENTRIES, layout)) {
      expect(ui.coversRect(panel, b.rect), `${b.entry.label} is not inside the panel`).toBe(true);
    }

    // And the header and footer text, which sit outside the button grid and were
    // the other thing left sitting on the map.
    const rows = Math.ceil(ACTION_ENTRIES.length / layout.columns);
    const headerY = layout.originY - MENU_BOLD_LINE_SPACING;
    const footerY = layout.originY + (rows + 1) * (layout.buttonHeight + layout.gap);
    expect(panel.y, "the header text is above the panel").toBeLessThanOrEqual(headerY);
    expect(panel.bottom, "the footer text is below the panel").toBeGreaterThanOrEqual(footerY);
  });

  it("keeps every column on the canvas, with no overlap", async () => {
    // The symptom from the screenshot, asserted where it can be seen in a test:
    // a button's right edge has to stay inside its own column, and the whole grid
    // has to stay on the canvas.
    const layout = realLayout();
    expect(layout.originX, "the grid runs off the left edge").toBeGreaterThanOrEqual(0);
    expect(layout.originX + layout.gridWidth, "the grid runs off the right edge").toBeLessThanOrEqual(
      CANVAS_WIDTH,
    );
    for (const b of layoutButtons(ACTION_ENTRIES, layout)) {
      const col = Math.round((b.rect.x - layout.originX) / (layout.buttonWidth + layout.gap));
      const limit =
        layout.originX + col * (layout.buttonWidth + layout.gap) + layout.buttonWidth;
      expect(b.rect.right, `${b.entry.label} overlaps the next column`).toBeLessThanOrEqual(limit);
    }
  });

  it("uses more than one column", async () => {
    // Budgeting the panel only the ~340px to the minimap's right dropped it to a
    // single column, which is a list wearing a grid's clothes.
    expect(realLayout().columns).toBeGreaterThan(1);
  });

  it("closes on Escape without choosing anything", async () => {
    await expect(openWith("Escape")).resolves.toBeNull();
  });

  it("closes on its own hotkey", async () => {
    await expect(openWith("Tab")).resolves.toBeNull();
  });

  it("returns the command for the selected button", async () => {
    await expect(openWith("Enter")).resolves.toBe(ACTION_ENTRIES[0]!.command);
  });

  it("moves the selection with the arrow keys before choosing", async () => {
    // Down then Enter, from a grid that fills column by column: one Down is still
    // inside the first column, so it must be the *second* entry.
    await expect(openWith("ArrowDown", "Enter")).resolves.toBe(ACTION_ENTRIES[1]!.command);
  });

  it("shows every action's label", async () => {
    await openWith("Escape");
    const drawn = ui.drawnLines.join("\n");
    for (const e of ACTION_ENTRIES) {
      expect(drawn, `${e.label} is not on the menu`).toContain(e.label);
    }
  });
});
