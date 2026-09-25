import { Attack } from "./Attack";
import { Defence } from "./Defence";
import { SkillTable } from "./Skill";

export class ActorSheet {
  static readonly BLANK = new ActorSheet(
    0, 0, 0, 0, 0,
    Attack.BLANK,
    Defence.BLANK,
    0, 0, 0, 0
  );

  readonly baseHitPoints: number;
  readonly baseStaminaPoints: number;
  readonly baseFoodPoints: number;
  readonly baseSleepPoints: number;
  readonly baseSanity: number;
  readonly unarmedAttack: Attack;
  readonly baseDefence: Defence;
  readonly baseViewRange: number;
  readonly baseAudioRange: number;
  readonly baseSmellRating: number;
  readonly baseInventoryCapacity: number;
  skillTable: SkillTable;

  constructor(
    baseHitPoints: number,
    baseStaminaPoints: number,
    baseFoodPoints: number,
    baseSleepPoints: number,
    baseSanity: number,
    unarmedAttack: Attack,
    baseDefence: Defence,
    baseViewRange: number,
    baseAudioRange: number,
    smellRating: number,
    inventoryCapacity: number
  ) {
    this.baseHitPoints = baseHitPoints;
    this.baseStaminaPoints = baseStaminaPoints;
    this.baseFoodPoints = baseFoodPoints;
    this.baseSleepPoints = baseSleepPoints;
    this.baseSanity = baseSanity;
    this.unarmedAttack = unarmedAttack;
    this.baseDefence = baseDefence;
    this.baseViewRange = baseViewRange;
    this.baseAudioRange = baseAudioRange;
    this.baseSmellRating = smellRating / 100.0;
    this.baseInventoryCapacity = inventoryCapacity;
    this.skillTable = new SkillTable();
  }

  static clone(src: ActorSheet): ActorSheet {
    const s = new ActorSheet(
      src.baseHitPoints,
      src.baseStaminaPoints,
      src.baseFoodPoints,
      src.baseSleepPoints,
      src.baseSanity,
      src.unarmedAttack,
      src.baseDefence,
      src.baseViewRange,
      src.baseAudioRange,
      Math.round(src.baseSmellRating * 100),
      src.baseInventoryCapacity
    );
    if (src.skillTable.skills) {
      s.skillTable = new SkillTable(src.skillTable.skills);
    }
    return s;
  }
}
