import { describe, it, expect } from "vitest";
import { CanvasUI } from "@ui/CanvasUI";

/**
 * The canvas sizing rules, checked without a browser.
 *
 * `computeLayout` decides the only three things that make text look crisp: a
 * whole-number display scale where one fits, a backing store that matches the
 * device pixel ratio, and an aspect ratio that is never stretched. Every one of
 * those can fail silently — a canvas in Node cannot be looked at, and a squashed
 * game still draws. The cases below are the real ones:
 *
 * - 1920x1080 and 2560x1440 fit 1366x768 only 1x, so the game shows at 1:1 with
 *   black bars rather than being stretched. 3840x2160 is the first size that
 *   affords 2x.
 * - A 1366-wide *window* in a browser is not a 1366x768 viewport: the chrome
 *   takes ~90px, leaving 1366x~700. That is below 1:1 and must scale down
 *   proportionally — the case that stretched the art when each axis was clamped
 *   separately.
 */

const LOGICAL_W = 1366;
const LOGICAL_H = 768;
const ASPECT = LOGICAL_W / LOGICAL_H;

/** Every layout must fit the viewport and keep the aspect ratio. */
function expectSane(availW: number, availH: number, dpr: number): ReturnType<typeof CanvasUI.computeLayout> {
  const layout = CanvasUI.computeLayout(availW, availH, dpr);
  expect(layout.cssW).toBeLessThanOrEqual(availW + 0.5);
  expect(layout.cssH).toBeLessThanOrEqual(availH + 0.5);
  expect(layout.cssW / layout.cssH).toBeCloseTo(ASPECT, 6);
  expect(layout.backingW).toBe(Math.round(layout.cssW * dpr));
  expect(layout.backingH).toBe(Math.round(layout.cssH * dpr));
  return layout;
}

describe("CanvasUI.computeLayout", () => {
  it("uses a whole scale when the window fits one", () => {
    for (const [w, h, expected] of [
      [1366, 768, 1],
      [1920, 1080, 1],
      [2560, 1440, 1],
      [3440, 1440, 1],
      [3840, 2160, 2],
      [5120, 2880, 3],
    ] as const) {
      const layout = expectSane(w, h, 1);
      expect(Number.isInteger(layout.scale)).toBe(true);
      expect(layout.scale).toBe(expected);
    }
  });

  it("scales down proportionally when the viewport is shorter than 768", () => {
    // 1366-wide window with browser chrome: the common case.
    const layout = expectSane(1366, 700, 1);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.cssH).toBeCloseTo(700, 6);
    expect(layout.cssW).toBeLessThan(LOGICAL_W);
  });

  it("scales down proportionally in a small window", () => {
    // 800x600 is wider than 16:9, so width is the limiting side and the height
    // is whatever keeps the aspect — not the full 600.
    const layout = expectSane(800, 600, 1);
    expect(layout.cssW).toBeCloseTo(800, 6);
    expect(layout.cssH).toBeCloseTo(800 / ASPECT, 6);
    expect(layout.cssH).toBeLessThan(600);
  });

  it("matches the backing store to the device pixel ratio", () => {
    // 1x display at 1920x1080: 1366x768 shown, 1366x768 drawn.
    expect(expectSane(1920, 1080, 1).backingW).toBe(1366);
    // Same window on a 2x display: shown at 1366x768, drawn at 2732x1536, so
    // each logical pixel is two device pixels and no resampling happens.
    const hidpi = expectSane(1920, 1080, 2);
    expect(hidpi.cssW).toBe(1366);
    expect(hidpi.backingW).toBe(2732);
    expect(hidpi.backingH).toBe(1536);
  });

  it("handles a fractional device pixel ratio", () => {
    // Windows 125%: the backing store is rounded to whole device pixels, and
    // the context transform absorbs the difference.
    const layout = expectSane(1920, 1080, 1.25);
    expect(Number.isInteger(layout.backingW)).toBe(true);
    expect(Number.isInteger(layout.backingH)).toBe(true);
  });
});
