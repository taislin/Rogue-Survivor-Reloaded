import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng, diffImages, type RgbaImage } from "./helpers/png";
import {
  createSurface,
  drawList,
  drawQuad,
  solidTexture,
  type Quad,
  type Texture,
} from "./helpers/softRaster";

/**
 * The golden-image harness, proving itself before anything depends on it.
 *
 * A golden test is only worth having if a failure means the renderer changed.
 * Two ways that goes wrong, both worth a test of their own:
 *
 *  - The *encoder* writes a broken PNG. Then every golden fails identically, or
 *    worse, the file is unreadable in a pull request and nobody can see the
 *    regression. So the encoder is checked by inflating its own IDAT back to the
 *    bytes that went in — a real round trip, not a "file exists" assertion.
 *  - The *rasteriser* is wrong. Then the goldens encode the rasteriser's bugs and
 *    pass forever, which is worse than no test: it looks like coverage. So the
 *    cases below are the ones whose answers are known by hand — a rectangle covers
 *    exactly its pixels, a nearer quad wins, a degenerate one draws nothing.
 *
 * Deliberately no golden files yet. Commit 4 adds them against a real raycaster;
 * committing images produced by an unproven harness would bake in its mistakes.
 */

const SURFACE_W = 40;
const SURFACE_H = 30;

function surface(fill: readonly [number, number, number] = [0, 0, 0]) {
  return createSurface(SURFACE_W, SURFACE_H, fill);
}

function pixel(s: ReturnType<typeof surface>, x: number, y: number): [number, number, number] {
  const i = (y * s.width + x) * 4;
  return [s.data[i]!, s.data[i + 1]!, s.data[i + 2]!];
}

/** A full-source-texture quad, i.e. the whole image stretched over the quad. */
function quad(over: Partial<Quad> & { imageId: string; depth: number }): Quad {
  return {
    x: 0, y: 0, ux: 1, uy: 0, vx: 0, vy: 1, sx: 0, sy: 0, sw: 1, sh: 1,
    ...over,
  };
}

describe("the software rasteriser", () => {
  const red = solidTexture("red", 255, 0, 0);

  it("draws an axis-aligned quad over exactly the pixels it covers", () => {
    const s = surface();
    // (3,4) to (3+5, 4+6): five by six pixels, and not one more. The pixel-centre
    // convention is what makes the boundary exact — a naive floor() on the max
    // edge would include row 10 and column 8, and every golden would be wrong by
    // a row in a way that is very hard to see.
    drawQuad(s, quad({ imageId: "red", depth: 1, x: 3, y: 4, ux: 5, uy: 0, vx: 0, vy: 6 }), red);

    expect(pixel(s, 3, 4)).toEqual([255, 0, 0]);
    expect(pixel(s, 7, 9)).toEqual([255, 0, 0]);
    expect(pixel(s, 2, 4)).toEqual([0, 0, 0]);
    expect(pixel(s, 8, 4)).toEqual([0, 0, 0]);
    expect(pixel(s, 3, 3)).toEqual([0, 0, 0]);
    expect(pixel(s, 3, 10)).toEqual([0, 0, 0]);
  });

  it("counts what it drew, and what the bounding box wasted", () => {
    // The clipped count is the number that decides how finely the floor has to be
    // subdivided, so it is worth a test that it is measured rather than assumed.
    const s = surface();
    const stats = drawQuad(s, quad({ imageId: "red", depth: 1, ux: 10, vy: 10 }), red);
    expect(stats.drawn).toBe(100);
    // 21, not 0: the bounding box runs to `ceil` of the far corner and is
    // inclusive, so it reaches x=10 and y=10 as well — the extra column, the extra
    // row, and the corner they share. A near floor tile is mostly *this*, and
    // knowing the exact overhead is what makes the subdivision count a calculation
    // rather than a guess.
    expect(stats.clipped).toBe(21);
  });

  it("lets the nearer quad win and records the one it hid", () => {
    const s = surface();
    const blue = solidTexture("blue", 0, 0, 255);

    // Far first, then near over the same area: the far one is occluded.
    drawQuad(s, quad({ imageId: "blue", depth: 9, ux: 4, vy: 4 }), blue);
    const near = drawQuad(s, quad({ imageId: "red", depth: 2, ux: 4, vy: 4 }), red);
    expect(near.drawn).toBe(16);
    expect(near.occluded).toBe(0);
    expect(pixel(s, 1, 1)).toEqual([255, 0, 0]);

    // The other order: the far one loses everywhere, and says so. A rasteriser
    // that reported `drawn` here would let a mis-sorted draw list pass unnoticed,
    // which is the whole class of bug the order is supposed to catch.
    const s2 = surface();
    drawQuad(s2, quad({ imageId: "red", depth: 2, ux: 4, vy: 4 }), red);
    const far = drawQuad(s2, quad({ imageId: "blue", depth: 9, ux: 4, vy: 4 }), blue);
    expect(far.drawn).toBe(0);
    expect(far.occluded).toBe(16);
  });

  it("occludes partially, which is what a doorway is", () => {
    // A billboard half behind a wall is the case a boolean depth test gets wrong:
    // the sprite either pops through the doorframe or vanishes. Half of it must
    // survive, and the split has to be at the wall's edge.
    const s = surface();
    const red32 = solidTexture("red", 255, 0, 0);
    drawQuad(s, quad({ imageId: "red", depth: 1, x: 5, ux: 4, vy: 8 }), red32); // the wall

    const before = drawQuad(s, quad({ imageId: "red", depth: 5, ux: 10, vy: 8 }), red32);
    expect(before.occluded).toBe(4 * 8);
    expect(before.drawn).toBe(6 * 8);
    expect(pixel(s, 4, 0)).toEqual([255, 0, 0]); // in front of the wall
    expect(pixel(s, 9, 0)).toEqual([255, 0, 0]); // behind it
  });

  it("maps a parallelogram, not just a rectangle", () => {
    // The floor primitive: a trapezoid's sub-quad, which is why the primitive is
    // an affine quad at all. A quad sheared along x must cover a slanted band, and
    // the u coordinate must vary across it — that is the texture mapping.
    const s = surface();
    const stats = drawQuad(s, quad({ imageId: "red", depth: 1, x: 2, y: 2, ux: 6, uy: 0, vx: 4, vy: 6 }), red);
    // The parallelogram has area |ux*vy - vx*uy| = 36.
    expect(stats.drawn).toBe(36);
    // The shear: at the top the quad spans x 2..8, at the bottom x 6..12.
    expect(pixel(s, 2, 2)).toEqual([255, 0, 0]);
    expect(pixel(s, 1, 2)).toEqual([0, 0, 0]);
    expect(pixel(s, 6, 7)).toEqual([255, 0, 0]);
    expect(pixel(s, 5, 7)).toEqual([0, 0, 0]);
  });

  it("samples a source rect rather than always the top-left texel", () => {
    // A 2x2 texture with four distinct colours. Sampling u,v over the quad must
    // reach all four, which is what makes a source *slice* possible — and a wall
    // column is exactly a source slice, so getting this wrong would make every
    // wall a smear of one corner of its texture.
    const tex: Texture = {
      name: "quad",
      width: 2,
      height: 2,
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
    };
    const s = surface();
    drawQuad(s, quad({ imageId: "quad", depth: 1, ux: 4, vy: 4, sx: 0, sy: 0, sw: 2, sh: 2 }), tex);

    // (0,0) red, (1,0) green, (0,1) blue, (1,1) yellow.
    expect(pixel(s, 0, 0)).toEqual([255, 0, 0]);
    expect(pixel(s, 3, 0)).toEqual([0, 255, 0]);
    expect(pixel(s, 0, 3)).toEqual([0, 0, 255]);
    expect(pixel(s, 3, 3)).toEqual([255, 255, 0]);
  });

  it("draws nothing at all for a degenerate quad", () => {
    // A billboard exactly edge-on, or a wall column squeezed to zero width by
    // rounding. det is 0, so the inverse divides by zero: without this the whole
    // screen would fill with one texel, which is the kind of bug that looks like
    // a memory fault rather than arithmetic.
    const s = surface();
    const stats = drawQuad(s, quad({ imageId: "red", depth: 1, ux: 0, uy: 5, vx: 0, vy: 0 }), red);
    expect(stats).toEqual({ drawn: 0, occluded: 0, clipped: 0 });
    // Untouched: still the opaque black it was cleared to, with no texel written.
    for (let i = 0; i < s.data.length; i += 4) {
      expect(s.data[i]).toBe(0);
      expect(s.data[i + 3]).toBe(255);
    }
    expect(s.z.every((v) => v === Infinity)).toBe(true);
  });

  it("counts a missing texture instead of throwing, so the golden can diff", () => {
    // A throw here would replace a readable image diff with a stack trace, which
    // is exactly the failure this harness exists to make legible.
    const s = surface();
    const result = drawList(s, [quad({ imageId: "absent", depth: 1, ux: 4, vy: 4 })], new Map());
    expect(result).toEqual({ drawn: 0, occluded: 0, skippedForMissingTexture: 1 });
  });
});

describe("the PNG encoder", () => {
  function parseChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const out: Array<{ type: string; data: Buffer }> = [];
    let at = 8;
    while (at < png.length) {
      const length = png.readUInt32BE(at);
      const type = png.subarray(at + 4, at + 8).toString("ascii");
      out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
      at += 12 + length;
    }
    return out;
  }

  it("round-trips the pixels through its own deflate stream", () => {
    // Not a "file exists" check. The IDAT is inflated and compared against the
    // scanlines that went in, which validates IHDR, every chunk CRC and the
    // zlib stream together — a real round trip without needing a decoder.
    const width = 7;
    const height = 5;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = i * 7;
      data[i * 4 + 1] = 255 - i;
      data[i * 4 + 2] = (i * 31) % 256;
      data[i * 4 + 3] = 255;
    }
    const image: RgbaImage = { width, height, data };

    const chunks = parseChunks(encodePng(image));
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);

    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBe(width);
    expect(ihdr.readUInt32BE(4)).toBe(height);
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // RGBA

    const raw = inflateSync(chunks[1]!.data);
    expect(raw.length).toBe((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
      expect(raw[y * (width * 4 + 1)]).toBe(0); // filter: None
      for (let b = 0; b < width * 4; b++) {
        expect(raw[y * (width * 4 + 1) + 1 + b]).toBe(data[y * width * 4 + b]!);
      }
    }
  });

  it("rejects a buffer that is not width x height x 4", () => {
    // Silently encoding a short buffer would produce a PNG whose bottom rows are
    // whatever was in memory, and the golden would then be a picture of garbage
    // that still matched.
    expect(() => encodePng({ width: 4, height: 4, data: new Uint8Array(16) })).toThrow(/64/);
  });

  it("reports how far a golden moved, not merely that it did", () => {
    // A count is what turns "the image changed" into a report. A one-texel fog
    // difference and a half-screen failure are the same assertion and completely
    // different bugs.
    const a: RgbaImage = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) };
    const b: RgbaImage = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) };
    expect(diffImages(a, b)).toEqual({ differing: 0, maxChannelDelta: 0, total: 16 });

    b.data[0] = 10;
    b.data[(3 * 4 + 1) * 4] = 200;
    expect(diffImages(a, b)).toEqual({ differing: 2, maxChannelDelta: 200, total: 16 });
  });

  it("refuses to diff two different sizes instead of comparing garbage", () => {
    expect(() =>
      diffImages(
        { width: 4, height: 4, data: new Uint8Array(64) },
        { width: 8, height: 4, data: new Uint8Array(128) },
      ),
    ).toThrow(/size/);
  });
});
