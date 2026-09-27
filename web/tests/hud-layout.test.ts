import { describe, it, expect } from "vitest";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MAP_PANEL_WIDTH,
  MAP_PANEL_HEIGHT,
  TILE_SIZE,
  RIGHTPANEL_X,
  RIGHTPANEL_TEXT_X,
  RIGHTPANEL_TEXT_Y,
  INVENTORYPANEL_Y,
  SIDEPANEL_SECTION_HEIGHT,
  SIDEPANEL_TITLE_LEADING,
  GROUNDINVENTORYPANEL_Y,
  CORPSESPANEL_Y,
  SKILLTABLE_Y,
  SKILLTABLE_LINES,
  SKILLTABLE_COLUMN_PITCH,
  SKILLTABLE_LEVEL_WIDTH,
  MESSAGES_Y,
  MESSAGES_SPACING,
  MAX_MESSAGES,
  MINIMAP_X,
  MINIMAP_Y,
  MINITILE_SIZE,
  MAP_MAX_WIDTH,
  MAP_MAX_HEIGHT,
  TILE_VIEW_WIDTH,
  TILE_VIEW_HEIGHT,
  LOCATIONPANEL_Y,
  LOCATIONPANEL_TEXT_Y,
  LOCATIONPANEL_LINE_SPACING,
  INVENTORY_SLOTS_PER_LINE,
  LINE_SPACING,
  BOLD_LINE_SPACING,
  menuValueColumnX,
  MENU_CHAR_WIDTH,
  MENU_COLUMN_GAP,
  MENU_LABEL_PREFIX,
} from "@engine/RogueGame";
import { Skills } from "@gameplay/Skills";
import { Session, GameMode } from "@engine/Session";
import { MINIMAP_W, MINIMAP_H } from "@ui/CanvasUI";

/**
 * The HUD has no layout engine. Every block is a hardcoded pixel offset, and the
 * blocks are packed edge to edge: status -> inventory -> ground -> corpses ->
 * skills -> minimap down one column, log and location panel sharing one strip
 * underneath. That means a font bump does not fail, it *overlaps* — and an
 * overlapping HUD throws nothing, so a headless run stays green and a 1 000
 * turn sim stays green.
 *
 * That is precisely what happened when the HUD font went 8.25pt -> 10pt: the
 * skill table needed 120 px instead of 96 and ran 11 px under the minimap. The
 * fix was to shrink the per-panel pitch, which is only discoverable by doing
 * the arithmetic — so here it is, as assertions.
 *
 * These are regression tests for the *geometry*, not for the drawing. The one
 * place real text measurement is unavoidable is the horizontal checks, which use
 * a nominal monospace advance; those are written with slack so a font that
 * renders slightly wide is still fine and only a genuine overflow trips them.
 */

/** Nominal advance of one glyph in the 10pt HUD font (~0.6em), in px. */
const CHAR_ADVANCE = 8;
/** Nominal line box of the 10pt HUD font, in px. */
const GLYPH_HEIGHT = 13;
/** Widest of the status words drawn in `DrawActorStatus`, e.g. "EXHAUSTED!". */
const LONGEST_STATUS_WORD = "EXHAUSTED!";

const sidePanelWidth = CANVAS_WIDTH - RIGHTPANEL_X;
/** How many item slots actually sit on one row, i.e. the width that costs. */
const inventoryRowWidth = INVENTORY_SLOTS_PER_LINE * TILE_SIZE;

describe("HUD vertical stack: nothing overlaps", () => {
  it("the status block fits above the inventory panel", () => {
    // `DrawActorStatus` draws a name row plus one row per stat (HP, STA, FOO,
    // ROT, SLP, SAN, INF), each advancing BOLD_LINE_SPACING. `INVENTORYPANEL_Y`
    // hardcodes the block height at RIGHTPANEL_TEXT_Y + 170, so this is the
    // assertion that the 170 is still enough for the larger leading.
    const rows = 8;
    const blockBottom = RIGHTPANEL_TEXT_Y + rows * BOLD_LINE_SPACING;
    expect(blockBottom).toBeLessThanOrEqual(INVENTORYPANEL_Y);
  });

  it("each item panel gets enough room for its title, icon row and slot numbers", () => {
    // `DrawInventory` draws three things per panel: the title, stepped back by
    // `SIDEPANEL_TITLE_LEADING`; a row of `TILE_SIZE` icons; and the slot numbers
    // on the text line below the icons. The previous version of this check added
    // up only the last two (32 + 13) and treated the remainder as air, which
    // ignored the title: at 56 the numbers' line ended 6 px *below* where the
    // next panel's title began, so every panel's numbers printed across the next
    // panel's title. Sizing from all three is what keeps them apart.
    const perSection = SIDEPANEL_TITLE_LEADING + TILE_SIZE + GLYPH_HEIGHT;
    expect(SIDEPANEL_SECTION_HEIGHT).toBeGreaterThanOrEqual(perSection);
    // The overlap itself, in the drawing's own terms: one panel's numbers must
    // end above where the next panel's title starts.
    expect(INVENTORYPANEL_Y + TILE_SIZE + GLYPH_HEIGHT).toBeLessThanOrEqual(
      GROUNDINVENTORYPANEL_Y - SIDEPANEL_TITLE_LEADING,
    );
    expect(GROUNDINVENTORYPANEL_Y).toBe(INVENTORYPANEL_Y + SIDEPANEL_SECTION_HEIGHT);
    expect(CORPSESPANEL_Y).toBe(GROUNDINVENTORYPANEL_Y + SIDEPANEL_SECTION_HEIGHT);
    expect(SKILLTABLE_Y).toBe(CORPSESPANEL_Y + SIDEPANEL_SECTION_HEIGHT);
  });

  it("the skill table ends above the minimap", () => {
    // The one that actually broke. 8 rows at LINE_SPACING is the whole cost.
    const tableBottom = SKILLTABLE_Y + SKILLTABLE_LINES * LINE_SPACING;
    expect(tableBottom).toBeLessThanOrEqual(MINIMAP_Y);
  });

  it("the minimap sits inside the canvas", () => {
    expect(MINIMAP_X).toBeGreaterThanOrEqual(RIGHTPANEL_X);
    expect(MINIMAP_X + MAP_MAX_WIDTH * MINITILE_SIZE).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(MINIMAP_Y).toBeGreaterThanOrEqual(SKILLTABLE_Y);
    expect(MINIMAP_Y + MAP_MAX_HEIGHT * MINITILE_SIZE).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });
});

describe("the minimap and what is drawn on it share one coordinate space", () => {
  /**
   * `UI_DrawMinimap` used to take only a position and drew the raster at its own
   * size, i.e. 1px per tile, while everything positioned on the minimap worked in
   * `MINITILE_SIZE` pixels per tile. The map therefore came out at half size, and
   * the view rect -- the box showing where the player is and what the screen
   * covers -- sat at twice its offset from the minimap's origin, out in the empty
   * part of the panel.
   *
   * So the drawn size is now the engine's to state, and these checks are here to
   * hold the two sides together: the raster is one pixel per tile, the drawn map
   * is `MINITILE_SIZE` per tile, and every box on it stays inside.
   */
  const drawnW = MAP_MAX_WIDTH * MINITILE_SIZE;
  const drawnH = MAP_MAX_HEIGHT * MINITILE_SIZE;

  it("keeps the renderer's raster at one pixel per map tile", () => {
    // If the raster's size and the engine's idea of the maximum map size ever
    // diverge, the scale factor below stops meaning "pixels per tile".
    expect(MINIMAP_W).toBe(MAP_MAX_WIDTH);
    expect(MINIMAP_H).toBe(MAP_MAX_HEIGHT);
  });

  it("draws the map larger than its raster", () => {
    expect(drawnW).toBeGreaterThan(MINIMAP_W);
    expect(drawnH).toBeGreaterThan(MINIMAP_H);
  });

  it("puts the view rect on the map, wherever the camera is", () => {
    // The view rect is drawn at `MINIMAP_X + left * MINITILE_SIZE`, so the only
    // way it can miss the map is if the two disagree on the scale. Check all
    // four corners of the map against the drawn extent.
    for (const [x, y] of [[0, 0], [MAP_MAX_WIDTH, 0], [0, MAP_MAX_HEIGHT], [MAP_MAX_WIDTH, MAP_MAX_HEIGHT]]) {
      const rectX = MINIMAP_X + x * MINITILE_SIZE;
      const rectY = MINIMAP_Y + y * MINITILE_SIZE;
      expect(rectX).toBeGreaterThanOrEqual(MINIMAP_X);
      expect(rectY).toBeGreaterThanOrEqual(MINIMAP_Y);
      expect(rectX).toBeLessThanOrEqual(MINIMAP_X + drawnW);
      expect(rectY).toBeLessThanOrEqual(MINIMAP_Y + drawnH);
    }
  });

  it("fits a full-width view rect inside the drawn map", () => {
    // The widest the camera ever gets, at the far corner, has to land on the map
    // rather than past its edge.
    const viewW = TILE_VIEW_WIDTH * MINITILE_SIZE;
    const viewH = TILE_VIEW_HEIGHT * MINITILE_SIZE;
    expect(viewW).toBeLessThanOrEqual(drawnW);
    expect(viewH).toBeLessThanOrEqual(drawnH);
    expect(MINIMAP_X + (MAP_MAX_WIDTH - TILE_VIEW_WIDTH) * MINITILE_SIZE + viewW)
      .toBeLessThanOrEqual(MINIMAP_X + drawnW);
  });

  it("has no room to grow without taking from the skill table", () => {
    // `MINIMAP_Y` is derived from the bottom strip, and the skill table is packed
    // against it: 1 px of air above, none below, and the drawn map already fills
    // the strip exactly. So `MINITILE_SIZE` is not free to go up -- going from 2
    // to 3 wants 100 more px and would have to come out of the skill table or the
    // log. Pinning the numbers means that has to be done on purpose.
    const tableBottom = SKILLTABLE_Y + SKILLTABLE_LINES * LINE_SPACING;
    expect(MINIMAP_Y - tableBottom).toBe(1);
    expect(MINIMAP_Y + drawnH).toBe(MESSAGES_Y - 1);
  });
});

describe("bottom strip: the log and location panel share 92px", () => {
  it("the map panel ends where the bottom strip begins", () => {
    // The strip is whatever is left: CANVAS_HEIGHT - MESSAGES_Y. This is the
    // number that makes every check below tight, and it is *not* free to grow:
    // MINIMAP_Y is derived from MESSAGES_Y, so raising the strip would push the
    // minimap up into the skill table rather than into empty space.
    expect(MESSAGES_Y).toBe(MAP_PANEL_HEIGHT + 4);
    const stripHeight = CANVAS_HEIGHT - MESSAGES_Y;
    expect(stripHeight).toBeGreaterThan(0);
  });

  it("every visible log line fits in the strip", () => {
    // This is the constraint that capped the log at 6 lines. At 7 lines and
    // MESSAGES_SPACING 15 it needs 105 px and only has 92.
    expect(MAX_MESSAGES * MESSAGES_SPACING).toBeLessThanOrEqual(CANVAS_HEIGHT - MESSAGES_Y);
  });

  it("the location panel's last row fits on the canvas", () => {
    // Seven fixed rows (map, zone, day, hour, turn, score, life, murders).
    const lastRowY = LOCATIONPANEL_TEXT_Y + 6 * LOCATIONPANEL_LINE_SPACING;
    expect(lastRowY + GLYPH_HEIGHT).toBeLessThanOrEqual(CANVAS_HEIGHT);
  });

  it("the location panel keeps the compact leading, not the panel's", () => {
    // Documented as deliberate: the strip cannot afford LINE_SPACING here, so
    // the location panel is the one block left at C#'s 12 px. If this ever
    // equals LINE_SPACING the last row overflows, so assert they are distinct
    // and that the tight one is the one in use.
    expect(LOCATIONPANEL_LINE_SPACING).toBeLessThan(LINE_SPACING);
  });

  it("the log and the location panel do not overlap horizontally", () => {
    // They sit side by side, so the log is bounded by the panel divider.
    expect(MAP_PANEL_WIDTH).toBeLessThan(RIGHTPANEL_X);
    expect(MESSAGES_Y).toBe(LOCATIONPANEL_Y);
  });
});

describe("menu value columns clear their labels", () => {
  // The bug: `DrawMenuOrOptions` put the value column at a flat `gx + 256`,
  // sized when menus drew at 8.25pt. Menus moved to 12pt and the constant was
  // never revisited, so "C&I - Corpses & Infection" (24 chars, plus a 6-glyph
  // selection prefix) needed ~290px of a 256px column and printed the label and
  // the value on top of each other.
  const RIGHT_PADDING = 256;
  const gameModeLabels = [
    Session.descGameMode(GameMode.GM_STANDARD),
    Session.descGameMode(GameMode.GM_CORPSES_INFECTION),
    Session.descGameMode(GameMode.GM_VINTAGE),
  ];

  it("the game mode menu's column clears its longest label", () => {
    const columnX = menuValueColumnX(0, gameModeLabels, RIGHT_PADDING);
    const widest = gameModeLabels.reduce((a, b) => (b.length > a.length ? b : a));
    const labelEnd = (MENU_LABEL_PREFIX + widest.length) * MENU_CHAR_WIDTH;
    expect(columnX).toBeGreaterThanOrEqual(labelEnd);
  });

  it("the old fixed offset was genuinely too small for that label", () => {
    // Guards the premise, so the test above cannot pass by accident if the
    // labels or the font ever shrink back to something 256px does fit.
    const widest = gameModeLabels.reduce((a, b) => (b.length > a.length ? b : a));
    expect((MENU_LABEL_PREFIX + widest.length) * MENU_CHAR_WIDTH).toBeGreaterThan(RIGHT_PADDING);
  });

  it("leaves a visible gap rather than butting up against the label", () => {
    const columnX = menuValueColumnX(0, gameModeLabels, RIGHT_PADDING);
    const widest = gameModeLabels.reduce((a, b) => (b.length > a.length ? b : a));
    expect(columnX - (MENU_LABEL_PREFIX + widest.length) * MENU_CHAR_WIDTH).toBeGreaterThanOrEqual(
      MENU_COLUMN_GAP
    );
  });

  it("keeps short-label menus on the C# gap", () => {
    // The race/skill menus are "*Random*", "Living", "Undead" -- well inside
    // 256px, so the floor should win and nothing should move.
    const columnX = menuValueColumnX(0, ["*Random*", "Living", "Undead"], RIGHT_PADDING);
    expect(columnX).toBe(RIGHT_PADDING);
  });

  it("offsets from gx, not from the canvas origin", () => {
    expect(menuValueColumnX(100, gameModeLabels, RIGHT_PADDING)).toBe(
      100 + menuValueColumnX(0, gameModeLabels, RIGHT_PADDING)
    );
  });

  it("the longest game mode value still fits on the canvas after the move", () => {
    // Moving the column right is only safe if the value text does not run off
    // the end. "Don't get a cold..." is the longest of the three.
    const value = "Don't get a cold. Keep an eye on your deceased diseased friends.";
    const columnX = menuValueColumnX(0, gameModeLabels, RIGHT_PADDING);
    // The selected row also appends " <---".
    expect(columnX + (value.length + 5) * MENU_CHAR_WIDTH).toBeLessThanOrEqual(CANVAS_WIDTH);
  });
});

describe("side panel: the wider rows fit horizontally", () => {
  it("the panel is wide enough for the widest status row", () => {
    // `DrawActorStatus` lays a row out as: label, then the bar at
    // `gx + BOLD_LINE_SPACING * 5` (100 px wide), then the max value at
    // `* 6 + 100`, then the status word at `* 9 + 100`. The offsets track
    // BOLD_LINE_SPACING, so they scale with the font -- but only if the panel
    // is wide enough to hold the result, which is why widening the panel and
    // enlarging the font are the same change.
    const statusWordX = RIGHTPANEL_TEXT_X + BOLD_LINE_SPACING * 9 + 100;
    const rowEnd = statusWordX + LONGEST_STATUS_WORD.length * CHAR_ADVANCE;
    expect(rowEnd).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it("the bar and the value beside it do not collide", () => {
    // The bar ends at `* 5 + 100`; the value starts at `* 6 + 100`, one
    // BOLD_LINE_SPACING later. At the old 14 px leading that was 14 px of gap;
    // at 17 it is 17, so this only holds while the leading stays a step.
    const barEnd = RIGHTPANEL_TEXT_X + BOLD_LINE_SPACING * 5 + 100;
    const valueX = RIGHTPANEL_TEXT_X + BOLD_LINE_SPACING * 6 + 100;
    expect(valueX - barEnd).toBe(BOLD_LINE_SPACING);
  });

  it("one row of item slots fits", () => {
    expect(RIGHTPANEL_TEXT_X + inventoryRowWidth).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it("every skill column fits, and the longest skill name has room", () => {
    // Living skills run FIRST_LIVING..LAST_LIVING, the undead have their own
    // nine; at SKILLTABLE_LINES per column that is 3 columns and 2. The pitch
    // is what the panel pays for them.
    const livingCount = Skills.LAST_LIVING - Skills.FIRST_LIVING + 1;
    const columns = Math.ceil(livingCount / SKILLTABLE_LINES);
    expect(RIGHTPANEL_TEXT_X + columns * SKILLTABLE_COLUMN_PITCH).toBeLessThanOrEqual(CANVAS_WIDTH);

    const longest = Skills.NAMES.reduce((a, b) => (b.length > a.length ? b : a));
    const nameRoom = SKILLTABLE_COLUMN_PITCH - SKILLTABLE_LEVEL_WIDTH;
    expect(longest.length * CHAR_ADVANCE).toBeLessThanOrEqual(nameRoom);
  });

  it("the panel is wide enough to be worth widening", () => {
    // The whole point of taking 128 px back from the map. If this drops below
    // the widest status row above, the geometry regressed silently.
    expect(sidePanelWidth).toBeGreaterThan(0);
    expect(sidePanelWidth).toBeGreaterThanOrEqual(494);
  });
});
