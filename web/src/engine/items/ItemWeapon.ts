import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { Attack, AttackKind } from "@data/Attack";

export class ItemWeaponModel extends ItemModel {
  readonly attack: Attack;
  /**
   * Still Alive encumbrance: subtracted from the wielder's speed.
   *
   * The C# puts this on the two subclasses rather than the base —
   * `ItemMeleeWeaponModel.Weight` is a settable property assigned in an object
   * initialiser, `ItemRangedWeaponModel`'s is a positional constructor argument
   * (Release 7-6) — so there is no common declaration to port. It lives on the
   * base here because `Rules.actorSpeed` reads it off whatever weapon is
   * equipped, and the default of 0 is what every weapon the port already had
   * means: the `WEIGHT` column did not exist in vanilla Alpha 10.1, so nothing
   * weighs anything under CLASSIC even with the flag on.
   */
  readonly weight: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    attack: Attack,
    weight: number = 0,
  ) {
    super(aName, theNames, imageId);
    this.attack = attack;
    this.weight = weight;
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
    toolBuildBonus: number = 0,
    weight: number = 0
  ) {
    super(aName, theNames, imageId, attack, weight);
    this.isFragile = isFragile;
    this.toolBashDamageBonus = toolBashDamageBonus;
    this.toolBuildBonus = toolBuildBonus;
    // C#: `ToolBashDamageBonus != 0 || ToolBuildBonus != 0` (ItemMeleeWeaponModel.cs:18).
    // The port had `> 0`, which differs only for a *negative* tool bonus. Every
    // shipped value is non-negative so the two agree on all 16 melee weapons
    // today, and it would have stayed a latent difference indefinitely: a later
    // item with a penalty would silently not count as a tool.
    this.isTool = toolBashDamageBonus !== 0 || toolBuildBonus !== 0;
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
  // Still Alive's additions, appended in the fork's order
  // (ItemAmmoModel.cs:17-24). The first six are byte-identical to vanilla's,
  // which is what makes the append safe: a save that stored an AmmoType stores
  // the number, so anything below BOLT is a new weapon rather than a renamed
  // one. NAIL is Release 5-1, PRECISION_RIFLE 6-6, FUEL 7-1, CHARGE 7-2, and
  // MINIGUN/GRENADES/PLASMA 7-6.
  NAIL = 6,
  PRECISION_RIFLE = 7,
  FUEL = 8,
  CHARGE = 9,
  MINIGUN = 10,
  GRENADES = 11,
  PLASMA = 12,
  _COUNT = 13,
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
    maxAmmo: number,
    weight: number = 0
  ) {
    super(aName, theNames, imageId, attack, weight);
    this.ammoType = ammoType;
    this.maxAmmo = maxAmmo;
  }

  get isFireArm(): boolean {
    return this.attack.kind === AttackKind.FIREARM;
  }

  get isBow(): boolean {
    return this.attack.kind === AttackKind.BOW;
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
