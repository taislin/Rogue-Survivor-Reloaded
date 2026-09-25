import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";

export class ItemLightModel extends ItemModel {
  readonly fovBonus: number;
  readonly maxBatteries: number;
  readonly outOfBatteriesImageId: string;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    fovBonus: number,
    maxBatteries: number,
    outOfBatteriesImageId: string
  ) {
    super(aName, theNames, imageId);
    this.fovBonus = fovBonus;
    this.maxBatteries = maxBatteries;
    this.outOfBatteriesImageId = outOfBatteriesImageId;
  }
}

export class ItemLight extends Item {
  private _batteries: number;

  constructor(model: ItemModel) {
    super(model);
    if (!(model instanceof ItemLightModel)) {
      throw new Error("model is not an ItemLightModel");
    }
    this._batteries = model.maxBatteries;
  }

  get lightModel(): ItemLightModel {
    return this.model as ItemLightModel;
  }

  get batteries(): number {
    return this._batteries;
  }

  set batteries(val: number) {
    this._batteries = Math.max(0, Math.min(val, this.lightModel.maxBatteries));
  }

  get fovBonus(): number {
    return this.lightModel.fovBonus;
  }

  get isFullyCharged(): boolean {
    return this._batteries >= this.lightModel.maxBatteries;
  }

  override get imageId(): string {
    if (this.isEquipped && this._batteries > 0) {
      return super.imageId;
    }
    return this.lightModel.outOfBatteriesImageId;
  }
}
