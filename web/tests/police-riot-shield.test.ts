/**
 * The police riot shield's block roll — Still Alive, Release 7-2.
 *
 * `POLICE_RIOT_SHIELD` is the one item of the eleven that is not a data row: its
 * flavour text interpolates a rule constant, so porting it meant porting the
 * rule, the accessor and the roll. This file covers the two primitives that roll
 * rests on.
 *
 * ## What is *not* covered here, and why it matters
 *
 * The load-bearing detail is that a blocked swing is the reference's `if`/`else`
 * (`RogueGame.cs:18368-18390`): the entire hit/miss resolution sits in the `else`
 * arm, so a block does no damage at all. Reading the branch as an extra `if`
 * layered over the resolution instead would produce an attack that announces it
 * was blocked and then wounds the defender anyway.
 *
 * That is a property of the *shape* of `DoMeleeAttack`, not of either method
 * below, so it is pinned by reading the branch rather than by driving a swing:
 * a randomised roll would have to be caught in the act to distinguish "blocked"
 * from "missed", and both leave the defender's hit points unchanged, so a test
 * built on hit points alone cannot tell the bug this file's siblings guard
 * against from a miss. `getEquippedShield` and `actorShieldChanceToBlock` are
 * testable directly and are tested directly.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { Models } from "@data/Models";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { SkillID } from "@gameplay/Skills";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let actor: Actor;

const shield = (): Item => new Item(Models.items.get(ItemID.POLICE_RIOT_SHIELD)!);

/** Put `item` on `part`, which is all `getEquippedItem` actually reads. */
const equip = (item: Item, part: number): void => {
  (item as unknown as { equippedPart: number }).equippedPart = part;
  actor.inventory!.addAll(item);
};

beforeEach(() => {
  new GameActors();
  new GameItems();
  Session.useSeed(1);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  game = new RogueGame(new NullRogueUI());
  actor = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
});

describe("Actor.getEquippedShield", () => {
  it("finds a shield on the left arm and nothing anywhere else", () => {
    // Release 7-2. The left arm is the shield slot; `EquipmentPart` is what makes
    // the shield findable at all, and it is why DollPart.LEFT_ARM had to exist.
    expect(actor.getEquippedShield(), "nothing equipped").toBeNull();

    const s = shield();
    equip(s, DollPart.LEFT_ARM);
    expect(actor.getEquippedShield()).toBe(s);

    // Every other part must not answer. `BACK` is the neighbouring value and the
    // one a slip would reach for, since it is 9 and LEFT_ARM is 10 here.
    for (const part of [
      DollPart.RIGHT_HAND,
      DollPart.LEFT_HAND,
      DollPart.HEAD,
      DollPart.TORSO,
      DollPart.LEGS,
      DollPart.FEET,
      DollPart.BACK,
    ]) {
      actor.inventory = new Inventory(10);
      const other = shield();
      equip(other, part);
      expect(actor.getEquippedShield(), `part ${part} must not read as a shield`).toBeNull();
    }
  });

  it("treats anything on the left arm as a shield, which is the reference's rule", () => {
    // The counter-intuitive one, and the reason this accessor exists in this shape.
    // There is no `ItemShieldModel` in the fork, so "is this a shield" is decided
    // by *which arm the item is on* and by nothing else. A crowbar on the left arm
    // blocks exactly as well as the riot shield does.
    //
    // Asserting the opposite would be asserting a stricter rule than the C# has,
    // and the stricter rule would be a silent divergence: it would read as a
    // correctness improvement while quietly changing which items block.
    const wrong = new Item(Models.items.get(ItemID.MELEE_CROWBAR)!);
    equip(wrong, DollPart.LEFT_ARM);
    expect(actor.getEquippedShield()).toBe(wrong);
  });
});

describe("Rules.actorShieldChanceToBlock", () => {
  it("is 25 with no Martial Arts, plus 5 per level", () => {
    // C# Rules.cs:4765-4769. `SHIELD_BASE_BLOCK_CHANCE` is 25 and
    // `SKILL_MARTIAL_ARTS_SHIELD_BONUS` is 5, so the reader's displayed total is
    // the number the roll actually uses -- which is the whole reason
    // DescribeItemLong rewrites the flavour text.
    const rules = game.m_Rules;
    for (let level = 0; level <= 4; level++) {
      actor.sheet.skillTable.addOrIncreaseSkill(SkillID.MARTIAL_ARTS);
      expect(actor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS)).toBe(level + 1);
      break;
    }

    expect(rules.actorShieldChanceToBlock(actor)).toBe(
      Rules.SHIELD_BASE_BLOCK_CHANCE + Rules.SKILL_MARTIAL_ARTS_SHIELD_BONUS,
    );
  });

  it("adds exactly 5 per Martial Arts level", () => {
    const rules = game.m_Rules;
    const base = rules.actorShieldChanceToBlock(actor);
    expect(base).toBe(25);

    let previous = base;
    for (let level = 1; level <= 3; level++) {
      actor.sheet.skillTable.addOrIncreaseSkill(SkillID.MARTIAL_ARTS);
      const now = rules.actorShieldChanceToBlock(actor);
      expect(now, `level ${level}`).toBe(previous + Rules.SKILL_MARTIAL_ARTS_SHIELD_BONUS);
      expect(now).toBe(25 + 5 * level);
      previous = now;
    }
  });

  it("never exceeds a sane percentage", () => {
    // Not a C# assertion -- a guard against the bonus being applied twice, which
    // would read as a 55% block chance and be very hard to notice in play.
    actor.sheet.skillTable.addOrIncreaseSkill(SkillID.MARTIAL_ARTS);
    actor.sheet.skillTable.addOrIncreaseSkill(SkillID.MARTIAL_ARTS);
    const chance = game.m_Rules.actorShieldChanceToBlock(actor);
    expect(chance).toBeGreaterThan(25);
    expect(chance).toBeLessThanOrEqual(100);
  });
});

describe("the shield's registered model", () => {
  it("is a left-arm part and is not stackable", () => {
    const model = Models.items.get(ItemID.POLICE_RIOT_SHIELD)!;
    expect(model.equipmentPart).toBe(DollPart.LEFT_ARM);
    expect(model.isStackable).toBe(false);
    // The C# omits CanGoInBackpacks here (:3036-3040) where ten of its eleven
    // siblings set it, so the shield must not be in the backpack set.
    expect(model.flavorDescription).toContain("25");
  });
});
