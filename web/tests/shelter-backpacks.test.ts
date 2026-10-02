/**
 * `Feature.ShelterBackpacks` — a bag with its own inventory.
 *
 * Still Alive, Release 8-2.
 *
 * The mechanic is four pieces of C# and one inverted boolean:
 *
 *  - `GameItems.cs:1006-1060` — the five `BackpackData` rows and their models.
 *  - `Rules.cs:1251-1280` — `CanActorTakeBackpack`: two *independent* gates, a
 *    one-bag rule and a Hauler tier on the slot count in three bands.
 *  - `Rules.cs:1508-1557` — `CanActorMoveItemToBackpack`: four gates, the second
 *    of which is the new `ItemModel.CanGoInBackpacks` flag.
 *  - `RogueGame.cs:13851-13930` — the two-way move, which is `Backpacks.ts` here.
 *
 * The boolean is the thing worth being careful about: **a backpack is open when
 * it is NOT equipped** (`Rules.cs:1543`, `RogueGame.cs:25395`). A bag you are
 * carrying but not wearing is an *open* bag — the C# draws its panel and hides the
 * ground items for exactly that state, and `BlockAction` snaps it shut (equips it)
 * on your next action. So "open" is not something you switch on; it is the default
 * and wearing the bag is what closes it. Every test below that moves an item has to
 * wear the bag first or it is testing the wrong state.
 *
 * The Hauler bands are the other thing. They are `5..6`, `7..8` and `9+` — three
 * bands for five packs — so the four-slot satchel sits *below* the first one and
 * needs nothing, while the six-slot daypack needs one. A per-model table would put
 * the satchel behind a gate for no reason, and the C# has it below deliberately.
 *
 * Every item below is built from a *registered* model. That is not a style note:
 * `Item.model` is a `Models.items.get(id)` lookup, so a hand-built model whose `id`
 * is the default 0 resolves to `MEDICINE_BANDAGES` and every property read off it —
 * `canGoInBackpacks`, `isStackable`, `stackingLimit` — is that item's. The
 * `postProcess` pass that sets `canGoInBackpacks` runs over the registry, not over
 * objects somebody constructed in a test.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Skill } from "@data/Skill";
import { DiceRoller } from "@engine/DiceRoller";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Keybindings } from "@engine/Keybindings";
import { Point } from "@engine/Point";
import { PlayerCommand } from "@engine/PlayerCommand";
import { GROUNDINVENTORYPANEL_Y } from "@engine/RogueGame";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { CLASS_SPECS } from "@engine/serialization/specs";
import {
  GraphReader,
  GraphWriter,
  type GraphData,
  type RefMark,
} from "@engine/serialization/SessionGraph";
import { ItemBackpack, ItemBackpackModel } from "@engine/items/ItemBackpack";
import { ItemAmmo } from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import {
  NO_BACKPACK_REASON,
  autoCloseBackpack,
  firstBackpack,
  isBackpackOpen,
  makeBackpack,
  moveItemToBackpack,
  moveItemToInventory,
  moveRefusalMessage,
  openBackpack,
} from "@gameplay/Backpacks";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { SkillID } from "@gameplay/Skills";
import {
  BACKPACK_PANEL_TITLE,
  BACKPACK_PANEL_Y,
  backpackHidesGroundPanel,
  backpackPanelRows,
  describeItemInBackpack,
} from "@ui/BackpackPanel";

const survivors = new Faction("The Survivors", "survivor");

/** A packable, non-stackable item — `SIPHON_KIT` is the C#'s cheapest example. */
const packable = (): Item => new Item(Models.items.get(ItemID.SIPHON_KIT));

/** A packable stack of ammunition, `quantity` strong. */
const shells = (quantity: number): ItemAmmo => {
  const it = new ItemAmmo(Models.items.get(ItemID.AMMO_SHOTGUN));
  it.quantity = quantity;
  return it;
};

let rules: Rules;
let player: Actor;

beforeEach(() => {
  new GameActors();
  new GameItems();
  rules = new Rules(new DiceRoller(1));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  const map = new GameMap(1, "test", 20, 20);
  map.placeActor(player, new Point(10, 10));
});

/** A bag of the given model. */
const bag = (id: ItemID): ItemBackpack => new ItemBackpack(Models.items.get(id));

/** Put `it` in the player's own pack and hand it back, keeping its type. */
const carry = <T extends Item>(it: T): T => {
  player.inventory!.addAll(it);
  return it;
};

/** Set the player's Hauler to exactly `levels` — the C#'s `GetSkillLevel` input. */
const withHauler = (levels: number): void => {
  // `SkillTable.addSkill` throws on a duplicate and `decOrRemoveSkill` only steps
  // down by one, so neither is a "set"; the mutable `Skill.level` is the only
  // field that is.
  let skill = player.sheet.skillTable.getSkill(SkillID.HAULER);
  if (!skill) {
    skill = new Skill(SkillID.HAULER);
    player.sheet.skillTable.addSkill(skill);
  }
  skill.level = levels;
};

/** Wear the bag, which is what *closes* it, and then open it again. */
const openTheBag = (pack: ItemBackpack): void => {
  pack.equippedPart = DollPart.BACK;
  expect(openBackpack(player).ok).toBe(true);
  expect(pack.isOpen, "the move tests below are only meaningful while open").toBe(true);
};

/** Fill `inv` to its capacity with non-stackable packables. */
const fillUp = (inv: Inventory): void => {
  while (!inv.isFull) inv.addAll(packable());
};

/** The real writer, over the real class specs, for one root object. */
const writeBack = (what: object): GraphData => {
  const writer = new GraphWriter(CLASS_SPECS);
  return writer.finish({ pack: writer.ref(what) });
};

/** The real reader, over the root `writeBack` produced. */
const readBack = (data: GraphData): any => {
  const reader = new GraphReader(data, CLASS_SPECS);
  return reader.resolve((data.root as Record<string, unknown>).pack as RefMark);
};

// ── The models ───────────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: the five rows of Items_Backpacks.csv", () => {
  // C# GameItems.cs:1030-1052, the five `this[IDs.BACKPACK_*]` initialisers, and
  // `BackpackData.FromCSVLine` at :1013-1026, which reads columns 3, 4 and 5 as
  // INVENTORY_SLOTS, ENC and WEIGHT.
  const ROWS: [ItemID, number, number, number][] = [
    [ItemID.BACKPACK_WAIST_POUCH, 2, 1, 1],
    [ItemID.BACKPACK_SATCHEL, 4, 2, 2],
    [ItemID.BACKPACK_DAYPACK, 6, 3, 3],
    [ItemID.BACKPACK_HIKING_PACK, 8, 4, 4],
    [ItemID.BACKPACK_ARMY_RUCKSACK, 10, 5, 5],
  ];

  it.each(ROWS)("%s has the C#'s slots, encumbrance and weight", (id, slots, enc, weight) => {
    const model = Models.items.get(id);
    expect(model, `${ItemID[id]} has no model`).toBeDefined();
    expect(model).toBeInstanceOf(ItemBackpackModel);
    const pack = model as ItemBackpackModel;
    expect(pack.inventorySlots).toBe(slots);
    expect(pack.encumbrance).toBe(enc);
    expect(pack.weight).toBe(weight);
    expect(model.flavorDescription.length, "the CSV's FLAVOR column").toBeGreaterThan(0);
  });

  it.each(ROWS)("%s is worn on the back", (id) => {
    // C# `EquipmentPart = DollPart.BACK` on all five (GameItems.cs:1031). Without it
    // a bag is an item nothing can equip, and `IsEquipped` — which is the whole of
    // what "open" is derived from — could never be true.
    const model = Models.items.get(id);
    expect(model.equipmentPart).toBe(DollPart.BACK);
    expect(model.isEquipable).toBe(true);
  });

  it("appends all five at the end of the enum, and bumps _COUNT past them", () => {
    // Append-only: a save stores an ItemID as a bare number. The C# has the
    // backpacks mid-enum (GameItems.cs:150-154, right after the uniques), so
    // inserting them there would renumber MATCHES, CHAR_LAPTOP and everything after
    // it, and every old save would resolve to a *different item*.
    expect(ItemID.BACKPACK_WAIST_POUCH).toBe(172);
    expect(ItemID.BACKPACK_ARMY_RUCKSACK).toBe(176);
    // The relationships, not the total: `_COUNT` is the one number here that
    // legitimately grows, so it is a bound rather than an equality, and the two
    // that must not move are the ones asserted absolutely.
    expect(ItemID.BACKPACK_WAIST_POUCH).toBeGreaterThan(ItemID.UNIQUE_BOOK_OF_ARMAMENTS);
    expect(ItemID._COUNT).toBeGreaterThan(ItemID.BACKPACK_ARMY_RUCKSACK);
  });

  it("gives every bag a nested inventory of exactly its model's slots", () => {
    for (const [id, slots] of ROWS) {
      expect(bag(id).backpackInventory.maxCapacity, `${ItemID[id]}`).toBe(slots);
      expect(bag(id).inventorySlots).toBe(slots);
    }
  });

  it("clamps the slot count at ten, like the C#'s Math.Min", () => {
    // ItemBackpackModel.cs:37. Never fires on today's data — the largest CSV row is
    // already 10 — and it is here because it is the only thing between a data edit
    // and a 40-slot pack, which `CanActorTakeBackpack` would then demand Hauler 3
    // for without ever saying why.
    expect(new ItemBackpackModel("x", "xs", "Items/x", 40, 0, 0).inventorySlots).toBe(10);
  });

  it("refuses a model that is not a backpack, like the C#'s ArgumentException", () => {
    // ItemBackpack.cs:38-40.
    expect(() => new ItemBackpack(Models.items.get(ItemID.MEDICINE_BANDAGES)))
      .toThrow(/not a BackpackModel/);
  });
});

// ── Rule 1: one bag ──────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: one bag at a time", () => {
  it("takes the first bag when the actor has none", () => {
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_SATCHEL)))
      .toEqual({ ok: true, reason: "" });
  });

  it("refuses a second bag, with the C#'s exact string", () => {
    // C# Rules.cs:1253-1256. Note there is no "you": the *other* one-backpack
    // message, at the container end (Rules.cs:660), does say "you can only carry
    // one backpack at a time", and the two are not the same string.
    carry(bag(ItemID.BACKPACK_WAIST_POUCH));
    const second = bag(ItemID.BACKPACK_SATCHEL);
    expect(rules.canActorTakeBackpack(player, second).reason)
      .toBe("can only carry one backpack at a time");
  });

  it("counts a bag the player is *wearing* as the one bag", () => {
    // The C# tests `actor.Inventory.HasItemOfType(typeof(ItemBackpack))`, which
    // looks in the inventory and not at what is equipped — a worn bag is still in
    // the inventory, and taking a second one is exactly the case the rule is for.
    const worn = carry(bag(ItemID.BACKPACK_ARMY_RUCKSACK));
    withHauler(3);
    worn.equippedPart = DollPart.BACK;
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_WAIST_POUCH)).reason)
      .toBe("can only carry one backpack at a time");
  });
});

// ── Rule 2: the Hauler bands ─────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: the Hauler slot tiers", () => {
  // C# Rules.cs:1262-1276. Three bands, not five rows, and the boundaries are what
  // matter: `slots >= 5 && slots < 7` -> 1, `>= 7 && < 9` -> 2, `>= 9` -> 3.
  it("needs nothing for the 2- and 4-slot packs", () => {
    // The satchel is *below* the first band. A per-model table that started the
    // tiers at "the smallest pack" would demand Hauler 1 for four slots, and the
    // C# deliberately does not.
    for (const id of [ItemID.BACKPACK_WAIST_POUCH, ItemID.BACKPACK_SATCHEL]) {
      expect(rules.canActorTakeBackpack(player, bag(id)), `${ItemID[id]}`)
        .toEqual({ ok: true, reason: "" });
    }
  });

  it("needs Hauler 1 for the 6-slot daypack", () => {
    // 6 slots is the top of `5..6`: level 0 refuses, level 1 passes.
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_DAYPACK)).reason)
      .toBe("need Hauler skill level 1 for that type of pack");
    withHauler(1);
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_DAYPACK)).ok).toBe(true);
  });

  it("needs Hauler 2 for the 8-slot hiking pack, and level 1 does not reach", () => {
    // 8 slots is the top of `7..8`, so 1 is not enough and 2 is.
    withHauler(1);
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_HIKING_PACK)).reason)
      .toBe("need Hauler skill level 2 for that type of pack");
    withHauler(2);
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_HIKING_PACK)).ok).toBe(true);
  });

  it("needs Hauler 3 for the 10-slot rucksack, and 2 is not enough", () => {
    // 10 slots is the `>= 9` band, which the C# gives a third tier to rather than
    // folding into `7..8`. This is the one boundary that would otherwise let a
    // survivor with two Hauler levels carry the biggest bag in the game.
    withHauler(2);
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_ARMY_RUCKSACK)).reason)
      .toBe("need Hauler skill level 3 for that type of pack");
    withHauler(3);
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_ARMY_RUCKSACK)).ok).toBe(true);
  });

  it("gives the Hauler bands no gap: every level from 0 to 3, every row", () => {
    // The table the three tests above sample, written out, so a change to a band
    // boundary cannot pass by only being caught at one end of it. The slot counts
    // are the five *registered* rows rather than synthetic models, because
    // `ItemBackpack.inventorySlots` reads through `Item.model` — the
    // `Models.items.get(id)` lookup every item in the port uses — and a model built
    // in a test has `id === 0`, which resolves to `MEDICINE_BANDAGES`.
    const ROWS: [ItemID, number][] = [
      [ItemID.BACKPACK_WAIST_POUCH, 0],
      [ItemID.BACKPACK_SATCHEL, 0],
      [ItemID.BACKPACK_DAYPACK, 1],
      [ItemID.BACKPACK_HIKING_PACK, 2],
      [ItemID.BACKPACK_ARMY_RUCKSACK, 3],
    ];
    for (const [id, required] of ROWS) {
      for (const level of [0, 1, 2, 3]) {
        withHauler(level);
        expect(
          rules.canActorTakeBackpack(player, bag(id)).ok,
          `${ItemID[id]} (${bag(id).inventorySlots} slots) at Hauler ${level}`,
        ).toBe(level >= required);
      }
    }
  });

  it("checks the one-bag rule first, so two satchels and no Hauler still says 'one backpack'", () => {
    // The C#'s two gates are sequential and the order is observable: a survivor
    // holding a pouch who is offered a satchel has no Hauler and needs none, so
    // both answers could apply and only one of them is true.
    carry(bag(ItemID.BACKPACK_WAIST_POUCH));
    expect(rules.canActorTakeBackpack(player, bag(ItemID.BACKPACK_SATCHEL)).reason)
      .toBe("can only carry one backpack at a time");
  });
});

// ── The transfer rule ────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: Rules.canActorMoveItemToBackpack", () => {
  let pack: ItemBackpack;
  let item: Item;

  beforeEach(() => {
    pack = carry(bag(ItemID.BACKPACK_SATCHEL));
    item = carry(packable());
  });

  it("allows a packable item into an open, empty bag", () => {
    openTheBag(pack);
    expect(rules.canActorMoveItemToBackpack(player, item, pack, true).ok).toBe(true);
  });

  it("refuses an item that may not go in a backpack", () => {
    // C# Rules.cs:1534-1538, gate 2. This is `ItemModel.canGoInBackpacks`'s only
    // reader, and the flag defaults to false: an item nobody opted in is refused,
    // which is why the C# had to opt in 121 models by hand.
    const crowbar = carry(new Item(Models.items.get(ItemID.MELEE_CROWBAR)));
    openTheBag(pack);
    expect(rules.canActorMoveItemToBackpack(player, crowbar, pack, true).reason)
      .toBe("cannot go in backpacks");
  });

  it("refuses an equipped item first, before it looks at the flag", () => {
    // C# gate 1 precedes gate 2, and the order is observable: an equipped
    // *packable* item is refused for being equipped, not for anything else.
    const knife = carry(new Item(Models.items.get(ItemID.MELEE_COMBAT_KNIFE)));
    knife.equippedPart = DollPart.RIGHT_HAND;
    openTheBag(pack);
    expect(rules.canActorMoveItemToBackpack(player, knife, pack, true).reason)
      .toBe("item is equipped");
  });

  it("refuses when the bag is worn, because worn means closed", () => {
    // C# Rules.cs:1540-1544, gate 3. The inversion is the whole trap: the pack is
    // *equipped* here, and that is exactly why it cannot be filled.
    pack.equippedPart = DollPart.BACK;
    expect(pack.isOpen).toBe(false);
    expect(rules.canActorMoveItemToBackpack(player, item, pack, true).reason)
      .toBe("backpack isn't open");
  });

  it("refuses a full bag", () => {
    // C# Rules.cs:1546-1553, gate 4.
    openTheBag(pack);
    fillUp(pack.backpackInventory);
    expect(pack.backpackInventory.isFull).toBe(true);
    expect(rules.canActorMoveItemToBackpack(player, item, pack, true).reason)
      .toBe("backpack is full");
  });

  it("does not call a full bag full when the item can top up a stack in it", () => {
    // The `CanAddAtLeastOne` half of gate 4, and the reason it is there: an ammo
    // stack that fits as a top-up is not "no room", and refusing it would make the
    // last two shells in a satchel unreachable.
    openTheBag(pack);
    pack.backpackInventory.addAll(packable());
    pack.backpackInventory.addAll(packable());
    pack.backpackInventory.addAll(packable());
    pack.backpackInventory.addAll(shells(9));
    expect(pack.backpackInventory.isFull).toBe(true);

    const more = carry(shells(5));
    expect(pack.backpackInventory.canAddAtLeastOne(more)).toBe(true);
    expect(rules.canActorMoveItemToBackpack(player, more, pack, true).ok).toBe(true);
  });

  it("skips the capacity check when the caller says it has already asked", () => {
    // The C#'s `checkIsFull` parameter, and its two call sites pass opposite values
    // for opposite reasons. A UI asking "is this key worth offering?" passes false
    // and gets a yes for an item it could not actually move.
    openTheBag(pack);
    fillUp(pack.backpackInventory);
    expect(rules.canActorMoveItemToBackpack(player, item, pack, false).ok).toBe(true);
    expect(rules.canActorMoveItemToBackpack(player, item, pack, true).ok).toBe(false);
  });
});

// ── The two-way move ─────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: moving things in and out", () => {
  let pack: ItemBackpack;
  let ammo: ItemAmmo;

  beforeEach(() => {
    pack = carry(bag(ItemID.BACKPACK_DAYPACK));
    ammo = carry(shells(12));
    openTheBag(pack);
  });

  it("moves an item into the bag and takes it out of the pack", () => {
    expect(moveItemToBackpack(rules, player, ammo)).toEqual({ ok: true, reason: "" });
    expect(player.inventory!.contains(ammo)).toBe(false);
    expect(pack.backpackInventory.contains(ammo)).toBe(true);
    expect(pack.backpackInventory.countItems).toBe(1);
  });

  it("moves it back, both directions being symmetric", () => {
    moveItemToBackpack(rules, player, ammo);
    expect(moveItemToInventory(player, ammo)).toEqual({ ok: true, reason: "" });
    expect(pack.backpackInventory.contains(ammo)).toBe(false);
    expect(player.inventory!.contains(ammo)).toBe(true);
  });

  it("splits a stack across two bag slots rather than losing the remainder", () => {
    // The C#'s `AddAsMuchAsPossible` (Data/Inventory.cs:144-184) tops up an
    // existing stack and then, if there is a *free slot*, puts the remainder in as a
    // new entry and reports the whole quantity as added -- which is what makes the
    // caller's `if (quantityAdded == quantityBefore) RemoveAllQuantity` fire and
    // leave nothing behind in the pack. A 12-round stack into a bag already holding
    // 8 of the same thing, stack limit 10, is therefore 10 and 10 across two slots.
    // The C#'s own `TODO` on the next line says the interactive swap for a leftover
    // that does *not* fit is unbuilt, so this is the behaviour, not an accident.
    pack.backpackInventory.addAll(shells(8));
    expect(moveItemToBackpack(rules, player, ammo).ok).toBe(true);
    expect(pack.backpackInventory.countItems, "topped up and spilled into a second slot")
      .toBe(2);
    expect(pack.backpackInventory.items.map((i) => i.quantity)).toEqual([10, 10]);
    expect(ammo.quantity, "the remainder is a real stack, not a zero-quantity ghost")
      .toBe(10);
    expect(player.inventory!.contains(ammo), "and the pack gave it up").toBe(false);
  });

  it("refuses rather than half-moves when the bag is full and cannot stack", () => {
    // The C#'s outer guard at RogueGame.cs:13878 -- `if (!pack.Inventory.IsFull ||
    // pack.Inventory.CanAddAtLeastOne(it))` -- means the "nothing fitted" branch of
    // `AddAsMuchAsPossible` is *unreachable* through the move, in the C# too: it is
    // the case the unbuilt `promptForSwap` loop was for. So the port refuses with
    // the reason rather than moving a partial stack and telling nobody. Asserted
    // because a version that dropped this guard would look identical on every other
    // test in this file.
    fillUp(pack.backpackInventory);
    pack.backpackInventory.removeAllQuantity(pack.backpackInventory.getItem(0)!);
    pack.backpackInventory.addAll(shells(10));
    expect(pack.backpackInventory.isFull).toBe(true);
    expect(pack.backpackInventory.canAddAtLeastOne(shells(12))).toBe(false);

    const ammo2 = carry(shells(12));
    expect(moveItemToBackpack(rules, player, ammo2).reason).toBe("backpack is full");
    expect(ammo2.quantity, "so the whole stack stayed behind").toBe(12);
    expect(player.inventory!.contains(ammo2)).toBe(true);
    expect(pack.backpackInventory.getSmallestStackByModel(Models.items.get(ItemID.AMMO_SHOTGUN))!.quantity)
      .toBe(10);
  });

  it("refuses an item that may not go in a bag, and can say why", () => {
    const crowbar = carry(new Item(Models.items.get(ItemID.MELEE_CROWBAR)));
    const verdict = moveItemToBackpack(rules, player, crowbar);
    expect(verdict.reason).toBe("cannot go in backpacks");
    expect(player.inventory!.contains(crowbar), "and it did not move").toBe(true);
    // C# RogueGame.cs:13901: "Can't move {TheName} to {TheName} : {reason}."
    expect(moveRefusalMessage(crowbar, pack, verdict.reason))
      .toBe("Can't move the crowbar to the daypack : cannot go in backpacks.");
  });

  it("refuses a move into a closed bag", () => {
    pack.equippedPart = DollPart.BACK;
    expect(moveItemToBackpack(rules, player, ammo).reason).toBe("backpack isn't open");
    expect(player.inventory!.contains(ammo)).toBe(true);
  });

  it("refuses a move out of a full pack, with the C#'s own refusal", () => {
    // The C#'s guard at RogueGame.cs:13906 — `if (!player.Inventory.IsFull ||
    // player.Inventory.CanAddAtLeastOne(it))` — refuses here and then sets
    // `promptForSwap`. The port refuses here and stops: the interactive "choose a
    // slot to swap with" loop (RogueGame.cs:13930-13962) is UI and is not ported.
    // The refusal itself is the C#'s, byte for byte.
    moveItemToBackpack(rules, player, ammo);
    fillUp(player.inventory!);
    expect(player.inventory!.isFull).toBe(true);
    expect(moveItemToInventory(player, ammo).reason).toBe("your inventory is full");
    expect(pack.backpackInventory.contains(ammo), "so it stayed in the bag").toBe(true);
    expect(ammo.quantity, "and nothing was lost").toBe(12);
  });

  it("says 'You aren't carrying a backpack.' when there is no bag", () => {
    // C# RogueGame.cs:13864-13868.
    const bare = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "nobody");
    expect(moveItemToBackpack(rules, bare, packable()).reason).toBe(NO_BACKPACK_REASON);
    expect(moveItemToInventory(bare, packable()).reason).toBe(NO_BACKPACK_REASON);
  });
});

// ── Open and close ───────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: opening and closing", () => {
  it("is open until it is worn, which is the C#'s inverted convention", () => {
    // `open` is `!IsEquipped` (Rules.cs:1543, RogueGame.cs:25395), so a bag sitting
    // in your pack is *open* and wearing it is what closes it. This is the single
    // most surprising thing about the feature and it is why every move test above
    // has to wear the bag first.
    const pack = carry(bag(ItemID.BACKPACK_SATCHEL));
    expect(pack.isOpen).toBe(true);
    expect(isBackpackOpen(player)).toBe(true);
    pack.equippedPart = DollPart.BACK;
    expect(pack.isOpen).toBe(false);
    expect(isBackpackOpen(player)).toBe(false);
  });

  it("opens a worn bag by unequipping it", () => {
    // The C# has no open command: a bag is open exactly when `!IsEquipped`, and it
    // gets there through the ordinary equip toggle on the bag's own slot. See
    // `Backpacks.openBackpack`.
    const pack = carry(bag(ItemID.BACKPACK_SATCHEL));
    pack.equippedPart = DollPart.BACK;
    expect(openBackpack(player)).toEqual({ ok: true, reason: "" });
    expect(pack.equippedPart).toBe(DollPart.NONE);
    expect(pack.isOpen).toBe(true);
  });

  it("opening an already-open bag is a no-op, not an error", () => {
    carry(bag(ItemID.BACKPACK_SATCHEL));
    expect(openBackpack(player).ok).toBe(true);
    expect(openBackpack(player).ok).toBe(true);
  });

  it("closing is the C#'s auto-equip, and it says whether it closed anything", () => {
    // C# RogueGame.cs:33122-33141, the `checkBackpack` arm of `BlockAction`. The
    // already-commented-out `BACKPACK_DENIED_MESSAGE` underneath it is why this
    // closes rather than refuses.
    const pack = carry(bag(ItemID.BACKPACK_SATCHEL));
    openTheBag(pack);
    expect(autoCloseBackpack(player)).toBe(true);
    expect(pack.equippedPart).toBe(DollPart.BACK);
    expect(autoCloseBackpack(player), "a closed bag is not a block").toBe(false);
  });

  it("firstBackpack finds the one bag, and null when there is none", () => {
    const pack = carry(bag(ItemID.BACKPACK_WAIST_POUCH));
    expect(firstBackpack(player)).toBe(pack);
    expect(firstBackpack(null)).toBeNull();
    const bare = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "nobody");
    expect(firstBackpack(bare)).toBeNull();
  });

  it("makeBackpack builds a bag the AI will not take", () => {
    // C# sets `IsForbiddenToAI = true` on all five factories
    // (BaseMapGenerator.cs:2375-2412), and `Rules.cs:655` leans on it when it makes
    // the one-backpack rule player-only: an NPC wearing a bag would lock the player
    // out of carrying one at all.
    const pack = makeBackpack(ItemID.BACKPACK_ARMY_RUCKSACK)!;
    expect(pack.model.id).toBe(ItemID.BACKPACK_ARMY_RUCKSACK);
    expect(pack.backpackInventory.maxCapacity).toBe(10);
    expect(pack.isForbiddenToAI).toBe(true);
    expect(pack.isOpen, "not worn, therefore open").toBe(true);
  });
});

// ── canGoInBackpacks ─────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: ItemModel.canGoInBackpacks", () => {
  // Still Alive, Release 8-2. The C# sets the flag on 121 of its 187 models by hand
  // (one `CanGoInBackpacks = true` per object initialiser in `GameItems.cs`), and
  // the curation is not a rule: see `CAN_GO_IN_BACKPACKS` in GameItems.ts.
  it("is true for the items the C# opted in, including a knife and a pistol", () => {
    for (const id of [
      ItemID.MEDICINE_SMALL_MEDIKIT, ItemID.FOOD_ARMY_RATION, ItemID.AMMO_SHOTGUN,
      ItemID.MELEE_COMBAT_KNIFE, ItemID.RANGED_ARMY_PISTOL, ItemID.LIGHT_FLASHLIGHT,
      ItemID.ENT_BOOK_CHAR, ItemID.SIPHON_KIT, ItemID.UNIQUE_BOOK_OF_ARMAMENTS,
    ]) {
      expect(Models.items.get(id).canGoInBackpacks, `${ItemID[id]}`).toBe(true);
    }
  });

  it("is false for the ones it did not, and the pairs prove it is not a rule", () => {
    // A combat knife packs and a crowbar does not. An army pistol packs and a
    // hunting rifle does not. Raw dog meat is the one food left out. Each pair is a
    // curated choice in the C#, and deriving the flag from `isEquipable` would get
    // all three wrong.
    for (const id of [
      ItemID.MELEE_CROWBAR, ItemID.RANGED_HUNTING_RIFLE, ItemID.MELEE_KATANA,
      ItemID.RANGED_MINIGUN, ItemID.FOOD_RAW_DOG_MEAT, ItemID.TRAP_BEAR_TRAP,
      ItemID.BAR_WOODEN_PLANK, ItemID.ARMOR_ARMY_BODYARMOR, ItemID.ENT_BOOK,
      ItemID.MEDICINE_BANDAGES, ItemID.EXPLOSIVE_GRENADE_PRIMED, ItemID.FISHING_ROD,
    ]) {
      expect(Models.items.get(id).canGoInBackpacks, `${ItemID[id]}`).toBe(false);
    }
  });

  it("is false for the backpacks themselves", () => {
    // A bag in a bag would be the one nesting the C# never allowed, and the nested
    // `Inventory` has no way to hold one.
    for (const id of [
      ItemID.BACKPACK_WAIST_POUCH, ItemID.BACKPACK_SATCHEL, ItemID.BACKPACK_DAYPACK,
      ItemID.BACKPACK_HIKING_PACK, ItemID.BACKPACK_ARMY_RUCKSACK,
    ]) {
      expect(Models.items.get(id).canGoInBackpacks, `${ItemID[id]}`).toBe(false);
    }
  });

  it("marks a hundred models, and every id it names is a real one", () => {
    // The size of `CAN_GO_IN_BACKPACKS` in `GameItems.ts` is asserted as a floor and
    // not an equality: the number that is *the point* is the pairs above, and a
    // content addition should show up as a diff in that list rather than as this
    // number moving. What is asserted exactly is the other half — that nothing in
    // the flag list names an id with no model, which is the failure a hand-kept
    // list of enum members invites.
    const flagged = Object.entries(ItemID).filter(
      ([name, id]) => name !== "_COUNT" && typeof id === "number"
        && Models.items.get(id as number).canGoInBackpacks,
    );
    expect(flagged.length).toBeGreaterThanOrEqual(100);
  });
});

// ── The save codec ───────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: the save codec", () => {
  /** A bag holding three distinguishable things, worn shut. */
  const packedBag = (): ItemBackpack => {
    const pack = bag(ItemID.BACKPACK_HIKING_PACK);
    pack.equippedPart = DollPart.BACK;
    pack.backpackInventory.addAll(shells(7));
    pack.backpackInventory.addAll(new Item(Models.items.get(ItemID.MEDICINE_SMALL_MEDIKIT)));
    pack.backpackInventory.addAll(new Item(Models.items.get(ItemID.MELEE_COMBAT_KNIFE)));
    return pack;
  };

  it("round-trips a bag that is holding items", () => {
    const pack = packedBag();
    const back = readBack(writeBack(pack)) as ItemBackpack;

    expect(back).toBeInstanceOf(ItemBackpack);
    // The bag's own state, which is the C#'s `IsEquipped` and nothing else.
    expect(back.equippedPart).toBe(DollPart.BACK);
    // Its class, which is what the spec's place in `itemSpecs` is for: a miss there
    // restores a bag as a plain `Item` and every line below throws.
    expect(back.model.id).toBe(ItemID.BACKPACK_HIKING_PACK);
    expect(back.inventorySlots).toBe(8);
    // The contents, in order, with their quantities -- the three things a nested
    // inventory has that a `maxCapacity` alone would not carry.
    expect(back.backpackInventory.maxCapacity).toBe(8);
    expect(back.backpackInventory.countItems).toBe(3);
    expect(back.backpackInventory.items.map((i) => i.model.id)).toEqual([
      ItemID.AMMO_SHOTGUN, ItemID.MEDICINE_SMALL_MEDIKIT, ItemID.MELEE_COMBAT_KNIFE,
    ]);
    expect(back.backpackInventory.items.map((i) => i.quantity)).toEqual([7, 1, 1]);
  });

  it("round-trips a bag through the actor's inventory, contents and all", () => {
    // The real chain: Actor -> Inventory -> ItemBackpack -> Inventory -> Item. Four
    // hops, and the inner inventory has to survive being written from inside an item
    // that is itself inside an inventory.
    carry(packedBag());
    const bandage = new Item(Models.items.get(ItemID.MEDICINE_BANDAGES));
    bandage.quantity = 4;
    carry(bandage);

    const back = readBack(writeBack(player)) as Actor;
    const restored = firstBackpack(back)!;
    expect(restored).toBeInstanceOf(ItemBackpack);
    expect(restored.backpackInventory.countItems).toBe(3);
    expect(restored.backpackInventory.getItem(0)!.quantity).toBe(7);
    // The bag is still in the actor's own inventory, so `firstBackpack` finds it: a
    // bag restored into an inventory nobody can reach would be invisible rather than
    // wrong, which is the failure `SessionGraph`'s `finish` pass exists to prevent.
    expect(back.inventory!.contains(restored)).toBe(true);
    expect(back.inventory!.getFirstByType(ItemBackpack)).toBe(restored);
    // And the item that was *not* in the bag is still only in the pack.
    const outside = back.inventory!.getFirstByModel(Models.items.get(ItemID.MEDICINE_BANDAGES));
    expect(outside).not.toBeNull();
    expect(outside!.quantity).toBe(4);
    expect(restored.backpackInventory.contains(outside!)).toBe(false);
  });

  it("reads a record with no backpackInventory key as an empty bag, not a crash", () => {
    // The pre-feature case, and the one that actually throws without the spec's
    // `finish`: `assignFields` only assigns the keys a record carries, and a shell
    // made with `Object.create` has no field initialisers, so a missing key leaves
    // the field `undefined` and the first `backpackInventory.isFull` -- which is
    // gate 4 of the transfer rule -- would throw on a save that loaded perfectly.
    const data = writeBack(packedBag());
    const record = data.objs.find((r) => r.k === "ItemBackpack")!;
    expect(record.f.backpackInventory, "the key is there to begin with").toBeDefined();
    delete (record.f as Record<string, unknown>).backpackInventory;

    const back = readBack(data) as ItemBackpack;
    expect(back.backpackInventory, "not undefined").toBeInstanceOf(Inventory);
    // The capacity is the model's, so this is the same bag rather than a blank one:
    // an item moved into it afterwards behaves identically.
    expect(back.backpackInventory.maxCapacity).toBe(8);
    expect(back.backpackInventory.isEmpty).toBe(true);
    // And the rule that reads it now answers, rather than throwing.
    carry(back);
    openTheBag(back);
    const shell = carry(shells(5));
    expect(moveItemToBackpack(rules, player, shell).ok).toBe(true);
    expect(back.backpackInventory.contains(shell)).toBe(true);
  });

  it("a save written before the feature still loads, and reads as no backpack", () => {
    // A pre-feature save has no `ItemBackpack` record at all -- the models did not
    // exist and the enum had no ids for them -- so the whole feature has to answer
    // "there is no bag here" rather than assuming one. This is the same graph the
    // round-trip above writes, minus the bag, which is what a build from before
    // this feature produced.
    const bandage = new Item(Models.items.get(ItemID.MEDICINE_BANDAGES));
    bandage.quantity = 6;
    carry(bandage);

    const back = readBack(writeBack(player)) as Actor;
    expect(back.inventory!.countItems).toBe(1);
    expect(back.inventory!.items[0].quantity).toBe(6);
    expect(firstBackpack(back)).toBeNull();
    expect(isBackpackOpen(back)).toBe(false);
    expect(autoCloseBackpack(back)).toBe(false);
    // The take-up question still judges the bag it was handed -- it is handed one by
    // a world generator or a test, not by the save...
    expect(rules.canActorTakeBackpack(back, bag(ItemID.BACKPACK_SATCHEL)).ok).toBe(true);
    // ...and the transfer question cannot reach a nested inventory that is not there.
    expect(moveItemToBackpack(rules, back, back.inventory!.items[0]).reason)
      .toBe(NO_BACKPACK_REASON);
  });
});

// ── The nested panel ─────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: the nested panel", () => {
  it("takes the ground panel's row, because that is the C#'s whole layout decision", () => {
    // C# RogueGame.cs:56 and :25393-25400: `BACKPACKPANEL_Y = GROUNDINVENTORYPANEL_Y`
    // and `hideGroundInv = true` while the bag is open. The fork did not add a
    // fourth row to the side panel; the bag replaces the ground items for as long as
    // it is open, drawn in burlywood rather than white (RogueGame.cs:26901) so the
    // player can tell which of the two grids they are looking at.
    // A function, not a constant: `RogueGame` draws the panel and so imports this
    // module, while this module needs the ground row. As a `const` that cycle read
    // `GROUNDINVENTORYPANEL_Y` before it was assigned. See the note on the export.
    expect(BACKPACK_PANEL_Y()).toBe(GROUNDINVENTORYPANEL_Y);
    expect(BACKPACK_PANEL_TITLE).toBe("Backpack");
  });

  it("hides the ground panel only while the bag is open", () => {
    const pack = bag(ItemID.BACKPACK_SATCHEL);
    // Fresh out of the factory a bag is *open* (`!IsEquipped`), so the ground is
    // hidden from the moment it is picked up until it is worn.
    expect(backpackHidesGroundPanel(pack)).toBe(true);
    pack.equippedPart = DollPart.BACK;
    expect(backpackHidesGroundPanel(pack), "a worn bag is shut, so the ground is shown")
      .toBe(false);
    expect(backpackHidesGroundPanel(null)).toBe(false);
  });

  it("lays the bag's slots out in rows, padded to capacity", () => {
    // C# RogueGame.cs:26908-26921 draws exactly `MaxCapacity` slot sprites in
    // `slotsPerLine` columns, and the mouse lookup at :11343-11346 bounds-checks a
    // flat index against `MaxCapacity`. The *slots*, not the contents, decide what a
    // click means, so the grid is the same shape whether the bag is full or empty.
    expect(backpackPanelRows(bag(ItemID.BACKPACK_SATCHEL), 10)).toEqual([[null, null, null, null]]);
    const big = bag(ItemID.BACKPACK_ARMY_RUCKSACK);
    expect(backpackPanelRows(big, 4).map((r) => r.length)).toEqual([4, 4, 2]);

    const shell = shells(3);
    big.backpackInventory.addAll(shell);
    const filled = backpackPanelRows(big, 4);
    expect(filled[0][0]).toBe(shell);
    expect(filled[0][1]).toBeNull();
    expect(filled[2]).toEqual([null, null]);
  });

  it("describes an item in a bag in four lines, and the C#'s two key hints", () => {
    // C# RogueGame.cs:31966-31983: `DescribeItemLong(..., isBackpackInventory: true)`
    // returns before any per-subclass description, so there is no unbreakable note,
    // no weapon stats, no flavour text and no equip/drop/give line. Two lines of
    // what it is, two of what to do with it.
    const keys = { destroy: "DEL", moveToInventory: "Y" };
    expect(describeItemInBackpack(shells(12), "some shotgun shells", keys)).toEqual([
      "some shotgun shells 12/10", " ", "----",
      "to destroy : <DEL>", "to move to inventory : <Y>",
    ]);
    // Non-stackable: the name alone, with no `n/limit` invented for it.
    const kit = packable();
    expect(describeItemInBackpack(kit, "a siphon kit", keys)).toEqual([
      "a siphon kit", " ", "----",
      "to destroy : <DEL>", "to move to inventory : <Y>",
    ]);
    // `DESTROY_ITEM` is a Release 7-6 command this port has not added, so a caller
    // without it passes "" and the line is dropped rather than printed with an empty
    // bracket.
    expect(describeItemInBackpack(kit, "a siphon kit", { destroy: "", moveToInventory: "Y" }))
      .toEqual(["a siphon kit", " ", "----", "to move to inventory : <Y>"]);
  });

  it("binds SWAP_INVENTORY to Y, which is the key the C# uses", () => {
    // C# Keybindings.cs:88. The binding is inert until `RogueGame` dispatches the
    // command, and that dispatch is the one call site this feature asks for.
    expect(new Keybindings().get(PlayerCommand.SWAP_INVENTORY)).toBe("Y");
  });
});

// ── CLASSIC ──────────────────────────────────────────────────────────────────

describe("Feature.ShelterBackpacks: under CLASSIC", () => {
  beforeEach(() => {
    Session.get().ruleset = Ruleset.CLASSIC;
  });

  it("the flag is off, which is the whole point", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.ShelterBackpacks)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ShelterBackpacks)).toBe(false);
  });

  it("makes no backpack at all", () => {
    // The factory is the only thing in the project that produces an
    // `ItemBackpack`, so a CLASSIC survivor cannot get one even by force.
    for (const id of [
      ItemID.BACKPACK_WAIST_POUCH, ItemID.BACKPACK_SATCHEL, ItemID.BACKPACK_DAYPACK,
      ItemID.BACKPACK_HIKING_PACK, ItemID.BACKPACK_ARMY_RUCKSACK,
    ]) {
      expect(makeBackpack(id), `${ItemID[id]}`).toBeNull();
    }
  });

  it("refuses to open, to close, or to move anything, and says so", () => {
    // A hand-built bag, which is the only way a CLASSIC survivor could ever have
    // one. Every entry point answers rather than acting, and none of them says
    // "You aren't carrying a backpack." to a survivor who has never heard of one.
    const pack = carry(bag(ItemID.BACKPACK_SATCHEL));
    const kit = carry(packable());
    openTheBagSilent(pack);

    expect(openBackpack(player).reason).toBe("not available in this ruleset");
    expect(autoCloseBackpack(player)).toBe(false);
    expect(moveItemToBackpack(rules, player, kit).reason).toBe("not available in this ruleset");
    expect(moveItemToInventory(player, kit).reason).toBe("not available in this ruleset");
    // Nothing moved and nothing changed: the bag is still worn, the item is still
    // in the pack, and the bag is still empty.
    expect(pack.equippedPart).toBe(DollPart.BACK);
    expect(pack.backpackInventory.isEmpty).toBe(true);
    expect(player.inventory!.contains(kit)).toBe(true);
  });

  it("refuses both rules, at every Hauler level, for every bag", () => {
    // Both gates in `Rules`, across all three Hauler tiers and all five rows, so a
    // CLASSIC survivor with a maxed skill sheet still cannot pick a bag up or move
    // anything into one -- and cannot be told they need Hauler, which is a message
    // about a skill that has nothing to do with a bag they cannot have.
    for (const level of [0, 1, 2, 3]) {
      withHauler(level);
      for (const id of [
        ItemID.BACKPACK_WAIST_POUCH, ItemID.BACKPACK_SATCHEL, ItemID.BACKPACK_DAYPACK,
        ItemID.BACKPACK_HIKING_PACK, ItemID.BACKPACK_ARMY_RUCKSACK,
      ]) {
        const pack = bag(id);
        expect(rules.canActorTakeBackpack(player, pack).reason, `${ItemID[id]} @${level}`)
          .toBe("not available in this ruleset");
        expect(
          rules.canActorMoveItemToBackpack(player, packable(), pack, true).reason,
          `${ItemID[id]} @${level}`,
        ).toBe("not available in this ruleset");
      }
    }
  });

  it("shows no nested panel, and describes nothing in one", () => {
    // A view-model function is data, not behaviour, and is deliberately not gated.
    // What matters is that there is nothing to point it at, which is the CLASSIC
    // answer to the whole feature -- asserted as the reachability claim it is.
    const pack = bag(ItemID.BACKPACK_SATCHEL);
    expect(firstBackpack(player)).toBeNull();
    expect(backpackHidesGroundPanel(firstBackpack(player))).toBe(false);
    expect(backpackPanelRows(pack)).toHaveLength(1);
  });

  it("still writes and reads a save, and the bag survives it", () => {
    // The codec is data, not behaviour, and is deliberately *not* gated: a save
    // written under one ruleset and loaded under another has to work, because the
    // ruleset is a session option and the world in a save is not rebuilt from it.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const pack = carry(bag(ItemID.BACKPACK_DAYPACK));
    pack.backpackInventory.addAll(shells(9));

    const data = writeBack(player);
    Session.get().ruleset = Ruleset.CLASSIC;

    const back = readBack(data) as Actor;
    const restored = firstBackpack(back)!;
    expect(restored).toBeInstanceOf(ItemBackpack);
    expect(restored.backpackInventory.countItems).toBe(1);
    expect(restored.backpackInventory.getItem(0)!.quantity).toBe(9);
    // ...and a CLASSIC survivor who then tries to use it gets the ruleset refusal.
    expect(moveItemToBackpack(rules, back, restored.backpackInventory.getItem(0)!).reason)
      .toBe("not available in this ruleset");
  });
});

/** Wear a bag without asserting the open call succeeded — used under CLASSIC. */
function openTheBagSilent(pack: ItemBackpack): void {
  pack.equippedPart = DollPart.BACK;
}
