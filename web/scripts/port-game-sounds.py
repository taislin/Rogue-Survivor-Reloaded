#!/usr/bin/env python3
"""
Transcribe the fork's sound-effect table into TypeScript, and pin it for tests.

    python3 scripts/port-game-sounds.py                  # report
    python3 scripts/port-game-sounds.py --emit           # print the TS block
    python3 scripts/port-game-sounds.py --fixture web/tests/fixtures/still-alive-sounds.json

WHY A SCRIPT AND NOT 180 HAND EDITS

`GameSounds.cs` is 181 pairs of `public const string NAME = "some id";` and
`public const string NAME_FILE = PATH + "some-file";`. Transcribing those by hand
is exactly the work that produces a table which type-checks, resolves, and is
silent at runtime: a mistyped file name is a 404 the player hears as nothing,
and nothing in this repository would report it. So the table is parsed and
emitted, and the C#'s own text is committed as a JSON fixture that
`tests/extended-audio.test.ts` compares the TypeScript against -- every id and
every file name, in C# order, both directions. A transcription error fails a test
rather than a play call.

The emit is deliberately *not* the whole of `GameSounds.ts`: the three vanilla
ids the port already had are kept where they are (see `SKIP`), because Classic
must be provably unchanged and `NIGHTMARE` is a pair both versions declare
verbatim.

WHY THE FILE NAMES ARE COPIED AS THEY ARE

`AssetPaths.soundPath` resolves an id through `SOUND_FILES` and appends `.ogg`,
so the file on disk has to be named exactly what the C#'s `*_FILE` constant
says. The fork's `Resources/Sfx/` already uses that convention for the three
files the port already had (`sfx - nightmare.ogg`, `sfx - undead eat nearby.ogg`),
so there is nothing to rename -- the thing BROWSER_PORT_PLAN 5.6f item 1 warns
about ("the fork's 180 new files use a different convention") is not true of the
file names, only of the fact that the *vanilla* `sfx - undead eat.ogg` was split
into `sfx - undead eat player` / `sfx - undead eat nearby` by the fork.
"""

import argparse
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FORK = os.path.join(REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive")
CS = os.path.join(FORK, "Gameplay", "GameSounds.cs")
SFX_DIR = os.path.join(FORK, "Resources", "Sfx")

# `NAME = "id";` or `NAME_FILE = PATH + "file";`, with any trailing `//` comment.
CONST_RE = re.compile(
    r'public const string (?P<name>[A-Z0-9_]+) = '
    r'(?:"(?P<id>[^"]*)"|PATH \+ "(?P<file>[^"]*)")\s*;\s*(?P<tail>.*)$'
)
# The fork annotates its additions with the release that introduced them, in the
# form `//@@MP (Release 7-6)`; the label is kept verbatim because two of them
# carry a "why" the port has to record (`- relocated from music to sfx`).

# Pairs the port already declares with the identical id and file, so emitting them
# again would be a duplicate member. `NIGHTMARE` is the only one of the three that
# the fork also declares; the other two (`UNDEAD_EAT`, `UNDEAD_RISE`) are not in
# `GameSounds.cs` at all, because the fork renamed them per distance tier.
SKIP = {"NIGHTMARE"}


def parse():
    """The C#'s (name, id, file) pairs in declaration order."""
    with open(CS, encoding="utf-8-sig") as f:
        lines = f.read().split("\n")

    entries = []
    release = None
    pending_note = None
    for n, line in enumerate(lines, start=1):
        m = CONST_RE.search(line)
        if not m:
            stripped = line.strip()
            if "//@@MP" in stripped:
                # A release marker, possibly with a `// note` in front of it: the
                # fork writes `//06 was removed. too low quality //@@MP (Release
                # 7-4)`, and both halves have to survive.
                head, _, tail = stripped.partition("//@@MP")
                release = tail.strip().lstrip("-").strip()
                pending_note = (head.strip().lstrip("/").strip(), n) if head.strip().startswith("//") else None
            elif stripped.startswith("//") and not stripped.startswith("///"):
                pending_note = (stripped.lstrip("/").strip(), n)
            continue

        name = m.group("name")
        entry = {
            "name": name,
            "line": n,
            "release": release,
            "note": pending_note,
            "id": m.group("id"),
            "file": m.group("file"),
            "tail": m.group("tail").strip(),
        }
        pending_note = None
        if name.endswith("_FILE"):
            # Attach to the id declared immediately above; a `_FILE` with no id
            # is a pair the port cannot express, so it is reported, not dropped.
            owner = name[: -len("_FILE")]
            if not entries or entries[-1]["name"] != owner:
                sys.stderr.write("orphan %s at line %d\n" % (name, n))
                continue
            entries[-1]["file"] = entry["file"]
        else:
            if entry["id"] is None:
                sys.stderr.write("id-less %s at line %d\n" % (name, n))
                continue
            entries.append(entry)
    return [e for e in entries if e["file"] is not None]


def emit(entries):
    """The TS block: C# order, release markers as section comments."""
    out = []
    release = object()
    for e in entries:
        if e["name"] in SKIP:
            continue
        if e["release"] != release:
            release = e["release"]
            if release is not None:
                out.append("")
                out.append("  // @@MP %s (GameSounds.cs:%d)" % (release, e["line"]))
        if e["note"]:
            out.append("  // C# GameSounds.cs:%d: %s" % (e["note"][1], e["note"][0]))
        out.append('  static readonly %s = "%s";' % (e["name"], e["id"]))
        out.append(
            "  static readonly %s_FILE = `${GameSounds.PATH}%s`;" % (e["name"], e["file"])
        )
    return "\n".join(out)


def emit_files(entries):
    """The `SOUND_FILES` rows, same order, so the two can be diffed by eye."""
    return "\n".join(
        "  [GameSounds.%s]: \"%s\"," % (e["name"], e["file"])
        for e in entries
        if e["name"] not in SKIP
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true", help="print the TS class block")
    ap.add_argument("--emit-files", action="store_true", help="print the SOUND_FILES rows")
    ap.add_argument("--fixture", metavar="PATH", help="write the C# pairs as JSON")
    args = ap.parse_args()

    entries = parse()
    on_disk = {f[: -len(".ogg")] for f in os.listdir(SFX_DIR) if f.endswith(".ogg")}
    named = {e["file"] for e in entries}

    if args.fixture:
        payload = {
            "source": "Rogue Survivor Still Alive/Gameplay/GameSounds.cs",
            "note": (
                "The C#'s own id/file pairs, in declaration order. Committed "
                "rather than read from _refs/ because that directory is "
                "gitignored, so a test that opened GameSounds.cs would pass "
                "locally and fail in CI. Regenerate with "
                "scripts/port-game-sounds.py --fixture."
            ),
            "entries": [
                {
                    "name": e["name"],
                    "id": e["id"],
                    "file": e["file"],
                    "line": e["line"],
                    "release": e["release"],
                    "note": e["note"][0] if e["note"] else None,
                }
                for e in entries
            ],
        }
        with open(args.fixture, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print("wrote %s (%d pairs)" % (args.fixture, len(entries)))

    if args.emit:
        print(emit(entries))
        return

    if args.emit_files:
        print(emit_files(entries))
        return

    print("%d pairs, %d new after skipping %s" % (len(entries), len(entries) - len(SKIP), ", ".join(sorted(SKIP))))
    missing = sorted(named - on_disk)
    print("named by the C# with no .ogg in Resources/Sfx: %s" % (missing or "none"))
    orphans = sorted(on_disk - named)
    print("on disk with no constant: %s" % (orphans or "none"))
    dupes = [n for n in named if sum(1 for e in entries if e["file"] == n) > 1]
    print("file names claimed by two ids: %s" % (sorted(set(dupes)) or "none"))


if __name__ == "__main__":
    main()
