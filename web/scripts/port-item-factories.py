#!/usr/bin/env python3
"""
Port the fork's `MakeItem*` factories into the TypeScript `BaseMapGenerator`.

    python3 scripts/port-item-factories.py            # report only
    python3 scripts/port-item-factories.py --emit     # print the TS

WHY A SCRIPT

The fork has 140 `MakeItemX()` helpers and the port 56, and their bodies are
almost all one line:

    public Item MakeItemKatana() { return new ItemMeleeWeapon(m_Game.GameItems.KATANA); }

Transcribed by hand that is 60-odd near-identical methods where a slip is
invisible -- a katana that spawns as a ranged weapon, a glowstick with no light
source. Here the item class and the model reference are both read out of the
text.

WHY THE PORT HAS FACTORIES AT ALL

It has no counterpart to port *from*: the C# constructs items inline. The
`makeItem*` convention is the port's own, and the fork grew the same shape
(`MakeItem*`, PascalCase) alongside it, so the two line up by name.

WHAT IS EMITTED, AND WHAT IS REPORTED

The regular bodies: a bare `new ItemX(...)`, a `Quantity` roll, a constant
`Quantity`, `IsForbiddenToAI = true`, and perishable food's `freshUntil` -- the
last already having a shape in `makeItemGroceries`.

Reported rather than emitted: anything whose model does not exist here yet
(the 6 `Ammo` ids and the 5 backpacks, both deliberately left out of Stage 3),
and the handful of `switch`-on-a-roll bodies, which are content decisions about
what a "random antique weapon" is rather than transliterations.
"""

import argparse
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FORK = os.path.join(REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive")
CS = os.path.join(FORK, "Gameplay", "Generators", "BaseMapGenerator.cs")
PORT = os.path.join(REPO, "web", "src", "gameplay", "generators", "BaseMapGenerator.ts")

METHOD_RE = re.compile(
    r"public Item (MakeItem[A-Za-z0-9]+)\(\)\s*\{(?P<body>.*?)\n\s*\}", re.S)
# `new ItemMeleeWeapon(m_Game.GameItems.KATANA)` and the two-argument grenade
# form, which passes the primed model as well.
NEW_RE = re.compile(
    r"new (?P<cls>Item[A-Za-z]*)\((?P<args>[^)]*GameItems\.[A-Z_0-9]+[^)]*)\)")
ITEMREF_RE = re.compile(r"GameItems\.([A-Z_0-9]+)")
QUANTITY_ROLL_RE = re.compile(
    r"Quantity\s*=\s*m_Rules\.Roll\(\s*1\s*,\s*m_Game\.GameItems\.[A-Z_0-9]+\.StackingLimit\s*\)")
QUANTITY_CONST_RE = re.compile(r"Quantity\s*=\s*(\d+)")
FORBIDDEN_RE = re.compile(r"IsForbiddenToAI\s*=\s*true")
FRESH_RE = re.compile(
    r"int freshUntil = timeNow \+ \(?WorldTime\.TURNS_PER_DAY \* m_Game\.GameItems\."
    r"(?P<days_src>[A-Z_0-9]+)\.BestBeforeDays\)?;?")
COMMENT_RE = re.compile(r"//[^\n]*")

# Where the C# property name is a suffix of more than one `ItemID`, the choice is
# a decision and not an inference, so it is written down.
#
# `KATANA` is the instructive one: the fork's `MakeItemKatana` builds
# `GameItems.KATANA`, and a suffix match on `KATANA` also hits
# `UNIQUE_FAMU_FATARU_KATANA`, the sword you win from a unique NPC rather than a
# shop item. Taking the first match silently spawned the reward instead of the
# katana -- the exact class of mistake a generated line can make and a reader
# will not see, because every field is a valid item and it is only the wrong one.
OVERRIDES = {
    "KATANA": "MELEE_KATANA",
    "MACE": "MELEE_MACE",
    "KEYBOARD": "MELEE_KEYBOARD",
    # Same shape: the fork has an ordinary revolver alongside the Kolt's, and a
    # spear alongside an improvised one, and the C# property name for the
    # ordinary one is the bare noun.
    "REVOLVER": "RANGED_REVOLVER",
    "SPEAR": "MELEE_SPEAR",
}


def normalise(name):
    return re.sub(r"[^A-Z0-9]", "", name.upper())


def parse_cs():
    with open(CS, encoding="utf-8-sig", errors="replace") as f:
        cs = f.read()
    out = {}
    for m in METHOD_RE.finditer(cs):
        # Comments go per line and *before* the collapse. Joining first and
        # stripping after looks equivalent and is not: a body whose first line is
        # a `// FIXME` becomes a single line, and a line-wise `//[^\n]*` then eats
        # the entire method, which is how the twelve raw/cooked food factories
        # came out empty.
        body = " ".join(COMMENT_RE.sub("", ln).strip() for ln in m.group("body").splitlines())
        out[m.group(1)] = " ".join(body.split())
    return out


def port_factories():
    with open(PORT, encoding="utf-8") as f:
        ts = f.read()
    return set(normalise(m) for m in
               re.findall(r"makeItem[A-Za-z0-9]+\(", ts))


def port_item_ids():
    with open(os.path.join(REPO, "web", "src", "gameplay", "GameItems.ts"), encoding="utf-8") as f:
        block = re.search(r"export enum ItemID \{(.*?)\n\}", f.read(), re.S).group(1)
    out = {}
    for line in block.splitlines():
        line = line.split("//", 1)[0].strip().rstrip(",")
        name = line.split("=", 1)[0].strip()
        if name and name != "_COUNT" and re.fullmatch(r"[A-Z_0-9]+", name):
            out[normalise(name)] = name
    return out


def resolve_model(body, ids, which=0):
    """The ItemID a factory builds.

    Grenades pass two references -- the live model and its primed twin -- so the
    caller says which one it wants. `COOKED_HUMAN_FLESH` is a third case: the
    model is one item while the `BestBeforeDays` comes off another, which is why
    `FRESH_RE` captures the source separately instead of assuming it matches.

    An ambiguous suffix match returns None rather than the first hit, and the
    caller files the factory as unresolvable. Picking one is how a katana turns
    into a unique NPC's sword.
    """
    nm = NEW_RE.search(body)
    if not nm:
        return None
    refs = ITEMREF_RE.findall(nm.group("args"))
    if not refs or len(refs) <= which:
        return None
    csharp = refs[which]
    if csharp in OVERRIDES:
        return OVERRIDES[csharp]
    want = normalise(csharp)
    exact = [v for k, v in ids.items() if k == want]
    if len(exact) == 1:
        return exact[0]
    hits = sorted({v for k, v in ids.items() if k.endswith(want)})
    if len(hits) == 1:
        return hits[0]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--fixture", metavar="PATH",
                    help="write factory -> ItemID as JSON, for tests/ to pin against")
    args = ap.parse_args()

    bodies = parse_cs()
    have = port_factories()
    ids = port_item_ids()

    new = [k for k in bodies if normalise(k) not in have]
    emittable, no_model, complicated = [], [], []
    for name in sorted(new):
        raw = bodies[name]
        # Comments come out first. `MakeItemNightVisionGoggles` ends with
        # "//code under DoTakeItem() will switch to male type if required", and a
        # substring test for "switch" read that comment as a branch and filed a
        # two-line factory among the roll-and-branch ones.
        body = COMMENT_RE.sub("", raw)
        if re.search(r"\bswitch\s*\(", body):
            complicated.append(name)
            continue
        if resolve_model(body, ids) is None:
            no_model.append(name)
            continue
        emittable.append(name)

    print("C# factories parsed   %d" % len(bodies))
    print("port already has      %d" % len(have))
    print("new to add            %d" % len(new))
    print("\nemittable            %d" % len(emittable))
    print("no model here yet     %d   (Stage 4: the 6 Ammo ids, the 5 backpacks)" % len(no_model))
    print("roll-and-branch       %d   (content decisions, reported)" % len(complicated))
    for n in no_model:
        print("    %s" % n)
    for n in complicated:
        print("    %s" % n)

    if args.fixture:
        # A committed copy of which item each factory builds.
        #
        # `tests/item-factories.test.ts` can check that a factory *works* -- a
        # model behind it, a sprite on disk -- but not that it builds the *right*
        # one, and that is the mistake this script actually made: `KATANA` was
        # resolved by suffix match to `UNIQUE_FAMU_FATARU_KATANA`, the sword you
        # win from a unique NPC, spawned by a factory meant to hand out a shop
        # katana. Every field was a valid item and it was the wrong one, so no
        # test looking at the built object could see it.
        #
        # The values come from the C# plus this script's OVERRIDES, so the fixture
        # is the audit trail for those five decisions rather than a second place
        # they are written down.
        import json
        # Over every C# factory, not only the ones this run added: the fixture is
        # a contract for the whole set, and the vanilla 56 are already covered
        # by the same test. The nine whose C# property name is ambiguous are
        # skipped rather than guessed -- the port's own hand-written code is
        # their authority, and they predate the merge.
        payload = {}
        skipped = []
        for name in sorted(bodies):
            body = COMMENT_RE.sub("", bodies[name])
            if re.search(r"\bswitch\s*\(", body):
                skipped.append(name)
                continue
            model = resolve_model(body, ids)
            if model is None:
                skipped.append(name)
                continue
            payload["makeItem" + name[len("MakeItem"):]] = model
        with open(args.fixture, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
            f.write("\n")
        print("wrote %s (%d factories, %d skipped as ambiguous or roll-and-branch)"
              % (args.fixture, len(payload), len(skipped)))
        return

    if not args.emit:
        print("\nre-run with --emit for the TypeScript")
        return

    print("\n/* ---- factories ---- */")
    for name in emittable:
        body = COMMENT_RE.sub("", bodies[name])
        model = resolve_model(body, ids)
        nm = NEW_RE.search(body)
        cls = nm.group("cls") if nm else "Item"
        args = ITEMREF_RE.findall(nm.group("args")) if nm else []
        printer = name[0].lower() + name[1:]

        lines = []
        fresh = FRESH_RE.search(body)
        if cls == "ItemFood" and fresh:
            # Same shape as makeItemGroceries: perishable, so a freshUntil.
            lines.append("// FIXME: should be map local time. As makeItemGroceries.")
            lines.append("const timeNow = Session.get().worldTime.turnCounter;")
            lines.append("const model = Models.items.get(ItemID.%s) as ItemFoodModel;" % model)
            days_src = resolve_model(
                "new ItemFood(m_Game.GameItems.%s)" % fresh.group("days_src"), ids)
            if days_src and days_src != model:
                # COOKED_HUMAN_FLESH takes its shelf life from RAW_HUMAN_FLESH in
                # the C#, so the expiry is a different model's than the food's.
                lines.append("// C#: the shelf life comes off RAW_HUMAN_FLESH, not from")
                lines.append("// this item -- the quirk is preserved rather than tidied away.")
                lines.append("const life = (Models.items.get(ItemID.%s) as ItemFoodModel).bestBeforeDays;" % days_src)
                lines.append("const max = WorldTime.TURNS_PER_DAY * life;")
            else:
                lines.append("const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;")
            lines.append("const min = Math.floor(max / 2);")
            lines.append("const freshUntil = timeNow + this.m_Rules.roll(min, max);")
            lines.append("return new ItemFood(model, freshUntil);")
        else:
            extra = []
            if len(args) >= 2:
                # Any two-reference constructor: `ItemGrenade` for the ordinary
                # explosives and `ItemExplosive` for C4, which the C# also keeps
                # as a distinct class (and the port, where ItemGrenade extends
                # ItemExplosive). The class is preserved rather than normalised,
                # because it decides how the primed model behaves.
                # The second C# reference is the primed twin. It has no CSV row
                # of its own -- it is built in code, like vanilla's
                # EXPLOSIVE_GRENADE_PRIMED -- and the id is `<live>_PRIMED`.
                call = ("new %s(Models.items.get(ItemID.%s), Models.items.get(ItemID.%s))"
                        % (cls, model, resolve_model(body, ids, 1) or (model + "_PRIMED")))
            else:
                call = "new %s(Models.items.get(ItemID.%s))" % (cls, model)

            # `call` re-looks-up the model; when a `model` const is needed for
            # the quantity, build the call from it instead of declaring a const
            # nothing reads.
            needs_model = bool(QUANTITY_ROLL_RE.search(body) or QUANTITY_CONST_RE.search(body))
            if needs_model:
                lines.append("const model = Models.items.get(ItemID.%s);" % model)
                lines.append("const item = %s;" % call.replace(
                    "Models.items.get(ItemID.%s)" % model, "model"))
            else:
                lines.append("const item = %s;" % call)

            if QUANTITY_ROLL_RE.search(body):
                lines.append("item.quantity = this.m_Rules.roll(1, model.stackingLimit);")
            else:
                q = QUANTITY_CONST_RE.search(body)
                if q:
                    lines.append("item.quantity = %s;" % q.group(1))
            if FORBIDDEN_RE.search(body):
                lines.append("item.isForbiddenToAI = true;")
            lines.append("return item;")
        print("  %s(): Item {" % printer)
        for l in lines:
            print("    " + l.strip())
        print("  }")
        print()


if __name__ == "__main__":
    main()
