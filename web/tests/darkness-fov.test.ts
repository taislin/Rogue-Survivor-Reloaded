/**
 * `Feature.DarknessFov` — part 2a, true darkness.
 *
 * Still Alive, Release 6-2 and 7-5.
 *
 * The feature is a *number* change, and number changes are the ones this branch
 * is most likely to get wrong silently: nothing throws, the game just gets
 * darker or lighter, and no test fails unless a test pins the number. So most of
 * what follows pins numbers.
 *
 * The framing to keep in mind: the C# has **two** floor constants where the port
 * had one, and the pair is the whole feature. The player is meant to be blind in
 * a basement (floor 0). NPCs are not (floor 1), because — in the C#'s words —
 * "NPC AI goes haywire if they can't see at all". So an asymmetry that looks like
 * a typo is load-bearing, and the tests below assert both halves separately.
 *
 * Part 2b — the whole-map "other lit tiles" scan — is **not** here. See the
 * bottom of this file.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Lighting, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Faction } from "@data/Faction";
import { Point } from "@engine/Point";
import { LOS } from "@engine/LOS";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { Weather } from "@data/Weather";
import { DayPhase } from "@engine/WorldTime";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Campfire } from "@engine/mapobjects/MapObjects";
import { NullRogueUI } from "@ui/NullRogueUI";
import { DiceRoller } from "@engine/DiceRoller";
import { PlayerController } from "@data/PlayerController";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemID } from "@gameplay/GameItems";
import { coordKey } from "@engine/CoordKey";
import { DollPart } from "@data/Doll";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let rules: Rules;

beforeEach(() => {
  new GameActors();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  rules = new Rules(new DiceRoller(1));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  tileX = 20;
});

let tileX = 20;

/**
 * A living actor standing in the given lighting.
 *
 * Each call takes a fresh column. Several tests compare two actors' FOV in one
 * `it`, and `placeMapObject` at a fixed (20, 20) then throws "another actor
 * already at position" -- which is a loud failure, but it fails the *setup* and
 * says nothing about the behaviour under test.
 */
function place(lighting: Lighting, isPlayer = false, id: ActorID = ActorID.MALE_CIVILIAN): Actor {
  map.lighting = lighting;
  const a = new Actor(Models.actors.get(id), survivors, isPlayer ? "you" : "someone");
  map.placeActor(a, new Point(tileX++, 20));
  if (isPlayer) {
    // `Actor.isPlayer` is a getter over the controller, not a settable field, so
    // "make this the player" means giving it a `PlayerController`.
    a.controller = new PlayerController();
    game.m_Player = a;
  }
  return a;
}

/** A `WorldTime` somewhere in daylight, for the OUTSIDE-lighting cases. */
const noon = (): WorldTime => {
  const t = new WorldTime(0);
  for (let i = 0; i < 200 && t.isNight; i++) t.turnCounter++;
  return t;
};

/** A `WorldTime` at `DayPhase.DEEP_NIGHT`, the steepest penalty. */
const deepNight = (): WorldTime => {
  const t = new WorldTime(0);
  for (let i = 0; i < 2000 && t.phase !== DayPhase.DEEP_NIGHT; i++) t.turnCounter++;
  if (t.phase !== DayPhase.DEEP_NIGHT) throw new Error("never reached DEEP_NIGHT");
  return t;
};

describe("Feature.DarknessFov: the two floors", () => {
  it("is blind for the player in the dark", () => {
    // The headline. Vanilla's floor of 2 means a basement is dim, never dark.
    const player = place(Lighting.DARKNESS, true);
    expect(rules.actorFOV(player, noon(), Weather.CLEAR)).toBe(0);
  });

  it("gives an NPC a floor of 1, because a blind NPC hangs the sim", () => {
    const npc = place(Lighting.DARKNESS, false);
    expect(rules.actorFOV(npc, noon(), Weather.CLEAR)).toBe(1);
  });

  it("keeps vanilla's floor of 2 under CLASSIC, for both", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    expect(rules.actorFOV(place(Lighting.DARKNESS, true), noon(), Weather.CLEAR)).toBe(2);
    expect(rules.actorFOV(place(Lighting.DARKNESS, false), noon(), Weather.CLEAR)).toBe(2);
  });

  it("gives an undead its base view range even in the dark", () => {
    // Undeads see in the dark in both rulesets -- the `isUndead` branch comes
    // before the floor split and is not part of this feature.
    Session.get().ruleset = Ruleset.CLASSIC;
    const zombie = place(Lighting.DARKNESS, false, ActorID.UNDEAD_MALE_ZOMBIFIED);
    expect(rules.actorFOV(zombie, noon(), Weather.CLEAR)).toBe(zombie.sheet.baseViewRange);
  });

  it("uses the floor split in darknessFov itself, not only in actorFOV", () => {
    const player = place(Lighting.DARKNESS, true);
    const npc = place(Lighting.DARKNESS, false);
    expect(rules.darknessFov(player)).toBe(0);
    expect(rules.darknessFov(npc)).toBe(1);
  });
});

describe("Feature.DarknessFov: the night rebalance", () => {
  it("steepens every night penalty, and keeps vanilla's under CLASSIC", () => {
    // The penalties and the floor are one rebalance. A gentle penalty plus a
    // floor of 0 gives back what the floor took, so the two are asserted
    // together rather than one at a time.
    const deep = deepNight();

    const player = place(Lighting.OUTSIDE, true);
    const stillAlive = rules.nightFovPenalty(player, deep);
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = rules.nightFovPenalty(player, deep);

    expect(stillAlive, "Still Alive deep night").toBe(7);
    expect(classic, "classic deep night").toBe(4);
  });

  it("never blinds a player who is outdoors at midnight, by the C#'s own floor", () => {
    // The C# calls this "a lazy workaround" and it is not redundant, but it is
    // also *nearly* dead, and the arithmetic is worth having written down.
    //
    // Base view range is 8 and the steepest night penalty is 7, so an outdoor
    // player is already at 1 and the floor changes nothing. It only bites when
    // something else takes the view range below 1 first: heavy rain costs 2 more
    // and exhaustion costs 2 more, which is 8 - 7 - 2 - 2 = -3.
    //
    // The first assertion is the one that looks load-bearing and is not; the
    // second is the one that is.
    const deep = deepNight();
    const ordinary = place(Lighting.OUTSIDE, true);
    expect(rules.actorFOV(ordinary, deep, Weather.CLEAR)).toBe(1);

    const spent = place(Lighting.OUTSIDE, true);
    spent.sleepPoints = 0; // `isActorExhausted` is `sleepPoints <= 0`
    expect(rules.actorFOV(spent, deep, Weather.HEAVY_RAIN), "exhausted in heavy rain").toBe(1);
  });

  it("leaves the weather penalties alone", () => {
    // Rain/heavy-rain are 1/2 in both rulesets; the rebalance only touched the
    // day-phase ones.
    expect(Rules.FOV_PENALTY_RAIN).toBe(1);
    expect(Rules.FOV_PENALTY_HEAVY_RAIN).toBe(2);
  });
});

describe("Feature.DarknessFov: the two conditional bonuses", () => {
  it("gives a torch more reach indoors, and nothing outdoors", () => {
    // A torch is the only reason a basement is navigable, so this is what stops
    // "true darkness" from being a dead end.
    const lit = (inside: boolean): number => {
      const a = place(Lighting.DARKNESS, true);
      map.getTileAt(20, 20)!.isInside = inside;
      // Equipped, not merely carried: `getLightBonusEquipped` reads the LEFT_HAND
      // slot, and it also insists on batteries > 0. Both are easy to miss, and
      // both fail silently by contributing a bonus of zero.
      const torch = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
      a.inventory!.addAll(torch);
      // `getEquippedItem` just looks for `equippedPart` on the carried items, so
      // marking the part is what "equipped" means here.
      torch.equippedPart = DollPart.LEFT_HAND;
      return rules.actorFOV(a, noon(), Weather.CLEAR);
    };
    expect(lit(true), "torch indoors").toBeGreaterThan(lit(false));
  });

  it("suppresses the stand-on bonus when the actor is already blind", () => {
    // Release 6-2's `FOV > 0` check. Without it, standing on a car in a pitch
    // dark basement would hand back the very FOV the floor just removed.
    const a = place(Lighting.DARKNESS, true);
    expect(rules.actorFOV(a, noon(), Weather.CLEAR)).toBe(0);

    map.placeMapObject(
      Object.assign(new Campfire("campfire", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 0), {
        standOnFovBonus: true,
        fireState: MapObjectFire.UNINFLAMMABLE,
      }),
      a.location.position,
    );
    expect(rules.actorFOV(a, noon(), Weather.CLEAR), "still blind on a car").toBe(0);
  });

  it("keeps the stand-on bonus working for vanilla and for a sighted actor", () => {
    const bonusOn = (ruleset: Ruleset, lighting: Lighting): number => {
      Session.get().ruleset = ruleset;
      const a = place(lighting, false);
      // On the actor's own tile, which is *not* (20, 20) on the second call --
      // `place` advances a column counter, and a hard-coded tile would quietly
      // put the object somewhere the actor is not standing.
      map.placeMapObject(
        Object.assign(new Campfire("x", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 0), {
          standOnFovBonus: true,
        }),
        a.location.position,
      );
      return rules.actorFOV(a, noon(), Weather.CLEAR);
    };
    const dark = (ruleset: Ruleset): number => bonusOn(ruleset, Lighting.DARKNESS);
    // An NPC's floor of 1 is above 0, so the bonus applies under both rulesets.
    // STILL_ALIVE: floor 1, + 2 = 3.  CLASSIC: floor 2, + 1 = 3. They agree by
    // coincidence -- the floor is two lower and the bonus one higher -- which is
    // exactly the sort of thing worth writing down, because it makes the pair of
    // numbers look less deliberate than it is.
    expect(dark(Ruleset.STILL_ALIVE)).toBe(3);
    expect(dark(Ruleset.CLASSIC)).toBe(3);
  });
});

describe("Feature.DarknessFov: what a blind player can see", () => {
  /**
   * Compute the actor's FOV **and apply it to the map**.
   *
   * The second half is the one that is easy to miss: `computeFOVFor` only
   * returns a set, and `tile.isInView` is written by `setViewAndMarkVisited`.
   * Asserting on `isInView` without applying the set gives false for every tile
   * including the actor's own, which is how a test can pass a "sees nothing"
   * assertion for entirely the wrong reason.
   */
  const fov = (a: Actor): Set<number> => {
    const set = LOS.computeFOVFor(rules, a, noon(), Weather.CLEAR);
    map.setViewAndMarkVisited(LOS.fovPoints(set));
    return set;
  };

  it("sees nothing but their own tile at FOV 0", () => {
    const a = place(Lighting.DARKNESS, true);
    fov(a);
    expect(map.getTileAt(20, 20)!.isInView, "own tile").toBe(true);
    expect(map.getTileAt(21, 20)!.isInView, "one tile east").toBe(false);
  });

  it("sees the four cardinals, and the four corners, at FOV 1", () => {
    // This is what the `isAdjacent` shortcut is for. `losDistance` is a circle,
    // so the diagonals at Chebyshev distance 1 fall outside it -- without the
    // shortcut the player gets a cross with four blind corners.
    const a = place(Lighting.DARKNESS, false); // NPC, floor 1
    fov(a);
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      expect(map.getTileAt(20 + d[0], 20 + d[1])!.isInView, `neighbour ${d}`).toBe(true);
    }
  });

  it("keeps the diagonals inside the circle at FOV >= 2, so CLASSIC is unchanged", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const a = place(Lighting.DARKNESS, false);
    fov(a);
    expect(map.getTileAt(21, 21)!.isInView, "diagonal").toBe(true);
  });

  it("needs no shortcut of its own under CLASSIC, and that is worth knowing", () => {
    // The gate on the `isAdjacent` shortcut cannot be mutation-tested, and the
    // reason is structural rather than an oversight:
    //
    // With vanilla's floor of 2, `maxRange` is never below 2, and the loop bounds
    // (`from.x +/- maxRange`) already include every neighbour. The diagonals pass
    // the circular `losDistance` test at that range, so the shortcut and the
    // plain path agree exactly.
    //
    // The same reasoning makes the shortcut's own `maxRange > 0` clause
    // unreachable: at `maxRange` 0 the bounds collapse to the actor's own tile,
    // so a neighbour is never offered to the shortcut in the first place. Both
    // clauses are kept because the C# has them, and the C# has the same bounds --
    // but neither is load-bearing here, and pretending otherwise by writing a
    // test that "catches" their removal would be testing the bounds twice.
    const fovOf = (ruleset: Ruleset): number => {
      Session.get().ruleset = ruleset;
      const a = place(Lighting.DARKNESS, false);
      return LOS.computeFOVFor(rules, a, noon(), Weather.CLEAR).size;
    };
    expect(fovOf(Ruleset.CLASSIC), "classic sees a 5x5-ish patch").toBeGreaterThan(8);
  });
});

describe("Feature.DarknessFov: the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.DarknessFov)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.DarknessFov)).toBe(false);
  });
});

describe("Feature.DarknessFov: part 2b is not here yet", () => {
  it("documents the half that is deliberately missing", () => {
    // Not a test of behaviour -- a test of a known gap, so the gap shows up in
    // the suite rather than only in the plan.
    //
    // 2a (here) is the arithmetic: two floor constants, the night rebalance, the
    // two conditional bonuses, and the LOS adjacency shortcut. It is what makes a
    // basement dark.
    //
    // 2b is the Release 7-5 "other lit tiles" scan -- a whole-map pass in
    // `computeFOVFor` that adds to the visible set the tiles lit by a burning
    // barrel, a tile fire, an actor's torch, a lit candle, or a dropped light.
    // That is ~180 lines and is **not** implemented, so a barrel burning two
    // tiles away in the dark lights nothing. It is separate because it needs no
    // new data types -- it only ever adds keys to the same `Set<number>` the port
    // already has -- but it is a per-FOV-recompute W x H x trace loop, and two
    // of its branches are blocked on `Feature.TileFires` (`isAnyTileFireThere`)
    // and on a `GameTiles.isWallModel` predicate that does not exist yet.
    //
    // A player in the dark therefore currently sees exactly one tile, which is
    // the 2a behaviour and not the fork's. The assertion below pins that, so the
    // moment 2b lands and starts lighting tiles at a distance, it fails.
    place(Lighting.DARKNESS, true);
    map.placeMapObject(
      new Campfire("lit barrel", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 100),
      new Point(25, 20),
    );
    const lit = place(Lighting.DARKNESS, true);
    const set = LOS.computeFOVFor(rules, lit, noon(), Weather.CLEAR);
    expect(set.has(coordKey(25, 20)), "2b is not implemented: no distant light yet").toBe(false);
  });
});


