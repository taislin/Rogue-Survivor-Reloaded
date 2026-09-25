import { DiceRoller } from "@engine/DiceRoller";

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
}
