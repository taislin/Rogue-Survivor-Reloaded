import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { WorldTime } from "@engine/WorldTime";

export class ItemFoodModel extends ItemModel {
  readonly nutrition: number;
  readonly isPerishable: boolean;
  readonly bestBeforeDays: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    nutrition: number,
    bestBeforeDays: number
  ) {
    super(aName, theNames, imageId);
    this.nutrition = nutrition;
    if (bestBeforeDays < 0) {
      this.isPerishable = false;
      this.bestBeforeDays = -1;
    } else {
      this.isPerishable = true;
      this.bestBeforeDays = bestBeforeDays;
    }
  }
}

export class ItemFood extends Item {
  readonly nutrition: number;
  readonly isPerishable: boolean;
  readonly bestBefore: WorldTime | null = null;

  constructor(model: ItemModel, bestBeforeTurns?: number) {
    super(model);
    if (!(model instanceof ItemFoodModel)) {
      throw new Error("model is not an ItemFoodModel");
    }
    this.nutrition = model.nutrition;
    if (bestBeforeTurns !== undefined) {
      this.bestBefore = new WorldTime(bestBeforeTurns);
      this.isPerishable = true;
    } else {
      this.isPerishable = false;
    }
  }
}
