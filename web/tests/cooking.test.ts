import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Session, Ruleset } from "@engine/Session";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Actor } from "@data/Actor";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { ItemFood, ItemFoodModel } from "@engine/items/ItemFood";
import { Item } from "@data/Item";
import { MapObject } from "@data/MapObject";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Point } from "@engine/Point";
import { Map as GameMap } from "@data/Map";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";

/**
 * `Feature.Cooking`: raw meat left by a fire becomes its cooked twin.
 *
 * Automatic and per-turn in the C# — every alight map object ticks whatever food
 * is lying on it, four passes to finish — rather than a player action, which is
 * the opposite of what the feature's description ("cooking raw food on a fire")
 * suggests and worth being explicit about.
 *
 * The point of the feature is the loop it closes with `FoodPoisoning`: five raw
 * meats poison, five cooked twins do not, and cooking is the only way across.
 * Several tests here are pairs in that sense, because a conversion that worked
 * for the wrong reason would still pass a test on the swap alone.
 */

beforeAll(() => {
  new GameActors();
  new GameItems();
});

const survivors = new Faction("The Survivors", "survivor");

let rules: Rules;
let map: GameMap;
let actor: Actor;
let game: RogueGame;

beforeEach(() => {
  rules = new Rules(new DiceRoller(1));
  // The constructor is (seed, name, width, height) -- passing two numbers sets
  // the *width* and the *name*, and every `placeActor` then fails a bounds check
  // that looks inexplicable.
  map = new GameMap(1, "test", 40, 40);
  actor = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
  game = new RogueGame(new NullRogueUI());
  map.placeActor(actor, new Point(20, 20));
});

/**
 * An alight map object at a tile -- the heat source.
 *
 * A bare `MapObject` rather than a barrel or a campfire: the port has neither
 * class yet (both arrive with `FireBarrels`), and the cooking rule asks only
 * whether *some* neighbouring object `isOnFire`. The C# casts to
 * `Campfire`/`Barrel`/`Car` to work out *what* is alight, not to decide whether
 * cooking is allowed, so a plain object exercises the same path.
 */
function lightFire(at: Point): MapObject {
  const obj = new MapObject("fire", "Tiles/floor_asphalt",
    MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE);
  obj.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(obj, at);
  return obj;
}

function rawRabbit(): ItemFood {
  return new ItemFood(Models.items.get(ItemID.FOOD_RAW_RABBIT));
}

describe("Feature.Cooking: the raw/cooked pairing", () => {
  it("maps all five raw meats to their cooked twin", () => {
    const pairs: Array<[ItemID, ItemID]> = [
      [ItemID.FOOD_RAW_FISH, ItemID.FOOD_COOKED_FISH],
      [ItemID.FOOD_RAW_RABBIT, ItemID.FOOD_COOKED_RABBIT],
      [ItemID.FOOD_RAW_CHICKEN, ItemID.FOOD_COOKED_CHICKEN],
      [ItemID.FOOD_RAW_DOG_MEAT, ItemID.FOOD_COOKED_DOG_MEAT],
      [ItemID.FOOD_RAW_HUMAN_FLESH, ItemID.FOOD_COOKED_HUMAN_FLESH],
    ];
    for (const [raw, cooked] of pairs) {
      const found = rules.cookedFoodFor(Models.items.get(raw));
      expect(found, `${raw} -> ${cooked}`).toBeTruthy();
      expect(found!.id, `${raw} maps to the wrong twin`).toBe(cooked);
    }
  });

  it("has no twin for anything that is not a raw meat", () => {
    // The negative half, which the C# gets for free from a `switch` and a
    // by-id table does not: an id absent from the map must be null, not a
    // surprise.
    for (const id of [ItemID.FOOD_COOKED_RABBIT, ItemID.FOOD_ARMY_RATION,
                      ItemID.FOOD_GROCERIES, ItemID.MELEE_KATANA]) {
      expect(rules.cookedFoodFor(Models.items.get(id)), `${id} should have no twin`)
        .toBeNull();
    }
  });

  it("the cooked twin is non-poisoning and non-cookable, and the raw one is not", () => {
    // This is the whole reason the feature exists. A conversion that copied the
    // raw row's flags would produce a cooked item that still poisons.
    const raw = Models.items.get(ItemID.FOOD_RAW_RABBIT) as ItemFoodModel;
    const cooked = Models.items.get(ItemID.FOOD_COOKED_RABBIT) as ItemFoodModel;
    expect(raw.canCauseFoodPoisoning).toBe(true);
    expect(cooked.canCauseFoodPoisoning).toBe(false);
    expect(raw.canBeCooked).toBe(true);
    expect(cooked.canBeCooked).toBe(false);
  });

  it("takes four passes, as ItemFood.cs:66 says", () => {
    const food = rawRabbit();
    expect(food.cookedDegree).toBe(0);
    expect(food.maxCookedDegree).toBe(4);
  });
});

describe("Feature.Cooking: the predicate", () => {
  it("refuses under CLASSIC, and says why", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const food = rawRabbit();
    actor.inventory!.addAll(food);
    lightFire(new Point(21, 20));
    const r = rules.canActorCookFoodItem(actor, food);
    expect(r.can).toBe(false);
    expect(r.reason).toMatch(/ruleset/i);
  });

  it("allows raw meat in the inventory next to a fire", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const food = rawRabbit();
    actor.inventory!.addAll(food);
    lightFire(new Point(21, 20));
    expect(rules.canActorCookFoodItem(actor, food)).toEqual({ can: true, reason: "" });
  });

  it("gives the C#'s four reasons, in its order", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;

    // 1. not food
    const rock = new Item(Models.items.get(ItemID.MELEE_KATANA));
    expect(rules.canActorCookFoodItem(actor, rock).reason).toBe("not food");

    // 2. no need to cook it
    const cooked = new ItemFood(Models.items.get(ItemID.FOOD_COOKED_RABBIT));
    actor.inventory!.addAll(cooked);
    expect(rules.canActorCookFoodItem(actor, cooked).reason).toBe("no need to cook it");

    // 3. not in the inventory
    const loose = rawRabbit();
    expect(rules.canActorCookFoodItem(actor, loose).reason).toBe("not in inventory");

    // 4. not next to a fire -- nothing alight anywhere in this test, so the
    // fire cases above are the ones that add it.
    const held = rawRabbit();
    actor.inventory!.addAll(held);
    expect(rules.canActorCookFoodItem(actor, held).reason).toBe("must be next to a fire");

    // And with a fire beside them it is allowed, so the refusal above is the
    // fire and not the inventory.
    lightFire(new Point(21, 20));
    expect(rules.canActorCookFoodItem(actor, held).can).toBe(true);
  });

  it("counts fire on all eight neighbours, and diagonals", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const at = new Point(21, 19);
    lightFire(at);
    const food = rawRabbit();
    actor.inventory!.addAll(food);
    // (21,19) is a diagonal from (20,20): a 4-neighbour test would refuse.
    expect(rules.canActorCookFoodItem(actor, food).can).toBe(true);
  });
});

describe("Feature.Cooking: the per-turn conversion", () => {
  it("swaps a finished piece for its cooked twin, under STILL_ALIVE", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const at = new Point(20, 20);
    lightFire(at);
    const raw = rawRabbit();
    map.dropItemAt(raw, at);
    expect(raw.cookedDegree).toBe(0);

    // Drive the same loop the turn handler does, without a whole turn.
    cook();
    for (let turn = 1; turn < 4; turn++) {
      expect(map.getItemsAt(at)!.items[0], `turn ${turn} finished early`).toBe(raw);
      cook();
    }
    const cookedItem = map.getItemsAt(at)!.items[0] as ItemFood;
    expect(cookedItem, "four passes should have swapped it").not.toBe(raw);
    expect(cookedItem.model.id).toBe(ItemID.FOOD_COOKED_RABBIT);
    expect(cookedItem.canCauseFoodPoisoning, "the twin must not poison").toBe(false);
  });

  it("does nothing under CLASSIC", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const at = new Point(20, 20);
    lightFire(at);
    const raw = rawRabbit();
    map.dropItemAt(raw, at);
    for (let i = 0; i < 10; i++) cook();
    expect(map.getItemsAt(at)!.items[0], "classic must never cook").toBe(raw);
    expect(raw.cookedDegree).toBe(0);
  });

  it("leaves food that cannot be cooked alone", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const at = new Point(20, 20);
    lightFire(at);
    const ration = new ItemFood(Models.items.get(ItemID.FOOD_ARMY_RATION));
    map.dropItemAt(ration, at);
    for (let i = 0; i < 10; i++) cook();
    expect(map.getItemsAt(at)!.items[0]).toBe(ration);
    expect(ration.cookedDegree).toBe(0);
  });

  it("does not touch a fireless object", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const at = new Point(20, 20);
    const cold = new MapObject("cold", "Tiles/floor_asphalt",
      MapObjectBreak.BREAKABLE, MapObjectFire.BURNABLE);
    cold.fireState = MapObjectFire.BURNABLE;
    map.placeMapObject(cold, at);
    const raw = rawRabbit();
    map.dropItemAt(raw, at);
    for (let i = 0; i < 10; i++) cook();
    expect(map.getItemsAt(at)!.items[0]).toBe(raw);
  });
});

/**
 * The private cooking tick, reached from a test.
 *
 * `CookFoodOnFires` is private because the turn loop is its only real caller, so
 * this is a test reaching past that for a method with no other entry point. The
 * alternative -- running four full map turns -- would couple these assertions to
 * the turn order, and the thing under test is the swap, not the loop around it.
 */
const cook = (): void => {
  (game as unknown as { CookFoodOnFires(m: GameMap): void }).CookFoodOnFires(map);
};
