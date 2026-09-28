import { describe, it, expect } from "vitest";
import { CanvasUI } from "@ui/CanvasUI";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { RogueGame, TILE_SIZE } from "@engine/RogueGame";
import type { MapView } from "@engine/IRogueUI";

/**
 * The map ⇄ screen conversion, now that it lives in `IRogueUI`.
 *
 * Moving it out of `RogueGame` was necessary — a second renderer cannot be told
 * how to project from inside a method that only knows the tile grid — and it
 * immediately created the risk the move was meant to remove. There are now two
 * implementations of the same arithmetic, and the failure is not a crash: it is
 * the mouse landing one tile off, or a hover tooltip on the tile beside the one
 * under the cursor. Nothing else in the tree would report it, because a pure
 * conversion that is off by one produces ordinary-looking numbers.
 *
 * The tests below assert *relationships*, not values, for that reason. A value
 * assertion pins today's answer and says nothing about whether the two
 * implementations still agree, which is the thing that can rot.
 */

/** The two views the game actually uses: a 27x21 window at 1x, 14x11 at 2x. */
function viewAt(zoom: 1 | 2): MapView {
  const columns = Math.ceil(864 / (TILE_SIZE * zoom));
  const rows = Math.ceil(672 / (TILE_SIZE * zoom));
  return {
    rect: new Rect(50 - Math.floor((columns - 1) / 2), 50 - Math.floor((rows - 1) / 2), columns, rows),
    tileSize: TILE_SIZE,
    displayTileSize: TILE_SIZE * zoom,
  };
}

/**
 * `CanvasUI`'s conversion, called without a canvas.
 *
 * Both methods are pure functions of their arguments and never touch `this`, so
 * they are reachable from the prototype in Node. The alternative — comparing the
 * two source bodies as text — would pin the formatting as well as the logic, and
 * a reformat would fail a test whose subject is arithmetic.
 */
const canvasMapToScreen = CanvasUI.prototype.UI_MapToScreen;
const canvasScreenToMap = CanvasUI.prototype.UI_ScreenToMap;

/**
 * The top-down conversion, asserting it always produces a position.
 *
 * The interface allows null — a first-person renderer has positions it cannot
 * show, and "behind the camera" is a real answer there. The tile grid has no such
 * position, so pinning that here is a claim about *this* view, and it is the claim
 * that lets `RogueGame.MapToScreen` keep returning a `Point` today.
 */
function placed(p: Point | null, gx: number, gy: number): Point {
  expect(p, `the tile grid cannot fail to place (${gx},${gy})`).not.toBeNull();
  return p!;
}

describe("every IRogueUI implements the same map ⇄ screen conversion", () => {
  const nullUI = new NullRogueUI();

  it("the browser and the headless renderer place a map position identically", () => {
    for (const zoom of [1, 2] as const) {
      const view = viewAt(zoom);
      // Including positions outside the window and off the map entirely: the
      // top-down view has no opinion about either, and that is the behaviour
      // that must not quietly change when a second renderer appears.
      for (let x = view.rect.left - 5; x < view.rect.left + view.rect.width + 5; x++) {
        for (let y = view.rect.top - 5; y < view.rect.top + view.rect.height + 5; y++) {
          const a = canvasMapToScreen.call(null, x, y, view);
          const b = nullUI.UI_MapToScreen(x, y, view);
          expect(b, `map (${x},${y}) zoom ${zoom} disagrees`).toEqual(a);
        }
      }
    }
  });

  it("the browser and the headless renderer read a screen position identically", () => {
    for (const zoom of [1, 2] as const) {
      const view = viewAt(zoom);
      // Sampling across the panel, and past its edges, at a stride that lands on
      // tile boundaries as well as between them — the off-by-one this catches
      // shows up only on one side of a boundary.
      for (let px = -40; px < 900; px += 7) {
        for (let py = -40; py < 700; py += 37) {
          const a = canvasScreenToMap.call(null, px, py, view);
          const b = nullUI.UI_ScreenToMap(px, py, view);
          expect(b, `screen (${px},${py}) zoom ${zoom} disagrees`).toEqual(a);
        }
      }
    }
  });

  it("the two directions invert each other, at both zooms", () => {
    // The property that makes the conversion usable, and the one that a plausible
    // default passes: two methods that each look right and are scaled wrongly
    // relative to one another still round-trip inside a window if both are
    // wrong the same way — but the mouse would be wrong against the *drawing*,
    // which is what the zoom case below pins.
    for (const zoom of [1, 2] as const) {
      const view = viewAt(zoom);
      for (let dx = 0; dx < view.rect.width; dx++) {
        for (let dy = 0; dy < view.rect.height; dy++) {
          const tile = new Point(view.rect.left + dx, view.rect.top + dy);
          const pre = placed(nullUI.UI_MapToScreen(tile.x, tile.y, view), tile.x, tile.y);
          // The middle of the tile *as displayed*, which is the space the mouse
          // reports: `MapToScreen` answers pre-zoom, so the zoom is applied here.
          const mid = new Point(
            (pre.x + TILE_SIZE / 2) * zoom,
            (pre.y + TILE_SIZE / 2) * zoom,
          );
          const back = placed(nullUI.UI_ScreenToMap(mid.x, mid.y, view), mid.x, mid.y);
          expect(back.equals(tile), `(${tile.x},${tile.y}) zoom ${zoom} did not round-trip`).toBe(true);
        }
      }
    }
  });

  it("reads the mouse in displayed pixels, not engine pixels", () => {
    // The asymmetry between the two directions, stated as a test because it is
    // the easiest thing in this file to get wrong: the conversion *out* answers
    // before the zoom, the conversion *in* after it. Using `tileSize` on both
    // sides would round-trip perfectly at zoom 1 and put the mouse on the wrong
    // tile at zoom 2 — which no headless run can see, because it has no mouse.
    const zoom2 = viewAt(2);
    const pre = placed(nullUI.UI_MapToScreen(50, 50, zoom2), 50, 50);
    expect(pre.x).toBe((50 - zoom2.rect.left) * TILE_SIZE);
    // One displayed pixel less than the centre: the same tile, still.
    const sameTile = placed(
      nullUI.UI_ScreenToMap(pre.x * 2 + 1, pre.y * 2 + 1, zoom2),
      pre.x * 2 + 1,
      pre.y * 2 + 1,
    );
    expect(sameTile.equals(new Point(50, 50))).toBe(true);
  });
});

describe("RogueGame asks the renderer where a position goes, rather than deciding", () => {
  /**
   * A UI that answers the conversion with a recognisable value.
   *
   * This replaces a source-scanning test that asserted `RogueGame` contains the
   * arithmetic in exactly two methods. It passed for the wrong reason — its
   * pattern never matched the source it was guarding, so it would have passed
   * with the arithmetic inlined three more times — and there is no version of a
   * regex over a 26 000-line file that is not one formatting change away from
   * asserting nothing again.
   *
   * Asking instead: if `MapToScreen` returns the probe's sentinel, the engine
   * delegated. Re-inline the arithmetic and the sentinel stops coming back. That
   * is the relationship, and it cannot pass vacuously.
   */
  class ProbeUI extends NullRogueUI {
    readonly mapToScreenCalls: Array<[number, number]> = [];
    readonly screenToMapCalls: Array<[number, number]> = [];
    readonly viewsSeen: MapView[] = [];

    override UI_MapToScreen(gx: number, gy: number, view: MapView): Point {
      this.mapToScreenCalls.push([gx, gy]);
      this.viewsSeen.push(view);
      return new Point(1000 + gx, 2000 + gy);
    }

    override UI_ScreenToMap(gx: number, gy: number, view: MapView): Point {
      this.screenToMapCalls.push([gx, gy]);
      this.viewsSeen.push(view);
      return new Point(3000 + gx, 4000 + gy);
    }
  }

  function probed(): { game: RogueGame; probe: ProbeUI } {
    const probe = new ProbeUI();
    return { game: new RogueGame(probe, new NullMusicManager()), probe };
  }

  it("delegates the map→screen direction", () => {
    const { game, probe } = probed();
    game.ComputeViewRect(new Point(50, 50));

    expect(game.MapToScreen(7, 9)).toEqual(new Point(1007, 2009));
    expect(probe.mapToScreenCalls).toEqual([[7, 9]]);
    // The Point overload routes through the same call, once, not twice.
    probe.mapToScreenCalls.length = 0;
    expect(game.MapToScreen(new Point(7, 9))).toEqual(new Point(1007, 2009));
    expect(probe.mapToScreenCalls).toEqual([[7, 9]]);
  });

  it("delegates the screen→map direction", () => {
    const { game, probe } = probed();
    game.ComputeViewRect(new Point(50, 50));

    expect(game.ScreenToMap(5, 6)).toEqual(new Point(3005, 4006));
    expect(probe.screenToMapCalls).toEqual([[5, 6]]);
  });

  it("hands over the frame's own view, not one it kept", () => {
    const { game, probe } = probed();
    game.SetMapZoom(2);
    game.ComputeViewRect(new Point(50, 50));
    game.MapToScreen(1, 1);

    const view = probe.viewsSeen.at(-1)!;
    // The rect is the game's, by identity: a copy could be a frame out of date,
    // which is the hazard the comment on `MapView` is about.
    expect(view.rect).toBe(game.m_MapViewRect);
    // Both sizes, and the second is the first times the zoom. A `MapView` with
    // one size cannot express the asymmetry the conversion needs, and passing
    // `tileSize` for both would put the mouse on the wrong tile at zoom 2.
    expect(view.tileSize).toBe(TILE_SIZE);
    expect(view.displayTileSize).toBe(TILE_SIZE * 2);
  });

  it("falls back to the grid conversion when a renderer cannot place a position", () => {
    // The documented placeholder: the top-down view misses nothing, and the
    // fallback is the pre-move arithmetic rather than a magic off-screen point,
    // because `clampPopupBox` would stack an unplaceable popup in a corner
    // instead of hiding it. Pinned so the fallback cannot be quietly deleted
    // while the first-person renderer still has no replacement.
    class MissesEverythingUI extends NullRogueUI {
      override UI_MapToScreen(): Point | null {
        return null;
      }
      override UI_ScreenToMap(): Point | null {
        return null;
      }
    }
    const game = new RogueGame(new MissesEverythingUI(), new NullMusicManager());
    game.SetMapZoom(1);
    game.ComputeViewRect(new Point(50, 50));

    const expected = new Point(
      (50 - game.m_MapViewRect.left) * TILE_SIZE,
      (0 - game.m_MapViewRect.top) * TILE_SIZE,
    );
    expect(game.MapToScreen(50, 0)).toEqual(expected);
    expect(game.ScreenToMap(0, 0)).toEqual(
      new Point(game.m_MapViewRect.left, game.m_MapViewRect.top),
    );
  });
});
