import { describe, it, expect } from "vitest";
import { SceneRenderer } from "@ui/firstperson/SceneRenderer";
import { buildScene, type SceneInputs } from "@engine/firstperson/SceneBuilder";
import { MAP_PANEL_HEIGHT, MAP_PANEL_WIDTH, TILE_VIEW_HEIGHT, TILE_VIEW_WIDTH } from "@engine/RogueGame";
import { Lighting, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Direction } from "@engine/Direction";
import { quadAffine, type Quad } from "@engine/firstperson/Types";
import { Color } from "@engine/Color";
import type { Scene } from "@engine/firstperson/SceneBuilder";

/**
 * The Canvas2D blit, asserted against a recording context.
 *
 * ## Why this file exists at all
 *
 * `SceneRenderer` is the one file in the project whose entire job is to call a
 * browser API, and it was at **0% coverage** while being the source of more
 * real defects than anything else in the port:
 *
 *  1. A sheared textured quad used a hand-built affine with the wrong translation.
 *  2. A flat quad used `fillRect`, which has no shear parameters, so every floor
 *     tile's base fill drew an upright rectangle.
 *
 * Both shipped, both were invisible to `tsc`, to the build, to the headless
 * simulator, to 852 tests and to every golden image — because the goldens go
 * through `tests/helpers/softRaster.ts`, a *different* implementation of the same
 * primitive that was correct. A shared `Quad` type constrains shape; it says
 * nothing about whether either implementation honours it.
 *
 * The pattern for both defects is the same and is what these tests actually
 * guard: **something that cannot express the required shape was used on a shape
 * that needed it.** So the assertions are about *what was asked of the canvas* —
 * is the clip a perimeter or a bowtie, is the fill issued in the quad's own
 * space or the destination's — and not about pixel output, which is the soft
 * rasteriser's job and which cannot see this code at all.
 *
 * A recording context is therefore the right instrument: it is not a canvas, it
 * needs no DOM, and it can assert the one thing a rasteriser cannot — what
 * `SceneRenderer` actually asked the browser to do.
 */

Models.tiles = new GameTiles();

interface Recorded {
  op: string;
  args: number[];
}

/**
 * A `CanvasRenderingContext2D` that records instead of painting.
 *
 * Every method the renderer can call is present; the ones under test record, the
 * rest are no-ops. A missing method would throw rather than silently pass, which
 * is the property that makes this worth having — the renderer cannot grow a new
 * canvas call without this file noticing.
 */
class RecordingContext {
  readonly calls: Recorded[] = [];
  /** Clip paths in device order, each a list of `[x, y]`. */
  readonly clips: Array<Array<[number, number]>> = [];
  /** `transform` matrices, in order, as the six `setTransform` arguments. */
  readonly transforms: number[][] = [];
  /** Depth of `save()`/`restore()` nesting, so a leak is visible. */
  depth = 0;
  maxDepth = 0;
  fillStyle: string | unknown = "";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;

  private path: Array<[number, number]> = [];
  private current: Recorded[] = [];

  private rec(op: string, ...args: number[]): void {
    this.calls.push({ op, args });
  }

  save(): void { this.depth++; this.maxDepth = Math.max(this.maxDepth, this.depth); }
  restore(): void { this.depth--; }
  beginPath(): void { this.path = []; this.current = []; }
  closePath(): void {}
  moveTo(x: number, y: number): void { this.path.push([x, y]); this.current.push({ op: "moveTo", args: [x, y] }); }
  lineTo(x: number, y: number): void { this.path.push([x, y]); this.current.push({ op: "lineTo", args: [x, y] }); }
  rect(x: number, y: number, w: number, h: number): void {
    this.path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    this.current = [{ op: "rect", args: [x, y, w, h] }];
  }
  clip(): void { this.clips.push([...this.path]); }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.transforms.push([a, b, c, d, e, f]);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.transforms.push([a, b, c, d, e, f]);
  }
  fillRect(x: number, y: number, w: number, h: number): void { this.rec("fillRect", x, y, w, h); }
  drawImage(...args: number[]): void { this.rec("drawImage", ...args); }
  fill(): void { this.rec("fill"); }
  set fillRule(_v: string) {}
  stroke(): void {}

  /** Every `fillRect` issued, in order, as `[x, y, w, h]`. */
  get fills(): number[][] {
    return this.calls.filter((c) => c.op === "fillRect").map((c) => c.args);
  }
}

/** `Scene` with its `readonly` fields loosened, so a test can swap the quad list. */
type ProbeScene = { -readonly [K in keyof Scene]: Scene[K] };

const asCtx = (ctx: RecordingContext): CanvasRenderingContext2D => ctx as unknown as CanvasRenderingContext2D;

const IMAGE = { width: 32, height: 32 } as CanvasImageSource;

function render(scene: Scene): RecordingContext {
  const ctx = new RecordingContext();
  new SceneRenderer().draw(asCtx(ctx), scene, () => IMAGE);
  return ctx;
}

/** A scene with a sheared flat quad, a sheared textured quad and an axis-aligned one. */
function probeScene(): ProbeScene {
  const shearedFlat: Quad = {
    imageId: "", x: 100, y: 200, ux: 60, uy: -14, vx: 40, vy: 22,
    sx: 0, sy: 0, sw: 1, sh: 1, depth: 2, tint: [0.5, 0.5, 0.5],
  };
  const shearedTextured: Quad = {
    imageId: "Tiles/floor_concrete", x: 100, y: 200, ux: 60, uy: -14, vx: 40, vy: 22,
    sx: 8, sy: 16, sw: 8, sh: 8, depth: 2,
  };
  return {
    camera: {
      posX: 0, posY: 0, dirX: 0, dirY: -1, rightX: 1, rightY: 0,
      planeLength: 1, verticalPlaneLength: 1, eyeHeight: 0.75, wallHeight: 1.5,
      width: MAP_PANEL_WIDTH, height: MAP_PANEL_HEIGHT,
    },
    backdrop: { color: Color.Black, isCeiling: false },
    weather: null,
    quads: [shearedFlat, shearedTextured],
    zBuffer: new Float32Array(MAP_PANEL_WIDTH),
    timings: { raycastMs: 0, buildMs: 0, drawMs: 0, totalMs: 0 },
    counts: {
      columns: MAP_PANEL_WIDTH, wallQuads: 0, floorQuads: 2, billboardQuads: 0,
      decalQuads: 0, decorationQuads: 0, fogColumns: 0, culledBillboards: 0,
    },
  } as unknown as Scene;
}

/**
 * The area a clip path encloses, by the shoelace formula.
 *
 * This is the assertion that matters, and it is worth explaining why it is not
 * the obvious "do the edges cross" test.
 *
 * A clip path is filled by the **even-odd rule**, so a self-intersecting
 * quadrilateral does not clip to a bowtie — it clips to the *difference* of its
 * two lobes, and with the vertex order that produces a bowtie the two lobes
 * cancel exactly. The measured area of a bowtie is **0**: the clip is empty, and
 * 43% of every floor quad simply is not painted. There is no partial artefact to
 * spot and no misaligned edge to measure, because nothing is drawn at all.
 *
 * That is also why "do the non-adjacent edges cross" is the weaker test, and I
 * wrote it first: it is a boolean, and a degenerate path with a repeated vertex
 * answers "no, nothing crosses" for the wrong reason — the zero-length edge makes
 * every orientation test return 0. Verified, not assumed: a mutation that
 * produced a repeated vertex passed a crossing test and is caught by this one.
 *
 * Comparing against the parallelogram's own area turns the whole class into one
 * number, and it is the number the bug is actually about: how much of the quad
 * survives.
 */
function clipArea(path: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

/** The area of a quad's parallelogram, `|ux·vy − uy·vx|`. */
const quadArea = (q: Quad): number => Math.abs(q.ux * q.vy - q.uy * q.vx);

describe("the first-person blit, as the browser is actually asked to draw it", () => {
  it("clips a sheared quad to its whole parallelogram, not a bowtie", () => {
    // The single highest-value assertion in this file, and the reason this file
    // exists. Everything else here is bookkeeping; this one is the defect.
    const scene = probeScene();
    const ctx = render(scene);
    // One for the panel, then one per sheared quad.
    expect(ctx.clips.length, "the panel clip and both quads should clip").toBe(3);

    // The panel is an axis-aligned rect, so its area is known too.
    expect(clipArea(ctx.clips[0]!)).toBe(MAP_PANEL_WIDTH * MAP_PANEL_HEIGHT);

    scene.quads.forEach((quad, i) => {
      const path = ctx.clips[i + 1]!;
      expect(path, "a clip path is not four points").toHaveLength(4);
      expect(clipArea(path), "a sheared quad did not clip to its own area")
        .toBeCloseTo(quadArea(quad), 6);
    });

    // And the fixture must be one where the two differ, or none of the above is
    // evidence of anything. A bowtie of these four vertices measures 0.
    expect(quadArea(scene.quads[1]!), "the fixture's quads are degenerate").toBeGreaterThan(0);
  });

  it("fills a sheared flat quad in the quad's own space, not the destination's", () => {
    // `fillRect(x, y, w, h)` has no shear parameters: given a sheared quad it
    // draws an upright rectangle using `ux` as a width and `vy` as a height and
    // discards `uy` and `vx` entirely. The difference between that and the true
    // parallelogram is two triangles, which is exactly what the floor looked like.
    //
    // So the check is *where* the fill was issued. After the transform the
    // coordinate space is the quad's own, so a fill at the origin sized by the
    // source rect is the only correct answer — and the destination-space call the
    // bug used is asserted to be absent, by name.
    const scene = probeScene();
    const ctx = render(scene);
    const flat = scene.quads[0]!;
    // Issued at the origin, sized by the source rect.
    expect(ctx.fills, "the flat fill was not issued in the quad's own space")
      .toContainEqual([0, 0, flat.sw, flat.sh]);
    // And explicitly not as the destination rectangle, which is the defect.
    expect(ctx.fills, "a sheared quad was filled in destination space")
      .not.toContainEqual([flat.x, flat.y, flat.ux, flat.vy]);
  });

  it("applies the same affine the shared helper computes, translation included", () => {
    // The renderer must delegate to `quadAffine`. It is a hand-built matrix
    // otherwise, and the original bug was the *translation* — `x - a·sx` where
    // the matrix needs `x - a·sx - c·sy`, which displaced every sheared quad by
    // `c·sy` sideways.
    const scene = probeScene();
    const ctx = render(scene);
    // Sheared quads only, in order, and both of the fixtures.
    expect(ctx.transforms).toHaveLength(2);
    scene.quads.forEach((quad, i) => {
      expect(ctx.transforms[i], "the renderer built its own matrix").toEqual(quadAffine(quad));
    });

    // The two translation terms the bug dropped are non-zero on the textured
    // quad, so a matrix that omitted them cannot pass by accident. This is the
    // guard on the guard: without it a quad at the origin would pass a broken
    // implementation just as happily as a correct one.
    const textured = scene.quads[1]!;
    const [, , c, , , ] = quadAffine(textured);
    const [, b, , d] = quadAffine(textured);
    expect(c * textured.sy, "the fixture does not exercise the c·sy term").not.toBe(0);
    expect(b * textured.sx, "the fixture does not exercise the b·sx term").not.toBe(0);
    void d;
  });

  it("takes the identity path for an axis-aligned quad, and no transform", () => {
    // Every wall column, billboard and fogged column is axis-aligned, and there
    // are 864 of the former. They must not pay for a transform, and a
    // `save`/`restore` pair per column is a cost the play loop pays every frame.
    const scene = probeScene();
    scene.quads = [{
      imageId: "Tiles/wall_brick", x: 12, y: 300, ux: 1, uy: 0, vx: 0, vy: 42,
      sx: 5, sy: 0, sw: 1, sh: 32, depth: 3.5,
    }];
    const ctx = render(scene);
    expect(ctx.transforms, "an axis-aligned quad applied a transform").toHaveLength(0);
    expect(ctx.depth, "save/restore was left unbalanced").toBe(0);
  });

  it("balances save and restore, so a throw cannot leak canvas state", () => {
    const ctx = render(probeScene());
    expect(ctx.depth, "the renderer left the context inside a save()").toBe(0);
    expect(ctx.maxDepth, "nothing was saved at all").toBeGreaterThan(0);
  });

  it("counts a missing sprite instead of painting a hole where it belongs", () => {
    // `UI_DrawImage` skips and reports, so a preload miss shows up as a sprite
    // that appears a frame later rather than as a black box in the world.
    const scene = probeScene();
    scene.quads = [scene.quads[1]!];
    const renderer = new SceneRenderer();
    const ctx = new RecordingContext();
    renderer.draw(asCtx(ctx), scene, () => null);
    expect(ctx.calls.some((c) => c.op === "drawImage"), "a missing sprite was painted").toBe(false);
    // And it is counted, so `?debug=1` can show it — the difference between a bug
    // you chase and a bug that tells you it is there.
    expect(renderer.stats()!.missingImages, "the missing sprite was not counted").toBe(1);
  });

  it("clips the whole frame to the map panel", () => {
    // The scene's coordinates are viewport-relative and the panel is smaller than
    // the canvas. Without this a wall column paints over the side panel, the
    // minimap and the message log.
    const ctx = render(probeScene());
    const panelClip = ctx.clips[0]!;
    expect(panelClip, "the first clip is not the panel").toHaveLength(4);
    expect(Math.max(...panelClip.map((p) => p[0]!))).toBe(MAP_PANEL_WIDTH);
    expect(Math.max(...panelClip.map((p) => p[1]!))).toBe(MAP_PANEL_HEIGHT);
  });

  it("builds a frame whose quads it can actually draw", () => {
    // The end-to-end version, over a real map: every quad the builder produces
    // must survive the blit without throwing, and the draw-call count must match
    // the quad count. This is the assertion that would have caught a quad shape
    // the renderer cannot express at all.
    const map = new GameMap(1, "test", TILE_VIEW_WIDTH, TILE_VIEW_HEIGHT);
    map.lighting = Lighting.LIT;
    const floor = Models.tiles.get(TileID.FLOOR_CONCRETE);
    const wall = Models.tiles.get(TileID.WALL_BRICK);
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) map.setTileModelAt(x, y, floor);
    }
    for (let x = 0; x < map.width; x++) { map.setTileModelAt(x, 0, wall); map.setTileModelAt(x, map.height - 1, wall); }
    for (let y = 0; y < map.height; y++) { map.setTileModelAt(0, y, wall); map.setTileModelAt(map.width - 1, y, wall); }
    for (let x = 0; x < map.width; x++) for (let y = 0; y < map.height; y++) map.getTileAt(x, y)!.isInView = true;

    const scene = buildScene({
      map, posX: 1.5, posY: 1.5, facing: Direction.N,
      width: MAP_PANEL_WIDTH, height: MAP_PANEL_HEIGHT,
      isInside: true, actionPoints: 100, maxViewDistance: 9, daylight: 1,
    } as SceneInputs);
    expect(scene.quads.length, "the fixture produced no quads").toBeGreaterThan(10);

    const renderer = new SceneRenderer();
    const ctx = new RecordingContext();
    renderer.draw(asCtx(ctx), scene, () => IMAGE);
    const stats = renderer.stats();
    expect(stats).not.toBeNull();
    // One backdrop fill, one per quad, and nothing else.
    expect(stats!.drawCallsPerFrame).toBe(scene.quads.length + 1);
    expect(ctx.depth, "a real frame unbalanced save/restore").toBe(0);
    // And a real frame's every clip is a perimeter, not just the hand-made probe's.
    for (const path of ctx.clips) expect(path, "a real frame clipped to a non-quad").toHaveLength(4);
  });
});
