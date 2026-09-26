import { IRogueUI, GameKeyEvent, MouseButton } from "@engine/IRogueUI";
import { imagePath } from "@engine/AssetPaths";
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
 * Menu/reading font. Same family as the HUD font for visual continuity, at
 * 12pt for legibility on upscaled displays. Used by popups and every
 * full-screen menu through `UI_DrawStringLarge` / `UI_DrawPopup*`.
 */
const FONT_MENU        = '12pt "Lucida Console", "Courier New", monospace';
const FONT_MENU_BOLD   = 'bold 12pt "Lucida Console", "Courier New", monospace';

/**
 * Canvas 2D implementation of IRogueUI.
 *
 * Replaces the C# GDIGameCanvas / DXGameCanvas hierarchy.
 * Images are loaded through `AssetPaths.imagePath()`, i.e.
 * /assets/images/<imageSet>/<imageId>.webp (forward-slash paths, no extension in the
 * ID — same convention as the C# image IDs but with OS-appropriate slashes).
 * The sprite set defaults to "classic"; the other folders under assets/images/ are
 * variations of it.
 */
export class CanvasUI implements IRogueUI {
  private readonly ctx:    CanvasRenderingContext2D;
  private readonly input:  InputHandler;
  private readonly canvas: HTMLCanvasElement;

  // Image cache: imageId → HTMLImageElement (or null if loading failed)
  private readonly imageCache = new Map<string, HTMLImageElement | null>();
  private readonly imageLoading = new Map<string, Promise<HTMLImageElement | null>>();

  private readonly minimapCanvas: OffscreenCanvas;
  private readonly minimapCtx:    OffscreenCanvasRenderingContext2D;
  /**
   * The minimap pixel buffer, 100 × 100 RGBA.
   *
   * Typed `<ArrayBuffer>` rather than the default `<ArrayBufferLike>`:
   * `ImageData`'s constructor only accepts the former, and TypeScript does not
   * narrow it through `new Uint8ClampedArray(...)`.
   */
  private readonly minimapData: Uint8ClampedArray<ArrayBuffer>;
  /**
   * An `ImageData` view over `minimapData`, built once.
   *
   * `new ImageData(minimapData.slice(), ...)` allocated a fresh 40 KB copy of the
   * buffer on every `UI_DrawMinimap` call — i.e. every frame. `putImageData`
   * reads the pixels synchronously, so it is safe to hand it a view of the live
   * buffer instead and let the next mutation be seen by the next draw.
   */
  private readonly minimapImage: ImageData;

  /**
   * Pre-rendered desaturated sprite variants, keyed by image id.
   *
   * `UI_DrawGrayLevelImage` is called ~578 times per frame (it is how unexplored
   * tiles are drawn). Setting `ctx.filter` is expensive enough that browsers
   * treat it as a pipeline barrier, so doing it per call dominated the frame.
   * Rendering the variant once with the *same* filter and then blitting the
   * result is both far cheaper and pixel-identical — it is literally the same
   * computation, just not repeated 578 times a frame.
   */
  private readonly grayCache = new Map<string, OffscreenCanvas>();

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
    this.minimapData = new Uint8ClampedArray(new ArrayBuffer(MINIMAP_W * MINIMAP_H * 4));
    this.minimapImage = new ImageData(this.minimapData, MINIMAP_W, MINIMAP_H);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  UI_WaitKey(): Promise<GameKeyEvent>      { return this.input.waitKey(); }
  UI_PeekKey(): GameKeyEvent | null        { return this.input.peekKey(); }
  UI_PostKey(e: GameKeyEvent): void        { this.input.postKey(e); }
  UI_GetMousePosition(): Point             { return this.input.getMousePosition(this.canvas); }
  UI_PeekMouseButtons(): MouseButton | null { return this.input.peekMouseButtons(); }
  UI_PostMouseButtons(b: MouseButton): void { this.input.postMouseButtons(b); }

  // ── Preloading ────────────────────────────────────────────────────────────

  /**
   * How many sprites to fetch at once.
   *
   * The browser allows only ~6 connections per host, so a larger number buys
   * nothing; it just queues inside the browser instead. 16 keeps the pipe full
   * across connections without letting the first batch monopolise the tab.
   */
  private static readonly PRELOAD_CONCURRENCY = 16;

  async UI_PreloadImages(ids: string[], onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const pending = ids.filter((id) => this.imageLoading.has(id) === false && this.imageCache.has(id) === false);
    const total = ids.length;
    let loaded = total - pending.length;
    onProgress?.(loaded, total);

    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= pending.length) return;
        // loadImage resolves rather than rejects on error, so one bad sprite
        // cannot abort the batch.
        await this.loadImage(pending[i]);
        onProgress?.(++loaded, total);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(CanvasUI.PRELOAD_CONCURRENCY, pending.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  // ── Delay ─────────────────────────────────────────────────────────────────

  UI_Wait(msecs: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, msecs));
  }

  // ── Canvas ────────────────────────────────────────────────────────────────

  UI_Repaint(): void {
    // In the browser model, drawing is immediate; this is a no-op kept for API parity.
    // Callers who batch-draw and then repaint will still work correctly.
    if (CanvasUI.debugDraw && (this.frameDraws > 0 || this.frameSkips > 0)) {
      // eslint-disable-next-line no-console
      console.log(
        `[draw] draws=${this.frameDraws} skips=${this.frameSkips}` +
          (this.frameSkips > 0 ? ` missing=[${[...this.frameSkippedIds].slice(0, 8).join(", ")}]` : "")
      );
      this.frameSkippedIds.clear();
    }
  }

  UI_Clear(color: Color): void {
    this.ctx.fillStyle = color.toCssRgba();
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // A new frame starts on clear; the repaint that ends it reports the tally.
    this.frameDraws = 0;
    this.frameSkips = 0;
  }

  // ── Frame draw tally (debug) ──────────────────────────────────────────────

  /**
   * Draw calls vs. skipped-for-missing-image calls since the last `UI_Clear`.
   *
   * Reported once per frame when `debugDraw` is on (see `?debug=1`). A healthy
   * frame after preloading has skips of zero; any skip names a sprite the
   * preload manifest missed, which renders as a hole exactly where that sprite
   * would have drawn. Logged from `UI_Repaint`, which ends the frame.
   */
  static debugDraw = false;
  private frameDraws = 0;
  private frameSkips = 0;
  private readonly frameSkippedIds = new Set<string>();

  private tallyDraw(imageId: string | null, drew: boolean): void {
    if (!CanvasUI.debugDraw) return;
    if (drew) {
      this.frameDraws++;
    } else {
      this.frameSkips++;
      if (imageId !== null) this.frameSkippedIds.add(imageId);
    }
  }

  // ── Image drawing ─────────────────────────────────────────────────────────

  UI_DrawImage(imageId: string, gx: number, gy: number): void {
    const img = this.imageCache.get(imageId);
    if (img) {
      this.ctx.drawImage(img, gx, gy);
      this.tallyDraw(imageId, true);
    } else {
      this.tallyDraw(imageId, false);
      void this.loadImage(imageId); // kick off load; will appear next repaint
    }
  }

  UI_DrawImageTinted(imageId: string, gx: number, gy: number, tint: Color): void {
    const img = this.imageCache.get(imageId);
    if (!img) { this.tallyDraw(imageId, false); void this.loadImage(imageId); return; }
    this.tallyDraw(imageId, true);

    // Fast path: an opaque-white tint is the identity, so this is a plain blit
    // — exactly what C# does, with no composite state to get wrong. The game
    // currently passes White for every map/actor draw (day-phase tinting is
    // disabled in RedrawPlayScreen), so this covers all of them and is also
    // cheaper: no save/restore and no pipeline-breaking composite changes.
    if (tint.r === 255 && tint.g === 255 && tint.b === 255 && tint.a === 255) {
      this.ctx.drawImage(img, gx, gy);
      return;
    }

    // Real tint: draw the sprite, then fill over it with source-atop so only
    // the sprite's own pixels are tinted. One composite op instead of three,
    // and nothing depends on what was on the canvas before.
    this.ctx.save();
    this.ctx.drawImage(img, gx, gy);
    this.ctx.globalCompositeOperation = "source-atop";
    this.ctx.fillStyle = tint.toCssRgba();
    this.ctx.fillRect(gx, gy, img.width, img.height);
    this.ctx.restore();
  }

  UI_DrawImageTransform(imageId: string, gx: number, gy: number, rotation: number, scale: number): void {
    const img = this.imageCache.get(imageId);
    if (!img) { this.tallyDraw(imageId, false); void this.loadImage(imageId); return; }
    this.tallyDraw(imageId, true);

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
    if (!img) { this.tallyDraw(imageId, false); void this.loadImage(imageId); return; }
    this.tallyDraw(imageId, true);

    const gray = this.grayVariant(imageId, img);
    if (gray === null) { void this.loadImage(imageId); return; }
    this.ctx.drawImage(gray, gx, gy);
  }

  /**
   * The desaturated + darkened form of a sprite, rendered at most once.
   *
   * Uses the same `filter` string as the per-call path it replaces, applied
   * once to an offscreen canvas, so the output is identical — this is a
   * de-duplication of work, not an approximation of it.
   */
  private grayVariant(imageId: string, img: HTMLImageElement): OffscreenCanvas | null {
    const cached = this.grayCache.get(imageId);
    if (cached !== undefined) return cached;

    if (img.naturalWidth === 0 || img.naturalHeight === 0) return null;

    const off = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const octx = off.getContext("2d");
    if (!octx) return null;
    octx.filter = "grayscale(100%) brightness(55%)";
    octx.drawImage(img, 0, 0);

    this.grayCache.set(imageId, off);
    return off;
  }

  UI_DrawTransparentImage(alpha: number, imageId: string, gx: number, gy: number): void {
    const img = this.imageCache.get(imageId);
    if (!img) { this.tallyDraw(imageId, false); void this.loadImage(imageId); return; }
    this.tallyDraw(imageId, true);

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

  UI_DrawStringLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(FONT_MENU, color, text, gx, gy, shadowColor);
  }

  UI_DrawStringBoldLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(FONT_MENU_BOLD, color, text, gx, gy, shadowColor);
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

  /** Line height for popups and menus, matching the 12pt menu font. */
  private readonly MENU_LINE_H = 18;

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
    // Popups use the large menu font; the box is measured in that font so it
    // always fits its text.
    this.ctx.font         = FONT_MENU;
    this.ctx.textBaseline = "top";

    // Measure widest string
    const allText  = title ? [title, ...lines] : lines;
    const maxWidth = allText.reduce((w, l) => Math.max(w, this.ctx.measureText(l).width), 0);
    const totalLines = lines.length + (title ? 1 : 0);
    const padX = 6, padY = 6;
    const boxW = maxWidth + padX * 2;
    const boxH = totalLines * this.MENU_LINE_H + padY * 2;

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
      ty += this.MENU_LINE_H;
    }
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillStyle = (colors[i] ?? colors[colors.length - 1]).toCssRgba();
      this.ctx.fillText(lines[i], gx + padX, ty);
      ty += this.MENU_LINE_H;
    }
  }

  // ── Minimap ───────────────────────────────────────────────────────────────

  UI_ClearMinimap(color: Color): void {
    // A 10 000-iteration pixel loop; `fill` on the typed array is the same
    // thing without the per-element property access.
    const { r, g, b, a } = color;
    for (let i = 0; i < this.minimapData.length; i += 4) {
      this.minimapData[i]     = r;
      this.minimapData[i + 1] = g;
      this.minimapData[i + 2] = b;
      this.minimapData[i + 3] = a;
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
    // No .slice(): putImageData copies synchronously, so a view over the live
    // buffer is equivalent and saves a 40 KB allocation per frame.
    this.minimapCtx.putImageData(this.minimapImage, 0, 0);
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

    const src = imagePath(imageId);
    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img  = new Image();
      img.onload  = () => { this.imageCache.set(imageId, img); resolve(img); };
      img.onerror = () => {
        // Cache the failure, or every frame would retry it forever. Report it
        // once: a silent skip is what made this class of bug hard to see.
        this.imageCache.set(imageId, null);
        this.failedImages.add(imageId);
        console.warn(`[RogueSurvivor] sprite failed to load: ${src}`);
        resolve(null);
      };
      img.src     = src;
    });

    this.imageLoading.set(imageId, promise);
    return promise;
  }

  /** Sprite ids that failed to load, for diagnostics. */
  readonly failedImages = new Set<string>();
}
