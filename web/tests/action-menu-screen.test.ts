import { describe, it, expect, beforeAll } from "vitest";
import { RogueGame, MINIMAP_X, MINIMAP_Y, MENU_BOLD_LINE_SPACING } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Session } from "@engine/Session";
import { ACTION_ENTRIES, layoutButtons, ACTION_MENU_COLUMNS } from "@ui/ActionMenu";

/**
 * The action menu, driven end to end.
 *
 * The property that matters and is invisible in a unit test of the grid: **the
 * menu paints an opaque panel behind itself.** `RedrawPlayScreen` leaves the map
 * on the canvas, and the first version drew the buttons straight onto it, so the
 * map showed through the gaps and behind the labels. It looked like a styling
 * choice and was a missing fill.
 */

let game: RogueGame;
let ui: NullRogueUI;

beforeAll(async () => {
  Session.useSeed(4242);
  ui = new NullRogueUI();
  ui.recordText = true;
  game = new RogueGame(ui, new NullMusicManager());
  await game.LoadData();
});

describe("the action menu screen", () => {
  /**
   * Opens the menu with `keys` as the keys it will see.
   *
   * **One sacrificial key first, and that is not a quirk of the test.** `WaitKeyOrMouse`
   * opens with `UI_PeekKey()`, which *consumes* — that is the C# contract, and it is
   * what stops a held key auto-repeating into the menu. In game the key that opened
   * the menu was already consumed by the turn loop's own wait, so the peek finds
   * nothing pending and the player presses afresh. A test that queues keys directly
   * has no such key, so its first one is eaten by the peek and every assertion lands
   * a step out. The throwaway documents that instead of leaving the next reader to
   * rediscover it as an off-by-one.
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

    // The same geometry the screen lays its buttons out with.
    const rows = Math.ceil(ACTION_ENTRIES.length / ACTION_MENU_COLUMNS);
    const layout = {
      originX: MINIMAP_X + 2,
      originY: MINIMAP_Y + 2,
      buttonWidth: 62,
      buttonHeight: 14,
      columns: ACTION_MENU_COLUMNS,
      gap: 2,
    };
    for (const b of layoutButtons(ACTION_ENTRIES, layout)) {
      expect(ui.coversRect(panel, b.rect), `${b.entry.label} is not inside the panel`).toBe(true);
    }

    // And the header and footer text, which sit outside the button grid and were
    // the other thing left sitting on the map.
    const headerY = layout.originY - MENU_BOLD_LINE_SPACING;
    const footerY = layout.originY + (rows + 1) * (layout.buttonHeight + layout.gap);
    expect(panel.y, "the header text is above the panel").toBeLessThanOrEqual(headerY);
    expect(panel.bottom, "the footer text is below the panel").toBeGreaterThanOrEqual(footerY);
  });

  it("closes on Escape without choosing anything", async () => {
    await expect(openWith("Escape")).resolves.toBeNull();
  });

  it("closes on its own hotkey", async () => {
    await expect(openWith("Tab")).resolves.toBeNull();
  });

  it("returns the command for the selected button", async () => {
    // The first entry is selected on open, so Enter chooses it.
    await expect(openWith("Enter")).resolves.toBe(ACTION_ENTRIES[0]!.command);
  });

  it("moves the selection with the arrow keys before choosing", async () => {
    // Down then Enter, from a grid that fills column by column: one Down is still
    // inside the first column, so it must be the *second* entry and not the
    // seventh.
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
