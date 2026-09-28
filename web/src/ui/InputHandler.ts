import { GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { Point } from "@engine/Point";

/**
 * Translates raw browser keyboard / mouse events into the game's input model.
 *
 * The game's blocking `UI_WaitKey()` is implemented by awaiting a Promise
 * that resolves the next time a key is enqueued.
 */
export class InputHandler {
  private readonly keyQueue: GameKeyEvent[]     = [];
  private readonly mouseState = { x: 0, y: 0, buttons: null as MouseButton | null };
  /** Wheel movement in pixels since the last `peekWheel`. See `wheelPixels`. */
  private wheelDelta = 0;
  /**
   * Clicks on the same spot since the last one was reported, and where that was.
   * See `peekClickCount` - the browser counts clicks for us via `event.detail`,
   * and this is the state that decides whether a second one is a *double* click
   * or two separate clicks.
   */
  private clicks = { count: 0, x: 0, y: 0 };

  // Resolvers waiting for the next key
  private waiters: Array<(e: GameKeyEvent) => void> = [];

  /**
   * Whether the browser's own action for this keystroke must be suppressed.
   *
   * Public and side-effect-free so the rule can be tested directly rather than
   * by reading the handler — the original bug was a missing branch, and a missing
   * branch reads perfectly well. Takes the pieces of a `KeyboardEvent` rather
   * than the event so no DOM is needed.
   */
  shouldPreventDefault(
    key: string,
    ctrl = false,
    alt = false,
    shift = false,
    code?: string,
  ): boolean {
    if (InputHandler.ALWAYS_PREVENTED.has(key)) return true;
    return this.isBoundCommandKey(key, ctrl, alt, shift, code);
  }

  /**
   * Whether a keystroke is claimed by a game binding.
   *
   * Injected rather than imported, because answering it needs the live
   * `Keybindings` and the engine's `InputTranslator`, and the game's keybindings
   * live behind a static on `RogueGame` — which imports `IRogueUI`, which
   * `CanvasUI` imports, which imports this class. `main.ts` wires it up where
   * both sides are already in scope. Optional so the headless and unit-test
   * callers do not have to.
   */
  private isBoundCommandKey: (
    key: string,
    ctrl: boolean,
    alt: boolean,
    shift: boolean,
    code?: string,
  ) => boolean = () => false;

  /** @see isBoundCommandKey */
  setCommandPredicate(
    fn: (key: string, ctrl: boolean, alt: boolean, shift: boolean, code?: string) => boolean,
  ): void {
    this.isBoundCommandKey = fn;
  }

  /**
   * Keys whose browser default must be suppressed regardless of any binding.
   *
   * These are the ones that scroll the page, move focus, or activate a widget —
   * and all six are bound to movement or a menu in the defaults, so the game's
   * action and the browser's both fire.
   */
  private static readonly ALWAYS_PREVENTED: ReadonlySet<string> = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab",
  ]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Attach event listeners to the document. Call once on startup. */
  attach(): void {
    document.addEventListener("keydown",   this.onKeyDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseleave", this.onMouseLeave);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup",   this.onMouseUp);
    document.addEventListener("wheel",     this.onWheel, { passive: false });
    // `contextmenu` is the only way to suppress the browser's own RMB menu:
    // preventDefault on `mousedown` or `mouseup` does not stop it, and the
    // menu is what the game is competing with, not the button.
    document.addEventListener("contextmenu", this.onContextMenu);
  }

  /** Remove event listeners. Call on teardown. */
  detach(): void {
    document.removeEventListener("keydown",   this.onKeyDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseleave", this.onMouseLeave);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup",   this.onMouseUp);
    document.removeEventListener("wheel",     this.onWheel);
    document.removeEventListener("contextmenu", this.onContextMenu);
  }

  // ── Input API (consumed by CanvasUI) ──────────────────────────────────────

  waitKey(): Promise<GameKeyEvent> {
    // If there is already a queued key, return it immediately.
    if (this.keyQueue.length > 0) {
      return Promise.resolve(this.keyQueue.shift()!);
    }
    return new Promise<GameKeyEvent>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * The next queued key, removing it.
   *
   * Despite the name, this is the C# `UI_PeekKey` contract: `RogueForm.UI_PeekKey`
   * sets `m_HasKey = false` before returning, so it *consumes* the key it hands
   * back. `RogueGame.WaitKeyOrMouse` and the sim's abort check both rely on that —
   * they poll in a loop and would otherwise be handed the same key forever.
   */
  peekKey(): GameKeyEvent | null {
    return this.keyQueue.shift() ?? null;
  }

  postKey(e: GameKeyEvent): void {
    this.enqueueKey(e);
  }

  getMousePosition(canvas: HTMLCanvasElement): Point {
    // CSS pixels relative to the canvas's top-left corner — deliberately *not*
    // canvas coordinates. This is the browser's `MouseEvent.clientX/Y` and is
    // the same quantity C# returned as `MouseLocation` (a WinForms client
    // coordinate); the conversion to canvas coordinates is
    // `RogueGame.MouseToMap`, which divides by `UI_GetCanvasScale*` exactly as
    // the C# original does.
    //
    // Scaling by the backing-store size here instead would double-convert, since
    // the canvas is no longer 1:1 with the logical surface: the result would be
    // canvas coords divided by the scale a second time, so the mouse would be
    // wrong by that factor at every window size except 1366 CSS px.
    //
    // Rounded: `RogueGame.WaitKeyOrMouse` compares successive positions to
    // decide whether the mouse *moved*, and with a fractional device pixel
    // ratio (Windows 125%) both `clientX` and `rect.left` can carry a fraction,
    // so an unmoved cursor can read as a subpixel jitter and wake the wait.
    const rect = canvas.getBoundingClientRect();
    return new Point(
      Math.round(this.mouseState.x - rect.left),
      Math.round(this.mouseState.y - rect.top),
    );
  }

  /**
   * Returns the buttons held since the last call, then clears them.
   *
   * Despite the name this consumes, and it has to: C#'s `UI_PeekMouseButtons`
   * clears `m_HasMouseButtons` before returning, because `RogueGame` uses a
   * non-null answer as an *event* — it wakes the play loop's input wait. A pure
   * peek reports the same held button on every poll, so the wait returns
   * immediately and forever, and the loop redraws the screen as fast as the CPU
   * allows. `RogueGame.WaitKeyOrMouse` also compares against the last mask it
   * saw, so even a UI that forgets cannot wedge the loop.
   */
  peekMouseButtons(): MouseButton | null {
    const buttons = this.mouseState.buttons;
    this.mouseState.buttons = null;
    return buttons;
  }

  postMouseButtons(buttons: MouseButton): void {
    this.mouseState.buttons = buttons === MouseButton.None ? null : buttons;
  }

  /**
   * Clicks in a row on the same spot since the last call, then cleared. 0 when
   * there were none, 1 for a single click, 2 for a double click, and so on.
   *
   * Consuming, for the same reason as `peekKey` and `peekMouseButtons`: a caller
   * polls this in a loop, and a non-consuming version would report 2 forever, so
   * every pass would take the "double click" branch.
   *
   * The count comes from the browser's own `MouseEvent.detail`, taken when the
   * press was recorded, rather than from a timer here. The platform already
   * knows the multi-click interval and the slop distance, and they differ per
   * platform and per user settings; recomputing them is how a hand-rolled double
   * click ends up feeling wrong. `detail` is 0 on a synthesised event (a test, or
   * a `dispatchEvent` with no init), so it is floored at 1.
   *
   * Only the left button counts. A double right-click is a context-menu gesture
   * in every UI convention that has one, and the game binds the right button to
   * real commands.
   */
  peekClickCount(): number {
    const buttons = this.mouseState.buttons;
    if (buttons !== MouseButton.Left) return 0;
    const n = this.clicks.count;
    this.clicks.count = 0;
    return n;
  }

  /**
   * The wheel's movement since the last call, in pixels, then cleared.
   *
   * Consumes, for the same reason `peekKey` and `peekMouseButtons` do: a menu
   * that has to redraw on a wheel notch polls this in a loop, and a non-consuming
   * version would hand the same delta back on every pass — the wait returns
   * immediately and forever, the screen redraws as fast as the CPU allows, and no
   * keystroke ever gets a turn. That is the `UI_PeekKey` bug this file already
   * documents, and the contract is deliberately identical.
   *
   * Accumulating rather than reporting the last event is deliberate: a mouse
   * wheel and a trackpad are not the same device and do not emit one event per
   * notch. Chrome sends a single `deltaY` of ~100 for a notch; a trackpad sends a
   * long stream of small deltas that together make one gesture. Keeping only the
   * last event would drop most of a trackpad flick.
   */
  peekWheel(): number {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }

  /** Inject a wheel delta, in pixels. For the headless UI and tests. */
  postWheel(deltaPixels: number): void {
    this.wheelDelta += deltaPixels;
  }

  /**
   * Normalises a wheel event's `deltaY` to pixels.
   *
   * The raw value is not a distance and cannot be used as one. `deltaMode` says
   * which unit the number is in, and the three cases disagree by two orders of
   * magnitude:
   *
   *  - `0` **pixel** — Chrome and Edge, ~100 for one notch.
   *  - `1` **line** — Firefox, ~3 for one notch.
   *  - `2` **page** — older engines, ~1 for a whole page.
   *
   * So the same physical gesture on the same mouse moves the list about three
   * rows in Chrome and one row in Firefox, which reads as the wheel being broken
   * on one of them rather than as a units difference. Normalising here means the
   * menu sees pixels everywhere.
   *
   * The line and page factors are the CSS reference values, and are not worth
   * being clever about: they only have to be the right *order of magnitude* for a
   * notch to feel like a notch, and the menu applies its own pixels-per-row on
   * top.
   *
   * Static, pure and public so it can be tested directly rather than by reading
   * the handler — the same reasoning as `shouldPreventDefault`, and for the same
   * kind of bug: a missing branch here reads perfectly well.
   */
  static wheelPixels(deltaY: number, deltaMode: number): number {
    switch (deltaMode) {
      case 1:  return deltaY * 16;  // lines
      case 2:  return deltaY * 400; // pages
      default: return deltaY;       // pixels
    }
  }

  // ── Internal event handlers ───────────────────────────────────────────────

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Suppress the browser's own action for any key the game has claimed.
    //
    // The six navigation keys are the long-standing list. What was missing is the
    // modifier combinations: the defaults bind `Ctrl+S` to save-place, `Ctrl+N`
    // to build a large fortification, `Ctrl+P` to pull mode, `Ctrl+H` to the
    // hints screen and `Ctrl+E` to mark-enemies, and **none of them were
    // preventDefaulted**. So the game ran the command *and* the browser ran its
    // own — `Ctrl+S` opened Save Page, `Ctrl+H` the History side panel, `Ctrl+E`
    // Find, and the two destructive ones were `Ctrl+N`, which opens a new window
    // and takes focus away mid-game, and `Ctrl+P`, whose print dialog can stall
    // the loop.
    //
    // Derived from the bindings rather than from another hard-coded list, so a
    // binding added tomorrow is covered without editing this file.
    if (this.shouldPreventDefault(e.key, e.ctrlKey, e.altKey, e.shiftKey, e.code)) {
      e.preventDefault();
    }

    const event: GameKeyEvent = {
      key:     e.key,
      keyCode: e.keyCode,
      // The physical position, so a numpad key is not the digit above it.
      code:    e.code,
      shift:   e.shiftKey,
      ctrl:    e.ctrlKey,
      alt:     e.altKey,
    };
    this.enqueueKey(event);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.mouseState.x = e.clientX;
    this.mouseState.y = e.clientY;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.postMouseDown(e.buttons, e.detail);
  };

  /**
   * Records a press. `detail` is the platform's own click counter within a
   * multi-click sequence, and 0 on a synthesised event; see `peekClickCount`.
   *
   * Public as the injection seam for the headless UI and the tests, exactly as
   * `postKey` and `postWheel` are - the suite runs in a `node` environment with
   * no DOM, so a test cannot dispatch a real `mousedown` to reach this.
   */
  postMouseDown(buttons: number, detail: number): void {
    this.mouseState.buttons = this.mapButtons(buttons);
    this.clicks.count = Math.max(1, detail);
  }

  /**
   * Suppresses the browser's own right-click menu.
   *
   * The game uses the right button for real commands - cancel a mode, the
   * options screen's own bindings - and in a browser those are unusable without
   * this: the native menu opens over the canvas on every press, so the command
   * fires and then the menu opens on top of the screen the player is trying to
   * act on, and dismissing it costs a second click. Its own entries are the
   * worst of it - "Save image as..." on a page that is one canvas, because
   * anything painted in one is a saveable image to the browser.
   *
   * Registered on `document` rather than the canvas so it also covers a
   * right-click on the letterboxing around the canvas, which is where a player
   * aiming at the edge of the map will actually click.
   *
   * `preventDefault` is the whole fix and needs no condition: there is no
   * genuine text selection or link on this page to protect. The right button
   * keeps working as a game input either way - it is `mousedown` that
   * `onMouseDown` already records, and this only cancels the menu.
   */
  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  /**
   * Records the release, and recovers a release the document never saw.
   *
   * A button can be left set with no `mouseup` ever arriving: press, drag out of
   * the window, release outside it, move back. The document sees the mousedown
   * and nothing else, so the state would stay set for the rest of the session.
   * `mouseleave` is the browser's way of saying the pointer is no longer over
   * the page, which is exactly when a held button has been lost.
   *
   * It is not done on `mousemove` instead: that would cancel a click the player
   * is holding down, which is legitimate (drag-and-drop, feeling out a target).
   */
  private readonly onMouseLeave = (): void => {
    this.mouseState.buttons = null;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.mouseState.buttons = e.buttons === 0 ? null : this.mapButtons(e.buttons);
  };

  /**
   * Records wheel movement, and claims the event.
   *
   * `preventDefault` because there is nothing else for the wheel to do: the page
   * is one full-screen canvas with `overflow: hidden` (see `index.html`), so it
   * cannot scroll, and a gesture that reaches a menu must not also bounce the
   * document or trigger the browser's own scroll chaining. Registered
   * non-passive, because a passive listener cannot call it — a passive `wheel`
   * handler would be silently ignored here, and the symptom would be a page that
   * rubber-bands on a menu.
   *
   * `deltaMode` is normalised at the boundary so nothing downstream has to know
   * that Firefox counts lines and Chrome counts pixels; see `wheelPixels`.
   */
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheelDelta += InputHandler.wheelPixels(e.deltaY, e.deltaMode);
  };

  private mapButtons(buttons: number): MouseButton {
    let result = MouseButton.None;
    if (buttons & 1) result |= MouseButton.Left;
    if (buttons & 2) result |= MouseButton.Right;
    if (buttons & 4) result |= MouseButton.Middle;
    return result;
  }

  private enqueueKey(e: GameKeyEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(e);
    } else {
      this.keyQueue.push(e);
    }
  }
}
