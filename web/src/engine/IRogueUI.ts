import { Color } from "./Color";
import { Point } from "./Point";
import { Rect } from "./Rect";
import type { Scene } from "./firstperson/SceneBuilder";
import type { SceneRendererStats as SceneStats } from "./firstperson/Types";

/**
 * Browser-side key event — replaces System.Windows.Forms.KeyEventArgs.
 * We carry the raw KeyboardEvent plus helper booleans that the game checks.
 */
export interface GameKeyEvent {
  /** Browser key string ("ArrowUp", "a", "Escape", …) */
  key: string;
  /** Numeric key code — matches old VK_ codes where feasible. */
  keyCode: number;
  /**
   * The physical key position, from `KeyboardEvent.code` -- "Numpad7" against
   * "Digit7".
   *
   * Optional, because everything that synthesises a key rather than reading a
   * real event (the headless UI, tests) has no position to report, and a missing
   * `code` means "unknown position" -- never "the digit row". The keybinding layer
   * needs it to keep the numpad and the number row apart: both arrive as
   * `key: "7"`, so the character alone cannot tell them apart and binding one
   * silently took the other.
   */
  code?: string;
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
 * The map window currently on screen: which tiles, and how big a tile is drawn.
 *
 * A value rather than renderer state, because the engine owns the layout — the
 * same rule as `UI_DrawMinimap`, whose `width`/`height` are the minimap's size
 * *on screen*. A renderer that cached a view rect would be a second copy of the
 * frame's geometry, and this project has already shipped stale-cache defects
 * where a cached value kept answering for something the world had moved on from.
 * A `MapView` is built once per frame and passed by the caller, so it cannot
 * drift from the frame it was built for.
 *
 * It carries two tile sizes because the two directions genuinely need different
 * ones, and that asymmetry already exists in the C# arithmetic this replaces:
 *
 *  - `UI_MapToScreen` multiplies by `tileSize`, and answers *before* the map zoom
 *    is applied — `withMapZoom` scales the result afterwards, so answering in
 *    screen pixels would be scaled twice.
 *  - `UI_ScreenToMap` divides by `displayTileSize`, and answers *after* it, or
 *    the mouse would land on the wrong tile at zoom 2.
 */
export interface MapView {
  /** Top-left tile of the window, and its size in tiles. */
  readonly rect: Rect;
  /** Pixels per tile, the unit `UI_MapToScreen` answers in. Always 32. */
  readonly tileSize: number;
  /** Pixels per tile as displayed: `tileSize` times the map zoom. */
  readonly displayTileSize: number;
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

  /**
   * Wheel movement since the previous call, in pixels. 0 when there was none.
   *
   * **This consumes, like `UI_PeekKey` and `UI_PeekMouseButtons` above, and an
   * implementation must.** A menu that redraws on a wheel notch polls this in a
   * loop; a version that left the delta in place would return from the wait
   * immediately and on every pass after, so the screen would repaint in a tight
   * loop and no keystroke would ever get a turn. That is the same failure the
   * other two peeks already had.
   *
   * The unit is always pixels. `WheelEvent.deltaY` is not — Firefox reports
   * lines and Chrome pixels, for the same gesture — so implementations must
   * normalise, and a caller must not divide by a "line".
   */
  UI_PeekWheel(): number;

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
  /**
   * `width`/`height` are the minimap's size on screen, which is not the raster's
   * own size: the engine owns the layout and scales the map to fit the panel.
   * Omitting them drew the map at 1:1 while everything positioned on it used
   * the scaled-up coordinates.
   */
    UI_DrawMinimap(gx: number, gy: number, width: number, height: number): void;

    // ── First-person scene ───────────────────────────────────────────────────

    /**
     * Draws a whole first-person frame: the backdrop, then the quads in order.
     *
     * Not in `IRogueUI.cs` for the same reason `UI_BeginScaledDraw` is not — C#
     * has one renderer, so there was never a second drawing path to name. What it
     * is for is different from that precedent's reason, though: this exists so the
     * engine can hand over a *frame* instead of a stream of blits, and so the
     * headless simulator can drop it in one call. Everything about *what* to draw
     * is decided in `firstperson/SceneBuilder`, which is DOM-free, so a test can
     * rasterise the same quads this method blits.
     *
     * The implementation must clip to the map panel. The scene's coordinates are
     * viewport-relative, and the panel is smaller than the canvas.
     */
    UI_DrawScene(scene: Scene): void;

    /**
     * Per-frame renderer counters, or null when they are not being collected.
     *
     * Exists because `npm run profile` counts calls on `NullRogueUI`, which drops
     * every painting call — so it cannot see this renderer at all, and the port plan
     * asks for the floor's cost to be *measured* rather than guessed. This is the
     * measurement, and it is browser-side because that is the only place a real
     * frame exists.
     */
    UI_GetSceneStats(): SceneStats | null;

    // ── Map ⇄ screen ─────────────────────────────────────────────────────────
    /**
     * The screen position of a map position, or `null` when there is none — the
     * tile is outside the world, or the renderer cannot see it.
     *
     * Not in `IRogueUI.cs` for the reason `UI_BeginScaledDraw` is not: C# blits
     * to a `Graphics` and computes the offset itself, so the conversion never
     * leaves the game code. It has to leave here the moment there is a second
     * renderer, because a first-person view has no tile grid to convert from — it
     * projects. Left in `RogueGame`, the projection would have to be guessed at by
     * code that cannot know the camera, and a wrong answer here is a tooltip and
     * a click on the wrong tile, silently.
     */
    UI_MapToScreen(gx: number, gy: number, view: MapView): Point | null;

    /**
     * The map position under a screen position, or `null` when it hits nothing —
     * the pointer is off the map, or the ray misses.
     *
     * `gx`/`gy` are logical canvas pixels, the space `UI_DrawImage` takes. The
     * mouse arrives in CSS pixels and `RogueGame.MouseToMap` divides by
     * `UI_GetCanvasScale*` first; that conversion is the engine's and stays here.
     */
    UI_ScreenToMap(gx: number, gy: number, view: MapView): Point | null;

    // ── Scale ─────────────────────────────────────────────────────────────────


  UI_GetCanvasScaleX(): number;
  UI_GetCanvasScaleY(): number;

  // ── Screenshots ───────────────────────────────────────────────────────────

  UI_SaveScreenshot(filePath: string): string;
  UI_ScreenshotExtension(): string;

  // ── Exit ─────────────────────────────────────────────────────────────────

  UI_DoQuit(): void;
}