import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Map as GameMap, Exit } from "@data/Map";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { BaseTownGenerator, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { Faction } from "@data/Faction";
import { Actor } from "@data/Actor";
import { Item } from "@data/Item";
import { Location } from "@data/Location";
import { DollPart } from "@data/Doll";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { Attack, AttackKind } from "@data/Attack";
import { Verb } from "@data/Verb";
import { DoorWindow, PowerGenerator } from "@engine/mapobjects/MapObjects";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemTracker } from "@engine/items/ItemTracker";
import { Rules } from "@engine/Rules";
import { LOS } from "@engine/LOS";
import { DiceRoller } from "@engine/DiceRoller";
import { ActionRechargeItemBattery } from "@engine/actions/Actions";
import { PlayerController } from "@data/PlayerController";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { Session } from "@engine/Session";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";

/**
 * Stage 2 of plans/BROWSER_PORT_PLAN §5.6c: the vanilla Alpha 10.1 defects that the
 * Still Alive fork fixed.
 *
 * Every test here was checked against the broken behaviour first — a mutation
 * that undoes the fix has to turn it red — because the failure this stage exists
 * to prevent is a fix that lands, looks right, and guards nothing. The previous
 * stage already produced one of those: a cancel test that pushed two arrows
 * instead of one, and so passed against the exact bug it named.
 *
 * `NOT_APPLICABLE` at the bottom records the four audit findings that do *not*
 * apply to this codebase, each with its reason, because "the audit said this was
 * a bug" and "this codebase has that bug" are different claims and only one of
 * them survives a rewrite.
 */

const tilesDB = new GameTiles();
const actorsDB = new GameActors();
const itemsDB = new GameItems();
const faction = new Faction("Testers", "tester");
// `Rules` takes the session dice roller; a fixed seed keeps these tests
// deterministic without needing a session.
const rules = new Rules(new DiceRoller(20250929));

function newMap(size = 20): GameMap {
  const map = new GameMap(1234, "test map", size, size);
  for (let x = 0; x < size; x++)
    for (let y = 0; y < size; y++)
      map.setTileModelAt(x, y, tilesDB.get(TileID.FLOOR_CONCRETE));
  return map;
}

function newActor(name = "Alice", map?: GameMap, pos = new Point(5, 5)): Actor {
  const a = new Actor(actorsDB.get(ActorID.MALE_CIVILIAN), faction, name);
  a.location = new Location(map ?? newMap(), pos);
  return a;
}

function newItem(id: ItemID): Item {
  return new Item(itemsDB.get(id));
}

function newLight(id: ItemID): ItemLight {
  return new ItemLight(itemsDB.get(id));
}

/**
 * `MapGenerator` is abstract, and the three placement helpers live on it, so a
 * concrete subclass is what exercises them. `BaseTownGenerator` is the one the
 * game itself uses.
 */
function newGenerator(): BaseTownGenerator {
  return new BaseTownGenerator({ rules } as never, new Parameters());
}

function junk(name = "junk"): MapObject {
  return new MapObject(name, "test", MapObjectBreak.BREAKABLE, undefined, 10);
}

// ── 1. Furniture must not land on an exit or stairway ──────────────────────

describe("MapGenerator does not seal a room with its own furniture", () => {
  const EXIT_AT = new Point(7, 7);
  let map: GameMap;

  beforeEach(() => {
    map = newMap();
    map.addExit(EXIT_AT, new Exit(newMap(), new Point(1, 1)));
  });

  it("mapObjectPlace skips an exit tile", () => {
    // The guard tested only `getMapObjectAt`, so a shelf, a bed or a junk pile
    // could occupy a doorway and seal the two rooms it joined. The police
    // station's offices and jails level are joined by exactly such a tile, and so
    // is every house basement and the sewers maintenance ladder.
    newGenerator().mapObjectPlace(map, EXIT_AT.x, EXIT_AT.y, junk("a shelf"));
    expect(map.getMapObjectAt(EXIT_AT.x, EXIT_AT.y)).toBeNull();
  });

  it("mapObjectFill skips exit tiles inside the rect", () => {
    newGenerator().mapObjectFill(map, new Rect(5, 5, 5, 5), () => junk());
    // The neighbours *are* placed, so this is not passing because the fill did
    // nothing.
    expect(map.getMapObjectAt(5, 5)).not.toBeNull();
    expect(map.getMapObjectAt(9, 9)).not.toBeNull();
    expect(map.getMapObjectAt(EXIT_AT.x, EXIT_AT.y)).toBeNull();
  });

  it("mapObjectPlaceInGoodPosition never offers an exit tile", () => {
    // This is the one that matters: the predicate decides where an object may
    // land, so an exit in the candidate list means a random roll can pick it.
    newGenerator().mapObjectPlaceInGoodPosition(
      map,
      new Rect(6, 6, 3, 3),
      () => true,
      { roll: () => 0 } as never,
      () => junk(),
    );
    expect(map.getMapObjectAt(EXIT_AT.x, EXIT_AT.y)).toBeNull();
  });
});

// ── 2. World generation without a CHAR office must not kill the game ─────────

describe("CHAR underground placement", () => {
  it("returns null for a world with no business district, rather than throwing", async () => {
    // The C# answered "no business districts with offices" by throwing out of a
    // factory whose only caller had an unreachable catch above it, so the player
    // got a dead game and nothing in the log. The office sits behind a
    // RollChance, so a quarter with none in it is a legal roll rather than a
    // corrupt state. `StartNewGame` now retries on a fresh seed, bounded at 12
    // attempts, and throws only when that bound is hit.
    const runner = new HeadlessRunner(0, new NullRogueUI());
    await runner.rogueGame.LoadData();
    const game = runner.rogueGame as unknown as {
      CreateUniqueMap_CHARUndegroundFacility(w: unknown): unknown;
    };
    const world = { size: 1, getDistrict: () => ({ entryMap: null }) };
    expect(game.CreateUniqueMap_CHARUndegroundFacility(world)).toBeNull();
  });
});

// ── 3 and 4. Every registered unique actor must be `isUnique` ───────────────

describe("unique actors can lose their invincibility", () => {
  let session: Session;

  beforeAll(async () => {
    // One real world, because both bugs are "this spawner forgot a flag" and a
    // hand-made actor would not exercise the spawner at all.
    const runner = new HeadlessRunner(31337, new NullRogueUI());
    await runner.rogueGame.LoadData();
    await runner.run({ worldSize: 1, maxTurns: 2, isUndead: false, bot: true });
    session = Session.get();
  }, 180_000);

  it("every unique actor in the session is flagged isUnique", () => {
    // The general invariant, because it is what catches the *next* spawner that
    // forgets. Worldgen sets `isInvincible = true` on every entry in
    // `uniqueActors`; the first-sighting check in `HandlePlayerActor` clears it
    // only `if (other.isUnique)`. An entry with an actor but no flag is therefore
    // permanently invincible, and its theme music never plays either.
    const offenders = session.uniqueActors
      .toArray()
      .filter((u) => u.theActor != null && !u.theActor.isUnique)
      .map((u) => u.theActor!.name);
    expect(
      offenders,
      `registered as unique but not flagged, so permanently invincible:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("The Sewers Thing is unique", () => {
    expect(session.uniqueActors.theSewersThing.theActor!.isUnique).toBe(true);
  });

  it("The Prisoner Who Should Not Be is unique", () => {
    // The one actor the player is guaranteed to meet, and the one dialogue scene
    // that is mandatory to finish. Unkillable, in every run, in vanilla.
    expect(session.uniqueActors.policeStationPrisoner.theActor!.isUnique).toBe(true);
  });
});

// ── 7. Battery recharge prefers the weapon, and skips a full battery ────────

describe("battery recharge at a power generator", () => {
  let map: GameMap;
  let actor: Actor;

  beforeEach(() => {
    map = newMap();
    actor = newActor("npc", map);
  });

  /** A generator the actor stands next to, switched on. */
  function generatorBeside(): PowerGenerator {
    const gen = new PowerGenerator("a power generator", "test", "test2");
    gen.setState(PowerGenerator.STATE_ON);
    map.placeMapObject(gen, actor.location.position.add(new Point(1, 0)));
    return gen;
  }

  it("prefers the right hand when both hands hold a depleted battery", () => {
    // A light or a tracker loses charge every turn, so "the first rechargable
    // item found" is nearly always the depleted light in the left hand: the actor
    // recharges the torch, walks away with it empty again, and the tracker in the
    // right hand is never looked at.
    //
    // **Light against tracker, not light against a gun.** `isItemBatteryPowered`
    // is `ItemLight || ItemTracker`, so a rifle is not a candidate at all and a
    // light-versus-rifle test would pass whichever order the code used — it would
    // be testing nothing. Two battery items is the only shape in which the hand
    // order is observable with the shipped data.
    const light = newLight(ItemID.LIGHT_FLASHLIGHT);
    // Constructed through `ItemTracker`, not `newItem`: `isItemBatteryPowered` is
    // `instanceof ItemLight || instanceof ItemTracker`, so a bare `Item` holding a
    // tracker model is not battery powered and the test would compare two items
    // the rule does not consider at all.
    const tracker = new ItemTracker(itemsDB.get(ItemID.TRACKER_CELL_PHONE));
    light.batteries = 0;
    tracker.batteries = 0;
    actor.inventory!.addAll(light);
    actor.inventory!.addAll(tracker);
    light.equippedPart = DollPart.LEFT_HAND;
    tracker.equippedPart = DollPart.RIGHT_HAND;
    const gen = generatorBeside();

    const result = rules.isBumpableFor(
      actor,
      { rules } as never,
      map,
      gen.location.position.x,
      gen.location.position.y,
    );
    const action = (result as { action: unknown }).action;
    expect(action).toBeInstanceOf(ActionRechargeItemBattery);
    // `item` is private on the action; read it structurally rather than adding a
    // public accessor for a test.
    expect((action as unknown as { item: Item }).item).toBe(tracker);
  });

  it("will not recharge a battery that is already full", () => {
    // Without this the AI recharges a full light forever: the light is the first
    // rechargable item it finds and never drains, so the walk to the generator
    // and the walk back are each a turn spent on a no-op.
    const light = newLight(ItemID.LIGHT_BIG_FLASHLIGHT);
    actor.inventory!.addAll(light);
    light.equippedPart = DollPart.LEFT_HAND;
    expect(rules.isItemBatteryFull(light)).toBe(true);
    expect(rules.canActorRechargeItemBattery(actor, light).ok).toBe(false);
  });
});

// ── 8. A range of 1 is the efficient range, not zero ───────────────────────

describe("Attack.efficientRange", () => {
  const verb = new Verb("shoot", "shoots");
  const ranged = (range: number, hit = 60) =>
    Attack.rangedAttack(AttackKind.FIREARM, verb, hit, 0, 0, 20, range);

  it("is 1 for a range of 1", () => {
    // `floor(1/2)` is 0, and the caller computes the distance penalty as
    // `(efficientRange - distance) / range`, doubling it past the efficient
    // range. The next test is what that does to the hit value.
    expect(ranged(1).efficientRange).toBe(1);
  });

  it("leaves every other range alone", () => {
    expect(ranged(3).efficientRange).toBe(1);
    expect(ranged(5).efficientRange).toBe(2);
    expect(ranged(6).efficientRange).toBe(3);
    expect(ranged(8).efficientRange).toBe(4);
  });

  it("a range-1 attack at distance 1 does not go negative", () => {
    // The consequence, not just the field. With efficientRange 0: the distance
    // is not equal to it, the scale is `(0 - 1) / 1 = -1`, it is beyond the
    // efficient range so the scale doubles to -2, and `distanceMod = 1 + (-2) = -1`
    // multiplies the whole hit value. A negative hit chance is not a weak weapon,
    // it is a broken one.
    const attack = rules.actorRangedAttack(newActor("shooter"), ranged(1, 70), 1, null);
    expect(attack.hitValue).toBeGreaterThan(0);
  });
});

// ── 13. `isForbiddenToAI` is a rule, not a preference ──────────────────────

describe("items forbidden to AI", () => {
  it("an NPC cannot pick one up, equip it, or use it", () => {
    // The flag was only honoured in the AI's *rating*, which is a preference: a
    // gift, a container it was told to loot, or a trade it agreed to all reach
    // the item by a path that never consulted it.
    const npc = newActor("npc");
    const it = newItem(ItemID.LIGHT_FLASHLIGHT);
    it.isForbiddenToAI = true;
    npc.inventory!.addAll(it);
    it.equippedPart = DollPart.RIGHT_HAND;

    expect(rules.canActorGetItem(npc, it).ok).toBe(false);
    expect(rules.canActorEquipItem(npc, it).ok).toBe(false);
    expect(rules.canActorUseItem(npc, it).ok).toBe(false);
  });

  it("the player is exempt, which is the point of the flag", () => {
    const player = newActor("player");
    player.controller = new PlayerController();
    const it = newItem(ItemID.LIGHT_FLASHLIGHT);
    it.isForbiddenToAI = true;
    player.inventory!.addAll(it);
    expect(rules.canActorGetItem(player, it).ok).toBe(true);
  });
});

// ── 12. The AI does not secure a perimeter it cannot see out of ─────────────

describe("behaviorSecurePerimeter", () => {
  /** Reaches the protected behaviour, which a test cannot call directly. */
  class ProbeAI extends CivilianAI {
    probeSecurePerimeter(game: unknown, fov: Set<number>): unknown {
      return this.behaviorSecurePerimeter(game as never, fov as never);
    }
  }

  /** `ActorController` is constructed empty and then handed its actor. */
  function aiFor(actor: Actor): ProbeAI {
    const ai = new ProbeAI();
    ai.takeControl(actor);
    return ai;
  }

  /**
   * One setup, run twice: an open door in view, on a tile that is either
   * outdoors or indoors. That shape is the point — a lone "returns null when
   * indoors" test is also satisfied by a `return null` at the top of the method,
   * which would silently delete the behaviour entirely.
   */
  function probeSecurePerimeter(indoors: boolean): unknown {
    const map = newMap();
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 20; y++) map.getTileAt(x, y)!.isInside = indoors;
    const actor = newActor("npc", map);
    const door = new DoorWindow("a door", "closed", "open", "broken", 40);
    door.setState(DoorWindow.STATE_OPEN);
    map.placeMapObject(door, actor.location.position.add(new Point(1, 0)));
    const ai = aiFor(actor);
    const p = actor.location.position;
    // `fovKey` returns the shared numeric coord key, not "x,y" — the whole FOV is
    // keyed by it, and a string set silently matches no tiles at all.
    const fov = new Set([LOS.fovKey(p.x, p.y), LOS.fovKey(p.x + 1, p.y)]);
    return ai.probeSecurePerimeter({ rules }, fov);
  }

  it("closes an open door when the actor is outdoors", () => {
    expect(probeSecurePerimeter(false)).not.toBeNull();
  });

  it("gives up when the actor is indoors", () => {
    // On a level with no sky — a basement, the sewers, the police station jails,
    // the CHAR underground — there is nothing to secure against, so the behaviour
    // only ping-pongs one door: the level's AI fights over a doorway and never
    // does anything else. Reported as an infinite loop in the animal shelter
    // kennels. `tile.isInside` is the same "outside" test the weather decay uses.
    expect(probeSecurePerimeter(true)).toBeNull();
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Audit findings that do not apply to this codebase, recorded so they are not
 * re-audited. Each was read, not assumed.
 *
 * - "The AI throws on an unhandled item type when rating a trade" — the port
 *   replaced the C#'s throwing switch with a 3x3 `TRADE_RATING_MATRIX`
 *   (`BaseAI.TRADE_RATING_MATRIX`), so there is nothing left to throw.
 * - "Repairing a door with one wooden plank duplicates planks" — door repair does
 *   not exist here. It is a Still Alive *feature* ("non-metallic doors can now be
 *   repaired"), so the duplication was a fork bug in fork code. Revisit in Stage 5.
 * - "Fires travel through walls" and "exploding fuel cans destroy walls" — there
 *   are no tile fires (fire lives on `MapObject.fireState` only) and no fuel
 *   cans. Both are Still Alive content.
 * - "Corpses stay on fire forever" — `Actor` has no `isOnFire` at all in this
 *   port, so there is no state to get stuck. A Still Alive fix to its own
 *   `Actor.IS_ONFIRE`.
 */
const NOT_APPLICABLE = ["trade rating throws", "plank duplication", "tile fires", "corpse fire"];
describe("audit findings that do not apply here", () => {
  it("are recorded, so they are not re-audited", () => {
    expect(NOT_APPLICABLE).toHaveLength(4);
  });
});
