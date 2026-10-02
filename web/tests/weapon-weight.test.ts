import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Session, Ruleset } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Actor } from "@data/Actor";
import { Item } from "@data/Item";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { ItemWeapon, ItemWeaponModel } from "@engine/items/ItemWeapon";
import { ItemGrenade } from "@engine/items/ItemExplosive";
import { DollPart } from "@data/Doll";

/**
 * `Feature.WeaponWeight`: a weapon's WEIGHT is subtracted from its wielder's
 * speed.
 *
 * Written as a pair -- the same actor, the same weapon, the two rulesets --
 * because the negative half is the one a coverage number cannot give. A weight
 * that applied to *both* rulesets would be a behaviour change to classic wearing
 * a feature's name, which is the failure the whole axis exists to prevent, and
 * the only way to see it is to assert the classic case.
 *
 * `actorSpeed` reads the ruleset from the `Session` singleton, so that is where
 * the test sets it. The session is process-wide and this file is not its only
 * user, so each case sets the ruleset it needs rather than relying on the order.
 *
 * Everything here uses models loaded from the merged tables, not synthetic ones.
 * `Item` keeps its model's *id* and looks the model back up through
 * `Models.items.get`, so a model that was never registered resolves to whatever
 * item happens to hold that id -- a test building its own model silently gets
 * the wrong one. Using the real rows exercises the real path instead.
 */

beforeAll(() => {
  // Each registers itself into the `Models` statics that `Actor` needs.
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

function makeActor(): Actor {
  return new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
}

/** Put an item in the inventory and in the hand that will hold it. */
function hold(actor: Actor, item: Item): Item {
  actor.inventory!.addAll(item);
  item.equippedPart = item.model.equipmentPart;
  return item;
}

function give(actor: Actor, id: ItemID): Item {
  const model = Models.items.get(id);
  return hold(actor, new ItemWeapon(model as ItemWeaponModel));
}

let rules: Rules;
let actor: Actor;

beforeEach(() => {
  rules = new Rules(new DiceRoller(1));
  actor = makeActor();
});

describe("Feature.WeaponWeight", () => {
  it("the merged table carries the fork's weights", () => {
    // Cross-checked against the fork's own CSVs rather than against what looks
    // right: the mace is 5, the minigun 20, and the katana is **0**. That last is
    // the useful entry -- a katana weighing nothing is what the data says, and a
    // test written from intuition would "fix" it.
    const weight = (id: ItemID) =>
      (Models.items.get(id) as ItemWeaponModel).weight;
    expect(weight(ItemID.MELEE_MACE), "mace").toBe(5);
    expect(weight(ItemID.RANGED_MINIGUN), "minigun").toBe(20);
    expect(weight(ItemID.MELEE_KATANA), "katana").toBe(0);
  });

  it("every vanilla weapon weighs nothing, because WEIGHT is a Still Alive column", () => {
    // Alpha 10.1 has no such column, so "ours wins" gives all of them 0 and
    // classic is untouched even with the flag on.
    for (const id of [ItemID.MELEE_CROWBAR, ItemID.MELEE_BASEBALLBAT,
                      ItemID.MELEE_GOLFCLUB, ItemID.RANGED_PISTOL,
                      ItemID.RANGED_HUNTING_RIFLE, ItemID.RANGED_SHOTGUN]) {
      expect((Models.items.get(id) as ItemWeaponModel).weight, `${id} is vanilla`)
        .toBe(0);
    }
  });

  it("slows a wielder under STILL_ALIVE and not under CLASSIC", () => {
    const base = rules.actorSpeed(actor);
    const mace = Models.items.get(ItemID.MELEE_MACE) as ItemWeaponModel;
    expect(mace.weight, "the mace has to weigh something for this to mean anything")
      .toBeGreaterThan(0);

    give(actor, ItemID.MELEE_MACE);
    expect(actor.getEquippedItem(DollPart.RIGHT_HAND), "the mace is in hand")
      .toBeTruthy();

    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(rules.actorSpeed(actor)).toBe(base - mace.weight);

    // Same actor, same weapon, the other ruleset.
    Session.get().ruleset = Ruleset.CLASSIC;
    expect(rules.actorSpeed(actor), "classic must not lose weapon weight").toBe(base);
  });

  it("counts a ranged weapon's weight the same way", () => {
    const base = rules.actorSpeed(actor);
    const minigun = Models.items.get(ItemID.RANGED_MINIGUN) as ItemWeaponModel;
    give(actor, ItemID.RANGED_MINIGUN);
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(rules.actorSpeed(actor)).toBe(base - minigun.weight);
  });

  it("a weapon that is not in hand weighs nothing", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const base = rules.actorSpeed(actor);
    expect(rules.actorSpeed(actor), "nothing held yet").toBe(base);
    give(actor, ItemID.MELEE_MACE);
    expect(rules.actorSpeed(actor)).toBeLessThan(base);
  });

  it("a non-weapon in the right hand weighs nothing", () => {
    // The read is `instanceof ItemWeapon`, so the assertion is that the gate does
    // not depend on the right hand holding only weapons. A grenade is the
    // natural probe: same slot, not a weapon. (Food will not do -- it has no
    // `equipmentPart` at all, so it can never be in hand.)
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const base = rules.actorSpeed(actor);
    const grenade = new ItemGrenade(
      Models.items.get(ItemID.EXPLOSIVE_GRENADE),
      Models.items.get(ItemID.EXPLOSIVE_GRENADE_PRIMED),
    );
    hold(actor, grenade);
    expect(actor.getEquippedItem(DollPart.RIGHT_HAND), "the grenade is in hand")
      .toBe(grenade);
    expect(grenade).not.toBeInstanceOf(ItemWeapon);
    expect(rules.actorSpeed(actor)).toBe(base);
  });

  it("no weapon in the table can drive a healthy actor's speed negative", () => {
    // A negative speed reads as "already acted this turn" to the turn order, which
    // would strand the actor permanently, and the fork guards it explicitly
    // ("speed must be >= 0"). Asserted across the whole table rather than for one
    // hand-picked weapon.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const weapons = Object.values(ItemID)
      .filter((v): v is number => typeof v === "number" && v !== ItemID._COUNT)
      .map((id) => Models.items.get(id))
      .filter((m): m is ItemWeaponModel => m instanceof ItemWeaponModel);
    expect(weapons.length, "the table has weapons in it").toBeGreaterThan(40);

    for (const model of weapons) {
      const a = makeActor();
      hold(a, new ItemWeapon(model));
      expect(rules.actorSpeed(a), `${model.singleName} went negative`)
        .toBeGreaterThanOrEqual(0);
    }
  });

  it("holds for every actor that can hold a weapon, and every weapon", () => {
    // The clamp, as a property rather than a case -- because with the shipped
    // data there is no case. Checked and recorded rather than assumed:
    //
    // - the slowest actor that *has an inventory* is a civilian at 100; the ones
    //   at 50 are undead, and `hasInventory` is false for all of them, so they can
    //   never hold anything;
    // - the heaviest weapon is 20 (minigun) and the heaviest body armour 10;
    // - so the worst an inventory-bearing actor can reach is
    //   (100 / 2) - 10 - 20 = 20, exhausted and fully encumbered.
    //
    // A zombie at 50 *would* reach -5, and that is why the clamp exists in the
    // fork -- but a zombie cannot be given the minigun, so the path is
    // unreachable today. The assertion is therefore the invariant, not a
    // demonstration: if a future weapon or actor crosses that line this fails
    // first, and a deletion of the clamp stays invisible to it, which is why the
    // reason is written here rather than left as an apparent coverage claim.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const weapons = Object.values(ItemID)
      .filter((v): v is number => typeof v === "number" && v !== ItemID._COUNT)
      .map((id) => Models.items.get(id))
      .filter((m): m is ItemWeaponModel => m instanceof ItemWeaponModel);
    const holders = Object.values(ActorID)
      .filter((v): v is number => typeof v === "number" && v !== ActorID._COUNT)
      .map((id) => Models.actors.get(id))
      .filter((m) => m.abilities.hasInventory);
    expect(holders.length, "some actors can hold things").toBeGreaterThan(5);

    for (const model of holders) {
      for (const weapon of weapons) {
        const a = new Actor(model, survivors, "t");
        a.staminaPoints = 0;                       // exhausted: the worst term
        hold(a, new ItemWeapon(weapon));
        expect(rules.actorSpeed(a),
          `${model.name} holding ${weapon.singleName} went negative`)
          .toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("classic speed is identical with and without any weapon, under CLASSIC", () => {
    // The whole feature stated as one property over the whole table, which is
    // the assertion that would fail if the gate were ever dropped.
    Session.get().ruleset = Ruleset.CLASSIC;
    const bare = rules.actorSpeed(makeActor());
    for (const id of [ItemID.MELEE_MACE, ItemID.RANGED_MINIGUN, ItemID.MELEE_KATANA,
                      ItemID.RANGED_NAIL_GUN, ItemID.MELEE_BONESAW]) {
      const a = makeActor();
      give(a, id);
      expect(rules.actorSpeed(a), `${id} changed classic speed`).toBe(bare);
    }
  });
});
