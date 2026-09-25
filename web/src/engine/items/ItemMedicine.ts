import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";

export class ItemMedicineModel extends ItemModel {
  readonly healing: number;
  readonly staminaBoost: number;
  readonly sleepBoost: number;
  readonly infectionCure: number;
  readonly sanityCure: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    healing: number,
    staminaBoost: number,
    sleepBoost: number,
    infectionCure: number,
    sanityCure: number
  ) {
    super(aName, theNames, imageId);
    this.healing = healing;
    this.staminaBoost = staminaBoost;
    this.sleepBoost = sleepBoost;
    this.infectionCure = infectionCure;
    this.sanityCure = sanityCure;
  }
}

export class ItemMedicine extends Item {
  readonly healing: number;
  readonly staminaBoost: number;
  readonly sleepBoost: number;
  readonly infectionCure: number;
  readonly sanityCure: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemMedicineModel)) {
      throw new Error("model is not an ItemMedicineModel");
    }
    this.healing = model.healing;
    this.staminaBoost = model.staminaBoost;
    this.sleepBoost = model.sleepBoost;
    this.infectionCure = model.infectionCure;
    this.sanityCure = model.sanityCure;
  }
}
