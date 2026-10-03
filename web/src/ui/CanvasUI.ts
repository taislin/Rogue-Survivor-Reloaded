import { IRogueUI, GameKeyEvent, MouseButton, type MapView } from "@engine/IRogueUI";
import {
  getImageSet,
  getImageSetGeneration,
  imagePathIn,
  spriteChainFor,
} from "@engine/AssetPaths";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { Rect }  from "@engine/Rect";
import { InputHandler } from "./InputHandler";
import { SceneRenderer } from "./firstperson/SceneRenderer";
import type { Scene } from "@engine/firstperson/SceneBuilder";
import type { SceneRendererStats } from "@engine/firstperson/Types";
import { fontHud, fontHudBold, fontMenu, fontMenuBold } from "./fonts";

/**
 * Size of the minimap raster, in pixels *and* in tiles: one pixel per map tile
 * (matches C#'s 100x100 bitmap). Exported so a test can hold the renderer to the
 * engine's `MAP_MAX_*` and catch the two drifting apart.
 *
 * The raster's size is not the minimap's size on screen. The engine scales it by
 * `MINITILE_SIZE` and owns the result, which is why `UI_DrawMinimap` is told the
 * destination size rather than working it out here.
 */
export const MINIMAP_W = 100;
export const MINIMAP_H = 100;

/**
 * The game's logical drawing surface, 16:9 — `LOGICAL_W`/`LOGICAL_H` from
 * `@engine/CanvasSize`, which `RogueGame` re-exports as
 * `CANVAS_WIDTH`/`CANVAS_HEIGHT`.
 *
 * These were spelled out here rather than imported because "the renderer must not
 * depend on `RogueGame.ts`, which pulls the whole simulation in behind it". That
 * constraint was right and the conclusion drawn from it was wrong: avoiding the
 * dependency on a 36 000-line module does not require duplicating the numbers, only
 * a third module that declares them. Every drawing call in the game uses these
 * logical coordinates — see `CanvasUI.layout()` for how they reach the screen.
 */
import { LOGICAL_W, LOGICAL_H } from "@engine/CanvasSize";

/** What `CanvasUI.computeLayout` decided, in CSS pixels and backing-store pixels. */
export interface CanvasLayout {
  /** Logical pixels per CSS pixel: a whole number when the window allows one. */
  scale: number;
  /** Size of the canvas element, as CSS displays it. */
  cssW: number;
  cssH: number;
  /** Size of the drawing buffer, which additionally carries the pixel ratio. */
  backingW: number;
  backingH: number;
}

/**
 * HUD font, used for the side panel, the bottom log and the location panel.
 *
 * 10pt, not the C#'s "Lucida Console 8.25pt": this is a deliberate divergence
 * in the same spirit as the widescreen canvas, and for the same reason — the
 * browser is not running at C#'s 1024x768. Everything the HUD draws here is
 * monospace at whatever the display scales to, and 8.25pt lands at roughly
 * 11 device px, which is unreadable on a HiDPI panel.
 *
 * The bump is paid for in geometry, not by clipping: the side panel was widened
 * (see `TILE_VIEW_WIDTH`) to fit the larger status rows, and the log gives up a
 * line for the extra leading. See `RogueGame.ts`.
 *
 * The family itself is JetBrains Mono, registered and awaited in `fonts.ts` —
 * which is also where the fallback stack is defined, and why swapping the face
 * does not move any of the coordinates computed from `MENU_CHAR_WIDTH`.
 */
/**
 * Menu/reading font. Same family as the HUD font for visual continuity, at
 * 12pt for legibility on upscaled displays. Used by popups and every
 * full-screen menu through `UI_DrawStringLarge` / `UI_DrawPopup*`.
 */

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
  private readonly sceneRenderer = new SceneRenderer();
  private lastSceneLogAt = 0;
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

    this.layout();
    window.addEventListener("resize", this.onViewportChange);
    this.watchDevicePixelRatio();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  /**
   * Works out how big the canvas should be, given a viewport and a pixel ratio.
   *
   * Pure, so the sizing rules can be tested without a browser — the failure
   * modes here are silent (a stretched aspect ratio, a clipped game, a resampled
   * backing store), and a canvas in Node is not something a test can look at.
   */
  static computeLayout(availW: number, availH: number, dpr: number): CanvasLayout {
    // A whole multiple of the logical surface keeps every sprite pixel square.
    // Below 1:1 there is no such multiple, and the window has to be scaled
    // fractionally rather than clipped: the common case is a 1366-wide browser
    // window whose *viewport* is shorter than 768 once the chrome is subtracted.
    // Scaling only one axis to fit would stretch the art.
    const whole = Math.floor(Math.min(availW / LOGICAL_W, availH / LOGICAL_H));
    const scale = whole >= 1 ? whole : Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
    const cssW = LOGICAL_W * scale;
    const cssH = LOGICAL_H * scale;
    return {
      scale,
      cssW,
      cssH,
      backingW: Math.round(cssW * dpr),
      backingH: Math.round(cssH * dpr),
    };
  }

  /**
   * Sizes the canvas to the display and installs the base transform.
   *
   * The game draws in 1366x768 logical pixels, whatever the window is. Two
   * things then happen, and both matter for legibility:
   *
   * 1. The canvas is displayed at a whole multiple of the logical surface when
   *    the window has room for one, so a CSS pixel is an exact number of
   *    backing-store pixels and the browser never resamples the canvas.
   * 2. The backing store is `css size x devicePixelRatio`, and the context is
   *    scaled by that factor permanently, so a glyph is rasterised at the
   *    resolution it will be displayed at.
   *
   * Together these are what stop the text looking soft. Rasterising `12pt
   * "Lucida Console"` into a 1366x768 buffer and then letting the browser
   * stretch that buffer to the window costs a bilinear resample of already
   * antialiased glyph edges; rasterising it at the final size does not — the
   * browser's font rasteriser is the only thing antialiasing the text, which is
   * inherent to a proportional font and not something canvas can switch off.
   *
   * `imageSmoothingEnabled = false` keeps the 32px sprite art pixel-exact at
   * every scale: nearest-neighbour instead of a blur. Note this only affects
   * `drawImage`; it has no effect on text, which the font rasteriser handles.
   *
   * Assigning `canvas.width`/`height` resets the context to its default state,
   * so the transform and the smoothing flag are (re)installed here rather than
   * once at construction. Nothing else needs restoring: every draw call sets
   * the font, baseline and fill style it needs, and save/restore pairs are
   * balanced within a single call.
   */
  private layout(): void {
    const { cssW, cssH, backingW, backingH } = CanvasUI.computeLayout(
      window.innerWidth,
      window.innerHeight,
      CanvasUI.devicePixelRatio(),
    );

    this.canvas.style.width  = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Resizing clears the canvas; only touch it when the size really changed,
    // since a resize mid-frame would wipe what is already drawn.
    if (this.canvas.width !== backingW) this.canvas.width  = backingW;
    if (this.canvas.height !== backingH) this.canvas.height = backingH;

    this.ctx.setTransform(backingW / LOGICAL_W, 0, 0, backingH / LOGICAL_H, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private readonly onViewportChange = (): void => {
    this.layout();
    this.watchDevicePixelRatio();
  };

  /**
   * Re-lays out when the device pixel ratio changes.
   *
   * A window resize usually comes with it (dragging between monitors, browser
   * zoom), but not always, and `resize` does not fire for a pure DPR change.
   * The `change` event on a resolution media query is the only notification for
   * that, and it is one-shot: the old query stops matching once the ratio has
   * moved, so each handler re-arms a fresh query for the ratio it just saw.
   */
  private watchDevicePixelRatio(): void {
    const dpr = CanvasUI.devicePixelRatio();
    if (typeof matchMedia !== "function") return;

    const query = matchMedia(`(resolution: ${dpr}dppx)`);
    query.addEventListener("change", this.onViewportChange, { once: true });
  }

  /** `devicePixelRatio` is undefined in a few embedded/old browsers; 1 is right there. */
  private static devicePixelRatio(): number {
    const dpr = window.devicePixelRatio;
    return dpr != null && dpr > 0 ? dpr : 1;
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  UI_WaitKey(): Promise<GameKeyEvent>      { return this.input.waitKey(); }
  UI_PeekKey(): GameKeyEvent | null        { return this.input.peekKey(); }
  UI_PostKey(e: GameKeyEvent): void        { this.input.postKey(e); }
  UI_GetMousePosition(): Point             { return this.input.getMousePosition(this.canvas); }
  UI_PeekMouseButtons(): MouseButton | null { return this.input.peekMouseButtons(); }
  UI_PeekClickCount(): number { return this.input.peekClickCount(); }
  UI_PostMouseButtons(b: MouseButton): void { this.input.postMouseButtons(b); }
  UI_PeekWheel(): number                   { return this.input.peekWheel(); }

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
    // Before the "already have it" filter below: a preload started after the
    // sprite style changed must actually refetch, and the filter would otherwise
    // see the previous style's cache and skip the lot.
    this.invalidateImagesIfSetChanged();
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
    // A frame starts here, so this is where a sprite-set change has to be
    // noticed. It is the *only* place that can do it, and getting that wrong is
    // why choosing a different style used to need a page reload.
    //
    // The invalidation used to live solely in `loadImage`, which is reached only
    // on a cache *miss*, plus once in `UI_PreloadImages` at boot. After a warm
    // cache neither ever runs again: every subsequent frame is a hit, draws the
    // old sprite, and returns. So `setImageSet` bumped its generation, the
    // generation was correct, and the cache was stale and unreachable at the same
    // time -- the style could not change for the rest of the session.
    //
    // Here, before anything is drawn, the cache is guaranteed to describe the set
    // the frame is about to draw. It is one integer comparison per frame.
    this.invalidateImagesIfSetChanged();

    this.ctx.fillStyle = color.toCssRgba();
    // The logical surface, not `canvas.width`/`height`: the context carries a
    // scale transform, so backing-store dimensions would be read as logical
    // coordinates and paint far outside the canvas.
    this.ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
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

  /**
   * Scale of the innermost `UI_BeginScaledDraw` scope, `1` at the top level.
   *
   * The map is drawn through a 2x transform, and map-anchored overlays share
   * that scope so they stay locked to their tiles. Anything that has to reason
   * about "where is the edge of the screen" -- currently `drawPopupBox`, which
   * clamps a box to the visible area -- divides the logical canvas by this, so
   * it gets the same numbers the transform does.
   */
  private scaledDrawScale = 1;
  /** `scaledDrawScale` for each open scope, restored by `UI_EndScaledDraw`. */
  private readonly scaledDrawStack: number[] = [];

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

  // ── Scaled drawing scope ──────────────────────────────────────────────────

  /**
   * Draws everything until `UI_EndScaledDraw` at `scale` times its logical size,
   * clipped to `clipRect`.
   *
   * This is how the map is zoomed without touching the API: sprites are blitted
   * at their authored size with no size parameter, so scaling the context is
   * the only way to magnify them, and the engine's own map coordinates stay in
   * tiles-as-authored terms. The clip is what keeps a magnified map inside the
   * panel instead of painting over the side UI; omit it for drawing that is
   * allowed to spill (the engine's map-anchored popups).
   *
   * The clip rectangle is applied *before* the scale, so it is given in the
   * same logical coordinates as everything else. Pair every begin with an end:
   * an unbalanced scope would leak the transform into the HUD.
   */
  UI_BeginScaledDraw(scale: number, clipRect?: Rect): void {
    this.ctx.save();
    this.scaledDrawStack.push(this.scaledDrawScale);
    this.scaledDrawScale *= scale;
    if (clipRect != null) {
      this.ctx.beginPath();
      this.ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
      this.ctx.clip();
    }
    this.ctx.scale(scale, scale);
  }

  UI_EndScaledDraw(): void {
    this.ctx.restore();
    this.scaledDrawScale = this.scaledDrawStack.pop() ?? 1;
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  UI_DrawString(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(fontHud(), color, text, gx, gy, shadowColor);
  }

  UI_DrawStringBold(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(fontHudBold(), color, text, gx, gy, shadowColor);
  }

  UI_DrawStringLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(fontMenu(), color, text, gx, gy, shadowColor);
  }

  UI_DrawStringBoldLarge(color: Color, text: string, gx: number, gy: number, shadowColor?: Color): void {
    this.drawText(fontMenuBold(), color, text, gx, gy, shadowColor);
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

  /**
   * Centres the box on the logical surface. `gx` is computed here rather than by
   * the caller because the box's width comes from measuring the text in the menu
   * font, which only this layer has done — see `IRogueUI.UI_DrawPopupCentered`.
   *
   * Centres on `LOGICAL_W`, not on the canvas' CSS width: the caller works in
   * logical pixels and the context is already scaled to match, so using the
   * backing-store width would place the box off the right edge at any scale
   * other than 1.
   */
  UI_DrawPopupCentered(
    lines: string[], textColor: Color, borderColor: Color, fillColor: Color, gy: number,
  ): void {
    this.ctx.font = fontMenu();
    this.ctx.textBaseline = "top";
    const maxWidth = lines.reduce((w, l) => Math.max(w, this.ctx.measureText(l).width), 0);
    const gx = Math.max(0, (LOGICAL_W - (maxWidth + 6 * 2)) / 2);
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

  /**
   * Nudges a popup's top-left so the whole box stays on screen.
   *
   * A popup is placed relative to whatever it describes, so a description of
   * something in the last row or column hangs off the edge. C# clipped that off
   * against the map panel; the browser port draws its popups unclipped (a
   * prompt pinned in the map's top left must not be cut in half), so the box has
   * to be moved instead.
   *
   * `scale` is the ambient `UI_BeginScaledDraw` scale, because the visible area
   * in the current transform is the logical canvas *divided* by it: the map's 2x
   * scope shows the same 1366x768 of screen through half as much canvas space,
   * so clamping against the unscaled canvas would let a box sit well past the
   * right and bottom edges. Dividing is what makes this one clamp correct both at
   * 1x, where the answer is the canvas itself, and inside the map's scope, where
   * the same box ends up in the same place on screen.
   *
   * A box wider or taller than the visible area is left at the origin rather than
   * given a negative coordinate: it will overflow either way, and starting at 0
   * keeps as much of it as possible readable.
   */
  static clampPopupBox(
    gx: number, gy: number, boxW: number, boxH: number, scale: number,
  ): { x: number; y: number } {
    const viewW = LOGICAL_W / scale;
    const viewH = LOGICAL_H / scale;
    return {
      x: Math.max(0, Math.min(gx, viewW - boxW)),
      y: Math.max(0, Math.min(gy, viewH - boxH)),
    };
  }

  private drawPopupBox(
    lines: string[], colors: Color[],
    title: string | null, titleColor: Color | null,
    borderColor: Color, fillColor: Color,
    gx: number, gy: number,
  ): void {
    // Popups use the large menu font; the box is measured in that font so it
    // always fits its text.
    this.ctx.font         = fontMenu();
    this.ctx.textBaseline = "top";

    // Measure widest string
    const allText  = title ? [title, ...lines] : lines;
    const maxWidth = allText.reduce((w, l) => Math.max(w, this.ctx.measureText(l).width), 0);
    const totalLines = lines.length + (title ? 1 : 0);
    const padX = 6, padY = 6;
    const boxW = maxWidth + padX * 2;
    const boxH = totalLines * this.MENU_LINE_H + padY * 2;

    // Keep the whole box on screen. Popups are positioned relative to whatever
    // they describe -- the hovered tile, an item slot, a corner -- and C# let
    // the map panel clip whatever hung off the edge. There is no such clip here
    // (the overlay pass draws its popups unclipped so a prompt in the map's top
    // left is never cut in half), so a long description near the right or bottom
    // edge would simply run off the canvas; at 2x map zoom, where the transform
    // doubles both the anchor and the box, it landed in the bottom right corner
    // and off the screen entirely.
    const clamped = CanvasUI.clampPopupBox(gx, gy, boxW, boxH, this.scaledDrawScale);
    gx = clamped.x;
    gy = clamped.y;

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

  UI_DrawMinimap(gx: number, gy: number, width: number, height: number): void {
    // No .slice(): putImageData copies synchronously, so a view over the live
    // buffer is equivalent and saves a 40 KB allocation per frame.
    this.minimapCtx.putImageData(this.minimapImage, 0, 0);
    // The destination size is the engine's, not the raster's: the raster is one
    // pixel per tile and the map is drawn larger than that. Passing no size drew
    // it 1:1, so the view rect, the player tag and the field-of-view boxes --
    // all of which position themselves in the *scaled* coordinates -- landed off
    // the map, in the empty part of the panel. `imageSmoothingEnabled` is off, so
    // scaling up stays crisp.
    this.ctx.drawImage(this.minimapCanvas, gx, gy, width, height);
  }

  // ── Scale ─────────────────────────────────────────────────────────────────

  /**
   * CSS pixels per logical (game) pixel, horizontally.
   *
   * C# `UI_GetCanvasScaleX` is the ratio between the window's pixels and the
   * canvas's, and `RogueGame.MouseToMap` divides a mouse position by it to get
   * canvas coordinates. Dividing by `canvas.width` would now mix in the
   * device-pixel-ratio, so the logical surface is the divisor: the result is
   * the same CSS-per-game-pixel factor whether the display is 1x or 3x.
   */
  UI_GetCanvasScaleX(): number {
    return this.canvas.getBoundingClientRect().width / LOGICAL_W;
  }
  UI_GetCanvasScaleY(): number {
    return this.canvas.getBoundingClientRect().height / LOGICAL_H;
  }

  // ── First-person scene ───────────────────────────────────────────────────

  /**
   * Hands a first-person frame to `SceneRenderer`, which owns the blitting.
   *
   * A delegating method rather than a second `IRogueUI` implementation. A
   * `FirstPersonUI` class would have to re-implement all 33 members to delegate 31
   * of them, and `main.ts` would have to choose between two objects at boot — for a
   * renderer that differs from this one in exactly one method. What the renderer
   * needs from here it asks for: this class's image cache, and the canvas.
   */
  UI_DrawScene(scene: Scene): void {
    this.sceneRenderer.draw(this.ctx, scene, (imageId) => this.cachedImage(imageId));
    this.logSceneStats();
  }

  /**
   * The `[fp]` line, once a second, under `?debug=1`.
   *
   * Here rather than in `npm run profile` because `profile` counts painting calls
   * on `NullRogueUI`, which drops every one of them — so it cannot see a renderer
   * that goes through `UI_DrawScene` at all, and the port plan's own instruction to
   * measure this renderer's cost "rather than a guess" has nowhere else to go. This
   * is the only place a real frame exists.
   *
   * Throttled to a second because per-frame millisecond figures read once are noise:
   * the question is whether a frame fits in 16.7 ms, and the answer needs a mean.
   */
  private logSceneStats(): void {
    if (!CanvasUI.debugDraw) return;
    const stats = this.sceneRenderer.stats();
    if (stats === null) return;
    const now = Date.now();
    if (now - this.lastSceneLogAt < 1000) return;
    this.lastSceneLogAt = now;
    const budget = (16.7 / 100).toFixed(1);
    console.log(
      `[fp] ${(stats.frameMs).toFixed(2)}ms/frame (${budget}ms budget) ` +
        `ray=${stats.raycastMs.toFixed(2)} build=${stats.buildMs.toFixed(2)} draw=${stats.drawMs.toFixed(2)} ` +
        `draws=${stats.drawCallsPerFrame.toFixed(0)} cols=${stats.columns} walls=${stats.wallQuads} ` +
        `floor=${stats.floorQuads} billboards=${stats.billboardQuads} fog=${stats.fogColumns} ` +
        `culled=${stats.culledBillboards} missing=${stats.missingImages}`,
    );
  }

  UI_GetSceneStats(): SceneRendererStats | null {
    return this.sceneRenderer.stats();
  }

  /**
   * The already-loaded image for an id, or null.
   *
   * The same cache `UI_DrawImage` uses, deliberately: two caches would mean two
   * copies of every sprite, and a renderer holding a stale image after the sprite
   * style changed is a bug this project has already had in another form.
   */
  private cachedImage(imageId: string): CanvasImageSource | null {
    this.invalidateImagesIfSetChanged();
    const image = this.imageCache.get(imageId);
    if (image === undefined) {
      // Same contract as `UI_DrawImage` on a miss: skip and start the load, so the
      // sprite appears on a later frame rather than as a hole.
      void this.loadImage(imageId);
      return null;
    }
    return image;
  }

  // ── Map ⇄ screen ──────────────────────────────────────────────────────────

  /**
   * `RogueGame.MapToScreen`'s arithmetic, moved here verbatim.
   *
   * `tileSize` comes from the `MapView` rather than from a local constant, and
   * that is the point of the move: the engine has exactly one copy of the tile
   * size, so this cannot drift from it. The obvious alternative — importing
   * `TILE_SIZE` — is the thing the file header already rules out, since
   * `CanvasUI` must not depend on `RogueGame`; `LOGICAL_W` and `LOGICAL_H` used
   * to be repeated here for the same reason and "agree only by convention", which
   * is now `engine/CanvasSize.ts` — one declaration neither this file nor
   * `RogueGame` has to duplicate.
   *
   * Answers in 32px-tile units rather than screen pixels on purpose: the map zoom
   * is applied *after* this by the caller's draw scope, so a screen-pixel answer
   * would be scaled twice.
   *
   * The declared return is the interface's `Point | null` and not the narrower
   * `Point` this always produces. That is deliberate: a renderer that *does* have
   * positions it cannot show has to be able to say so, and declaring the narrow
   * type here would make that a compile error in any subclass — the null path
   * would be unreachable by construction.
   */
  UI_MapToScreen(gx: number, gy: number, view: MapView): Point | null {
    return new Point(
      (gx - view.rect.left) * view.tileSize,
      (gy - view.rect.top) * view.tileSize,
    );
  }

  /**
   * The inverse, and the one place the map zoom has to be known: the mouse
   * arrives in *displayed* pixels, so dividing by the undisplayed tile size
   * would put it on the wrong tile at zoom 2.
   */
  UI_ScreenToMap(gx: number, gy: number, view: MapView): Point | null {
    return new Point(
      view.rect.left + Math.trunc(gx / view.displayTileSize),
      view.rect.top + Math.trunc(gy / view.displayTileSize),
    );
  }

  // ── Screenshots ───────────────────────────────────────────────────────────

  UI_SaveScreenshot(filePath: string): string {
    const data = this.canvas.toDataURL("image/png");
    // Use the name the engine chose (`RogueGame.ScreenshotFilePath`, which
    // carries the unique id from `GetUserNewScreenshotName`). Hardcoding
    // "screenshot.png" here threw that away, so every screenshot overwrote the
    // previous one and the filename the game reported in its message was never
    // the file the player actually received.
    const name = CanvasUI.downloadName(filePath);
    const a    = document.createElement("a");
    a.href     = data;
    a.download = name;
    a.click();
    return name;
  }

  /**
   * The last path segment of a save-style path, as a download filename.
   *
   * The engine builds Windows-shaped paths (`Config\Screenshot\screenshot_000.png`)
   * for C# parity, so both separators have to be handled, and anything a
   * browser would reject in a filename has to go: a `/` would be read as a
   * directory and the download would land nowhere.
   *
   * The control-character range is written as the escapes `\x00-\x1F`, never as
   * literal bytes. It was literal once, which put a NUL and a 0x1F into this
   * source file — and a source file containing a NUL is classified as *binary*
   * by `grep` and ripgrep, so every `grep -rn` over `src/` silently answered
   * "binary file matches" and reported **no findings at all** for this file. That
   * hides one of the two most important UI files from any audit that greps rather
   * than `git grep`s. The semantics are identical; only the bytes on disk differ.
   */
  static downloadName(filePath: string): string {
    const base = filePath.split(/[\\/]/).pop() ?? "";
    const safe = base.replace(/[<>:"|?*\x00-\x1F]/g, "_").trim();
    return safe === "" || safe === "." || safe === ".." ? "screenshot.png" : safe;
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
   *
   * A sprite that the selected set does not have is retried out of `classic`,
   * which is the complete set: the other two are variations of it and are
   * missing entries. Without that, choosing a variation would leave a screen of
   * holes that no error explains.
   *
   * The set a sprite actually came from is remembered per id, so the retry
   * happens once rather than on every frame for the rest of the session.
   */
  private loadImage(imageId: string): Promise<HTMLImageElement | null> {
    this.invalidateImagesIfSetChanged();
    if (this.imageLoading.has(imageId)) return this.imageLoading.get(imageId)!;

      // The chain is per *sprite*, not per style: under a routed style an actor and a
      // wall resolve from different sets, so this cannot be hoisted out of the function.
      const chain = spriteChainFor(getImageSet(), imageId);
      // Where in the chain to *start*. A sprite that already answered further down
      // is not re-requested from the top on every repaint, which matters because
      // the miss is the common case: a variant set is missing most of the original's
      // 360-odd sprites, so without this every one of them would cost a failed
      // request per frame.
      const attempt = (index: number): Promise<HTMLImageElement | null> => {
        if (index >= chain.length) {
          // Cache the failure, or every frame would retry it forever. Report it
          // once: a silent skip is what made this class of bug hard to see.
          this.imageCache.set(imageId, null);
          this.failedImages.add(imageId);
          console.warn(
            `[RogueSurvivor] sprite failed to load in any set (${chain.join(", ")}): ${imageId}`,
          );
          return Promise.resolve(null);
        }
        const src = imagePathIn(chain[index], imageId);
        return new Promise<HTMLImageElement | null>((resolve) => {
          const img  = new Image();
          img.onload  = () => {
            this.imageChainIndex.set(imageId, index);
            this.imageCache.set(imageId, img);
            resolve(img);
          };
          img.onerror = () => {
            // Not in this one: step down the chain and remember how far we got, so
            // the next ask for this id starts where this one finished.
            this.imageChainIndex.set(imageId, index + 1);
            resolve(attempt(index + 1));
          };
          img.src     = src;
      });
    };

    // Resume where the last attempt for this id got to, so a sprite that lives two
    // sets down is not re-requested from the top on the next frame. Without this a
    // variant style costs a failed request per missing sprite *per frame*, which is
    // most of the original's 360-odd ids.
    const promise = attempt(this.imageChainIndex.get(imageId) ?? 0);
    this.imageLoading.set(imageId, promise);
    return promise;
  }

  /**
   * Drops every cached sprite when the sprite set has changed underneath us.
   *
   * The cache is keyed by image *id* and holds resolved URLs, so it cannot see
   * that the set moved; without this, choosing a different style would keep
   * drawing the old one until the page was reloaded. Keyed on the generation
   * rather than on a callback from the options screen so that every way of
   * changing the set is covered, including ones that do not exist yet.
   *
   * Called from `UI_Clear`, which every frame passes through on its way to
   * drawing, so it runs before any cached sprite can be read. It is also still
   * called from `loadImage` and `UI_PreloadImages`; those are now redundant
   * rather than load-bearing, and are kept because they cost one integer
   * comparison and because a preload that refetched nothing would be a silent
   * regression if this ever moved again.
   */
  private invalidateImagesIfSetChanged(): void {
    if (this.imageCacheGeneration === getImageSetGeneration()) return;
    this.imageCacheGeneration = getImageSetGeneration();
    this.imageCache.clear();
    this.imageLoading.clear();
      // The chain positions are per-style, so they are stale too: a sprite missing
      // from the old style's chain may well be present in the new one, and an
      // index into one chain means nothing against a different chain.
      this.imageChainIndex.clear();
    // And so is the grayscale cache, which was the one omission here.
    //
    // `grayVariant` is a cache *of the rasterised sprite*, keyed only by image
    // id, so an entry from the old style is indistinguishable from a fresh one
    // and is returned without consulting `imageCache`. That made the sprite-style
    // option half-work: unexplored tiles redrew in the new style immediately,
    // while every tile the player had already visited — which is most of the map,
    // since memorised tiles outnumber visible ones — kept the *previous* style's
    // grayscale sprite until the page was reloaded. A stale cache that silently
    // serves the previous answer, which is the one failure mode the generation
    // counter above exists to prevent.
    this.grayCache.clear();
  }

  /**
   * How far down the current style's chain each sprite got.
   *
   * An index rather than a set name, because a chain has more than one step: the
   * useful fact about a sprite is *how far down* it was found, so the next ask
   * starts there instead of walking past two sets that do not have it. Cleared
   * when the style changes — the chain it indexes into is a different one.
   */
  private readonly imageChainIndex = new Map<string, number>();

  /** The set generation `imageCache` was filled under. */
  private imageCacheGeneration = getImageSetGeneration();

  /** Sprite ids that failed to load, for diagnostics. */
  readonly failedImages = new Set<string>();
}