import type { RgbaImage } from "./png";
import type { Quad } from "@engine/firstperson/Types";

/**
 * A software rasteriser for the first-person view, for golden-image tests.
 *
 * **Why this exists.** §1.4a of the port plan records five presentation bugs in a
 * row that `tsc`, the Vite build, the 735-test suite and the headless simulator
 * all passed straight through, because every one was a *picture* fault and
 * `NullRogueUI` drops every painting call. The map drew empty, actors were
 * invisible. A renderer that projects every sprite off-screen or picks the wrong
 * wall face is equally invisible to all four.
 *
 * So the definition of done for this renderer has to be an image, not a count.
 *
 * **It consumes the engine's own `Quad`, imported rather than redeclared. A
 * structurally identical local type would make "the same draw list the browser
 * blits" a claim about resemblance rather than identity, and the golden image
 * would then be testing a lookalike of the thing that ships.
 *
 * What it does and does not check: the same quads, through the same affine
 * mapping, so it pins geometry, depth ordering, occlusion, face selection and
 * fog. Not the *art* — the sprites are lossless WebP, which Node cannot decode
 * without a dependency, so the textures here are procedural stand-ins keyed by
 * name. The art is a human's eye; the geometry is a test's.
 *
 * The primitive is a textured parallelogram rather than a rectangle because that
 * is what a floor tile under perspective actually is, and because it is exactly
 * what `Canvas2D` can do. Anything Canvas2D cannot express cannot be expressed
 * here either, so the two implementations cannot silently disagree about what a
 * quad *is*.
 */

/** A texture: RGBA, `width * height * 4` bytes, row-major. */
export interface Texture {
  /** For readable failures only — never used in the arithmetic. */
  name: string;
  width: number;
  height: number;
  data: Uint8Array;
}

/** Re-exported so tests import the primitive from one place. */
export type { Quad };

export interface Surface extends RgbaImage {
  /** Camera-space depth per pixel; `Infinity` where nothing has been drawn. */
  z: Float32Array;
}

export function createSurface(width: number, height: number, fill: readonly [number, number, number]): Surface {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data, z: new Float32Array(width * height).fill(Infinity) };
}

/** How many pixels a quad passed the depth test for, and how many it lost. */
export interface QuadStats {
  drawn: number;
  occluded: number;
  /** Pixels sampled but outside the parallelogram — the bounding-box waste. */
  clipped: number;
}

/**
 * Draws one quad, depth-tested.
 *
 * Inverse-maps each pixel of the bounding box rather than rasterising edges, so
 * the cost is the bounding box and not the shape. That is the same trade
 * `Canvas2D` makes, and for the floor it is why subdivision exists: a near tile's
 * bounding box is mostly wasted texels, and only splitting it makes the ratio
 * tolerable.
 */
export function drawQuad(surface: Surface, quad: Quad, texture: Texture): QuadStats {
  const { width, height, data, z } = surface;

  // Bounding box of the parallelogram: the four corners are O, O+U, O+V, O+U+V.
  const xs = [quad.x, quad.x + quad.ux, quad.x + quad.vx, quad.x + quad.ux + quad.vx];
  const ys = [quad.y, quad.y + quad.uy, quad.y + quad.vy, quad.y + quad.uy + quad.vy];
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));

  // Inverse of [ux uy; vx vy]. A degenerate quad (zero area — a billboard exactly
  // edge-on, or a wall column clipped to nothing) has no inverse, and drawing it
  // would divide by zero and paint the whole screen; skip it.
  const det = quad.ux * quad.vy - quad.vx * quad.uy;
  if (det === 0) return { drawn: 0, occluded: 0, clipped: 0 };

  const stats: QuadStats = { drawn: 0, occluded: 0, clipped: 0 };
  const [tr, tg, tb] = quad.tint ?? [1, 1, 1];

  for (let py = minY; py <= maxY; py++) {
    // Sample at the pixel centre, so a rectangle from 0 to 4 covers exactly the
    // four pixels 0..3 and not five.
    const dy = py + 0.5 - quad.y;
    for (let px = minX; px <= maxX; px++) {
      const dx = px + 0.5 - quad.x;
      // Inverse of [[ux, vx], [uy, vy]] — the matrix that maps (u, v) to (dx, dy):
      //   dx = u * ux + v * vx
      //   dy = u * uy + v * vy
      // so its rows are (ux, vx) and (uy, vy). Writing it as (ux, uy) and (vx, vy)
      // is the same slip as transposing the matrix, and it is silent: `u` still
      // comes out right for an axis-aligned quad, so a rectangle looks correct
      // while v runs backwards and every sheared quad — the entire floor — draws
      // nothing at all.
      const u = (dx * quad.vy - dy * quad.vx) / det;
      const v = (quad.ux * dy - quad.uy * dx) / det;
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        stats.clipped++;
        continue;
      }
      const index = py * width + px;
      if (quad.depth >= z[index]!) {
        stats.occluded++;
        continue;
      }

      let tx = Math.min(texture.width - 1, Math.max(0, Math.floor(quad.sx + u * quad.sw)));
      let ty = Math.min(texture.height - 1, Math.max(0, Math.floor(quad.sy + v * quad.sh)));
      const t = (ty * texture.width + tx) * 4;
      // Straight source-alpha blend, so a sprite's transparent border does not
      // paint a box of its own colour.
      const a = texture.data[t + 3]! / 255;
      if (a <= 0) continue;

      data[index * 4] = Math.round(texture.data[t]! * tr * a + data[index * 4]! * (1 - a));
      data[index * 4 + 1] = Math.round(texture.data[t + 1]! * tg * a + data[index * 4 + 1]! * (1 - a));
      data[index * 4 + 2] = Math.round(texture.data[t + 2]! * tb * a + data[index * 4 + 2]! * (1 - a));
      data[index * 4 + 3] = 255;
      z[index] = quad.depth;
      stats.drawn++;
    }
  }
  return stats;
}

/** Draws a list in order; a later quad is occluded by an earlier, nearer one. */
export function drawList(
  surface: Surface,
  quads: readonly Quad[],
  textures: ReadonlyMap<string, Texture>,
): { drawn: number; occluded: number; skippedForMissingTexture: number } {
  let drawn = 0;
  let occluded = 0;
  let skippedForMissingTexture = 0;
  for (const quad of quads) {
    const texture = textures.get(quad.imageId);
    if (texture === undefined) {
      // Counted rather than thrown: a missing texture is exactly the class of
      // defect a golden image is supposed to surface, and a throw would replace
      // a readable diff with a stack trace. The golden will differ, and the
      // assertion that says so is the point.
      skippedForMissingTexture++;
      continue;
    }
    const stats = drawQuad(surface, quad, texture);
    drawn += stats.drawn;
    occluded += stats.occluded;
  }
  return { drawn, occluded, skippedForMissingTexture };
}

/**
 * A solid-colour texture, for a draw list whose geometry is under test.
 *
 * Named by what it is rather than by what it looks like, so a failing golden
 * reads as "the wall texture was wrong" and not as a colour number.
 */
export function solidTexture(name: string, r: number, g: number, b: number): Texture {
  return { name, width: 1, height: 1, data: new Uint8Array([r, g, b, 255]) };
}
