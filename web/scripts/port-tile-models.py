#!/usr/bin/env python3
"""
Port the fork's tile models into the TypeScript `GameTiles`.

    python3 scripts/port-tile-models.py            # report only
    python3 scripts/port-tile-models.py --emit     # print the TS
    python3 scripts/port-tile-models.py --fixture tests/fixtures/still-alive-tiles.json

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

Ported, and emitted by `--emit`: image, minimap colour, `isWalkable`,
`isTransparent`, and `isWater` / `waterCoverImageId` — the last two already exist
on the port's `TileModel`, and the port already uses that two-step form for
FLOOR_SEWER_WATER.

Also ported, in its own emit section: `CanDecay`, which the port's `TileModel`
grew a `canDecay` field for. **108 of the 142 models carry it**, and `--emit`
writes them as a loop at the end of the `GameTiles` constructor for the same
reason the five flammable tiles are hand-listed at the end there: a flag marked
before the model table is installed is silently overwritten by a later
`setModel`, and nothing fails — the count is just wrong.

Not emitted, and counted on stdout instead: `IsFlammable`. It is a fifth
constructor argument in the C# rather than an object initialiser, so it is not
this script's shape at all, and the port already sets `isFlammable` from a
hand-written block that exists for the ordering reason above. Adding a second,
generated copy would be a second thing to keep in step with the first. It is
still reported by name: dropping a flag silently is the failure mode this script
exists to prevent. Note that the port's list is **short by two** — the fork also
marks `FLOOR_GRASS` and `FLOOR_PLANKS` — so this report is the record of what the
C# says, not a check that the port agrees with it.

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
    `= 0` has to come off before the name is usable, which is why this is not the
    same expression as the C# side.

    **Line-wise, and the comment is stripped first, and both matter.** The port's
    enum carries a five-line comment above the Still Alive block, and that comment
    contains both a comma ("Still Alive tiles, 124 of them") and an `=`
    ("the old `id <= TileID.RAIL_EW` floor test"). Splitting the body on commas
    first cuts inside the comment and glues the rest of it onto the next real
    name, which then fails the `[A-Z_0-9]+` test that is supposed to drop a
    comment — so `FLOOR_ARMY` disappeared, the report said "1 new to append" for a
    tile the port has had all along, and `--emit` would have appended a duplicate.
    This is the same trap `enum_names` documents for the C# side, with the comma
    in the port's comment rather than a comment with no trailing comma.
    """
    with open(PORT_TILES, encoding="utf-8") as f:
        body = re.search(r"export enum TileID \{(?P<b>[^}]*)\}", f.read()).group("b")
    out = []
    for line in body.splitlines():
        line = line.split("//", 1)[0].strip()
        name = line.rstrip(",").split("=", 1)[0].strip()
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

    # `CanDecay` and `IsFlammable` are both counted over *every* model the C#
    # builds, not over the ones still to append. The append list is nearly empty
    # now that the table is in, so counting over it answers a different and much
    # smaller question — how many such tiles arrived since the last run — which is
    # why a report of 1 sat under a comment in the port claiming 94.
    #
    # 143 enum entries less UNDEF is 142 models: `UNDEF = _FIRST` is assigned
    # `TileModel.UNDEF`, a shared static with no `new TileModel(...)` line for
    # `MODEL_RE` to match, so it is in `order` and not in `models`.
    all_models = [i for i in order if i in models]
    decay_all = [i for i in all_models if models[i]["decay"]]
    decay_new = [i for i in ported if models[i]["decay"]]
    flam_all = [i for i in all_models if models[i]["flam"]]

    print("\nisFlammable=true on %d of the %d model(s): %s"
          % (len(flam_all), len(all_models), ", ".join(flam_all) or "(none)"))
    print("  hand-set in GameTiles.ts and not emitted. The port's block is not parsed")
    print("  here, so this line is the C#'s list and not a check that the port matches")
    print("  it -- compare by eye; it is currently short of two of these.")
    print("\nCanDecay, over every model the C# builds:")
    print("  true  %d" % len(decay_all))
    print("  false %d" % (len(all_models) - len(decay_all)))
    print("  total %d  (%d enum entries less UNDEF)" % (len(all_models), len(order)))
    print("  of the %d still to append, %d are decayable" % (len(ported), len(decay_new)))
    if len(all_models) != len(models):
        print("!! %d models parsed but only %d enum entries reach them"
              % (len(models), len(all_models)))

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
                # `canDecay` is what `--emit` writes into `GameTiles`, so the fixture
                # and the table are two copies of the same 108 entries and comparing
                # them is what stops them drifting.
                #
                # `flammableInFork` is recorded for the opposite reason: the port
                # hand-lists the flammable tiles, so this is the only place the
                # count is written down. It is **not** the same set -- the C# marks
                # seven and `GameTiles.ts` lists five, missing `FLOOR_GRASS` and
                # `FLOOR_PLANKS`, which the fork also passes `true` for. That gap
                # predates this flag and is not fixed here; `isFlammable` is the
                # port's to own. Read this line as the debt, not as the truth.
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

    # Over `all_models`, not `ported`, for the same reason the report counts that
    # way: `CanDecay` is set on tiles the port has had for several releases, so the
    # append-only list would emit one name out of 108.
    #
    # A loop at the end of the constructor rather than a fifth constructor
    # argument, because `CanDecay` is an object initialiser in the C# and the port
    # has no way to say "and this one property" in the argument list. It also has
    # to be *after* every `setModel` above, or a later `setModel` replaces the
    # model object and the flag goes with it — the trap the `isFlammable` block in
    # `GameTiles.ts` documents, and the reason this is a separate trailing block
    # and not a line among the models.
    print("\n/* ---- canDecay: %d of the %d models, at the END of the constructor ---- */"
          % (len(decay_all), len(all_models)))
    print("    for (const id of [")
    for ident in decay_all:
        print("      TileID.%s," % ident)
    print("    ] as const) {")
    print("      this.get(id).canDecay = true;")
    print("    }")


if __name__ == "__main__":
    main()
