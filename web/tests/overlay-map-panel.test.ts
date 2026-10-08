import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  overlayOnMapPanel,
  Overlay,
  OverlayImage,
  OverlayLine,
  OverlayRect,
  OverlayText,
  OverlayTransparentImage,
  MAP_PANEL_WIDTH,
  MAP_PANEL_HEIGHT,
  TILE_SIZE,
} from "@engine/RogueGame";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Color } from "@engine/Color";

/**
 * The overlay pass's gate on the map panel.
 *
 * Every effect drawn *on* the map — the blast icon and its damage number, the
 * yellow and red boxes around a throw or a fire-through, the target rings, the
 * event highlight — is added on `IsVisibleToPlayer`, which reads the tile's
 * `isView`, i.e. the **FOV**. Nothing asks `IsInViewRect`, and the difference
 * used not to be visible: the C# draws a 31-tile camera with no zoom, so the
 * view covered the FOV. Here the panel is 27 tiles wide at zoom 1 and **14 at
 * zoom 2**, against an FOV that reaches 16 with a light and the night bonuses,
 * so at zoom 2 a box for something the player can see but the camera does not
 * cover computes to `MapToScreen` coordinates past `MAP_PANEL_WIDTH` — and
 * `RedrawPlayScreen` draws overlays *after* the side panel, so it lands on the
 * inventory.
 *
 * The gate skips rather than clips, for the reason speech bubbles skip: half a
 * box cut off by the panel edge reads as a rendering bug just as loudly as a
 * whole one in the wrong place. `scale` is the pass's own, because the panel
 * edge is at `MAP_PANEL_WIDTH` *displayed* pixels and a tile coordinate means
 * nothing without the zoom it is drawn at — `mapDrawScale` is shared with
 * `withMapZoom` for exactly that reason, which the last test here pins.
 */

/** The effect overlays the pass draws, at their anchor, on the panel. */
describe("overlayOnMapPanel: an anchor past the panel edge is not drawn", () => {
  const onPanel = new Point(TILE_SIZE * 3, TILE_SIZE * 3);

  it("keeps an effect whose anchor is on the panel", () => {
    expect(overlayOnMapPanel(new OverlayImage(onPanel, "icon"), 1)).toBe(true);
    expect(overlayOnMapPanel(new OverlayText(onPanel, Color.Red, "3"), 1)).toBe(true);
    expect(
      overlayOnMapPanel(new OverlayTransparentImage(0.5, onPanel, "icon"), 1),
    ).toBe(true);
  });

  it("drops an effect at the panel's right edge or past it", () => {
    // The reported case, at zoom 1: a tile one column past the view computes to
    // x = MAP_PANEL_WIDTH, which is where the side panel begins.
    const lastColumn = new Point(MAP_PANEL_WIDTH - TILE_SIZE, onPanel.y);
    expect(overlayOnMapPanel(new OverlayImage(lastColumn, "icon"), 1)).toBe(true);
    const past = new Point(MAP_PANEL_WIDTH, onPanel.y);
    expect(overlayOnMapPanel(new OverlayImage(past, "icon"), 1)).toBe(false);
    expect(overlayOnMapPanel(new OverlayText(past, Color.Red, "3"), 1)).toBe(false);
  });

  it("drops an effect below the panel, over the message log", () => {
    const above = new Point(onPanel.x, MAP_PANEL_HEIGHT - TILE_SIZE);
    expect(overlayOnMapPanel(new OverlayImage(above, "icon"), 1)).toBe(true);
    const below = new Point(onPanel.x, MAP_PANEL_HEIGHT);
    expect(overlayOnMapPanel(new OverlayImage(below, "icon"), 1)).toBe(false);
  });

  it("drops an anchor above or left of the map", () => {
    expect(overlayOnMapPanel(new OverlayImage(new Point(-1, onPanel.y), "icon"), 1)).toBe(false);
    expect(overlayOnMapPanel(new OverlayImage(new Point(onPanel.x, -1), "icon"), 1)).toBe(false);
  });
});

/** The zoom is what turns a visible tile into a box over the side panel. */
describe("overlayOnMapPanel: the anchor is measured at the zoom it draws at", () => {
  // At zoom 2 the camera covers ceil(864 / 64) = 14 columns. Column 14 is one
  // past the view: on the map, but computed to 896 displayed pixels, inside the
  // side panel.
  const onePastTheView = new Point(14 * TILE_SIZE, TILE_SIZE);

  it("keeps that tile at zoom 1 and drops it at zoom 2", () => {
    expect(overlayOnMapPanel(new OverlayImage(onePastTheView, "icon"), 1)).toBe(true);
    expect(overlayOnMapPanel(new OverlayImage(onePastTheView, "icon"), 2)).toBe(false);
  });

  it("keeps the last column the camera does cover", () => {
    const lastColumn = new Point(13 * TILE_SIZE, TILE_SIZE);
    expect(overlayOnMapPanel(new OverlayImage(lastColumn, "icon"), 2)).toBe(true);
  });
});

/** Boxes are rectangles: what matters is whether any of them is still on-panel. */
describe("overlayOnMapPanel: a box is judged by its rectangle", () => {
  it("keeps a box on the panel and drops one past it", () => {
    expect(
      overlayOnMapPanel(
        new OverlayRect(Color.Yellow, new Rect(TILE_SIZE, TILE_SIZE, TILE_SIZE, TILE_SIZE)),
        1,
      ),
    ).toBe(true);
    expect(
      overlayOnMapPanel(
        new OverlayRect(Color.Red, new Rect(MAP_PANEL_WIDTH, TILE_SIZE, TILE_SIZE, TILE_SIZE)),
        1,
      ),
    ).toBe(false);
  });

  it("keeps a box that straddles the edge, because half of it is still drawn", () => {
    // The last visible column at zoom 2 covers 832..896 displayed pixels: the
    // tile is on the map, so its box is drawn and the map itself is cut at the
    // same edge.
    const straddling = new OverlayRect(
      Color.Yellow,
      new Rect(13 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE),
    );
    expect(overlayOnMapPanel(straddling, 2)).toBe(true);
    const past = new OverlayRect(
      Color.Red,
      new Rect(14 * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE),
    );
    expect(overlayOnMapPanel(past, 2)).toBe(false);
  });

  it("keeps a box that touches the panel from below", () => {
    const touching = new OverlayRect(
      Color.Red,
      new Rect(0, MAP_PANEL_HEIGHT, TILE_SIZE, TILE_SIZE),
    );
    expect(overlayOnMapPanel(touching, 1)).toBe(false);
    const overlapping = new OverlayRect(
      Color.Red,
      new Rect(0, MAP_PANEL_HEIGHT - 1, TILE_SIZE, TILE_SIZE),
    );
    expect(overlayOnMapPanel(overlapping, 1)).toBe(true);
  });
});

describe("overlayOnMapPanel: shapes it does not know", () => {
  it("measures a line by either end", () => {
    const across = new OverlayLine(
      new Point(-TILE_SIZE, TILE_SIZE),
      Color.White,
      new Point(TILE_SIZE, TILE_SIZE),
    );
    expect(overlayOnMapPanel(across, 1)).toBe(true);
    const off = new OverlayLine(
      new Point(-TILE_SIZE, -TILE_SIZE),
      Color.White,
      new Point(-1, -1),
    );
    expect(overlayOnMapPanel(off, 1)).toBe(false);
  });

  it("draws an overlay it cannot classify rather than losing it", () => {
    class Unshaped extends Overlay {
      draw(): void {}
    }
    expect(overlayOnMapPanel(new Unshaped(), 1)).toBe(true);
  });
});

/**
 * The wiring, asserted on the source: driving a real `RedrawPlayScreen` needs a
 * whole played game, and the two things that can silently undo the gate are both
 * text — a call dropped from the pass, and the pass measuring at one scale while
 * `withMapZoom` draws at another.
 */
describe("the overlay pass uses the gate, at the scale it draws", () => {
  const src = readFileSync(join(__dirname, "..", "src", "engine", "RogueGame.ts"), "utf-8");

  it("tests every map-anchored overlay before drawing it", () => {
    const pass = src.slice(
      src.indexOf("withMapZoom(() => {\n\t\t\tfor (const o of this.m_Overlays)"),
    );
    expect(pass.length).toBeGreaterThan(0);
    const gate = pass.indexOf("overlayOnMapPanel(o, overlayScale)");
    expect(gate, "the pass should gate each overlay on the panel").toBeGreaterThan(-1);
    expect(gate).toBeLessThan(pass.indexOf("}, false);"));
  });

  it("takes the scale from the same place the drawing does", () => {
    const withMapZoom = src.slice(
      src.indexOf("\tprivate withMapZoom(draw: () => void"),
      src.indexOf("\tprivate DrawMapMarker("),
    );
    expect(withMapZoom).toContain("this.mapDrawScale()");
    const pass = src.slice(src.indexOf("// overlays"), src.indexOf("}, false);"));
    expect(pass).toContain("this.mapDrawScale()");
  });
});
