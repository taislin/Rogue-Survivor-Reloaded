import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { ItemModel } from "@data/ItemModel";

/**
 * A wearable bag with its own `Inventory`. Still Alive, Release 8-2.
 *
 * C# `ItemBackpackModel` (`Engine/Items/ItemBackpackModel.cs:11`) and
 * `ItemBackpack` (`Engine/Items/ItemBackpack.cs:13`). The two are one file here
 * because the item is a *holder* and holds nothing but the model's three numbers;
 * every other item class in `engine/items` splits the same way, and this one has
 * no second class to be worth.
 *
 * The C#'s own arithmetic is kept rather than tidied: `Inventory_Slots` is
 * `Math.Min(inventory_slots, 10)`, and the CSV's largest row is already 10, so the
 * clamp never fires today. It is here because it is the *only* thing standing
 * between a data edit and a 40-slot pack, and because `Rules.CanActorTakeBackpack`
 * reads the clamped number -- so a row above 10 would raise the Hauler tier the
 * player is asked for without ever telling them why.
 */
export class ItemBackpackModel extends ItemModel {
  readonly inventorySlots: number;
  readonly encumbrance: number;
  readonly weight: number;

  constructor(
    aName: string,
    theNames: string,
    imageId: string,
    inventorySlots: number,
    encumbrance: number,
    weight: number,
  ) {
    super(aName, theNames, imageId);
    this.inventorySlots = Math.min(inventorySlots, 10);
    this.encumbrance = encumbrance;
    this.weight = weight;
  }
}

export class ItemBackpack extends Item {
  /**
   * C# `ItemBackpack.m_Inventory` (`ItemBackpack.cs:16`), named for the save file
   * rather than for the C# property: a bare `inventory` on an `Item` reads like
   * the carrier's own pack, which is the confusion this whole feature exists to
   * avoid.
   *
   * An *own* field and not a getter over the model, because the capacity is the
   * model's but the contents are per-item state -- the same `satchel` model gives
   * every satchel in the world its own four slots.
   */
  backpackInventory: Inventory;

  constructor(model: ItemModel) {
    super(model);
    const backpackModel = model as ItemBackpackModel;
    if (!(backpackModel instanceof ItemBackpackModel)) {
      throw new Error("model is not a BackpackModel");
    }
    this.backpackInventory = new Inventory(backpackModel.inventorySlots);
  }

  get backpackModel(): ItemBackpackModel {
    return this.model as ItemBackpackModel;
  }

  get inventorySlots(): number {
    return this.backpackModel.inventorySlots;
  }

  get encumbrance(): number {
    return this.backpackModel.encumbrance;
  }

  get weight(): number {
    return this.backpackModel.weight;
  }

  /**
   * Is the pack open? C# has no `IsOpen` -- it reads `!IsEquipped` at each of its
   * sites (`RogueGame.cs:25395` for the panel, `RogueGame.cs:11339` for the mouse,
   * `Rules.cs:1543` for the gate, and `Rules.cs:1253` which asks the *other* way
   * round and does not care). Naming it once is the point: the C#'s convention is
   * *inverted*, an open backpack is one that is not equipped, so a reader who
   * assumes the usual meaning gets the gate exactly backwards and a survivor can
   * only restock a bag they are wearing.
   */
  get isOpen(): boolean {
    return !this.isEquipped;
  }
}
