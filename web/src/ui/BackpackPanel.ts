import { Item } from "@data/Item";
import { GROUNDINVENTORYPANEL_Y, INVENTORY_SLOTS_PER_LINE } from "@engine/RogueGame";
import { ItemBackpack } from "@engine/items/ItemBackpack";

/**
 * The nested-inventory panel: what a backpack looks like while it is open.
 *
 * Still Alive, Release 8-2. C# `RogueGame.cs:26893-26960`
 * (`DrawBackpackInventory`), the description branch at `RogueGame.cs:31966-31983`,
 * and the mouse lookup at `RogueGame.cs:11336-11351`.
 *
 * This is the *view model*, not the drawing. The port's HUD is a pile of pixel
 * offsets inside `RogueGame.ts` and its panel loop draws three inventories
 * (`RogueGame.ts:25390-25401`); adding a fourth one is a call there, not a new
 * class. What is worth having separately is the part that can be reasoned about
 * without a canvas: which slots the panel has, where it goes, and what it tells
 * the player about an item inside it.
 *
 * ## Why the panel reuses the ground panel's row
 *
 * C# `RogueGame.cs:56`:
 *
 *     const int BACKPACKPANEL_Y = GROUNDINVENTORYPANEL_Y;
 *
 * and `RogueGame.cs:25393-25400` sets `hideGroundInv = true` while a bag is open.
 * The fork did not add a fourth row to the side panel; it made the bag *take the
 * ground's row* and hid the ground — which is what that line's own abandoned
 * `//+124 to have it above the Inventory` comment is the remains of. That is why
 * `BACKPACK_PANEL_Y` here is an alias rather than an offset: a bag opened over a
 * corpse is a bag opened over a body, and the player loses the ground items for as
 * long as it is open.
 *
 * The panel is also drawn in `Color.BurlyWood` rather than `Color.White`
 * (`RogueGame.cs:26901`), so the player can tell at a glance which of the two grids
 * on the same row they are looking at.
 */

/** C# `RogueGame.cs:56`. The bag panel sits where the ground panel would be. */
/**
 * The row the backpack panel is drawn on, which the C# makes the *same row* as
 * the ground-items panel (`RogueGame.cs:56`: `BACKPACKPANEL_Y =
 * GROUNDINVENTORYPANEL_Y`).
 *
 * **A function, not a constant, and that is not a style choice.** `RogueGame` draws
 * the panel, so it imports this module; this module needs the ground row, so it
 * imports `RogueGame`. As a module-level `const` that cycle evaluated
 * `GROUNDINVENTORYPANEL_Y` before `RogueGame` had assigned it, so
 * `BACKPACK_PANEL_Y` was `undefined` and the panel drew at `y = undefined`.
 *
 * It typechecked. `GROUNDINVENTORYPANEL_Y` is declared `number`, and `undefined`
 * is what a `number` holds when nobody wrote to it yet -- which is the failure
 * mode this codebase keeps hitting: a value that is *typed* right and *is* wrong.
 * Reading it at use time, after both modules are loaded, is the fix; the
 * alternative was moving three layout constants into their own module, and that
 * grew to nine the moment `RIGHTPANEL_X` turned out to depend on two more.
 */
export const BACKPACK_PANEL_Y = (): number => GROUNDINVENTORYPANEL_Y;

/** C# `RogueGame.cs:25397`, the title `DrawBackpackInventory` draws. */
export const BACKPACK_PANEL_TITLE = "Backpack";

/**
 * Is the ground panel hidden while this bag is open?
 *
 * C# `RogueGame.cs:25395` (`hideGroundInv = true`). Not a property of the bag
 * alone -- it is a property of "this bag, open, right now" -- so it takes the bag
 * and asks.
 */
export function backpackHidesGroundPanel(backPack: ItemBackpack | null): boolean {
  return backPack !== null && backPack.isOpen;
}

/**
 * The bag's slots as rows, padded with `null` to its capacity.
 *
 * The C# draws exactly `pack.Inventory.MaxCapacity` slot sprites in
 * `slotsPerLine` columns (`RogueGame.cs:26908-26921`) and then walks
 * `inventory.Items` filling them, so a half-empty bag shows empty slots and the
 * grid is the same shape whatever is in it. That matters for the mouse lookup
 * too: `RogueGame.cs:11343-11346` turns a grid position into a flat index and
 * bounds-checks it against `MaxCapacity`, so the *slots*, not the contents, decide
 * which index a click means. Building the padded grid here means the draw loop and
 * the hit test cannot disagree about its shape.
 */
export function backpackPanelRows(backPack: ItemBackpack, slotsPerLine = INVENTORY_SLOTS_PER_LINE): (Item | null)[][] {
  const inv = backPack.backpackInventory;
  const rows: (Item | null)[][] = [];
  for (let i = 0; i < inv.maxCapacity; i += slotsPerLine) {
    const row: (Item | null)[] = [];
    for (let j = 0; j < slotsPerLine && i + j < inv.maxCapacity; j++) {
      row.push(inv.getItem(i + j));
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The keys the panel's description offers for an item sitting in a bag.
 *
 * `DESTROY_ITEM` is a Release 7-6 command the port has not added, so the string is
 * a parameter rather than a lookup: a caller that has the command passes
 * `s_KeyBindings.get(PlayerCommand.DESTROY_ITEM)`, and one that does not passes
 * `""` and the line is dropped rather than printed with an empty bracket. The one
 * command this feature owns, `SWAP_INVENTORY`, is in the port's `PlayerCommand` and
 * is bound to `Y`.
 */
export interface BackpackDescriptionKeys {
  destroy: string;
  moveToInventory: string;
}

/**
 * The description of an item *in a backpack*, which is deliberately much shorter
 * than the one in your own pack.
 *
 * C# `RogueGame.cs:31966-31983`: `DescribeItemLong` takes an
 * `isBackpackInventory` flag and returns four lines before it reaches any of the
 * per-subclass descriptions -- no unbreakable note, no weapon stats, no flavour
 * text, no equip/use/drop/give line. Two lines of "what is this" and two of "what
 * can I do with it", for a panel that is a slot grid rather than the main
 * inventory.
 *
 * The stacking line is the C#'s own (`RogueGame.cs:31966-31970`): a stackable
 * item shows `quantity/limit`, everything else shows just the name. The C# calls
 * `DescribeItemShort` for the name, which is a *method on the game* because it
 * needs the world's clock and the player (spoiled food, a trap that is yours);
 * here the caller passes the already-short name, because this module is not
 * allowed to know about either.
 */
export function describeItemInBackpack(
  it: Item,
  shortName: string,
  keys: BackpackDescriptionKeys,
): string[] {
  const lines: string[] = [];
  if (it.model.isStackable) {
    lines.push(`${shortName} ${it.quantity}/${it.model.stackingLimit}`);
  } else {
    lines.push(shortName);
  }
  lines.push(" ");
  lines.push("----");
  if (keys.destroy) lines.push(`to destroy : <${keys.destroy}>`);
  if (keys.moveToInventory) lines.push(`to move to inventory : <${keys.moveToInventory}>`);
  return lines;
}
