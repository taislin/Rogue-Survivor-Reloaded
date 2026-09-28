import { describe, it, expect } from "vitest";
import { InputHandler } from "@ui/InputHandler";
import { GameKeyEvent } from "@engine/IRogueUI";
import { Point } from "@engine/Point";
/**
 * `UI_PeekKey` must consume the key it returns.
 *
 * The C# original is named "peek" but is not: `RogueForm.UI_PeekKey` clears
 * `m_HasKey` before returning, so the caller gets the key exactly once. The
 * browser port implemented it as a genuine peek over `keyQueue[0]`, which left
 * the key in place — and `RogueGame.WaitKeyOrMouse` polls in a loop, so it was
 * handed the same key on every iteration. The first key press wedged the game
 * loop: it replayed that one command forever and never read the keyboard again,
 * which is why the player could not move and help would not open.
 *
 * These pin the destructive contract, and that a polled queue drains rather than
 * repeating.
 */

function key(k: string): GameKeyEvent {
  return { key: k, keyCode: k.charCodeAt(0), shift: false, ctrl: false, alt: false };
}

describe("InputHandler.peekKey", () => {
  it("returns null when nothing is queued", () => {
    expect(new InputHandler().peekKey()).toBeNull();
  });

  it("removes the key it returns", () => {
    const input = new InputHandler();
    input.postKey(key("a"));

    expect(input.peekKey()!.key).toBe("a");
    expect(input.peekKey()).toBeNull();
  });

  it("drains a queue in order under repeated polling", () => {
    // The exact shape of the bug: a polling caller must make progress, not see
    // the head of the queue forever.
    const input = new InputHandler();
    input.postKey(key("a"));
    input.postKey(key("b"));

    expect(input.peekKey()!.key).toBe("a");
    expect(input.peekKey()!.key).toBe("b");
    expect(input.peekKey()).toBeNull();
  });

  it("keeps UI_WaitKey and peekKey drawing from one queue", () => {
    // The two entry points share the queue, so mixing them must not lose or
    // duplicate a key.
    const input = new InputHandler();
    input.postKey(key("a"));
    input.postKey(key("b"));

    expect(input.peekKey()!.key).toBe("a");
    return input.waitKey().then((k) => {
      expect(k.key).toBe("b");
      expect(input.peekKey()).toBeNull();
    });
  });
});

/**
 * `getMousePosition` must return CSS pixels relative to the canvas, which is
 * what C# returned as `MouseLocation` (a WinForms client coordinate) and what
 * `RogueGame.MouseToMap` expects: it divides by `UI_GetCanvasScale*` to reach
 * canvas coordinates.
 *
 * Returning canvas pixels here instead double-converts, and the error scales
 * with how far the canvas is displayed from 1:1 — the mouse would land on a
 * different tile the moment the window was not exactly 1366 CSS px wide.
 * Nothing headless can catch that, since the simulator has no mouse.
 */
describe("InputHandler.getMousePosition", () => {
  /**
   * Only `getBoundingClientRect` is read any more, but the backing-store size
   * is part of the stub because it is exactly what the old implementation
   * multiplied by: with a 2x device pixel ratio, backing is twice the rect.
   */
  function fakeCanvas(
    left: number,
    top: number,
    cssWidth: number,
    cssHeight: number,
    devicePixelRatio = 1,
  ): HTMLCanvasElement {
    return {
      width: Math.round(cssWidth * devicePixelRatio),
      height: Math.round(cssHeight * devicePixelRatio),
      getBoundingClientRect: () => ({ left, top, width: cssWidth, height: cssHeight }) as DOMRect,
    } as unknown as HTMLCanvasElement;
  }

  /**
   * Moves the mouse without a DOM.
   *
   * The suite runs in Node, and `attach()` needs a document. `onMouseMove` is
   * an arrow-function property that only reads `clientX`/`clientY`, so calling
   * it directly is the same code path a real event takes.
   */
  function mouseAt(input: InputHandler, clientX: number, clientY: number): void {
    (input as unknown as { onMouseMove: (e: { clientX: number; clientY: number }) => void })
      .onMouseMove({ clientX, clientY });
  }

  it("reports position relative to the canvas, not to the page", () => {
    const input = new InputHandler();
    mouseAt(input, 100 + 448, 50 + 160);
    expect(input.getMousePosition(fakeCanvas(100, 50, 1366, 768))).toEqual(new Point(448, 160));
  });

  it("is unaffected by the backing store, so it does not depend on the DPR", () => {
    // Same cursor, same displayed size, backing store doubled for a 2x display.
    // The old code scaled by canvas.width / rect.width, so it answered double
    // here — and MouseToMap then divided by the scale a second time, putting
    // the mouse on the wrong tile on every HiDPI screen.
    const input = new InputHandler();
    mouseAt(input, 448, 160);
    const atDpr1 = input.getMousePosition(fakeCanvas(0, 0, 1366, 768, 1));
    const atDpr2 = input.getMousePosition(fakeCanvas(0, 0, 1366, 768, 2));

    expect(atDpr1).toEqual(new Point(448, 160));
    expect(atDpr2).toEqual(atDpr1);
  });
});

/**
 * The wheel.
 *
 * Two things have to be true and neither is obvious. It has to *consume*, because
 * a menu that redraws on a notch polls it in a loop and a non-consuming version
 * returns from the wait immediately and on every pass after — the screen
 * repaints as fast as the CPU allows and no keystroke ever gets a turn. That is
 * the `UI_PeekKey` bug already documented at the top of this file, and the wheel
 * is the third instance of it. And it has to be in *pixels*, because the browser
 * does not report it that way.
 */
describe("InputHandler.peekWheel", () => {
  /** Dispatches a wheel event without a DOM; see `mouseAt` above. */
  function wheel(input: InputHandler, deltaY: number, deltaMode = 0): { prevented: boolean } {
    const state = { prevented: false };
    (input as unknown as {
      onWheel: (e: { deltaY: number; deltaMode: number; preventDefault: () => void }) => void;
    }).onWheel({ deltaY, deltaMode, preventDefault: () => { state.prevented = true; } });
    return state;
  }

  it("returns 0 when the wheel has not moved", () => {
    expect(new InputHandler().peekWheel()).toBe(0);
  });

  it("consumes the delta it returns", () => {
    const input = new InputHandler();
    wheel(input, 100);
    expect(input.peekWheel()).toBe(100);
    // The dangerous one: a second read must be empty, or a polling caller spins.
    expect(input.peekWheel()).toBe(0);
  });

  it("accumulates a gesture's events instead of keeping only the last", () => {
    // A mouse wheel and a trackpad are not the same device. Chrome sends one
    // deltaY of ~100 per notch; a trackpad sends a stream of small deltas that
    // together make one gesture. Keeping only the last event drops most of a
    // flick — the list jumps one row and stops.
    const input = new InputHandler();
    for (const delta of [7, 11, 9, 13, 6]) wheel(input, delta);
    expect(input.peekWheel()).toBe(46);
  });

  it("sums across separate polls, so nothing is lost between them", () => {
    const input = new InputHandler();
    wheel(input, 30);
    expect(input.peekWheel()).toBe(30);
    wheel(input, 30);
    expect(input.peekWheel()).toBe(30);
  });

  it("claims the event, so the page cannot scroll under the menu", () => {
    // The page is one full-screen canvas with `overflow: hidden`, so there is
    // nothing to scroll — but a gesture that reaches a menu must not scroll-chain
    // or rubber-band anyway. Also why the listener is registered non-passive: a
    // passive handler cannot call preventDefault, and the failure would be silent.
    expect(wheel(new InputHandler(), 100).prevented).toBe(true);
  });

  it("keeps a reverse gesture negative rather than folding it", () => {
    const input = new InputHandler();
    wheel(input, -100);
    expect(input.peekWheel()).toBe(-100);
  });

  it("has an injectable path, so a headless run can wheel", () => {
    const input = new InputHandler();
    input.postWheel(100);
    expect(input.peekWheel()).toBe(100);
    expect(input.peekWheel()).toBe(0);
  });
});

/**
 * `deltaY` is not a distance, and using it as one is a cross-browser bug that
 * looks like a broken wheel rather than a units difference: Firefox reports
 * *lines* and Chrome reports *pixels* for the same physical gesture, so the same
 * notch moves a list several rows in Chrome and one in Firefox.
 */
describe("InputHandler.wheelPixels", () => {
  it("passes pixel deltas through unchanged", () => {
    expect(InputHandler.wheelPixels(100, 0)).toBe(100);
  });

  it("scales Firefox's line deltas up to pixels", () => {
    // Firefox: 3 lines for one notch. Untreated, 3 "pixels" is a third of a row
    // and most notches would not move the selection at all.
    const lines = 3;
    expect(InputHandler.wheelPixels(lines, 1)).toBeGreaterThan(lines * 10);
  });

  it("scales page deltas up to pixels", () => {
    expect(InputHandler.wheelPixels(1, 2)).toBeGreaterThan(InputHandler.wheelPixels(1, 1));
  });

  it("orders the three modes the way a real gesture does", () => {
    // One notch, as each engine reports it, must land in the same ballpark — that
    // is the entire point of normalising.
    const chrome = InputHandler.wheelPixels(100, 0);
    const firefox = InputHandler.wheelPixels(3, 1);
    expect(Math.abs(chrome - firefox) / chrome).toBeLessThan(0.75);
  });

  it("ignores an unrecognised mode rather than dropping the delta", () => {
    // Unknown must mean "pixels", not "zero": losing the gesture entirely is a
    // worse failure than a wrong distance.
    expect(InputHandler.wheelPixels(100, 99)).toBe(100);
  });

  it("keeps the sign", () => {
    expect(InputHandler.wheelPixels(-100, 0)).toBe(-100);
    expect(InputHandler.wheelPixels(-3, 1)).toBeLessThan(0);
  });
});
