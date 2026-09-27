import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
const csvDir = resolve(repoRoot, "src/Resources/Data");
const jsonDir = resolve(repoRoot, "web/src/gameplay/data");

/** The canonical column names, mirroring `COLUMNS` in convert-csv.js. */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  "Actors.json": ["ID", "NAME", "PLURAL", "SPD", "HP", "STA", "ATK", "DMG", "DEF", "PRO_HIT", "PRO_SHOT", "FOV", "AUDIO", "SMELL", "SCORE", "FLAVOR"],
  "Items_Armors.json": ["ID", "NAME", "PLURAL", "PRO_HIT", "PRO_SHOT", "ENC", "WEIGHT", "FLAVOR"],
  "Items_Barricading.json": ["ID", "NAME", "PLURAL", "VALUE", "STACKINGLIMIT", "FLAVOR"],
  "Items_Entertainment.json": ["ID", "NAME", "PLURAL", "STACKING", "VALUE", "BORE_CHANCE", "FLAVOR"],
  "Items_Explosives.json": ["ID", "NAME", "PLURAL", "FUSE", "MAXTHROW", "STACKINGLIMIT", "RADIUS", "BLAST0", "BLAST1", "BLAST2", "BLAST3", "BLAST4", "BLAST5", "FLAVOR"],
  "Items_Food.json": ["ID", "NAME", "PLURAL", "NUTRITION", "BESTBEFORE", "STACKINGLIMIT", "FLAVOR"],
  "Items_Lights.json": ["ID", "NAME", "PLURAL", "FOV", "BATTERIES", "FLAVOR"],
  "Items_Medicine.json": ["ID", "NAME", "PLURAL", "HP", "STA", "SLP", "INF", "SAN", "STACKING", "FLAVOR"],
  "Items_MeleeWeapons.json": ["ID", "NAME", "PLURAL", "ATK", "DMG", "STA", "DISARM", "TOOLBASHDMGBONUS", "TOOLBUILDBONUS", "STACKINGLIMIT", "ISFRAGILE", "FLAVOR"],
  "Items_RangedWeapons.json": ["ID", "NAME", "PLURAL", "ATK", "RAPID1", "RAPID2", "DMG", "RANGE", "MAXAMMO", "FLAVOR"],
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
