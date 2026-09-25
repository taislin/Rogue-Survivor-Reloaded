import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { Attack } from "@data/Attack";

export class ItemWeaponModel extends ItemModel {
  readonly attack: Attack;

  constructor(aName: string, theNames: string, imageId: string, attack: Attack) {
    super(aName, theNames, imageId);
    this.attack = attack;
  }
}

export class ItemWeapon extends Item {
  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemWeaponModel)) {
      throw new Error("model is not an ItemWeaponModel");
    }
  }

  get weaponModel(): ItemWeaponModel {
    return this.model as ItemWeaponModel;
  }
}

export class ItemMeleeWeaponModel extends ItemWeaponModel {
  readonly isFragile: boolean;
  readonly isTool: boolean;
  readonly toolBashDamageBonus: number;
  readonly toolBuildBonus: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    attack: Attack,
    isFragile: boolean = false,
    toolBashDamageBonus: number = 0,
    toolBuildBonus: number = 0
  ) {
    super(aName, theNames, imageId, attack);
    this.isFragile = isFragile;
    this.toolBashDamageBonus = toolBashDamageBonus;
    this.toolBuildBonus = toolBuildBonus;
    this.isTool = toolBashDamageBonus > 0 || toolBuildBonus > 0;
  }
}

export class ItemMeleeWeapon extends ItemWeapon {
  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemMeleeWeaponModel)) {
      throw new Error("model is not an ItemMeleeWeaponModel");
    }
  }

  get meleeWeaponModel(): ItemMeleeWeaponModel {
    return this.model as ItemMeleeWeaponModel;
  }

  get isFragile(): boolean {
    return this.meleeWeaponModel.isFragile;
  }

  get isTool(): boolean {
    return this.meleeWeaponModel.isTool;
  }

  get toolBashDamageBonus(): number {
    return this.meleeWeaponModel.toolBashDamageBonus;
  }

  get toolBuildBonus(): number {
    return this.meleeWeaponModel.toolBuildBonus;
  }
}

export enum AmmoType {
  LIGHT_PISTOL = 0,
  HEAVY_PISTOL = 1,
  SHOTGUN = 2,
  LIGHT_RIFLE = 3,
  HEAVY_RIFLE = 4,
  BOLT = 5,
  _COUNT = 6,
}

export class ItemRangedWeaponModel extends ItemWeaponModel {
  readonly ammoType: AmmoType;
  readonly maxAmmo: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    attack: Attack,
    ammoType: AmmoType,
    maxAmmo: number
  ) {
    super(aName, theNames, imageId, attack);
    this.ammoType = ammoType;
    this.maxAmmo = maxAmmo;
  }
}

export class ItemRangedWeapon extends ItemWeapon {
  ammo: number;
  readonly ammoType: AmmoType;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemRangedWeaponModel)) {
      throw new Error("model is not an ItemRangedWeaponModel");
    }
    this.ammo = model.maxAmmo;
    this.ammoType = model.ammoType;
  }

  get rangedWeaponModel(): ItemRangedWeaponModel {
    return this.model as ItemRangedWeaponModel;
  }
}

export class ItemAmmoModel extends ItemModel {
  readonly ammoType: AmmoType;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    ammoType: AmmoType,
    maxQuantity: number
  ) {
    super(aName, theNames, imageId);
    this.ammoType = ammoType;
    this.isStackable = true;
    this.stackingLimit = maxQuantity;
  }

  get maxQuantity(): number {
    return this.stackingLimit;
  }
}

export class ItemAmmo extends Item {
  readonly ammoType: AmmoType;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemAmmoModel)) {
      throw new Error("model is not an ItemAmmoModel");
    }
    this.ammoType = model.ammoType;
    this.quantity = model.maxQuantity;
  }
}
