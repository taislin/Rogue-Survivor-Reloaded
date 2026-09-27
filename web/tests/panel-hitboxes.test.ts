import { describe, it, expect } from "vitest";
import {
  RogueGame,
  Overlay,
  OverlayRect,
  OverlayPopup,
  OverlayPopupTitle,
  OverlayPopupTitleColors,
  PopupOverlay,
  INVENTORYPANEL_X,
  INVENTORYPANEL_Y,
  GROUNDINVENTORYPANEL_Y,
  CORPSESPANEL_Y,
  SIDEPANEL_SECTION_HEIGHT,
  SIDEPANEL_TITLE_LEADING,
  INVENTORY_SLOTS_PER_LINE,
  TILE_SIZE,
} from "@engine/RogueGame";
import { CanvasUI } from "@ui/CanvasUI";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Color } from "@engine/Color";
import type { IRogueUI } from "@engine/IRogueUI";

/**
 * The side panel's three stacked item panels, and the description popup that
 * reports the hovered one.
 *
 * This exists because two things shipped broken at the same time, and both looked
 * like "the panel is drawn wrong":
 *
 *  - The hitboxes were not the drawn grid. `MouseToInventorySlot` divided by
 *    `TILE_SIZE` with no bounds check and the callers only asked whether the
 *    index was under `maxCapacity`, so a pointer on a panel's title, on its slot
 *    numbers, or in the gap between two panels still produced a slot. Because one
 *    panel's slot numbers are drawn across the *next* panel's title, clicking the
 *    numbers selected an item of the panel below, and the cyan highlight and
 *    description popup appeared offset from the icon.
 *  - The description popup was drawn in the map's 2x zoom scope. The side panel
 *    is drawn unscaled, so at 2x the popup was both displaced and doubled and
 *    landed in the bottom right corner, off the screen. It was not a clipping
 *    problem: nothing clips the popups, by design.
 */

/** Panel geometry, in the same terms `DrawInventory` uses. */
const PANEL_X = INVENTORYPANEL_X;
const SLOT_PITCH = TILE_SIZE;

/** A slot's drawn top-left, i.e. what the icon is painted at. */
function slotOrigin(panelY: number, slot: number): Point {
  return new Point(
    PANEL_X + (slot % INVENTORY_SLOTS_PER_LINE) * SLOT_PITCH,
    panelY + Math.floor(slot / INVENTORY_SLOTS_PER_LINE) * SLOT_PITCH,
  );
}

/** A point in the middle of a cell, so a test never sits on a boundary. */
function centre(panelY: number, slot: number): Point {
  const o = slotOrigin(panelY, slot);
  return new Point(o.x + SLOT_PITCH / 2, o.y + SLOT_PITCH / 2);
}

describe("panel geometry", () => {
  it("puts every icon row of a panel inside that panel's own section", () => {
    // The bug: `DrawInventory` draws the title `SIDEPANEL_TITLE_LEADING` above
    // the row of icons, so a section has to be tall enough for the title, the
    // row, and the slot numbers drawn on the text line below it. Adding up only
    // the last two is what let 56 ship and the numbers print across the next
    // panel's title.
    const perSection = SIDEPANEL_TITLE_LEADING + TILE_SIZE + 13;
    expect(SIDEPANEL_SECTION_HEIGHT).toBeGreaterThanOrEqual(perSection);
  });

  it("leaves the slot numbers clear of the next panel's title", () => {
    // The actual collision, in the drawing's own terms: the numbers sit on the
    // text line below the icons, and the next panel's title starts a full
    // section further down, less its own leading.
    const numbersBottom = INVENTORYPANEL_Y + TILE_SIZE + 13;
    const nextTitleTop = GROUNDINVENTORYPANEL_Y - SIDEPANEL_TITLE_LEADING;
    expect(numbersBottom).toBeLessThanOrEqual(nextTitleTop);
  });

  it("stacks the three panels in order", () => {
    expect(GROUNDINVENTORYPANEL_Y).toBe(INVENTORYPANEL_Y + SIDEPANEL_SECTION_HEIGHT);
    expect(CORPSESPANEL_Y).toBe(GROUNDINVENTORYPANEL_Y + SIDEPANEL_SECTION_HEIGHT);
  });
});

describe("PanelSlotAtMouse: the hitbox is the drawn grid", () => {
  // A probe that satisfies the part of IRogueUI the hit-testing touches: the
  // canvas is unscaled, so CSS pixels are logical pixels.
  const ui = { UI_GetCanvasScaleX: () => 1, UI_GetCanvasScaleY: () => 1 } as IRogueUI;
  const game = { m_UI: ui, PanelSlotAtMouse: RogueGame.prototype.PanelSlotAtMouse } as unknown as RogueGame;

  it("returns the slot under the pointer, for every slot in the row", () => {
    for (let slot = 0; slot < INVENTORY_SLOTS_PER_LINE; slot++) {
      const at = centre(INVENTORYPANEL_Y, slot);
      expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 10, at.x, at.y)).toEqual({
        x: slot,
        y: 0,
        index: slot,
      });
    }
  });

  it("rejects a pointer on the panel's own title", () => {
    // The title is drawn above the icon row, so it is not a slot. C#'s
    // truncating division folded these 17 px into row 0, which is how clicking
    // "Items on ground" selected the first item on the ground.
    const titleY = INVENTORYPANEL_Y - SIDEPANEL_TITLE_LEADING + 2;
    expect(game.PanelSlotAtMouse(PANEL_X, GROUNDINVENTORYPANEL_Y, 10, PANEL_X + 8, titleY)).toBeNull();
  });

  it("rejects a pointer on the slot-number row below the icons", () => {
    const numbersY = INVENTORYPANEL_Y + TILE_SIZE + 4;
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 10, PANEL_X + 8, numbersY)).toBeNull();
  });

  it("rejects a pointer above the panel and left of it", () => {
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 10, PANEL_X + 8, INVENTORYPANEL_Y - 1)).toBeNull();
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 10, PANEL_X - 1, INVENTORYPANEL_Y + 8)).toBeNull();
  });

  it("rejects slots past the panel's capacity", () => {
    // A survivor's inventory is 7 slots wide on screen but 10 per line, so the
    // three empty cells to the right of the last item are not clickable.
    const past = slotOrigin(INVENTORYPANEL_Y, 7);
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 7, past.x + 8, past.y + 8)).toBeNull();
    const last = slotOrigin(INVENTORYPANEL_Y, 6);
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 7, last.x + 8, last.y + 8)).not.toBeNull();
  });

  it("keeps a second row clickable when the capacity needs one", () => {
    // 20 slots wraps onto a second row; both rows are real slots, and the row
    // below the first must not be mistaken for the next panel.
    const secondRow = centre(INVENTORYPANEL_Y, INVENTORY_SLOTS_PER_LINE + 2);
    expect(game.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 20, secondRow.x, secondRow.y)).toEqual({
      x: 2,
      y: 1,
      index: INVENTORY_SLOTS_PER_LINE + 2,
    });
  });

  it("converts CSS pixels through the canvas scale", () => {
    // At 2x display scaling the pointer arrives in CSS pixels, twice the logical
    // distance; the hitbox has to follow the icons, not the raw pixel count.
    const scaled = { UI_GetCanvasScaleX: () => 2, UI_GetCanvasScaleY: () => 2 } as IRogueUI;
    const at2x = { m_UI: scaled, PanelSlotAtMouse: RogueGame.prototype.PanelSlotAtMouse } as unknown as RogueGame;
    const at = centre(INVENTORYPANEL_Y, 3);
    expect(at2x.PanelSlotAtMouse(PANEL_X, INVENTORYPANEL_Y, 10, at.x * 2, at.y * 2)).toEqual({
      x: 3,
      y: 0,
      index: 3,
    });
  });
});

describe("overlays know whether the map zoom may move them", () => {
  it("defaults to zooming with the map", () => {
    // Target rings, damage icons and the lines joining them are anchored to a
    // tile, so they belong in the map's scaled scope.
    const onMap = new OverlayRect(Color.Cyan, new Rect(0, 0, 32, 32));
    expect(onMap.zoomsWithMap).toBe(true);
  });

  it("can opt out for anything anchored in screen space", () => {
    class Probe extends Overlay {
      zoomsWithMap = false;
      draw(): void {}
    }
    const onScreen = new Probe();
    expect(onScreen.zoomsWithMap).toBe(false);
  });
});

describe("a popup is never drawn scaled", () => {
  /**
   * The reason: the map is drawn through a 2x transform, and popups used to be
   * drawn inside it, so their text doubled along with their fill. The box ended
   * up twice the size of the thing it described -- covering the tiles the player
   * had just zoomed in to read -- and, anchored in pre-scale coordinates, in the
   * bottom right corner of the screen.
   *
   * The fix is that only the anchor follows the zoom. The map panel is a fixed
   * size in screen pixels whatever the zoom, so a popup drawn at 1x over it stays
   * proportional at both levels.
   */
  const ANCHOR = new Point(448, 320);

  /** Captures where a popup was actually asked to be drawn. */
  function recordingUI(): { ui: IRogueUI; drawn: { x: number; y: number }[] } {
    const drawn: { x: number; y: number }[] = [];
    const ui = {
      UI_DrawPopup: (_l: string[], _t: Color, _b: Color, _f: Color, x: number, y: number) => {
        drawn.push({ x, y });
      },
      UI_DrawPopupTitle: (
        _ti: string, _tc: Color, _l: string[], _t: Color,
        _b: Color, _f: Color, x: number, y: number,
      ) => {
        drawn.push({ x, y });
      },
      UI_DrawPopupTitleColors: (
        _ti: string, _tc: Color, _l: string[], _c: Color[],
        _b: Color, _f: Color, x: number, y: number,
      ) => {
        drawn.push({ x, y });
      },
    } as unknown as IRogueUI;
    return { ui, drawn };
  }

  it("scales the anchor of a map-anchored popup, not the box", () => {
    const { ui, drawn } = recordingUI();
    const popup = new OverlayPopup(
      ["a civilian"], Color.White, Color.White, Color.CornflowerBlue, ANCHOR,
    );
    expect(popup).toBeInstanceOf(PopupOverlay);
    popup.drawAt(ui, 2);
    expect(drawn).toEqual([{ x: ANCHOR.x * 2, y: ANCHOR.y * 2 }]);
  });

  it("draws a screen-anchored popup at scale 1, where it is anchored", () => {
    // The side panel's descriptions and the corner-pinned prompts are already in
    // screen coordinates, so their anchor must not move at all.
    const { ui, drawn } = recordingUI();
    const popup = new OverlayPopup(
      ["a medikit"], Color.White, Color.White, Color.CornflowerBlue, ANCHOR, false,
    );
    popup.drawAt(ui, 1);
    expect(drawn).toEqual([{ x: ANCHOR.x, y: ANCHOR.y }]);
  });

  it("draws unscaled for a direct caller that does not pass a scale", () => {
    const { ui, drawn } = recordingUI();
    new OverlayPopup(
      ["hi"], Color.White, Color.White, Color.Black, ANCHOR,
    ).draw(ui);
    expect(drawn).toEqual([{ x: ANCHOR.x, y: ANCHOR.y }]);
  });

  it("keeps the other two popup shapes on the same rule", () => {
    const { ui, drawn } = recordingUI();
    new OverlayPopupTitle(
      "Select skill", Color.White, ["1-Agile"], Color.White,
      Color.White, Color.Black, ANCHOR,
    ).drawAt(ui, 2);
    new OverlayPopupTitleColors(
      "Select skill", Color.White, ["1-Agile"], [Color.White],
      Color.White, Color.Black, ANCHOR,
    ).drawAt(ui, 2);
    expect(drawn).toEqual([
      { x: ANCHOR.x * 2, y: ANCHOR.y * 2 },
      { x: ANCHOR.x * 2, y: ANCHOR.y * 2 },
    ]);
  });

  it("leaves non-popup overlays out of the popup rule", () => {
    // They are not boxes, so they keep scaling with the map: a target ring
    // around a 64px tile has to be 64px too, or it stops pointing at anything.
    expect(new OverlayRect(Color.Cyan, new Rect(0, 0, 32, 32))).not.toBeInstanceOf(PopupOverlay);
  });
});

describe("CanvasUI.clampPopupBox", () => {
  const boxW = 200;
  const boxH = 120;

  it("leaves a box that already fits alone", () => {
    expect(CanvasUI.clampPopupBox(300, 200, boxW, boxH, 1)).toEqual({ x: 300, y: 200 });
  });

  it("pulls a box back from the right and bottom edges", () => {
    // The reported symptom: hovering a tile low in the view at 2x zoom put the
    // description in the corner and past the edge of the screen. Inside the scope
    // the canvas is half as wide and half as tall, so the same box that ended
    // 440 px down a 768 px canvas ends 440 px down a 384 px one.
    expect(CanvasUI.clampPopupBox(448, 320, boxW, boxH, 2)).toEqual({ x: 448, y: 264 });
    const at2x = CanvasUI.clampPopupBox(600, 340, boxW, boxH, 2);
    expect(at2x.x).toBe(1366 / 2 - boxW);
    expect(at2x.y).toBe(768 / 2 - boxH);
  });

  it("keeps the same box in the same place on screen at either zoom", () => {
    // Inside the map's scope the canvas is half as wide, so an anchor measured
    // for 32px tiles has to be clamped against half the canvas. Both zooms must
    // leave the box on screen, which is the point of dividing by the scale.
    for (const scale of [1, 2]) {
      const r = CanvasUI.clampPopupBox(448, 320, boxW, boxH, scale);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect((r.x + boxW) * scale).toBeLessThanOrEqual(1366);
      expect((r.y + boxH) * scale).toBeLessThanOrEqual(768);
    }
  });

  it("clamps a box hanging off the top left to the origin", () => {
    expect(CanvasUI.clampPopupBox(-40, -10, boxW, boxH, 1)).toEqual({ x: 0, y: 0 });
  });

  it("keeps an oversized box at the origin rather than going negative", () => {
    expect(CanvasUI.clampPopupBox(100, 100, 5000, 5000, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("the drawn panel and the hoverable panel agree", () => {
  it("uses one pitch and one origin for both", () => {
    // The two were allowed to drift because the hit-test recomputed the grid from
    // the same numbers but with different arithmetic; the guard is that a slot's
    // drawn origin and its hit-tested index come from the same constants.
    const origin = slotOrigin(INVENTORYPANEL_Y, 4);
    expect(origin.x - PANEL_X).toBe(4 * SLOT_PITCH);
    expect(origin.y - INVENTORYPANEL_Y).toBe(0);
    expect(INVENTORY_SLOTS_PER_LINE * SLOT_PITCH).toBeLessThanOrEqual(1366 - PANEL_X);
  });

  it("keeps a slot's highlight rect inside the panel", () => {
    // `HandleMouseInventory` draws the highlight at exactly `itemPos` with the
    // hardcoded 32px size the draw side uses; a slot near the panel's right edge
    // must still be on the canvas.
    const last = slotOrigin(INVENTORYPANEL_Y, INVENTORY_SLOTS_PER_LINE - 1);
    const rect = new Rect(last.x, last.y, 32, 32);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1366);
  });
});
