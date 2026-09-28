import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { GameKeyEvent, IRogueUI, MouseButton, type MapView } from "@engine/IRogueUI";
import type { Scene } from "@engine/firstperson/SceneBuilder";
import type { SceneRendererStats } from "@engine/firstperson/Types";

/**
 * A no-op `IRogueUI` for running the engine outside a browser.
 *
 * The engine only ever talks to the UI through this interface, so swapping
 * `CanvasUI` for this class is enough to run the real game loop in Node —
 * no DOM, no canvas, no `<audio>`. Every painting call is dropped and
 * `UI_WaitKey()` is answered locally instead of from the DOM.
 *
 * Phase 8, "Headless Simulation & Advanced Testing Plan".
 */
export class NullRogueUI implements IRogueUI {
  /**
   * Keys the engine blocks on, cycled through when the queue is empty.
   *
   * `RogueGame`'s input helpers each spin until one *specific* key arrives:
   * `WaitEnter` wants "Enter", `WaitEscape` wants "Escape", and
   * `WaitYesOrNo` wants "y"/"n"/"Escape". A single synthetic key would
   * therefore wedge two of the three in an infinite loop, so an unattended
   * run hands back each of these in turn — every waiter is satisfied within
   * one cycle and the simulation keeps moving.
   */
  private static readonly IDLE_KEYS: readonly GameKeyEvent[] = [
    { key: "Enter", keyCode: 13, shift: false, ctrl: false, alt: false },
    { key: "Escape", keyCode: 27, shift: false, ctrl: false, alt: false },
    { key: "n", keyCode: 78, shift: false, ctrl: false, alt: false },
    { key: "y", keyCode: 89, shift: false, ctrl: false, alt: false },
  ];

  private idleIndex = 0;
  private readonly keyQueue: GameKeyEvent[] = [];
  private mousePos: Point = new Point(0, 0);
  private pendingButtons: MouseButton | null = null;

  /** Set to false by `UI_DoQuit()` so a runner can stop its loop. */
  quitRequested = false;

  /** How many keys were synthesised because nothing was queued. */
  idleKeysServed = 0;

  /**
   * Returns the next key, synthesising one when the queue is empty.
   *
   * Both the blocking helpers (`RogueGame.WaitEnter` and friends) and the
   * polling ones (`WaitKeyOrMouse`, which busy-waits on `UI_PeekKey`) have to
   * make progress, so a starved queue is topped up from the idle cycle here
   * and both entry points share it.
   */
  private ensureKey(): GameKeyEvent {
    if (this.keyQueue.length === 0) {
      this.idleKeysServed++;
      const key = NullRogueUI.IDLE_KEYS[this.idleIndex % NullRogueUI.IDLE_KEYS.length];
      this.idleIndex++;
      this.keyQueue.push({ ...key });
    }
    return this.keyQueue[0];
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  async UI_WaitKey(): Promise<GameKeyEvent> {
    const key = this.ensureKey();
    this.keyQueue.shift();
    return key;
  }

  UI_PeekKey(): GameKeyEvent | null {
    // Deliberately not a bare `length > 0` check: an unattended run has to
    // satisfy polling waiters too, or they spin forever.
    return this.ensureKey();
  }

  UI_PostKey(e: GameKeyEvent): void {
    this.keyQueue.push(e);
  }

  UI_GetMousePosition(): Point {
    return this.mousePos;
  }

  /**
   * Returns the posted buttons and clears them, as C# does.
   *
   * C#'s `UI_PeekMouseButtons` sets `m_HasMouseButtons = false` before
   * returning, and `RogueGame.WaitKeyOrMouse` relies on that: a non-null answer
   * is an *event* that wakes the input wait. Leaving the state set here would
   * make the wait return on every poll, and the play loop would redraw forever.
   */
  UI_PeekMouseButtons(): MouseButton | null {
    const buttons = this.pendingButtons;
    this.pendingButtons = null;
    return buttons;
  }

  UI_PostMouseButtons(buttons: MouseButton): void {
    this.pendingButtons = buttons;
  }

  // ── Delay ──────────────────────────────────────────────────────────────────

  async UI_Wait(_msecs: number): Promise<void> {
    // Deliberately instant: a headless stress run must not spend wall-clock
    // time sleeping. Yields a macrotask so pending promises still drain.
    await Promise.resolve();
  }

  // ── Canvas painting ────────────────────────────────────────────────────────
  //
  // Every painting call is counted when `profiling` is on. Incrementing an
  // integer is free next to the work these calls do in a browser, and it is
  // the only way to find out what a frame actually costs without a browser:
  // see sim/profile.ts, which reports calls-per-frame by method.
  //
  // This is how the minimap's per-frame full-map scan was found -- it issues
  // up to 10 000 UI_SetMinimapColor calls and 10 000 `new Point` allocations on
  // a 100x100 map, every frame, which is invisible in a type-check and
  // impossible to eyeball.

  /** Set true to accumulate `callCounts`. */
  profiling = false;

  /** Painting calls per method, since the last `resetCallCounts()`. */
  readonly callCounts: Record<string, number> = {};

  private count(name: string): void {
    if (!this.profiling) return;
    this.callCounts[name] = (this.callCounts[name] ?? 0) + 1;
  }

  resetCallCounts(): void {
    for (const k of Object.keys(this.callCounts)) delete this.callCounts[k];
  }

  /** Total painting calls recorded, or 0 when not profiling. */
  get totalCalls(): number {
    let n = 0;
    for (const v of Object.values(this.callCounts)) n += v;
    return n;
  }

  /** No sprites to fetch: painting here is a counter, not a blit. */
  async UI_PreloadImages(_ids: string[], onProgress?: (loaded: number, total: number) => void): Promise<void> {
    onProgress?.(0, 0);
  }

  UI_Repaint(): void { this.count("UI_Repaint"); }
  UI_Clear(_color: Color): void { this.count("UI_Clear"); }
  UI_DrawImage(_imageId: string, _gx: number, _gy: number): void { this.count("UI_DrawImage"); }
  UI_DrawImageTinted(_imageId: string, _gx: number, _gy: number, _tint: Color): void { this.count("UI_DrawImageTinted"); }
  UI_DrawImageTransform(_imageId: string, _gx: number, _gy: number, _rotation: number, _scale: number): void { this.count("UI_DrawImageTransform"); }
  UI_DrawGrayLevelImage(_imageId: string, _gx: number, _gy: number): void { this.count("UI_DrawGrayLevelImage"); }
  UI_DrawTransparentImage(_alpha: number, _imageId: string, _gx: number, _gy: number): void { this.count("UI_DrawTransparentImage"); }

  UI_DrawPoint(_color: Color, _gx: number, _gy: number): void { this.count("UI_DrawPoint"); }
  UI_DrawLine(_color: Color, _gxFrom: number, _gyFrom: number, _gxTo: number, _gyTo: number): void { this.count("UI_DrawLine"); }
  UI_DrawRect(_color: Color, _rect: Rect): void { this.count("UI_DrawRect"); }
  UI_FillRect(_color: Color, _rect: Rect): void { this.count("UI_FillRect"); }

  // The scale/clip is a property of the drawing surface, which headless has
  // none of: counted like any other call so the tally still balances.
  UI_BeginScaledDraw(_scale: number, _clipRect: Rect): void { this.count("UI_BeginScaledDraw"); }
  UI_EndScaledDraw(): void { this.count("UI_EndScaledDraw"); }

  UI_DrawString(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawString"); }
  UI_DrawStringBold(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringBold"); }
  UI_DrawStringLarge(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringLarge"); }
  UI_DrawStringBoldLarge(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringBoldLarge"); }

  UI_DrawPopup(
    _lines: string[], _textColor: Color, _borderColor: Color, _fillColor: Color, _gx: number, _gy: number
  ): void { this.count("UI_DrawPopup"); }

  UI_DrawPopupTitle(
    _title: string, _titleColor: Color,
    _lines: string[], _textColor: Color,
    _borderColor: Color, _fillColor: Color,
    _gx: number, _gy: number
  ): void { this.count("UI_DrawPopupTitle"); }

  UI_DrawPopupTitleColors(
    _title: string, _titleColor: Color,
    _lines: string[], _colors: Color[],
    _borderColor: Color, _fillColor: Color,
    _gx: number, _gy: number
  ): void { this.count("UI_DrawPopupTitleColors"); }

  // ── Minimap ────────────────────────────────────────────────────────────────

  UI_ClearMinimap(_color: Color): void { this.count("UI_ClearMinimap"); }
  UI_SetMinimapColor(_x: number, _y: number, _color: Color): void { this.count("UI_SetMinimapColor"); }
  UI_DrawMinimap(_gx: number, _gy: number, _w: number, _h: number): void { this.count("UI_DrawMinimap"); }

  // ── First-person scene ───────────────────────────────────────────────────

  /**
   * Dropped, like every other painting call.
   *
   * The headless simulator is the engine's test harness, and it must stay a test
   * harness: if it started rendering scenes it would become a second renderer to
   * keep correct, and the whole reason the geometry lives in `engine/firstperson`
   * with no DOM is that a test can rasterise the same quads this throws away.
   * `headless-no-hang.test.ts` and the seeded runs are what protect the code path
   * that *builds* a scene; this is what protects the code that draws one.
   */
  UI_DrawScene(_scene: Scene): void {
    this.count("UI_DrawScene");
  }

  /**
   * Null: the null UI has no frame, so it has no cost to report.
   *
   * Returning null rather than zeros is the honest answer and the one a caller can
   * act on — a zero here would read as "this frame was free", which is exactly the
   * wrong thing to conclude about a renderer nobody is measuring.
   */
  UI_GetSceneStats(): SceneRendererStats | null {
    return null;
  }

  // ── Scale ──────────────────────────────────────────────────────────────────

  // 1:1 — headless has no viewport to scale against.
  UI_GetCanvasScaleX(): number {
    return 1;
  }

  UI_GetCanvasScaleY(): number {
    return 1;
  }

  // ── Map ⇄ screen ───────────────────────────────────────────────────────────

  /**
   * The real arithmetic, not a null.
   *
   * Every other method here drops its work, because the work is a canvas
   * operation. This one is not: it is four multiplies and two divides on the
   * values in the `MapView`, with no DOM involved. No-opping it would make the
   * headless simulator answer a *different* question from the browser on a pure
   * function, which is the one way a simulation harness stops being evidence —
   * a green sim would say nothing about whether the conversion is right, because
   * the sim was never doing it.
   */
  UI_MapToScreen(gx: number, gy: number, view: MapView): Point | null {
    return new Point(
      (gx - view.rect.left) * view.tileSize,
      (gy - view.rect.top) * view.tileSize,
    );
  }

  UI_ScreenToMap(gx: number, gy: number, view: MapView): Point | null {
    return new Point(
      view.rect.left + Math.trunc(gx / view.displayTileSize),
      view.rect.top + Math.trunc(gy / view.displayTileSize),
    );
  }

  // ── Screenshots ────────────────────────────────────────────────────────────

  UI_SaveScreenshot(_filePath: string): string {
    return "";
  }

  UI_ScreenshotExtension(): string {
    return "";
  }

  // ── Exit ───────────────────────────────────────────────────────────────────

  UI_DoQuit(): void {
    this.quitRequested = true;
  }
}
