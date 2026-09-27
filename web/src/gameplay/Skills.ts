import { DiceRoller } from "@engine/DiceRoller";
import skillsData from "./data/Skills.json";
// `Rules` imports `SkillID` from this file, so this closes a cycle. Safe for
// the same reason as the GameItems one: `Rules` only reads `SkillID` inside
// methods, and the only thing read from `Rules` here is the `SKILL_*` statics,
// inside `load()`.
import { Rules } from "@engine/Rules";

/** One row of `data/Skills.json`, as produced by `scripts/convert-csv.js`. */
type SkillRow = {
  ID: string;
  NAME: string;
  VALUE1: number;
  VALUE2: number;
  VALUE3: number;
  VALUE4: number;
};

export enum SkillID {
  // Living skills
  AGILE = 0,
  AWAKE = 1,
  BOWS = 2,
  CARPENTRY = 3,
  CHARISMATIC = 4,
  FIREARMS = 5,
  HARDY = 6,
  HAULER = 7,
  HIGH_STAMINA = 8,
  LEADERSHIP = 9,
  LIGHT_EATER = 10,
  LIGHT_FEET = 11,
  LIGHT_SLEEPER = 12,
  MARTIAL_ARTS = 13,
  MEDIC = 14,
  NECROLOGY = 15,
  STRONG = 16,
  STRONG_PSYCHE = 17,
  TOUGH = 18,
  UNSUSPICIOUS = 19,

  // Undead skills
  Z_AGILE = 20,
  Z_EATER = 21,
  Z_GRAB = 22,
  Z_INFECTOR = 23,
  Z_LIGHT_EATER = 24,
  Z_LIGHT_FEET = 25,
  Z_STRONG = 26,
  Z_TOUGH = 27,
  Z_TRACKER = 28,

  _COUNT = 29,
}

export class Skills {
  static readonly FIRST_LIVING = SkillID.AGILE;
  static readonly LAST_LIVING = SkillID.UNSUSPICIOUS;
  static readonly FIRST_UNDEAD = SkillID.Z_AGILE;
  static readonly LAST_UNDEAD = SkillID.Z_TRACKER;

  static readonly NAMES: readonly string[] = [
    "Agile", "Awake", "Bows", "Carpentry", "Charismatic",
    "Firearms", "Hardy", "Hauler", "High Stamina", "Leadership",
    "Light Eater", "Light Feet", "Light Sleeper", "Martial Arts", "Medic",
    "Necrology", "Strong", "Strong Psyche", "Tough", "Unsuspicious",
    "Z-Agile", "Z-Eater", "Z-Grab", "Z-Infector", "Z-Light Eater",
    "Z-Light Feet", "Z-Strong", "Z-Tough", "Z-Tracker"
  ];

  static readonly UNDEAD_SKILLS: readonly SkillID[] = [
    SkillID.Z_AGILE,
    SkillID.Z_EATER,
    SkillID.Z_GRAB,
    SkillID.Z_INFECTOR,
    SkillID.Z_LIGHT_EATER,
    SkillID.Z_LIGHT_FEET,
    SkillID.Z_STRONG,
    SkillID.Z_TOUGH,
    SkillID.Z_TRACKER,
  ];

  static name(id: SkillID): string {
    return Skills.NAMES[id] ?? "Unknown";
  }

  static maxSkillLevel(id: SkillID): number {
    switch (id) {
      case SkillID.HAULER:
        return 3;
      default:
        return 5;
    }
  }

  static rollLiving(roller: DiceRoller): SkillID {
    return roller.roll(Skills.FIRST_LIVING, Skills.LAST_LIVING + 1) as SkillID;
  }

  static rollUndead(roller: DiceRoller): SkillID {
    return roller.roll(Skills.FIRST_UNDEAD, Skills.LAST_UNDEAD + 1) as SkillID;
  }

  /**
   * C# `Skills.LoadSkillsFromCSV` (src/Gameplay/Skills.cs:310-430).
   *
   * Matched on NAME, not on the ID column. The shipped Skills.csv labels its
   * first living row `_FIRST_LIVING` and its first undead row `_FIRST_UNDEAD`
   * where the C# enum has AGILE and Z_AGILE, and C# `FindLineForModel` matches
   * on that column -- so the original throws `skill AGILE not found` before it
   * reads a single value. NAME is the one column that is intact and
   * unambiguous, and matching on it also means the lookup fails loudly if this
   * file's NAMES list and the CSV ever drift apart.
   *
   * The port previously hardcoded all 43 values as the *compile-time defaults*
   * from the C# `Rules.cs`, which is what the game runs with before this load
   * runs. Seven of them disagree with the CSV, so the port was shipping vanilla
   * skill balance instead of Reloaded's.
   *
   * `Math.trunc` mirrors the C# `(int)` casts: 31 of the 43 assignments cast,
   * and in C# that truncates a float, which a bare assignment would not do in
   * JS.
   */
  static load(): void {
    const byName = new Map<string, SkillRow>();
    for (const r of skillsData as SkillRow[]) byName.set(r.NAME, r);

    const row = (id: SkillID): SkillRow => {
      const r = byName.get(Skills.NAMES[id]);
      if (!r) {
        throw new Error(`Skills.csv has no row named "${Skills.NAMES[id]}" (${SkillID[id]})`);
      }
      return r;
    };

    let s: SkillRow;
    s = row(SkillID.AGILE);
    Rules.SKILL_AGILE_ATK_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_AGILE_DEF_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.AWAKE);
    Rules.SKILL_AWAKE_SLEEP_BONUS = s.VALUE1;
    Rules.SKILL_AWAKE_SLEEP_REGEN_BONUS = s.VALUE2;
    s = row(SkillID.BOWS);
    Rules.SKILL_BOWS_ATK_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_BOWS_DMG_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.CARPENTRY);
    Rules.SKILL_CARPENTRY_BARRICADING_BONUS = s.VALUE1;
    Rules.SKILL_CARPENTRY_LEVEL3_BUILD_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.CHARISMATIC);
    Rules.SKILL_CHARISMATIC_TRUST_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_CHARISMATIC_TRADE_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.FIREARMS);
    Rules.SKILL_FIREARMS_ATK_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_FIREARMS_DMG_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.HARDY);
    Rules.SKILL_HARDY_HEAL_CHANCE_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.HAULER);
    Rules.SKILL_HAULER_INV_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.HIGH_STAMINA);
    Rules.SKILL_HIGH_STAMINA_STA_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.LEADERSHIP);
    Rules.SKILL_LEADERSHIP_FOLLOWER_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.LIGHT_EATER);
    Rules.SKILL_LIGHT_EATER_FOOD_BONUS = s.VALUE1;
    Rules.SKILL_LIGHT_EATER_MAXFOOD_BONUS = s.VALUE2;
    s = row(SkillID.LIGHT_FEET);
    Rules.SKILL_LIGHT_FEET_TRAP_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.LIGHT_SLEEPER);
    Rules.SKILL_LIGHT_SLEEPER_WAKEUP_CHANCE_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.MARTIAL_ARTS);
    Rules.SKILL_MARTIAL_ARTS_ATK_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_MARTIAL_ARTS_DMG_BONUS = Math.trunc(s.VALUE2);
    Rules.SKILL_MARTIAL_ARTS_DISARM_BONUS = Math.trunc(s.VALUE3);
    s = row(SkillID.MEDIC);
    Rules.SKILL_MEDIC_BONUS = s.VALUE1;
    Rules.SKILL_MEDIC_REVIVE_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.NECROLOGY);
    Rules.SKILL_NECROLOGY_UNDEAD_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_NECROLOGY_CORPSE_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.STRONG);
    Rules.SKILL_STRONG_DMG_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_STRONG_THROW_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.STRONG_PSYCHE);
    Rules.SKILL_STRONG_PSYCHE_LEVEL_BONUS = s.VALUE1;
    s = row(SkillID.TOUGH);
    Rules.SKILL_TOUGH_HP_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.UNSUSPICIOUS);
    Rules.SKILL_UNSUSPICIOUS_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.Z_AGILE);
    Rules.SKILL_ZAGILE_ATK_BONUS = Math.trunc(s.VALUE1);
    Rules.SKILL_ZAGILE_DEF_BONUS = Math.trunc(s.VALUE2);
    s = row(SkillID.Z_EATER);
    Rules.SKILL_ZEATER_REGEN_BONUS = s.VALUE1;
    s = row(SkillID.Z_INFECTOR);
    Rules.SKILL_ZINFECTOR_BONUS = s.VALUE1;
    s = row(SkillID.Z_GRAB);
    Rules.SKILL_ZGRAB_CHANCE = Math.trunc(s.VALUE1);
    s = row(SkillID.Z_LIGHT_EATER);
    Rules.SKILL_ZLIGHT_EATER_FOOD_BONUS = s.VALUE1;
    Rules.SKILL_ZLIGHT_EATER_MAXFOOD_BONUS = s.VALUE2;
    s = row(SkillID.Z_LIGHT_FEET);
    Rules.SKILL_ZLIGHT_FEET_TRAP_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.Z_STRONG);
    Rules.SKILL_ZSTRONG_DMG_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.Z_TOUGH);
    Rules.SKILL_ZTOUGH_HP_BONUS = Math.trunc(s.VALUE1);
    s = row(SkillID.Z_TRACKER);
    Rules.SKILL_ZTRACKER_SMELL_BONUS = s.VALUE1;
  }
}
