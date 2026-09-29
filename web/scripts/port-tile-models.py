#!/usr/bin/env python3
"""
Port the fork's tile models into the TypeScript `GameTiles`.

    python3 scripts/port-tile-models.py            # report only
    python3 scripts/port-tile-models.py --emit     # print the TS

WHY A SCRIPT AND NOT 125 HAND EDITS

`GameTiles.cs` defines its models in one completely regular shape:

    this[IDs.FLOOR_ASPHALT] = new TileModel(GameImages.TILE_FLOOR_ASPHALT,
                                            Color.Gray, true, true, false)
                                          { CanDecay = true };

Transcribing 125 of those by hand is exactly the work that produces a tile that
is walkable when it should be a wall, or a wall you can see through, and nothing
would catch either. Parse-and-emit is auditable: a flag comes from the text or
it does not appear at all.

WHAT IS PORTED AND WHAT IS NOT

Ported: image, minimap colour, `isWalkable`, `isTransparent`, and
`isWater` / `waterCoverImageId` — the last two already exist on the port's
`TileModel`, and the port already uses that two-step form for FLOOR_SEWER_WATER.

Not ported, and counted on stdout instead: `CanDecay` and `IsFlammable`. The
port's `TileModel` has no such fields, because tile fire is Still Alive content
with no vanilla equivalent (BROWSER_PORT_PLAN §5.6e's `TileFires` row) and decay
is part of the same pass. Dropping a flag silently is the failure mode this
script exists to prevent, so every dropped one is reported by name.

Ids are **appended**. Saves store tile model ids and the generators index
`TileID` numerically, so the port's 19 keep their values even though the fork
interleaves floors and walls freely — which is exactly the interleaving that
made the old `id <= TileID.RAIL_EW` floor test unsound.
"""

import argparse
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FORK = os.path.join(REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive")
CS = os.path.join(FORK, "Gameplay", "GameTiles.cs")
IMAGES_CS = os.path.join(FORK, "Gameplay", "GameImages.cs")
PORT_TILES = os.path.join(REPO, "web", "src", "gameplay", "GameTiles.ts")
PORT_IMAGES = os.path.join(REPO, "web", "src", "gameplay", "GameImages.ts")

MODEL_RE = re.compile(
    r"this\[IDs\.(?P<id>[A-Z_0-9]+)\]\s*=\s*new TileModel\("
    r"GameImages\.(?P<img>[A-Z_0-9]+)\s*,\s*"
    r"(?P<color>Color\.[A-Za-z]+|DRK_RED|LIT_[A-Z0-9_]+|DRK_[A-Z0-9_]+)\s*,\s*"
    r"(?P<walk>true|false)\s*,\s*"
    r"(?P<trans>true|false)\s*,\s*"
    r"(?P<flam>true|false)\s*\)"
    r"\s*\{(?P<props>[^}]*)\}"
)
CONST_RE = re.compile(r'public const string (?P<name>[A-Z_0-9]+)\s*=\s*@"([^"]+)"')


def enum_body(text):
    r"""The text between the `enum IDs` brace and its match.

    Brace-counted rather than regex-matched: the enum contains no inner braces
    today, but a `[^}]*` or a `\n\s*\}` pattern silently truncates the moment
    one appears, and a truncated id list looks exactly like a short enum.
    """
    start = text.index("enum IDs")
    open_brace = text.index("{", start)
    depth = 0
    for i in range(open_brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[open_brace + 1:i]
    sys.exit("unbalanced braces after `enum IDs` in %s" % CS)


def enum_names(body):
    """The ids in the C# `IDs` enum, in order.

    Parsed line-wise on purpose. Splitting the whole body on commas loses two
    ids: the C# interleaves bare `//@@MP (Release 6-1)` comments with *no*
    trailing comma, so a comma split glues the comment and the name after it
    into one token -- which is how `FLOOR_POND_CENTER` and
    `FLOOR_FOOD_COURT_POOL` both went missing from the first run, silently,
    with no error anywhere. A comment is not a name, and `#region` is not
    either.
    """
    out = []
    for line in body.splitlines():
        # `//` is a comment, `#` is a preprocessor directive (`#region`). Neither
        # is part of a name, and a trailing comma has to go too -- a line-wise
        # parse no longer splits on it the way a comma split used to.
        line = line.split("//", 1)[0].split("#", 1)[0].strip()
        name = line.rstrip(",").split("=", 1)[0].strip()
        # `_FIRST` is the C#'s "index 0" sentinel, not a tile -- `UNDEF = _FIRST`
        # is the entry that has a model. It has to be filtered here rather than
        # left to fail the no-model-line check, which is a report, not a stop.
        if name and name not in ("_COUNT", "_FIRST") and re.fullmatch(r"[A-Z_0-9]+", name):
            out.append(name)
    return out


def parse_models():
    with open(CS, encoding="utf-8-sig", errors="replace") as f:
        text = f.read()
    if "enum IDs" not in text:
        sys.exit("no `enum IDs` in %s" % CS)
    order = enum_names(enum_body(text))
    models, unparsed = {}, []
    for line in text.splitlines():
        if "new TileModel(" not in line:
            continue
        mm = MODEL_RE.search(line)
        if not mm:
            unparsed.append(line.strip())
            continue
        props = mm.group("props")
        cover = re.search(r"WaterCoverImageID = GameImages\.([A-Z_0-9]+)", props)
        models[mm.group("id")] = {
            "img": mm.group("img"),
            "color": mm.group("color"),
            "walk": mm.group("walk") == "true",
            "trans": mm.group("trans") == "true",
            "flam": mm.group("flam") == "true",
            "water": "IsWater = true" in props,
            "cover": cover.group(1) if cover else None,
            "decay": "CanDecay = true" in props,
        }
    return order, models, unparsed


def parse_image_constants():
    """`TILE_FLOOR_ASPHALT` -> `Tiles/floor_asphalt`, from the C# verbatim."""
    with open(IMAGES_CS, encoding="utf-8-sig", errors="replace") as f:
        return {m.group("name"): m.group(2).replace("\\", "/")
                for m in CONST_RE.finditer(f.read())}


def port_enum():
    """The ids the port already has, in order.

    The port writes explicit `NAME = 0` values; the C# writes bare names. So the
    `= 0` has to come off before the name is usable, which is why this is not
    the same expression as the C# side.
    """
    with open(PORT_TILES, encoding="utf-8") as f:
        body = re.search(r"export enum TileID \{(?P<b>[^}]*)\}", f.read()).group("b")
    out = []
    for entry in body.split(","):
        name = entry.strip().split("=")[0].strip()
        if name and name != "_COUNT" and re.fullmatch(r"[A-Z_0-9]+", name):
            out.append(name)
    return out


def port_image_constants():
    with open(PORT_IMAGES, encoding="utf-8") as f:
        return set(re.findall(r'static readonly ([A-Z_0-9]+)\s*=', f.read()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument(
        "--fixture",
        metavar="PATH",
        help="write the C#-derived flags as JSON, for tests/ to pin against",
    )
    args = ap.parse_args()

    order, models, unparsed = parse_models()
    consts = parse_image_constants()
    existing = port_enum()
    have_imgs = port_image_constants()
    new = [i for i in order if i not in existing]

    print("fork TileID entries   %d" % len(order))
    print("port already has      %d" % len(existing))
    print("new to append         %d" % len(new))
    if unparsed:
        print("\n!! %d model line(s) the parser did not understand:" % len(unparsed))
        for u in unparsed:
            print("   %s" % u)

    ported = [i for i in new if i in models]
    no_model = [i for i in new if i not in models]
    if no_model:
        print("\n!! enum entries with no model line: %s" % no_model)

    flam = [i for i in ported if models[i]["flam"]]
    decay = [i for i in ported if models[i]["decay"]]
    print("\ndropped (Stage 4 -- TileFires / decay, no port field yet):")
    print("  IsFlammable=true on %d: %s" % (len(flam), ", ".join(flam)))
    print("  CanDecay=true on %d tile(s)" % len(decay))

    needed = {models[i]["img"] for i in ported} | {
        models[i]["cover"] for i in ported if models[i]["cover"]}
    add_imgs = sorted(c for c in needed if c not in have_imgs)
    print("\nGameImages constants needed: %d, of which %d are new"
          % (len(needed), len(add_imgs)))
    unknown = [c for c in add_imgs if c not in consts]
    if unknown:
        sys.exit("no C# constant for: %s" % unknown)

    colors = sorted({models[i]["color"] for i in ported})
    print("minimap colours used: %s" % ", ".join(colors))
    water = [i for i in ported if models[i]["water"]]
    print("water tiles: %d" % len(water))

    if args.fixture:
        # A committed copy of what the C# says, because `_refs/` is gitignored
        # and a test that reads it would fail in CI. The fixture is the contract:
        # the flags are pinned, and the script is how a reviewer regenerates them
        # when the fork moves.
        payload = {
            name: {
                "walkable": models[name]["walk"],
                "transparent": models[name]["trans"],
                "water": models[name]["water"],
                # The resolved *path*, not the C# constant name: the port's
                # `waterCoverImageId` holds a path, and a test comparing a name
                # against a path fails for reasons that have nothing to do with
                # whether the flag is right.
                "waterCover": (consts.get(models[name]["cover"])
                               if models[name]["cover"] else None),
                # Recorded but not ported, so the debt is visible in the diff
                # when Stage 4 adds the fields.
                "flammableInFork": models[name]["flam"],
                "canDecayInFork": models[name]["decay"],
            }
            for name in order
            if name in models
        }
        with open(args.fixture, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
            f.write("\n")
        print("wrote %s (%d tiles)" % (args.fixture, len(payload)))
        return

    if not args.emit:
        print("\nre-run with --emit for the TypeScript")
        return

    print("\n/* ---- TileID: append, _COUNT %d -> %d ---- */"
          % (len(existing), len(existing) + len(new)))
    for n, ident in enumerate(new, start=len(existing)):
        print("  %s = %d," % (ident, n))

    print("\n/* ---- GameImages ---- */")
    for c in add_imgs:
        print('  static readonly %s = "%s";' % (c, consts[c]))

    print("\n/* ---- models ---- */")
    for ident in ported:
        d = models[ident]
        if d["water"]:
            var = "m" + ident.lower()
            print("    const %s = new TileModel(GameImages.%s, %s, %s, %s);"
                  % (var, d["img"], d["color"], str(d["walk"]).lower(), str(d["trans"]).lower()))
            print("    %s.isWater = true;" % var)
            if d["cover"]:
                print("    %s.waterCoverImageId = GameImages.%s;" % (var, d["cover"]))
            print("    this.setModel(TileID.%s, %s);" % (ident, var))
        else:
            print("    this.setModel(TileID.%s, new TileModel(GameImages.%s, %s, %s, %s));"
                  % (ident, d["img"], d["color"], str(d["walk"]).lower(), str(d["trans"]).lower()))


if __name__ == "__main__":
    main()
