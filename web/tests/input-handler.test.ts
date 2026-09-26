import { describe, it, expect } from "vitest";
import { InputHandler } from "@ui/InputHandler";
import { GameKeyEvent } from "@engine/IRogueUI";

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
