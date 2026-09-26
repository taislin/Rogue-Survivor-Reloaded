#!/usr/bin/env python3
"""
Convert the sprite PNGs to lossless WebP, verifying every pixel.

    python3 scripts/optimize-sprites.py            # dry run: report only
    python3 scripts/optimize-sprites.py --apply    # rewrite the tree

WHY WEBP

The sprite set is 1 124 PNGs / 2.41 MB, essentially all 32x32 pixel art --
98% of them use 256 colours or fewer. Measured on a 40-file sample:

    original PNG          79.8 KB
    PNG re-saved optimal  77.9 KB   (98% -- the PNGs were already well packed)
    WebP lossless         10.1 KB   (13%)

Re-saving the PNGs buys almost nothing; the format is the problem, not the
encoder. WebP lossless is exact by definition, so this is a pure size win with
no visual change -- which matters when the art is 32x32 pixel art that players
will look at closely for hours.

Requires Pillow. Unlike the audio work this is a format migration rather than a
correction table, so the PNGs are genuinely replaced rather than left on disk.
"""

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

WEB_ROOT = Path(__file__).resolve().parent.parent
IMAGES = WEB_ROOT / "public" / "assets" / "images"

# method=6 is the slowest and smallest; at this file size (2.4 MB total) the
# extra time is irrelevant and it beats method=4 by a small margin.
WEBP_METHOD = 6


def canonicalise(im: Image.Image) -> Image.Image:
    """
    Zero the RGB channels of fully transparent pixels.

    The C# resource export left arbitrary colour data under alpha=0 -- e.g. junk
    .png has (255,255,255,0) in 492 of its 1024 pixels. WebP discards colour
    under full transparency (it writes 0,0,0,0), so without this the round-trip
    is not byte-exact even though nothing visible changes.

    Zeroing first makes the conversion exactly idempotent and lets the check
    below stay a strict byte comparison rather than a fuzzy "close enough". No
    visible information is lost: a pixel with alpha=0 contributes nothing to any
    composite, and browsers ignore its colour channels.
    """
    rgba = im.convert("RGBA")
    r, g, b, a = rgba.split()
    opaque = a.point(lambda v: 255 if v > 0 else 0)
    black = Image.new("L", rgba.size, 0)
    return Image.merge(
        "RGBA",
        (
            Image.composite(r, black, opaque),
            Image.composite(g, black, opaque),
            Image.composite(b, black, opaque),
            a,
        ),
    )


def convert_one(src: Path, dst: Path) -> tuple[int, int, bool]:
    """
    Convert one file. Returns (original_bytes, webp_bytes, fidelity_ok).

    "fidelity_ok" means:
      * the alpha channel is byte-identical for every pixel, and
      * every pixel with alpha > 0 has byte-identical RGB.

    It deliberately does NOT require the colour stored under fully transparent
    pixels to survive. That colour is undefined -- no composite and no browser
    ever reads it -- and libwebp does not round-trip it consistently: sprites
    with a gAMA/sRGB chunk come back with the transparent pixels' colour
    reconstructed from their neighbours, the rest come back as (0,0,0,0).
    Demanding byte-exactness there would be a check that can never pass and that
    would say nothing about the art. Canonicalising the source (above) still
    keeps the stored files clean, so the sprites are not carrying junk either.
    """
    original = src.stat().st_size

    with Image.open(src) as im:
        canonical = canonicalise(im)
        canonical.save(dst, format="WEBP", lossless=True, method=WEBP_METHOD)

    # Verify by decoding what we just wrote and comparing pixels, rather than
    # trusting the encoder. This is the check that makes the migration safe.
    with Image.open(dst) as back:
        decoded = back.convert("RGBA")

    a_from, a_to = canonical.getchannel("A"), decoded.getchannel("A")
    if a_from.tobytes() != a_to.tobytes():
        return original, dst.stat().st_size, False

    # Zero both sides where transparent, so the comparison covers exactly the
    # pixels that can actually be seen.
    visible = a_from.point(lambda v: 255 if v > 0 else 0)
    bands_from, bands_to = canonical.split(), decoded.split()
    for i in range(3):  # R, G, B
        left = ImageChops.multiply(bands_from[i], visible)
        right = ImageChops.multiply(bands_to[i], visible)
        if left.tobytes() != right.tobytes():
            return original, dst.stat().st_size, False

    return original, dst.stat().st_size, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="rewrite the tree")
    args = ap.parse_args()

    if not IMAGES.is_dir():
        sys.exit(f"not found: {IMAGES}")

    pngs = sorted(IMAGES.rglob("*.png"))
    if not pngs:
        sys.exit(f"no PNGs under {IMAGES}")

    print(f"{len(pngs)} PNG sprites under {IMAGES.relative_to(WEB_ROOT)}")

    total_before = total_after = 0
    mismatches: list[tuple[Path, Path]] = []

    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)
        for i, src in enumerate(pngs, 1):
            # Mirror the tree so the swap is a straight move per file.
            rel = src.relative_to(IMAGES)
            dst = staging / rel.with_suffix(".webp")
            dst.parent.mkdir(parents=True, exist_ok=True)

            before, after, identical = convert_one(src, dst)
            total_before += before
            total_after += after
            if not identical:
                mismatches.append((src, dst))

            if i % 200 == 0:
                print(f"  ...{i}/{len(pngs)}")

        # Everything below happens INSIDE the staging scope: the swap reads from
        # the temp tree, so it has to happen before the directory is removed.
        print()
        print(f"  original : {total_before / 1024:9.1f} KB")
        print(f"  webp     : {total_after / 1024:9.1f} KB  ({100 * total_after / total_before:.0f}%)")
        print(f"  saved    : {(total_before - total_after) / 1024:9.1f} KB")

        if mismatches:
            print(f"\nFAILED: {len(mismatches)} file(s) did not round-trip faithfully:")
            for src, _ in mismatches[:20]:
                print(f"  {src.relative_to(IMAGES)}")
            print("\nNothing was changed. These files must stay PNG.")
            return 1

        print(f"\nAll {len(pngs)} files verified faithful.")

        if not args.apply:
            print("\nDry run. Re-run with --apply to rewrite the tree.")
            return 0

        # Only now touch the real tree, so a failure above cannot leave it
        # half-migrated: if any file failed we returned before getting here.
        converted = deleted = 0
        for src in pngs:
            rel = src.relative_to(IMAGES)
            shutil.move(str(staging / rel.with_suffix(".webp")), str(IMAGES / rel.with_suffix(".webp")))
            src.unlink()
            converted += 1
            deleted += 1

    print(f"Applied: wrote {converted} .webp, removed {deleted} .png")
    print("Next: update imagePath() in src/engine/AssetPaths.ts to emit .webp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
