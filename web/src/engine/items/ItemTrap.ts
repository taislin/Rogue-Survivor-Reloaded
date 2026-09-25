import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import type { Actor } from "@data/Actor";

export const enum TrapFlags {
  NONE = 0,
  USE_TO_ACTIVATE = 1 << 0,
  IS_NOISY = 1 << 1,
  IS_ONE_TIME_USE = 1 << 2,
  IS_FLAMMABLE = 1 << 3,
  DROP_ACTIVATE = 1 << 4,
}

export class ItemTrapModel extends ItemModel {
  readonly flags: number;
  readonly triggerChance: number;
  readonly damage: number;
  readonly breakChance: number;
  readonly breakChanceWhenEscape: number;
  readonly blockChance: number;
  readonly noiseName: string;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    stackLimit: number,
    triggerChance: number,
    damage: number,
    dropActivate: boolean,
    useToActivate: boolean,
    isOneTimeUse: boolean,
    breakChance: number,
    blockChance: number,
    breakChanceWhenEscape: number,
    isNoisy: boolean,
    noiseName: string,
    isFlammable: boolean
  ) {
    super(aName, theNames, imageId);
    this.dontAutoEquip = true;

    if (stackLimit > 1) {
      this.isStackable = true;
      this.stackingLimit = stackLimit;
    }

    this.triggerChance = triggerChance;
    this.damage = damage;
    this.breakChance = breakChance;
    this.blockChance = blockChance;
    this.breakChanceWhenEscape = breakChanceWhenEscape;
    this.noiseName = noiseName;

    let f = TrapFlags.NONE;
    if (dropActivate) f |= TrapFlags.DROP_ACTIVATE;
    if (useToActivate) f |= TrapFlags.USE_TO_ACTIVATE;
    if (isNoisy) f |= TrapFlags.IS_NOISY;
    if (isOneTimeUse) f |= TrapFlags.IS_ONE_TIME_USE;
    if (isFlammable) f |= TrapFlags.IS_FLAMMABLE;
    this.flags = f;
  }

  get useToActivate(): boolean { return (this.flags & TrapFlags.USE_TO_ACTIVATE) !== 0; }
  get isNoisy(): boolean { return (this.flags & TrapFlags.IS_NOISY) !== 0; }
  get isOneTimeUse(): boolean { return (this.flags & TrapFlags.IS_ONE_TIME_USE) !== 0; }
  get isFlammable(): boolean { return (this.flags & TrapFlags.IS_FLAMMABLE) !== 0; }
  get activatesWhenDropped(): boolean { return (this.flags & TrapFlags.DROP_ACTIVATE) !== 0; }
}

export class ItemTrap extends Item {
  private _isActivated: boolean = false;
  isTriggered: boolean = false;
  private _owner: Actor | null = null;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemTrapModel)) {
      throw new Error("model is not an ItemTrapModel");
    }
  }

  get trapModel(): ItemTrapModel {
    return this.model as ItemTrapModel;
  }

  get isActivated(): boolean {
    return this._isActivated;
  }

  get owner(): Actor | null {
    if (this._owner && this._owner.isDead) {
      this._owner = null;
    }
    return this._owner;
  }

  activate(owner: Actor): void {
    this._owner = owner;
    this._isActivated = true;
  }

  deactivate(): void {
    this._owner = null;
    this._isActivated = false;
  }

  clone(): ItemTrap {
    return new ItemTrap(this.trapModel);
  }
}
