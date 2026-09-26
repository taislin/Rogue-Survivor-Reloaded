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
