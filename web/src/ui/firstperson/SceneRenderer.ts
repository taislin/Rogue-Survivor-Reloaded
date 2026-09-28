import { Color } from "@engine/Color";
import { Rect } from "@engine/Rect";
import type { Scene, SceneInputs } from "@engine/firstperson/SceneBuilder";
import { buildScene } from "@engine/firstperson/SceneBuilder";
import type { Quad, SceneRendererStats } from "@engine/firstperson/Types";

/**
 * Draws a first-person frame with Canvas2D.
 *
 * The blitting and nothing else. Every decision about *what* to draw is in
 * `firstperson/SceneBuilder`, which has no DOM, so the same quads can be rasterised
 * by a test and compared as an image — which is the only automated check available
 * for a renderer, since `NullRogueUI` drops the call and `npm run profile` counts
 * calls on that rather than here.
 *
 * It clips to the map panel, because the scene's coordinates are viewport-relative
 * and the panel is smaller than the canvas: without the clip a wall column paints
 * over the side panel, the minimap and the message log.
 */
export class SceneRenderer {
  private frames = 0;
  private drawCalls = 0;
  private culledBillboards = 0;
  private missingImages = 0;
  private last: Scene | null = null;

  /**
   * Builds a frame and draws it, timing each phase.
   *
   * The three timings are the measurement the port plan asks for and
   * `npm run profile` cannot give: this is the only place a real frame exists, and
   * it is where a textured floor's cost is either trivial or ruinous. They are kept
   * apart because "the floor is too slow" and "the raycast is too slow" have
   * completely different fixes, and one number cannot tell them apart.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    scene: Scene,
    resolveImage: (id: string) => CanvasImageSource | null,
  ): void {
    this.drawCalls = 0;
    this.missingImages = 0;
    this.culledBillboards = scene.counts.culledBillboards;

    const drawStart = performance.now();
    this.blit(ctx, scene, resolveImage);
    const drawMs = performance.now() - drawStart;
    // The renderer owns the blit, so it is the renderer that completes the frame's
    // timing rather than the builder inventing a number for work it did not do.
    (scene.timings as { drawMs: number }).drawMs = drawMs;
    (scene.timings as { totalMs: number }).totalMs = scene.timings.buildMs + drawMs;

    this.frames++;
    this.last = scene;
  }

  /** Builds a frame without drawing it — the seam's only caller needs both, and
   *  `RogueGame` needs the scene to decide what to ask for. */
  build(inputs: SceneInputs): Scene {
    return buildScene(inputs);
  }

  /**
   * Running totals for `?debug=1`.
   *
   * Cumulative rather than per-frame, because a per-frame millisecond figure read
   * once is noise: what matters is whether a frame fits in 16.7 ms, and the honest
   * way to say that is the mean over the frames actually drawn.
   */
  stats(): SceneRendererStats | null {
    const scene = this.last;
    if (scene === null) return null;
    const frames = Math.max(1, this.frames);
    return {
      frameMs: scene.timings.totalMs,
      raycastMs: scene.timings.raycastMs,
      buildMs: scene.timings.buildMs,
      drawMs: scene.timings.drawMs,
      frames: this.frames,
      drawCallsPerFrame: this.drawCalls / frames,
      columns: scene.counts.columns,
      wallQuads: scene.counts.wallQuads,
      floorQuads: scene.counts.floorQuads,
      billboardQuads: scene.counts.billboardQuads,
      fogColumns: scene.counts.fogColumns,
      culledBillboards: this.culledBillboards,
      missingImages: this.missingImages,
    };
  }

  /** The blit loop, and the only part of a first-person frame that touches a canvas. */
  private blit(
    ctx: CanvasRenderingContext2D,
    scene: Scene,
    resolveImage: (id: string) => CanvasImageSource | null,
  ): void {
    // The clip is the map panel, and the panel *is* the scene's viewport: the
    // engine hands the renderer a viewport the size of the panel and the panel's
    // coordinates, so there is no second copy of 864x672 to keep in step here. It
    // is still needed — the quads are viewport-relative, and an unclipped wall
    // column paints over the side panel, the minimap and the message log.
    const panel = new Rect(0, 0, scene.camera.width, scene.camera.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.left, panel.top, panel.width, panel.height);
    ctx.clip();

    // The backdrop, one fill: a sky or ceiling colour rather than a per-column
    // gradient. It is also where distance fog goes, which is the cheap way to make
    // the night and rain FOV penalties read at all, at zero per-texel cost.
    ctx.fillStyle = colorToCss(scene.backdrop.color);
    ctx.fillRect(panel.left, panel.top, panel.width, panel.height);
    this.drawCalls++;

    for (const quad of scene.quads) {
      this.drawQuad(ctx, quad, resolveImage);
    }
    ctx.restore();
  }

  private drawQuad(
    ctx: CanvasRenderingContext2D,
    quad: Quad,
    resolveImage: (id: string) => CanvasImageSource | null,
  ): void {
    // A quad with no image is a flat colour — the fog. A `fillRect` rather than a
    // tinted `drawImage` of a 1x1 white pixel: same pixels, one fewer indirection,
    // and nothing that can fail to load.
    if (quad.imageId === "") {
      ctx.globalAlpha = 1;
      ctx.fillStyle = quad.tint ? rgbCss(quad.tint) : "#000000";
      ctx.fillRect(quad.x, quad.y, quad.ux, quad.vy);
      this.drawCalls++;
      return;
    }

    const image = resolveImage(quad.imageId);
    if (image === null) {
      // Skipped rather than drawn as a hole, exactly as `UI_DrawImage` does. The
      // engine preloads every sprite at boot so this should never fire, but a
      // renderer that painted a black box would turn a load race into a visual bug.
      this.missingImages++;
      return;
    }

    // Axis-aligned quads — every wall column, every billboard, every fogged column
    // — take the identity path and never touch the transform. Only the sheared
    // floor quads pay for `setTransform`, which is a pipeline barrier in a browser
    // and therefore worth keeping off the common path.
    if (quad.uy === 0 && quad.vx === 0) {
      ctx.drawImage(image, quad.sx, quad.sy, quad.sw, quad.sh, quad.x, quad.y, quad.ux, quad.vy);
      this.drawCalls++;
      return;
    }

    this.drawShearedQuad(ctx, quad, image);
  }

  /**
   * A sheared quad: affine-transform the destination, clip to the parallelogram,
   * draw the source rect at the origin.
   *
   * The clip is the part that is easy to leave out and impossible to miss once
   * missing: without it a floor sub-quad's untransformed neighbours paint over the
   * floor in a bowtie, and the seams between sub-quads show as bright wedges.
   */
  private drawShearedQuad(ctx: CanvasRenderingContext2D, quad: Quad, image: CanvasImageSource): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(quad.x, quad.y);
    ctx.lineTo(quad.x + quad.ux, quad.y + quad.uy);
    ctx.lineTo(quad.x + quad.vx, quad.y + quad.vy);
    ctx.lineTo(quad.x + quad.ux + quad.vx, quad.y + quad.uy + quad.vy);
    ctx.closePath();
    ctx.clip();
    // Map the source rect's top-left to the quad's origin and the source's x and y
    // axes onto the quad's edge vectors.
    ctx.transform(
      quad.ux / quad.sw, quad.uy / quad.sw,
      quad.vx / quad.sh, quad.vy / quad.sh,
      quad.x - (quad.sx * quad.ux) / quad.sw,
      quad.y - (quad.sy * quad.vy) / quad.sh,
    );
    ctx.drawImage(image, 0, 0);
    ctx.restore();
    this.drawCalls++;
  }
}

function colorToCss(color: Color): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function rgbCss(tint: readonly [number, number, number]): string {
  return `rgb(${Math.round(tint[0] * 255)}, ${Math.round(tint[1] * 255)}, ${Math.round(tint[2] * 255)})`;
}
