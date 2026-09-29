#!/usr/bin/env python3
"""
Add the Still Alive sprites to the `classic` image set.

    python3 scripts/merge-sprite-sets.py            # dry run: report only
    python3 scripts/merge-sprite-sets.py --apply    # copy the fork-only files

WHY MERGE INTO `classic` AND NOT A FIFTH IMAGE SET

`sprite-style-option.test.ts` asserts the *largest* set is `classic`, because the
per-id fallback in `CanvasUI.ts` retries a missing sprite against `classic`. A
fifth, larger set inverts that: every Still-Alive sprite would be the fallback
target for all four other sets, so picking "classic" would quietly load
Still-Alive art. Merging keeps the largest set the vanilla one, so the fallback
still means "the art you shipped with".

WHY OURS WINS ON EVERY SHARED ID

Same policy as `merge-content-tables.py`, and for the same reason. The fork
re-drew 66 of the 349 sprites both trees have -- recoloured pills, re-skinned
survivors, re-textured every shop frontage on the district tiles, and a cleaner
replacement for `Tiles/rail_ew`. Overwriting with the fork's versions would
change classic's appearance with no flag anywhere near it, which is the one
thing the parallel-ruleset design exists to prevent.

The difference is that art is not a number, so unlike the CSV values there is
nowhere for the fork's version to be *stashed* for later: it is simply not
copied. The list of the 66 is printed below and belongs to Stage 5, where a
Still-Alive-specific id (or a per-ruleset image map) is the honest way to carry
two versions of one sprite.

The `shopping_mall plan.png` rename is forced: `imagePathIn` builds a URL by
string concatenation and does not encode, so a space in the id 404s.
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

WEB_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(WEB_ROOT)
CLASSIC = os.path.join(WEB_ROOT, "public", "assets", "images", "classic")
FORK = os.path.join(
    REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive",
    "Resources", "Images",
)

# `shopping_mall plan` -> `shopping_mall_plan`. See the module docstring.
RENAMES = {"shopping_mall plan": "shopping_mall_plan"}


def key(rel):
    """`Items/foo.png` -> `Items/foo`, so ids are comparable across formats."""
    for ext in (".png", ".webp"):
        if rel.endswith(ext):
            return rel[: -len(ext)]
    return rel


def index(base):
    out = {}
    for root, _, files in os.walk(base):
        for name in files:
            path = os.path.join(root, name)
            rel = os.path.relpath(path, base).replace(os.sep, "/")
            out[key(rel)] = path
    return out


def canonical(path):
    """RGBA with the RGB channels of transparent pixels zeroed.

    Matches `optimize-sprites.py`, which does the same before comparing: WebP
    discards colour under full transparency, so a PNG that keeps arbitrary
    values there round-trips to zeros and would otherwise read as a difference
    in the art when nothing visible changed.
    """
    rgba = Image.open(path).convert("RGBA")
    px = rgba.load()
    for y in range(rgba.size[1]):
        for x in range(rgba.size[0]):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not os.path.isdir(FORK):
        sys.exit(
            "fork images not found at %s\n"
            "The audit in STILL_ALIVE_REFERENCE.md was done against that tree; "
            "this script cannot reproduce it without it." % FORK
        )

    fork = index(FORK)
    ours = index(CLASSIC)
    shared = sorted(set(fork) & set(ours))
    to_add = sorted(set(fork) - set(ours))
    ours_only = sorted(set(ours) - set(fork))

    same, different = [], []
    for k in shared:
        a, b = canonical(fork[k]), canonical(ours[k])
        (same if (a.size == b.size and a.tobytes() == b.tobytes()) else different).append(k)

    print("fork sprites   %d" % len(fork))
    print("classic now    %d" % len(ours))
    print("shared ids     %d  (identical art %d, re-drawn by the fork %d)"
          % (len(shared), len(same), len(different)))
    print("fork-only      %d  <- added" % len(to_add))
    print("classic-only   %d  (kept; the fork has no version)" % len(ours_only))

    if different:
        print("\nre-drawn by the fork, ours kept. Stage 5 owes these a")
        print("Still-Alive-specific id if both versions are wanted:\n")
        for k in different:
            print("  %s" % k)

    renamed = [k for k in to_add if k in RENAMES]
    if renamed:
        print("\nrenaming %d file(s) that imagePathIn would 404 on:" % len(renamed))
        for k in renamed:
            print("  %s -> %s" % (k, RENAMES[k]))

    if not args.apply:
        print("\ndry run; pass --apply to copy %d file(s)" % len(to_add))
        return

    copied = 0
    for k in to_add:
        rel = RENAMES.get(k, k) + ".png"
        dest = os.path.join(CLASSIC, *rel.split("/"))
        if os.path.exists(dest):
            sys.exit("refusing to overwrite existing sprite: %s" % dest)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(fork[k], "rb") as src, open(dest, "wb") as out:
            out.write(src.read())
        copied += 1
    print("\ncopied %d file(s) into classic/" % copied)
    print("next: python3 scripts/optimize-sprites.py --apply")


if __name__ == "__main__":
    main()
