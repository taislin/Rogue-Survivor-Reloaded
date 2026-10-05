import { describe, it, expect } from "vitest";
import { InputHandler } from "@ui/InputHandler";
import { NullRogueUI } from "@ui/NullRogueUI";
import type { GameKeyEvent } from "@engine/IRogueUI";

/**
 * Keys typed while the game was busy used to survive into a later turn.
 *
 * Two separate player reports, one cause. The attack lunge is four frames of
 * `DELAY_SHORT / 2`, about 500 ms, and the death and achievement screens block on
 * ENTER — but `InputHandler.keyQueue` was unbounded and nothing ever drained it, so
 * a press made during any of those was still queued and got spent later:
 *
 *   - "after hitting an enemy, the sprite stays there a bit longer, and sometimes
 *      it hits again after the kill" — the second press became a second attack.
 *   - "can move after the player is dead for one or two turns" — presses made
 *      while the death sequence ran resolved once the loop came back around.
 *
 * `RogueGame.HandlePlayerActor` now calls `UI_FlushQueuedKeys` at the turn
 * boundary. This file covers the flush primitive itself; the wiring is a single
 * call whose reach is already guaranteed by `IRogueUI`, since the interface makes
 * it mandatory for every UI.
 *
 * Deliberately no game here. These are pure, and a suite that stands up a world to
 * check a queue length costs minutes per run for no extra signal.
 */

function key(name: string): GameKeyEvent {
  return {
    key: name,
    keyCode: name.length === 1 ? name.toUpperCase().charCodeAt(0) : 0,
    shift: false,
    ctrl: false,
    alt: false,
  };
}

describe("InputHandler.flushQueuedKeys", () => {
  it("drops every key queued so far, so the next wait needs a fresh press", async () => {
    const input = new InputHandler();
    input.postKey(key("h"));
    input.postKey(key("j"));

    input.flushQueuedKeys();

    // The queue really is empty rather than merely reordered: `peekKey` is the
    // consuming read the game uses, so a non-null here is a banked instruction.
    expect(input.peekKey()).toBeNull();

    // And `waitKey` blocks instead of handing back a stale press. The pending
    // promise is all this asserts; it is released below.
    let resolved = false;
    const waiting = input.waitKey().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    input.postKey(key("h"));
    await waiting;
    expect(resolved).toBe(true);
    expect(input.peekKey()).toBeNull();
  });

  it("is a no-op on an empty queue", () => {
    const input = new InputHandler();
    expect(() => input.flushQueuedKeys()).not.toThrow();
    expect(input.peekKey()).toBeNull();
  });

  /**
   * The one thing a flush must not do is invent a key.
   *
   * A pending waiter is a promise the game is *already* blocked on. Fabricating an
   * event to satisfy it would run whatever code is waiting — a turn, a prompt —
   * with a key nobody pressed, which is a strictly worse bug than the one being
   * fixed.
   */
  it("does not release a waiter that is already pending", async () => {
    const input = new InputHandler();
    let resolved = false;
    const waiting = input.waitKey().then(() => {
      resolved = true;
    });
    await Promise.resolve();

    input.flushQueuedKeys();
    await Promise.resolve();
    expect(resolved).toBe(false);

    input.postKey(key("Enter"));
    await waiting;
    expect(resolved).toBe(true);
  });

  /**
   * Keys arriving after the flush are kept.
   *
   * Without this, "discard the backlog" and "ignore the keyboard" are the same
   * change, and only one of them is playable.
   */
  it("keeps keys pressed after the flush", async () => {
    const input = new InputHandler();
    input.postKey(key("h"));
    input.flushQueuedKeys();
    input.postKey(key("j"));

    expect(input.peekKey()?.key).toBe("j");
    expect(input.peekKey()).toBeNull();
  });
});

describe("NullRogueUI.UI_FlushQueuedKeys", () => {
  /**
   * Reaches the private queue on purpose.
   *
   * `NullRogueUI.UI_PeekKey` cannot answer "is anything left?" — `ensureKey`
   * fabricates a key when the queue is empty, so a peek *always* returns one. That
   * is deliberate here (it lets an unattended run fall through prompts) and it is
   * the same trap that makes the real UI useless for driving a turn. So emptiness is
   * read off the queue itself, which is the thing the flush is supposed to empty.
   */
  function queued(ui: NullRogueUI): number {
    return (ui as unknown as { keyQueue: GameKeyEvent[] }).keyQueue.length;
  }

  it("drops pushed keys", () => {
    const ui = new NullRogueUI();
    ui.pushKeys("h", "h", "j");
    expect(queued(ui)).toBe(3);

    ui.UI_FlushQueuedKeys();

    expect(queued(ui)).toBe(0);
  });

  it("keeps keys pushed after the flush", () => {
    const ui = new NullRogueUI();
    ui.pushKeys("h");
    ui.UI_FlushQueuedKeys();
    ui.pushKeys("j");
    expect(queued(ui)).toBe(1);
    expect(ui.UI_PeekKey()?.key).toBe("j");
  });
});