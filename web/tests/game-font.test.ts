import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FONT_HUD, FONT_MENU, FONT_STACK, GAME_FONT_FAMILY } from "@ui/fonts";

/**
 * The bundled typeface.
 *
 * `loadGameFonts` deliberately *cannot* fail the boot — a missing face is a
 * warning and the canvas falls back down the stack. That is right for a player
 * (the game must start) and wrong for a build: a `public/fonts/` directory that
 * a build step forgot to copy produces a game that looks subtly wrong on every
 * screen and reports nothing, which is the §1.1c shape again.
 *
 * So the two things a build can get wrong are asserted here instead: the files
 * are really fonts, and the canvas font strings really name them.
 */

const FONT_DIR = join(__dirname, "../public/fonts");
const FACES = ["JetBrainsMono-Regular.woff2", "JetBrainsMono-Bold.woff2"];

describe("the bundled typeface", () => {
  it("ships both faces the UI asks for", () => {
    for (const face of FACES) {
      const path = join(FONT_DIR, face);
      expect(() => statSync(path), `${face} is missing from public/fonts`).not.toThrow();
      // A woff2 begins with the ASCII tag "wOF2". A 404 page saved under a .woff2
      // name — the realistic way this goes wrong — starts with "<!DO", and would
      // otherwise be cached and served as a broken font forever.
      const magic = readFileSync(path).subarray(0, 4).toString("latin1");
      expect(magic, `${face} is not a woff2 (starts with "${magic}")`).toBe("wOF2");
    }
  });

  it("ships a licence for the font it vendors", () => {
    // JetBrains Mono is OFL-1.1, and vendoring a font means shipping its licence
    // with it. The file is not loaded by anything; it is there because it has to be.
    const licence = join(FONT_DIR, "LICENSE-JetBrainsMono.txt");
    expect(() => statSync(licence)).not.toThrow();
    expect(readFileSync(licence, "utf-8")).toMatch(/SIL OPEN FONT LICENSE/i);
  });

  it("is small enough to precache", () => {
    // Both faces are in the service worker's shell list, because every glyph in
    // the game uses them. A variable font or a full Latin/Cyrillic/Greek set
    // would be several times this, and would need rethinking rather than
    // precaching.
    const total = FACES.reduce((sum, face) => sum + statSync(join(FONT_DIR, face)).size, 0);
    expect(total).toBeLessThan(400_000);
  });

  it("names the family first in the canvas font strings, keeping the fallbacks", () => {
    // Order is the contract: JetBrains Mono is what should be used, and the old
    // stack is what saves a browser that cannot load it. All four faces in the
    // stack are 0.6 em, which is what `MENU_CHAR_WIDTH` assumes — a fallback
    // therefore changes the glyphs without moving any coordinate.
    expect(FONT_STACK.startsWith(`"${GAME_FONT_FAMILY}"`)).toBe(true);
    expect(FONT_STACK).toContain("Lucida Console");
    expect(FONT_STACK).toContain("monospace");

    expect(FONT_HUD).toBe(`10pt ${FONT_STACK}`);
    expect(FONT_MENU).toBe(`12pt ${FONT_STACK}`);
  });

  it("is precached for offline play, where every glyph depends on it", () => {
    const sw = readFileSync(join(__dirname, "../public/sw.js"), "utf-8");
    for (const face of FACES) {
      expect(sw, `${face} is not in the service worker's shell list`).toContain(face);
    }
  });
});
