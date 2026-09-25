import { Verb } from "./Verb";

export enum AttackKind {
  PHYSICAL = 0,
  FIREARM = 1,
  BOW = 2
}

export enum FireMode {
  DEFAULT = 0,
  RAPID = 1,
  _COUNT = 2
}

export class Attack {
  readonly kind: AttackKind;
  readonly verb: Verb;
  readonly hitValue: number;
  readonly hit2Value: number;
  readonly hit3Value: number;
  readonly damageValue: number;
  readonly staminaPenalty: number;
  readonly disarmChance: number;
  readonly range: number;

  static readonly BLANK = new Attack(
    AttackKind.PHYSICAL,
    new Verb("<blank>"),
    0, 0, 0, 0, 0, 0, 0
  );

  constructor(
    kind: AttackKind,
    verb: Verb,
    hitValue: number,
    hit2Value: number,
    hit3Value: number,
    damageValue: number,
    staminaPenalty: number,
    disarmChance: number,
    range: number
  ) {
    this.kind = kind;
    this.verb = verb;
    this.hitValue = hitValue;
    this.hit2Value = hit2Value;
    this.hit3Value = hit3Value;
    this.damageValue = damageValue;
    this.staminaPenalty = staminaPenalty;
    this.disarmChance = disarmChance;
    this.range = range;
  }

  get efficientRange(): number {
    return Math.floor(this.range / 2);
  }

  static meleeAttack(
    verb: Verb,
    hitValue: number,
    damageValue: number,
    staminaPenalty: number = 0,
    disarmChance: number = 0
  ): Attack {
    return new Attack(
      AttackKind.PHYSICAL,
      verb,
      hitValue,
      hitValue,
      hitValue,
      damageValue,
      staminaPenalty,
      disarmChance,
      0
    );
  }

  static rangedAttack(
    kind: AttackKind,
    verb: Verb,
    normalHitValue: number,
    rapidFire1HitValue: number,
    rapidFire2HitValue: number,
    damageValue: number,
    range: number
  ): Attack {
    return new Attack(
      kind,
      verb,
      normalHitValue,
      rapidFire1HitValue,
      rapidFire2HitValue,
      damageValue,
      0,
      0,
      range
    );
  }
}
