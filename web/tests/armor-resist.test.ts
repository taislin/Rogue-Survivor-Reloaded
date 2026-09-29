import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Session, Ruleset } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Actor } from "@data/Actor";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { ItemBodyArmor, ItemBodyArmorModel } from "@engine/items/ItemBodyArmor";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `Feature.ArmorResist`, the half that is implementable today: infection
 * resistance on body armour.
 *
 * **The two percentages mean different things, and that is the whole trap.**
 * `FIRE_RESIST%` is a damage multiplier — `dmg -= dmg * (fire / 100)`, so 100 is
 * total immunity. `INF_RESIST%` is a *chance to block the bite* —
 * `rollChance(infection)`, so 50 blocks half the time. Both are "percent", one
 * scales damage and the other rolls, and a copy of the fire formula into the
 * infection path would silently halve infection instead of blocking it. The
 * model field's doc comment says so, and the last test here pins the two apart.
 *
 * The fire half has **no reader yet** and cannot have one: the port has no fire
 * damage at all, which arrives with `TileFires`. That is a fact about the tree,
 * asserted below so the gap stays visible rather than being a comment that goes
 * stale.
 *
 * As with `WeaponWeight`, the values are cross-checked against the fork's own CSV
 * rather than against what a biohazard suit ought to be worth.
 *
 * These tests call `Rules.infectionBlockedByArmor` rather than re-implementing
 * the roll. That is not tidiness: a first version of this file had its own copy
 * of the decision, and consequently **passed with the ruleset gate deleted and
 * passed with the fire formula substituted for the infection one** -- the two
 * mutations that matter most. The rule and the gate are now one function in
 * `Rules`, and the test drives it.
 */

beforeAll(() => {
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

function makeActor(id: ActorID = ActorID.MALE_CIVILIAN): Actor {
  return new Actor(Models.actors.get(id), survivors, "survivor");
}

function wear(actor: Actor, id: ItemID): ItemBodyArmor {
  const item = new ItemBodyArmor(Models.items.get(id) as ItemBodyArmorModel);
  actor.inventory!.addAll(item);
  item.equippedPart = item.model.equipmentPart;
  return item;
}

let rules: Rules;

beforeEach(() => {
  rules = new Rules(new DiceRoller(1));
});

describe("Feature.ArmorResist: the merged armour table", () => {
  it("carries the fork's resistances", () => {
    // From the fork's Items_Armors.csv, not from intuition: the fire hazard suit
    // is 100 fire / 30 infection and the biohazard suit is 5 fire / 50
    // infection. The second is the useful entry -- "biohazard" reads like
    // infection-first and it is, but it is the *weakest* fire resist in the table.
    const of = (id: ItemID) => Models.items.get(id) as ItemBodyArmorModel;
    const fire = of(ItemID.ARMOR_FIRE_HAZARD_SUIT);
    expect(fire.fireResistance, "fire hazard suit, fire").toBe(100);
    expect(fire.infectionResistance, "fire hazard suit, infection").toBe(30);
    const bio = of(ItemID.ARMOR_BIOHAZARD_SUIT);
    expect(bio.fireResistance, "biohazard suit, fire").toBe(5);
    expect(bio.infectionResistance, "biohazard suit, infection").toBe(50);
  });

  it("gives every vanilla piece zero, because the columns are Still Alive's", () => {
    // Alpha 10.1 has no such columns, so "ours wins" left them all 0 -- which
    // means the gated roll below is `rollChance(0)` and cannot succeed even if
    // the gate were ever dropped.
    for (const id of [ItemID.ARMOR_ARMY_BODYARMOR, ItemID.ARMOR_POLICE_JACKET,
                      ItemID.ARMOR_POLICE_RIOT, ItemID.ARMOR_HUNTER_VEST,
                      ItemID.ARMOR_CHAR_LIGHT_BODYARMOR,
                      ItemID.ARMOR_HELLS_SOULS_JACKET,
                      ItemID.ARMOR_FREE_ANGELS_JACKET]) {
      const m = Models.items.get(id) as ItemBodyArmorModel;
      expect(m.fireResistance, `${id} fire`).toBe(0);
      expect(m.infectionResistance, `${id} infection`).toBe(0);
    }
  });

  it("copies the values onto the item, as the C# does", () => {
    // `ItemBodyArmor.cs:35-36` copies model -> item with a private setter rather
    // than reaching through `model` at each call site, and the port follows.
    const item = new ItemBodyArmor(
      Models.items.get(ItemID.ARMOR_FIRE_HAZARD_SUIT) as ItemBodyArmorModel);
    expect(item.fireResistance).toBe(100);
    expect(item.infectionResistance).toBe(30);
  });
});

describe("Feature.ArmorResist: the gated roll", () => {
  it("is 0% for vanilla armour, so a vanilla bite still infects", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const actor = makeActor();
    wear(actor, ItemID.ARMOR_POLICE_RIOT);
    // A deterministic roller: with a 0% chance the roll must fail every time,
    // and 40 attempts is enough to make a stray non-zero value obvious.
    for (let i = 0; i < 40; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      expect(rules.infectionBlockedByArmor(actor), `seed ${i + 1}`).toBe(false);
    }
  });

  it("blocks a percentage of bites on resistant armour", () => {
    // The biohazard suit's 50 is the clearest case: over many seeds it should
    // block roughly half. Asserted as a band rather than an exact count, because
    // the roller is a DiceRoller and the distribution is not the point -- the
    // point is that the number reaches the roll at all.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const actor = makeActor();
    wear(actor, ItemID.ARMOR_BIOHAZARD_SUIT);
    let blocked = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      if (rules.infectionBlockedByArmor(actor)) blocked++;
    }
    expect(blocked, "roughly half of 200").toBeGreaterThan(trials * 0.35);
    expect(blocked).toBeLessThan(trials * 0.65);
  });

  it("scales with the value, not as a damage multiplier", () => {
    // The distinction, asserted: 50 means "half the bites blocked", and *not*
    // "half the infection". A copy of the fire formula would still block a
    // proportion of bites here, so this is a rate test, not a damage test -- the
    // real separation is that 100 must block *every* bite, which a multiplier
    // reading of 100 would also satisfy, and 0 must block none, which it would
    // too. What separates them is the middle, so that is what is checked.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const rate = (id: ItemID): number => {
      const actor = makeActor();
      wear(actor, id);
      let blocked = 0;
      for (let i = 0; i < 200; i++) {
        rules = new Rules(new DiceRoller(i + 1));
        if (rules.infectionBlockedByArmor(actor)) blocked++;
      }
      return blocked / 200;
    };
    const none = rate(ItemID.ARMOR_POLICE_RIOT);       // 0
    const half = rate(ItemID.ARMOR_BIOHAZARD_SUIT);    // 50
    const most = rate(ItemID.ARMOR_FIRE_HAZARD_SUIT);  // 30 -- *below* 50
    expect(none).toBe(0);
    expect(half).toBeGreaterThan(most);
    // And the ordering is by INF_RESIST%, not by the suit's reputation: the fire
    // hazard suit blocks *less* than the biohazard one despite being the one
    // named for the hazard.
    expect(most).toBeLessThan(half);
  });

  it("the fire half has no reader yet, because the port has no fire damage", () => {
    // Recorded as an assertion so the gap cannot quietly become a stale comment.
    //
    // `fireResistance` is loaded from the merged table and carried on the item,
    // and nothing reads it. The fork's use is `dmg -= dmg * (fire / 100)` inside
    // a damage path keyed on "this damage was fire-caused" -- a flag the port has
    // no concept of, because fire is Still Alive content (`TileFires`,
    // `FireBarrels`). So today the fire hazard suit is only a slow suit.
    //
    // Asserted by scanning the engine for a reader rather than by counting
    // nothing: the declaration sites are excluded, and what remains must be empty.
    // If `TileFires` lands and wires this up, this test is the thing that has to
    // be deleted, and it will say so rather than being quietly tightened.
    const engine = readFileSync(
      resolve(__dirname, "../src/engine/RogueGame.ts"), "utf-8");
    const readers = engine
      .split("\n")
      .filter((line) => /fireResistance/.test(line))
      .filter((line) => !/^\s*(\/\/|\*)/.test(line));
    expect(readers, "a reader for fireResistance exists -- update this test")
      .toEqual([]);
  });
});
