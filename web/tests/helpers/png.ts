import { deflateSync } from "node:zlib";

/**
 * A minimal PNG encoder, for the golden-image tests.
 *
 * Exists so a first-person regression can be a failing test rather than something
 * a human has to notice by looking at the game. The alternative — comparing
 * numbers — cannot see most of what goes wrong in a renderer: a billboard drawn
 * at the wrong depth, a wall face chosen on the wrong side, a floor quad that
 * skips a tile. Those are all *arrangements*, and an arrangement is what a picture
 * is.
 *
 * PNG rather than PPM because a diff of a broken 800x500 PPM is unreadable in a
 * pull request and a PNG is. The cost is the ~50 lines below, and they are
 * textbook: signature, IHDR, one IDAT of zlib-deflated filtered scanlines, IEND.
 *
 * Truecolour, 8 bits per channel, no palette and no interlacing — which is all a
 * test image needs, and what `ImageData` is.
 */

/** CRC-32 over a buffer, per the PNG spec. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC over type+payload. */
function chunk(type: string, payload: Uint8Array): Buffer {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(payload).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major, no padding. */
  data: Uint8Array;
}

/**
 * Encodes straight RGBA to a PNG.
 *
 * Each scanline is prefixed with filter type 0 (None) rather than a real
 * predictor. That costs a few per cent of file size and buys an encoder with no
 * filter logic to be wrong — the bytes in the IDAT are then the pixels, so a
 * failing golden diff can be read straight out of the file.
 */
export function encodePng(image: RgbaImage): Buffer {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) {
    throw new Error(
      `encodePng: expected ${width * height * 4} bytes for ${width}x${height}, got ${data.length}`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Filter byte per scanline, then the row.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * How many pixels differ between two images, and the largest single difference.
 *
 * Reported as counts rather than a boolean because a golden that is off by three
 * texels of fog and one that is off by half the screen are the same test failure
 * and completely different bugs, and the number says which without a rebuild.
 */
export function diffImages(
  a: RgbaImage,
  b: RgbaImage,
): { differing: number; maxChannelDelta: number; total: number } {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `diffImages: size ${a.width}x${a.height} against ${b.width}x${b.height}`,
    );
  }
  let differing = 0;
  let maxChannelDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let pixelDiffers = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
      if (d > 0) pixelDiffers = true;
      if (d > maxChannelDelta) maxChannelDelta = d;
    }
    if (pixelDiffers) differing++;
  }
  return { differing, maxChannelDelta, total: a.width * a.height };
}
