/**
 * Still Alive Release 7-6: the two food animals, and the controller they need.
 *
 * Three things arrived together upstream and are tested together here, because
 * each is useless without the others:
 *
 * - `Abilities.isLivingAnimal` (GameActors.cs:970/994/1021), which is what
 *   `RogueGame.ButcherMeat` and the butchering sanity rule branch on,
 * - the `RABBIT` and `CHICKEN` models themselves (GameActors.cs:988-1039), and
 * - `UnintelligentAnimalAI` (UnintelligentAnimalAI.cs), the whole of whose
 *   design brief is "unintelligent creatures that exist only as a food source".
 *
 * The expectations are transcribed from the C#, never read back off the port: a
 * test that asserts what the code happens to do passes forever and proves
 * nothing. Where the C# has an arm *commented out*, the port keeps it out and
 * the test says so, because "we did not port the disabled arm" and "we ported it
 * wrongly" look identical from the outside.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Activity } from "@data/Activity";
import { Corpse } from "@data/Corpse";
import { DollPart } from "@data/Doll";
import { Location } from "@data/Location";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Percept } from "@engine/ai/Sensors";
import { ActionBump, ActionWait } from "@engine/actions/Actions";
import { NullRogueUI } from "@ui/NullRogueUI";
import { ItemFood } from "@engine/items/ItemFood";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { FactionID, GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { TileID } from "@gameplay/GameTiles";
import { UnintelligentAnimalAI } from "@gameplay/ai/UnintelligentAnimalAI";

const MAP_SIZE = 40;
const MID = 20;

// ────────────────────────────────────────────────────────────────────────────
// World
// ────────────────────────────────────────────────────────────────────────────

let game: RogueGame;
let map: GameMap;

const grass = () => Models.tiles.get(TileID.FLOOR_GRASS);
const asphalt = () => Models.tiles.get(TileID.FLOOR_ASPHALT);
const water = () => Models.tiles.get(TileID.FLOOR_SEWER_WATER);

/** A flat map, `tile` everywhere, with nothing on it and no scents. */
function pave(tile: ReturnType<typeof Models.tiles.get>): void {
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) map.setTileModelAt(x, y, tile);
  }
}

/** Flat asphalt, midday, and one animal in the middle of it. */
function world(seed: number, modelId: ActorID = ActorID.RABBIT): { rabbit: Actor; actor: Actor } {
  Session.useSeed(seed);
  game = new RogueGame(new NullRogueUI());
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  map = new GameMap(seed, "test", MAP_SIZE, MAP_SIZE);
  pave(asphalt());
  // Midday, so nothing is asleep and nothing thinks it is night.
  map.localTime.turnCounter = 12 * 30;
  const rabbit = spawn(modelId, FactionID.TheUnintelligentAnimals, new Point(MID, MID));
  return { rabbit, actor: rabbit };
}

function spawn(modelId: ActorID, faction: FactionID, at: Point): Actor {
  const actor = Models.actors.get(modelId).createAnonymous(game.gameFactions.get(faction), 0);
  map.placeActor(actor, at);
  return actor;
}

const aiOf = (actor: Actor): UnintelligentAnimalAI => {
  const c = actor.controller;
  if (!(c instanceof UnintelligentAnimalAI)) throw new Error("not an animal controller");
  return c;
};

/** `getAction` and a clock tick, in the order `RogueGame` uses them. */
function step(actor: Actor): ActionBump | ActionWait {
  const action = aiOf(actor).getAction(game);
  map.localTime.turnCounter++;
  return action as ActionBump | ActionWait;
}

/**
 * The three tiles on one side of the rabbit, made grass.
 *
 * Three and not one, and the reason is `behaviorWalkAwayFrom`: with a threat due
 * east, W / NW / SW are equidistant from it and equally open, so they tie in
 * `safetyFrom` and `choose` rolls among them. Painting one of the three would
 * make the flee arm decline more often than not, and painting all three makes
 * the flee arm *guaranteed* -- which is the property worth asserting.
 */
function grassBeside(side: "E" | "W"): void {
  for (const dy of [-1, 0, 1]) {
    map.setTileModelAt(side === "E" ? MID + 1 : MID - 1, MID + dy, grass());
  }
}


// ────────────────────────────────────────────────────────────────────────────
// 1. The models
// ────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  new GameActors();
  new GameItems();
  new GameFactions();
});

describe("RABBIT and CHICKEN resolve from the merged CSV", () => {
  // Actors.csv:29-30, the only two rows the fork adds that the port had not yet
  // bound. Asserted as numbers, not as "greater than zero", because a wrong stat
  // on a 1 HP actor is not a typo the player would ever notice: 1 HP, 1 ATK and
  // 1 DMG is what a rabbit is, and anything else is a different animal.
  const CSV: Array<[string, ActorID, { name: string; plural: string; spd: number; hp: number; sta: number; atk: number; dmg: number; def: number; fov: number; audio: number; score: number; flavor: string }]> = [
    ["RABBIT", ActorID.RABBIT, {
      name: "rabbit", plural: "rabbits", spd: 200, hp: 1, sta: 99,
      atk: 1, dmg: 1, def: 1, fov: 2, audio: 2, score: 0,
      flavor: "Foul, cruel and bad-tempered.",
    }],
    ["CHICKEN", ActorID.CHICKEN, {
      name: "chicken", plural: "chickens", spd: 100, hp: 1, sta: 90,
      atk: 1, dmg: 1, def: 1, fov: 2, audio: 2, score: 0,
      flavor: "Practical poultry.",
    }],
  ];

  it.each(CSV)("%s carries the CSV's identity and sheet", (_id, id, want) => {
    const m = Models.actors.get(id);
    expect(m, `${want.name} is bound`).toBeDefined();
    expect(m.name).toBe(want.name);
    expect(m.pluralName).toBe(want.plural);
    expect(m.scoreValue).toBe(want.score);
    expect(m.flavorDescription).toBe(want.flavor);
    // `DollBody(true, SPD)` -- the C# passes `true` for both, so these are
    // he/him and male names. Worth pinning: excluding the female undead from
    // `isMale` is a bug this port already had once.
    expect(m.dollBody.isMale).toBe(true);
    expect(m.dollBody.speed).toBe(want.spd);

    const s = m.startingSheet;
    expect(s.baseHitPoints).toBe(want.hp);
    expect(s.baseStaminaPoints).toBe(want.sta);
    expect(s.baseViewRange).toBe(want.fov);
    expect(s.baseAudioRange).toBe(want.audio);
    expect(s.baseDefence.value).toBe(want.def);
    expect(s.baseDefence.protectionHit).toBe(0);
    expect(s.baseDefence.protectionShot).toBe(0);
    expect(s.unarmedAttack.hitValue).toBe(want.atk);
    expect(s.unarmedAttack.damageValue).toBe(want.dmg);
  });

  it("a rabbit bites and a chicken pecks, which the CSV cannot say", () => {
    // GameActors.cs:1006 and 1033. The verb is a code literal in the C#, not a
    // column, so the whole reason the C# builds the `Attack` per-actor is these
    // two words -- and a shared `VERB_PUNCH` would have said "rabbits punch".
    expect(Models.actors.get(ActorID.RABBIT).startingSheet.unarmedAttack.verb.youForm).toBe("bite");
    expect(Models.actors.get(ActorID.CHICKEN).startingSheet.unarmedAttack.verb.youForm).toBe("peck");
  });

  it("takes the dog's food and sleep constants but no sanity and no inventory", () => {
    // GameActors.cs:1005-1008 and 1032-1035: `DOG_HUN, DOG_SLP, NO_SANITY` and
    // a trailing `0`. `DOG_HUN`/`DOG_SLP` are `Rules.FOOD_BASE_POINTS` /
    // `SLEEP_BASE_POINTS` (GameActors.cs:216-217), so this is the feral dog's
    // food column and *not* the human one -- a rabbit is not a hungry civilian.
    for (const id of [ActorID.RABBIT, ActorID.CHICKEN]) {
      const s = Models.actors.get(id).startingSheet;
      expect(s.baseFoodPoints, `${ActorID[id]} DOG_HUN`).toBe(Rules.FOOD_BASE_POINTS);
      expect(s.baseSleepPoints, `${ActorID[id]} DOG_SLP`).toBe(Rules.SLEEP_BASE_POINTS);
      // NO_SANITY, and NOT the human's -- the distinction that made the
      // `isLiving ? SANITY_BASE_POINTS : 0` flattening visible.
      expect(s.baseSanity, `${ActorID[id]} NO_SANITY`).toBe(0);
      // NO_INVENTORY. Redundant with `hasInventory = false` (Actor only builds
      // an Inventory when that flag is set) but it is the number the C# passes.
      expect(s.baseInventoryCapacity).toBe(0);
    }
  });
});

describe("abilities: the C# grants four flags and withholds nineteen", () => {
  /**
   * Every other flag in the C#'s `new Abilities() { … }` block, all written
   * `false` or omitted. Nineteen of the twenty-three: what the two models *do*
   * get is asserted separately, so this list plus that one is the whole surface.
   */
  const REFUSED = [
    "isUndead", "isUndeadMaster", "isRotting", "canZombifyKilled",
    "hasToEat", "hasToSleep", "hasSanity", "hasInventory", "canUseItems",
    "canTalk", "canTrade", "canUseMapObjects", "canBashDoors",
    "canBreakObjects", "canJump", "canBarricade", "canPush",
    "aiCanUseAIExits", "isIntelligent",
  ] as const;

  it.each([ActorID.RABBIT, ActorID.CHICKEN])("%s is a living animal, small, and tires", (id) => {
    const a = Models.actors.get(id).abilities;
    expect(a.isLivingAnimal, "the flag ButcherMeat branches on").toBe(true);
    expect(a.isSmall, "so it slips past closed doors and dodges traps").toBe(true);
    expect(a.canTire).toBe(true);
    expect(a.canRun).toBe(true);
  });

  it.each([ActorID.RABBIT, ActorID.CHICKEN])("%s has nothing else", (id) => {
    const a = Models.actors.get(id).abilities;
    for (const key of REFUSED) {
      expect(a[key], `${ActorID[id]}.${key}`).toBe(false);
    }
  });

  it("the feral dog is a living animal too, which is Release 7-5 not 7-6", () => {
    // GameActors.cs:970. The flag is not a synonym for "rabbit or chicken" -- it
    // is on the dog as well, and `ButcherMeat`'s switch has a `feral dog` case
    // to match. `GameActors.isUnintelligentAnimal` is the *other* set, and
    // deliberately narrower.
    expect(Models.actors.get(ActorID.FERAL_DOG).abilities.isLivingAnimal).toBe(true);
    const dog = Models.actors.get(ActorID.FERAL_DOG);
    expect(GameActors.isUnintelligentAnimal(dog), "the dog is not unintelligent").toBe(false);
    expect(GameActors.isUnintelligentAnimal(Models.actors.get(ActorID.RABBIT))).toBe(true);
    expect(GameActors.isUnintelligentAnimal(Models.actors.get(ActorID.CHICKEN))).toBe(true);
    // And a person is neither.
    expect(Models.actors.get(ActorID.MALE_CIVILIAN).abilities.isLivingAnimal).toBe(false);
    expect(GameActors.isUnintelligentAnimal(Models.actors.get(ActorID.MALE_CIVILIAN))).toBe(false);
  });

  it("nobody else claims the flag", () => {
    const flagged: string[] = [];
    for (let i = 0; i < ActorID._COUNT; i++) {
      if (Models.actors.get(i).abilities.isLivingAnimal) flagged.push(ActorID[i]);
    }
    // Exactly the C#'s three (GameActors.cs:970, 994, 1021). A fourth would mean
    // a model had picked up the flag by accident, and `ButcherMeat` would then
    // look up a name its switch has no case for and hand back no meat at all.
    expect(flagged.sort()).toEqual(["CHICKEN", "FERAL_DOG", "RABBIT"]);
  });
});

describe("ActorID is append-only", () => {
  /**
   * Every numeric value the enum declares, other than the `_COUNT` sentinel.
   *
   * A TS numeric enum also carries the reverse mapping, so `Object.entries`
   * yields `{ "29": "RABBIT" }` alongside `{ RABBIT: 29 }`. The string values are
   * the reverse mapping and the one number left is the sentinel.
   */
  const ids = (): number[] =>
    Object.entries(ActorID)
      .map(([, v]) => v)
      .filter((v): v is number => typeof v === "number" && v !== ActorID._COUNT);

  it("puts the two new ids at the top, after the 29 that already existed", () => {
    // A save names its actors by number. DERANGED_PATIENT=27 and
    // CHAR_SCIENTIST=28 were the highest before this change and have to stay
    // there. The C# interleaves RABBIT and CHICKEN next to FERAL_DOG
    // (GameActors.cs:43-44), and reproducing that would have renumbered thirteen
    // actors underneath every existing save.
    expect(ActorID.DERANGED_PATIENT).toBe(27);
    expect(ActorID.CHAR_SCIENTIST).toBe(28);
    expect(ActorID.RABBIT).toBe(29);
    expect(ActorID.CHICKEN).toBe(30);
    expect(ActorID._COUNT).toBe(31);
  });

  it("is dense and duplicate-free from 0 to _COUNT, so _COUNT is the array size", () => {
    // The two invariants a `new Array(_COUNT)` model table rests on. A duplicate
    // means one id silently shadows another and one model is never built; a hole
    // means `Models.actors.get(i)` answers `undefined` and the null deref lands
    // somewhere a long way from the cause.
    const numbers = ids().sort((a, b) => a - b);
    expect(numbers, "two names share a number").toEqual(
      Array.from({ length: ActorID._COUNT }, (_, i) => i)
    );
  });

  it("has a model in every slot", () => {
    for (let i = 0; i < ActorID._COUNT; i++) {
      expect(Models.actors.get(i), `slot ${i} (${ActorID[i]})`).toBeDefined();
    }
    // And 31 distinct names, which is the property the by-ID CSV binding exists
    // to guarantee: positionally bound rows gave 9 of 27 actors the wrong stats.
    const names: string[] = [];
    for (let i = 0; i < ActorID._COUNT; i++) names.push(Models.actors.get(i).name);
    expect(new Set(names).size).toBe(ActorID._COUNT);
  });
});

describe("the animals are drawn from their doll and nothing else", () => {
  it.each([ActorID.RABBIT, ActorID.CHICKEN])("%s has no whole-body sprite", (id) => {
    // GameActors.cs:988/1015 pass `null`. A sprite here would be drawn *under*
    // the skin decoration, so a rabbit would render as a rabbit wearing a
    // rabbit.
    expect(Models.actors.get(id).imageId).toBeNull();
  });

  it("all four east/west skins exist as GameImages ids", () => {
    // `faceSpriteForDirection` matches on these constants rather than on the
    // C#'s `"Actors\\Decoration\\rabbit_skin_east"` literals, because the port's
    // ids use forward slashes and the literal would fall through to its
    // `default` arm on every single turn.
    expect(GameImages.RABBIT_SKIN_EAST).toBe("Actors/Decoration/rabbit_skin_east");
    expect(GameImages.RABBIT_SKIN_WEST).toBe("Actors/Decoration/rabbit_skin_west");
    expect(GameImages.CHICKEN_SKIN_EAST).toBe("Actors/Decoration/chicken_skin_east");
    expect(GameImages.CHICKEN_SKIN_WEST).toBe("Actors/Decoration/chicken_skin_west");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. The controller
// ────────────────────────────────────────────────────────────────────────────

describe("UnintelligentAnimalAI is attached to both models", () => {
  it.each([ActorID.RABBIT, ActorID.CHICKEN])("%s's default controller is it", (id) => {
    expect(Models.actors.get(id).defaultControllerCtor).toBe(UnintelligentAnimalAI);
  });

  it.each([ActorID.RABBIT, ActorID.CHICKEN])("%s spawns already under it", (id) => {
    // `ActorModel.create` instantiates `defaultControllerCtor`, so the AI is in
    // place from the first turn -- there is no "attach a controller later" step
    // for a spawned animal to miss, and a null one would be an actor that stands
    // in a field doing nothing for the whole run.
    const { actor } = world(7, id);
    expect(actor.controller).toBeInstanceOf(UnintelligentAnimalAI);
  });
});

describe("all three of BaseAI's hooks are reached on a plain turn", () => {
  /** Counts each hook. `takeControl` builds the sensors; `getAction` runs the
   *  other two, in that order, once per turn. */
  const calls = { createSensors: 0, updateSensors: 0, selectAction: 0 };
  class Traced extends UnintelligentAnimalAI {
    protected override createSensors(): void {
      calls.createSensors++;
      super.createSensors();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected override updateSensors(game: any): Percept[] {
      calls.updateSensors++;
      return super.updateSensors(game);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected override selectAction(game: any, percepts: Percept[]) {
      calls.selectAction++;
      return super.selectAction(game, percepts);
    }
  }

  it("constructs, senses and decides without throwing", () => {
    const { actor } = world(11);
    // Constructing must not throw on its own -- the C# has no constructor, so
    // this is only true because `takeControl` does the work and does not defer
    // any of it to a first turn that might never come.
    expect(() => new Traced()).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => { actor.controller = new Traced(); }).not.toThrow();
    expect(calls.createSensors, "takeControl builds the sensors").toBe(1);

    let decided: ActionBump | ActionWait = new ActionWait(actor, game);
    expect(() => { decided = step(actor); }).not.toThrow();
    expect(calls.updateSensors).toBe(1);
    expect(calls.selectAction).toBe(1);
    expect(decided.isLegal()).toBe(true);
  });

  it("stays legal when it performs, and the doll survives the turn", () => {
    const { actor } = world(11);
    actor.doll.addDecoration(DollPart.SKIN, GameImages.RABBIT_SKIN_EAST);
    const before = actor.location.position.x + "," + actor.location.position.y;
    const action = step(actor);
    // A rabbit's whole body is the skin decoration, so a turn that dropped it
    // would leave the actor rendering as nothing at all.
    expect(() => action.perform()).not.toThrow();
    expect(actor.doll.getDecorations(DollPart.SKIN)).toHaveLength(1);
    expect(actor.location.position.x + "," + actor.location.position.y).not.toBe(before);
  });
});

describe("the behaviour order the C# states", () => {
  /** Wall the map in except for one tile, so exactly one direction is legal. */
  function pen(open: Point): void {
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let y = 0; y < MAP_SIZE; y++) map.setTileModelAt(x, y, Models.tiles.get(TileID.WALL_BRICK));
    }
    map.setTileModelAt(open.x, open.y, asphalt());
  }

  it("flees from a burning tile before it thinks about anything else", () => {
    // C# arm 0.1, `BehaviorFleeFromFires(game, m_Actor.Location)` -- the first
    // statement in `SelectAction`, ahead of the enemy check, and ahead of the
    // wander that would otherwise send it back into the flames.
    //
    // One way out, north, and nothing else walkable, so the direction is forced
    // rather than decided by the tie-break among seven equally-safe tiles.
    const { rabbit } = world(3);
    pen(new Point(MID, MID - 1));
    // An enemy in view too, so the two arms genuinely compete for the turn.
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 1, MID));
    map.getTileAt(MID, MID)!.isOnFire = true;

    const action = step(rabbit) as ActionBump;
    expect(action).toBeInstanceOf(ActionBump);
    expect(action.direction.name).toBe("N");
    expect(rabbit.activity, "and it is FLEEING").toBe(Activity.FLEEING);
  });

  it("prefers water when fleeing fire, the C#'s +6", () => {
    // BaseAI.cs:4462-4463. Water is worth +6 against a flat 1 for any other open
    // tile, so this is not a tie-break: nothing else on the board can reach it.
    const { rabbit } = world(3);
    map.getTileAt(MID, MID)!.isOnFire = true;
    // A pond to the north. Note this is the *fire* behaviour, not the wander
    // one, which would score the same tile -100.
    for (let x = 1; x < MAP_SIZE - 1; x++) map.setTileModelAt(x, MID - 1, water());

    const action = step(rabbit) as ActionBump;
    expect(action).toBeInstanceOf(ActionBump);
    expect(action.direction.dy, "north, into the pond").toBe(-1);
  });

  it("flees a visible enemy, but only onto grass", () => {
    // C# arm 1. The grass test (UnintelligentAnimalAI.cs:93-102) is the point:
    // without it an animal walks *into* whatever is in the way while "fleeing",
    // and one boxed in on asphalt has nowhere to go at all.
    //
    // `behaviorWalkAwayFrom` cannot name a single best direction when the threat
    // is due east: W, NW and SW are all three tiles from it and all equally
    // open, so they tie and `choose` rolls among them. So the grass goes on all
    // three, and the assertion is that every seed lands on one of them -- with
    // the test removed they would scatter over all eight, so three-in-eight
    // would pass by luck alone.
    const AWAY = ["W", "NW", "SW"];
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]) {
      const { rabbit } = world(seed);
      spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
      grassBeside("W");
      const action = step(rabbit) as ActionBump;
      expect(action, `seed ${seed} must act`).toBeInstanceOf(ActionBump);
      expect(AWAY, `seed ${seed} did not flee west`).toContain(action.direction.name);
      expect(rabbit.activity, `seed ${seed}`).toBe(Activity.FLEEING);
    }
  });

  it("declines to flee when every away-tile is off the grass", () => {
    // The other half of the grass test, and the case the C#'s own comment names:
    // "if not, we're 'pinned in a corner'".
    //
    // The observable is the activity, not the heading. On open asphalt the wander
    // arm is unconstrained, so it picks a westerly direction about three times in
    // eight all by itself and the heading cannot be told apart from a flee; but
    // the flee arm is the only thing in this class that ever writes FLEEING, and
    // the fire arm needs a burning tile. Twelve seeds that never do is the
    // assertion with teeth: delete the grass test and all twelve would flee.
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]) {
      const { rabbit } = world(seed);
      spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
      const action = step(rabbit);
      expect(action, `seed ${seed} must still act`).toBeDefined();
      expect(rabbit.activity, `seed ${seed} fled with no grass to run onto`).not.toBe(
        Activity.FLEEING
      );
    }
  });

  it("will not pursue, and never sets a target", () => {
    // The C#'s "flee from closest enemy" is the *only* enemy arm, and its
    // `m_Actor.TargetActor` write is commented out upstream (C#:110). So the
    // observable is that the target is never set: a human who walks past a
    // rabbit does not become hunted by it.
    const { rabbit } = world(5);
    grassBeside("W");
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
    step(rabbit);
    expect(rabbit.targetActor).toBeNull();
  });

  it("wanders, and it is the grass that decides, not the roll", () => {
    // C# arm 4, `BehaviorSimpleAnimalWander`. `+200` for grass against `-1000`
    // for anything else (BaseAI.cs:682-685) is not a preference, it is a veto:
    // the only random term is `Roll(0, 50)`, so no roll can cross 1150. Twelve
    // seeds all going the same way is the assertion with teeth -- without the
    // grass term they would scatter over all eight directions.
    const heading = (seed: number): string => {
      const { rabbit } = world(seed);
      map.setTileModelAt(MID + 1, MID, grass());
      return (step(rabbit) as ActionBump).direction.name;
    };
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]) {
      expect(heading(seed), `seed ${seed}`).toBe("E");
    }
  });

  it("does not run away from anything, and does not forage", () => {
    // C# arm 2 (eat) is commented out, "removed the need for these animals to
    // eat, as it added nothing to the game and just cost CPU cycles". The arm it
    // removed added `+10` FoodPoints, so a *starved* animal is the case that
    // would have caught a partial port.
    const { rabbit } = world(13);
    rabbit.foodPoints = 0;
    rabbit.sleepPoints = 0;
    expect(rabbit.model.abilities.hasToEat).toBe(false);
    expect(rabbit.model.abilities.hasToSleep).toBe(false);
    // ...and both of the C#'s predicates are false on that flag alone, so the
    // commented arms could not have fired even if they were re-enabled.
    expect(game.rules.isActorHungry(rabbit)).toBe(false);
    expect(game.rules.isActorStarving(rabbit)).toBe(false);
    expect(game.rules.isActorSleepy(rabbit)).toBe(false);

    for (let turn = 0; turn < 8; turn++) {
      const action = step(rabbit);
      expect(action.constructor.name, "never an eat or use action").not.toMatch(/Eat|UseItem/);
    }
    expect(rabbit.foodPoints, "and the meter never moves").toBe(0);
    expect(rabbit.sleepPoints).toBe(0);
  });

  it("never shouts, because the fork cut every emote arm", () => {
    // The C# keeps `FIGHT_EMOTES` and then never uses it: the flee / trapped /
    // fight arms that would have consumed it are all commented out (see :22-27).
    // The three strings are asserted so the constant cannot be quietly emptied,
    // and `DoSay` is counted across every arm -- fire, flee, rest and wander --
    // because "the arms are disabled" and "the arms were dropped by accident"
    // are otherwise the same diff.
    expect(UnintelligentAnimalAI.FIGHT_EMOTES).toEqual(["*screech*", "*screech*", "*screech*"]);
    const { rabbit } = world(41);
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
    grassBeside("W");
    map.getTileAt(MID, MID)!.isOnFire = true; // the fire arm, the loudest one
    let shouts = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (game as any).DoSay = () => {
      shouts++;
    };
    for (let turn = 0; turn < 12; turn++) step(rabbit);
    expect(shouts, "an unintelligent animal has nothing to say").toBe(0);
  });

  it("waits rather than acting when it is cornered", () => {
    // C#:152-172. With no legal direction the animal rests -- and because the
    // chicken's egg-laying roll is commented out too (C#:159), this arm consumes
    // no randomness, so a cornered animal does not shift the world's roll
    // sequence for the actors around it.
    const { rabbit } = world(17);
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let y = 0; y < MAP_SIZE; y++) {
        if (x === MID && y === MID) continue;
        map.setTileModelAt(x, y, Models.tiles.get(TileID.WALL_BRICK));
      }
    }
    expect(step(rabbit)).toBeInstanceOf(ActionWait);
  });
});

describe("the animal turns to face where it is going", () => {
  it("swaps east for west when it turns away, and west for east", () => {
    // C# :179-220, called from the flee arm (:111) and the wander arm (:148) and
    // nowhere else. The body is a switch on the *current* skin that returns early
    // when the current skin is already the one wanted, so the swap and the no-op
    // are separate code and are pinned separately below.
    //
    // All three west-facing grass tiles, because `behaviorWalkAwayFrom` ties
    // between W, NW and SW and rolls among them -- but `Direction.COMPASS_WESTERLY`
    // is all three, so which one it picked does not matter to the skin.
    const { rabbit } = world(23);
    rabbit.doll.addDecoration(DollPart.SKIN, GameImages.RABBIT_SKIN_EAST);
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
    grassBeside("W");
    step(rabbit);
    // C#:200-201 -- heading westerly with an east skin is a swap.
    expect(rabbit.doll.getDecorations(DollPart.SKIN)).toEqual([GameImages.RABBIT_SKIN_WEST]);

    // And the other way round, on a chicken, so all four C# cases are covered.
    const { actor: chicken } = world(25);
    chicken.doll.addDecoration(DollPart.SKIN, GameImages.CHICKEN_SKIN_WEST);
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID - 2, MID));
    grassBeside("E");
    step(chicken);
    expect(chicken.doll.getDecorations(DollPart.SKIN)).toEqual([GameImages.CHICKEN_SKIN_EAST]);
  });

  it("leaves the skin alone when the heading is already east", () => {
    // C#:192 and :196 -- "already the required sprite". Asserted apart from the
    // swap, because a swap that ran twice would arrive here too and the two are
    // not the same code.
    const { rabbit } = world(23);
    rabbit.doll.addDecoration(DollPart.SKIN, GameImages.RABBIT_SKIN_EAST);
    spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID - 2, MID));
    grassBeside("E");
    expect((step(rabbit) as ActionBump).direction.name).toMatch(/^(E|NE|SE)$/);
    expect(rabbit.doll.getDecorations(DollPart.SKIN)).toEqual([GameImages.RABBIT_SKIN_EAST]);
  });

  it("keeps the current skin heading straight north or south", () => {
    // C# :210-211. A rabbit seen from behind is the same drawing as one seen from
    // the front, so there is nothing to swap and the C# returns early. A single
    // grass tile north is enough to force the heading here, because the wander
    // arm's `+200` is a veto rather than a preference.
    const { rabbit } = world(29);
    rabbit.doll.addDecoration(DollPart.SKIN, GameImages.CHICKEN_SKIN_WEST);
    map.setTileModelAt(MID, MID - 1, grass());
    expect((step(rabbit) as ActionBump).direction.name).toBe("N");
    expect(rabbit.doll.getDecorations(DollPart.SKIN)).toEqual([GameImages.CHICKEN_SKIN_WEST]);
  });

  it("survives an actor with no skin decoration at all", () => {
    // The C# indexes `skin[0]` unconditionally and throws
    // `InvalidOperationException` on an unknown skin; `Doll.getDecorations`
    // returns null for a part nobody dressed, so an unskinned animal -- one made
    // by a test, or restored from a save written before skins existed -- would
    // throw out of the middle of the AI's turn.
    const { rabbit } = world(31);
    expect(rabbit.doll.getDecorations(DollPart.SKIN)).toBeNull();
    expect(() => step(rabbit)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Determinism
// ────────────────────────────────────────────────────────────────────────────

describe("determinism", () => {
  /** The AI's decision sequence for `turns` ticks of a lone rabbit. */
  function sequence(seed: number, turns = 25): string[] {
    const { actor } = world(seed);
    // A little asymmetry, so the sequence is not trivially "always east".
    for (let y = 0; y < MAP_SIZE; y++) {
      map.setTileModelAt(MID - 4, y, grass());
      map.setTileModelAt(MID + 2, y, grass());
    }
    const out: string[] = [];
    for (let turn = 0; turn < turns; turn++) {
      const a = step(actor);
      const dir = a instanceof ActionBump ? a.direction.name : "-";
      out.push(`${a.constructor.name}/${dir}/${actor.activity}`);
    }
    return out;
  }

  it("the same seed gives the same decision sequence", () => {
    // Every roll in this AI goes through `game.rules.roll`, which is the
    // `DiceRoller` `RogueGame` builds from `Session.get().seed`. A `Math.random`
    // anywhere in the path would make this fail, and would make every generated
    // world in the game depend on which animal happened to be where.
    expect(sequence(4242)).toEqual(sequence(4242));
  });

  it("a different seed gives a different sequence, so the test above has teeth", () => {
    // Without this, "same seed, same sequence" would also be satisfied by a
    // controller that ignores the roller entirely -- e.g. one that always
    // picked the first legal direction.
    expect(sequence(4242)).not.toEqual(sequence(99));
  });

  it("is a stroll and not a march in one direction", () => {
    // The wander arm's base score is `Roll(0, 50)` (BaseAI.cs:669) and its only
    // other term is the grass veto, so on a featureless map the stroll really is
    // aimless. An implementation that always took the first legal direction --
    // the obvious way to "port" a randomised walk -- would pass every other test
    // in this file and fail this one.
    const { actor } = world(4242);
    const dirs = new Set<string>();
    for (let turn = 0; turn < 40; turn++) {
      const a = step(actor);
      if (a instanceof ActionBump) dirs.add(a.direction.name);
    }
    expect(dirs.size, "it does pick different directions").toBeGreaterThan(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. What they were for
// ────────────────────────────────────────────────────────────────────────────

describe("the reason they exist: butchering one", () => {
  /**
   * `Feature.Butchering`'s meat switch keys on the dead guy's model *name*, and
   * it has exactly three cases. Until this change none of them was reachable:
   * the C# `default` arm throws, and the port's yields no meat. All three now
   * resolve, and that is the whole feature.
   */
  function butcher(modelId: ActorID, cause: string): ItemFood[] {
    Session.useSeed(1);
    const g = new RogueGame(new NullRogueUI());
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const m = new GameMap(1, "test", 30, 30);
    const at = new Point(10, 10);
    const who = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), g.gameFactions.get(FactionID.TheCivilians), "you");
    who.location = new Location(m, at);
    m.placeActor(who, at);

    // A corpse is what is *left* of someone, so the dead actor is given a
    // Location and never placed: `placeActor` would throw "another actor already
    // at position", which is the map correctly refusing two bodies in one square.
    const dead = new Actor(Models.actors.get(modelId), g.gameFactions.get(FactionID.TheUnintelligentAnimals), "victim");
    dead.location = new Location(m, at);
    dead.causeOfDeath = cause;
    m.addCorpse(new Corpse(dead, 100, 100, 0, 0, 1));

    (g as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(who, m.corpses[0]);
    return who.inventory!.items.filter((i): i is ItemFood => i instanceof ItemFood);
  }

  it("gives raw rabbit, raw chicken and raw dog meat from a non-fire death", () => {
    expect(butcher(ActorID.RABBIT, "zombie bite").map((f) => f.model.id)).toEqual([ItemID.FOOD_RAW_RABBIT]);
    expect(butcher(ActorID.CHICKEN, "zombie bite").map((f) => f.model.id)).toEqual([ItemID.FOOD_RAW_CHICKEN]);
    expect(butcher(ActorID.FERAL_DOG, "zombie bite").map((f) => f.model.id)).toEqual([ItemID.FOOD_RAW_DOG_MEAT]);
  });

  it("gives the cooked meat from a body that died of fire", () => {
    // Fire is a cooking method you do not choose: it is the *cause of death*
    // that decides, which is the whole purpose of `Actor.causeOfDeath`.
    expect(butcher(ActorID.RABBIT, "fire").map((f) => f.model.id)).toEqual([ItemID.FOOD_COOKED_RABBIT]);
    expect(butcher(ActorID.CHICKEN, "fire").map((f) => f.model.id)).toEqual([ItemID.FOOD_COOKED_CHICKEN]);
    expect(butcher(ActorID.FERAL_DOG, "fire").map((f) => f.model.id)).toEqual([ItemID.FOOD_COOKED_DOG_MEAT]);
  });

  it("takes the animal arm, the one that scales with the resources setting", () => {
    // The C#'s `ResourcesAvailability` switch sits inside the *animal* arm only
    // (RogueGame.cs:11700), so a person is always one piece and an animal is
    // 3 / 2 / 1 -- 2 at the MED default. The quantity is the observable proof
    // that these three took the animal arm rather than the human one, and it is
    // the half of the switch that a name lookup alone would not catch.
    for (const id of [ActorID.RABBIT, ActorID.CHICKEN, ActorID.FERAL_DOG]) {
      expect(butcher(id, "zombie bite")[0].quantity, ActorID[id]).toBe(2);
    }
    expect(butcher(ActorID.MALE_CIVILIAN, "zombie bite")[0].quantity, "a person is not scaled").toBe(1);
  });

  it("still yields no meat for a living animal the switch has no case for", () => {
    // The deliberate non-port of the C#'s `default: throw new ArgumentException`
    // lives in `tests/butchering.test.ts`, which fakes an animal by hand. This is
    // the other half of it: now that the three real models exist, a *fourth*
    // model that somehow claimed the flag must still not be able to take the
    // game down. `Abilities.isLivingAnimal` is a public mutable field, so that
    // is reachable, and the port answers "no meat" where the C# throws.
    Session.useSeed(1);
    const g = new RogueGame(new NullRogueUI());
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const m = new GameMap(1, "test", 30, 30);
    const at = new Point(10, 10);
    const who = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), g.gameFactions.get(FactionID.TheCivilians), "you");
    who.location = new Location(m, at);
    m.placeActor(who, at);
    const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), g.gameFactions.get(FactionID.TheCivilians), "v");
    dead.location = new Location(m, at);
    dead.causeOfDeath = "zombie bite";
    m.addCorpse(new Corpse(dead, 100, 100, 0, 0, 1));
    // Models are process-wide statics shared by every later test in this file,
    // so the flag goes back down in a finally rather than being left set.
    const civAbilities = Models.actors.get(ActorID.MALE_CIVILIAN).abilities;
    civAbilities.isLivingAnimal = true;
    try {
      expect(() =>
        (g as unknown as { ButcherMeat(a: Actor, c: Corpse): void }).ButcherMeat(who, m.corpses[0])
      ).not.toThrow();
      expect(who.inventory!.items.filter((i) => i instanceof ItemFood), "and no meat at all").toHaveLength(0);
    } finally {
      civAbilities.isLivingAnimal = false;
    }
  });
});

describe("the faction they need in order to flee at all", () => {
  it("is the only faction whose enmity is one-directional", () => {
    // GameFactions.cs:174-184 and the symmetry loop's `continue` at 191-194.
    // Without the skip, the loop adds the reverse edge and every civilian
    // becomes a hunter of rabbits -- the one thing the C# refuses, in a comment
    // that says why.
    new GameFactions();
    const animals = Models.factions.get(FactionID.TheUnintelligentAnimals);
    expect(animals.isEnemyOf(Models.factions.get(FactionID.TheSurvivors)), "the rabbit fears the survivor").toBe(true);
    expect(animals.isEnemyOf(Models.factions.get(FactionID.TheUndeads))).toBe(true);
    expect(Models.factions.get(FactionID.TheSurvivors).isEnemyOf(animals), "but not the other way round").toBe(false);
    expect(Models.factions.get(FactionID.TheUndeads).isEnemyOf(animals)).toBe(false);

    // And the skip is the *only* asymmetry: every other pair is mutual, so the
    // animals' one-way hatred cannot have broken anything that was already true.
    const asymmetric: string[] = [];
    for (let a = 0; a < FactionID._COUNT; a++) {
      for (let b = a + 1; b < FactionID._COUNT; b++) {
        const fa = Models.factions.get(a);
        const fb = Models.factions.get(b);
        if (fa.isEnemyOf(fb) !== fb.isEnemyOf(fa)) asymmetric.push(`${fa.memberName}/${fb.memberName}`);
      }
    }
    // Eleven of them, one per other faction, and every one of them is the animal
    // half of the pair. A twelfth would mean the skip had eaten a relation that
    // was not the animals'.
    expect(asymmetric, "one-way enmity is the animals' and theirs alone").toEqual(
      [
        "CHAR employee/animal", "civilian/animal", "undead/animal",
        "soldier/animal", "biker/animal", "gangsta/animal",
        "police officer/animal", "blackOp/animal", "psychopath/animal",
        "survivor/animal", "feral/animal",
      ]
    );
  });

  it("is the reason the flee arm can fire in a real town", () => {
    // With `areEnemies` false in both directions, `filterEnemies` returns null
    // and arm 1 is dead code -- a rabbit that walked calmly past a survivor.
    const { actor } = world(37);
    const civ = spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(MID + 2, MID));
    expect(game.rules.areEnemies(actor, civ), "the AI asks exactly this").toBe(true);
  });
});
