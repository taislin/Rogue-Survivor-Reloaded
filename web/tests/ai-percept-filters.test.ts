import { describe, it, expect, beforeAll } from "vitest";
import { BaseAI } from "@gameplay/ai/BaseAI";
import { Actor } from "@data/Actor";
import { MapObject } from "@data/MapObject";
import { Odor } from "@data/Odor";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameFactions, FactionID } from "@gameplay/GameFactions";
import { AIScent } from "@gameplay/ai/GameplaySensors";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";

/**
 * The AI percept filters must reject non-Actor percepts.
 *
 * `p.Percepted as Actor` in C# yields **null** for a MapObject percept, and
 * every filter's `if (other != null)` depends on that. A TypeScript `as` is
 * compile-time only, so the equivalent test has to be an `instanceof` check.
 * `if (other && ...)` is not equivalent: a MapObject is truthy.
 *
 * That is the shape of §1.1 bug 3, which was real in `filterActors` because
 * the leaked value was dereferenced. **Auditing the same pattern across the
 * other filters found four more instances of it -- and, being honest about the
 * result, none of them is a live bug.** Each is currently harmless:
 *
 *   - `filterEnemies` -- `areEnemies(actor, mapObject)` returns false rather
 *     than throwing, because `Faction.isEnemyOf` does
 *     `enemyList.includes(undefined)`. The MapObject is dropped anyway.
 *   - `filterActorsModel` -- a non-Actor has no `.model`, so the comparison
 *     fails. Correct today; breaks if MapObject ever grows a `model`.
 *   - `filterStrongestScent` -- the closest to real. On the first iteration
 *     `pBest === null` short-circuits the strength comparison, so a truthy
 *     non-scent was *returned* rather than dropped. Unreachable, because the
 *     only caller passes `SmellSensor.scents`, which is AIScent by
 *     construction -- which is also why the C# throws on it.
 *   - `CivilianAI`'s inline `isSoldier` predicate -- the one place fed the
 *     **raw** `mapPercepts`, so a MapObject really does arrive; but
 *     `isSoldier` null-checks and tests `instanceof AIController` itself.
 *
 * So this file is a *characterisation* suite, not a regression suite for a
 * fixed defect: it pins the current, correct behaviour so that a future
 * refactor of any callee (`areEnemies`, `isSoldier`, `MapObject`) cannot turn
 * a currently-harmless truthiness check into a live one without a test
 * failing. Only the `filterStrongestScent` case is genuinely order-dependent,
 * and that is the one asserted with a non-scent placed *first*.
 *
 * `filterSameMap` is asserted too, to pin the deliberate exception: it reads
 * `p.Location.Map` and never touches `p.Percepted`, so it must keep passing
 * non-Actor percepts through.
 */

class Probe extends BaseAI {
  // The three abstract hooks are irrelevant to the filters; no-ops.
  protected createSensors(): void {}
  protected updateSensors(_game: any): any[] {
    return [];
  }
  protected selectAction(_game: any, _percepts: any): any {
    return null;
  }

  pubFilterEnemies(game: any, percepts: any) {
    return this.filterEnemies(game, percepts);
  }
  pubFilterNonEnemies(game: any, percepts: any) {
    return this.filterNonEnemies(game, percepts);
  }
  pubFilterActorsModel(game: any, percepts: any, model: any) {
    return this.filterActorsModel(game, percepts, model);
  }
  pubFilterActors(game: any, percepts: any, fn: (a: Actor) => boolean) {
    return this.filterActors(game, percepts, fn);
  }
  pubFilterStrongestScent(game: any, scents: any) {
    return this.filterStrongestScent(game, scents);
  }
  pubFilterSameMap(game: any, percepts: any) {
    return this.filterSameMap(game, percepts);
  }
}

let player: Actor;
let zombie: Actor;
let aMapObject: MapObject;
// `Game` is `type Game = any` in BaseAI (BaseAI.ts:43); only `game.rules` is
// reachable from these filters, so this stub is sufficient and avoids standing
// up a whole RogueGame.
let game: any;
let ai: Probe;

const zombieModel = () => new GameActors().get(ActorID.UNDEAD_ZOMBIE);

/** The `Percept` shape the AI consumes. */
function percept(percepted: unknown, map: unknown = null) {
  return { percepted, location: { map, position: { x: 0, y: 0 } }, turn: 0 } as any;
}

beforeAll(() => {
  const actorsDb = new GameActors();
  // Real faction DB, because `actor.faction` resolves through `Models.factions`.
  const factionsDb = new GameFactions();
  const survivors = factionsDb.get(FactionID.TheSurvivors);
  const undead = factionsDb.get(FactionID.TheUndeads);
  // The DB may or may not already declare this pair hostile; make it explicit
  // so `areEnemies` really returns true and the filter has work to do.
  survivors.addEnemy(undead);
  undead.addEnemy(survivors);

  // A real Rules, so `areEnemies` is the genuine implementation rather than a
  // stub that would hide the bug.
  game = { rules: new Rules(new DiceRoller(1)) };

  player = actorsDb.get(ActorID.MALE_CIVILIAN).createAnonymous(survivors, 0);
  zombie = actorsDb.get(ActorID.UNDEAD_ZOMBIE).createAnonymous(undead, 0);
  aMapObject = new MapObject("a barrel", "barrel_hidden");

  ai = new Probe();
  ai.takeControl(player);
});

describe("AI percept filters reject non-Actors", () => {
  it("the probe is driving the player Actor", () => {
    expect(ai.controlledActor).toBe(player);
  });

  it("sanity: the zombie really is an enemy, so the filter has work to do", () => {
    expect(game.rules.areEnemies(player, zombie)).toBe(true);
  });

  it("filterEnemies drops a MapObject percept", () => {
    // The truthiness version let the MapObject through and then called
    // `areEnemies(player, mapObject)`, which reads `.model.abilities` off a
    // MapObject and throws.
    const kept = ai.pubFilterEnemies(game, [percept(zombie), percept(aMapObject), percept(player)])!;
    expect(kept).toHaveLength(1);
    expect(kept[0].percepted).toBe(zombie);
  });

  it("filterEnemies returns null (not []) when nothing matches", () => {
    expect(ai.pubFilterEnemies(game, [percept(aMapObject)])).toBeNull();
  });

  it("filterNonEnemies drops a MapObject percept", () => {
    // Needs a *friendly* actor: filterNonEnemies keeps non-enemies, so the
    // zombie would be dropped anyway and the MapObject would be untested.
    const friend = new GameActors().get(ActorID.FEMALE_CIVILIAN).createAnonymous(
      new GameFactions().get(FactionID.TheSurvivors),
      0
    );
    const kept = ai.pubFilterNonEnemies(game, [percept(aMapObject), percept(friend)])!;
    expect(kept).toHaveLength(1);
    expect(kept[0].percepted).toBe(friend);
  });

  it("filterActors drops a MapObject percept", () => {
    const kept = ai.pubFilterActors(game, [percept(aMapObject), percept(zombie)], () => true)!;
    expect(kept).toHaveLength(1);
    expect(kept[0].percepted).toBe(zombie);
  });

  it("filterActorsModel does not match a MapObject that happens to expose .model", () => {
    // The old code was `(p.percepted as Actor)?.model === model`, which relied
    // on a MapObject having no `model` field to fail the comparison. Prove the
    // test is now explicit by giving it one.
    const impostor = Object.create(MapObject.prototype) as MapObject;
    (impostor as any).model = zombieModel();
    expect(ai.pubFilterActorsModel(game, [percept(impostor)], zombieModel())).toBeNull();
  });

  it("filterStrongestScent ignores a non-AIScent percept", () => {
    const realScent = new AIScent(Odor.SUPPRESSOR, 5);
    const kept = ai.pubFilterStrongestScent(game, [percept(aMapObject), percept(realScent)]);
    expect(kept!.percepted).toBe(realScent);
  });

  it("filterSameMap still passes non-Actor percepts -- it reads p.location", () => {
    // C# BaseAI.cs:151-165 compares `p.Location.Map` and never touches
    // `p.Percepted`, so narrowing it to Actors here would be a regression.
    const onThisMap = percept(aMapObject, player.location.map);
    expect(ai.pubFilterSameMap(game, [onThisMap])).toHaveLength(1);
  });
});
