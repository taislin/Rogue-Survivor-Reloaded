import { describe, it, expect } from "vitest";
import { wrapToWidth } from "@ui/textWrap";

/**
 * The word wrap behind the `(Gfx) Speech Bubbles` option.
 *
 * It is separated out of `CanvasUI` and given a `measure` callback so it can be
 * tested at all — `CanvasUI` needs a real 2D context, which Node does not have,
 * so a wrap loop living on it would run only in a browser and would be wrong
 * there without anything noticing. A bubble that wraps badly is not a crash: it
 * is one over-long line running the width of the street, and every line still
 * goes to the message log underneath, so nothing else reports it.
 *
 * `measure` is a character count here. That is not what a font does — glyphs
 * differ in width — but the algorithm must not care, and a count is what makes
 * the assertions exact and the overflow cases reproducible.
 */

/** Character count, standing in for `ctx.measureText`. */
const width = (s: string): number => s.length;

describe("wrapToWidth", () => {
  it("leaves text that already fits alone", () => {
    expect(wrapToWidth("Help!", 100, width)).toEqual(["Help!"]);
  });

  it("returns nothing for nothing", () => {
    // `UI_DrawSpeechBubble` draws the box before the text, so an empty result has
    // to mean "draw no box at all" — it early-returns on it. An empty *line* here
    // would instead produce a box with padding and nothing in it.
    expect(wrapToWidth("", 100, width)).toEqual([]);
    expect(wrapToWidth("   ", 100, width)).toEqual([]);
    expect(wrapToWidth("\n\t  ", 100, width)).toEqual([]);
  });

  it("breaks on spaces, keeping words whole", () => {
    expect(wrapToWidth("one two three", 7, width)).toEqual(["one two", "three"]);
    // Five characters into a three-character limit, so "three" cannot be kept
    // whole and takes the character-break path instead.
    expect(wrapToWidth("one two three", 3, width)).toEqual(["one", "two", "thr", "ee"]);
  });

  it("collapses whitespace rather than wrapping on it", () => {
    // `split(/\s+/)` on a run of spaces yields empty strings. Left in, the first
    // one re-extends the current line with a space and the whole thing is off by
    // one per gap.
    expect(wrapToWidth("one   two", 100, width)).toEqual(["one two"]);
    expect(wrapToWidth("  one two  ", 100, width)).toEqual(["one two"]);
  });

  it("gives every returned line to the limit, except one that cannot be helped", () => {
    // The property the wrapping exists to provide, checked over the whole
    // function's output rather than case by case.
    for (const text of [
      "I should not be here just drove a bit too fast",
      "a b c d e f g h i j k l m n o p",
      "Look for a CHAR Office, a room with an iron door.",
    ]) {
      for (const limit of [1, 2, 5, 11, 40]) {
        for (const line of wrapToWidth(text, limit, width)) {
          expect(line.length, `"${line}" exceeds ${limit}`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it("breaks a word too long to fit, rather than letting it run", () => {
    // A shout with no spaces in it. Left whole, one line would be the width of
    // the street and would cover everything the bubble was meant to annotate.
    expect(wrapToWidth("AAAAGGGGGGGRRR", 4, width)).toEqual(["AAAA", "GGGG", "GGGR", "RR"]);
  });

  it("terminates when a single character is wider than the limit", () => {
    // The hang. `maxWidth: 0` is the smallest honest version of it — a glyph
    // wider than the whole box. Without the `chunk.length > 0` guard the loop
    // pushes an empty chunk and never advances.
    expect(wrapToWidth("abc", 0, width)).toEqual(["a", "b", "c"]);
    expect(wrapToWidth("abc", 1, width)).toEqual(["a", "b", "c"]);
    // And the ordinary path, where every character fits.
    expect(wrapToWidth("abc", 3, width)).toEqual(["abc"]);
  });

  it("asks the caller how wide things are, so it never assumes a font", () => {
    // Wider glyphs wrap sooner; the line count has to follow the measurement
    // rather than a hardcoded character budget. The limit here is 70, and at ten
    // pixels a character "one two" is exactly 70 — which is why this is the case
    // that would catch an off-by-one in the comparison as well.
    const wide = (s: string): number => s.length * 10;
    expect(wrapToWidth("one two three", 70, width)).toEqual(["one two three"]);
    expect(wrapToWidth("one two three", 70, wide)).toEqual(["one two", "three"]);
    expect(wrapToWidth("one two three", 50, wide)).toEqual(["one", "two", "three"]);
  });

  it("puts a long word on a line of its own rather than with a neighbour", () => {
    // "hi " + the 20-character word is 23, so at 23 it shares a line with "hi" and
    // one character tighter it cannot and is pushed onto its own.
    expect(wrapToWidth("hi supercalifragilistic hi", 23, width))
      .toEqual(["hi supercalifragilistic", "hi"]);
    expect(wrapToWidth("hi supercalifragilistic hi", 22, width))
      .toEqual(["hi", "supercalifragilistic", "hi"]);
  });

  it("does not leave a trailing empty line", () => {
    // A wrap that ends exactly on a boundary used to push the emptied line, and
    // the box grew by one line of padding with nothing in it.
    for (const limit of [3, 7, 11]) {
      const lines = wrapToWidth("one two three four", limit, width);
      expect(lines.every((l) => l.length > 0), `limit ${limit}: [${lines}]`).toBe(true);
    }
  });
});