import { Point } from "@engine/Point";
import { WorldTime } from "@engine/WorldTime";

export enum Odor {
  LIVING = 0,
  UNDEAD_MASTER = 1,
  SUPPRESSOR = 2,
}

export class OdorScent {
  static readonly MIN_STRENGTH = 1;
  static readonly MAX_STRENGTH = 9 * WorldTime.TURNS_PER_HOUR;

  readonly odor: Odor;
  strength: number;
  readonly position: Point;

  constructor(odor: Odor, strength: number, position: Point) {
    this.odor = odor;
    this.strength = Math.min(OdorScent.MAX_STRENGTH, strength);
    this.position = position;
  }

  change(amount: number): void {
    let str = this.strength + amount;
    if (str < OdorScent.MIN_STRENGTH) str = 0;
    else if (str > OdorScent.MAX_STRENGTH) str = OdorScent.MAX_STRENGTH;
    this.strength = str;
  }

  set(value: number): void {
    let str = value;
    if (str < OdorScent.MIN_STRENGTH) str = 0;
    else if (str > OdorScent.MAX_STRENGTH) str = OdorScent.MAX_STRENGTH;
    this.strength = str;
  }
}
