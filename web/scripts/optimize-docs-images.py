#!/usr/bin/env python3
"""
Convert the website's PNGs to lossless WebP, verifying every pixel.

    python3 scripts/optimize-docs-images.py            # dry run: report only
    python3 scripts/optimize-docs-images.py --apply    # rewrite the tree

WHY A SEPARATE SCRIPT FROM `optimize-sprites.py`
    That one is scoped to `public/assets/images` and hard-codes it, because the
    sprite migration was a one-off shape: 1 113 32x32 files whose names are asset ids
    the engine resolves at runtime. The website's images are the opposite -- a dozen
    hand-placed screenshots under `docs/`, referenced by filename from HTML.

    What is shared is the part that matters, so it is imported rather than copied:
    `canonicalise` and the pixel-for-pixel verification in `convert_one`. WebP lossless
    discards colour under full transparency, which is why `canonicalise` exists, and
    duplicating that would be duplicating the reason the check can be exact.

    `optimize-sprites.py` is not importable by name -- the hyphen is not an identifier
    character -- so it is loaded from its path. That is uglier than duplicating four
    functions, and duplication is how this file ends up verifying less than it thinks.

WHY LOSSLESS HERE TOO
    Same reasoning as the sprites, and the same caveat: these are screenshots, so
    WebP lossless is a pure size win with no visual change. Measured per-file below.
    Nothing is re-encoded lossily, and the PNGs are only removed once every file has
    round-tripped -- a failure returns before the tree is touched.
"""

import argparse
import importlib.util
import shutil
import sys
import tempfile
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = WEB_ROOT.parent

# The website's screenshots. Anything else under docs/ is hand-placed art.
DEFAULT_DIR = REPO_ROOT / "docs" / "assets" / "img" / "screens"


def _load_sprites():
    """The shared canonicalise/convert_one, from the hyphenated sibling module."""
    path = Path(__file__).resolve().parent / "optimize-sprites.py"
    spec = importlib.util.spec_from_file_location("optimize_sprites", path)
    if spec is None or spec.loader is None:
        sys.exit(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "dir",
        nargs="?",
        default=str(DEFAULT_DIR),
        help="directory of PNGs to convert (default: the website's screens folder)",
    )
    ap.add_argument("--apply", action="store_true", help="rewrite the tree")
    args = ap.parse_args()

    sprites = _load_sprites()

    src_dir = Path(args.dir).resolve()
    if not src_dir.is_dir():
        sys.exit(f"not found: {src_dir}")

    pngs = sorted(src_dir.rglob("*.png"))
    if not pngs:
        print(f"no PNGs under {src_dir}")
        return 0

    print(f"{len(pngs)} PNG image(s) under {src_dir}")

    total_before = total_after = 0
    mismatches = []

    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)
        for i, src in enumerate(pngs, 1):
            rel = src.relative_to(src_dir)
            dst = staging / rel.with_suffix(".webp")
            dst.parent.mkdir(parents=True, exist_ok=True)

            before, after, identical = sprites.convert_one(src, dst)
            total_before += before
            total_after += after
            if not identical:
                mismatches.append(rel)
            else:
                pct = 100 * after / before if before else 0
                print(f"  {rel.name:<28} {before / 1024:8.1f} -> {after / 1024:7.1f} KB  ({pct:.0f}%)")

        if mismatches:
            print(f"\nFAILED: {len(mismatches)} file(s) did not round-trip faithfully:")
            for rel in mismatches:
                print(f"  {rel}")
            print("\nNothing was changed. These files must stay PNG.")
            return 1

        print(f"\n  original : {total_before / 1024:9.1f} KB")
        print(f"  webp     : {total_after / 1024:9.1f} KB  ({100 * total_after / total_before:.0f}%)")
        print(f"  saved    : {(total_before - total_after) / 1024:9.1f} KB")
        print(f"\nAll {len(pngs)} files verified faithful.")

        if not args.apply:
            print("\nDry run. Re-run with --apply to rewrite the tree.")
            return 0

        written = removed = 0
        for src in pngs:
            rel = src.relative_to(src_dir)
            dst = src_dir / rel.with_suffix(".webp")
            # `shutil.move`, not `Path.replace`: the staging tree is in the system
            # temp directory and the site is usually on another drive, and
            # `os.replace` cannot rename across drives. It raised WinError 17 on the
            # first file here, before anything was unlinked -- which is the staging
            # scope earning its keep, since the alternative was a half-converted tree.
            shutil.move(str(staging / rel.with_suffix(".webp")), str(dst))
            src.unlink()
            written += 1
            removed += 1

    print(f"Applied: wrote {written} .webp, removed {removed} .png")
    print("Next: point any HTML at them at .webp -- a <img> still naming a .png is now broken.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())