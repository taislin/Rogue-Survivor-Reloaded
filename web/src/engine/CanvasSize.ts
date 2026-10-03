/**
 * The logical canvas size — the coordinate space every UI position is expressed in.
 *
 * ## Why this constant exists apart from the others
 *
 * `RogueGame.ts` had `CANVAS_WIDTH`/`CANVAS_HEIGHT` exported, `OptionsScreen.ts` had
 * its own copy of the height, and `CanvasUI.ts` had `LOGICAL_W`/`LOGICAL_H`. Four
 * declarations of the same two numbers, in three files, with nothing checking they
 * agree.
 *
 * That duplication has already caused a bug rather than being a latent risk. A
 * panel hit-test compared a **CSS** mouse coordinate against **logical** constants,
 * and only looked right because the two spaces coincide at exactly 1366x768 — below
 * that it over-claimed by 58px, reaching into the side panel and stealing the click
 * before the inventory was asked. The comment recording that sits in
 * `RogueGame.ts:9848`.
 *
 * So: one declaration, imported by all three. `CanvasUI` is the only place that
 * *uses* the numbers to compute a scale, and the only place that could legitimately
 * disagree — it must, since a fractional scale is how the canvas fits a smaller
 * window — but it no longer states the size itself.
 *
 * This is deliberately not `CANVAS_WIDTH`. The name says what the number is used
 * for, which is the thing worth protecting: every `UI_Draw*` position and every
 * hit-test is in this space, and `mousePos` from `UI_GetMousePosition` is not.
 */

/** Logical canvas width. Every `UI_Draw*` x is in this space. */
export const LOGICAL_W = 1366;

/** Logical canvas height. Every `UI_Draw*` y is in this space. */
export const LOGICAL_H = 768;

/**
 * The same two numbers under the names `RogueGame` and its tests use.
 *
 * Re-exported rather than renamed at the ~30 use sites: `CANVAS_HEIGHT` appears in
 * the HUD layout tests and the action-menu tests as the thing they measure against,
 * and renaming it would make those diffs about the rename rather than about the
 * layout. The values come from `LOGICAL_*`, so there is one number.
 */
export const CANVAS_WIDTH = LOGICAL_W;
export const CANVAS_HEIGHT = LOGICAL_H;