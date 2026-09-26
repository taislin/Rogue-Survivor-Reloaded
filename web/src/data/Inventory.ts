import { Item } from "./Item";
import { ItemModel } from "./ItemModel";

export class Inventory {
  private readonly itemsList: Item[] = [];
  maxCapacity: number;

  constructor(maxCapacity: number) {
    if (maxCapacity < 0) {
      throw new RangeError("maxCapacity < 0");
    }
    this.maxCapacity = maxCapacity;
  }

  get items(): readonly Item[] {
    return this.itemsList;
  }

  get countItems(): number {
    return this.itemsList.length;
  }

  getItem(index: number): Item | null {
    if (index < 0 || index >= this.itemsList.length) return null;
    return this.itemsList[index];
  }

  get isEmpty(): boolean {
    return this.itemsList.length === 0;
  }

  get isFull(): boolean {
    return this.itemsList.length >= this.maxCapacity;
  }

  get topItem(): Item | null {
    if (this.itemsList.length === 0) return null;
    return this.itemsList[this.itemsList.length - 1];
  }

  get bottomItem(): Item | null {
    if (this.itemsList.length === 0) return null;
    return this.itemsList[0];
  }

  addAll(it: Item): boolean {
    const { stackList, stackedQuantity } = this.getItemsStackableWith(it);

    if (stackedQuantity === it.quantity && stackList) {
      let quantityLeft = it.quantity;
      for (const other of stackList) {
        const canStackOther = other.model.stackingLimit - other.quantity;
        const stackOther = Math.min(canStackOther, quantityLeft);
        this.addToStack(it, stackOther, other);
        quantityLeft -= stackOther;
        if (quantityLeft <= 0) break;
      }
      return true;
    }

    if (this.isFull) return false;

    this.itemsList.push(it);
    return true;
  }

  addAsMuchAsPossible(it: Item): { success: boolean; quantityAdded: number } {
    const startQuantity = it.quantity;
    const { stackList } = this.getItemsStackableWith(it);

    if (stackList && stackList.length > 0) {
      let quantityAdded = 0;
      for (const other of stackList) {
        const added = this.addToStack(it, it.quantity - quantityAdded, other);
        quantityAdded += added;
      }

      if (quantityAdded < it.quantity) {
        it.quantity -= quantityAdded;
        if (!this.isFull) {
          this.itemsList.push(it);
          quantityAdded = startQuantity;
        }
      } else {
        it.quantity = 0;
      }
      return { success: true, quantityAdded };
    }

    if (this.isFull) {
      return { success: false, quantityAdded: 0 };
    }

    const quantityAdded = it.quantity;
    this.itemsList.push(it);
    return { success: true, quantityAdded };
  }

  canAddAtLeastOne(it: Item): boolean {
    if (!this.isFull) return true;
    return this.hasAtLeastOneStackableWith(it);
  }

  removeAllQuantity(it: Item): void {
    const idx = this.itemsList.indexOf(it);
    if (idx !== -1) {
      this.itemsList.splice(idx, 1);
    }
  }

  consume(it: Item): void {
    it.quantity--;
    if (it.quantity <= 0) {
      this.removeAllQuantity(it);
    }
  }

  private addToStack(_from: Item, addThis: number, to: Item): number {
    let added = 0;
    while (addThis > 0 && to.quantity < to.model.stackingLimit) {
      to.quantity++;
      added++;
      addThis--;
    }
    return added;
  }

  private getItemsStackableWith(it: Item): { stackList: Item[] | null; stackedQuantity: number } {
    let stackedQuantity = 0;
    if (!it.model.isStackable) {
      return { stackList: null, stackedQuantity: 0 };
    }

    let stackList: Item[] | null = null;
    for (const other of this.itemsList) {
      if (
        other.model === it.model &&
        other.canStackMore &&
        !other.isEquipped
      ) {
        if (!stackList) stackList = [];
        stackList.push(other);

        const stackOnOther = other.model.stackingLimit - other.quantity;
        const wantToStack = Math.min(it.quantity - stackedQuantity, stackOnOther);
        stackedQuantity += wantToStack;

        if (stackedQuantity === it.quantity) break;
      }
    }

    return { stackList, stackedQuantity };
  }

  private hasAtLeastOneStackableWith(it: Item): boolean {
    if (!it.model.isStackable) return false;
    for (const other of this.itemsList) {
      if (
        other !== it &&
        other.model === it.model &&
        other.canStackMore &&
        !other.isEquipped
      ) {
        return true;
      }
    }
    return false;
  }

  contains(it: Item): boolean {
    return this.itemsList.includes(it);
  }

  defrag(): void {
    const n = this.itemsList.length;
    for (let i = 0; i < n; i++) {
      const mergeWith = this.itemsList[i];
      if (mergeWith.quantity > 0 && mergeWith.canStackMore) {
        for (let j = i + 1; j < n && mergeWith.canStackMore; j++) {
          const stealFrom = this.itemsList[j];
          if (stealFrom.model === mergeWith.model && stealFrom.quantity > 0) {
            const steal = Math.min(mergeWith.model.stackingLimit - mergeWith.quantity, stealFrom.quantity);
            mergeWith.quantity += steal;
            stealFrom.quantity -= steal;
          }
        }
      }
    }

    for (let i = this.itemsList.length - 1; i >= 0; i--) {
      if (this.itemsList[i].quantity <= 0) {
        this.itemsList.splice(i, 1);
      }
    }
  }

  getFirstByModel(model: ItemModel): Item | null {
    for (const it of this.itemsList) {
      if (it.model === model) return it;
    }
    return null;
  }

  /**
   * C# `GetSmallestStackByType` - the stack of exactly this type with the fewest
   * items, so consuming it leaves the larger stacks alone. Only the exact class
   * matches, like C#'s `it.GetType() == tt`.
   */
  getSmallestStackByType<T extends Item>(typeCtor: new (...args: any[]) => T, allowZeroQuantity = false): T | null {
    let smallest: T | null = null;
    let smallestQuantity = 0;

    for (const it of this.itemsList) {
      // C# compares GetType(), so subclasses do not match.
      if (it.constructor !== typeCtor) continue;
      const q = it.quantity;
      if (smallest === null || (q < smallestQuantity && (allowZeroQuantity || q > 0))) {
        smallest = it as T;
        smallestQuantity = q;
      }
    }
    return smallest;
  }

  getFirstByType<T extends Item>(typeCtor: new (...args: any[]) => T): T | null {
    for (const it of this.itemsList) {
      if (it instanceof typeCtor) return it;
    }
    return null;
  }

  hasItemOfType<T extends Item>(typeCtor: new (...args: any[]) => T): boolean {
    return this.getFirstByType(typeCtor) !== null;
  }

  getItemsByType<T extends Item>(typeCtor: new (...args: any[]) => T): T[] {
    const res: T[] = [];
    for (const it of this.itemsList) {
      if (it instanceof typeCtor) res.push(it);
    }
    return res;
  }

  getFirstMatching(predicate: (it: Item) => boolean): Item | null {
    for (const it of this.itemsList) {
      if (predicate(it)) return it;
    }
    return null;
  }

  countItemsMatching(predicate: (it: Item) => boolean): number {
    let count = 0;
    for (const it of this.itemsList) {
      if (predicate(it)) count++;
    }
    return count;
  }

  hasItemMatching(predicate: (it: Item) => boolean): boolean {
    return this.getFirstMatching(predicate) !== null;
  }

  filter(predicate: (it: Item) => boolean): Item[] {
    return this.itemsList.filter(predicate);
  }

  forEach(action: (it: Item) => void): void {
    this.itemsList.forEach(action);
  }

  getSmallestStackByModel(model: ItemModel, allowZeroQuantity = false): Item | null {
    let smallest: Item | null = null;
    let smallestQuantity = 0;
    for (const it of this.itemsList) {
      if (it.model === model) {
        const q = it.quantity;
        if (smallest === null || (q < smallestQuantity && (allowZeroQuantity || q > 0))) {
          smallest = it;
          smallestQuantity = q;
        }
      }
    }
    return smallest;
  }

}
