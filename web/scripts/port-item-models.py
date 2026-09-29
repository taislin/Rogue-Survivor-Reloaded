#!/usr/bin/env python3
"""
Port the fork's item models into the TypeScript `GameItems`.

    python3 scripts/port-item-models.py              # report only
    python3 scripts/port-item-models.py --emit       # print the TS

WHY A SCRIPT

`GameItems.cs` builds every item the same way, with the sprite as the third
constructor argument:

    this[IDs.FOOD_RAW_RABBIT] = new ItemFoodModel(DATA_...NAME, DATA_...PLURAL,
                                                   GameImages.ITEM_RAW_RABBIT, ...)

So the sprite for a CSV id is *readable from the source* rather than guessable
from the id, which is the point: `FOOD_RAW_RABBIT` is drawn by
`ITEM_RAW_RABBIT`, `MELEE_KATANA` by `ITEM_KATANA`, and `FLOOR_ARMY`-style
renames mean no naming rule would have got those right. There are 87 new items.

Only the maps whose value is `{id, img}` are emitted. The others need something
the C# states in a different shape each time — a verb (`new Verb("slash",
"slashes")`), an `AmmoType`, a `DollPart`, a second image for a burnt-out or
tagged variant — and a generator that guessed those would be worse than the
handful of lines it replaced. Those are listed, with the field each one needs, so
the remaining work is enumerated rather than discovered.

The emit is therefore: the `ItemID` entries, the `GameImages` constants, and the
map lines for the simple types.
"""

import argparse
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FORK = os.path.join(REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive")
ITEMS_CS = os.path.join(FORK, "Gameplay", "GameItems.cs")
IMAGES_CS = os.path.join(FORK, "Gameplay", "GameImages.cs")
PORT_ITEMS = os.path.join(REPO, "web", "src", "gameplay", "GameItems.ts")
PORT_IMAGES = os.path.join(REPO, "web", "src", "gameplay", "GameImages.ts")

# `this[IDs.FOOD_RAW_RABBIT] = new ItemFoodModel(a, b, GameImages.ITEM_RAW_RABBIT, ...)`
# The sprite is always the 3rd argument, which is why the pattern is anchored on
# `GameImages.` appearing third rather than anywhere.
ITEM_RE = re.compile(
    r"this\[IDs\.(?P<id>[A-Z_0-9]+)\]\s*=\s*new Item(?P<type>[A-Za-z]+)Model\("
    r"(?:[^,]+,\s*){2}GameImages\.(?P<img>[A-Z_0-9]+)\s*,"
)
# `EquipmentPart = DollPart.RIGHT_HAND` within an item's initialiser block.
EQUIP_RE = re.compile(r"EquipmentPart\s*=\s*DollPart\.([A-Z_]+)")
VERB_RE = re.compile(r'new Verb\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)')
AMMO_RE = re.compile(r"AmmoType\.([A-Z_]+)")
CONST_RE = re.compile(r'public const string (?P<name>[A-Z_0-9]+)\s*=\s*@"([^"]+)"')

# The maps whose whole value is `{id, img}` -- no second image, no verb, no
# flags. Everything else is reported rather than guessed at.
SIMPLE_MAPS = {
    "FOOD": "foodMap",
    "ENT": "entMap",
    "TRAP": "trapMap",
}

# What each remaining type needs, for the report. Keys are the `Item<Y>Model`
# names as they appear in the C#.
NEEDS = {
    "Medicine": "img + `plural` (C# CheckPlural on NAME/PLURAL)",
    "MeleeWeapon": "img + `verb` from `new Verb(...)` + `unique?`",
    "RangedWeapon": "img + `ammo` (AmmoType.*) + `verb` + `unique?`",
    "BodyArmor": "img + `slot` (DollPart.*)",
    "Light": "img + `outImg` (the burnt-out sprite; usually the same one)",
    "Tracker": "img + `flags` (TrackingFlags from the C# initialiser)",
    "SprayPaint": "img + `tagImg` (second GameImages.*)",
    "Grenade": "img (+ the blast array, which lives outside the item table)",
    "Backpack": "img + inv slots (drives a doll rule rather than a map entry)",
    "Scentspray": "img",
    "Barricading": "img",
}

# Ids the C# defines that no merged CSV row backs. `ItemGrenadePrimedModel` is
# the big one: the fork makes the *primed* grenade a distinct item, which vanilla
# does not, and there is no row for it because there is no vanilla table for it.
# Adding those ids would create `ItemID` members with no model -- the exact hole
# `model-data-binding.test.ts` now fails on -- so they are reported, not emitted.
def merged_rows():
    import json
    import glob
    rows = set()
    for path in glob.glob(os.path.join(REPO, "web", "src", "gameplay", "data",
                                       "Items_*.json")):
        for r in json.load(open(path, encoding="utf-8")):
            rows.add(r["ID"])
    return rows


def parse_items():
    with open(ITEMS_CS, encoding="utf-8-sig", errors="replace") as f:
        text = f.read()
    found = {}
    for m in ITEM_RE.finditer(text):
        ident = m.group("id")
        if ident in found:
            continue
        # The initialiser block that follows carries EquipmentPart / Verb / Ammo.
        tail = text[m.end(): m.end() + 700]
        equip = EQUIP_RE.search(tail)
        verb = VERB_RE.search(tail)
        ammo = AMMO_RE.search(tail)
        found[ident] = {
            "type": m.group("type"),
            "img": m.group("img"),
            "equip": equip.group(1) if equip else None,
            "verb": [verb.group(1), verb.group(2)] if verb else None,
            "ammo": ammo.group(1) if ammo else None,
        }
    return found


def image_constants():
    with open(IMAGES_CS, encoding="utf-8-sig", errors="replace") as f:
        return {m.group("name"): m.group(2).replace("\\", "/")
                for m in CONST_RE.finditer(f.read())}


def port_item_ids():
    with open(PORT_ITEMS, encoding="utf-8") as f:
        body = re.search(r"export enum ItemID \{(.*?)\n\}", f.read(), re.S).group(1)
    out = []
    for line in body.splitlines():
        line = line.split("//", 1)[0].strip().rstrip(",")
        name = line.split("=", 1)[0].strip()
        if name and name != "_COUNT" and re.fullmatch(r"[A-Z_0-9]+", name):
            out.append(name)
    return out


def port_image_constants():
    with open(PORT_IMAGES, encoding="utf-8") as f:
        return set(re.findall(r"static readonly ([A-Z_0-9]+)\s*=", f.read()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    args = ap.parse_args()

    items = parse_items()
    consts = image_constants()
    existing = port_item_ids()
    have_imgs = port_image_constants()
    rows = merged_rows()
    new = [i for i in items if i not in existing and i in rows]
    no_row = sorted(i for i in items if i not in existing and i not in rows)

    print("C# item models parsed  %d" % len(items))
    print("port already has       %d" % len(existing))
    print("new, and backed by a merged CSV row   %d" % len(new))
    print("new in C# but with no CSV row         %d  (reported, not emitted)" % len(no_row))
    by_why = {}
    for i in no_row:
        by_why.setdefault(items[i]["type"], []).append(i)
    for t in sorted(by_why):
        print("    %-14s %2d  %s" % (t, len(by_why[t]),
                                    ", ".join(sorted(by_why[t])[:3]) +
                                    (" ..." if len(by_why[t]) > 3 else "")))

    def bucket(ident):
        return ident.split("_", 1)[0]

    simple = [i for i in new if bucket(i) in SIMPLE_MAPS]
    hard = [i for i in new if bucket(i) not in SIMPLE_MAPS]
    by_need = {}
    for i in hard:
        by_need.setdefault(items[i]["type"], []).append(i)

    print("\nemittable now (%s): %d" % (", ".join(sorted(SIMPLE_MAPS)), len(simple)))
    for b in sorted(SIMPLE_MAPS):
        print("  %-6s %d" % (b, len([i for i in simple if bucket(i) == b])))
    print("\nnot emittable -- each needs a field the C# states per item: %d" % len(hard))
    for t in sorted(by_need):
        print("  %-14s %2d   %s" % (t, len(by_need[t]), NEEDS.get(t, "?")))
    print("\n  No ItemID is emitted for these. An enum member with no model is a")
    print("  hole in `this.models`, which model-data-binding.test.ts now fails on,")
    print("  so each id arrives together with the map entry that gives it a model.")

    needed_imgs = sorted({items[i]["img"] for i in new})
    add_imgs = [c for c in needed_imgs if c not in have_imgs]
    print("\nGameImages constants: %d referenced, %d new" % (len(needed_imgs), len(add_imgs)))
    missing = [c for c in add_imgs if c not in consts]
    if missing:
        sys.exit("no C# constant for: %s" % missing)

    if not args.emit:
        print("\nre-run with --emit for the TypeScript")
        return

    print("\n/* ---- ItemID: only the emittable ones, see above ---- */")
    for n, ident in enumerate(simple, start=len(existing)):
        print("  %s = %d," % (ident, n))

    print("\n/* ---- GameImages: only the sprites those need ---- */")
    simple_imgs = sorted({items[i]["img"] for i in simple})
    for c in simple_imgs:
        if c not in have_imgs:
            print('  static readonly %s = "%s";' % (c, consts[c]))

    for prefix, mapname in sorted(SIMPLE_MAPS.items()):
        rows = [i for i in simple if bucket(i) == prefix]
        if not rows:
            continue
        print("\n/* ---- %s ---- */" % mapname)
        for ident in rows:
            print("      %s: { id: ItemID.%s, img: GameImages.%s },"
                  % (ident, ident, items[ident]["img"]))


if __name__ == "__main__":
    main()
