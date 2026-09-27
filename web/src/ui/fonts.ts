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
 *  3. Only two weights are used, and the game's text is ASCII, so 187 KB vendored
 *     is cheaper than any subsetting pipeline and it never changes.
 *
 * JetBrains Mono is licensed under the SIL Open Font License 1.1; the licence
 * text ships next to the files in `public/fonts/`.
 *
 * ## Why it does not move the layout
 *
 * `MENU_CHAR_WIDTH` assumes a 0.6 em advance, which is what "Lucida Console",
 * "Courier New" and `monospace` all are. JetBrains Mono is 600/1000 — the same
 * 0.6 em, by design rather than by luck — so the menu column positions computed
 * from that constant stay correct. The glyph *shapes* change (taller x-height,
 * squarer punctuation), which is the point, but no coordinate has to move.
 */

/** The family name, as registered with the document and used in canvas font strings. */
export const GAME_FONT_FAMILY = "JetBrains Mono";

/** The weights the UI asks for. Italic is never used, so it is not shipped. */
const FACES: ReadonlyArray<{ file: string; weight: string }> = [
  { file: "JetBrainsMono-Regular.woff2", weight: "400" },
  { file: "JetBrainsMono-Bold.woff2", weight: "700" },
];

/**
 * The typeface choices, in the order the option cycles them.
 *
 * `bundled` is JetBrains Mono: it is what the game is designed against, it is
 * present on every platform and offline, and it is the first entry so it is what
 * a player gets without touching the option.
 *
 * `classic` is the stack the port used before JetBrains Mono was vendored — the
 * platform monospace faces. It is here because that *was* the game's look, and
 * because the C# asked for "Lucida Console" specifically: a player who came from
 * the original may prefer it, and on Windows it is what they had.
 */
export const FONT_CHOICES = ["bundled", "classic"] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

export const DEFAULT_FONT_CHOICE: FontChoice = "bundled";

/** The stack each choice resolves to. Both are 0.6 em; see the file header. */
export function fontStackFor(choice: FontChoice): string {
  return choice === "classic"
    ? `"Lucida Console", "Courier New", monospace`
    : `"${GAME_FONT_FAMILY}", "Lucida Console", "Courier New", monospace`;
}

/**
 * The canvas font strings, in the order `CanvasUI` uses them.
 *
 * These are the *bundled* choice, which is the default and the fallback: the
 * option rewrites the family stack through `setFontChoice` when the player picks
 * another one, so a game that never loads its options still draws correctly.
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
 * Awaiting is the caller's business: `main.ts` awaits the initial load, and an
 * option change made later has its faces already cached by the browser.
 */
export async function setFontChoice(choice: FontChoice): Promise<void> {
  currentStack = fontStackFor(choice);
  if (choice === DEFAULT_FONT_CHOICE) await loadGameFonts();
}

/** A readable name for the options screen. */
export function fontChoiceName(choice: FontChoice): string {
  return choice === "classic" ? "Classic (system)" : "JetBrains Mono";
}

let loading: Promise<void> | null = null;

/**
 * Registers the faces and resolves when they are ready to draw with.
 *
 * Idempotent, and safe to call from anywhere: the engine's own headless UI never
 * touches the DOM, and the tests run in Node where `document.fonts` does not
 * exist, so this resolves immediately there rather than throwing. Callers should
 * `await` it before the first frame — see `main.ts`.
 */
export function loadGameFonts(): Promise<void> {
  if (loading !== null) return loading;
  loading = registerFaces();
  return loading;
}

async function registerFaces(): Promise<void> {
  const fontSet = typeof document !== "undefined" ? document.fonts : undefined;
  if (fontSet === undefined) return; // no DOM: nothing to register with

  await Promise.all(
    FACES.map(async ({ file, weight }) => {
      try {
        const face = new FontFace(GAME_FONT_FAMILY, `url(/fonts/${file})`, { weight });
        await face.load();
        fontSet.add(face);
      } catch (e) {
        /*
         * A missing font is a cosmetic failure and must not stop the game.
         *
         * The canvas falls back down the stack, and because every face in it is
         * 0.6 em the layout is unaffected — so this is a warning, not an error.
         * The realistic cause is a build that did not copy `public/fonts/`, which
         * is exactly the mistake the roundtrip test in
         * `tests/game-font.test.ts` is there to catch.
         */
        console.warn(`[RogueSurvivor] could not load ${file}; falling back:`, e);
      }
    })
  );
}
