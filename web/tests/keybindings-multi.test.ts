import { describe, it, expect, beforeEach } from "vitest";
import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { PlayerCommand } from "@engine/PlayerCommand";
import { storage } from "@engine/storage";

/**
 * Several keys per command, and a numpad that is not the number row.
 *
 * These are one bug and one feature, and the bug is the older one.
 *
 * The C# keeps `Dictionary<PlayerCommand, Keys>`, and its `Keys` enum has
 * `NumPad7` and `D7` as *different values*, so it can bind the eight directions
 * to the numpad and the item slots to the digit row at the same time. The port
 * keys bindings by the browser's `key` string, and a numpad 7 arrives as the
 * string "7" — identical to the digit above it. So the port silently dropped all
 * eight of the C#'s numpad movement defaults (its own comment claimed "Numpad +
 * arrows + vi keys" while binding only the arrows), and a player who tried to add
 * them found the binding *replaced* the item slot instead of joining it.
 *
 * `event.code` is the only thing that distinguishes the two ("Numpad7" against
 * "Digit7"), so that is what the identity is built from. And once a key is
 * unambiguous, a command can hold several — which the C# cannot, and which is
 * what makes the arrows and the numpad both usable without a choice.
 */

const STORAGE_KEY = "rogue_survivor_keybindings";

beforeEach(() => {
  storage.removeItem(STORAGE_KEY);
});

/** The digit row and the numpad report the same character; only `code` differs. */
function press(kb: Keybindings, key: string, code: string): PlayerCommand {
  return InputTranslator.keyToCommand(kb, key, false, false, false, code);
}

describe("the numpad and the digit row are different keys", () => {
  it("binds both at once, which is the whole point", () => {
    const kb = new Keybindings();

    // The digit row still selects items...
    expect(press(kb, "7", "Digit7")).toBe(PlayerCommand.ITEM_SLOT_6);
    // ...and the numpad key above it moves, instead of replacing that binding.
    expect(press(kb, "7", "Numpad7")).toBe(PlayerCommand.MOVE_NW);
  });

  it("ships the C#'s eight numpad movement defaults", () => {
    // These were missing from the port entirely. Each direction carries the arrow
    // key *and* its numpad key, which is only expressible now that a command can
    // hold more than one.
    const expected: [string, PlayerCommand][] = [
      ["Numpad2", PlayerCommand.MOVE_S],
      ["Numpad3", PlayerCommand.MOVE_SE],
      ["Numpad4", PlayerCommand.MOVE_W],
      ["Numpad6", PlayerCommand.MOVE_E],
      ["Numpad7", PlayerCommand.MOVE_NW],
      ["Numpad8", PlayerCommand.MOVE_N],
      ["Numpad9", PlayerCommand.MOVE_NE],
      ["Numpad1", PlayerCommand.MOVE_SW],
    ];
    const kb = new Keybindings();
    for (const [code, command] of expected) {
      const digit = code.slice("Numpad".length);
      expect(press(kb, digit, code), `${code} does not move`).toBe(command);
    }
  });

  it("keeps the arrows working alongside the numpad", () => {
    const kb = new Keybindings();
    expect(InputTranslator.keyToCommand(kb, "ArrowUp", false, false, false, "ArrowUp")).toBe(
      PlayerCommand.MOVE_N
    );
    expect(press(kb, "8", "Numpad8")).toBe(PlayerCommand.MOVE_N);
    expect(kb.getAll(PlayerCommand.MOVE_N)).toEqual(["ArrowUp", "Num 8"]);
  });

  it("still lets the numpad drive the item slots when nothing claims it there", () => {
    // Regression guard for the fallback: with NumLock on, a numpad 5 reports
    // `key: "5"`, and a player used to selecting items with the numpad must keep
    // working. Nothing is bound to "Num 5" by default, so it falls through to the
    // digit-row binding for "5" — which is the fifth slot, `ITEM_SLOT_4`.
    const kb = new Keybindings();
    expect(kb.getAll(PlayerCommand.ITEM_SLOT_4)).toEqual(["5"]);
    expect(press(kb, "5", "Numpad5")).toBe(PlayerCommand.ITEM_SLOT_4);
  });

  it("names a numpad key readably, because these strings are shown to the player", () => {
    // "Num 4" says what a player needs; "Numpad4" is a DOM `code` in the UI.
    expect(Keybindings.canonicalKey("4", "Numpad4")).toBe("Num 4");
    expect(Keybindings.canonicalKey("4", "Digit4")).toBe("4");
    expect(Keybindings.canonicalKey("ArrowLeft", "ArrowLeft")).toBe("ARROWLEFT");
    expect(Keybindings.canonicalKey(".", "NumpadDecimal")).toBe("Num .");
  });

  it("treats a missing code as unknown, never as the digit row", () => {
    // The headless UI and the tests synthesise keys with no position at all; that
    // must not be read as "the numpad" or as "the digit row".
    expect(Keybindings.canonicalKey("7", undefined)).toBe("7");
    expect(Keybindings.isNumpad(undefined)).toBe(false);
  });
});

describe("several keys per command", () => {
  it("adds a key without dropping the one it had", () => {
    const kb = new Keybindings();
    const before = kb.getAll(PlayerCommand.ITEM_SLOT_6);
    kb.addKey(PlayerCommand.ITEM_SLOT_6, "Num 7");

    expect(kb.getAll(PlayerCommand.ITEM_SLOT_6)).toEqual([...before, "Num 7"]);
    expect(kb.get(PlayerCommand.ITEM_SLOT_6)).toBe(before[0]); // primary unchanged
  });

  it("still shows the first key to everything that displays a binding", () => {
    // Fifteen "press <...>" hints read `get(cmd)`, and a help screen that started
    // listing every alias would overflow its columns.
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    expect(kb.get(PlayerCommand.SHOUT)).toBe("S");
  });

  it("replaces every key when `set` is used", () => {
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    kb.set(PlayerCommand.SHOUT, "Y");
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual(["Y"]);
  });

  it("takes a key away from whichever command had it", () => {
    // The C# rule: a key belongs to exactly one command, so a save can never
    // leave two commands answering to the same press.
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    expect(kb.getCommand("Ctrl+G")).toBe(PlayerCommand.SHOUT);
    expect(kb.getAll(PlayerCommand.NEGOCIATE_TRADE)).not.toContain("Ctrl+G");
  });

  it("ignores re-adding a key the command already has", () => {
    // Holding a key down on the rebind screen must not grow the list forever.
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual(["S", "Ctrl+G"]);
  });

  it("drops the last key on request, and can be left unbound", () => {
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    kb.addKey(PlayerCommand.SHOUT, "Alt+G");
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual(["S", "Ctrl+G", "Alt+G"]);

    kb.removeLastKey(PlayerCommand.SHOUT);
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual(["S", "Ctrl+G"]);

    kb.removeLastKey(PlayerCommand.SHOUT);
    kb.removeLastKey(PlayerCommand.SHOUT);
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual([]);
    expect(kb.get(PlayerCommand.SHOUT)).toBeUndefined();
    // And the freed key is available again rather than orphaned.
    kb.addKey(PlayerCommand.SHOUT, "S");
    expect(kb.getCommand("S")).toBe(PlayerCommand.SHOUT);
  });

  it("reports a conflict when one key somehow reaches two commands", () => {
    // Unreachable through the public API by design; this is the C# check, and it
    // is what a hand-edited or corrupt save would trip.
    const kb = new Keybindings();
    expect(kb.checkForConflict()).toBe(false);
    (kb as unknown as { commandToKeys: Map<PlayerCommand, string[]> }).commandToKeys.set(
      PlayerCommand.SHOUT,
      ["S", "H"]
    );
    expect(kb.checkForConflict()).toBe(true);
  });
});

describe("keybinding storage", () => {
  it("round-trips several keys per command", () => {
    const kb = new Keybindings();
    kb.addKey(PlayerCommand.SHOUT, "Ctrl+G");
    kb.addKey(PlayerCommand.MOVE_NW, "Ctrl+Num 7");
    kb.saveToStorage();

    const back = new Keybindings();
    back.resetToDefaults();
    expect(back.loadFromStorage()).toBe(true);
    expect(back.getAll(PlayerCommand.SHOUT)).toEqual(["S", "Ctrl+G"]);
    expect(back.getAll(PlayerCommand.MOVE_NW)).toEqual(["Num 7", "Ctrl+Num 7"]);
  });

  it("still reads a save written when a command could only have one key", () => {
    // The old shape was `[[cmd, key]]`. Refusing it would throw away a player's
    // keybindings because the game gained a feature, which is a bad trade for a
    // list of strings.
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        [PlayerCommand.SHOUT, "Y"],
        [PlayerCommand.ITEM_SLOT_0, "F1"],
      ])
    );
    const kb = new Keybindings();
    kb.resetToDefaults();
    expect(kb.loadFromStorage()).toBe(true);
    expect(kb.getAll(PlayerCommand.SHOUT)).toEqual(["Y"]);
    expect(kb.getAll(PlayerCommand.ITEM_SLOT_0)).toEqual(["F1"]);
  });

  it("reports failure rather than throwing on corrupt data", () => {
    storage.setItem(STORAGE_KEY, "]]]not json[[[");
    const kb = new Keybindings();
    kb.resetToDefaults();
    expect(kb.loadFromStorage()).toBe(false);
  });
});
