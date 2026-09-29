#!/usr/bin/env python3
"""
Merge the Still Alive content tables into one superset, under `web/data/`.

    python3 scripts/merge-content-tables.py

WHY A SEPARATE DIRECTORY. `convert-csv.js` reads its CSVs from
`src/Resources/Data/`, which is the C# project's own resource tree. This project
never modifies `src/` — it is the statement of intent the whole port is written
against, and the C# game reads those same CSVs, so editing them would change
what "Alpha 10.1" means here. The merged tables therefore land in `web/data/`,
which is the source for the TypeScript tables and nothing else, and
`convert-csv.js --from` points at it.

WHY A MERGE AND NOT A REPLACEMENT. The design in BROWSER_PORT_PLAN §5.6a is one
*superset* content pack plus a ruleset flag, and a superset has to be built out
of the union rather than out of either side. Copying the fork's tables would
change thirteen item rows' numbers — army ration nutrition 0.25 to 0.33,
best-before 5 days to never, and so on — which is Still Alive's balance pass and
belongs behind the flag in Stage 4, not in the data layer that both rulesets
read. So: **our rows keep our values, and the fork's rows are added alongside.**

The one thing unioned is the column header, and it is close to free. The fork's
headers are a strict superset of ours in four tables (`WEIGHT` on melee and
ranged, `FIRE_RESIST%`/`INF_RESIST%` on armors, two boolean columns on food) and
a subset everywhere else, so a vanilla row just gets 0 for the columns it did not
have — which is what the fork itself puts on an item with no fire or infection
resistance.

Id collisions are an error, not a merge. If both trees define an id, picking a
winner would be a balance decision made by a data script, and the two sides
disagree about it: `MEDICINE_MEDIKIT` is one of the handful the fork renamed.
That is a Stage 4 decision, so this script stops and says so rather than
guessing.
"""

import csv
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VANA = os.path.join(REPO, "src", "Resources", "Data")
FORK = os.path.join(
    REPO, "_refs", "StillAlive-master", "Rogue Survivor Still Alive", "Resources", "Data"
)
OUT = os.path.join(REPO, "web", "data")

# For a column the vanilla table does not have, this is the value its existing
# rows get.
DEFAULT_FOR_MISSING = "0"

# The fork inherits the C# tree's files verbatim, including their bytes.
ENCODINGS = {"Items_Traps.csv": "latin-1"}


def read_table(path, name):
    """Returns (header, {id: row}), where `row` is aligned to `header`."""
    enc = ENCODINGS.get(name, "utf-8-sig")
    with open(path, newline="", encoding=enc) as f:
        rows = list(csv.reader(f))
    rows = [r for r in rows if r and any(c.strip() for c in r)]
    header = [c.strip() for c in rows[0]]
    out = {}
    for r in rows[1:]:
        rec = dict(zip(header, r))
        key = rec.get("ID", "").strip().strip('"')
        if key:
            out[key] = r
    return header, out


def main():
    if not os.path.isdir(FORK):
        sys.exit(
            "fork tables not found at %s\n"
            "The audit in STILL_ALIVE_REFERENCE.md was done against that tree; "
            "this script cannot reproduce it without it." % FORK
        )
    os.makedirs(OUT, exist_ok=True)

    vanilla_files = [f for f in os.listdir(VANA) if f.endswith(".csv")]
    fork_files = [f for f in os.listdir(FORK) if f.endswith(".csv")]
    names = sorted(vanilla_files) + sorted(set(fork_files) - set(vanilla_files))

    for name in names:
        vanilla_path = os.path.join(VANA, name)
        if os.path.exists(vanilla_path):
            vanilla_header, vanilla_rows = read_table(vanilla_path, name)
        else:
            # A table only the fork has (`Items_Backpacks.csv`). Taken whole: there
            # is nothing to merge it with.
            vanilla_header, vanilla_rows = [], {}
        fork_path = os.path.join(FORK, name)
        if os.path.exists(fork_path):
            fork_header, fork_rows = read_table(fork_path, name)
        else:
            fork_header, fork_rows = [], {}

        # A column the fork *renamed* rather than added. `Items_Traps.csv` has
        # `DESACTIVATES WHEN TRIGGERED?` and the fork fixed the typo to
        # `DEACTIVATES ...`. Treating that as an added column would append a
        # duplicate 17th field, and the converter binds by position, so the
        # table would carry "deactivates when triggered" twice.
        #
        # Renames are inferred by position, and only when the two headers are the
        # same length. If the fork had *inserted* a column, position 8 in the
        # fork would not be position 8 in ours, and a positional guess would
        # silently move real data — whereas in that case name matching already
        # covers every column and no rename needs inferring.
        rename = {}
        if vanilla_header and len(fork_header) == len(vanilla_header):
            for i, col in enumerate(fork_header):
                if col not in vanilla_header:
                    rename[col] = vanilla_header[i]

        # Column order: the fork's, when it covers everything we have.
        #
        # Not cosmetic. `convert-csv.js` binds columns *positionally* and its
        # `COLUMNS` map has to be edited to match, and `FLAVOR`-last is a
        # convention in both trees. The fork puts its added columns *before*
        # `FLAVOR` (`... WEIGHT, FIRE_RESIST%, INF_RESIST%, FLAVOR`), so taking
        # its order puts the new columns where both trees expect them; appending
        # them to ours would leave `FLAVOR` stranded in the middle.
        if fork_header and all(c in fork_header for c in vanilla_header):
            header = list(fork_header)
        else:
            header = list(vanilla_header)
            for col in fork_header:
                # A renamed column is already in `header` under its old name.
                if col not in header and col not in rename:
                    header.append(col)
        added_cols = [c for c in header if c not in vanilla_header] if vanilla_header else []

        # Adopt the fork's spelling for renamed columns, so the table carries the
        # corrected name rather than ours. Values are still looked up under the
        # old name, which is what `rename` is for.
        header = [next((new for new, old in rename.items() if old == c), c) for c in header]

        # A shared id is not a conflict. It is the same actor or the same item in
        # both trees, and where the two disagree the answer is *ours* — because a
        # superseded value is a Stage 4 balance decision, and taking the fork's
        # would change classic's thirteen rebalanced rows at the data layer that
        # both rulesets read.
        #
        # But "ours wins" must not mean "silently". Every row that differs is
        # listed, because a difference here is either a rebalance to lift in
        # Stage 4 or a *rename* the fork did (`MEDICINE_MEDIKIT` became
        # `MEDICINE_LARGE_MEDIKIT`), and both are things a reader needs to see
        # rather than discover later in a diff.
        differing = []
        for ident in sorted(set(vanilla_rows) & set(fork_rows)):
            v, f = vanilla_rows[ident], fork_rows[ident]
            vcells = {c: v[i] for i, c in enumerate(vanilla_header) if i < len(v)}
            fcells = {c: f[i] for i, c in enumerate(fork_header) if i < len(f)}
            changed = sorted(
                c for c in fcells
                if c in vcells and vcells[c] != fcells[c]
            )
            if changed:
                differing.append((ident, changed))

        added_rows = [i for i in fork_rows if i not in vanilla_rows]

        # Each row travels with the header it was read against. A row is a bare
        # list, so without that pairing a new column could be read from the wrong
        # offset: the fork's `WEIGHT` is column 12 and vanilla's `FLAVOR` is
        # column 12, and nothing about the list says which is which.
        merged = [(vanilla_header, vanilla_rows[i]) for i in vanilla_rows]
        merged += [(fork_header, fork_rows[i]) for i in added_rows]

        with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\n")
            w.writerow(header)
            for src_header, row in merged:
                cells = {c: (row[i] if i < len(row) else "") for i, c in enumerate(src_header)}
                out = []
                for col in header:
                    if col in cells:
                        out.append(cells[col])
                    elif col in rename and rename[col] in cells:
                        out.append(cells[rename[col]])
                    else:
                        out.append(DEFAULT_FOR_MISSING)
                w.writerow(out)

        for col, old in sorted(rename.items()):
            print("      renamed column: %r -> %r" % (old, col))

        print(
            "%-24s %3d -> %3d rows (+%d)%s"
            % (
                name,
                len(vanilla_rows),
                len(merged),
                len(added_rows),
                ("  +cols: " + ", ".join(added_cols)) if added_cols else "",
            )
        )
        for ident, changed in differing:
            print("      %s differs on: %s" % (ident, ", ".join(changed)))


if __name__ == "__main__":
    main()
