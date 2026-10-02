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
    // A range of 1 is "adjacent", which is the efficient case by definition.
    // `floor(1/2)` is 0, and the caller computes the distance penalty as
    // `(efficientRange - distance) / range` and doubles it past the efficient
    // range — so for range 1 at distance 1 that is `(0 - 1) / 1 * 2 = -2` and
    // `distanceMod` comes out at **-1**. The hit value goes negative, so the
    // weapon cannot hit anything at all rather than merely being poor at range.
    //
    // Latent in the shipped data, because no vanilla weapon has a range of 1 (the
    // shortest is the shotgun at 3) — but the Still Alive content pack adds a stun
    // gun that does, so this becomes a live bug the moment that table is merged.
    // Fixed before it rather than after. Same fix as the fork's Attack.cs:56-64.
    if (this.range === 1) return this.range;
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
