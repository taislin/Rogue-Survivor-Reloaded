import { describe, it, expect } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { CanvasUI } from "@ui/CanvasUI";
import { OptionsScreen } from "@ui/OptionsScreen";
import { GameOptions, OptionIDs } from "@engine/GameOptions";
import { getUserNewScreenshotName, resetScreenshotCounter } from "@engine/Paths";

/**
 * Screenshot naming.
 *
 * Two bugs, both found by playing the browser build rather than by reading it:
 *
 *  - `GetUserNewScreenshotName` returned "screenshot_000" every time. The C#
 *    loops until the name is not already on disk; the port's `isFreeID = true`
 *    made the loop exit on the first pass, because a browser cannot see the
 *    Downloads folder.
 *  - `CanvasUI.UI_SaveScreenshot` ignored the path it was given and hardcoded
 *    `download = "screenshot.png"`.
 *
 * Together they meant every screenshot in the game was delivered as
 * `screenshot.png` and overwrote the last, while the message the game printed
 * claimed `screenshot_000.png` — a file the player never received.
 *
 * The download itself is still a browser download, which is the honest limit of
 * what a canvas can do: `a.click()` gives no completion signal, so a blocked
 * download cannot be detected. What *can* be made true is the name.
 */

describe("screenshot download names", () => {
  it("uses the last path segment of the engine's path", () => {
    // What `RogueGame.ScreenshotFilePath` produces: a Windows-shaped path with
    // the screenshot folder and the unique id.
    expect(CanvasUI.downloadName("Config\\Screenshot\\screenshot_007.png")).toBe("screenshot_007.png");
  });

  it("handles forward slashes too", () => {
    expect(CanvasUI.downloadName("Config/Screenshot/screenshot_012.png")).toBe("screenshot_012.png");
  });

  it("keeps distinct screenshots from colliding", () => {
    // The regression in one line: two shots, two names. Before, both were
    // "screenshot.png" and the second overwrote the first.
    const first = CanvasUI.downloadName("Config\\Screenshot\\screenshot_000.png");
    const second = CanvasUI.downloadName("Config\\Screenshot\\screenshot_001.png");
    expect(first).not.toBe(second);
  });

  it("strips characters a browser will not accept in a filename", () => {
    // `:` and friends are rejected on Windows; a `/` inside a download name is
    // read as a directory, so the segment before it must go entirely rather than
    // be sanitised into the name.
    expect(CanvasUI.downloadName("a/b:c*d?.png")).toBe("b_c_d_.png");
  });

  it("falls back to a usable name for an empty or dot path", () => {
    expect(CanvasUI.downloadName("")).toBe("screenshot.png");
    expect(CanvasUI.downloadName("..")).toBe("screenshot.png");
  });
});

describe("screenshot name generation", () => {
  it("never repeats a name within a session", () => {
    const game = new HeadlessRunner(918, new NullRogueUI()).rogueGame;
    const names = new Set<string>();
    for (let i = 0; i < 50; i++) names.add(game.GetUserNewScreenshotName());
    expect(names.size).toBe(50);
  });

  it("zero-pads to three digits, as the C# does", () => {
    // Asserted against `Paths` directly rather than through a game.
    //
    // It used to build a `HeadlessRunner` and expect "screenshot_000", which only
    // held because the counter was a field: a fresh game meant a fresh count. The
    // counter is module state now — which is the scope the naming rule actually
    // describes, "two shots in one session never collide", since two games in one
    // page load are one session — so the reset is explicit and the padding rule is
    // stated on its own terms instead of through a side effect.
    resetScreenshotCounter();
    expect(getUserNewScreenshotName()).toBe("screenshot_000");
    expect(getUserNewScreenshotName()).toBe("screenshot_001");
  });

  it("counts on across games, because a session outlives one RogueGame", () => {
    // The behaviour change this extraction makes explicit, pinned so it cannot be
    // undone by accident: two games in one page load share the counter, so the
    // second game's first screenshot is not "screenshot_000" again.
    resetScreenshotCounter();
    expect(getUserNewScreenshotName()).toBe("screenshot_000");
    const second = new HeadlessRunner(918, new NullRogueUI()).rogueGame;
    expect(second.GetUserNewScreenshotName()).toBe("screenshot_001");
  });
});

describe("the death screenshot option is gone", () => {
  it("has no field left to restore from storage", () => {
    // It was `isDeathScreenshotOn`, defaulting off because a browser cannot write
    // a file silently — a screenshot is a *download* — and an automatic one on
    // every death is a prompt on every death.
    //
    // Both halves of that are now moot: the option, the field, and the
    // `PlayerDied` branch that read it are gone. What matters is that a
    // `localStorage` blob from a session played before the removal cannot bring it
    // back. `GameOptions.load` adopts a stored key only when `key in options`, and
    // the field is not there, so a stale `m_DeathScreenshot: true` is dropped
    // rather than silently re-enabling a removed feature.
    const options = GameOptions.load();
    expect("isDeathScreenshotOn" in options).toBe(false);
    expect("m_DeathScreenshot" in options).toBe(false);
  });

  it("leaves the enum slot reserved rather than renumbering later options", () => {
    // `OptionIDs` is the C#'s vocabulary, so closing the gap would move every
    // option after it for no gain — and nothing persists a number anyway, since
    // `GameOptions.save` stores by field name.
    expect(OptionIDs.GAME_DEATH_SCREENSHOT_REMOVED).toBeGreaterThan(0);
    expect((OptionIDs as Record<string, unknown>).GAME_DEATH_SCREENSHOT).toBeUndefined();
  });

  it("is off the options screen", () => {
    // The row was " (Death) Death Screenshot", grouped under a `// death`
    // comment next to permadeath. Permadeath stays; the screenshot row does not.
    expect(OptionsScreenRows()).not.toContain(" (Death) Death Screenshot");
  });
});

/**
 * The rows the options screen can show, as their `optionName` strings.
 *
 * Read through the screen's own public list rather than by scanning source, so this
 * fails if the row is still listed even if every `case` that drew it was removed —
 * which is the shape the bug would take, since a listed row with no text takes the
 * options screen down when selected (see `options-coverage.test.ts`).
 */
function OptionsScreenRows(): readonly string[] {
  const screen = new OptionsScreen(new NullRogueUI()) as unknown as {
    list: OptionIDs[];
  };
  return screen.list.map((id) => GameOptions.optionName(id));
}
