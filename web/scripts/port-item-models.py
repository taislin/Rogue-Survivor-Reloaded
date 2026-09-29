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
UNBREAKABLE_RE = re.compile(r"IsUnbreakable\s*=\s*true")
# `ItemLightModel(name, plural, img, FOV, batteries, outImg)` -- the burnt-out
# sprite is the sixth argument, and it is the *same* image for four of the six
# lights, so it can be assumed either way and has to be read.
#
# Two arguments sit between the two images: FOV and the battery count. Counting
# them wrong matches nothing at all, which is the failure this comment exists to
# head off -- the first version had three and reported "no burnt-out image found"
# for all four lights that legitimately share one.
LIGHT_OUT_RE = re.compile(
    r"new ItemLightModel\([^;]*?GameImages\.[A-Z_0-9]+,\s*[^,]+,\s*[^,]+,\s*"
    r"GameImages\.(?P<out>[A-Z_0-9]+)\s*\)"
)
ISPLURAL_RE = re.compile(r"IsPlural\s*=\s*(true|false)")
# `ItemSprayPaintModel(name, plural, img, quantity, tagImg)`
TAGIMG_RE = re.compile(
    r"new ItemSprayPaintModel\([^;]*?GameImages\.[A-Z_0-9]+\s*,\s*[^,]+,\s*"
    r"GameImages\.(?P<tag>[A-Z_0-9]+)\s*\)"
)
# `BlastAttack(radius, damage, canDamageObjects, canDestroyWalls, isProvocative)`.
# The port's BlastAttack has the first four and no `isProvocative`, so the third
# flag is read and deliberately not emitted -- it drives Stage 4's AI reaction.
BLAST_RE = re.compile(
    r"new BlastAttack\([^,]+,[^,]+,\s*(true|false)\s*,\s*(true|false)(?:\s*,\s*(?:true|false))?\s*\)"
)
CONST_RE = re.compile(r'public const string (?P<name>[A-Z_0-9]+)\s*=\s*@"([^"]+)"')

# The maps whose whole value the C# determines mechanically. Everything else is
# reported rather than guessed at.
#
# `EMITTABLE` is not "easy", it is "the C# states every field this map needs in a
# place a regex can reach". Melee looks hard -- a hand-written verb per weapon --
# but `new Verb("slash", "slashes")` sits in the same initialiser as the sprite,
# so it is read rather than typed. The five new `IsUnbreakable` weapons live
# here too, which is the detail most likely to be lost by eye.
EMITTABLE = {
    "Food": "foodMap",
    "Entertainment": "entMap",
    "Trap": "trapMap",
    "MeleeWeapon": "meleeMap",
    "RangedWeapon": "rangedMap",
    "BodyArmor": "armorMap",
    "Light": "lightMap",
    "Medicine": "medMap",
    "SprayPaint": "paintMap",
    "Grenade": "explosiveMap",
}

# The id prefix -> (map name, C# model type), because the C# type is what the
# parser keys on and the prefix is what the CSV rows are keyed by.
PREFIX_TO_TYPE = {
    "FOOD": "Food",
    "ENT": "Entertainment",
    "TRAP": "Trap",
    "MELEE": "MeleeWeapon",
    "RANGED": "RangedWeapon",
    "ARMOR": "BodyArmor",
    "LIGHT": "Light",
    "MEDICINE": "Medicine",
    "BACKPACK": "Backpack",
    "SPRAY": "SprayPaint",
    "EXPLOSIVE": "Grenade",
    "PAINT": "SprayPaint",
    "FIRE": "SprayPaint",
}

# What each remaining type needs, for the report. Keys are the `Item<Y>Model`
# names as they appear in the C#.
NEEDS = {
    "Medicine": "img + `plural`, which the C# computes per row with CheckPlural",
    "SprayPaint": "img + `tagImg` (a second GameImages.* that varies per can)",
    "Grenade": "img + the blast array, which is built outside the item table",
    "Backpack": "no map at all -- inv slots drive a doll rule the port lacks",
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


def chunk_of(text, start, limit=1200):
    """The text from one `this[IDs.` up to the next, so a per-item flag cannot
    be read off a neighbour."""
    nxt = text.find("this[IDs.", start + 1)
    return text[start: nxt if nxt != -1 else start + limit]


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
        light_out = LIGHT_OUT_RE.search(text[m.start(): m.start() + 500])
        tagimg = TAGIMG_RE.search(text[m.start(): m.start() + 500])
        blast = BLAST_RE.search(chunk_of(text, m.start()))
        plural = ISPLURAL_RE.search(tail)
        found[ident] = {
            "type": m.group("type"),
            "img": m.group("img"),
            "equip": equip.group(1) if equip else None,
            "verb": [verb.group(1), verb.group(2)] if verb else None,
            "ammo": ammo.group(1) if ammo else None,
            "unbreakable": bool(UNBREAKABLE_RE.search(tail)),
            "outImg": light_out.group("out") if light_out else None,
            "tagImg": tagimg.group("tag") if tagimg else None,
            # Absent IsPlural means the C# left `bool m_IsPlural` at its
            # default, which is false -- so this is a read, not a guess.
            "plural": (plural.group(1) == "true") if plural else False,
            "dmgObjects": (blast.group(1) == "true") if blast else None,
            "destroyWalls": (blast.group(2) == "true") if blast else None,
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
        return PREFIX_TO_TYPE.get(ident.split("_", 1)[0], ident.split("_", 1)[0])

    def by_type(t):
        return [i for i in new if items[i]["type"] == t]

    emittable, hard = [], []
    by_need = {}
    for i in new:
        t = items[i]["type"]
        if t in EMITTABLE:
            emittable.append(i)
        else:
            hard.append(i)
            by_need.setdefault(t, []).append(i)

    print("\nemittable: %d" % len(emittable))
    for t in sorted(EMITTABLE):
        rows = by_type(t)
        if rows:
            extra = ""
            if t == "MeleeWeapon":
                extra = "  (%d IsUnbreakable)" % len([i for i in rows if items[i]["unbreakable"]])
            if t == "RangedWeapon":
                extra = "  (%d IsUnbreakable)" % len([i for i in rows if items[i]["unbreakable"]])
            if t == "Light":
                extra = "  (%d share the burnt-out sprite)" % len(
                    [i for i in rows if items[i]["outImg"] == items[i]["img"]])
            print("  %-14s %2d -> %s%s" % (t, len(rows), EMITTABLE[t], extra))
    print("\nnot emittable: %d" % len(hard))
    for t in sorted(by_need):
        print("  %-14s %2d   %s" % (t, len(by_need[t]), NEEDS.get(t, "?")))
    print("\n  No ItemID is emitted for these. An enum member with no model is a")
    print("  hole in `this.models`, which model-data-binding.test.ts now fails on,")
    print("  so each id arrives together with the map entry that gives it a model.")

    # Anything emittable but missing a field the map needs is a hard error, not a
    # silently-short entry -- the whole point is that a flag comes from the text.
    problems = []
    for i in emittable:
        d = items[i]
        t = d["type"]
        if t in ("MeleeWeapon", "RangedWeapon") and not d["verb"]:
            problems.append("%s: no verb found" % i)
        if t == "RangedWeapon" and not d["ammo"]:
            problems.append("%s: no AmmoType found" % i)
        if t == "BodyArmor" and not d["equip"]:
            problems.append("%s: no EquipmentPart found" % i)
        if t == "Light" and not d["outImg"]:
            problems.append("%s: no burnt-out image found" % i)
        if t == "SprayPaint" and not d["tagImg"]:
            problems.append("%s: no tag image found" % i)
        if t == "Grenade" and d["dmgObjects"] is None:
            problems.append("%s: no BlastAttack flags found" % i)
    if problems:
        sys.exit("incomplete extraction, refusing to emit:\n  " + "\n  ".join(problems))

    needed_imgs = sorted({items[i]["img"] for i in emittable}
                         | {items[i]["outImg"] for i in emittable if items[i]["outImg"]})
    add_imgs = [c for c in needed_imgs if c not in have_imgs]
    print("\nGameImages constants: %d referenced, %d new" % (len(needed_imgs), len(add_imgs)))
    missing = [c for c in add_imgs if c not in consts]
    if missing:
        sys.exit("no C# constant for: %s" % missing)

    ammos = sorted({items[i]["ammo"] for i in emittable if items[i]["ammo"]})
    if ammos:
        print("AmmoType values used: %s" % ", ".join(ammos))

    if not args.emit:
        print("\nre-run with --emit for the TypeScript")
        return

    print("\n/* ---- ItemID: only the emittable ones, see above ---- */")
    for n, ident in enumerate(emittable, start=len(existing)):
        print("  %s = %d," % (ident, n))

    print("\n/* ---- GameImages ---- */")
    for c in add_imgs:
        print('  static readonly %s = "%s";' % (c, consts[c]))

    for t in sorted(EMITTABLE):
        rows = [i for i in emittable if items[i]["type"] == t]
        if not rows:
            continue
        print("\n/* ---- %s ---- */" % EMITTABLE[t])
        for ident in rows:
            d = items[ident]
            if t in ("Food", "Entertainment", "Trap"):
                print("      %s: { id: ItemID.%s, img: GameImages.%s },"
                      % (ident, ident, d["img"]))
            elif t == "MeleeWeapon":
                verb = '["%s", "%s"]' % (d["verb"][0], d["verb"][1]) if d["verb"][1] \
                    else '["%s"]' % d["verb"][0]
                print("      %s: { id: ItemID.%s, img: GameImages.%s, verb: %s%s },"
                      % (ident, ident, d["img"], verb,
                         ", unique: true" if d["unbreakable"] else ""))
            elif t == "RangedWeapon":
                verb = '["%s", "%s"]' % (d["verb"][0], d["verb"][1]) if d["verb"][1] \
                    else '["%s"]' % d["verb"][0]
                print("      %s: { id: ItemID.%s, img: GameImages.%s, ammo: AmmoType.%s, "
                      "verb: %s%s }," % (ident, ident, d["img"], d["ammo"], verb,
                                         ", unique: true" if d["unbreakable"] else ""))
            elif t == "BodyArmor":
                print("      %s: { id: ItemID.%s, img: GameImages.%s, slot: DollPart.%s },"
                      % (ident, ident, d["img"], d["equip"]))
            elif t == "Light":
                print("      %s: { id: ItemID.%s, img: GameImages.%s, outImg: GameImages.%s },"
                      % (ident, ident, d["img"], d["outImg"]))
            elif t == "Medicine":
                print("      %s: { id: ItemID.%s, img: GameImages.%s, plural: %s },"
                      % (ident, ident, d["img"], str(d["plural"]).lower()))
            elif t == "SprayPaint":
                print("      %s: { id: ItemID.%s, img: GameImages.%s, tagImg: GameImages.%s },"
                      % (ident, ident, d["img"], d["tagImg"]))
            elif t == "Grenade":
                print("      %s: { id: ItemID.%s, img: GameImages.%s, "
                      "canDamageObjects: %s, canDestroyWalls: %s },"
                      % (ident, ident, d["img"],
                         str(d["dmgObjects"]).lower(), str(d["destroyWalls"]).lower()))


if __name__ == "__main__":
    main()
