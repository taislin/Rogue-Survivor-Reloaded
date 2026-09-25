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

  constructor(aName: string, theNames: string, imageId: string) {
    this.singleName = aName;
    this.pluralName = theNames;
    this.imageId = imageId;
  }

  get isEquipable(): boolean {
    return this.equipmentPart !== DollPart.NONE;
  }
}
