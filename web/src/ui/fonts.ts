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
 * The canvas font strings, in the order `CanvasUI` uses them.
 *
 * JetBrains Mono first, then the previous stack unchanged. The fallbacks are not
 * decoration: a browser that cannot load the woff2 (a stripped desktop webview,
 * say) still gets a monospace face, and — because all three are 0.6 em — the
 * layout stays correct even though the glyphs change.
 */
export const FONT_STACK = `"${GAME_FONT_FAMILY}", "Lucida Console", "Courier New", monospace`;

/** 10pt HUD face: the side panel, the message log, the location panel. */
export const FONT_HUD = `10pt ${FONT_STACK}`;

/** Bold 10pt: status labels and the like. */
export const FONT_HUD_BOLD = `bold 10pt ${FONT_STACK}`;

/** 12pt reading face: popups and every full-screen menu. */
export const FONT_MENU = `12pt ${FONT_STACK}`;

/** Bold 12pt: menu selections and headings. */
export const FONT_MENU_BOLD = `bold 12pt ${FONT_STACK}`;

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
