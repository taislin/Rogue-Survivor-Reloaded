import { DollPart } from "./Doll";
import { Models } from "./Models";
import type { ItemModel } from "./ItemModel";

export class Item {
  private modelId: number;
  private _quantity: number = 1;
  equippedPart: DollPart = DollPart.NONE;
  isUnique: boolean = false;
  isForbiddenToAI: boolean = false;
  /**
   * The turn this was last put on the ground by an NPC, or `null`.
   *
   * Still Alive, Release 7-6. Deliberately a *nullable* stamp rather than a
   * boolean "junk" flag: the despawn sweep compares it against the current
   * turn, so an item dropped on turn 100 and one dropped on turn 5000 are
   * treated differently, and picking the item back up clears it.
   *
   * A plain own field, so the graph writer carries it with no spec entry --
   * the same as `Actor.isFoodPoisoned`.
   */
  droppedOnTurnNumber: number | null = null;

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

  /**
   * C# `Item.OptimizeBeforeSaving` (`src/Data/Item.cs:111`) — a no-op on the base
   * class, overridden by `ItemEntertainment` and `ItemTrap`.
   *
   * The C# calls it from the whole object graph before serialising
   * (`Session.Save` → `World` → `District` → `Map`/`Actor`/`Inventory` →
   * `Item`), and its whole purpose is to drop references to dead actors so they
   * are not written to disk. It is not cosmetic: without it a save captures
   * corpses it does not need, and — the reachable consequence — a *revived*
   * actor still counts as bored of an entertainment item, because the C# comment
   * at `ItemEntertainment.cs:53` says so outright.
   *
   * Called by `Session.optimizeBeforeSaving`, which `Session.save` runs first,
   * so anything added here has to be reached from an item that is actually in
   * the world. The traversal deliberately follows the C#'s own shape rather than
   * the save graph's: an item can be in a `MapObject` container, on a corpse, in
   * an actor's inventory, or in a tile's item stack.
   */
  optimizeBeforeSaving(): void {
    // C#: `public virtual void OptimizeBeforeSaving() { }`
  }
}
