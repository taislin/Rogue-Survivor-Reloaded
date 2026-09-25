export enum DollPart {
  NONE = 0,
  RIGHT_HAND = 1,
  LEFT_HAND = 2,
  HEAD = 3,
  TORSO = 4,
  LEGS = 5,
  FEET = 6,
  SKIN = 7,
  EYES = 8,
  _COUNT = 9
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
