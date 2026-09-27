import { describe, it, expect, beforeAll } from "vitest";
import { Skills, SkillID } from "@gameplay/Skills";
import { Rules } from "@engine/Rules";
import skillsData from "@gameplay/data/Skills.json";

/**
 * `Skills.csv` has to actually drive the `Rules.SKILL_*` statics.
 *
 * The bug: the port never imported `Skills.json`. It hardcoded all 43 skill
 * values as the *compile-time defaults* from the C# `Rules.cs` -- the values
 * the game has before `LoadSkillsFromCSV` runs. For 36 of the 43 those are the
 * same number, which is why nobody noticed, but 7 are the vanilla balance
 * rather than Reloaded's: Strong did 2 damage instead of 3, Z-Grab triggered on
 * a 4% instead of 2% roll, Z-Tracker smelt at 10% instead of 4%, and so on.
 *
 * C# `Skills.LoadSkillsFromCSV` (src/Gameplay/Skills.cs:310-430) writes these
 * from the CSV, so the CSV is the source of truth and the port has to read it.
 */

/** skill, Rules constant, VALUE column, and whether C# casts it to `int`. */
const CSharpAssignments: Array<[SkillID, string, 1 | 2 | 3, boolean]> = [
  [SkillID.AGILE, "SKILL_AGILE_ATK_BONUS", 1, true],
  [SkillID.AGILE, "SKILL_AGILE_DEF_BONUS", 2, true],
  [SkillID.AWAKE, "SKILL_AWAKE_SLEEP_BONUS", 1, false],
  [SkillID.AWAKE, "SKILL_AWAKE_SLEEP_REGEN_BONUS", 2, false],
  [SkillID.BOWS, "SKILL_BOWS_ATK_BONUS", 1, true],
  [SkillID.BOWS, "SKILL_BOWS_DMG_BONUS", 2, true],
  [SkillID.CARPENTRY, "SKILL_CARPENTRY_BARRICADING_BONUS", 1, false],
  [SkillID.CARPENTRY, "SKILL_CARPENTRY_LEVEL3_BUILD_BONUS", 2, true],
  [SkillID.CHARISMATIC, "SKILL_CHARISMATIC_TRUST_BONUS", 1, true],
  [SkillID.CHARISMATIC, "SKILL_CHARISMATIC_TRADE_BONUS", 2, true],
  [SkillID.FIREARMS, "SKILL_FIREARMS_ATK_BONUS", 1, true],
  [SkillID.FIREARMS, "SKILL_FIREARMS_DMG_BONUS", 2, true],
  [SkillID.HARDY, "SKILL_HARDY_HEAL_CHANCE_BONUS", 1, true],
  [SkillID.HAULER, "SKILL_HAULER_INV_BONUS", 1, true],
  [SkillID.HIGH_STAMINA, "SKILL_HIGH_STAMINA_STA_BONUS", 1, true],
  [SkillID.LEADERSHIP, "SKILL_LEADERSHIP_FOLLOWER_BONUS", 1, true],
  [SkillID.LIGHT_EATER, "SKILL_LIGHT_EATER_FOOD_BONUS", 1, false],
  [SkillID.LIGHT_EATER, "SKILL_LIGHT_EATER_MAXFOOD_BONUS", 2, false],
  [SkillID.LIGHT_FEET, "SKILL_LIGHT_FEET_TRAP_BONUS", 1, true],
  [SkillID.LIGHT_SLEEPER, "SKILL_LIGHT_SLEEPER_WAKEUP_CHANCE_BONUS", 1, true],
  [SkillID.MARTIAL_ARTS, "SKILL_MARTIAL_ARTS_ATK_BONUS", 1, true],
  [SkillID.MARTIAL_ARTS, "SKILL_MARTIAL_ARTS_DMG_BONUS", 2, true],
  [SkillID.MARTIAL_ARTS, "SKILL_MARTIAL_ARTS_DISARM_BONUS", 3, true],
  [SkillID.MEDIC, "SKILL_MEDIC_BONUS", 1, false],
  [SkillID.MEDIC, "SKILL_MEDIC_REVIVE_BONUS", 2, true],
  [SkillID.NECROLOGY, "SKILL_NECROLOGY_UNDEAD_BONUS", 1, true],
  [SkillID.NECROLOGY, "SKILL_NECROLOGY_CORPSE_BONUS", 2, true],
  [SkillID.STRONG, "SKILL_STRONG_DMG_BONUS", 1, true],
  [SkillID.STRONG, "SKILL_STRONG_THROW_BONUS", 2, true],
  [SkillID.STRONG_PSYCHE, "SKILL_STRONG_PSYCHE_LEVEL_BONUS", 1, false],
  [SkillID.TOUGH, "SKILL_TOUGH_HP_BONUS", 1, true],
  [SkillID.UNSUSPICIOUS, "SKILL_UNSUSPICIOUS_BONUS", 1, true],
  [SkillID.Z_AGILE, "SKILL_ZAGILE_ATK_BONUS", 1, true],
  [SkillID.Z_AGILE, "SKILL_ZAGILE_DEF_BONUS", 2, true],
  [SkillID.Z_EATER, "SKILL_ZEATER_REGEN_BONUS", 1, false],
  [SkillID.Z_INFECTOR, "SKILL_ZINFECTOR_BONUS", 1, false],
  [SkillID.Z_GRAB, "SKILL_ZGRAB_CHANCE", 1, true],
  [SkillID.Z_LIGHT_EATER, "SKILL_ZLIGHT_EATER_FOOD_BONUS", 1, false],
  [SkillID.Z_LIGHT_EATER, "SKILL_ZLIGHT_EATER_MAXFOOD_BONUS", 2, false],
  [SkillID.Z_LIGHT_FEET, "SKILL_ZLIGHT_FEET_TRAP_BONUS", 1, true],
  [SkillID.Z_STRONG, "SKILL_ZSTRONG_DMG_BONUS", 1, true],
  [SkillID.Z_TOUGH, "SKILL_ZTOUGH_HP_BONUS", 1, true],
  [SkillID.Z_TRACKER, "SKILL_ZTRACKER_SMELL_BONUS", 1, false],
];

/** The C# `Rules.cs` compile-time defaults, i.e. what the port used to ship. */
const CSharpDefaults: Record<string, number> = {
  SKILL_STRONG_DMG_BONUS: 2,
  SKILL_ZEATER_REGEN_BONUS: 0.2,
  SKILL_ZGRAB_CHANCE: 4,
  SKILL_ZLIGHT_EATER_FOOD_BONUS: 0.1,
  SKILL_ZLIGHT_EATER_MAXFOOD_BONUS: 0.15,
  SKILL_ZTOUGH_HP_BONUS: 4,
  SKILL_ZTRACKER_SMELL_BONUS: 0.1,
};

const csvByName = new Map<string, any>();
for (const r of skillsData as any[]) csvByName.set(r.NAME, r);

beforeAll(() => {
  Skills.load();
});

describe("Skills.csv -> Rules.SKILL_*", () => {
  it("covers all 43 assignments the C# loader makes", () => {
    expect(CSharpAssignments).toHaveLength(43);
  });

  it.each(CSharpAssignments)("%s -> %s", (skill, konst, col, isInt) => {
    const row = csvByName.get(Skills.NAMES[skill]);
    expect(row, `Skills.csv has no row named "${Skills.NAMES[skill]}"`).toBeDefined();
    const csv = row[`VALUE${col}`];
    // C# casts 31 of the 43 to `int`, which truncates.
    expect((Rules as any)[konst]).toBe(isInt ? Math.trunc(csv) : csv);
  });

  it.each(Object.entries(CSharpDefaults))("%s now uses the CSV value, not the C# default", (konst, dflt) => {
    const loaded = (Rules as any)[konst];
    expect(dflt, `${konst} still holds the pre-load C# default`).not.toBe(loaded);
  });

  it("names every skill, and the names match the CSV", () => {
    expect(Skills.NAMES).toHaveLength(SkillID._COUNT);
    for (let i = 0; i < SkillID._COUNT; i++) {
      expect(Skills.NAMES[i], `SkillID ${i} has no CSV row`).toBeDefined();
      expect(csvByName.has(Skills.NAMES[i])).toBe(true);
    }
  });

  it("is idempotent", () => {
    const before = CSharpAssignments.map(([, k]) => (Rules as any)[k]);
    Skills.load();
    expect(CSharpAssignments.map(([, k]) => (Rules as any)[k])).toEqual(before);
  });
});
