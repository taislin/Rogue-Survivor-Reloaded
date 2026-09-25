export class Defence {
  static readonly BLANK = new Defence(0, 0, 0);

  readonly value: number;
  readonly protectionHit: number;
  readonly protectionShot: number;

  constructor(value: number, protectionHit: number, protectionShot: number) {
    this.value = value;
    this.protectionHit = protectionHit;
    this.protectionShot = protectionShot;
  }

  add(other: Defence): Defence {
    return new Defence(
      this.value + other.value,
      this.protectionHit + other.protectionHit,
      this.protectionShot + other.protectionShot
    );
  }

  subtract(other: Defence): Defence {
    return new Defence(
      this.value - other.value,
      this.protectionHit - other.protectionHit,
      this.protectionShot - other.protectionShot
    );
  }
}
