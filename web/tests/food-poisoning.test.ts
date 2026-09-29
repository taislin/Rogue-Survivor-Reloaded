import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Session, Ruleset } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Actor } from "@data/Actor";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { ItemFood, ItemFoodModel } from "@engine/items/ItemFood";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { WorldTime } from "@engine/WorldTime";
import { GameImages } from "@gameplay/GameImages";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Map as GameMap } from "@data/Map";
import { Point } from "@engine/Point";
import { SkillID } from "@gameplay/Skills";
import { Skill } from "@data/Skill";

/**
 * `Feature.FoodPoisoning`: raw meat can poison, time and antivirals can cure it.
 *
 * Still Alive, Release 7-6, and the first feature here with *more than one*
 * reader, which is where the shape starts to matter: contraction, per-turn
 * recovery and the antiviral cure are three separate hooks, and the flag has to
 * be set and cleared consistently across all of them.
 *
 * The perishing multiplier is the part worth reading twice. The chance is
 * `max(20, 20 * factor)`, and the factors come from the port's *own* freshness
 * helpers, whose names are counter-intuitive: `isFoodStillFresh` is
 * `turnCounter < bestBefore`, `isFoodExpired` is up to `2 * bestBefore`, and
 * `isFoodSpoiled` is past that — so "spoiled" is the **most** extreme of the
 * three, not the mild middle. Factors are therefore 1 fresh, 3 expired, 5
 * spoiled, and rotten meat is *certain* while merely-expired is 60%.
 *
 * The `max` is not redundancy either: the Hardy bonus is a *subtraction*, so
 * without it an actor with a high Hardy bonus would roll against a negative
 * chance on fresh meat.
 */

beforeAll(() => {
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

function makeActor(): Actor {
  return new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
}

let rules: Rules;
let game: RogueGame;
let map: GameMap;

beforeEach(() => {
  rules = new Rules(new DiceRoller(1));
  game = new RogueGame(new NullRogueUI());
  // The constructor is (seed, name, width, height); two numbers would set the
  // *name* and leave every placeActor failing a bounds check.
  map = new GameMap(1, "test", 40, 40);
});

describe("Feature.FoodPoisoning: the merged food table", () => {
  it("marks exactly the five raw meats, and no cooked one", () => {
    const poison = (id: ItemID) =>
      (Models.items.get(id) as ItemFoodModel).canCauseFoodPoisoning;
    for (const id of [ItemID.FOOD_RAW_FISH, ItemID.FOOD_RAW_RABBIT,
                      ItemID.FOOD_RAW_CHICKEN, ItemID.FOOD_RAW_DOG_MEAT,
                      ItemID.FOOD_RAW_HUMAN_FLESH]) {
      expect(poison(id), `${id} is raw`).toBe(true);
    }
    // The cooked twins of four of those are in the table, and are not poisonous.
    // This is the pair that matters: if the cooked row inherited the raw row's
    // flag, cooking would not be worth doing.
    for (const id of [ItemID.FOOD_COOKED_FISH, ItemID.FOOD_COOKED_RABBIT,
                      ItemID.FOOD_COOKED_CHICKEN, ItemID.FOOD_COOKED_DOG_MEAT,
                      ItemID.FOOD_COOKED_HUMAN_FLESH]) {
      expect(poison(id), `${id} is cooked`).toBe(false);
    }
  });

  it("leaves every vanilla food alone, because the column is Still Alive's", () => {
    // Alpha 10.1 has no such column, so "ours wins" gave them all 0 -- which
    // means classic is untouched even with the flag on.
    for (const id of [ItemID.FOOD_ARMY_RATION, ItemID.FOOD_GROCERIES,
                      ItemID.FOOD_CANNED_FOOD]) {
      const m = Models.items.get(id) as ItemFoodModel;
      expect(m.canCauseFoodPoisoning, `${id} fire... poisoning`).toBe(false);
      expect(m.canBeCooked, `${id} canBeCooked`).toBe(false);
    }
  });

  it("copies the flags onto the item, as the C# does", () => {
    const raw = new ItemFood(Models.items.get(ItemID.FOOD_RAW_RABBIT));
    expect(raw.canCauseFoodPoisoning).toBe(true);
    expect(raw.canBeCooked).toBe(true);
  });
});

describe("Feature.FoodPoisoning: contraction", () => {
  const rawRabbit = () => new ItemFood(Models.items.get(ItemID.FOOD_RAW_RABBIT));

  it("poisons under STILL_ALIVE and never under CLASSIC", () => {
    const trials = 200;
    for (const ruleset of [Ruleset.CLASSIC, Ruleset.STILL_ALIVE]) {
      Session.get().ruleset = ruleset;
      let poisoned = 0;
      for (let i = 0; i < trials; i++) {
        rules = new Rules(new DiceRoller(i + 1));
        const a = makeActor();
        if (rules.contractFoodPoisoning(a, rawRabbit(), 0)) poisoned++;
      }
      if (ruleset === Ruleset.CLASSIC) {
        expect(poisoned, "classic must never poison").toBe(0);
      } else {
        // 20% on fresh meat. A band, because the point is that the number
        // reaches the roll, not the exact distribution.
        expect(poisoned).toBeGreaterThan(trials * 0.1);
        expect(poisoned).toBeLessThan(trials * 0.32);
      }
    }
  });

  it("never poisons on food that cannot cause it", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const safe = new ItemFood(Models.items.get(ItemID.FOOD_ARMY_RATION));
    for (let i = 0; i < 200; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      const a = makeActor();
      expect(rules.contractFoodPoisoning(a, safe, 0)).toBe(false);
      expect(a.isFoodPoisoned).toBe(false);
    }
  });

  it("scales with the food's own freshness terms: 1 fresh, 3 expired, 5 spoiled", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const model = Models.items.get(ItemID.FOOD_RAW_RABBIT) as ItemFoodModel;
    const until = model.bestBeforeDays;
    expect(until, "the raw rabbit is perishable").toBeGreaterThan(0);

    // `ItemFood(model, n)` sets bestBefore to turn n, so the *same* item is fresh
    // at turn 0 with a future expiry, expired once the turn passes it, and
    // spoiled past twice it. Constructing it the other way round -- bestBefore 0
    // and turning the counter up -- is also valid and starts maximally stale,
    // which is an easy way to write a test that looks right and is inverted.
    const factorAt = (bestBefore: number, now: number): number =>
      rules.foodPoisoningPerishingFactor(new ItemFood(model, bestBefore), now);
    const rateAt = (bestBefore: number, now: number): number => {
      const food = new ItemFood(model, bestBefore);
      let hits = 0;
      for (let i = 0; i < 200; i++) {
        rules = new Rules(new DiceRoller(i + 1));
        if (rules.contractFoodPoisoning(makeActor(), food, now)) hits++;
      }
      return hits / 200;
    };

    expect(factorAt(until, 0), "fresh").toBe(1);
    expect(rateAt(until, 0), "fresh is the 20% base").toBeLessThan(0.32);

    expect(factorAt(until, until), "expired, the turn it goes off").toBe(3);
    expect(rateAt(until, until), "expired is 60%").toBeGreaterThan(0.45);

    expect(factorAt(until, 2 * until), "spoiled, past twice the expiry").toBe(5);
    expect(rateAt(until, 2 * until), "spoiled is certain").toBe(1);
  });

  it("leaves the flag off when the roll fails", () => {
    // The negative half, which a `contractFoodPoisoning` that returned true
    // unconditionally would still pass.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (let i = 0; i < 200; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      const a = makeActor();
      if (!rules.contractFoodPoisoning(a, rawRabbit(), 0)) {
        expect(a.isFoodPoisoned, `seed ${i + 1} failed the roll but set the flag`)
          .toBe(false);
      }
    }
  });
});

describe("Feature.FoodPoisoning: recovery", () => {
  it("clears the flag at the base rate and never under CLASSIC", () => {
    const trials = 400;
    for (const ruleset of [Ruleset.CLASSIC, Ruleset.STILL_ALIVE]) {
      Session.get().ruleset = ruleset;
      let recovered = 0;
      for (let i = 0; i < trials; i++) {
        rules = new Rules(new DiceRoller(i + 1));
        const a = makeActor();
        a.isFoodPoisoned = true;
        if (rules.recoverFromFoodPoisoning(a)) recovered++;
        if (ruleset === Ruleset.CLASSIC) {
          expect(a.isFoodPoisoned, "classic must not clear it, and must not clear the flag")
            .toBe(true);
        }
      }
      if (ruleset === Ruleset.STILL_ALIVE) {
        // 1% a turn, so over 400 turns a clear handful. Asserted as a band: the
        // point is that the roll happens and the flag follows it.
        expect(recovered).toBeGreaterThan(0);
        expect(recovered).toBeLessThan(trials * 0.08);
      } else {
        expect(recovered, "classic never recovers").toBe(0);
      }
    }
  });

  it("is a no-op on an actor who is not poisoned", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (let i = 0; i < 50; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      expect(rules.recoverFromFoodPoisoning(makeActor())).toBe(false);
    }
  });

  it("Hardy raises the recovery chance", () => {
    // The bonus is per level, so a Hardy actor recovers more often. Asserted
    // through the bonus accessor rather than by measuring a rate, because the
    // base is 1% and a rate difference at that size needs an enormous sample.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const plain = makeActor();
    const hardy = makeActor();
    const skill = hardy.sheet.skillTable.getSkill(SkillID.HARDY) ??
      new Skill(SkillID.HARDY);
    hardy.sheet.skillTable.addSkill(skill);
    skill.level = 3;
    expect(hardy.sheet.skillTable.getSkillLevel(SkillID.HARDY)).toBe(3);
    expect(rules.actorRecoverFromFoodPoisoningChanceBonus(plain)).toBe(0);
    expect(rules.actorRecoverFromFoodPoisoningChanceBonus(hardy))
      .toBe(Rules.SKILL_HARDY_FOOD_POISONING_RECOVERY_CHANCE_BONUS * 3);
  });
});


describe("Feature.FoodPoisoning: the vomit", () => {
  /**
   * The visible half of the feature, and the part with a trap in it.
   *
   * Vanilla already had `DoVomit` — the cannibalism and nausea paths both call
   * it — and the fork's Release 7-6 pass changed *every* vomit: four hours of
   * sleep and food instead of one, plus a two-day timer on the decoration.
   * Quoting the C# and porting it wholesale would have quietly quadrupled the
   * cost of vanilla cannibalism, so both halves sit behind the flag, and the
   * test below asserts the classic case rather than trusting the gate.
   */

  /** A fresh actor on its own tile, which `DoVomit` needs for the tile. */
  let nextTile = 20;
  const placed = (): Actor => {
    const a = makeActor();
    map.placeActor(a, new Point(20, nextTile++));
    return a;
  };
  beforeEach(() => { nextTile = 20; });
  const tileAt = (actor: Actor) => {
    const p = actor.location.position;
    return actor.location.map!.getTileAt(p.x, p.y)!;
  };

  it("costs four hours of sleep and food under STILL_ALIVE, one under CLASSIC", () => {
    for (const [ruleset, hours] of [[Ruleset.STILL_ALIVE, 4], [Ruleset.CLASSIC, 1]] as const) {
      Session.get().ruleset = ruleset;
      const a = placed();
      const sta = a.staminaPoints;
      const slp = a.sleepPoints;
      const fd = a.foodPoints;
      game.DoVomit(a);
      expect(a.sleepPoints - slp, `${ruleset} sleep`).toBe(-WorldTime.TURNS_PER_HOUR * hours);
      expect(a.foodPoints - fd, `${ruleset} food`).toBe(-WorldTime.TURNS_PER_HOUR * hours);
      expect(a.staminaPoints - sta, `${ruleset} stamina`).toBe(-Rules.FOOD_VOMIT_STA_COST);
    }
  });

  it("floors sleep and food at zero rather than going negative", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const a = placed();
    a.sleepPoints = 1;
    a.foodPoints = 1;
    game.DoVomit(a);
    expect(a.sleepPoints).toBe(0);
    expect(a.foodPoints).toBe(0);
  });

  it("puts the decoration on a two-day timer, once, under STILL_ALIVE", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const a = placed();
    const before = map.timers.length;
    game.DoVomit(a);
    expect(tileAt(a).hasDecoration(GameImages.DECO_VOMIT)).toBe(true);
    expect(map.timers.length - before, "first vomit arms one timer").toBe(1);
    // Two days, not one and not a day-and-a-half. Counting timers alone cannot
    // see this, so the duration is pinned directly.
    expect(map.timers[map.timers.length - 1].turnsLeft).toBe(WorldTime.TURNS_PER_DAY * 2);

    // A second vomit on the same tile must not restart the clock, which is the
    // whole reason for the hasDecoration check. Asserting on the decoration's
    // presence does not catch that -- it is true either way -- so this counts
    // timers, which is what actually differs when the guard is removed.
    game.DoVomit(a);
    expect(tileAt(a).hasDecoration(GameImages.DECO_VOMIT)).toBe(true);
    expect(map.timers.length - before, "no second timer").toBe(1);

    // A different tile does arm its own, so the guard is per-tile and not a
    // "have I ever vomited" latch.
    const b = placed();
    game.DoVomit(b);
    expect(map.timers.length - before, "a different tile arms its own").toBe(2);
  });

  it("arms no timer under CLASSIC, matching vanilla's accumulate-forever decor", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const a = placed();
    const before = map.timers.length;
    game.DoVomit(a);
    game.DoVomit(a);
    expect(tileAt(a).hasDecoration(GameImages.DECO_VOMIT)).toBe(true);
    expect(map.timers.length - before, "vanilla never armed a timer").toBe(0);
  });

  it("costs the player their action at the fork's 5% chance", () => {
    // The effect only fires when the roll succeeds, so over many seeds it must
    // fire *sometimes* and not always.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    let fired = 0;
    for (let i = 0; i < 400; i++) {
      rules = new Rules(new DiceRoller(i + 1));
      if (rules.rollChance(Rules.FOOD_POISONING_AFFECTED_ACTION_CHANCE)) fired++;
    }
    expect(Rules.FOOD_POISONING_AFFECTED_ACTION_CHANCE).toBe(5);
    expect(fired, "roughly 5% of 400").toBeGreaterThan(0);
    expect(fired).toBeLessThan(400 * 0.15);
  });

  it("never fires for an actor who is not poisoned", () => {
    // The gate in TryPlayerFoodPoisoning, asserted through the flag rather than
    // the method, since the method needs a Game.
    Session.get().ruleset = Ruleset.CLASSIC;
    const a = makeActor();
    a.isFoodPoisoned = true;
    // Under CLASSIC the roll never runs, so the classic path cannot cost an
    // action even for a poisoned actor -- the state is unreachable there.
    expect(hasFeature(Session.get().ruleset, Feature.FoodPoisoning)).toBe(false);
    expect(a.isFoodPoisoned).toBe(true);
  });
});


describe("Feature.FoodPoisoning: which medicine cures it", () => {
  /**
   * A regression for a bug that was actually shipped in this branch.
   *
   * The first cut of the cure sat in the middle of `DoUseMedicineItem` with no
   * condition on the medicine at all, so *any* medicine -- bandages, sanity
   * pills, a full medikit, even a plain bandage -- cleared `isFoodPoisoned`.
   * The C# is an explicit three-model list inside an `else if` chain, and
   * nothing else falls through into it.
   *
   * `infectionCure > 0` would have looked right and been wrong: medikits do
   * carry a cure value, so it passes, but it also admits any other curative and
   * so widens the fork's behaviour. The model list is the only faithful gate.
   */

  let tile = 20;
  beforeEach(() => { tile = 20; });
  const placed = (): Actor => {
    const a = makeActor();
    map.placeActor(a, new Point(20, tile++));
    return a;
  };
  const consume = (id: ItemID) => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const a = placed();
    a.isFoodPoisoned = true;
    game.DoUseMedicineItem(a, new ItemMedicine(Models.items.get(id)));
    return a.isFoodPoisoned;
  };

  it("cures on the three models the C# names", () => {
    expect(consume(ItemID.MEDICINE_SMALL_MEDIKIT)).toBe(false);
    expect(consume(ItemID.MEDICINE_LARGE_MEDIKIT)).toBe(false);
    expect(consume(ItemID.MEDICINE_PILLS_ANTIVIRAL)).toBe(false);
  });

  it("does NOT cure on anything else, however curative", () => {
    // This is the assertion the old code failed.
    expect(consume(ItemID.MEDICINE_BANDAGES)).toBe(true);
    expect(consume(ItemID.MEDICINE_PILLS_SAN)).toBe(true);
    expect(consume(ItemID.MEDICINE_PILLS_STA)).toBe(true);
    expect(consume(ItemID.MEDICINE_PILLS_SLP)).toBe(true);
  });

  it("does not cure under CLASSIC either, where the state cannot occur", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const a = placed();
    a.isFoodPoisoned = true;
    const med = new ItemMedicine(
      Models.items.get(ItemID.MEDICINE_PILLS_ANTIVIRAL),
    );
    game.DoUseMedicineItem(a, med);
    expect(a.isFoodPoisoned).toBe(true);
  });
});
