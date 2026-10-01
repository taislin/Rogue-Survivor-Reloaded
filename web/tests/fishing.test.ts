/**
 * `Feature.Fishing` — a rod, a wait, and a body of water.
 *
 * Still Alive, Release 7-6.
 *
 * The feature is a handful of C# lines and one arithmetic expression, and the
 * arithmetic is the interesting part:
 *
 * - **The C# infers fishing centrally, not from the keypress.** `DoWait` takes an
 *   `isFishing` argument and then *overrides* it for a player holding a rod, because
 *   a cast is not a mode you enter — it is a wait with a rod in your off hand. Both
 *   the single wait and the long wait therefore agree, which is the whole reason
 *   the inference is in `DoWait` and not at the two call sites.
 * - **The base chance is 2%**, and the C# says in a comment that it cannot be less.
 *   Doubled on `Resources.HIGH`, integer-halved on LOW — so 4 / 2 / 1, not 4 / 2 /
 *   1.0. A cast is a wait measured in minutes.
 * - **`Unsuspicious` adds a point per level.** A fisherman loitering by a pond for
 *   twenty turns is the fork's funniest new use for the skill that is about looking
 *   trustworthy.
 *
 * Two things the feature needs are *not* here, and the tests below say so rather
 * than pretending: the NPC arm (`CivilianAI.cs:754` with `BaseAI.cs:6625`) is not
 * ported, and neither is `isOneHanded`, which the C#'s "drop the two-hander" line
 * reads. Both are recorded on `DoUseFishingRodItem` and in BROWSER_PORT_PLAN.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Activity } from "@data/Activity";
import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Item } from "@data/Item";
import type { Message } from "@data/Message";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Direction } from "@engine/Direction";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Options, Resources } from "@engine/GameOptions";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { CLASS_SPECS } from "@engine/serialization/specs";
import {
  GraphReader,
  GraphWriter,
  type GraphData,
  type RefMark,
} from "@engine/serialization/SessionGraph";
import { WorldTime } from "@engine/WorldTime";
import { ItemFood, ItemFoodModel } from "@engine/items/ItemFood";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { SkillID } from "@gameplay/Skills";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

const HERE = new Point(20, 20);

let game: RogueGame;
let map: GameMap;
let rules: Rules;
let player: Actor;

/**
 * A whole new game on `seed`.
 *
 * The seed goes through `Session.useSeed` *before* the `RogueGame` is built,
 * because the constructor makes `Rules` out of `Session.get().seed` — a seed
 * applied afterwards would reseed nothing and quietly leave every roll in this file
 * on the same unrepeatable one.
 */
const newGame = (seed: number): void => {
  new GameActors();
  new GameItems();
  new GameTiles();
  Session.useSeed(seed);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  rules = game.m_Rules;
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, HERE);
  game.m_Player = player;
  // `AddMessageIfAudibleForPlayer` redraws, and `RedrawPlayScreen` reads
  // `m_MapViewRect` and `Session.currentMap`, neither of which exists before
  // `StartNewGame`. The fishing catch is the one message in this feature that
  // takes that path — deliberately, since the C# uses it so a bite interrupts a
  // long wait — so the draw is stubbed rather than the message skipped.
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  Options.resourcesAvailability = Resources.MED;
};

/** Lay a body of water on the tile at `dx,dy` relative to the player. */
const putWater = (dx: number, dy: number): void => {
  map.setTileModelAt(HERE.x + dx, HERE.y + dy, Models.tiles.get(TileID.FLOOR_POND_CENTER));
};

/** A rod in the player's hands, at the left hand the C# uses for it. */
const giveRod = (): Item => {
  const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
  player.inventory!.addAll(rod);
  rod.equippedPart = DollPart.LEFT_HAND;
  return rod;
};

const messages = (): string => {
  const mgr = (game as unknown as { m_MessageManager: { history: readonly Message[] } })
    .m_MessageManager;
  return mgr.history.map((m) => m.text).join("\n");
};

const foods = (): ItemFood[] =>
  player.inventory!.items.filter((i): i is ItemFood => i instanceof ItemFood);

/** Wait once and report the fish, if the roll landed one. */
const waitAndCatch = (): ItemFood | null => {
  game.DoWait(player);
  return foods().pop() ?? null;
};

/**
 * Beside water, rod in hand, on a game built for `seed`, then wait once.
 *
 * A whole new game per seed rather than a reseeded roller, because varying the
 * roller inside one game is not separable from everything else the constructor
 * rolled, and "the catch rate is a property of the seed" is not what is under test.
 */
const castOnce = (): ItemFood | null => {
  putWater(1, 0);
  giveRod();
  game.DoWait(player);
  return foods().pop() ?? null;
};

/**
 * The first seed in `1..max` that lands a fish, as `[seed, fish]`.
 *
 * The base chance is 2%, so a single wait is very nearly always a miss and a test
 * that asserted a catch on one seed would be a test that flakes. This searches
 * rather than hardcoding a seed, because a hardcoded one is a seed that silently
 * stops catching the moment anything above it changes the number of rolls — and
 * then the test fails for a reason that has nothing to do with the feature.
 *
 * `setup` runs after each new game, so a test can put the map, the clock or the
 * options into a state that has to survive the reseed.
 */
const firstCatchOn = (setup: () => void, max = 60): [number, ItemFood] => {
  for (let seed = 1; seed <= max; seed++) {
    newGame(seed);
    setup();
    const fish = castOnce();
    if (fish !== null) return [seed, fish];
  }
  throw new Error(`no seed in 1..${max} landed a fish`);
};

/** The default setup: a pond beside the player and a rod in the off hand. */
const firstCatch = (max = 60): [number, ItemFood] => firstCatchOn(() => {}, max);

/** The real writer, over the real class specs, for one map. */
const writeBack = (m: GameMap): GraphData => {
  const writer = new GraphWriter(CLASS_SPECS);
  return writer.finish({ currentMap: writer.ref(m) });
};

/** The real reader, over the root `writeBack` produced. */
const readBack = (data: GraphData): GameMap => {
  const reader = new GraphReader(data, CLASS_SPECS);
  return reader.resolve((data.root as Record<string, unknown>).currentMap as RefMark) as GameMap;
};

beforeEach(() => {
  newGame(1);
});

describe("Feature.Fishing: the rod", () => {
  it("appends FISHING_ROD above the old enum, and moves nothing else", () => {
    // Append-only: a save names an item by this number, and the C#'s
    // `GameItems.cs:156` puts `FISHING_ROD` mid-enum, well below the fork's later
    // additions. Inserting there would renumber `MATCHES`, `CHAR_LAPTOP` and
    // everything after it, so every save written before this commit would resolve
    // to a *different item* rather than to a renamed one.
    expect(ItemID.FISHING_ROD).toBe(170);
    expect(ItemID.SIPHON_KIT, "the id before it is unmoved").toBe(169);
    // A relationship, not the total. `_COUNT` is the one number here that
    // legitimately grows, and it has grown three times since this assertion was
    // written -- `Feature.Church` appended `UNIQUE_BOOK_OF_ARMAMENTS` and
    // `Feature.ShelterBackpacks` appended five backpacks. Pinning the total would
    // mean every later feature's test has to edit *this* file to say nothing about
    // fishing, and the number that actually matters is the one above: the rod is
    // still at 170 and the id under it is still 169. "The enum is big enough for
    // it", the same shape `tests/siphon-fuel.test.ts:98` uses.
    expect(ItemID._COUNT).toBeGreaterThan(ItemID.FISHING_ROD);
  });

  it("is held in the LEFT hand, which is not where a weapon goes", () => {
    // Load-bearing rather than cosmetic: `DoWait` re-derives "is fishing" from the
    // left hand, the move handler unequips from the left hand, and the port's
    // `getEquippedMeleeWeapon()` reads the *right* one — so a rod in the right hand
    // would be a rod nobody could cast with.
    const model = Models.items.get(ItemID.FISHING_ROD);
    expect(model.equipmentPart).toBe(DollPart.LEFT_HAND);
    expect(model.isEquipable, "which is what makes it equippable at all").toBe(true);
  });

  it("does not auto-equip, and is not stackable", () => {
    const model = Models.items.get(ItemID.FISHING_ROD);
    expect(model.dontAutoEquip).toBe(true);
    expect(model.isStackable).toBe(false);
    expect(model.imageId).toBe(GameImages.ITEM_FISHING_ROD);
    expect(model.flavorDescription).toBe("Stand next to a pond then equip it to catch fish.");
  });
});

describe("Feature.Fishing: the equip gate", () => {
  it("refuses a rod in the middle of a field", () => {
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    const res = rules.canActorEquipFishingRod(player, rod);
    expect(res.ok).toBe(false);
    // The C#'s own string (`Rules.cs:1131`), because "Cannot equip the fishing rod
    // : not next to a body of water." *is* the feedback loop.
    expect(res.reason).toBe("not next to a body of water");
  });

  it("allows a rod beside water, in all eight directions", () => {
    // `Direction.COMPASS`, diagonals included — the C# loops over the eight.
    expect(Direction.COMPASS).toHaveLength(8);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]]) {
      newGame(1);
      putWater(dx, dy);
      const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
      player.inventory!.addAll(rod);
      const res = rules.canActorEquipFishingRod(player, rod);
      expect(res.ok, `neighbour ${dx},${dy}: ${res.reason}`).toBe(true);
    }
  });

  it("refuses water that is two tiles away", () => {
    putWater(2, 0);
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    expect(rules.canActorEquipFishingRod(player, rod).ok).toBe(false);
  });

  it("refuses a non-rod with the C#'s *other* reason", () => {
    // Two reasons, in the C#'s order. The second is unreachable from the two equip
    // paths, which only ever ask about a rod, and is asserted because the rule
    // states it — and because a rule that answers a question it was not asked is a
    // rule nobody can rely on.
    putWater(1, 0);
    const bat = new Item(Models.items.get(ItemID.MELEE_BASEBALLBAT));
    player.inventory!.addAll(bat);
    const res = rules.canActorEquipFishingRod(player, bat);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not a fishing rod");
  });

  it("is reached by the player's equip path, with the C#'s message", () => {
    // The C# special-cases the rod at `OnLMBItem` (`RogueGame.cs:11395`) and again
    // at `DoPlayerItemSlotUse` (`RogueGame.cs:11996`). The port folds both into
    // `canActorEquipItem`, so the *paths* are asserted here rather than the two
    // duplicated rules.
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    game.OnLMBItem(player.inventory!, rod);
    expect(messages()).toContain("Cannot equip the fishing rod");
    expect(messages()).toContain("not next to a body of water");

    putWater(1, 0);
    game.OnLMBItem(player.inventory!, rod);
    expect(rod.equippedPart, "and beside water it goes on").toBe(DollPart.LEFT_HAND);
  });

  it("is reached by the ctrl-slot equip path too", () => {
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    const slot = player.inventory!.items.indexOf(rod);
    expect(game.DoPlayerItemSlotUse(player, slot)).toBe(false);
    expect(rod.equippedPart, "not equipped away from water").toBe(DollPart.NONE);

    putWater(1, 0);
    expect(game.DoPlayerItemSlotUse(player, slot)).toBe(false);
    expect(rod.equippedPart, "equipped beside it").toBe(DollPart.LEFT_HAND);
  });
});

describe("Feature.Fishing: the catch chance", () => {
  /** A fresh angler with `levels` of Unsuspicious, beside the rules. */
  const angler = (levels: number): Actor => {
    const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "fisher");
    for (let i = 0; i < levels; i++) a.sheet.skillTable!.addOrIncreaseSkill(SkillID.UNSUSPICIOUS);
    return a;
  };

  const chanceAt = (availability: Resources, levels = 0): number =>
    rules.catchingFishChance(availability, angler(levels));

  it("is 2% by default, and the C# says it cannot be less", () => {
    expect(Rules.CATCHING_FISH_BASE_CHANCE).toBe(2);
    expect(chanceAt(Resources.MED)).toBe(2);
  });

  it("doubles on HIGH and *integer-halves* on LOW — 4, 2, 1", () => {
    // 4 / 2 / 1, and the 1 is the point: the C# writes
    // `(int)(CATCHING_FISH_BASE_CHANCE * 0.5)`, so a poor world still fishes, just
    // half as well. Rounding instead of truncating would give the same answer *here*
    // and would only differ at a base of 3 or 5, which is why the base is asserted
    // separately rather than left implied by this one.
    expect(chanceAt(Resources.HIGH)).toBe(4);
    expect(chanceAt(Resources.LOW)).toBe(1);
  });

  it("adds a point of chance per level of Unsuspicious", () => {
    // C# `Rules.cs:396` (`SKILL_UNSUSPICIOUS_FISHING_BONUS = 1`), applied in
    // `ActorFishingChanceFromUnsuspiciousSkill` (`Rules.cs:5255`).
    expect(Rules.SKILL_UNSUSPICIOUS_FISHING_BONUS).toBe(1);
    for (const levels of [0, 1, 3, 5]) {
      expect(rules.actorFishingChanceFromUnsuspiciousSkill(angler(levels))).toBe(levels);
    }
  });

  it("adds the bonus to the *scaled* base, not before the scaling", () => {
    // The C# computes the resources arm first and then the `Math.Max(chance,
    // chance + bonus)`, so level 3 gives 1+3 on LOW and 4+3 on HIGH — not 2x3+3 and
    // not a bonus computed off the unscaled 2.
    expect(chanceAt(Resources.LOW, 3)).toBe(4);
    expect(chanceAt(Resources.MED, 3)).toBe(5);
    expect(chanceAt(Resources.HIGH, 3)).toBe(7);
  });

  it("catches more often the richer the world is, over many seeds", () => {
    // The end-to-end version of the arithmetic, and the reason the arithmetic is
    // asserted on its own: at 1-4% a single wait says nothing, so 200 fresh games
    // per setting and an ordering rather than an exact count.
    const rate = (availability: Resources): number => {
      let caught = 0;
      for (let seed = 1; seed <= 200; seed++) {
        newGame(seed);
        Options.resourcesAvailability = availability;
        putWater(1, 0);
        giveRod();
        if (waitAndCatch() !== null) caught++;
      }
      return caught;
    };
    const low = rate(Resources.LOW);
    const med = rate(Resources.MED);
    const high = rate(Resources.HIGH);
    // The counts are in the message so a failure says how far off it was.
    expect(low, `LOW ${low} / MED ${med} / HIGH ${high} of 200`).toBeLessThan(med);
    expect(med, `LOW ${low} / MED ${med} / HIGH ${high} of 200`).toBeLessThan(high);
    expect(high, `LOW ${low} / MED ${med} / HIGH ${high} of 200`).toBeGreaterThan(0);
  });
});

describe("Feature.Fishing: waiting with a rod", () => {
  it("says the wait is a cast, not a breath", () => {
    // The C# puts the fishing branch *before* the stamina branch
    // (`RogueGame.cs:23068`), so a tired fisherman is told neither that they caught
    // their breath nor that they are merely waiting — only the one line.
    putWater(1, 0);
    giveRod();
    player.staminaPoints = 1;
    game.DoWait(player);
    expect(messages()).toContain("waiting for a fish to bite");
    expect(messages()).not.toContain("breath");
  });

  it("gives raw fish, with the C#'s exact bestBefore", () => {
    // `map.LocalTime.TurnCounter + TURNS_PER_DAY * RAW_FISH.BestBeforeDays`
    // (`RogueGame.cs:23107`). The *map's* clock rather than the world's: a district
    // running in the background is on a different turn count, and a fish that keeps
    // for a day of the player's clock is a different promise from one that keeps for
    // a day of the map's.
    //
    // The two clocks are pushed apart first, deliberately. On a fresh map they are
    // both zero, so a port that read `Session.worldTime` instead would produce the
    // *same* number and the test would pass for the wrong reason — which is the
    // single most likely way this line gets transcribed wrong.
    newGame(1);
    const [seed, fish] = firstCatchOn(() => {
      map.localTime.turnCounter = 5 * WorldTime.TURNS_PER_DAY;
      Session.get().worldTime.turnCounter = 2 * WorldTime.TURNS_PER_DAY;
    });
    expect(seed).toBeGreaterThan(0);
    expect(fish.model.id).toBe(ItemID.FOOD_RAW_FISH);
    const days = (Models.items.get(ItemID.FOOD_RAW_FISH) as ItemFoodModel).bestBeforeDays;
    expect(fish.bestBefore!.turnCounter).toBe(
      map.localTime.turnCounter + WorldTime.TURNS_PER_DAY * days,
    );
    expect(fish.bestBefore!.turnCounter, "and not the world's clock").not.toBe(
      Session.get().worldTime.turnCounter + WorldTime.TURNS_PER_DAY * days,
    );
    // And it is perishable, which is what carrying the turn number at all means.
    expect(fish.isPerishable).toBe(true);
  });

  it("marks the fish forbidden to the AI", () => {
    // The C#'s `new ItemFood(RAW_FISH, bestBefore, true, true)` — the first trailing
    // flag is `isForbiddenToAI`. It is a property of *this catch* and not of the
    // row: a fish in a shop is the AI's to take, a hooked one is not.
    const [seed, fish] = firstCatch();
    expect(fish.isForbiddenToAI, `seed ${seed}`).toBe(true);
  });

  it("says it caught a fish", () => {
    // `firstCatch` leaves the successful game in the module-level `game`, so the
    // message list belongs to the same cast the fish did.
    firstCatch();
    expect(messages()).toContain("caught a fish!");
  });

  it("drops the fish on the ground when the inventory will not take it", () => {
    // `if (actor.Inventory.CanAddAtLeastOne(fish)) AddAll else DropItem`
    // (`RogueGame.cs:23111`). A survivor who has used up their pack is not left
    // with a fish in a closed fist.
    for (let seed = 1; seed <= 60; seed++) {
      newGame(seed);
      putWater(1, 0);
      giveRod();
      while (
        player.inventory!.addAsMuchAsPossible(
          new Item(Models.items.get(ItemID.MELEE_IMPROVISED_CLUB)),
        ).success
      ) {
        /* fill every slot there is */
      }
      expect(player.inventory!.isFull, "the pack is full before the cast").toBe(true);
      game.DoWait(player);
      const onGround = map.getItemsAt(HERE);
      if (onGround === null) continue;
      expect(
        onGround.items.map((i) => i.model.id),
        `seed ${seed}`,
      ).toContain(ItemID.FOOD_RAW_FISH);
      return;
    }
    throw new Error("no seed in 1..60 landed a fish with a full pack");
  });

  it("regenerates sanity, because catching something feels good", () => {
    // C# `RogueGame.cs:23115`. The C# passes `ActorSanRegenValue(actor,
    // SANITY_RECOVER_CHAT_OR_TRADE)`, which adds a Strong Psyche bonus; the port
    // has no such helper and its two other `SANITY_RECOVER_CHAT_OR_TRADE` sites
    // pass the constant too, so what is asserted is that a catch is worth
    // *something* rather than an exact number.
    for (let seed = 1; seed <= 60; seed++) {
      newGame(seed);
      putWater(1, 0);
      giveRod();
      player.sanity = 50;
      game.DoWait(player);
      if (player.sanity > 50) {
        expect(player.sanity).toBe(
          Math.min(rules.actorMaxSanity(player), 50 + Rules.SANITY_RECOVER_CHAT_OR_TRADE),
        );
        return;
      }
    }
    throw new Error("no seed in 1..60 landed a fish");
  });

  it("puts the rod away afterwards, and says nothing about it", () => {
    // C# `RogueGame.cs:23122` — `DoUnequipItem(actor, leftHandItem, false)`, whose
    // `false` is "no message". A cast is finished by the catch, so a rod is not a
    // state the game lets you walk around in.
    for (let seed = 1; seed <= 60; seed++) {
      newGame(seed);
      putWater(1, 0);
      const rod = giveRod();
      game.DoWait(player);
      if (rod.isEquipped) continue;
      expect(rod.equippedPart).toBe(DollPart.NONE);
      expect(messages(), "one line about the fish and nothing else").not.toContain("unequip");
      return;
    }
    throw new Error("no seed in 1..60 landed a fish");
  });

  it("does nothing when the wait is not a cast", () => {
    // Same map, same water, no rod: the vanilla wait, byte for byte.
    putWater(1, 0);
    game.DoWait(player);
    expect(foods()).toEqual([]);
    expect(messages()).not.toContain("fish");
  });
});

describe("Feature.Fishing: the rod cannot be carried away", () => {
  it("force-unequips on a move", async () => {
    // C# `DoMoveActor` (`RogueGame.cs:17278`): walking off the bank ends the cast.
    newGame(1);
    map.setTileModelAt(HERE.x, HERE.y, Models.tiles.get(TileID.FLOOR_ASPHALT));
    map.setTileModelAt(HERE.x, HERE.y + 1, Models.tiles.get(TileID.FLOOR_ASPHALT));
    const rod = giveRod();
    await game.DoMoveActor(player, Direction.S);
    expect(rod.equippedPart).toBe(DollPart.NONE);
  });

  it("force-unequips when the carrier is hit", async () => {
    // C# `InflictDamage` (`RogueGame.cs:23707`): a survivor who is stabbed
    // mid-cast drops the rod, which is also why the C# does it silently.
    newGame(1);
    putWater(1, 0);
    const rod = giveRod();
    await game.InflictDamage(player, 1);
    expect(rod.equippedPart).toBe(DollPart.NONE);
  });

  it("leaves another left-hand item alone", async () => {
    // The C# tests the *model*, not "anything in the left hand". A spray can is a
    // left-hand item too (`RogueGame.cs:10782`), and unequipping it because the
    // survivor got hit would be exactly the bug the model check prevents.
    newGame(1);
    const spray = new Item(Models.items.get(ItemID.PAINT_THINNER));
    player.inventory!.addAll(spray);
    spray.equippedPart = DollPart.LEFT_HAND;
    await game.InflictDamage(player, 1);
    expect(spray.equippedPart).toBe(DollPart.LEFT_HAND);
  });
});

describe("Feature.Fishing: the activity label", () => {
  it("appends FISHING at 9, so existing saves keep their activities", () => {
    // The C# does not serialise `Activity` at all, so the numbering is a per-run
    // label there. The port's graph writer *does* carry it, being an own field of
    // `Actor` — so append-only is the rule here too, and `FLEEING_FROM_EXPLOSIVE`
    // must keep its 8 or a load would come back fleeing from a non-explosive.
    expect(Activity.FISHING).toBe(9);
    expect(Activity.FLEEING_FROM_EXPLOSIVE, "the id before it is unmoved").toBe(8);
  });

  it("is described, and both activity switches know it", () => {
    // `DescribeActorActivity` and the map draw both `throw` on a value they do not
    // recognise, so an enum member nothing can currently set is still a landmine:
    // the first NPC arm to set it would take the panel down with it. The drawing
    // switch has no case to assert — the C# groups FISHING with the activities
    // that draw nothing (`RogueGame.cs:25965`) — so this is the reachable half.
    const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "angler");
    npc.activity = Activity.FISHING;
    expect(game.DescribeActorActivity(npc)).toBe("Fishing.");
  });
});

describe("Feature.Fishing: Map.hasFishing", () => {
  it("defaults to false, as the C#'s constructor does", () => {
    // C# `Data/Map.cs:273`, `this.HasFishing = false;`.
    expect(new GameMap(1, "fresh", 8, 8).hasFishing).toBe(false);
  });

  it("round-trips through the save graph, both ways", () => {
    // The C# serialises it in both directions (`Data/Map.cs:1696` reads,
    // `Data/Map.cs:1768` writes). The port's writer dumps every own field, so this
    // is a real round trip through the real codec rather than an assertion about a
    // field.
    map.hasFishing = true;
    expect(readBack(writeBack(map)).hasFishing).toBe(true);
    map.hasFishing = false;
    expect(readBack(writeBack(map)).hasFishing).toBe(false);
  });

  it("reads false from a save written before the flag existed", () => {
    // The compatibility half, and the reason `hasFishing` is a property over a
    // backing field rather than a plain one. The graph reader makes a map with
    // `Object.create(Map.prototype)`, so class field initialisers never run and a
    // save with no such key leaves nothing at all to read. A plain boolean field
    // would answer `undefined` here — falsy, so it would work by accident, right up
    // until somebody wrote `hasFishing === true`.
    const data = writeBack(map);
    const record = data.objs.find((r) => r.k === "Map")!;
    expect("_hasFishing" in record.f, "the flag is written at all").toBe(true);
    delete record.f._hasFishing;
    const restored = readBack(data);
    expect(restored.hasFishing, "a missing key reads as false, not undefined").toBe(false);
    expect(restored.hasFishing, "and is really a boolean").toBe(false);
  });
});

describe("Feature.Fishing: the gate", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.Fishing)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.Fishing)).toBe(false);
  });

  it("CLASSIC cannot equip a rod at all", () => {
    // Not "can equip it anywhere": the rule answers "not available in this
    // ruleset", which is the `canActorCookFoodItem` shape. A predicate a UI asks
    // needs a *false* to return, and there is no rod in a classic world to ask
    // about.
    Session.get().ruleset = Ruleset.CLASSIC;
    putWater(1, 0);
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    expect(rules.canActorEquipFishingRod(player, rod).ok).toBe(false);
    expect(rules.canActorEquipItem(player, rod).ok).toBe(false);
  });

  it("CLASSIC waiting with a rod is a plain wait", () => {
    // The negative half, and the one that matters. Under the flag the same wait, on
    // the same map, with the same item, says "waiting for a fish to bite"; without
    // it the wait says the vanilla thing and catches nothing on any seed.
    for (let seed = 1; seed <= 60; seed++) {
      newGame(seed);
      Session.get().ruleset = Ruleset.CLASSIC;
      putWater(1, 0);
      giveRod();
      expect(waitAndCatch(), `classic caught a fish on seed ${seed}`).toBeNull();
    }
    expect(messages()).not.toContain("fish");
  });

  it("CLASSIC does not unequip a rod when the carrier is hit", async () => {
    newGame(1);
    Session.get().ruleset = Ruleset.CLASSIC;
    putWater(1, 0);
    const rod = giveRod();
    await game.InflictDamage(player, 1);
    expect(rod.equippedPart, "untouched under classic").toBe(DollPart.LEFT_HAND);
  });

  it("CLASSIC does not describe a rod as something to fish with", () => {
    newGame(1);
    Session.get().ruleset = Ruleset.CLASSIC;
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    const lines = game.DescribeItemLong(rod, true, 0);
    expect(lines.join("\n")).not.toContain("to fish");
  });

  it("STILL_ALIVE does describe it, because that line is how a cast is learned", () => {
    newGame(1);
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    player.inventory!.addAll(rod);
    const lines = game.DescribeItemLong(rod, true, 0);
    expect(lines.join("\n")).toContain("to fish");
    // C# `RogueGame.cs:32099`: only in the *player's* inventory, because a line
    // about a key means nothing on somebody else's body.
    expect(game.DescribeItemLong(rod, false, 0).join("\n")).not.toContain("to fish");
  });
});

describe("Feature.Fishing: the rod survives the item sweep", () => {
  const stamp = (it: Item): void => {
    (game as unknown as { ApplyItemTurnTracker(i: Item): void }).ApplyItemTurnTracker(it);
  };

  it("is exempted from the despawn stamp, like the C#", () => {
    // C# `RogueGame.cs:21477`: `SLEEPING_BAG` and `FISHING_ROD` are "rare items
    // that aren't brought in with new refugee/survivor waves, so mustn't be
    // deleted". Ungated on purpose — see the comment at the exemption: nothing in
    // the port can produce a rod (the fork's own `MakeItemFishingRod` has no
    // callers), so the line cannot change a classic game. That is the same argument
    // that keeps the Butchering animal carve-out ungated.
    const rod = new Item(Models.items.get(ItemID.FISHING_ROD));
    stamp(rod);
    expect(rod.droppedOnTurnNumber, "never stamped").toBeNull();
  });

  it("and the sweep is not a no-op, so the exemption is doing something", () => {
    const club = new Item(Models.items.get(ItemID.MELEE_IMPROVISED_CLUB));
    stamp(club);
    expect(club.droppedOnTurnNumber, "not a rod").not.toBeNull();
  });
});

