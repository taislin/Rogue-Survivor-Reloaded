import { describe, it, expect, vi } from "vitest";
import {
  RogueGame,
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
import { Session } from "@engine/Session";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Lighting, Map as GameMap } from "@data/Map";
import { GameActors, ActorID } from "@gameplay/GameActors";

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
 * The gate skips off-panel effects and keeps partially intersecting shapes,
 * whose overflow is clipped by the drawing scope. `scale` is the pass's own:
 * the panel edge is at `MAP_PANEL_WIDTH` *displayed* pixels, and a tile coordinate means
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

describe("the overlay drawing scopes", () => {
  it.each([1, 2] as const)("clips edge overlays at zoom %s and leaves speech bubbles unclipped", (zoom) => {
    const ui = new NullRogueUI();
    const game = new RogueGame(ui);
    const session = Session.get();
    const oldMap = session.currentMap;
    const oldZoom = game.MapZoom;
    game.SetMapZoom(zoom);
    const map = new GameMap(1234, "overlays", 30, 30);
    map.lighting = Lighting.LIT;
    const player = new Actor(new GameActors().get(ActorID.MALE_CIVILIAN), new Faction("Test", "test"), "you");
    map.placeActor(player, new Point(15, 15));
    game.m_Player = player;
    session.currentMap = map;

    // Exercise the real redraw's overlay pass without rendering unrelated HUD/map content.
    for (const method of ["DrawMap", "DrawMiniMap", "DrawMessages", "DrawActorStatus", "DrawInventory", "DrawCorpsesList"] as const) {
      vi.spyOn(game, method).mockImplementation(() => {});
    }
    const scopes: { scale: number; clipRect?: Rect }[] = [];
    vi.spyOn(ui, "UI_BeginScaledDraw").mockImplementation((scale, clipRect) => {
      scopes.push({ scale, clipRect });
    });
    vi.spyOn(ui, "UI_EndScaledDraw").mockImplementation(() => { scopes.pop(); });
    const images: { id: string; scope?: typeof scopes[number] }[] = [];
    vi.spyOn(ui, "UI_DrawImage").mockImplementation((id) => {
      images.push({ id, scope: scopes[scopes.length - 1] });
    });
    const bubbles = vi.spyOn(game, "DrawSpeechBubbles").mockImplementation(() => {
      expect(scopes[scopes.length - 1]?.clipRect).toBeUndefined();
      expect(scopes[scopes.length - 1]?.scale ?? 1).toBe(zoom);
    });

    // At zoom 2, column 13's reachable 32px image spans displayed x=832..896.
    // At zoom 1, use a non-tile-aligned anchor to check the clip at scale 1 too.
    const right = Math.floor((MAP_PANEL_WIDTH - 1) / (TILE_SIZE * zoom)) * TILE_SIZE;
    game.AddOverlay(new OverlayImage(new Point(zoom === 2 ? right : MAP_PANEL_WIDTH - 1, TILE_SIZE), "right"));
    game.AddOverlay(new OverlayImage(new Point(TILE_SIZE, MAP_PANEL_HEIGHT / zoom - 1), "bottom"));
    game.AddOverlay(new OverlayImage(new Point(MAP_PANEL_WIDTH / zoom, TILE_SIZE), "off-panel"));
    const screen = new OverlayImage(new Point(MAP_PANEL_WIDTH, TILE_SIZE), "screen");
    screen.zoomsWithMap = false;
    game.AddOverlay(screen);

    try {
      game.RedrawPlayScreen();
      const clipped = { scale: zoom, clipRect: new Rect(0, 0, MAP_PANEL_WIDTH, MAP_PANEL_HEIGHT) };
      expect(images).toEqual([
        { id: "right", scope: clipped },
        { id: "bottom", scope: clipped },
        { id: "screen", scope: undefined },
      ]);
      expect(bubbles).toHaveBeenCalledOnce();
      expect(scopes).toHaveLength(0);
    } finally {
      vi.spyOn(game, "RedrawPlayScreen").mockImplementation(() => {});
      game.SetMapZoom(oldZoom);
      session.currentMap = oldMap;
      vi.restoreAllMocks();
    }
  });
});
