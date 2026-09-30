export enum DollPart {
  NONE = 0,
  /**
   * Alias for the first real part, as in C# `Doll.cs` where
   * `RIGHT_HAND = _FIRST`. Present for parity so call sites can read as the
   * original; it is the same value, not an extra slot.
   */
  _FIRST = 1,
  RIGHT_HAND = 1,
  LEFT_HAND = 2,
  HEAD = 3,
  TORSO = 4,
  LEGS = 5,
  FEET = 6,
  SKIN = 7,
  EYES = 8,
  /**
   * The back, for backpacks. Still Alive, Release 8-2.
   *
   * The C# numbers this 10, because `LEFT_ARM` (the police riot shield, Release
   * 7-2) is 9 there and the port has no shields at all. So 9 is free here and
   * 10 would leave a hole: a `DollPart` enum with a gap in it is a trap for the
   * next person who adds a part, and the number is unobservable anyway — nothing
   * in the project persists or transmits a `DollPart` as a number (the graph writer
   * carries an equipped part as the field's own value, and the equipment lookup is
   * a comparison).
   *
   * Which means a future `LEFT_ARM` has to be numbered deliberately rather than
   * inherited by accident, and the comment on `tests/tile-palette.test.ts` records
   * the same thing from the test side.
   */
  BACK = 9,
  _COUNT = 10
}

export class DollBody {
  static readonly UNDEF = new DollBody(true, 0);

  readonly isMale: boolean;
  readonly speed: number;

  constructor(isMale: boolean, speed: number) {
    this.isMale = isMale;
    this.speed = speed;
  }
}

export class Doll {
  readonly body: DollBody;
  private readonly decorations: (string[] | null)[] = new Array(DollPart._COUNT).fill(null);

  constructor(body: DollBody) {
    this.body = body;
  }

  getDecorations(part: DollPart): string[] | null {
    return this.decorations[part];
  }

  countDecorations(part: DollPart): number {
    const list = this.decorations[part];
    return list ? list.length : 0;
  }

  addDecoration(part: DollPart, imageId: string): void {
    let list = this.decorations[part];
    if (!list) {
      list = [];
      this.decorations[part] = list;
    }
    list.push(imageId);
  }

  removeDecoration(imageId: string): void {
    for (let i = 0; i < DollPart._COUNT; i++) {
      const list = this.decorations[i];
      if (!list) continue;
      const index = list.indexOf(imageId);
      if (index !== -1) {
        list.splice(index, 1);
        if (list.length === 0) {
          this.decorations[i] = null;
        }
        return;
      }
    }
  }

  removeDecorationPart(part: DollPart): void {
    this.decorations[part] = null;
  }

  removeAllDecorations(): void {
    for (let i = 0; i < DollPart._COUNT; i++) {
      this.decorations[i] = null;
    }
  }
}
