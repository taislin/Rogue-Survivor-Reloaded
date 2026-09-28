import { describe, it, expect, afterEach } from "vitest";
import { InputHandler } from "@ui/InputHandler";
import { MouseButton } from "@engine/IRogueUI";

/**
 * `peekClickCount` must consume, and must not fire on the right button.
 *
 * Double-clicking an item picks it up, so both failure modes here are
 * destructive rather than cosmetic:
 *
 *  - A non-consuming version reports 2 on every poll. The play loop's
 *    `WaitKeyOrMouse` polls, so a later *single* click would read the stale 2
 *    and pick something up. That is the same `UI_PeekKey` bug this repo already
 *    documents, in a new place.
 *  - Counting the right button would make a double right-click a pickup. The
 *    right button is bound to real commands, and a double right-click is a
 *    context-menu gesture in every UI convention that has one.
 *
 * The count comes from the browser's `MouseEvent.detail`, so the multi-click
 * interval and slop distance are the platform's and are not re-derived here.
 *
 * These go through `postMouseDown` rather than a dispatched event: the suite
 * runs `environment: "node"` with no DOM on purpose (see vitest.config.mts), and
 * `postMouseDown` exists as the same injection seam `postKey` and `postWheel`
 * already are.
 */
describe("InputHandler.peekClickCount", () => {
  it("reports 0 when nothing was clicked", () => {
    expect(new InputHandler().peekClickCount()).toBe(0);
  });

  it("reports 1 for a single click", () => {
    const input = new InputHandler();
    input.postMouseDown(1, 1);
    expect(input.peekClickCount()).toBe(1);
  });

  it("reports 2 for a double click", () => {
    const input = new InputHandler();
    input.postMouseDown(1, 2);
    expect(input.peekClickCount()).toBe(2);
  });

  it("consumes, so a polling caller sees the count exactly once", () => {
    // The exact shape of the UI_PeekKey bug: a second poll must not see 2 again.
    const input = new InputHandler();
    input.postMouseDown(1, 2);
    expect(input.peekClickCount()).toBe(2);
    expect(input.peekClickCount()).toBe(0);
  });

  it("does not carry a double click over to the next press", () => {
    // The consequence of the above that would actually be noticed: an ordinary
    // click after a double click must read as 1, or every later click picks up.
    const input = new InputHandler();
    input.postMouseDown(1, 2);
    expect(input.peekClickCount()).toBe(2);
    input.postMouseDown(1, 1);
    expect(input.peekClickCount()).toBe(1);
  });

  it("ignores the right button entirely", () => {
    const input = new InputHandler();
    input.postMouseDown(2, 2);
    expect(input.peekClickCount()).toBe(0);
  });

  it("treats a synthesised event's detail of 0 as one click", () => {
    // `dispatchEvent` without `init` gives detail 0. Reporting 0 there would
    // read as "no click" and make the feature silently dead under test.
    const input = new InputHandler();
    input.postMouseDown(1, 0);
    expect(input.peekClickCount()).toBe(1);
  });
});

/**
 * The browser's own right-click menu must never open.
 *
 * The game binds the right button to real commands, and in a browser those were
 * unusable without this: the native menu opens over the canvas on every press,
 * so the command fires and then a menu covers the screen the player is acting
 * on. Its own entries are the worst of it — "Save image as..." on a page that is
 * one canvas, because anything painted in one is a saveable image.
 *
 * `preventDefault` on `mousedown` or `mouseup` does not suppress it; the
 * `contextmenu` event is the only hook that does, which is why this tests the
 * *registration* rather than a dispatched event — there is no DOM here to
 * dispatch one against.
 */
describe("InputHandler context-menu suppression", () => {
  const realDocument = globalThis.document;

  /** A `document` stand-in that records which listeners are registered. */
  function fakeDocument(): { registered: Set<string>; removed: Set<string> } {
    const registered = new Set<string>();
    const removed = new Set<string>();
    (globalThis as { document?: unknown }).document = {
      addEventListener: (type: string) => registered.add(type),
      removeEventListener: (type: string) => removed.add(type),
    };
    return { registered, removed };
  }

  afterEach(() => {
    (globalThis as { document?: unknown }).document = realDocument;
  });

  it("registers a contextmenu listener", () => {
    const { registered } = fakeDocument();
    new InputHandler().attach();
    expect(registered.has("contextmenu")).toBe(true);
  });

  it("removes it on detach, so a stale handler cannot eat an RMB", () => {
    const { registered, removed } = fakeDocument();
    const input = new InputHandler();
    input.attach();
    input.detach();

    expect(registered.has("contextmenu")).toBe(true);
    expect(removed.has("contextmenu")).toBe(true);
  });

  it("still records the right button as a game input", () => {
    // Cancelling the menu must not cancel the button: the RMB commands are the
    // whole reason this is here, so the two are separate paths.
    const input = new InputHandler();
    input.postMouseDown(2, 1);
    expect(input.peekMouseButtons()).toBe(MouseButton.Right);
  });
});
