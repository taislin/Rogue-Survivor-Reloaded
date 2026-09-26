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
      ui.UI_ClearMinimap(Color.Black);
      ui.UI_SetMinimapColor(1, 1, Color.White);
      ui.UI_DrawMinimap(0, 0);
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
