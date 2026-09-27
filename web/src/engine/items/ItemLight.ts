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
    // C# sets this in the constructor (ItemLightModel.cs:42), so it applies to
    // every light regardless of what GameItems does. Without it, picking up a
    // flashlight auto-equips it and silently swaps out whatever was in your
    // left hand (RogueGame.DoTakeItem auto-equips any item whose part is free
    // and `!dontAutoEquip`). Every other subclass that sets this was ported.
    this.dontAutoEquip = true;
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
