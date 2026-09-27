import { Color } from "./Color";
import { Point } from "./Point";
import { Rect } from "./Rect";

/**
 * Browser-side key event — replaces System.Windows.Forms.KeyEventArgs.
 * We carry the raw KeyboardEvent plus helper booleans that the game checks.
 */
export interface GameKeyEvent {
  /** Browser key string ("ArrowUp", "a", "Escape", …) */
  key: string;
  /** Numeric key code — matches old VK_ codes where feasible. */
  keyCode: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** Mouse button mask, mirrors System.Windows.Forms.MouseButtons. */
export const enum MouseButton {
  None   = 0,
  Left   = 1,
  Right  = 2,
  Middle = 4,
}

/**
 * IRogueUI — the complete rendering + input contract that the game engine
 * depends on. Mirrors IRogueUI.cs, adapted for browser APIs.
 *
 * All drawing calls go to a backing buffer; `UI_Repaint()` flushes to screen.
 */
export interface IRogueUI {
  // ── Input ─────────────────────────────────────────────────────────────────

  /** Block until a key is pressed. Returns it. */
  UI_WaitKey(): Promise<GameKeyEvent>;

  /** Return the next queued key without blocking, or null. */
  UI_PeekKey(): GameKeyEvent | null;

  /** Inject a synthetic key event into the queue. */
  UI_PostKey(e: GameKeyEvent): void;

  /** Current mouse position, in CSS pixels relative to the canvas. */
  UI_GetMousePosition(): Point;

  /**
   * Mouse buttons pressed since the previous call, or null if none.
   *
   * Despite the name this *consumes*, and an implementation must: C# clears
   * `m_HasMouseButtons` before returning, and `RogueGame.WaitKeyOrMouse` uses a
   * non-null answer as an event that wakes the play loop's input wait. A pure
   * peek reports the same held button on every poll, so the wait returns
   * immediately and forever — while the cursor rests on the map, the loop
   * re-enters the wait through `HandleMouseLook`, and the game redraws in a
   * tight loop with no key ever getting a turn.
   */
  UI_PeekMouseButtons(): MouseButton | null;

  /** Inject mouse button state. */
  UI_PostMouseButtons(buttons: MouseButton): void;

  // ── Delay ─────────────────────────────────────────────────────────────────

  /** Pause for `msecs` milliseconds (yielding to the browser event loop). */
  UI_Wait(msecs: number): Promise<void>;

  // ── Canvas painting ───────────────────────────────────────────────────────

  /**
   * Fetch sprites ahead of the first frame, reporting progress.
   *
   * C# loaded every image up front, so a draw was always just a blit. A browser
   * cannot do that lazily: `UI_DrawImage` and friends silently skip a sprite
   * that is not in cache yet, so without a preload the map paints itself in
   * over as the network delivers files — in draw order, which is left-to-right
   * then top-to-bottom — leaving whatever had not arrived simply missing.
   *
   * Implementations resolve once every id has settled; a failure is reported
   * through `onProgress` but must not reject, since one missing sprite should
   * not stop the game from starting.
   *
   * @param onProgress Called with (loaded, total) as the batch advances.
   */
  UI_PreloadImages(ids: string[], onProgress?: (loaded: number, total: number) => void): Promise<void>;

  /** Flush the current frame to the display. */
  UI_Repaint(): void;

  UI_Clear(color: Color): void;

  UI_DrawImage(imageId: string, gx: number, gy: number): void;
  UI_DrawImageTinted(imageId: string, gx: number, gy: number, tint: Color): void;
  UI_DrawImageTransform(imageId: string, gx: number, gy: number, rotation: number, scale: number): void;
  UI_DrawGrayLevelImage(imageId: string, gx: number, gy: number): void;
  UI_DrawTransparentImage(alpha: number, imageId: string, gx: number, gy: number): void;

  UI_DrawPoint(color: Color, gx: number, gy: number): void;
  UI_DrawLine(color: Color, gxFrom: number, gyFrom: number, gxTo: number, gyTo: number): void;
  UI_DrawRect(color: Color, rect: Rect): void;
  UI_FillRect(color: Color, rect: Rect): void;

  // ── Scaled drawing scope ──────────────────────────────────────────────────

  /**
   * Draws everything up to `UI_EndScaledDraw` at `scale` times its size, clipped
   * to `clipRect` (given in the same coordinates as the draw calls). Omit
   * `clipRect` to allow the drawing to spill outside.
   *
   * Not in `IRogueUI.cs`: C# blits to a `Graphics` whose `ScaleTransform` the
   * caller sets, and GDI+ clips through `SetClip`, both available directly. The
   * port has to go through the renderer because the engine only ever hands it
   * image ids and a position — `UI_DrawImage` has no size parameter — so a
   * magnified sprite is only possible by scaling the drawing surface itself.
   * The map uses this to zoom; nothing else should.
   *
   * Must be paired: an unbalanced call would leak the scale into later draws.
   */
  UI_BeginScaledDraw(scale: number, clipRect?: Rect): void;
  UI_EndScaledDraw(): void;

  UI_DrawString(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;
  UI_DrawStringBold(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;

  /**
   * Large text for full-screen menus and reading screens (help, manual,
   * hiscores, message log, character creation, death screens).
   *
   * The base `UI_DrawString` pair is the 10pt HUD font (side panel, message log,
   * location panel); menus get 12pt via these methods. Splitting by method
   * rather than by size parameter keeps every existing call site untouched.
   *
   * Note that the HUD size and the menu size are both deliberate divergences
   * from C#'s single 8.25pt: the browser is not running at C#'s 1024x768, and
   * at this display scale 8.25pt lands around 11 device px. The HUD paid for its
   * 10pt in geometry — see `TILE_VIEW_WIDTH` — and the menus paid for theirs in
   * column placement, see `MENU_CHAR_WIDTH`.
   */
  UI_DrawStringLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;
  UI_DrawStringBoldLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;

  UI_DrawPopup(lines: string[], textColor: Color, borderColor: Color, fillColor: Color, gx: number, gy: number): void;
  UI_DrawPopupTitle(
    title: string, titleColor: Color,
    lines: string[], textColor: Color,
    borderColor: Color, fillColor: Color,
    gx: number, gy: number
  ): void;
  UI_DrawPopupTitleColors(
    title: string, titleColor: Color,
    lines: string[], colors: Color[],
    borderColor: Color, fillColor: Color,
    gx: number, gy: number
  ): void;

  // ── Minimap ───────────────────────────────────────────────────────────────

  UI_ClearMinimap(color: Color): void;
  UI_SetMinimapColor(x: number, y: number, color: Color): void;
  UI_DrawMinimap(gx: number, gy: number): void;

  // ── Scale ─────────────────────────────────────────────────────────────────

  UI_GetCanvasScaleX(): number;
  UI_GetCanvasScaleY(): number;

  // ── Screenshots ───────────────────────────────────────────────────────────

  UI_SaveScreenshot(filePath: string): string;
  UI_ScreenshotExtension(): string;

  // ── Exit ─────────────────────────────────────────────────────────────────

  UI_DoQuit(): void;
}
