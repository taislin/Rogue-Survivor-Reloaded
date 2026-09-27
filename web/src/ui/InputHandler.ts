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

  // Resolvers waiting for the next key
  private waiters: Array<(e: GameKeyEvent) => void> = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Attach event listeners to the document. Call once on startup. */
  attach(): void {
    document.addEventListener("keydown",   this.onKeyDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseleave", this.onMouseLeave);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup",   this.onMouseUp);
  }

  /** Remove event listeners. Call on teardown. */
  detach(): void {
    document.removeEventListener("keydown",   this.onKeyDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseleave", this.onMouseLeave);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup",   this.onMouseUp);
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

  // ── Internal event handlers ───────────────────────────────────────────────

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Prevent browser shortcuts (arrow scroll, space, etc.)
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Tab"].includes(e.key)) {
      e.preventDefault();
    }

    const event: GameKeyEvent = {
      key:     e.key,
      keyCode: e.keyCode,
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
    this.mouseState.buttons = this.mapButtons(e.buttons);
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
