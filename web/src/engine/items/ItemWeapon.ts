import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { Attack, AttackKind } from "@data/Attack";

export class ItemWeaponModel extends ItemModel {
  readonly attack: Attack;
  /**
   * Can this be held in one hand? Still Alive, Release 7-2.
   *
   * **The C# declares it twice and there is no common declaration to port**, the
   * same asymmetry as `weight` below and for the same reason. A melee value is a
   * settable property, `ItemMeleeWeaponModel.IsOneHanded`
   * (`ItemMeleeWeaponModel.cs:14`), so it is assigned in an object initialiser at
   * each of the 37 melee construction sites. A ranged value is a positional
   * constructor argument instead: `ItemRangedWeaponModel`'s property
   * (`ItemRangedWeaponModel.cs:43`) returns the private `m_IsOneHanded` field
   * (`:13`), which the constructor's `isOneHanded` parameter assigns (`:72`) --
   * the **eighth** parameter, sitting between `isSingleShot` and `weight` (`:66`).
   * One meaning, two shapes, and `OnEquipItem` has to read both through a single
   * local for exactly that reason. It lives on the base here for the reason `weight`
   * gives: one declaration, one comment, and the readers do not have to care which
   * subclass they were handed.
   *
   * **It is hand-set per model, and the table shape makes that a trap.** There is
   * no `ISONEHANDED` column in `Items_MeleeWeapons.csv` or
   * `Items_RangedWeapons.csv` -- those headers stop at `FLAVOR` -- and the
   * reference never reads one: all 37 melee and all 22 of its ranged values are
   * literals written out at the construction site.
   * So unlike `WEIGHT`, which arrived as a column and is read as `d.WEIGHT`, this
   * is a `oneHanded: true` on the `meleeMap`/`rangedMap` row and nothing else.
   * Writing `d.ISONEHANDED` would be `undefined` for every weapon and quietly give
   * all of them the default below, which is the failure this comment is here to
   * prevent: it looks like data, so the natural assumption is that it is data.
   *
   * The default is `false` -- two-handed -- and that is the C#'s rather than an
   * arbitrary choice: a C# `bool` property that is never assigned reads `false`,
   * and the fork assigns this one on every model it registers. The two directions
   * of error are not symmetric, because the field is read as `!isOneHanded`: a
   * weapon wrongly marked one-handed keeps a shield that should have been dropped,
   * and a weapon wrongly marked two-handed is dropped off the actor's arm every
   * time anything is equipped.
   */
  readonly isOneHanded: boolean;
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
    isOneHanded: boolean = false,
    weight: number = 0,
  ) {
    super(aName, theNames, imageId);
    this.attack = attack;
    this.isOneHanded = isOneHanded;
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

  /**
   * C# `ItemMeleeWeapon.IsOneHanded` (`ItemMeleeWeapon.cs:16-19`) and
   * `ItemRangedWeapon.IsOneHanded` (`ItemRangedWeapon.cs:27-30`), Release 7-2.
   *
   * The C# writes out that same one-line pass-through on both concrete items, and
   * it is on the *item* rather than the model because that is where the shield
   * guard reads it: `OnEquipItem` has a `ItemMeleeWeapon` from
   * `getEquippedMeleeWeapon()` and asks that for one-handedness
   * (`RogueGame.cs:21034`), not the model it would have to cast back down to.
   * One getter here covers both, since the field itself is on the shared base
   * model.
   */
  get isOneHanded(): boolean {
    return this.weaponModel.isOneHanded;
  }
}

export class ItemMeleeWeaponModel extends ItemWeaponModel {
  /**
   * Can this be used to butcher a corpse? Still Alive, Release 7-6.
   *
   * The C#'s rule is "an equipped bladed weapon", and the thirteen models that
   * satisfy it are a *list* -- a combat knife and a chainsaw qualify, a frying pan
   * and a baseball bat do not. It is on the model rather than derived from
   * `isFragile` or the weapon's verb, because "is it sharp" is not a number the
   * melee model already carries.
   */
  readonly canUseForButchering: boolean;
  readonly isFragile: boolean;
  readonly isTool: boolean;
  readonly toolBashDamageBonus: number;
  readonly toolBuildBonus: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    attack: Attack,
    canUseForButchering: boolean = false,
    isFragile: boolean = false,
    toolBashDamageBonus: number = 0,
    toolBuildBonus: number = 0,
    // Still Alive, Release 7-2. The C# assigns this one in an object initialiser
    // rather than passing it (`ItemMeleeWeaponModel.cs:14`), so there is no
    // argument position to match; it is positional here because the port's melee
    // constructor already carries the fork's `CanUseForButchering`, `IsFragile`,
    // `ToolBashDamageBonus` and `ToolBuildBonus` that way. `isOneHanded` before
    // `weight` so both weapon constructors end in the same `..., isOneHanded,
    // weight` order, which is also the C#'s ranged signature order.
    isOneHanded: boolean = false,
    weight: number = 0
  ) {
    super(aName, theNames, imageId, attack, isOneHanded, weight);
    this.canUseForButchering = canUseForButchering;
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
    // **The first two are swapped relative to the C# and deliberately left so.**
    // `ItemRangedWeaponModel.cs:66` reads
    // `(..., Attack attack, int maxAmmo, AmmoType ammoType, bool isSingleShot,
    //   bool isOneHanded, int weight)`; this port has always taken
    // `ammoType, maxAmmo`. Reordering would touch the one `GameItems` call site for
    // no behaviour change and would make the two signatures harder to compare by
    // eye, which is the only reason the C# argument order is worth recording. The
    // *tail* order is unchanged and is the part that matters here: `isOneHanded`
    // sits between `isSingleShot` and `weight` in both, so the literal in a C#
    // construction site is at the same offset in each.
    ammoType: AmmoType,
    maxAmmo: number,
    // Still Alive, Release 7-2. C# `:66` and `:72`; see the base field's comment for
    // why it is the eighth argument rather than a property. `isSingleShot` (C#
    // `:66`, Release 6-6) is not ported and so is absent here, which is why this is
    // the seventh parameter and not the eighth -- see the note at the `GameItems`
    // call site.
    isOneHanded: boolean = false,
    weight: number = 0
  ) {
    super(aName, theNames, imageId, attack, isOneHanded, weight);
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
