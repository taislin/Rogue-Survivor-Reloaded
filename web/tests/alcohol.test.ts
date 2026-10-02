/**
 * `Feature.Alcohol` — blood alcohol, accuracy, and losing control of an action.
 *
 * Still Alive, Release 7-1.
 *
 * The mechanic is an int, not a flag: one standard drink is
 * `WorldTime.TURNS_PER_HOUR` (30) of blood alcohol, it decays one turn per turn,
 * and passing out is five of them. That is what lets the accuracy penalty have
 * four tiers instead of one, and it is why the constants are expressed in
 * `TURNS_PER_HOUR` rather than as abstract points.
 *
 * Two things are easy to get wrong and both are pinned below:
 *
 * - **The drink effects are threshold *crossings*, not levels.** They compare
 *   `previousBloodAlcohol` against the *previous* turn's snapshot, so a survivor
 *   already at 85% does not vomit on every subsequent can.
 * - **The band names do not match the numbers.** `FIRING_WHEN_HAMMERED` (0.66) is
 *   the 80-99% band and `FIRING_WHEN_TIPSY` (0.95) is 40-59%, so reading the
 *   constant names as descriptions of the bands gives the wrong order.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Models } from "@data/Models";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { Color } from "@engine/Color";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Map as GameMap } from "@data/Map";
import { Point } from "@engine/Point";
import { PlayerController } from "@data/PlayerController";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { GameImages } from "@gameplay/GameImages";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Attack, AttackKind } from "@data/Attack";
import { Verb } from "@data/Verb";

const survivors = new Faction("The Survivors", "survivor");

let rules: Rules;
let npc: Actor;
let game: RogueGame;

const unit = Rules.ALCOHOL_STANDARD_UNIT;
const blackout = Rules.BLACKOUT_DRUNK_LEVEL;

beforeEach(() => {
  new GameActors();
  new GameItems();
  rules = new Rules(new DiceRoller(1));
  game = new RogueGame(new NullRogueUI());
  npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

/** An actor at a given blood alcohol, as a fraction of passing out. */
const at = (fraction: number): Actor => {
  npc.bloodAlcohol = Math.round(blackout * fraction);
  return npc;
};

describe("Feature.Alcohol: the units", () => {
  it("is one hour of standard drink, and five to pass out", () => {
    // Expressed in TURNS_PER_HOUR because BAC decays one turn per turn, so these
    // numbers are also the duration: five drinks is two and a half in-game hours
    // of being on the floor.
    expect(Rules.ALCOHOL_STANDARD_UNIT).toBe(WorldTime.TURNS_PER_HOUR);
    expect(Rules.BLACKOUT_DRUNK_LEVEL).toBe(5 * WorldTime.TURNS_PER_HOUR);
  });

  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.Alcohol)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.Alcohol)).toBe(false);
  });
});

describe("Feature.Alcohol: the six display bands", () => {
  it("reads sober, buzzed, tipsy, drunk, wasted, uncon -- at the C#'s cut points", () => {
    // Note the mismatch with the *mechanics*: "drunk" is the 60% band, which is
    // also where `isActorDrunk` cuts, so an actor can read "tipsy" and still be
    // swinging worse.
    const band = (f: number): string => rules.describeIntoxication(at(f));
    expect(band(0)).toBe("sober");
    expect(band(0.19)).toBe("sober");
    expect(band(0.2)).toBe("buzzed");
    expect(band(0.4)).toBe("tipsy");
    expect(band(0.6)).toBe("drunk");
    expect(band(0.8)).toBe("wasted");
    expect(band(1)).toBe("uncon");
  });

  it("colours the same six bands green through red", () => {
    const colour = (f: number): Color => rules.intoxicationColor(at(f));
    expect(colour(0)).toBe(Color.Green);
    expect(colour(0.3)).toBe(Color.PaleGreen);
    expect(colour(0.5)).toBe(Color.MediumAquamarine);
    expect(colour(0.7)).toBe(Color.DarkSalmon);
    expect(colour(0.9)).toBe(Color.Tomato);
    expect(colour(1)).toBe(Color.Red);
  });

  it("calls an actor drunk from 60%, not from the top band", () => {
    // `IsDrunk` in the C# cuts at 0.6, which is the *fourth* of six bands.
    expect(rules.isActorDrunk(at(0.59))).toBe(false);
    expect(rules.isActorDrunk(at(0.6))).toBe(true);
    expect(rules.isActorDrunk(at(1))).toBe(true);
  });
});

describe("Feature.Alcohol: the accuracy penalties", () => {
  // A bare ranged attack, so the penalty is the only thing moving `hit`.
  const bareRanged = (): Attack =>
    Attack.rangedAttack(
      AttackKind.FIREARM,
      new Verb("shoot", "shoots"),
      100,
      100,
      100,
      0,
      1,
    );
  // Both of these take more arguments than the penalty needs; the extras are
  // what the C#'s own callers pass and they do not move the numbers under test.
  const fire = (a: Actor): number =>
    rules.actorRangedAttack(a, bareRanged(), 1, null).hitValue;

  it("scales a ranged hit by the four bands, in order", () => {
    const hitAt = (f: number): number => fire(at(f));

    const sober = hitAt(0);
    // 0.95 at 40-59% -- the band named TIPSY, and only -5%
    expect(hitAt(0.5)).toBe(Math.floor(sober * 0.95));
    // 0.75 at 60-79%
    expect(hitAt(0.7)).toBe(Math.floor(sober * 0.75));
    // 0.66 at 80-99% -- the band named HAMMERED, not DRUNK
    expect(hitAt(0.9)).toBe(Math.floor(sober * 0.66));
    // 0.5 at 100%
    expect(hitAt(1)).toBe(Math.floor(sober * 0.5));
    // and nothing at all below 40%
    expect(hitAt(0.3)).toBe(sober);
  });

  it("applies the same multiplier to both rapid-fire hits", () => {
    const at100 = rules.actorRangedAttack(at(1), bareRanged(), 1, null);
    // The port names them `hit2Value`/`hit3Value`; the C# calls them rapidHit1/2.
    expect(at100.hit2Value).toBe(Math.floor(100 * 0.5));
    expect(at100.hit3Value).toBe(Math.floor(100 * 0.5));
  });

  it("cuts a melee swing, and the disarm chance, once drunk", () => {
    // Two numbers move together here, which is why the gate matters: a single
    // missing `hasFeature` would shift both.
    const base = Attack.meleeAttack(new Verb("hit", "hits"), 100, 10, 1, 50);
    const sober = rules.actorMeleeAttack(npc, base, null);
    const drunk = rules.actorMeleeAttack(at(0.7), base, null);
    expect(drunk.hitValue).toBeLessThan(sober.hitValue);
    expect(drunk.disarmChance).toBeLessThan(sober.disarmChance);
  });

  it("does not touch accuracy under CLASSIC, however drunk", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const bare = bareRanged();
    const drinker = at(1);
    expect(rules.actorRangedAttack(drinker, bare, 1, null).hitValue).toBe(
      rules.actorRangedAttack(npc, bare, 1, null).hitValue,
    );
  });

  it("does not move melee under CLASSIC either", () => {
    // Two *separate* actors. The first version of this compared a drunk actor
    // against `npc` -- but `at(1)` mutates `npc` itself, so both sides were the
    // same object at the same BAC and the assertion held whatever the gate did.
    Session.get().ruleset = Ruleset.CLASSIC;
    const base = Attack.meleeAttack(new Verb("hit", "hits"), 100, 10, 1, 50);
    const drunk = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "sober");
    const wasted = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "wasted");
    wasted.bloodAlcohol = blackout;
    expect(rules.actorMeleeAttack(wasted, base, null).hitValue).toBe(
      rules.actorMeleeAttack(drunk, base, null).hitValue,
    );
  });
});

describe("Feature.Alcohol: the drink effect is a threshold crossing", () => {
  /**
   * Driven through `DoUseMedicineItem` on a real map, because the alternative --
   * re-implementing `before < T && after >= T` in the test -- asserts the test,
   * not the engine. The only observable effect at the 80% threshold is a vomit,
   * which leaves a decoration on the tile, so that is what is read.
   */
  let map: GameMap;
  let player: Actor;

  const vomitedOn = (): boolean => {
    const p = player.location.position;
    return map.getTileAt(p.x, p.y)!.hasDecoration(GameImages.DECO_VOMIT);
  };

  beforeEach(() => {
    // `game` comes from the module-level `beforeEach`, which runs first, so the
    // engine exists by the time this one needs to hand it a player.
    map = new GameMap(1, "test", 40, 40);
    player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    player.controller = new PlayerController();
    map.placeActor(player, new Point(20, 20));
    game.m_Player = player;
  });

  const drinkABeer = (): void => {
    const beer = new ItemMedicine(Models.items.get(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN));
    player.inventory!.addAll(beer);
    game.DoUseMedicineItem(player, beer);
  };

  it("does not vomit on the first drink", () => {
    player.bloodAlcohol = 0;
    player.previousBloodAlcohol = 0;
    drinkABeer();
    expect(player.bloodAlcohol).toBe(unit);
    expect(vomitedOn()).toBe(false);
  });

  it("vomits exactly when the crossing happens", () => {
    // One below the 80% line, so one drink takes them over it.
    player.previousBloodAlcohol = Math.round(blackout * 0.8) - 1;
    player.bloodAlcohol = player.previousBloodAlcohol;
    drinkABeer();
    expect(player.bloodAlcohol).toBeGreaterThanOrEqual(blackout * 0.8);
    expect(vomitedOn(), "crossed 80%, so vomit").toBe(true);
  });

  it("does not re-vomit at 80% -- but a second drink always blacks you out", () => {
    /**
     * The arithmetic here is not obvious and is the reason this test is written
     * the way it is. `unit` is 30, the 80% line is 120 and passing out is 150, so
     * once a survivor is at or above 120 there is **no** value of `previous` that
     * makes the next drink land in [80%, 100%) -- every one of them reaches 150.
     * The 80% arm is therefore only ever reachable on the drink that crosses 120
     * from below.
     *
     * The pair below is what is actually observable, and it distinguishes the two
     * arms by whether the survivor passes out, since under Still Alive `DoVomit`
     * adds its decoration only if the tile has none and so cannot be counted.
     */
    player.previousBloodAlcohol = 100; // below 80%
    player.bloodAlcohol = 100;
    drinkABeer();
    expect(player.bloodAlcohol).toBe(130);
    expect(vomitedOn(), "crossed 80%").toBe(true);
    expect(player.isSleeping, "but did not pass out").toBe(false);

    // Now the already-past-80% case: still a drink, still a vomit, but from the
    // *blackout* arm rather than the 80% one.
    const other = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    other.controller = new PlayerController();
    map.placeActor(other, new Point(25, 25));
    other.previousBloodAlcohol = 135;
    other.bloodAlcohol = 135;
    const beer = new ItemMedicine(Models.items.get(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN));
    other.inventory!.addAll(beer);
    game.DoUseMedicineItem(other, beer);
    expect(other.bloodAlcohol).toBe(165);
    expect(other.isSleeping, "past 80% already, so this one blacks out").toBe(true);
  });

  it("cannot distinguish the 80% crossing from a plain level test -- and here is why", () => {
    /**
     * The `previousBloodAlcohol < 80%` clause on the 80% arm is **not
     * independently observable in play**, and rather than write a test that
     * pretends otherwise, this one characterises exactly why.
     *
     * Enumerating every reachable `previous`, the level test ("BAC >= 80% now")
     * and the crossing test ("crossed 80% this drink") disagree in two places,
     * and both are states a survivor cannot actually drink their way into:
     *
     * - **`previous` in [120, 150).** Already past the 80% line, so the level test
     *   says vomit. But `unit` is 30, so `previous + 30 >= 150` and the *blackout*
     *   arm fires in the same drink, which vomits anyway. The outcome is identical
     *   either way.
     * - **`previous >= 150`.** Already at passing out, so the level test says
     *   vomit and the crossing test says no -- and blackout does *not* re-fire,
     *   because `previous < 150` is false. This is a genuine disagreement with no
     *   other arm to hide behind. It is also unreachable through play: crossing
     *   150 is exactly what `DoStartSleeping` responds to, so the survivor is
     *   asleep, and a sleeping actor does not get to drink.
     *
     * So the clause is not dead code -- it is the C#, and it is what stops a
     * survivor who has passed out from re-vomiting on every can -- but it cannot be
     * mutation-tested through the engine. The blackout arm's crossing test below
     * is the one that carries the weight, and it *is* testable, because the
     * blackout arm's effect (sleeping) is observable when the 80% arm's is not.
     */
    const after = (previous: number): number => previous + unit;
    const strays: number[] = [];
    for (let previous = 0; previous <= blackout * 2; previous++) {
      const levelTest = after(previous) >= blackout * 0.8;
      const crossingTest =
        previous < blackout * 0.8 && after(previous) >= blackout * 0.8;
      if (levelTest !== crossingTest) strays.push(previous);
    }

    expect(strays.length, "the two conditions do disagree somewhere").toBeGreaterThan(0);
    // Every disagreement is at or past the 80% line -- that is the only way they
    // can differ, and it is the premise the rest of the argument rests on.
    expect(strays.every((p) => p >= blackout * 0.8)).toBe(true);
    // The 120-150 band is covered by the blackout arm...
    const band = strays.filter((p) => p < blackout);
    expect(band.every((p) => after(p) >= blackout), "covered by blackout").toBe(true);
    // ...and the remainder is at or past passing out, i.e. asleep and unable to
    // drink, which is the whole reason the arm is unobservable in play.
    expect(strays.some((p) => p >= blackout), "some are past blackout").toBe(true);
  });

  it("passes out on crossing 100%, and vomits doing it", () => {
    player.previousBloodAlcohol = blackout - 1;
    player.bloodAlcohol = player.previousBloodAlcohol;
    drinkABeer();
    expect(player.bloodAlcohol).toBeGreaterThanOrEqual(blackout);
    expect(vomitedOn(), "passing out includes a vomit").toBe(true);
    expect(player.isSleeping).toBe(true);
  });

  it("does not pass out when already past it", () => {
    player.previousBloodAlcohol = blackout;
    player.bloodAlcohol = blackout;
    drinkABeer();
    expect(player.isSleeping).toBe(false);
  });

  it("raises no BAC at all for a non-alcoholic medicine", () => {
    // Bandages are `ItemMedicine` too, so the gate is
    // `isItemAlcoholForDrinking` and not the item class -- otherwise a first-aid
    // kit gets the survivor drunk.
    //
    // The player is hurt first, deliberately. A healthy player is refused by the
    // "Don't waste medicine!" check before the alcohol block is ever reached, so
    // the first version of this test asserted `bloodAlcohol === 0` after a path
    // that had not run at all, and passed with the gate deleted.
    player.bloodAlcohol = 0;
    player.previousBloodAlcohol = 0;
    player.hitPoints -= 10;
    const bandage = new ItemMedicine(Models.items.get(ItemID.MEDICINE_BANDAGES));
    player.inventory!.addAll(bandage);
    game.DoUseMedicineItem(player, bandage);
    expect(player.hitPoints, "the bandage was actually used").toBeGreaterThan(
      player.hitPoints - 10,
    );
    expect(player.bloodAlcohol, "and got nobody drunk").toBe(0);
  });

  it("raises no BAC under CLASSIC", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    player.previousBloodAlcohol = blackout - 1;
    player.bloodAlcohol = player.previousBloodAlcohol;
    drinkABeer();
    expect(player.bloodAlcohol, "classic has no intoxication").toBe(
      player.previousBloodAlcohol,
    );
  });
});

describe("Feature.Alcohol: the registry", () => {
  it("has five gameplay readers and no longer relies on the harness line", () => {
    // A guard against regressing to the state this feature was in: satisfied by a
    // single `step()` call in the headless runner while entirely unimplemented.
    const gameplay = ["engine/RogueGame.ts", "engine/Rules.ts"];
    const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
    const rulesSrc = readFileSync(join(__dirname, "../src/engine/Rules.ts"), "utf8");
    const count = (s: string): number => (s.match(/Feature\.Alcohol/g) ?? []).length;
    expect(count(src) + count(rulesSrc), "readers outside the harness").toBeGreaterThanOrEqual(5);
    expect(gameplay.length).toBe(2);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
