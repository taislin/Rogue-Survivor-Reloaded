import { describe, it, expect, beforeAll } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Session } from "@engine/Session";
import { AdvisorHint } from "@engine/GameHints";

/**
 * The advisor hints screen.
 *
 * Two things about it that nothing else would notice, and one of them is the kind
 * of bug that makes a screen look broken rather than wrong:
 *
 * 1. **The scroll clamp used the wrong line count.** `TEXTFILE_LINES_PER_PAGE` is
 *    50 and looks like exactly the right thing to clamp against — but only about
 *    36 lines fit between the header and the footnote, so the clamp let the view
 *    scroll *past* the end and stranded the last hints below the bottom edge with
 *    no way to reach them. The clamp is now derived from the same arithmetic the
 *    draw loop uses.
 *
 * 2. **Escape has to leave.** The screen is a `do { draw; wait }` loop with no
 *    other exit, so an Escape that is swallowed does not fail — it leaves the
 *    player stuck on a screen whose only way out is the key that stopped working.
 */

let game: RogueGame;
let ui: NullRogueUI;

beforeAll(async () => {
  Session.useSeed(4242);
  ui = new NullRogueUI();
  ui.recordText = true;
  game = new RogueGame(ui, new NullMusicManager());
  await game.LoadData();
});

/** Opens the screen, presses `keys`, and gives back everything that was drawn. */
async function openAndPress(keys: string[]): Promise<string[]> {
  ui.clearRecordedText();
  ui.pushKeys(...keys);
  await game.HandleHintsScreen();
  return [...ui.drawnLines];
}

describe("the hints screen", () => {
  it("leaves on Escape", async () => {
    // The only exit. If this hangs, the screen is a trap.
    ui.pushKeys("Escape");
    await expect(
      Promise.race([
        game.HandleHintsScreen().then(() => "left"),
        new Promise((r) => setTimeout(() => r("timed out"), 5_000)),
      ]),
    ).resolves.toBe("left");
  });

  it("leaves on Escape after scrolling in both directions", async () => {
    // The reported shape was "not always", so it is exercised from a scrolled
    // position and from the very top, where the clamp is doing the most work.
    for (const keys of [
      ["Escape"],
      ["ArrowDown", "ArrowDown", "Escape"],
      ["ArrowUp", "ArrowUp", "ArrowUp", "Escape"],
      ["PageDown", "PageDown", "PageDown", "Escape"],
      ["PageUp", "PageUp", "Escape"],
      ["r", "Escape"],
    ]) {
      ui.clearRecordedText();
      ui.pushKeys(...keys);
      await expect(
        Promise.race([
          game.HandleHintsScreen().then(() => "left"),
          new Promise((r) => setTimeout(() => r(`stuck after ${keys.join(",")}`), 5_000)),
        ]),
      ).resolves.toBe("left");
    }
  });

  it("offers Escape on screen, so leaving is discoverable", async () => {
    const drawn = await openAndPress(["Escape"]);
    expect(drawn.some((l) => l.includes("ESC to leave"))).toBe(true);
  });

  it("can scroll far enough to see the last hint", async () => {
    // The clamp is the point, and it is the *last* hint that distinguishes the two
    // clamps. With the old arithmetic — `lines.length - TEXTFILE_LINES_PER_PAGE`,
    // and 50 lines do not fit — the view stopped about 14 lines short of the end,
    // so the final hints were unreachable at any scroll position.
    //
    // Paging far more than the content needs, so the assertion is about the clamp
    // and not about how many pages it happened to take.
    const lastHint = AdvisorHint._COUNT - 1;
    const drawn = await openAndPress([
      ...Array<string>(40).fill("PageDown"),
      "Escape",
    ]);
    const numbers = drawn
      .map((l) => /^HINT (\d+) :/.exec(l)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    expect(numbers.length, "no hints were drawn at all").toBeGreaterThan(0);
    expect(
      numbers,
      `the last hint (${lastHint}) is unreachable - the scroll clamp stops short of the end`,
    ).toContain(lastHint);
  });

  it("does not run off the end of the text", async () => {
    // The other half of the clamp: paging past the end must not index past
    // `lines.length`. `NullRogueUI` would happily record `undefined` as a drawn
    // string, so its absence is the assertion.
    const drawn = await openAndPress([
      "PageDown", "PageDown", "PageDown", "PageDown", "PageDown", "PageDown", "Escape",
    ]);
    expect(drawn.some((l) => l === "undefined" || l.includes("undefined"))).toBe(false);
  });
});
