/**
 * Greedy word wrap, with a measurement callback rather than a canvas.
 *
 * The algorithm is pure and takes `measure` for two reasons, and the second is the
 * one that matters for testing:
 *
 * - **A canvas belongs to the browser.** `CanvasUI` can only be built where there
 *   is a real 2D context, so a wrap loop living on it has no coverage at all in a
 *   Node test run — and a wrap loop is exactly the sort of thing that is wrong in
 *   a way nothing notices: no throw, still legible, just an over-long line running
 *   across the map. Here it can be handed a `length => length.length` and checked.
 * - **The caller keeps the measurement.** Text width is a property of the font
 *   currently installed, which only the renderer knows. Handing it in rather than
 *   importing `fonts.ts` keeps this a function of its arguments, so the same code
 *   would wrap in the HUD face and the menu face without knowing either exists.
 *
 * Used by `CanvasUI.UI_DrawSpeechBubble`.
 */

/**
 * Breaks `text` into lines no wider than `maxWidth` as reported by `measure`.
 *
 * Words are kept whole and broken on spaces. A single word wider than the limit —
 * a long name, or a shout with no spaces in it — is broken by character instead,
 * because leaving it whole is how one line ends up the width of the street.
 *
 * @param measure Width of a string in the caller's current font.
 */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    // `split` on a run of whitespace yields empty strings, which would otherwise
    // measure as an empty candidate and keep re-extending the same line.
    if (word.length === 0) continue;

    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line.length > 0) {
      lines.push(line);
      line = "";
    }

    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }

    // Character break, and the `chunk.length > 0` guard is the load-bearing part:
    // without it, a character whose own glyph is wider than `maxWidth` would push
    // an empty `chunk`, push a blank line and never advance the index — a hang, on
    // the one input this branch exists to survive.
    let chunk = "";
    for (const ch of word) {
      if (chunk.length > 0 && measure(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }

  if (line.length > 0) lines.push(line);
  return lines;
}