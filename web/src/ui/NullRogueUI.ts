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
	 * run hands back each of these in turn.
	 *
	 * **This is enough to answer a prompt that is *asked*, and not enough to
	 * answer one that is *nested*.** Four of the character-creation screens
	 * (`HandleSelectUndeadType`, the gender picker, the undead-type picker and
	 * the skill picker) put a `WaitYesOrNo` *inside* their own menu loop: row 0
	 * is `*Random*`, so choosing it draws "Is that OK? Y to confirm, N to
	 * cancel." and waits before the loop redraws. The confirm therefore reads
	 * the very next key, which on an unattended run is the cycle's `Escape` —
	 * and `Escape` means *no*. `no` returns to the same menu, the next `Enter`
	 * picks `*Random*` again, and the pair loops forever.
	 *
	 * So a test that walks character creation has to say `y` at the confirm
	 * itself. `pushKeys` is the seam for that: `Enter, y` repeated once per
	 * screen gets through all four, because a `y` landing on a menu instead of
	 * a confirm is swallowed and costs nothing.
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
  private pendingClickCount = 0;
  /** Wheel movement in pixels, consumed by `UI_PeekWheel`. */
  private pendingWheel = 0;

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

  /**
   * Queue keys to be returned before the idle cycle resumes.
   *
   * The new-game screens — `HandleSelectRuleset`, `HandleNewGameMode`, the race,
   * gender, undead-type and skill pickers — are modal `do { draw; wait }` loops,
   * and the idle cycle alone can only ever hand back Enter, Escape, `n`, `y`. That
   * is enough for an unattended run to fall through them, and not enough to
   * drive one: there was no way to reach the second row of any of them, so the
   * menus had no behavioural test at all.
   *
   * This is the seam for that. It takes key *names* rather than
   * `GameKeyEvent`s so a test reads as the keys a player would press.
   */
  pushKeys(...keys: string[]): void {
    for (const key of keys) {
      this.keyQueue.push({
        key,
        keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
        shift: false,
        ctrl: false,
        alt: false,
      });
    }
  }

  /**
   * Queues one key with Shift held.
   *
   * `pushKeys` hard-codes `shift: false`, which was fine until the quick-start
   * shortcuts: `Shift+Enter` is the *only* way to reach them, so a test for that
   * behaviour cannot get there without this.
   */
  pushShiftKey(key: string): void {
    this.keyQueue.push({
      key,
      keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
      shift: true,
      ctrl: false,
      alt: false,
    });
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
    //
    // **It consumes, and it has to.** `IRogueUI.UI_PeekKey` is the C#
    // `UI_PeekKey`, and C# clears `m_HasKey` before returning — the contract
    // `InputHandler.peekKey` documents at length, and `WaitKeyOrMouse` and the
    // sim's abort check both poll in a loop and depend on it. Returning the head
    // of the queue without shifting it hands the same keystroke to every caller
    // forever, which is not a stall but a runaway: `WaitMenuInput` reads one key
    // per redraw, so `HandleMainMenu` re-applied `ArrowDown` until the selection
    // wrapped back to the top and the menu could never be left. Any test that
    // pushed `ArrowDown, ..., Enter` at a `WaitMenuInput` screen hung in it, and
    // `ensureKey`'s synthesised keys made it worse rather than better, since a
    // starvated run then got one unchanging key rather than none.
    const key = this.ensureKey();
    this.keyQueue.shift();
    return key;
  }

  UI_PostKey(e: GameKeyEvent): void {
    this.keyQueue.push(e);
  }

  UI_FlushQueuedKeys(): void {
    this.keyQueue.length = 0;
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

  /**
   * Headless: a test sets the count and reads it once, so there is no timer and
   * no queue to drain. The contract that matters is the same as
   * `UI_PeekMouseButtons` above - a value of 2 means a double click - and a
   * read here does not persist, so a polling caller cannot wedge on it.
   */
  UI_PeekClickCount(): number {
    const n = this.pendingClickCount;
    this.pendingClickCount = 0;
    return this.pendingButtons === MouseButton.Left ? n : 0;
  }

  /** Inject a click count for `UI_PeekClickCount`. For tests. */
  UI_PostClickCount(count: number): void {
    this.pendingClickCount = count;
  }

  /**
   * Wheel deltas, scriptable.
   *
   * Consumes like the two peeks above it — a headless run polls this in the same
   * loops the browser does, and leaving the delta set would spin them forever.
   * Injectable because a headless test or a recorded session is the only way to
   * exercise a menu's wheel handling at all, since the sim has no mouse.
   */
  UI_PeekWheel(): number {
    const delta = this.pendingWheel;
    this.pendingWheel = 0;
    return delta;
  }

  UI_PostWheel(deltaPixels: number): void {
    this.pendingWheel += deltaPixels;
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
  UI_FillRect(_color: Color, rect: Rect): void {
    this.count("UI_FillRect");
    // Recorded for the same reason as the strings below: whether a panel was
    // painted is a claim about *where*, and a count cannot answer it. A menu that
    // fills nothing looks identical to one that fills behind its buttons until you
    // are looking at a map through the gaps.
    if (this.recordText) this.recordedFills.push(rect);
  }

  /** Every rect passed to `UI_FillRect`, in order. Empty unless recording. */
  get drawnFills(): readonly Rect[] { return this.recordedFills; }

  private readonly recordedFills: Rect[] = [];

  /**
   * Whether `inner` lies inside `outer`.
   *
   * Off by default like the rest of the recording, and a method rather than a
   * loop at each call site because the inclusive/exclusive edge question has one
   * right answer: a fill that stops one pixel short of a button leaves that button
   * on the map, which is the bug this exists to catch.
   */
  coversRect(outer: Rect, inner: Rect): boolean {
    return (
      outer.x <= inner.x &&
      outer.y <= inner.y &&
      outer.right >= inner.right &&
      outer.bottom >= inner.bottom
    );
  }

  // The scale/clip is a property of the drawing surface, which headless has
  // none of: counted like any other call so the tally still balances.
  UI_BeginScaledDraw(_scale: number, _clipRect: Rect): void { this.count("UI_BeginScaledDraw"); }
  UI_EndScaledDraw(): void { this.count("UI_EndScaledDraw"); }

  UI_DrawString(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawString"); }
  UI_DrawStringBold(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringBold"); }
  UI_DrawStringLarge(_color: Color, _text: string, _gx: number, _gy: number, _shadowColor?: Color): void { this.count("UI_DrawStringLarge"); }
  UI_DrawStringBoldLarge(_color: Color, text: string, _gx: number, _gy: number, _shadowColor?: Color): void {
    this.count("UI_DrawStringBoldLarge");
    // Every string is kept, not just tallied. Counting answers "was this called";
    // it cannot answer "did the right thing reach the screen", which is the whole
    // question when a screen scrolls, filters or pages. Off by default so a test
    // that does not care pays nothing for it.
    //
    // Named `recordedText` rather than reusing the `drawnText` that
    // `tests/idle-district-sim.test.ts`'s probe keeps for its own narrower purpose:
    // same idea, different contract, and a subclass declaring the same field is a
    // compile error rather than a silent merge.
    if (this.recordText) this.recordedText.push(text);
  }

  /** Every string passed to a bold-large draw, in order. Empty unless recording. */
  get drawnLines(): readonly string[] { return this.recordedText; }

  /** Whether to keep drawn strings; off by default. See `drawnLines`. */
  recordText = false;

  private readonly recordedText: string[] = [];

  /** Forgets everything recorded so far, so one test can drive several screens. */
  clearRecordedText(): void { this.recordedText.length = 0; this.recordedFills.length = 0; }

  UI_DrawPopup(
    _lines: string[], _textColor: Color, _borderColor: Color, _fillColor: Color, _gx: number, _gy: number
  ): void { this.count("UI_DrawPopup"); }

  /** Counted under `UI_DrawPopup`, which is the call it stands in for. */
  UI_DrawPopupCentered(
    _lines: string[], _textColor: Color, _borderColor: Color, _fillColor: Color, _gy: number
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
