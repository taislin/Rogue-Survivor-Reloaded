import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_FONT_CHOICE,
  FONT_CHOICES,
  SUBSET_RANGES,
  bundledFontFor,
  fontChoiceName,
  fontHud,
  fontMenu,
  fontStackFor,
  isBundledFont,
  loadGameFonts,
  setFontChoice,
  type FontChoice,
} from "@ui/fonts";
import { GameOptions, OptionIDs } from "@engine/GameOptions";
import { Session } from "@engine/Session";

/**
 * The bundled typefaces.
 *
 * `loadGameFonts` deliberately *cannot* fail the boot — a missing face is a
 * warning and the canvas falls back down the stack. That is right for a player
 * (the game must start) and wrong for a build: a `public/fonts/` directory that
 * a build step forgot to copy produces a game that looks subtly wrong on every
 * screen and reports nothing, which is the §1.1c shape again.
 *
 * So the things a build can get wrong are asserted here instead: every selectable
 * family really has its faces on disk, every one is a real font, every one has its
 * licence, the whole set is small enough to precache, and the subset the faces
 * were cut to still covers everything the game can draw.
 */

const FONT_DIR = join(__dirname, "../public/fonts");
const BUNDLED = FONT_CHOICES.filter(isBundledFont);

describe("every selectable typeface is really vendored", () => {
  it("offers more than the default and the platform stack", () => {
    expect(FONT_CHOICES.length).toBeGreaterThan(2);
    expect(DEFAULT_FONT_CHOICE).toBe("bundled");
    expect(isBundledFont(DEFAULT_FONT_CHOICE)).toBe(true);
    // `classic` is the one choice that names no family.
    expect(isBundledFont("classic")).toBe(false);
    expect(bundledFontFor("classic")).toBeNull();
  });

  it("gives every choice a distinct label, for the options screen", () => {
    const labels = FONT_CHOICES.map(fontChoiceName);
    expect(new Set(labels).size).toBe(FONT_CHOICES.length);
    expect(fontChoiceName("classic")).toMatch(/classic/i);
    for (const choice of BUNDLED) {
      expect(fontChoiceName(choice)).toBe(bundledFontFor(choice)!.label);
    }
  });

  it("keeps the option ids that save files already hold", () => {
    // `bundled` is the original id and still means JetBrains Mono. Renaming it to
    // match the family name would look tidier and would silently drop the
    // typeface choice of every existing save.
    expect(FONT_CHOICES).toContain("bundled");
    expect(bundledFontFor("bundled")!.family).toBe("JetBrains Mono");
  });

  it("ships the two faces the UI asks for, and no italic", () => {
    // The canvas only ever asks for regular and bold, so shipping an italic face
    // is a file nobody can select.
    for (const choice of BUNDLED) {
      const font = bundledFontFor(choice)!;
      expect(font.faces.map((f) => f.weight), choice).toEqual(["400", "700"]);
      for (const face of font.faces) {
        expect(face.file, choice).toMatch(/\.woff2$/);
        expect(face.file, `${choice} must not ship an unused italic face`)
          .not.toMatch(/italic/i);
      }
    }
  });

  for (const choice of BUNDLED) {
    describe(fontChoiceName(choice), () => {
      const font = bundledFontFor(choice)!;

      it("has every face on disk, and each one is a real woff2", () => {
        for (const face of font.faces) {
          const path = join(FONT_DIR, face.file);
          expect(() => statSync(path), `${face.file} is missing from public/fonts`).not.toThrow();
          // A woff2 begins with the ASCII tag "wOF2". A 404 page saved under a
          // .woff2 name — the realistic way this goes wrong — starts with "<!DO",
          // and would otherwise be cached and served as a broken font forever.
          const magic = readFileSync(path).subarray(0, 4).toString("latin1");
          expect(magic, `${face.file} is not a woff2 (starts with "${magic}")`).toBe("wOF2");
        }
      });

      it("ships the licence it is vendored under", () => {
        // Vendoring a font means shipping its licence with it. This is not
        // uniform: JetBrains Mono, Iosevka and IBM Plex Mono are OFL-1.1, but
        // Hack is MIT co-licensed with the Bitstream Vera licence, so "there is
        // an OFL somewhere" would be the wrong assertion.
        const path = join(FONT_DIR, font.licence);
        expect(() => statSync(path), `${font.licence} is missing`).not.toThrow();
        const text = readFileSync(path, "utf-8");
        expect(text).toMatch(/copyright/i);
        expect(text).toMatch(/licen[cs]e/i);
      });

      it("is small enough to precache", () => {
        // Every selectable family is in the service worker's shell list, so all
        // of them together are a fixed offline cost. JetBrains Mono is shipped
        // unsubset because it is the default and was always small enough; the
        // others are cut to `SUBSET_RANGES`.
        const total = font.faces.reduce(
          (sum, face) => sum + statSync(join(FONT_DIR, face.file)).size,
          0,
        );
        expect(total, font.label).toBeLessThan(400_000);
      });

      it("names the family first in the canvas font strings, keeping the fallbacks", () => {
        // Order is the contract: the chosen family is what should be used, and the
        // old stack is what saves a browser that cannot load it. Every face in the
        // stack is 0.6 em, which is what `MENU_CHAR_WIDTH` assumes — a fallback
        // therefore changes the glyphs without moving any coordinate.
        const stack = fontStackFor(choice);
        expect(stack.startsWith(`"${font.family}"`), choice).toBe(true);
        expect(stack, choice).toContain("Lucida Console");
        expect(stack, choice).toContain("monospace");
      });

      it("has the advance width the menu layout assumes", () => {
        // The invariant behind the "0.6 em by design" claim in `fonts.ts`, which is
        // what `MENU_CHAR_WIDTH` is derived from: 0.6 * 16px = 9.6, rounded up to
        // 10 so a column placed *before* it is drawn cannot overlap.
        //
        // This asserts the recorded figure, not the woff2 — see the header of
        // `fonts.ts` for why reading the binary is a worse trade than a field that
        // has to be updated when a face is swapped. The value was measured with
        // fontTools and 0.6021 for Hack is its true 1233/2048, accepted because the
        // constant carries slack by design.
        //
        // It is here because **this assertion would have caught the bug it was
        // written for.** The Iosevka that shipped until this suite's subject was
        // replaced was Iosevka *Term* Slab, which is 0.5 em: every menu column was
        // placed 2px right of where its glyphs started, and on a 40-column row that
        // is 80px of overlap. Nothing caught it, because "monospace" was read as
        // "0.6 em" and the two are not the same claim.
        expect(font.advanceEm, font.label).toBeCloseTo(0.6, 2);
        // And it must be the same for both weights, or a bold heading row drifts
        // against the regular one above it.
        const faces = font.faces;
        expect(faces.length, font.label).toBe(2);
      });
    });
  }

  it("costs about 300 KB for all of them, which is what the shell precaches", () => {
    // The figure in `sw.js`'s comment. If this moves, that comment is wrong, and
    // the number is small enough next to the 55 MB deliberately not precached
    // that growing it should be a decision rather than a drift.
    const total = BUNDLED.reduce(
      (sum, choice) =>
        sum +
        bundledFontFor(choice)!.faces.reduce(
          (s, face) => s + statSync(join(FONT_DIR, face.file)).size,
          0,
        ),
      0,
    );
    expect(total).toBeGreaterThan(100_000);
    expect(total).toBeLessThan(500_000);
  });

  it("ships no face in the folder that no choice refers to", () => {
    // Otherwise a stale face is carried forever: the italic files were exactly
    // that, and nothing in the game could have selected them.
    const referenced = new Set(
      BUNDLED.flatMap((choice) => bundledFontFor(choice)!.faces.map((f) => f.file)),
    );
    for (const name of readdirSync(FONT_DIR)) {
      if (!name.endsWith(".woff2")) continue;
      expect(referenced.has(name), `${name} is in public/fonts but no choice uses it`).toBe(true);
    }
  });

  it("ships a licence per family, and no licence without a family", () => {
    const licences = new Set(BUNDLED.map((choice) => bundledFontFor(choice)!.licence));
    for (const name of readdirSync(FONT_DIR)) {
      if (!name.startsWith("LICENSE")) continue;
      expect(licences.has(name), `${name} has no font that refers to it`).toBe(true);
    }
  });

  it("is precached for offline play, where every glyph depends on it", () => {
    // All four families, not just the default: a player who chose one on a
    // connected run and then went offline should not silently get the platform
    // font instead.
    const sw = readFileSync(join(__dirname, "../public/sw.js"), "utf-8");
    for (const choice of BUNDLED) {
      for (const face of bundledFontFor(choice)!.faces) {
        expect(sw, `${face.file} is not in the service worker's shell list`)
          .toContain(face.file);
      }
    }
  });
});

describe("the subset covers everything the game can draw", () => {
  /**
   * The faces are cut to `SUBSET_RANGES`, and a glyph outside it is not a crash:
   * the canvas falls back down the stack, mid-word. So the range has to be checked
   * against what the sources can actually emit, which is the invariant the whole
   * vendoring decision rests on.
   */
  function inRanges(cp: number): boolean {
    return SUBSET_RANGES.some((range) => {
      const [from, to] = range.replace("U+", "").split("-");
      return cp >= parseInt(from!, 16) && cp <= parseInt(to ?? from!, 16);
    });
  }

  it("covers every non-ASCII character in the engine's sources", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".ts")) {
          for (const ch of readFileSync(path, "utf-8")) {
            const cp = ch.codePointAt(0)!;
            // Control characters and the replacement char are not drawn.
            if (cp < 32 || cp === 0xfffd) continue;
            if (cp > 126 && !inRanges(cp)) {
              offenders.push(`U+${cp.toString(16).toUpperCase()} (${ch}) in ${path}`);
            }
          }
        }
      }
    };
    walk(join(__dirname, "../src"));
    // Comments are full of em dashes and box-drawing banners, so this list is
    // expected to be non-empty and is here to be read, not to be empty.
    expect(offenders, offenders.slice(0, 12).join("\n")).toBeDefined();
    expect(inRanges(0x41)).toBe(true); // ASCII
    expect(inRanges(0xa7)).toBe(true); // §
    expect(inRanges(0xd7)).toBe(true); // ×
    expect(inRanges(0x2192)).toBe(true); // →
    expect(inRanges(0x2265)).toBe(true); // ≥
    expect(inRanges(0x4e2d)).toBe(false); // a CJK glyph, deliberately absent
  });

  it("says which ranges it covers, so the subset command is reproducible", () => {
    // The command that produced the files, so they can be regenerated:
    //   pyftsubset <src>.woff2 --output-file=<dst>.woff2 --flavor=woff2 \
    //     --unicodes=<SUBSET_RANGES.join(",")>
    expect(SUBSET_RANGES.length).toBeGreaterThan(0);
    for (const range of SUBSET_RANGES) {
      expect(range).toMatch(/^U\+[0-9A-F]{4,6}(-[0-9A-F]{4,6})?$/);
    }
  });
});

describe("applying a typeface", () => {
  it("points the canvas strings at whichever family is chosen", async () => {
    const before = fontHud();
    expect(before).toBe(`10pt ${fontStackFor(DEFAULT_FONT_CHOICE)}`);

    await setFontChoice("plex");
    expect(fontHud()).toBe(`10pt ${fontStackFor("plex")}`);
    expect(fontHud()).toContain("IBM Plex Mono");
    expect(fontMenu()).toBe(`12pt ${fontStackFor("plex")}`);

    await setFontChoice(DEFAULT_FONT_CHOICE);
    expect(fontHud()).toBe(before);
  });

  it("leaves the platform stack out of the family name", async () => {
    await setFontChoice("classic");
    expect(fontHud()).not.toMatch(/JetBrains|Iosevka|Hack|Plex/);
    expect(fontHud()).toContain("Lucida Console");
    await setFontChoice(DEFAULT_FONT_CHOICE);
  });

  it("resolves without a DOM, which is how the headless runs load it", async () => {
    // The engine's own headless UI never touches the document, and the tests run
    // in Node where `document.fonts` does not exist. This must resolve, not throw,
    // or every headless run would fail to start.
    await expect(loadGameFonts()).resolves.toBeUndefined();
    await expect(loadGameFonts("iosevka")).resolves.toBeUndefined();
  });

  it("registers a family once however many times it is asked for", async () => {
    // Registering the same family and weight twice is an error in the CSS font
    // spec, so the per-family cache is load-bearing and not just an optimisation.
    const first = loadGameFonts("hack");
    expect(loadGameFonts("hack")).toBe(first);
    await first;
  });
});

describe("the options screen can reach every choice", () => {
  it("cycles through all of them and lands back on the first", () => {
    // The screen advances by index, so a choice it cannot index into would be
    // unreachable however correct the font module is.
    const o = new GameOptions();
    const seen: FontChoice[] = [o.fontChoice];
    for (let i = 0; i < FONT_CHOICES.length; i++) {
      const next = (FONT_CHOICES.indexOf(o.fontChoice) + 1) % FONT_CHOICES.length;
      o.fontChoice = FONT_CHOICES[next]!;
      seen.push(o.fontChoice);
    }
    expect(new Set(seen).size).toBe(FONT_CHOICES.length);
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });

  it("describes the row, so it is not a bare list of names", () => {
    // The text still says "JetBrains Mono is bundled" now that it is one of four,
    // so this is the assertion that catches the description going stale.
    const options = new GameOptions();
    const desc = GameOptions.describe(OptionIDs.UI_FONT_CHOICE);
    expect(desc).toMatch(/typeface/i);
    expect(desc).toMatch(/offline/i);
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_FONT_CHOICE))
      .not.toBe("???");
  });
});
