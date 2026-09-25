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
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup",   this.onMouseUp);
  }

  /** Remove event listeners. Call on teardown. */
  detach(): void {
    document.removeEventListener("keydown",   this.onKeyDown);
    document.removeEventListener("mousemove", this.onMouseMove);
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

  peekKey(): GameKeyEvent | null {
    return this.keyQueue[0] ?? null;
  }

  postKey(e: GameKeyEvent): void {
    this.enqueueKey(e);
  }

  getMousePosition(canvas: HTMLCanvasElement): Point {
    // Convert page coords to canvas coords, accounting for CSS scaling.
    const rect  = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return new Point(
      Math.round((this.mouseState.x - rect.left) * scaleX),
      Math.round((this.mouseState.y - rect.top)  * scaleY),
    );
  }

  peekMouseButtons(): MouseButton | null {
    return this.mouseState.buttons;
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
