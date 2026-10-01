import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The data tables must keep the column names the code reads them by.
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
 * fail when a table gains a column, loses one, or gets re-ordered.
 *
 * These tables used to be generated from the original game's
 * `src/Resources/Data/*.csv`, and a third assertion here compared each
 * committed JSON against its CSV to catch a table that was edited but never
 * regenerated. src/ is gone from the repository (it survives only as a local,
 * gitignored reference folder), so there is nothing left to compare against
 * and nothing left to regenerate from: the JSON is now the only copy, and these
 * two assertions are what stands between it and a silently unreadable column.
 */

const jsonDir = resolve(__dirname, "../src/gameplay/data");

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

const names = Object.keys(EXPECTED_COLUMNS);

describe("data tables", () => {
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
});
