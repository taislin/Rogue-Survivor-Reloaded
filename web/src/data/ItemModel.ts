import { DollPart } from "./Doll";

export class ItemModel {
  id: number = 0;
  readonly singleName: string;
  readonly pluralName: string;
  readonly imageId: string;
  isPlural: boolean = false;
  isAn: boolean = false;
  isProper: boolean = false;
  flavorDescription: string = "";
  isStackable: boolean = false;
  stackingLimit: number = 1;
  equipmentPart: DollPart = DollPart.NONE;
  dontAutoEquip: boolean = false;
  isUnbreakable: boolean = false;
  /**
   * A light you can throw down. Still Alive, Release 7-1.
   *
   * The C# puts this on `ItemModel` rather than `ItemLightModel` even though only
   * two items set it (a flare and a glowstick), and `DarknessFov` 2b reads it as
   * "a light on the ground that counts as a light source". It is here rather than
   * on the light model to match, but nothing outside the two uses it.
   */
  isThrowable: boolean = false;
  /**
   * Booze, cigarettes and energy drinks. Still Alive, Release 5-7.
   *
   * They are `ItemMedicine` for historical reasons -- they heal a point of
   * sanity and nothing else -- so every "is it medicine?" question has to
   * exclude them. Two readers care today: the despawn whitelist, which keeps
   * real medicine but lets a dropped beer bottle rot away, and the
   * "Don't waste medicine!" check, which must not refuse a beer because the
   * actor's sanity is already full.
   *
   * Set unconditionally rather than behind the flag: it is data with no
   * vanilla reader, so CLASSIC behaviour is unchanged either way, and gating
   * a model field would mean the flag could not be trusted by a future reader.
   */
  isRecreational: boolean = false;
  /**
   * May this item be stowed in a backpack? Still Alive, Release 8-2.
   *
   * C# `ItemModel.m_CanGoInBackpacks` (`Data/ItemModel.cs:26`). It is a field on
   * the base model rather than on `ItemBackpackModel` for the same reason
   * `isThrowable` is: the reader is `Rules.CanActorMoveItemToBackpack`
   * (`Rules.cs:1534`), which is handed a plain `Item` and would otherwise have to
   * downcast before it could ask the question at all.
   *
   * Default false, and the C# sets it on 121 of its 187 models by hand rather than
   * by any rule -- a combat knife may go in a bag and a crowbar may not, a pistol
   * may and a hunting rifle may not. So this is a curated list and the port carries
   * it as one (`GameItems.CAN_GO_IN_BACKPACKS`), not as a derivation from
   * `isEquipable`: deriving it would "fix" the knife and silently un-fix the rifle.
   *
   * Set unconditionally rather than behind `Feature.ShelterBackpacks`, for the
   * same reason as `isRecreational`: it is data with no CLASSIC reader, and a
   * model field that could be wrong for want of a flag is not a field a later
   * reader can trust.
   */
  canGoInBackpacks: boolean = false;

  /**
   * C# `ItemModel.m_CausesTileFires` (`Data/ItemModel.cs:127-129`), Release 7-3.
   * "Chance to set tile on fire with explosions (eg fuel pumps), ie. not the direct
   * attack but a secondary effect."
   *
   * **On `ItemModel` and not on `ItemExplosiveModel`, and that placement is
   * load-bearing.** The C# puts it on the base class, and its sibling
   * `IsFlameWeapon` has to be there for the same reason: `RogueGame.cs:18742`,
   * `:18791`, `:18828`, `:18873` and `:18992` read `IsFlameWeapon` off a *ranged
   * weapon* model, and `BaseAI.cs:4549` reads it too. Putting either on the
   * explosive subclass would leave the flamethrower unable to carry it.
   *
   * Read once in the port, by `ApplyExplosionDamage`'s tile-fire seeding, which
   * mirrors `RogueGame.cs:20036`:
   *
   * ```csharp
   * if (itemModel.IsFlameWeapon || itemModel.CausesTileFires)
   *     SetTileOnFire(map, x, y, true);
   * ```
   *
   * Only `Feature.FuelStation` reads it so far, and only via
   * `ExplosionChainReactionInventory`/`ExplodeFuelPump` priming a fuel pump. Note
   * `ItemGrenadePrimedModel` copies its fields from the unprimed model *by hand*
   * rather than inheriting, so a primed explosive has to be given this flag a second
   * time or its explosions seed no fires — the C# does exactly that, at
   * `GameItems.cs:2323-2324` and `:2410`.
   */
  causesTileFires: boolean = false;

  constructor(aName: string, theNames: string, imageId: string) {
    this.singleName = aName;
    this.pluralName = theNames;
    this.imageId = imageId;
  }

  get isEquipable(): boolean {
    return this.equipmentPart !== DollPart.NONE;
  }
}
