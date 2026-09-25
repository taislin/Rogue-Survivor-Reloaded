import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect }  from "@engine/Rect";
import { InputHandler } from "./InputHandler";

/** Size of the minimap in tiles (matches C# constants). */
const MINIMAP_W = 100;
const MINIMAP_H = 100;

/** Font used for normal and bold text, matching the C# "Lucida Console 8.25pt". */
const FONT_NORMAL = '8.25pt "Lucida Console", "Courier New", monospace';
const FONT_BOLD   = 'bold 8.25pt "Lucida Console", "Courier New", monospace';

/**
 * Canvas 2D implementation of IRogueUI.
 *
 * Replaces the C# GDIGameCanvas / DXGameCanvas hierarchy.
 * Images are loaded from /assets/<imageId>.png (forward-slash paths, no extension
 * in the ID — same convention as the C# image IDs but with OS-appropriate slashes).
 */
export class CanvasUI implements IRogueUI {
  private readonly ctx:    CanvasRenderingContext2D;
  private readonly input:  InputHandler;
  private readonly canvas: HTMLCanvasElement;

  // Image cache: imageId → HTMLImageElement (or null if loading failed)
  private readonly imageCache = new Map<string, HTMLImageElement | null>();
  private readonly imageLoading = new Map<string, Promise<HTMLImageElement | null>>();

  // Minimap pixel buffer (100 × 100 RGBA)
  private readonly minimapCanvas: OffscreenCanvas;
  private readonly minimapCtx:    OffscreenCanvasRenderingContext2D;
  private readonly minimapData:   Uint8ClampedArray;

  constructor(canvas: HTMLCanvasElement, input: InputHandler) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not obtain 2D canvas context");

    this.canvas = canvas;
    this.ctx    = ctx;
    this.input  = input;

    this.minimapCanvas = new OffscreenCanvas(MINIMAP_W, MINIMAP_H);
    const mCtx = this.minimapCanvas.getContext("2d");
    if (!mCtx) throw new Error("Could not obtain minimap context");
    this.minimapCtx  = mCtx;
    this.minimapData = new Uint8ClampedArray(MINIMAP_W * MINIMAP_H * 4);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  UI_WaitKey(): Promise<GameKeyEvent>      { return this.input.waitKey(); }
  UI_PeekKey(): GameKeyEvent | null        { return this.input.peekKey(); }
  UI_PostKey(e: GameKeyEvent): void        { this.input.postKey(e); }
  UI_GetMousePosition(): Point             { return this.input.getMousePosition(this.canvas); }
  UI_PeekMouseButtons(): MouseButton | null { return this.input.peekMouseButtons(); }
  UI_PostMouseButtons(b: MouseButton): void { this.input.postMouseButtons(b); }

  // ── Delay ─────────────────────────────────────────────────────────────────

  UI_Wait(msecs: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, msecs));
  }

  // ── Canvas ────────────────────────────────────────────────────────────────

  UI_Repaint(): void {
    // In the browser model, drawing is immediate; this is a no-op kept for API parity.
    // Callers who batch-draw and then repaint will still work correctly.
  }

  UI_Clear(color: Color): void {
    this.ctx.fillStyle = color.toCssRgba();
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ── Image drawing ─────────────────────────────────────────────────────────

  UI_DrawImage(imageId: string, gx: number, gy: number): void {
    const img = this.imageCache.get(imageId);
    if (img) {
      this.ctx.drawImage(img, gx, gy);
    } else {
      void this.loadImage(imageId); // kick off load; will appear next repaint
    }
  }

  UI_DrawImageTinted(imageId: string, gx: number, gy: number, tint: Color): void {
    const img = this.imageCache.get(imageId);
    if (!img) { void this.loadImage(imageId); return; }

    // Apply tint via globalCompositeOperation trick
    this.ctx.save();
    this.ctx.drawImage(img, gx, gy);
    this.ctx.globalCompositeOperation = "multiply";
    this.ctx.fillStyle = tint.toCssRgba();
    this.ctx.fillRect(gx, gy, img.width, img.height);
    this.ctx.globalCompositeOperation = "destination-in";
    this.ctx.drawImage(img, gx, gy);
    this.ctx.restore();
  }

  UI_DrawImageTransform(imageId: string, gx: number, gy: number, rotation: number, scale: number): void {
    const img = this.imageCache.get(imageId);
    if (!img) { void this.loadImage(imageId); return; }

    const cx = gx + img.width  / 2;
    const cy = gy + img.height / 2;
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);
    this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
    this.ctx.restore();
  }

  UI_DrawGrayLevelImage(imageId: string, gx: number, gy: number): void {
    const img = this.imageCache.get(imageId);
    if (!img) { void this.loadImage(imageId); return; }

    this.ctx.save();
    this.ctx.filter = "grayscale(100%) brightness(55%)";
    this.ctx.drawImage(img, gx, gy);
    this.ctx.restore();
  }

  UI_DrawTransparentImage(alpha: number, imageId: string, gx: number, gy: number): void {
    const img = this.imageCache.get(imageId);
    if (!img) { void this.loadImage(imageId); return; }

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, gx, gy);
    this.ctx.restore();
  }

  // ── Primitive drawing ─────────────────────────────────────────────────────

  UI_DrawPoint(color: Color, gx: number, gy: number): void {
    this.ctx.fillStyle = color.toCssRgba();
    this.ctx.fillRect(gx, gy, 1, 1);
  }

  UI_DrawLine(color: Color, gxFrom: number, gyFrom: number, gxTo: number, gyTo: number): void {
    this.ctx.strokeStyle = color.toCssRgba();
    this.ctx.lineWidth   = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(gxFrom + 0.5, gyFrom + 0.5);
    this.ctx.lineTo(gxTo   + 0.5, gyTo   + 0.5);
    this.ctx.stroke();
  }

  UI_DrawRect(color: Color, rect: Rect): void {
    this.ctx.strokeStyle = color.toCssRgba();
    this.ctx.lineWidth   = 1;
    this.ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }

  UI_FillRect(color: Color, rect: Rect): void {
    this.ctx.fillStyle = color.toCssRgba();
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  UI_DrawString(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(FONT_NORMAL, color, text, gx, gy, shadowColor);
  }

  UI_DrawStringBold(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(FONT_BOLD, color, text, gx, gy, shadowColor);
  }

  private drawText(font: string, color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.ctx.font         = font;
    this.ctx.textBaseline = "top";
    if (shadowColor) {
      this.ctx.fillStyle = shadowColor.toCssRgba();
      this.ctx.fillText(text, gx + 1, gy + 1);
    }
    this.ctx.fillStyle = color.toCssRgba();
    this.ctx.fillText(text, gx, gy);
  }

  // ── Popups ────────────────────────────────────────────────────────────────

  private readonly LINE_H = 12; // matches C# LINE_SPACING constant

  UI_DrawPopup(
    lines: string[], textColor: Color, borderColor: Color, fillColor: Color,
    gx: number, gy: number,
  ): void {
    this.drawPopupBox(lines, lines.map(() => textColor), null, null, borderColor, fillColor, gx, gy);
  }

  UI_DrawPopupTitle(
    title: string, titleColor: Color,
    lines: string[], textColor: Color,
    borderColor: Color, fillColor: Color,
    gx: number, gy: number,
  ): void {
    this.drawPopupBox(lines, lines.map(() => textColor), title, titleColor, borderColor, fillColor, gx, gy);
  }

  UI_DrawPopupTitleColors(
    title: string, titleColor: Color,
    lines: string[], colors: Color[],
    borderColor: Color, fillColor: Color,
    gx: number, gy: number,
  ): void {
    this.drawPopupBox(lines, colors, title, titleColor, borderColor, fillColor, gx, gy);
  }

  private drawPopupBox(
    lines: string[], colors: Color[],
    title: string | null, titleColor: Color | null,
    borderColor: Color, fillColor: Color,
    gx: number, gy: number,
  ): void {
    this.ctx.font         = FONT_NORMAL;
    this.ctx.textBaseline = "top";

    // Measure widest string
    const allText  = title ? [title, ...lines] : lines;
    const maxWidth = allText.reduce((w, l) => Math.max(w, this.ctx.measureText(l).width), 0);
    const totalLines = lines.length + (title ? 1 : 0);
    const padX = 4, padY = 4;
    const boxW = maxWidth + padX * 2;
    const boxH = totalLines * this.LINE_H + padY * 2;

    // Background
    this.ctx.fillStyle = fillColor.toCssRgba();
    this.ctx.fillRect(gx, gy, boxW, boxH);
    // Border
    this.ctx.strokeStyle = borderColor.toCssRgba();
    this.ctx.lineWidth   = 1;
    this.ctx.strokeRect(gx + 0.5, gy + 0.5, boxW - 1, boxH - 1);

    let ty = gy + padY;
    if (title && titleColor) {
      this.ctx.fillStyle = titleColor.toCssRgba();
      this.ctx.fillText(title, gx + padX, ty);
      ty += this.LINE_H;
    }
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillStyle = (colors[i] ?? colors[colors.length - 1]).toCssRgba();
      this.ctx.fillText(lines[i], gx + padX, ty);
      ty += this.LINE_H;
    }
  }

  // ── Minimap ───────────────────────────────────────────────────────────────

  UI_ClearMinimap(color: Color): void {
    for (let i = 0; i < MINIMAP_W * MINIMAP_H; i++) {
      this.minimapData[i * 4]     = color.r;
      this.minimapData[i * 4 + 1] = color.g;
      this.minimapData[i * 4 + 2] = color.b;
      this.minimapData[i * 4 + 3] = color.a;
    }
  }

  UI_SetMinimapColor(x: number, y: number, color: Color): void {
    const idx = (y * MINIMAP_W + x) * 4;
    this.minimapData[idx]     = color.r;
    this.minimapData[idx + 1] = color.g;
    this.minimapData[idx + 2] = color.b;
    this.minimapData[idx + 3] = color.a;
  }

  UI_DrawMinimap(gx: number, gy: number): void {
    const img = new ImageData(this.minimapData.slice(), MINIMAP_W, MINIMAP_H);
    this.minimapCtx.putImageData(img, 0, 0);
    this.ctx.drawImage(this.minimapCanvas, gx, gy);
  }

  // ── Scale ─────────────────────────────────────────────────────────────────

  UI_GetCanvasScaleX(): number {
    return this.canvas.getBoundingClientRect().width  / this.canvas.width;
  }
  UI_GetCanvasScaleY(): number {
    return this.canvas.getBoundingClientRect().height / this.canvas.height;
  }

  // ── Screenshots ───────────────────────────────────────────────────────────

  UI_SaveScreenshot(_filePath: string): string {
    const data = this.canvas.toDataURL("image/png");
    const a    = document.createElement("a");
    a.href     = data;
    a.download = "screenshot.png";
    a.click();
    return "screenshot.png";
  }

  UI_ScreenshotExtension(): string { return "png"; }

  // ── Exit ──────────────────────────────────────────────────────────────────

  UI_DoQuit(): void {
    window.close();
  }

  // ── Image loading ─────────────────────────────────────────────────────────

  /**
   * Loads an image by ID. The path uses forward-slashes; we normalise the
   * C# backslash-based IDs at call-time.
   */
  private loadImage(imageId: string): Promise<HTMLImageElement | null> {
    if (this.imageLoading.has(imageId)) return this.imageLoading.get(imageId)!;

    const src = `/assets/${imageId.replace(/\\/g, "/")}.png`;
    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img  = new Image();
      img.onload  = () => { this.imageCache.set(imageId, img); resolve(img); };
      img.onerror = () => { this.imageCache.set(imageId, null); resolve(null); };
      img.src     = src;
    });

    this.imageLoading.set(imageId, promise);
    return promise;
  }

  /** Pre-warm the image cache for a list of IDs. */
  async preloadImages(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadImage(id)));
  }
}
