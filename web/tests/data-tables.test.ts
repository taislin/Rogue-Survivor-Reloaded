import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The CSV -> JSON data tables must stay in sync with their source CSVs.
 *
 * The bug this guards: `scripts/convert-csv.js` used the raw CSV header cell as
 * the JSON key, so any column whose header spelled out a unit or asked a
 * question produced a key nobody reads -- "NUTRITION ratio of base food
 * points", "BATTERIES in hours", "ACTIVATES WHEN DROPPED?". Nothing threw:
 * `GameItems` reads the rows as `any`, so `d.NUTRITION` was simply `undefined`
 * and food restored no nutrition, lights had no battery life, and every trap
 * flag was false. The values were right in the file and wrong in the game.
 *
 * The trap was that `d.VERB` and friends also "worked", so the reads looked
 * fine. Hence these assertions are on the *files*, not on the runtime: they
 * fail when a CSV gains a column, loses one, or gets re-ordered, and when a
 * committed JSON falls behind its CSV.
 */

const repoRoot = resolve(__dirname, "../..");
// The merged superset, which is what `convert-csv.js` reads by default. The
// vanilla tree in `src/Resources/Data` is never modified -- it is the C# game's
// own resource directory and the statement of intent this port is written
// against -- so it is only read by the "classic did not regress" test below.
const csvDir = resolve(repoRoot, "web/data");
const vanillaCsvDir = resolve(repoRoot, "src/Resources/Data");
const jsonDir = resolve(repoRoot, "web/src/gameplay/data");

/**
 * The C# tree's own files, which are not valid UTF-8: `Items_Traps.csv` has a
 * stray 0xA0 before a "?" in one FLAVOR cell. The merge reads these as latin-1
 * and writes UTF-8, so the merged table is valid UTF-8 and needs no special
 * handling here. This map only applies to the read-only `src/` side.
 */
const VANILLA_ENCODINGS: Record<string, BufferEncoding> = {
  "Items_Traps.csv": "latin1",
};

/** The canonical column names, mirroring `COLUMNS` in convert-csv.js. */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  "Actors.json": ["ID", "NAME", "PLURAL", "SPD", "HP", "STA", "ATK", "DMG", "DEF", "PRO_HIT", "PRO_SHOT", "FOV", "AUDIO", "SMELL", "SCORE", "FLAVOR"],
  "Items_Armors.json": ["ID", "NAME", "PLURAL", "PRO_HIT", "PRO_SHOT", "ENC", "WEIGHT", "FIRE_RESIST", "INF_RESIST", "FLAVOR"],
  "Items_Backpacks.json": ["ID", "NAME", "PLURAL", "INV_SLOTS", "ENC", "WEIGHT", "FLAVOR"],
  "Items_Barricading.json": ["ID", "NAME", "PLURAL", "VALUE", "STACKINGLIMIT", "FLAVOR"],
  "Items_Entertainment.json": ["ID", "NAME", "PLURAL", "STACKING", "VALUE", "BORE_CHANCE", "FLAVOR"],
  "Items_Explosives.json": ["ID", "NAME", "PLURAL", "FUSE", "MAXTHROW", "STACKINGLIMIT", "RADIUS", "BLAST0", "BLAST1", "BLAST2", "BLAST3", "BLAST4", "BLAST5", "FLAVOR"],
  "Items_Food.json": ["ID", "NAME", "PLURAL", "NUTRITION", "BESTBEFORE", "STACKINGLIMIT", "CAUSES_POISON", "CAN_BE_COOKED", "FLAVOR"],
  "Items_Lights.json": ["ID", "NAME", "PLURAL", "FOV", "BATTERIES", "FLAVOR"],
  "Items_Medicine.json": ["ID", "NAME", "PLURAL", "HP", "STA", "SLP", "INF", "SAN", "STACKING", "FLAVOR"],
  "Items_MeleeWeapons.json": ["ID", "NAME", "PLURAL", "ATK", "DMG", "STA", "DISARM", "TOOLBASHDMGBONUS", "TOOLBUILDBONUS", "STACKINGLIMIT", "ISFRAGILE", "WEIGHT", "FLAVOR"],
  "Items_RangedWeapons.json": ["ID", "NAME", "PLURAL", "ATK", "RAPID1", "RAPID2", "DMG", "RANGE", "MAXAMMO", "WEIGHT", "FLAVOR"],
  "Items_Scentsprays.json": ["ID", "NAME", "PLURAL", "QUANTITY", "STRENGTH", "FLAVOR"],
  "Items_Spraypaints.json": ["ID", "NAME", "PLURAL", "QUANTITY", "FLAVOR"],
  "Items_Trackers.json": ["ID", "NAME", "PLURAL", "BATTERIES", "HASCLOCK", "FLAVOR"],
  "Items_Traps.json": ["ID", "NAME", "PLURAL", "STACKING", "DROP_ACTIVATE", "USE_ACTIVATE", "TRIGGER_CHANCE", "DAMAGE", "ONE_TIME", "BREAK_CHANCE", "BLOCK_CHANCE", "BREAK_ESCAPE", "NOISY", "NOISE", "FLAMMABLE", "FLAVOR"],
  "Skills.json": ["ID", "NAME", "VALUE1", "VALUE2", "VALUE3", "VALUE4"],
};

/** Splits one CSV line, honouring double quotes, as convert-csv.js does. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Coerces a CSV cell the way the converter does: numeric strings become numbers. */
function coerce(val: string): string | number {
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    val = val.slice(1, -1);
  }
  if (val !== "" && !isNaN(Number(val))) return Number(val);
  return val;
}

const names = Object.keys(EXPECTED_COLUMNS);

describe("CSV -> JSON data tables", () => {
  it.each(names)("%s has the canonical column names", (name) => {
    const rows = JSON.parse(readFileSync(resolve(jsonDir, name), "utf-8"));
    expect(rows.length).toBeGreaterThan(0);
    // Every row must carry exactly the expected keys, in order.
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(EXPECTED_COLUMNS[name]);
    }
  });

  it.each(names)("%s keys contain no spaces", (name) => {
    const rows = JSON.parse(readFileSync(resolve(jsonDir, name), "utf-8"));
    for (const key of Object.keys(rows[0])) {
      expect(key, `${name} key ${JSON.stringify(key)} looks like a raw CSV header`).not.toMatch(/\s/);
    }
  });

  it.each(names)("%s is still in sync with its CSV", (name) => {
    const csv = readFileSync(resolve(csvDir, name.replace(/\.json$/, ".csv")), "utf-8");
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = parseCsvLine(lines[0]).length;
    const body = lines.slice(1).map((l) => parseCsvLine(l).map(coerce));

    const json = JSON.parse(readFileSync(resolve(jsonDir, name), "utf-8"));

    // Same shape as the source...
    expect(header).toBe(EXPECTED_COLUMNS[name].length);
    expect(json.length).toBe(body.length);
    // ...and same values, in the same order. Comparing positionally is the
    // point: it catches a CSV edit that was never regenerated, which is the
    // failure mode that leaves the game running on stale balance data.
    for (let i = 0; i < body.length; i++) {
      expect(Object.values(json[i]), `row ${i} of ${name}`).toEqual(body[i]);
    }
  });
});

/**
 * Still Alive adds a ruleset that plays against the *same* content tables, so
 * the merge is only safe if classic is untouched. This is the check that says so
 * as a property rather than as a claim in a commit message: every row the
 * vanilla tree defines is still present, in the same order, with the same
 * values, and the new content is strictly additive after them.
 *
 * The regression it guards against is the tempting one. Taking the fork's
 * tables wholesale looks like the merge, and it silently rebalances classic --
 * army ration nutrition 0.25 to 0.33, best-before 5 days to never -- at the data
 * layer that both rulesets read. That is a Stage 4 decision behind a flag, not
 * a data merge, and this test fails if it ever happens by accident.
 */
describe("the Still Alive merge did not disturb classic", () => {
  /** Reads a table from the read-only vanilla tree, honouring its encoding. */
  function readVanilla(csvName: string): Record<string, string>[] {
    const enc = VANILLA_ENCODINGS[csvName] ?? "utf-8";
    const text = readFileSync(resolve(vanillaCsvDir, csvName), enc);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map((l) => Object.fromEntries(
      header.map((h, i) => [h, parseCsvLine(l)[i] ?? ""]),
    ));
  }

  const mergedNames = Object.keys(EXPECTED_COLUMNS).map((n) => n.replace(/\.json$/, ".csv"));

  it.each(mergedNames.filter((n) => n !== "Items_Backpacks.csv"))(
    "%s keeps every classic row, unchanged, with new rows appended",
    (csvName) => {
      const vanilla = readVanilla(csvName);
      const text = readFileSync(resolve(csvDir, csvName), "utf-8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const header = parseCsvLine(lines[0]);
      const merged = lines.slice(1).map((l) => Object.fromEntries(
        header.map((h, i) => [h, parseCsvLine(l)[i] ?? ""]),
      ));

      expect(merged.length).toBeGreaterThanOrEqual(vanilla.length);
      // Ids are the join key, and the order is the contract: classic rows keep
      // their positions so the numeric enum order stays valid.
      for (let i = 0; i < vanilla.length; i++) {
        expect(merged[i].ID, `row ${i} of ${csvName}`).toBe(vanilla[i].ID);
      }

      // Match vanilla columns to merged ones by name. Four tables gained
      // columns *before* FLAVOR (`WEIGHT`, `FIRE_RESIST%`, ...), so position is
      // not a usable key there, and `Items_Traps.csv` needs the opposite: its
      // headers are the same length but the fork fixed "DESACTIVATES" to
      // "DEACTIVATES", so a name lookup misses and position is the only thing
      // that resolves it. Name first, then same-index for whatever is left --
      // and only when the widths agree, since otherwise the index means
      // something different on each side.
      const mergedCols = parseCsvLine(lines[0]);
      const vanillaCols = parseCsvLine(
        readFileSync(resolve(vanillaCsvDir, csvName), VANILLA_ENCODINGS[csvName] ?? "utf-8")
          .split(/\r?\n/)[0],
      );
      const sameWidth = mergedCols.length === vanillaCols.length;
      const indexFor = (col: string, at: number): number => {
        const byName = mergedCols.indexOf(col);
        if (byName !== -1) return byName;
        expect(sameWidth, `${csvName}: column ${col} is in neither table`).toBe(true);
        return at;
      };

      for (let i = 0; i < vanilla.length; i++) {
        const ours = vanilla[i];
        const oursCols = Object.keys(ours);
        for (let c = 0; c < oursCols.length; c++) {
          const col = oursCols[c];
          expect(merged[i][mergedCols[indexFor(col, c)]], `${csvName} ${ours.ID} ${col}`)
            .toBe(ours[col]);
        }
      }
    },
  );

  it("the fork's backpacks are present, since vanilla has no such table", () => {
    const rows = readFileSync(resolve(csvDir, "Items_Backpacks.csv"), "utf-8");
    expect(rows).toContain("BACKPACK_WAIST_POUCH");
    expect(existsSync(resolve(vanillaCsvDir, "Items_Backpacks.csv"))).toBe(false);
  });
});
