import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { InputHandler } from "@ui/InputHandler";
import { PlayerCommand } from "@engine/PlayerCommand";

/**
 * Two caches and a key handler that each answered a question from a *stale*
 * copy, so the game looked right and was not.
 *
 * 1. **`InputHandler` did not claim modified keys.** It preventDefaulted a
 *    hard-coded list of six (`ArrowUp`..`ArrowRight`, space, `Tab`). The defaults
 *    also bind five Ctrl combinations — `Ctrl+S` save-place, `Ctrl+N` build
 *    large fortification, `Ctrl+P` pull mode, `Ctrl+H` hints, `Ctrl+E` mark
 *    enemies — and none of those was suppressed, so the game ran the command
 *    *and* the browser ran its own. `Ctrl+N` opened a new window and took focus
 *    away mid-game; `Ctrl+P` opened a print dialog. Nothing in the game pointed
 *    at the cause.
 *
 * 2. **`CanvasUI`'s grayscale cache was never invalidated.** `grayVariant`
 *    caches a rasterised sprite keyed only by image id, so switching the
 *    sprite-style option left every *already-visited* tile drawing the previous
 *    style's grayscale sprite until the page was reloaded. Unexplored tiles
 *    updated immediately, which is what made it look like it half-worked.
 *
 * Neither is observable from a screenshot alone, and `NullRogueUI` drops both
 * paths entirely, so the simulator is blind to them by construction.
 */

describe("a key the game has bound must not also trigger the browser's action", () => {
  const keys = new Keybindings();

  /** The five Ctrl combinations the defaults bind, and the command each reaches. */
  const CTRL_BINDINGS: Array<[string, PlayerCommand]> = [
    ["S", PlayerCommand.SWITCH_PLACE],
    ["N", PlayerCommand.BUILD_LARGE_FORTIFICATION],
    ["P", PlayerCommand.PULL_MODE],
    ["H", PlayerCommand.HINTS_SCREEN_MODE],
    ["E", PlayerCommand.MARK_ENEMIES_MODE],
  ];

  it("the defaults really do bind all five", () => {
    // If a binding is renamed or dropped, this says so instead of the tests
    // below quietly covering a key that no longer exists.
    for (const [ch, expected] of CTRL_BINDINGS) {
      expect(
        InputTranslator.keyToCommand(keys, ch, true, false, false, `Key${ch}`),
        `Ctrl+${ch} should reach its command`,
      ).toBe(expected);
    }
  });

  it("every one of them is a key the browser also acts on", () => {
    // The premise of the fix. If a future default lands on a Ctrl combination
    // the browser leaves alone, this is the assertion that stops the reasoning
    // from being applied where it does not hold.
    const ALSO_BROWSER_SHORTCUTS = new Set(["S", "N", "P", "H", "E", "O", "T", "W", "F", "G"]);
    for (const [ch] of CTRL_BINDINGS) {
      expect(ALSO_BROWSER_SHORTCUTS.has(ch), `Ctrl+${ch} has no browser action`).toBe(true);
    }
  });

  it("the handler suppresses the default for a bound modified key", () => {
    // Driven through the real `InputHandler.shouldPreventDefault`, with the same
    // predicate `main.ts` installs. Not a source grep: the bug was a missing
    // branch, and a missing branch reads perfectly well.
    const input = new InputHandler();
    input.setCommandPredicate((key, ctrl, alt, shift, code) =>
      InputTranslator.keyToCommand(keys, key, ctrl, alt, shift, code) !== PlayerCommand.NONE,
    );

    for (const [ch] of CTRL_BINDINGS) {
      expect(
        input.shouldPreventDefault(ch, true, false, false, `Key${ch}`),
        `Ctrl+${ch} is bound, so its browser action must be suppressed`,
      ).toBe(true);
    }
  });

  it("leaves unbound modified keys to the browser", () => {
    // The other direction, so the fix is not "swallow every keystroke". Ctrl+Q
    // is bound to nothing in the defaults.
    const input = new InputHandler();
    input.setCommandPredicate((key, ctrl, alt, shift, code) =>
      InputTranslator.keyToCommand(keys, key, ctrl, alt, shift, code) !== PlayerCommand.NONE,
    );

    expect(InputTranslator.keyToCommand(keys, "Q", true, false, false, "KeyQ")).toBe(
      PlayerCommand.NONE,
    );
    expect(input.shouldPreventDefault("Q", true, false, false, "KeyQ")).toBe(false);
  });

  it("still suppresses the six navigation keys with no predicate installed", () => {
    // The original behaviour, and the reason the predicate is an addition rather
    // than a replacement. Arrow keys and space scroll the page; Tab moves focus
    // out of the canvas. All six are bound in the defaults, but the handler must
    // not depend on a predicate having been wired up.
    const bare = new InputHandler();
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab"]) {
      expect(bare.shouldPreventDefault(k), `${k} must be suppressed`).toBe(true);
    }
  });

  it("a binding added later is covered without touching the handler", () => {
    // Why the predicate is derived from the bindings rather than being another
    // hard-coded list: rebind something to an unused Ctrl combination and it is
    // suppressed too, with no edit to the UI layer.
    const custom = new Keybindings();
    custom.set(PlayerCommand.ABANDON_GAME, "Ctrl+Q");

    const input = new InputHandler();
    input.setCommandPredicate((key, ctrl, alt, shift, code) =>
      InputTranslator.keyToCommand(custom, key, ctrl, alt, shift, code) !== PlayerCommand.NONE,
    );

    expect(
      InputTranslator.keyToCommand(custom, "Q", true, false, false, "KeyQ"),
    ).toBe(PlayerCommand.ABANDON_GAME);
    expect(input.shouldPreventDefault("Q", true, false, false, "KeyQ")).toBe(true);
  });
});

describe("the grayscale sprite cache is invalidated with the rest of the image caches", () => {
  it("invalidateImagesIfSetChanged clears it", () => {
    // `grayVariant` keys only on image id and never consults `imageCache`, so an
    // entry from the previous sprite style is returned as if it were fresh. That
    // is what left every memorised tile on the old grayscale art.
    const src = readFileSync(join(__dirname, "..", "src", "ui", "CanvasUI.ts"), "utf-8");
    const body = /private invalidateImagesIfSetChanged\(\)[^{]*\{([\s\S]*?)\n  \}/.exec(src);
    expect(body, "could not find invalidateImagesIfSetChanged").not.toBeNull();

    const clears = [...body![1].matchAll(/this\.(\w+)\.clear\(\)/g)].map((m) => m[1]);
    expect(clears).toContain("imageCache");
    expect(clears).toContain("imageLoading");
    expect(clears).toContain("imageChainIndex");
    // The one that was missing.
    expect(clears, "grayCache must be cleared with the others").toContain("grayCache");
  });

  it("the source file contains no raw control bytes, so grep can audit it", () => {
    // `CanvasUI.downloadName` once carried a literal NUL and 0x1F inside a regex
    // character class. That is correct code, but it made the file *binary* to
    // grep and ripgrep, so every `grep -rn` over `src/` reported
    // "binary file matches" and no findings for one of the two most important UI
    // files. The control range is now written as the escapes `\x00-\x1F`.
    const buf = readFileSync(join(__dirname, "..", "src", "ui", "CanvasUI.ts"));
    const control = [...buf].filter((b) => b < 9 || (b > 10 && b < 32 && b !== 13));
    expect(
      control,
      `CanvasUI.ts holds ${control.length} raw control byte(s); use \\x00-\\x1F escapes`,
    ).toEqual([]);
  });
});
