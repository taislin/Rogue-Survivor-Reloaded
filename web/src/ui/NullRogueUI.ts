import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { GameKeyEvent, IRogueUI, MouseButton } from "@engine/IRogueUI";

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
  private mouseButtons: MouseButton | null = null;

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

  UI_PeekMouseButtons(): MouseButton | null {
    return this.mouseButtons;
  }

  UI_PostMouseButtons(buttons: MouseButton): void {
    this.mouseButtons = buttons;
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

  UI_DrawString(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawString"); }
  UI_DrawStringBold(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringBold"); }

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
  UI_DrawMinimap(_gx: number, _gy: number): void { this.count("UI_DrawMinimap"); }

  // ── Scale ──────────────────────────────────────────────────────────────────

  // 1:1 — headless has no viewport to scale against.
  UI_GetCanvasScaleX(): number {
    return 1;
  }

  UI_GetCanvasScaleY(): number {
    return 1;
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
