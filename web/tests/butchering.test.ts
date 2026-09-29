/**
 * `Feature.Butchering` — what comes off a body, and how fresh.
 *
 * Still Alive, Release 7-6.
 *
 * Two surprises, and both of them *are* the feature:
 *
 * - **Fire is a cooking method you do not choose.** Meat off a body that died of
 *   fire comes out cooked; anything else comes out raw. That is the entire
 *   purpose of `Actor.causeOfDeath`.
 * - **Rot shortens the shelf life.** A corpse at rot level 5 yields meat good for
 *   a fifth of its normal time, because `bestBefore` is divided by the rot level.
 *
 * The bladed-weapon requirement is **player only** — the C#'s own decision, with
 * its reasoning in a comment, and enforcing it for the AI would make every NPC
 * carry a knife.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Corpse } from "@data/Corpse";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Location } from "@data/Location";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { DollPart } from "@data/Doll";
import { ItemFood } from "@engine/items/ItemFood";
import { ItemMeleeWeapon, type ItemMeleeWeaponModel } from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { DiceRoller } from "@engine/DiceRoller";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let rules: Rules;
let player: Actor;

beforeEach(() => {
  new GameActors();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  rules = new Rules(new DiceRoller(1));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(10, 10));
  game.m_Player = player;
});

/**
 * A corpse of `id`, killed by `cause`, lying where the player is standing.
 *
 * The dead actor is given a `Location` rather than placed: a corpse is what is
 * *left* of someone, so in the real game the actor is gone and only the corpse
 * occupies the tile. `placeActor` on the player's tile would throw "another actor
 * already at position", which is the map correctly refusing two bodies in one
 * square.
 */
const kill = (id: ActorID = ActorID.MALE_CIVILIAN, cause = "zombie bite"): Corpse => {
  const dead = new Actor(Models.actors.get(id), survivors, "victim");
  dead.location = new Location(map, player.location.position);
  dead.causeOfDeath = cause;
  const corpse = new Corpse(dead, 100, 100, 0, 0, 1);
  map.addCorpse(corpse);
  return corpse;
};

/** Mark a model as a live animal, which the port has no shipped model for. */
const asAnimal = (id: ActorID, name: string): void => {
  const model = Models.actors.get(id);
  model.abilities.isLivingAnimal = true;
  // The C#'s meat switch keys on the model's *name*, not its id.
  Object.defineProperty(model, "name", { value: name, configurable: true });
};

const equip = (id: ItemID): void => {
  const w = new ItemMeleeWeapon(Models.items.get(id));
  player.inventory!.addAll(w);
  // getEquippedMeleeWeapon reads RIGHT_HAND (the C#'s DollPart mapping), not left.
  w.equippedPart = DollPart.RIGHT_HAND;
};

const foods = (): ItemFood[] =>
  player.inventory!.items.filter((i): i is ItemFood => i instanceof ItemFood);

describe("Feature.Butchering: the bladed weapon", () => {
  it("marks exactly the C#'s thirteen bladed melee weapons", () => {
    const bladed = [
      ItemID.MELEE_COMBAT_KNIFE, ItemID.MELEE_CROWBAR, ItemID.MELEE_BONESAW,
      ItemID.MELEE_KATANA, ItemID.MELEE_MACHETE, ItemID.MELEE_STANDARD_AXE,
      ItemID.MELEE_CHAINSAW, ItemID.MELEE_CLEAVER, ItemID.MELEE_KITCHEN_KNIFE,
      ItemID.MELEE_SCIMITAR, ItemID.MELEE_SCYTHE, ItemID.MELEE_SICKLE,
      ItemID.MELEE_FIRE_AXE,
    ];
    for (const id of bladed) {
      expect((Models.items.get(id) as ItemMeleeWeaponModel).canUseForButchering, `id ${id}`).toBe(true);
    }
    // And the important negatives: a bat and a pan are not blades.
    for (const id of [ItemID.MELEE_BASEBALLBAT, ItemID.MELEE_FRYING_PAN]) {
      expect((Models.items.get(id) as ItemMeleeWeaponModel).canUseForButchering, `id ${id}`).toBe(false);
    }
  });

  it("refuses the player who is not holding one", () => {
    const res = rules.canActorButcherCorpse(player, kill());
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("need a bladed weapon equipped");
  });

  it("refuses the player holding something that is not a blade", () => {
    equip(ItemID.MELEE_BASEBALLBAT);
    const res = rules.canActorButcherCorpse(player, kill());
    expect(res.reason).toBe("need a bladed weapon equipped");
  });

  it("allows the player holding a blade", () => {
    equip(ItemID.MELEE_KITCHEN_KNIFE);
    const res = rules.canActorButcherCorpse(player, kill());
    expect(res.ok, res.reason).toBe(true);
  });

  it("does NOT enforce it for NPCs, which is the C#'s decision", () => {
    // The C#'s comment: "decided not to enforce this for NPCs, as having them
    // prioritise bladed weapons seemed like too much of a faff." Enforcing it for
    // the AI too would make every NPC carry a knife, which is a different game.
    // A tile of its own: the player already stands on (10, 10), and the map
    // rightly refuses two actors in one square.
    const at = new Point(11, 10);
    const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
    map.placeActor(npc, at);
    const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "vic");
    dead.location = new Location(map, at);
    const corpse = new Corpse(dead, 100, 100, 0, 0, 1);
    map.addCorpse(corpse);
    const res = rules.canActorButcherCorpse(npc, corpse);
    expect(res.ok, res.reason).toBe(true);
  });

  it("does not enforce it under CLASSIC", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const res = rules.canActorButcherCorpse(player, kill());
    expect(res.ok, "classic has no bladed-weapon rule").toBe(true);
  });
});

describe("Feature.Butchering: what comes off a human", () => {
  const butcher = (cause: string): void => {
    const corpse = kill(ActorID.MALE_CIVILIAN, cause);
    (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
      player,
      corpse,
    );
  };

  it("is raw flesh from anything that did not die of fire", () => {
    butcher("zombie bite");
    expect(foods().map((f) => f.model.id)).toEqual([ItemID.FOOD_RAW_HUMAN_FLESH]);
  });

  it("is COOKED flesh from a body that died of fire -- fire is a cooking method you do not choose", () => {
    butcher("fire");
    expect(foods().map((f) => f.model.id)).toEqual([ItemID.FOOD_COOKED_HUMAN_FLESH]);
  });

  it("the cooked meat cannot be cooked again", () => {
    butcher("fire");
    expect(foods().pop()!.canBeCooked, "already cooked").toBe(false);
    butcher("zombie bite");
    expect(foods().pop()!.canBeCooked, "raw meat still can").toBe(true);
  });

  it("the raw meat can poison, because that is what makes it food", () => {
    butcher("zombie bite");
    expect(foods()[0].canCauseFoodPoisoning).toBe(true);
  });

  it("is a single piece, and the AI may not take it", () => {
    butcher("zombie bite");
    const meat = foods().pop()!;
    // One. The `ResourcesAvailability` 3/2/1 switch is inside the C#'s
    // *animal* arm only, so a human body is never scaled by it and the item
    // keeps the quantity it was built with.
    expect(meat.quantity).toBe(1);
    expect(meat.isForbiddenToAI).toBe(true);
  });
});

describe("Feature.Butchering: rot shortens the shelf life", () => {
  it("a fresher corpse gives meat that keeps longer", () => {
    // Rot is a function of the corpse's remaining *hit points*, not its age --
    // `corpseRotLevel` buckets `freshnessPercent` into 0..5. Level 0 is "looks
    // fresh", level 5 is "about to crumble to dust".
    const shelfLife = (hitPoints: number): number => {
      const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "victim");
      dead.location = new Location(map, player.location.position);
      dead.causeOfDeath = "zombie bite";
      const corpse = new Corpse(dead, hitPoints, 100, 0, 0, 1);
      map.addCorpse(corpse);
      (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
        player,
        corpse,
      );
      return foods().pop()!.bestBefore!.turnCounter;
    };

    const fresh = shelfLife(100); // 100% -> rot 0 -> meat keeps its full 1 day
    const ancient = shelfLife(1); //   1%   -> rot 5 -> a fifth of that day
    expect(fresh, "more days on the raw meat").toBeGreaterThan(ancient);
  });

  it("divides the shelf life by the rot level, as the C# does", () => {
    // `bestBefore = now + TURNS_PER_DAY * bestBeforeDays / rotLevel`, and the raw
    // human flesh is a 1-day item, so rot 0 gives exactly one day and rot 5 gives
    // a fifth of one.
    //
    // The hit points are derived from the rules rather than hardcoded: rot is
    // bucketed off `freshnessPercent`, which is measured against the *model's* max
    // HP, and a percentage that lands on a band edge is a coin toss.
    const max = rules.actorMaxHPs(
      new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "probe"),
    );
    const shelfLife = (rotLevel: number): number => {
      // Aim at the middle of the freshness band that maps to `rotLevel`. The
      // bands are <5, <25, <50, <75, <90, else -- so a percentage that lands on an
      // edge is a coin toss, and 55% is rot *2*, not 3.
      const MIDPOINT_PCT: Record<number, number> = { 5: 2, 4: 15, 3: 37, 2: 62, 1: 82, 0: 100 };
      const hp = Math.floor((MIDPOINT_PCT[rotLevel] * max) / 100);
      const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "v");
      dead.location = new Location(map, player.location.position);
      const corpse = new Corpse(dead, hp, max, 0, 0, 1);
      expect(rules.corpseRotLevel(corpse), `rot level for ${rotLevel}`).toBe(rotLevel);
      map.addCorpse(corpse);
      (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
        player,
        corpse,
      );
      return foods().pop()!.bestBefore!.turnCounter;
    };

    const day = WorldTime.TURNS_PER_DAY;
    // The divisor is rot + 1, because the C# does ++rotLevel to dodge a division
    // by zero and its rot levels start at 0.
    expect(shelfLife(0)).toBe(day);
    expect(shelfLife(1)).toBe(day / 2);
    expect(shelfLife(3)).toBe(day / 4);
    expect(shelfLife(5)).toBe(day / 6);
  });

  it("never divides by zero, even on a brand-new corpse", () => {
    // The C# does `++rotLevel` for exactly this reason, and its rot levels start
    // at 0. A division by zero here would be an `Infinity` bestBefore, which is
    // worse than no meat at all.
    const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "v");
    dead.location = new Location(map, player.location.position);
    const corpse = new Corpse(dead, 100, 100, 0, 0, 1);
    map.addCorpse(corpse);
    (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
      player,
      corpse,
    );
    const best = foods()[0].bestBefore!.turnCounter;
    expect(Number.isFinite(best), "a finite best-before").toBe(true);
  });
});

describe("Feature.Butchering: animals", () => {
  it("gives no sanity hit for an animal -- a dead rabbit was food anyway", () => {
    // The whole point of `isLivingAnimal` being a *flag* on the abilities rather
    // than a list of ids somewhere: the sanity rule, the meat switch and the AI
    // all need to ask the same question, and only the flag answers it.
    //
    // And it is deliberately *not* behind the feature flag. An actor that is not
    // an animal gets exactly vanilla's sanity hit, so leaving the check ungated
    // is what keeps Classic byte-identical here.
    const spyOn = (animal: boolean): boolean => {
      asAnimal(ActorID.MALE_CIVILIAN, animal ? "rabbit" : "a person");
      if (!animal) Models.actors.get(ActorID.MALE_CIVILIAN).abilities.isLivingAnimal = false;
      const corpse = kill();
      let called = false;
      const g = game as unknown as {
        SeeingCauseInsanity(a: Actor, l: unknown, n: number, w: string): void;
        DoButcherCorpse(a: Actor, c: Corpse): void;
      };
      g.SeeingCauseInsanity = () => {
        called = true;
      };
      g.DoButcherCorpse(player, corpse);
      return called;
    };

    expect(spyOn(true), "an animal is not a horror to carve up").toBe(false);
    expect(spyOn(false), "a person is, and always was").toBe(true);
  });

  it("maps rabbit, chicken and feral dog to their own raw and cooked meat", () => {
    const meatFor = (name: string, cause: string): ItemID | undefined => {
      asAnimal(ActorID.MALE_CIVILIAN, name);
      const corpse = kill(ActorID.MALE_CIVILIAN, cause);
      (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
        player,
        corpse,
      );
      return foods().pop()?.model.id;
    };
    expect(meatFor("rabbit", "zombie bite")).toBe(ItemID.FOOD_RAW_RABBIT);
    expect(meatFor("rabbit", "fire")).toBe(ItemID.FOOD_COOKED_RABBIT);
    expect(meatFor("chicken", "zombie bite")).toBe(ItemID.FOOD_RAW_CHICKEN);
    expect(meatFor("feral dog", "fire")).toBe(ItemID.FOOD_COOKED_DOG_MEAT);
  });

  it("gives an animal two pieces, the ResourcesAvailability default", () => {
    asAnimal(ActorID.MALE_CIVILIAN, "rabbit");
    const corpse = kill();
    (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
      player,
      corpse,
    );
    expect(foods()[0].quantity).toBe(2);
  });

  it("gives NO meat for an unrecognised animal, where the C# throws", () => {
    // The C#'s switch has three cases and a `default` that throws
    // `ArgumentException`. Not ported: the port has no `RABBIT` or `CHICKEN`
    // model -- they need an `UnintelligentAnimalAI` the port has no controller for
    // -- so a live animal that did exist would crash the butcher. A missing model
    // must not be able to take the game down.
    asAnimal(ActorID.MALE_CIVILIAN, "unrecognised animal");
    const corpse = kill();
    expect(() =>
      (game as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(
        player,
        corpse,
      ),
    ).not.toThrow();
    expect(foods(), "and no meat at all").toHaveLength(0);
  });
});

describe("Feature.Butchering: the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.Butchering)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.Butchering)).toBe(false);
  });
});
