import { Location } from "./Location";

export enum MapObjectBreak {
  UNBREAKABLE = 0,
  BREAKABLE = 1,
  BROKEN = 2,
}

export enum MapObjectFire {
  UNINFLAMMABLE = 0,
  BURNABLE = 1,
  ONFIRE = 2,
  ASHES = 3,
}

export const enum MapObjectFlags {
  NONE = 0,
  IS_AN = 1 << 0,
  IS_PLURAL = 1 << 1,
  IS_MATERIAL_TRANSPARENT = 1 << 2,
  IS_WALKABLE = 1 << 3,
  IS_CONTAINER = 1 << 4,
  IS_COUCH = 1 << 5,
  GIVES_WOOD = 1 << 6,
  IS_MOVABLE = 1 << 7,
  BREAKS_WHEN_FIRED_THROUGH = 1 << 8,
  STANDON_FOV_BONUS = 1 << 9,
}

export class MapObject {
  private _name: string;
  imageId: string;
  readonly hiddenImageId: string;
  private flags: number = MapObjectFlags.NONE;

  jumpLevel: number = 0;
  private _weight: number = 1;

  breakState: MapObjectBreak = MapObjectBreak.UNBREAKABLE;
  maxHitPoints: number = 0;
  hitPoints: number = 0;

  fireState: MapObjectFire = MapObjectFire.UNINFLAMMABLE;
  location: Location = new Location();

  constructor(
    aName: string,
    hiddenImageId: string,
    breakable: MapObjectBreak = MapObjectBreak.UNBREAKABLE,
    burnable: MapObjectFire = MapObjectFire.UNINFLAMMABLE,
    hitPoints: number = 0
  ) {
    this._name = aName;
    this.imageId = hiddenImageId;
    this.hiddenImageId = hiddenImageId;
    this.breakState = breakable;
    this.fireState = burnable;
    if (breakable !== MapObjectBreak.UNBREAKABLE || burnable !== MapObjectFire.UNINFLAMMABLE) {
      this.hitPoints = this.maxHitPoints = hitPoints;
    }
  }

  get name(): string { return this._name; }
  set name(val: string) { this._name = val; }

  get aName(): string {
    return (this.isAn ? "an " : this.isPlural ? "some " : "a ") + this._name;
  }

  get theName(): string {
    return `the ${this._name}`;
  }

  get isAn(): boolean { return (this.flags & MapObjectFlags.IS_AN) !== 0; }
  set isAn(v: boolean) { this.setFlag(MapObjectFlags.IS_AN, v); }

  get isPlural(): boolean { return (this.flags & MapObjectFlags.IS_PLURAL) !== 0; }
  set isPlural(v: boolean) { this.setFlag(MapObjectFlags.IS_PLURAL, v); }

  get isTransparent(): boolean {
    if (this.fireState === MapObjectFire.ONFIRE) return false;
    if (this.breakState === MapObjectBreak.BROKEN) return true;
    if (this.fireState === MapObjectFire.ASHES) return true;
    return (this.flags & MapObjectFlags.IS_MATERIAL_TRANSPARENT) !== 0;
  }

  get isMaterialTransparent(): boolean { return (this.flags & MapObjectFlags.IS_MATERIAL_TRANSPARENT) !== 0; }
  set isMaterialTransparent(v: boolean) { this.setFlag(MapObjectFlags.IS_MATERIAL_TRANSPARENT, v); }

  get isWalkable(): boolean { return (this.flags & MapObjectFlags.IS_WALKABLE) !== 0; }
  set isWalkable(v: boolean) { this.setFlag(MapObjectFlags.IS_WALKABLE, v); }

  get isJumpable(): boolean { return this.jumpLevel > 0; }

  get isContainer(): boolean { return (this.flags & MapObjectFlags.IS_CONTAINER) !== 0; }
  set isContainer(v: boolean) { this.setFlag(MapObjectFlags.IS_CONTAINER, v); }

  get isCouch(): boolean { return (this.flags & MapObjectFlags.IS_COUCH) !== 0; }
  set isCouch(v: boolean) { this.setFlag(MapObjectFlags.IS_COUCH, v); }

  get isBreakable(): boolean { return this.breakState === MapObjectBreak.BREAKABLE; }

  get givesWood(): boolean {
    return (this.flags & MapObjectFlags.GIVES_WOOD) !== 0 && this.breakState !== MapObjectBreak.BROKEN;
  }
  set givesWood(v: boolean) { this.setFlag(MapObjectFlags.GIVES_WOOD, v); }

  get isMovable(): boolean { return (this.flags & MapObjectFlags.IS_MOVABLE) !== 0; }
  set isMovable(v: boolean) { this.setFlag(MapObjectFlags.IS_MOVABLE, v); }

  get breaksWhenFiredThrough(): boolean { return (this.flags & MapObjectFlags.BREAKS_WHEN_FIRED_THROUGH) !== 0; }
  set breaksWhenFiredThrough(v: boolean) { this.setFlag(MapObjectFlags.BREAKS_WHEN_FIRED_THROUGH, v); }

  get standOnFovBonus(): boolean { return (this.flags & MapObjectFlags.STANDON_FOV_BONUS) !== 0; }
  set standOnFovBonus(v: boolean) { this.setFlag(MapObjectFlags.STANDON_FOV_BONUS, v); }

  get weight(): number { return this._weight; }
  set weight(v: number) { this._weight = Math.max(1, v); }

  get isFlammable(): boolean {
    return this.fireState === MapObjectFire.ONFIRE || this.fireState === MapObjectFire.BURNABLE;
  }

  get isOnFire(): boolean { return this.fireState === MapObjectFire.ONFIRE; }
  get isBurntToAshes(): boolean { return this.fireState === MapObjectFire.ASHES; }

  private setFlag(flag: MapObjectFlags, value: boolean): void {
    if (value) this.flags |= flag;
    else this.flags &= ~flag;
  }
}
