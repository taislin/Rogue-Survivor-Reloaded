import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";
import { WorldTime } from "@engine/WorldTime";

export class ItemFoodModel extends ItemModel {
  readonly nutrition: number;
  readonly isPerishable: boolean;
  readonly bestBeforeDays: number;
  /**
   * Still Alive's `Causes food poisoning?` and `Can be cooked?`, both default 0.
   *
   * `canCauseFoodPoisoning` has a reader (`Rules.contractFoodPoisoning`).
   * `canBeCooked` does not yet: cooking arrives with the `Cooking` feature, and
   * the column is already merged so the data is staged ahead of the reader.
   */
  readonly canCauseFoodPoisoning: boolean;
  readonly canBeCooked: boolean;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    nutrition: number,
    bestBeforeDays: number,
    canCauseFoodPoisoning: boolean = false,
    canBeCooked: boolean = false
  ) {
    super(aName, theNames, imageId);
    this.nutrition = nutrition;
    this.canCauseFoodPoisoning = canCauseFoodPoisoning;
    this.canBeCooked = canBeCooked;
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
  /** Copied from the model, as `ItemFood.cs:62` does. */
  readonly canCauseFoodPoisoning: boolean;
  readonly canBeCooked: boolean;
  /**
   * How cooked this is, and how cooked it needs to be. Still Alive, Release 7-6.
   *
   * Mutable, unlike the flags: cooking is a property of *this piece of food* and
   * of how long it has sat by the fire, not of the row it came from. Four turns by
   * a fire, per `ItemFood.cs:66`, so the fourth pass finishes it.
   */
  cookedDegree: number = 0;
  readonly maxCookedDegree: number = 4;

  constructor(model: ItemModel, bestBeforeTurns?: number) {
    super(model);
    if (!(model instanceof ItemFoodModel)) {
      throw new Error("model is not an ItemFoodModel");
    }
    this.nutrition = model.nutrition;
    this.canCauseFoodPoisoning = model.canCauseFoodPoisoning;
    this.canBeCooked = model.canBeCooked;
    if (bestBeforeTurns !== undefined) {
      this.bestBefore = new WorldTime(bestBeforeTurns);
      this.isPerishable = true;
    } else {
      this.isPerishable = false;
    }
  }
}
