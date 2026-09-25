import { DollPart } from "./Doll";
import { Models } from "./Models";
import type { ItemModel } from "./ItemModel";

export class Item {
  private modelId: number;
  private _quantity: number = 1;
  equippedPart: DollPart = DollPart.NONE;
  isUnique: boolean = false;
  isForbiddenToAI: boolean = false;

  constructor(model: ItemModel) {
    this.modelId = model.id;
    this._quantity = 1;
    this.equippedPart = DollPart.NONE;
  }

  get model(): ItemModel {
    return Models.items.get(this.modelId);
  }

  get imageId(): string {
    return this.model.imageId;
  }

  get theName(): string {
    const m = this.model;
    if (m.isProper) return m.singleName;
    if (this._quantity > 1 || m.isPlural) {
      return `some ${m.pluralName}`;
    }
    return `the ${m.singleName}`;
  }

  get aName(): string {
    const m = this.model;
    if (m.isProper) return m.singleName;
    if (this._quantity > 1 || m.isPlural) {
      return `some ${m.pluralName}`;
    }
    if (m.isAn) {
      return `an ${m.singleName}`;
    }
    return `a ${m.singleName}`;
  }

  get quantity(): number {
    return this._quantity;
  }

  set quantity(val: number) {
    this._quantity = Math.max(0, val);
  }

  get canStackMore(): boolean {
    const m = this.model;
    return m.isStackable && this._quantity < m.stackingLimit;
  }

  get isEquipped(): boolean {
    return this.equippedPart !== DollPart.NONE;
  }
}
