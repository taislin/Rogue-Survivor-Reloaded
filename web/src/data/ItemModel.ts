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

  constructor(aName: string, theNames: string, imageId: string) {
    this.singleName = aName;
    this.pluralName = theNames;
    this.imageId = imageId;
  }

  get isEquipable(): boolean {
    return this.equipmentPart !== DollPart.NONE;
  }
}
