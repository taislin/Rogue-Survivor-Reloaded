import { describe, it, expect } from "vitest";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MENU_CHAR_WIDTH,
  MENU_BOLD_LINE_SPACING,
  TEXTFILE_CHARS_PER_LINE,
  TEXTFILE_LINES_PER_PAGE,
  CREDITS_LINES,
  CREDITS_LINES_PER_SCREEN,
  CREDITS_RULE,
  clampCreditsLine,
} from "@engine/RogueGame";
import { IMAGE_SETS } from "@engine/AssetPaths";

/**
 * The credits screen has to name everyone whose work is in the build, and it has
 * to be able to show all of it.
 *
 * Three separate things are easy to get wrong here, and none of them throw.
 *
 * **Attribution is a licence obligation, not a nicety.** The fork's media are
 * CC0 *or* CC-BY 3.0 with every file modified, and CC-BY attribution is a
 * condition of use — those sprites are merged into this port's `classic` set and
 * its audio tables, so the port is the redistributor and owes the credit. So the
 * names are asserted by content, not by count: a `toBe(4)` on the section count
 * would pass just as happily if the Still Alive programmer were quietly dropped
 * from one of them.
 *
 * **Every shipped sprite style must be credited.** `IMAGE_SETS` is the single
 * source of truth for what a player can pick in Options, and a set added to it
 * is reachable with no other edit — which is exactly why a set with nobody
 * credited in the credits screen is a legal problem that nothing else in the
 * build would catch.
 *
 * **The reader must not crop.** The credits are longer than one screen, so the
 * cursor clamp has to be against what fits. The manual reader's clamp is against
 * `TEXTFILE_LINES_PER_PAGE` instead, which is sound for a manual longer than a
 * page and silently wrong for anything shorter: the clamp pins the cursor to 0
 * every pass, so the arrow keys, the page keys and the scroll all become no-ops
 * and the screen only moves when a number key is pressed. That is why
 * `CREDITS_LINES_PER_SCREEN` and `clampCreditsLine` are separate from the manual's
 * arithmetic and why the arithmetic is asserted here — getting it wrong does not
 * crash, it just quietly puts the last line out of reach.
 */

const SECTION = "<SECTION>";
const drawable = CREDITS_LINES.filter((l) => l !== SECTION);

describe("who the credits name", () => {
  it("names the original author, the Still Alive programmer, and this port", () => {
    const all = CREDITS_LINES.join("\n");
    // roguedjack wrote the game; Mark Pryor wrote the fork whose content is
    // merged in; Taislin wrote the port that merged it. Each is a different
    // person and a different claim, so all three are named separately.
    expect(all).toContain("Jacques Ruiz (roguedjack)");
    expect(all).toContain("Mark Pryor (MP)");
    expect(all).toContain("Taislin");
  });

  it("credits every sprite style that ships, with the artist who made it", () => {
    // The names come from the sprites' own provenance, not from the folder
    // names: Deon made both the DEONAPOCALYPSE and the Genesis Classic Rogue
    // Survivor mods on the Bay12 file depot, and daftigod posted Daft Tiles to
    // the Rogue Survivor fan forum.
    const all = CREDITS_LINES.join("\n");
    expect(all).toContain("Deon");
    expect(all).toContain("daftigod");
  });

it("has a line naming every set in IMAGE_SETS, by its display name", () => {
    // Checked against `IMAGE_SETS` rather than a second list of four names: a new
    // set added to the options screen has to turn up here too, and that is the
    // failure this catches — a shipped style nobody credited, which nothing else
    // in the build would notice.
    //
    // Two deliberate loosenings. The name is `spriteStyleName` *without* its
    // "(complete set)" annotation, because that annotation is an options-screen
    // hint about the `classic` fallback and is not part of what the style is
    // called. And the compare is case-insensitive, because the credits carry the
    // proper name of each piece of art in the value column — "Daft Tiles b1" is
    // `dafttiles b1` in the options row and *Daft Tiles* to its author — and a
    // player matches the two by eye, not by string. The folder name this derives
    // from is what still ties the two together: a set renamed in `AssetPaths`
    // stops matching here.
    for (const set of IMAGE_SETS) {
      const name = set.replace(/_/g, " ").toLowerCase();
      expect(
        CREDITS_LINES.some((l) => l.toLowerCase().includes(name)),
        `no credits line names the "${name}" sprite style`,
      ).toBe(true);
    }
  });

  it("credits the fork's third-party media sources, which are CC-BY", () => {
    // Attribution for the CC-BY subset is a condition, not a courtesy — see
    // plans/STILL_ALIVE_JOURNAL.md. opengameart.org covers the LPC plant
    // repack and the box symbols; the two audio hosts are the fork's own.
    const all = CREDITS_LINES.join("\n");
    expect(all).toContain("opengameart.org");
    expect(all).toContain("freesound.org");
    expect(all).toContain("pixabay.com");
    // And the licence itself, so the screen is self-contained.
    expect(all).toContain("GNU GPL v3");
  });
});

describe("the credits screen's layout", () => {
  it("has sections, and they are what the number keys jump to", () => {
    // `<SECTION>` is skipped when drawing and counted when jumping, so a file
    // with no markers still works but has no jumps. Three sections for three
    // claims: the original, the fork, and the sprite styles.
    const markers = CREDITS_LINES.filter((l) => l === SECTION).length;
    expect(markers).toBe(3);
    // Numbered from 1, so a player pressing a digit needs `markers + 1` to
    // reach them all; 9 is `KeyToChoiceNumber`'s ceiling.
    expect(markers + 1).toBeLessThanOrEqual(9);
    // And they cannot be the first line, or `0` (top of file) and `1` (first
    // section) would be the same place.
    expect(CREDITS_LINES.indexOf(SECTION)).toBeGreaterThan(0);
  });

  it("is longer than one screen, which is why it is a reader", () => {
    // If this ever drops to `CREDITS_LINES_PER_SCREEN` or below, the whole
    // reader - the cursor field, the page keys, the section jumps - is dead
    // weight, and the single-screen draw it replaced was simpler.
    expect(CREDITS_LINES.length).toBeGreaterThan(CREDITS_LINES_PER_SCREEN);
  });

  it("holds a screenful of lines in the space the header and footer leave", () => {
    // The literal 38 is the point. It is what the shipped geometry works out
    // to, and a change to CANVAS_HEIGHT, to the menu leading, or to the header
    // height moves it. Nothing throws when it moves - lines just start falling
    // off the bottom - so it is written down here.
    expect(CREDITS_LINES_PER_SCREEN).toBe(38);

    // Recomputed from the geometry rather than trusting the constant above, so
    // the two cannot drift apart unnoticed.
    const firstLineTop = 3 * MENU_BOLD_LINE_SPACING;
    const lastLineTop = CANVAS_HEIGHT - 2 * MENU_BOLD_LINE_SPACING - 1;
    const fits = Math.floor((lastLineTop - firstLineTop) / MENU_BOLD_LINE_SPACING) + 1;
    expect(CREDITS_LINES_PER_SCREEN).toBe(fits);
  });

  it("pages by a screen rather than by the manual's 50-line page", () => {
    // PageDown moves by CREDITS_LINES_PER_SCREEN. Had it moved by
    // TEXTFILE_LINES_PER_PAGE it would jump twelve lines past the end and be
    // clamped straight back, so a player could never reach the middle of the
    // sprite-styles section with the page keys.
    expect(TEXTFILE_LINES_PER_PAGE).toBe(50);
    expect(CREDITS_LINES_PER_SCREEN).toBeLessThan(TEXTFILE_LINES_PER_PAGE);
  });

  it("keeps every line inside the rule that frames it", () => {
    // The rule is what says how wide a line is allowed to be. A line wider than
    // it runs off the right of the canvas at the longest one in the list, and
    // only there, which is why it is checked against the drawn width and not
    // against TEXTFILE_CHARS_PER_LINE - the credits are hand-written, not
    // wrapped by `TextFile.formatLines`, so nothing else would catch it.
    const widest = Math.max(...drawable.map((l) => l.length));
    expect(widest).toBeLessThanOrEqual(TEXTFILE_CHARS_PER_LINE);
    expect(CREDITS_RULE.length * MENU_CHAR_WIDTH).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(widest * MENU_CHAR_WIDTH).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it("credits the players at the end, which is the last line on the screen", () => {
    // The C# ended on this. It is still last, and that matters now: the reader
    // stops at the last full screen, so a line added after it would only be
    // reachable by scrolling, never by arriving at the end.
    expect(drawable[drawable.length - 1]).toContain("eagerness to die!");
  });
});

describe("the credits cursor clamp", () => {
  it("stops at the last screen, not the last line", () => {
    // From `length - 1` there is one line of credits and 37 lines of black.
    const last = clampCreditsLine(CREDITS_LINES.length - 1, CREDITS_LINES.length);
    expect(last).toBe(CREDITS_LINES.length - CREDITS_LINES_PER_SCREEN);
    // And the last screen really does show the last line.
    expect(drawable[drawable.length - 1]).toBe(
      CREDITS_LINES[last + CREDITS_LINES_PER_SCREEN - 1],
    );
  });

  it("does not go negative or past the end", () => {
    expect(clampCreditsLine(-5, CREDITS_LINES.length)).toBe(0);
    expect(clampCreditsLine(9999, CREDITS_LINES.length)).toBe(
      CREDITS_LINES.length - CREDITS_LINES_PER_SCREEN,
    );
  });

  it("pins a list shorter than a screen to the top, so the scroll keys are no-ops", () => {
    // Not a bug: there is nothing below to scroll to, and clamping to 0 is what
    // keeps `lines[iLine]` in range. Asserted because this is the case the
    // manual reader gets wrong, and the two were written to be the same shape.
    expect(clampCreditsLine(30, 10)).toBe(0);
    expect(clampCreditsLine(0, 10)).toBe(0);
  });
});