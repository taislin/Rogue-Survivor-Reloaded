/**
 * The in-game typeface.
 *
 * The game draws every glyph itself, on a canvas, so there is no stylesheet in
 * play: the font has to be registered with the document *and* finished loading
 * before the first `fillText`, or the canvas silently draws the fallback and then
 * re-draws in the real font a frame later. That second part is the whole reason
 * this file exists rather than a `@font-face` block in a CSS file — a webfont is
 * asynchronous by nature, and the game's layout maths assumes a fixed advance
 * width (see `MENU_CHAR_WIDTH` in `RogueGame.ts`).
 *
 * ## Why bundled rather than linked
 *
 * Three reasons, in order of how much they would hurt:
 *
 *  1. The game is a PWA and a Neutralino desktop app. Both are expected to work
 *     with no network, and a font fetched from a CDN would leave the whole UI in a
 *     fallback face for the entire first session offline.
 *  2. A remote font is a third-party request on every cold start, for something
 *     that is part of the game's design rather than its content.
 *  3. The faces are small once subset, so vendoring beats a subsetting pipeline
 *     at runtime — and the subsetting is a one-off, checked in.
 *
 * ## Why the faces are subset
 *
 * The game's text is ASCII plus a handful of punctuation marks (`§ × – — … → ≈ ≥`,
 * found by scanning the sources), so the shipped faces are cut to that range with
 * `pyftsubset`. The sizes that matters:
 *
 *  - Iosevka Term Slab is a *huge* font upstream — 1.76 MB a face — and the bulk
 *    of that is glyphs this game can never draw, plus OpenType feature tables.
 *    Subset to the game's range, and with the features dropped, it is 25 KB.
 *  - Dropping the feature tables is not just size. These are monospace faces and
 *    the layout maths assumes one uniform advance (`MENU_CHAR_WIDTH`), so a
 *    ligature substituting `->` for two glyphs would break every column position
 *    computed from that constant.
 *
 * The subset range is recorded in `SUBSET_RANGES` below and asserted by
 * `tests/game-font.test.ts`, so it cannot drift away from what the code needs.
 *
 * ## Why none of this moves the layout
 *
 * `MENU_CHAR_WIDTH` assumes a 0.6 em advance, which is what "Lucida Console",
 * "Courier New" and `monospace` all are. Every family here is 0.6 em by design —
 * they are all monospace — so the menu column positions computed from that
 * constant stay correct whichever one is selected. The glyph *shapes* change
 * (x-height, slab serifs on Iosevka, the narrower punctuation of IBM Plex), which
 * is the point, but no coordinate has to move.
 *
 * ## Licensing
 *
 * All four vendored families ship their licence next to the files, and
 * `tests/game-font.test.ts` fails if one goes missing. They are not all the same
 * licence: JetBrains Mono, Iosevka and IBM Plex Mono are OFL-1.1, while **Hack is
 * MIT co-licensed with the Bitstream Vera licence** (it descends from Bitstream
 * Vera Sans Mono), not OFL. Read `LICENSE-Hack.txt` before redistributing it.
 */

/** A typeface vendored into `public/fonts/`. */
export interface BundledFont {
  /** Family name, as registered with the document and used in canvas font strings. */
  family: string;
  /** Name for the options screen. */
  label: string;
  /**
   * The faces vendored for it: exactly the weights the UI asks for, which is
   * regular and bold. Italic is never requested, so no face is shipped for it.
   */
  faces: ReadonlyArray<{ file: string; weight: string }>;
  /** The licence that has to ship beside the faces. */
  licence: string;
}

/**
 * The codepoint ranges the shipped faces are subset to, as `pyftsubset` takes
 * them. ASCII, Latin-1, and the punctuation, arrows, maths and shapes the game
 * actually draws.
 *
 * Kept as data rather than only as a comment so a test can check that everything
 * the sources can emit is inside it — that is the invariant subsetting depends on,
 * and it is invisible until a glyph goes missing at runtime.
 */
export const SUBSET_RANGES = [
  "U+0020-007E", // Basic Latin: every letter, digit and ASCII punctuation
  "U+00A0-00FF", // Latin-1 Supplement: § × ° ± © etc.
  "U+2010-2015", // hyphens and dashes
  "U+2018-201D", // curly quotes
  "U+2022", // bullet
  "U+2026", // ellipsis
  "U+2030", // per mille
  "U+2039-203A", // single angle quotes
  "U+2190-2193", // arrows
  "U+21D2", // double arrow
  "U+2248", // almost equal to
  "U+2260-2265", // ≠ ≤ ≥
  "U+25A0", // black square, for a drawn bar
  "U+25B2", // up triangle
  "U+25BC", // down triangle
  "U+25CF", // bullet, solid
] as const;

/**
 * The vendored families, keyed by option id.
 *
 * The ids are persisted in save files and in the options screen's cycling order,
 * so they are not renamed for tidiness — `bundled` is the original id and still
 * means JetBrains Mono, the default.
 */
const BUNDLED_FONTS = {
  bundled: {
    family: "JetBrains Mono",
    label: "JetBrains Mono",
    faces: [
      { file: "JetBrainsMono-Regular.woff2", weight: "400" },
      { file: "JetBrainsMono-Bold.woff2", weight: "700" },
    ],
    licence: "LICENSE-JetBrainsMono.txt",
  },
  iosevka: {
    family: "Iosevka Term Slab",
    label: "Iosevka Term Slab",
    faces: [
      { file: "IosevkaTermSlab-Regular.woff2", weight: "400" },
      { file: "IosevkaTermSlab-Bold.woff2", weight: "700" },
    ],
    licence: "LICENSE-IosevkaTermSlab.txt",
  },
  hack: {
    family: "Hack",
    label: "Hack",
    faces: [
      { file: "hack-regular.woff2", weight: "400" },
      { file: "hack-bold.woff2", weight: "700" },
    ],
    licence: "LICENSE-Hack.txt",
  },
  plex: {
    family: "IBM Plex Mono",
    label: "IBM Plex Mono",
    faces: [
      { file: "IBMPlexMono-Regular.woff2", weight: "400" },
      { file: "IBMPlexMono-Bold.woff2", weight: "700" },
    ],
    licence: "LICENSE-IBMPlexMono.txt",
  },
} as const satisfies Record<string, BundledFont>;

/** The family the default choice registers. Kept for the canvas font strings. */
export const GAME_FONT_FAMILY = BUNDLED_FONTS.bundled.family;

/**
 * The typeface choices, in the order the option cycles them.
 *
 * `bundled` is JetBrains Mono: it is what the game was designed against, it is
 * present on every platform and offline, and it is the first entry so it is what
 * a player gets without touching the option.
 *
 * The other three are alternatives a player may prefer, all 0.6 em monospace and
 * all present offline. Iosevka Term Slab is the slab-serifed one, Hack is the
 * screen-reading one, IBM Plex Mono the most neutral.
 *
 * `classic` is the stack the port used before any font was vendored — the
 * platform monospace faces. It is here because that *was* the game's look, and
 * because the C# asked for "Lucida Console" specifically: a player who came from
 * the original may prefer it, and on Windows it is what they had.
 */
export const FONT_CHOICES = ["bundled", "iosevka", "hack", "plex", "classic"] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

/** The choices that name a vendored family rather than the platform stack. */
export type BundledFontChoice = keyof typeof BUNDLED_FONTS;

export const DEFAULT_FONT_CHOICE: FontChoice = "bundled";

/** Whether a choice is one of the vendored families. */
export function isBundledFont(choice: FontChoice): choice is BundledFontChoice {
  return choice !== "classic";
}

/** The vendored family a choice names, or `null` for the platform stack. */
export function bundledFontFor(choice: FontChoice): BundledFont | null {
  return isBundledFont(choice) ? BUNDLED_FONTS[choice] : null;
}

/** The stack each choice resolves to. All are 0.6 em; see the file header. */
export function fontStackFor(choice: FontChoice): string {
  const font = bundledFontFor(choice);
  return font === null
    ? `"Lucida Console", "Courier New", monospace`
    : `"${font.family}", "Lucida Console", "Courier New", monospace`;
}

/**
 * The canvas font strings, in the order `CanvasUI` uses them.
 *
 * These are the *default* choice, which is also the fallback: the option rewrites
 * the family stack through `setFontChoice` when the player picks another one, so
 * a game that never loads its options still draws correctly.
 */
let currentStack = fontStackFor(DEFAULT_FONT_CHOICE);

/** The stack the canvas font strings are currently built from. */
export function currentFontStack(): string {
  return currentStack;
}

/** 10pt HUD face: the side panel, the message log, the location panel. */
export function fontHud(): string {
  return `10pt ${currentStack}`;
}

/** Bold 10pt: status labels and the like. */
export function fontHudBold(): string {
  return `bold 10pt ${currentStack}`;
}

/** 12pt reading face: popups and every full-screen menu. */
export function fontMenu(): string {
  return `12pt ${currentStack}`;
}

/** Bold 12pt: menu selections and headings. */
export function fontMenuBold(): string {
  return `bold 12pt ${currentStack}`;
}

/**
 * Points the canvas font strings at a choice, and loads its faces if needed.
 *
 * The strings are built from `currentStack` rather than being constants, because
 * `CanvasUI` captured them at construction time and an option that cannot change
 * them is not an option. `CanvasUI` re-reads them through the getters above on
 * every draw, so a change takes effect on the next frame.
 *
 * The faces are loaded *before* the stack is pointed at them, which is the whole
 * reason `loadGameFonts` exists: switching first would draw one frame in the
 * fallback stack, which is the exact failure the loader prevents.
 *
 * Awaiting is still the caller's business: `main.ts` awaits the initial load, and
 * by the time a player changes the option the browser has usually cached the face
 * they are switching away from — though not the one they are switching to, hence
 * the await.
 */
export async function setFontChoice(choice: FontChoice): Promise<void> {
  if (isBundledFont(choice)) await loadGameFonts(choice);
  currentStack = fontStackFor(choice);
}

/** A readable name for the options screen. */
export function fontChoiceName(choice: FontChoice): string {
  return bundledFontFor(choice)?.label ?? "Classic (system)";
}

/**
 * One promise per family, kept so that cycling back to a face the browser has
 * already fetched does not re-register it. Registering the same family and weight
 * twice is an error in the CSS font spec, so this is load-bearing and not just an
 * optimisation.
 */
const loading = new Map<BundledFontChoice, Promise<void>>();

/**
 * Registers a family's faces and resolves when they are ready to draw with.
 *
 * Idempotent per family, and safe to call from anywhere: the engine's own headless
 * UI never touches the DOM, and the tests run in Node where `document.fonts` does
 * not exist, so this resolves immediately there rather than throwing. Callers
 * should `await` it before the first frame — see `main.ts`.
 */
export function loadGameFonts(
  choice: BundledFontChoice = DEFAULT_FONT_CHOICE as BundledFontChoice,
): Promise<void> {
  const existing = loading.get(choice);
  if (existing !== undefined) return existing;

  const pending = registerFaces(BUNDLED_FONTS[choice]);
  loading.set(choice, pending);
  return pending;
}

async function registerFaces(font: BundledFont): Promise<void> {
  const fontSet = typeof document !== "undefined" ? document.fonts : undefined;
  if (fontSet === undefined) return; // no DOM: nothing to register with

  await Promise.all(
    font.faces.map(async ({ file, weight }) => {
      try {
        const face = new FontFace(font.family, `url(/fonts/${file})`, { weight });
        await face.load();
        fontSet.add(face);
      } catch (e) {
        /*
         * A missing font is a cosmetic failure and must not stop the game.
         *
         * The canvas falls back down the stack, and because every face in it is
         * 0.6 em the layout is unaffected — so this is a warning, not an error.
         * The realistic cause is a build that did not copy `public/fonts/`, which
         * is exactly what the roundtrip test in `tests/game-font.test.ts` is there
         * to catch.
         */
        console.warn(`[RogueSurvivor] could not load ${file}; falling back:`, e);
      }
    })
  );
}
