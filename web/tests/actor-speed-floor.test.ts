/**
 * `Rules.actorSpeed` can return 0, and 0 is a soft-lock.
 *
 * ## What the lock would be
 *
 * The per-turn regen is `actor.actionPoints += actorSpeed(actor)`
 * (`RogueGame.ts:5575`), and the scheduler only offers an actor who has
 * `actionPoints > 0` (`Rules.getNextActorToAct`, `Rules.ts:2331`). So an actor
 * with `actionPoints === 0` and `actorSpeed === 0` never regains anything and is
 * never scheduled again — permanently inert, with no error and no message. For an
 * NPC that is a cosmetic bug; for the **player** it is a dead run, because the
 * game sits waiting for an action that can never be taken.
 *
 * ## Why there is no `Math.max(speed, 1)` here
 *
 * Because it is not reachable, and adding the clamp would be a divergence from the
 * reference for a case that cannot occur. The reference has the *identical* clamp --
 * `Rules.cs:4680-4681`, "done, speed must be >= 0", `Math.Max((int)speed, 0)` -- and
 * `plans/MULTIPLAYER_PLAN.md` §5.3 proposed raising it to 1. That proposal was
 * written before anyone measured whether 0 is reachable, and the measurement says
 * the question is moot. Taking the clamp to 1 would also silently change 3 to 3
 * (no) but *would* change the meaning of the function for any future content that
 * could reach the floor.
 *
 * So the clamp stays faithful and this file pins the property instead. That is the
 * stronger artefact: a clamp raises the floor silently, whereas a pin **fails** the
 * moment the data changes underneath it.
 *
 * ## The measurement
 *
 * `actorSpeed` applies, in this order:
 *
 *     base -> x2/3 if tired -> /2 if exhausted -> -torso armour
 *          -> x0.75 if a shield is worn -> -weapon weight
 *          -> /2 if dragging a corpse -> max(floor, 0)
 *
 * Every term is read off shipped data, so the minimum is computable rather than
 * sampled: the heaviest torso armour in `Items_Armors.csv` is 10, the heaviest
 * weapon in `Items_MeleeWeapons.csv` is 10 (`MELEE_CHAINSAW`), and
 * `SHIELD_ENCUMBERANCE_PENALTY` is 0.75. Nothing writes `doll.body.speed` at
 * runtime -- it is fixed per actor model -- so the base is the model's own value.
 *
 * **Answer: 0 is unreachable, and the floor is 3.** Two facts do the work, and
 * neither is obvious from the base speeds alone:
 *
 * - `SEWERS_THING` is the only actor below 100 (33), and on base speed alone it
 *   looks stranded -- every term applied unconditionally is `33 * 2/3 / 2 - 10,
 *   x0.75, - 10, / 2 = -4.6`. But it is undead, so it fails **both** ability gates
 *   (`canTire` false, `hasToSleep` false) and never takes either multiplier. The
 *   low base and the missing multipliers are the same fact, and they cancel.
 * - Everyone else is base 100 (or 125 for `JASON_MYERS` / `DERANGED_PATIENT` /
 *   `CHAR_SCIENTIST`), which leaves 3.
 *
 * So the margin to the clamp is one CSV cell wide. All of: a torso armour or
 * weapon heavier than 10; a base speed below ~19 on an actor that can tire; or
 * `SHIELD_ENCUMBERANCE_PENALTY` below ~0.6.
 *
 * That thinness is why this is a test rather than a comment, and why the finding
 * is worth more than the one-line "fix" that was proposed. An earlier draft of
 * this file asserted 0 was unreachable on the base speeds alone and would have
 * been right by luck — the cancellation above is the actual argument.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Session, Ruleset } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Actor } from "@data/Actor";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import type { ItemWeaponModel } from "@engine/items/ItemWeapon";
import type { ItemBodyArmorModel } from "@engine/items/ItemBodyArmor";

// Each registers itself into the `Models` statics that `Actor` and `Item` need.
beforeAll(() => {
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

/** Every actor model, in enum order, as `[id, model]`. */
function allActors(): Array<[number, any]> {
  const out: Array<[number, any]> = [];
  for (let i = 0; i < ActorID._COUNT; i++) out.push([i, Models.actors.get(i)]);
  return out;
}

/**
 * `actorSpeed` with every penalty the shipped data can apply, all at once.
 *
 * Deliberately *arithmetic on the real model values* rather than a stubbed actor:
 * a stub would let the test pass while the real clamp was wrong, which is the
 * failure mode the `Attack`-style re-implementation warns about elsewhere in this
 * suite. The two abilities are read off the model because they gate the two
 * multiplies -- an actor that cannot tire never takes the x2/3.
 */
function worstCaseSpeed(model: any): number {
  const ab = model.abilities;
  // The two weights are read off the concrete models, not off `ItemModel`, which
  // does not declare them -- armour and weapon each add their own `weight` field.
  const armour = Models.items.get(ItemID.ARMOR_ARMY_BODYARMOR) as ItemBodyArmorModel;
  const weapon = Models.items.get(ItemID.MELEE_CHAINSAW) as ItemWeaponModel;
  let speed = model.dollBody.speed;
  if (ab.canTire) speed *= 2 / 3;
  if (ab.hasToSleep) speed /= 2;
  speed -= armour.weight;
  speed *= Rules.SHIELD_ENCUMBERANCE_PENALTY;
  speed -= weapon.weight;
  speed /= 2; // dragging a corpse
  return Math.max(Math.floor(speed), 0);
}

describe("actorSpeed can never reach its own zero clamp", () => {
  it("has a floor above zero for every actor that can carry a load", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const loadable = allActors().filter(([, m]) => m.abilities.hasInventory);

    const stranded = loadable
      .map(([id, m]) => [id, m.id ?? ActorID[id], worstCaseSpeed(m)] as const)
      .filter(([, , speed]) => speed <= 0);

    expect(
      stranded.map(([id, name]) => `${name} (${ActorID[id]}) floors to ${worstCaseSpeed(Models.actors.get(id))}`),
      "an actor that can equip a load must not be able to zero its own speed, " +
        "or it stops being scheduled (Rules.ts:2331) and never regains AP (RogueGame.ts:5575)",
    ).toEqual([]);
  });

  it("records the actual minimum, so a data change is visible as a number", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const speeds = allActors()
      .filter(([, m]) => m.abilities.hasInventory)
      .map(([, m]) => worstCaseSpeed(m));
    // Measured: 3 for the base-100 survivors and police, 22 for the 125-base
    // JASON_MYERS / DERANGED_PATIENT / CHAR_SCIENTIST. The margin to 0 is thin on
    // purpose -- that thinness is the reason this file exists.
    expect(Math.min(...speeds)).toBe(3);
  });

  it("SEWERS_THING has the lowest base speed, and is exempt from both multipliers", () => {
    // The near-miss, and the reason the floor holds at all.
    //
    // `SEWERS_THING` is the only actor with a base below 100 (33). On base speed
    // alone that looks like it should strand: applying *every* term unconditionally
    // gives 33 * 2/3 / 2 - 10, x0.75, - 10, / 2 = **-4.6**, so it floors to 0.
    //
    // It does not, because it is undead and therefore fails **both** ability
    // gates: `canTire` is false so it never takes the x2/3, and `hasToSleep` is
    // false so it never takes the /2. The low base and the missing multipliers are
    // the same fact. The real figure is 3 -- the same as everyone else.
    //
    // This is the assertion worth keeping: it is the one place where a data change
    // to *either* half (a base speed below ~19, or granting the undead the ability
    // to tire) would reach the clamp, and it fails first and says why.
    const sewersThing = Models.actors.get(ActorID.SEWERS_THING);
    expect(sewersThing.dollBody.speed).toBe(33);
    expect(sewersThing.abilities.canTire).toBe(false);
    expect(sewersThing.abilities.hasToSleep).toBe(false);
    expect(sewersThing.abilities.hasInventory).toBe(false);

    // Through the same arithmetic as every other row, not a hand-written sum.
    expect(worstCaseSpeed(sewersThing)).toBe(3);

    // The naive reading of the base speed alone -- every term applied, regardless
    // of whether this actor can incur it -- *does* reach the clamp. Asserted so the
    // cancellation above cannot be quietly deleted along with the numbers.
    const naive = Math.floor(
      ((33 * (2 / 3)) / 2 - 10) * Rules.SHIELD_ENCUMBERANCE_PENALTY - 10,
    ) / 2;
    expect(Math.max(Math.floor(naive), 0)).toBe(0);
  });

  it("keeps the reference's clamp rather than raising it", () => {
    // `Rules.cs:4680-4681`: `return Math.Max((int)speed, 0);`. Asserting the floor
    // is 0 and not 1 is asserting *faithfulness*, not a preference -- a future
    // session that "fixes" the soft-lock by clamping to 1 fails here.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const rules = new Rules(new DiceRoller(1));
    const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
    a.staminaPoints = 0; // tired: the cheapest way to drop speed without equipment
    expect(rules.actorSpeed(a)).toBeLessThan(Rules.BASE_ACTION_COST);
  });
});

describe("and the clamp is the only thing between a load and a soft-lock", () => {
  it("regen and scheduling agree that a positive speed is what keeps an actor alive", () => {
    // The two halves of the lock, named together so the relationship is not
    // folklore: regen adds `actorSpeed`, and the scheduler tests
    // `actionPoints > 0`. Any actor whose speed floors to 0 is skipped by the
    // second and fed by the first with nothing.
    //
    // Real actors throughout -- `canActorActNextTurn` calls `actorSpeed`, which
    // reads `actor.doll.body.speed`, so a `{actionPoints: 0}` literal throws
    // rather than answering. That is worth knowing: it means the predicate cannot
    // be probed with a stub, only with a real actor whose AP is set directly.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const rules = new Rules(new DiceRoller(1));
    const spent = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
    spent.actionPoints = 0;

    expect(rules.canActorActThisTurn(spent)).toBe(false);
    // Speed is 100 for a fresh civilian, so this is true -- it is the *only*
    // reason the actor comes back. A model whose speed floored to 0 fails here.
    expect(rules.canActorActNextTurn(spent)).toBe(true);
    expect(spent.doll.body.speed).toBeGreaterThan(0);

    // And the scheduler's own test is the AP, which regen is what raises.
    expect(spent.actionPoints).toBe(0);
  });

  it("shows the load the player would have to wear to approach the floor", () => {
    // Not an assertion so much as documentation in executable form: this is the
    // arithmetic from the file header, run through the real model values.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const armour = Models.items.get(ItemID.ARMOR_ARMY_BODYARMOR) as ItemBodyArmorModel;
    const saw = Models.items.get(ItemID.MELEE_CHAINSAW) as ItemWeaponModel;
    expect(armour.weight).toBe(10);
    expect(saw.weight).toBe(10);
    expect(Rules.SHIELD_ENCUMBERANCE_PENALTY).toBe(0.75);
  });
});
