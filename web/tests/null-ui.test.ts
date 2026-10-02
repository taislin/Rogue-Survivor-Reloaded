import { describe, it, expect } from "vitest";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Color } from "@engine/Color";
import { Rect } from "@engine/Rect";

/**
 * `NullRogueUI` must never block.
 *
 * This class is the only reason the engine can be driven without a browser, so
 * its one hard requirement is that it always eventually yields a key. If it
 * ever returned null or blocked, the headless simulator would hang rather than
 * fail — which is the failure mode a test timeout reports least clearly, so it
 * is worth pinning explicitly.
 */

describe("NullRogueUI", () => {
  it("synthesises a key when the queue is empty", async () => {
    const ui = new NullRogueUI();
    const key = await ui.UI_WaitKey();
    expect(key).not.toBeNull();
    expect(typeof key.key).toBe("string");
    expect(key.key.length).toBeGreaterThan(0);
  });

  it("answers UI_PeekKey too, so polling waiters cannot spin forever", () => {
    const ui = new NullRogueUI();
    // Must be non-null on the very first call with an empty queue.
    expect(ui.UI_PeekKey()).not.toBeNull();
  });

  it("UI_PeekKey consumes, because UI_PeekKey is a contract and not a name", () => {
    // `IRogueUI.UI_PeekKey` is the C# `UI_PeekKey`, and C# clears `m_HasKey`
    // before returning. `InputHandler.peekKey` implements exactly that and says
    // why in a comment: `WaitKeyOrMouse` and the sim's abort check poll in a loop
    // and would otherwise be handed the same key forever.
    //
    // This was not. `UI_PeekKey` returned the head of the queue without shifting
    // it, so every poll got the same keystroke — and a `WaitMenuInput` screen,
    // which reads one key per redraw, re-applied it until the selection wrapped.
    // `HandleMainMenu` could not be left: pressing ArrowDown eight times and then
    // Enter re-read `ArrowDown` every frame and landed back on row 0. It surfaced
    // as a hang in `endgame-exit.test.ts`, and it would have silently broken every
    // test of every menu in the game.
    const ui = new NullRogueUI();
    ui.UI_PostKey({ key: "ArrowDown", keyCode: 40, shift: false, ctrl: false, alt: false });
    expect(ui.UI_PeekKey()?.key).toBe("ArrowDown");
    // The next one is a *different* key, not the same one again. Synthesis kicks
    // in because the queue is empty, and the idle cycle supplies Enter — which is
    // the whole point of the cycle: two polls, two different keys, progress.
    expect(ui.UI_PeekKey()?.key).not.toBe("ArrowDown");
  });

  it("UI_PeekKey does not lose a pushed key to the idle cycle", () => {
    // The consuming fix must not turn the pushed queue into a shorter one: a
    // test that queues Enter, Enter has to get two Enters, in order. Without this
    // the natural repair — peeking without synthesising — would make every
    // `WaitMenuInput` screen spin again.
    const ui = new NullRogueUI();
    ui.pushKeys("ArrowUp", "Enter");
    expect(ui.UI_PeekKey()?.key).toBe("ArrowUp");
    expect(ui.UI_PeekKey()?.key).toBe("Enter");
  });

  it("walks a pushed queue to its end through polling, then resumes the cycle", () => {
    // What a menu needs, stated as one sequence: consume, consume, and only then
    // start synthesising. `endgame-exit.test.ts` depends on this to leave the
    // main menu.
    const ui = new NullRogueUI();
    ui.pushKeys("ArrowDown", "ArrowDown", "Enter");
    expect(ui.UI_PeekKey()?.key).toBe("ArrowDown");
    expect(ui.UI_PeekKey()?.key).toBe("ArrowDown");
    expect(ui.UI_PeekKey()?.key).toBe("Enter");
    // Queue drained: still non-null, so a polling waiter still cannot spin.
    expect(ui.UI_PeekKey()).not.toBeNull();
  });

  it("cycles through the keys the blocking waiters each require", async () => {
    // WaitEnter wants Enter, WaitEscape wants Escape, WaitYesOrNo wants y/n or
    // Escape. A single synthesised key would wedge two of those three.
    const ui = new NullRogueUI();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const k = await ui.UI_WaitKey();
      seen.push(k.key);
    }
    expect(seen).toEqual(["Enter", "Escape", "n", "y"]);
  });

  it("does not block when polled a thousand times", () => {
    const ui = new NullRogueUI();
    for (let i = 0; i < 1000; i++) expect(ui.UI_PeekKey()).not.toBeNull();
  });

  it("prefers a posted key over a synthesised one", async () => {
    const ui = new NullRogueUI();
    ui.UI_PostKey({ key: "F5", keyCode: 116, shift: false, ctrl: false, alt: false });
    const key = await ui.UI_WaitKey();
    expect(key.key).toBe("F5");
  });

  it("counts synthesised keys, for diagnosing a stuck run", async () => {
    const ui = new NullRogueUI();
    const before = ui.idleKeysServed;
    await ui.UI_WaitKey();
    expect(ui.idleKeysServed).toBe(before + 1);
  });

  it("starts not quit and can be told to quit", () => {
    const ui = new NullRogueUI();
    expect(ui.quitRequested).toBe(false);
    ui.UI_DoQuit();
    expect(ui.quitRequested).toBe(true);
  });

  it("swallows drawing calls without a DOM", () => {
    const ui = new NullRogueUI();
    // None of these may touch `document` or `window`. If a future change makes
    // NullRogueUI reach for the DOM, this is the test that catches it -- and
    // it matters, because the engine calls into the UI constantly.
    expect(() => {
      ui.UI_Clear(Color.Black);
      ui.UI_Repaint();
      ui.UI_DrawImage("Tiles\\floor_asphalt", 3, 4);
      ui.UI_DrawImageTinted("Tiles\\floor_asphalt", 3, 4, Color.Red);
      ui.UI_FillRect(Color.White, new Rect(0, 0, 10, 10));
      ui.UI_DrawString(Color.White, "hello", 1, 1);
      ui.UI_DrawStringBold(Color.White, "hello", 1, 1);
      ui.UI_DrawStringLarge(Color.White, "hello", 1, 1);
      ui.UI_DrawStringBoldLarge(Color.White, "hello", 1, 1);
      ui.UI_ClearMinimap(Color.Black);
      ui.UI_SetMinimapColor(1, 1, Color.White);
      ui.UI_DrawMinimap(0, 0, 200, 200);
    }).not.toThrow();
  });

  it("resolves UI_Wait without actually sleeping", async () => {
    // A real sleep here would make every sim run 250ms-per-actor slower.
    const ui = new NullRogueUI();
    const started = Date.now();
    await ui.UI_Wait(5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
