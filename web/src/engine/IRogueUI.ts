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

  /** Current mouse position in canvas coordinates. */
  UI_GetMousePosition(): Point;

  /** Current mouse buttons held, or null if none. */
  UI_PeekMouseButtons(): MouseButton | null;

  /** Inject mouse button state. */
  UI_PostMouseButtons(buttons: MouseButton): void;

  // ── Delay ─────────────────────────────────────────────────────────────────

  /** Pause for `msecs` milliseconds (yielding to the browser event loop). */
  UI_Wait(msecs: number): Promise<void>;

  // ── Canvas painting ───────────────────────────────────────────────────────

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

  UI_DrawString(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;
  UI_DrawStringBold(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void;

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
