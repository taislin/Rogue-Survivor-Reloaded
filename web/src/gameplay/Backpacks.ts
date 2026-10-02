import { Actor } from "@data/Actor";
import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { DollPart } from "@data/Doll";
import { Models } from "@data/Models";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { ItemBackpack } from "@engine/items/ItemBackpack";
import { Rules, type RuleResult } from "@engine/Rules";
import { Session } from "@engine/Session";
import { ItemID } from "@gameplay/GameItems";

/**
 * `Feature.ShelterBackpacks` — moving things between your pack and a backpack.
 *
 * Still Alive, Release 8-2. C# `Engine/Rules.cs:1508-1557` for the transfer rule,
 * `Engine/Rules.cs:1251-1280` for the two gates on picking a pack up, and
 * `Engine/RogueGame.cs:13851-13930` (`HandlePlayerSwapItemInventory`) for the
 * transfer itself. The pick-up gates are *rules* and live in `Rules`; this module
 * is the rest: constructing a pack, and the two-way move.
 *
 * ## Why the move is here and not in `RogueGame`
 *
 * The C# has it in `RogueGame` because the C# has its UI in `RogueGame` too, and
 * the move is reached from the mouse-inventory handler, the description popup and
 * the key command — three sites, one function, about eighty lines with the
 * interactive swap prompt still attached. The port splits it the other way: the
 * prompt is a modal key loop the UI layer owns, and *this* is the part worth
 * testing, so it is here with no dependency on a `RogueGame` at all. The report in
 * plans/BROWSER_PORT_PLAN §5.6d lists the three `RogueGame` call sites.
 *
 * ## No roller
 *
 * Nothing here rolls. The C#'s move is arithmetic on two inventories, not a chance.
 *
 * The C#'s `HandlePlayerSwapItemInventory` also has a `promptForSwap` branch for a
 * destination with no room, and after it an interactive loop that asks the player
 * to name a slot to swap with (`RogueGame.cs:13930-13962`). **That loop is not
 * ported.** What is ported is the guard *around* it — the C#'s
 * `if (!inv.IsFull || inv.CanAddAtLeastOne(it))`, which is checked before anything
 * moves — so a move into a full bag is refused with the bag-full reason exactly as
 * the C# refuses it, and the only thing missing is the follow-up offer to swap.
 * Nothing is silently dropped: `Inventory.addAsMuchAsPossible` never loses a
 * quantity, it only ever splits a stack across two slots.
 */

/** The C#'s "You aren't carrying a backpack." (`RogueGame.cs:13865`). */
export const NO_BACKPACK_REASON = "You aren't carrying a backpack.";

/** The C#'s refusal template, `RogueGame.cs:13901`. */
export function moveRefusalMessage(it: Item, backPack: ItemBackpack, reason: string): string {
  return `Can't move ${it.theName} to ${backPack.theName} : ${reason}.`;
}

/**
 * The backpack an actor is carrying, or `null`. C#'s
 * `Inventory.GetFirstByType(typeof(ItemBackpack))` inlined at each of its five
 * call sites (`RogueGame.cs:11337`, `:13869`, `:25393`, `:33122`, `Rules.cs:718`).
 *
 * Not gated, and that is deliberate: this is a *query*, not a behaviour, and it
 * answers `null` under CLASSIC because `makeBackpack` is the only thing in the
 * project that produces an `ItemBackpack` and it is gated. A gate here would be a
 * second answer to a question that already has one, and the two could disagree
 * after an edit — which is the thing `tests/feature-flags.test.ts` is for.
 */
export function firstBackpack(actor: Actor | null | undefined): ItemBackpack | null {
  return actor?.inventory?.getFirstByType(ItemBackpack) ?? null;
}

/** Is the actor's backpack open right now? C#'s `!backPack.IsEquipped`. */
export function isBackpackOpen(actor: Actor | null | undefined): boolean {
  return firstBackpack(actor)?.isOpen ?? false;
}

/**
 * A new backpack, or `null` when the ruleset has none.
 *
 * The C# has five near-identical factories for this — `MakeItemWaistPouch`
 * through `MakeItemArmyRucksack` (`BaseMapGenerator.cs:2375-2412`) — and the port
 * funnels them through here so there is exactly one place a pack can come into
 * being, and that place answers `null` under CLASSIC.
 *
 * `isForbiddenToAI` is set here rather than in five places because all five C#
 * factories set it, and because it is the flag the C#'s own comment at
 * `Rules.cs:655` leans on when it makes the one-backpack rule player-only: an NPC
 * that picked up a bag would lock the player out of carrying one, which is not a
 * state the fork wants reachable. `Rules.canActorGetItem` is the reader, and it
 * exempts the player — so a bag is exactly as usable by hand as any other item.
 */
export function makeBackpack(modelId: ItemID): ItemBackpack | null {
  if (!hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) return null;
  const pack = new ItemBackpack(Models.items.get(modelId));
  pack.isForbiddenToAI = true;
  return pack;
}

/**
 * Open the actor's backpack, by *unequipping* it.
 *
 * The C# has no "open" command. A pack is open exactly when it is not equipped
 * (`Rules.cs:1543`), so opening one is the ordinary unequip, and the C# gets there
 * through the generic equip toggle on the pack's own inventory slot. This is that
 * toggle, named, so the `RogueGame` call site is one line and the rule is
 * testable without a mouse.
 *
 * Note what this does *not* do, because the C# fuses two things into one function
 * and the fusion is the interesting part. `BlockAction` (`RogueGame.cs:33122-33142`)
 * answers "is a bag open?" and *then closes it* as a side effect, with one
 * exception: if the action being blocked is a **bump** — something the player cannot
 * walk into — it returns before the close, so a survivor who takes an item off the
 * ground or punches something keeps their bag open. `autoCloseBackpack` is the
 * close; the "is this a bump?" test stays in `RogueGame`, where the direction and
 * the walkability check already are.
 */
export function openBackpack(actor: Actor): RuleResult {
  if (!hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
    return { ok: false, reason: "not available in this ruleset" };
  }
  const backPack = firstBackpack(actor);
  if (!backPack) return { ok: false, reason: NO_BACKPACK_REASON };
  if (backPack.isOpen) return { ok: true, reason: "" };

  backPack.equippedPart = DollPart.NONE;
  return { ok: true, reason: "" };
}

/**
 * Close the actor's backpack by equipping it, and say whether one was closed.
 *
 * C# `RogueGame.cs:33122-33141`, the `checkBackpack` arm of `BlockAction`: "is
 * backpack open?" -> `DoEquipItem(m_Player, backPack, false)`. The C# has the
 * already-commented-out alternative (a `BACKPACK_DENIED_MESSAGE` and a "no go")
 * directly underneath, so the choice to close rather than refuse is the C#'s and
 * is kept.
 *
 * Returns whether it closed one, which is what `BlockAction` needs: the C# returns
 * `false` from `BlockAction` in both branches — having equipped the bag in one and
 * having short-circuited a bump in the other — so the caller goes ahead either way.
 * An actor with no bag, or a bag already equipped, is not a block and answers
 * `false`.
 */
export function autoCloseBackpack(actor: Actor): boolean {
  if (!hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) return false;
  const backPack = firstBackpack(actor);
  if (!backPack || !backPack.isOpen) return false;
  backPack.equippedPart = DollPart.BACK;
  return true;
}

/**
 * Move an item out of the actor's own pack and into their backpack.
 *
 * C# `RogueGame.cs:13876-13903`, the `!isBackpack` half. The order of operations
 * is the C#'s and each step is load-bearing:
 *
 *  1. the destination is asked whether it has *any* room, first, so a refusal for
 *     a reason the player can act on ("cannot go in backpacks") is not reported as
 *     a full bag;
 *  2. the rule, with `checkIsFull: false` -- the capacity question was step 1;
 * *  3. `addAsMuchAsPossible`, which tops up a matching stack and puts the
 *     remainder in a free slot, and only then removes the source item.
 *
 * Step 3's bookkeeping is `quantityAdded === quantityBefore`, and that is not the
 * naive reading of "did the whole stack cross". `addAsMuchAsPossible` reports the
 * *whole* quantity as added when it both topped a stack up **and** spilled the
 * remainder into a free slot (`Inventory.cs:174`), so a 12-round stack into a bag
 * holding 8 of the same thing with a limit of 10 becomes 10 and 10 across two
 * slots and the source item is correctly gone. The `false` branch — some quantity
 * accounted for, some not — is the one the C# leaves to its unbuilt prompt, and
 * `moveItemToBackpack` cannot reach it because step 1 already refused.
 *
 * `rules` is a parameter rather than a module singleton so the roller and the
 * `Session` are the caller's, and so a test can hand in a `Rules` it seeded. No
 * roll happens either way; the parameter is for the rule call and for the
 * possibility of a future one.
 */
export function moveItemToBackpack(rules: Rules, actor: Actor, it: Item): RuleResult {
  if (!hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
    return { ok: false, reason: "not available in this ruleset" };
  }
  const backPack = firstBackpack(actor);
  if (!backPack) return { ok: false, reason: NO_BACKPACK_REASON };

  const pack = backPack.backpackInventory;
  if (pack.isFull && !pack.canAddAtLeastOne(it)) {
    // Rules.cs:1553, verbatim.
    return { ok: false, reason: "backpack is full" };
  }

  const verdict = rules.canActorMoveItemToBackpack(actor, it, backPack, false);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  transfer(pack, actor.inventory!, it);
  return { ok: true, reason: "" };
}

/**
 * Move an item out of the backpack and into the actor's own pack.
 *
 * C# `RogueGame.cs:13904-13926`, the `isBackpack` half, which -- and this is the
 * surprise -- **does not call `CanActorMoveItemToBackpack` at all**. It only checks
 * that the actor's pack has room. That is not an oversight in the port: an item in
 * a backpack got there through gate 2 of that same rule, so re-asking on the way
 * out can only ever refuse something that was already let in, and it would refuse
 * it with the message "cannot go in backpacks" while the item is *in* the bag.
 *
 * Which is also why this one takes no `Rules`: the C# branch has no rule call in
 * it, and a parameter that is passed in and never used is a lie about what the
 * function checks. The asymmetry with `moveItemToBackpack` is the port's, and it is
 * deliberate.
 *
 * The no-room reason is `"your inventory is full"`, borrowed from
 * `Rules.cs:741` rather than invented. The C# emits no string in this branch — it
 * sets `promptForSwap` and lets the interactive loop say something — so the port
 * needs one, and borrowing the fork's own wording for the identical refusal is
 * better than writing a fourth way of saying it.
 */
export function moveItemToInventory(actor: Actor, it: Item): RuleResult {
  if (!hasFeature(Session.get().ruleset, Feature.ShelterBackpacks)) {
    return { ok: false, reason: "not available in this ruleset" };
  }
  const backPack = firstBackpack(actor);
  if (!backPack) return { ok: false, reason: NO_BACKPACK_REASON };

  const pack = backPack.backpackInventory;
  const own = actor.inventory!;
  if (own.isFull && !own.canAddAtLeastOne(it)) {
    return { ok: false, reason: "your inventory is full" };
  }

  transfer(own, pack, it);
  return { ok: true, reason: "" };
}

/**
 * The C#'s `AddAsMuchAsPossible` + `RemoveAllQuantity` pair, which appears twice
 * (`RogueGame.cs:13884-13890` and `:13912-13918`).
 *
 * The C# guards the removal with an `if (player.Inventory.Contains(it))`, which
 * this drops: `Inventory.removeAllQuantity` finds the item by identity and does
 * nothing when it is not there, so the guard is a spelling of the same no-op rather
 * than a check. Keeping it would be the kind of defensive code that reads as though
 * the invariant were in doubt.
 */
function transfer(to: Inventory, from: Inventory, it: Item): void {
  const quantityBefore = it.quantity;
  const { quantityAdded } = to.addAsMuchAsPossible(it);
  if (quantityAdded === quantityBefore) {
    from.removeAllQuantity(it);
  }
}
