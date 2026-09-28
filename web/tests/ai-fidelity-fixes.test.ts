import { describe, it, expect, beforeAll } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { SimRatio } from "@engine/GameOptions";
import { Session } from "@engine/Session";
import { SkillID } from "@gameplay/Skills";
import { Point } from "@engine/Point";
import { Models } from "@data/Models";
import { Map as GameMap, Exit } from "@data/Map";
import { Location } from "@data/Location";
import { Actor } from "@data/Actor";
import { ActorCourage } from "@data/ActorDirective";
import { ItemTrap } from "@engine/items/ItemTrap";
import { ItemID } from "@gameplay/GameItems";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { RouteFinder, SpecialActions } from "@gameplay/ai/RouteFinder";
import { SoldierAI } from "@gameplay/ai/SoldierAI";
import { CivilianAI } from "@gameplay/ai/CivilianAI";
import { MemorizedSensor, Percept, Sensor } from "@engine/ai/Sensors";
import { TileID } from "@gameplay/GameTiles";
import { FactionID } from "@gameplay/GameFactions";
import { ActorID } from "@gameplay/GameActors";

/**
 * Regression tests for the NPC-AI fidelity fixes.
 *
 * Each case corresponds to a divergence from `src/Gameplay/AI/`, and the
 * expectation comes from the C# rather than from the port, per the porting rule
 * at the top of BROWSER_PORT_PLAN. Where a fix was a data-structure swap rather
 * than a transcription (`RouteFinder`'s frontier) the test is *differential*,
 * against a reference implementation of the original algorithm — a hand-written
 * expected value would only restate whatever the new code happens to do.
 *
 * The one rule the port plan learned the hard way applies here: do not assert
 * what the port does, assert what the original was specified to do, or the test
 * passes forever and proves nothing.
 */

const SEED = 4242;
let game: RogueGame;
let map: GameMap;
let floorTile: ReturnType<typeof Models.tiles.get>;
let wallTile: ReturnType<typeof Models.tiles.get>;

beforeAll(async () => {
  // Before constructing the game: `RogueGame`'s constructor builds `Rules` from
  // the session seed, so a seed applied later would only half-pin the run.
  Session.useSeed(SEED);
  game = new RogueGame(new NullRogueUI(), new NullMusicManager());
  await game.LoadData();
  const opts = RogueGame.options;
  opts.citySize = 1;
  opts.simulateDistricts = SimRatio.OFF;
  opts.isAnimDelayOn = false;
  opts.isAdvisorEnabled = false;
  game.session.gameMode = Session.get().gameMode;
  game.m_CharGen.isUndead = false;
  game.m_CharGen.isMale = true;
  game.m_CharGen.startingSkill = SkillID.AGILE;
  await game.StartNewGame();
  map = game.player!.location.map!;
  floorTile = Models.tiles.get(TileID.FLOOR_ASPHALT);
  wallTile = Models.tiles.get(TileID.WALL_BRICK);
}, 120_000);

/** Open floor, nothing on it, midday. */
function scenario(): GameMap {
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) map.setTileModelAt(x, y, floorTile!);
  }
  for (const a of [...map.actors]) map.removeActor(a);
  for (const o of [...map.mapObjects]) map.removeMapObject(o);
  for (const s of [...map.scents]) map.removeScent(s);
  for (const inv of [...map.groundInventories]) {
    const pos = map.getGroundInventoryPosition(inv);
    if (pos) map.removeItemsAtIfEmpty(pos);
  }
  // Midday, so a living AI is not asleep.
  map.localTime.turnCounter = 12 * 30;
  return map;
}

function spawn(modelId: ActorID, faction: FactionID, at: Point): Actor {
  const actor = Models.actors.get(modelId).createAnonymous(game.gameFactions.get(faction), 0);
  map.placeActor(actor, at);
  return actor;
}

/** A closed door, which is what `isBumpableFor` opens on a bump. */
function closedDoor(): DoorWindow {
  return new DoorWindow("door", "door_closed", "door_open", "door_broken", DoorWindow.BASE_HITPOINTS);
}

/** `BaseAI` is abstract and its members are `protected`; tests reach them the
 *  way the rest of the suite does, through a structural cast. */
type AnyAI = Record<string, (...args: never[]) => unknown>;

function aiFor(actor: Actor, ctor: typeof CivilianAI = CivilianAI): AnyAI {
  const ai = new ctor() as unknown as AnyAI;
  (ai as unknown as { takeControl(a: Actor): void }).takeControl(actor);
  return ai;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. RouteFinder: a closed door is passable when DOORS is allowed
// ────────────────────────────────────────────────────────────────────────────

describe("RouteFinder reaches through doors", () => {
  /**
   * The bug: `canMoveIn` tested a `MapObject.isDoor` property that does not
   * exist, so the entire `SpecialActions.DOORS` block was unreachable and every
   * closed door counted as a wall. The C# is `mobj as DoorWindow`
   * (`RouteFinder.cs:263`).
   *
   * The consequence was not that NPCs bumped into doors — `isBumpableFor` opens
   * those fine. It was that `behaviorGoGetInterestingItems` discards any stack it
   * cannot reach, so **loot inside a building with a closed door was invisible
   * to the whole town**, permanently.
   */
  /**
   * A full-height wall at x = 14 that really separates the map, optionally with
   * a single door-sized gap. It has to span the whole map: a short stub can be
   * walked around, and a test that passes because the route went *the other way*
   * is worse than no test.
   */
  function wallAtX14(gapY: number | null, doorAtY?: number): void {
    for (let y = 0; y < map.height; y++) {
      if (y === gapY) continue;
      map.setTileModelAt(14, y, wallTile!);
    }
    if (gapY !== null && doorAtY !== undefined) map.placeMapObject(closedDoor(), new Point(14, doorAtY));
  }

  it("routes to a tile behind a single closed door", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    wallAtX14(10, 10);

    const dest = new Point(17, 10);
    const rf = new RouteFinder();
    rf.actor = actor;
    rf.allowedActions = SpecialActions.DOORS;
    expect(
      rf.canReachSimple(game, dest, game.rules.gridDistance(actor.location.position, dest), game.rules.gridDistance),
      "an openable door must not break the route",
    ).toBe(true);
  });

  it("still refuses a route blocked by a solid wall", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    wallAtX14(null);

    const dest = new Point(17, 10);
    const rf = new RouteFinder();
    rf.actor = actor;
    rf.allowedActions = SpecialActions.DOORS;
    expect(
      rf.canReachSimple(game, dest, game.rules.gridDistance(actor.location.position, dest), game.rules.gridDistance),
    ).toBe(false);
  });

  it("does not walk through a door when DOORS is not allowed", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    wallAtX14(10, 10);

    const dest = new Point(17, 10);
    const rf = new RouteFinder();
    rf.actor = actor;
    rf.allowedActions = SpecialActions.NONE;
    expect(
      rf.canReachSimple(game, dest, game.rules.gridDistance(actor.location.position, dest), game.rules.gridDistance),
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. RouteFinder: the new frontier is behaviourally identical to the old one
// ────────────────────────────────────────────────────────────────────────────

/**
 * The frontier was swapped from a distance-sorted array with an O(V) rescan per
 * expansion to a binary min-heap. That is only a safe swap if the *order* is
 * preserved, and it very nearly was not.
 *
 * The C# resumes scanning from the head of its list after every expansion
 * (`RouteFinder.cs:143-162`), so it does eventually come back around to a node
 * with a **higher** `distToGoal` once the lower ones are spent. A single
 * ascending pass over distance buckets is simpler, cheaper still, and wrong: it
 * expands strictly more tiles, because nodes discovered by a late parent are
 * never looked at. That was the trap in the first attempt at this change.
 *
 * So the expectation is a faithful transcription of the original loop
 * (`RouteFinder.cs:138-198`), run over deterministic pseudo-random mazes, and it
 * deliberately keeps the original's two quirks: scan for the *first unvisited*
 * node from the head, and skip a neighbour whose node already exists and is
 * visited — which loses tiles reachable only through a late parent. Losing
 * those is the original's behaviour, so it has to be preserved.
 */
function referenceCanReachSimple(
  actor: Actor,
  dest: Point,
  maxDist: number,
  allowedActions: number,
): boolean {
  const start = actor.location.position;
  const distanceFn = game.rules.gridDistance;
  const adjToDestIsGoal = (allowedActions & SpecialActions.ADJ_TO_DEST_IS_GOAL) !== 0;

  interface RefNode { pos: Point; dist: number; visited: boolean }
  const nodes: RefNode[] = [];
  const insert = (n: RefNode): void => {
    const idx = nodes.findIndex(x => x.dist > n.dist);
    if (idx === -1) nodes.push(n);
    else nodes.splice(idx, 0, n);
  };
  const canMoveIn = (pos: Point): boolean => {
    if (map.isWalkablePoint(pos)) return true;
    const mobj = map.getMapObjectAtPoint(pos);
    if (!mobj) return false;
    if ((allowedActions & SpecialActions.DOORS) && mobj instanceof DoorWindow) return true;
    return false;
  };
  const compass: Point[] = [
    new Point(0, -1), new Point(1, -1), new Point(1, 0), new Point(1, 1),
    new Point(0, 1), new Point(-1, 1), new Point(-1, 0), new Point(-1, -1),
  ];

  insert({ pos: start, dist: distanceFn(start, dest), visited: false });
  for (;;) {
    let current: RefNode | undefined;
    for (const n of nodes) {
      if (n.pos.equals(dest)) return true;
      if (adjToDestIsGoal && distanceFn(n.pos, dest) === 1) return true;
      if (!n.visited) { current = n; break; }
    }
    if (!current) return false;

    current.visited = true;
    const curDist = distanceFn(current.pos, dest);
    for (const step of compass) {
      const adj = new Point(current.pos.x + step.x, current.pos.y + step.y);
      if (!map.isInBoundsPoint(adj)) continue;
      const adjDist = distanceFn(adj, dest);
      if (adjDist >= curDist || adjDist > maxDist) continue;
      if (!canMoveIn(adj)) continue;
      if (!nodes.some(n => n.pos.equals(adj))) insert({ pos: adj, dist: adjDist, visited: false });
    }
  }
}

describe("RouteFinder frontier is behaviour-preserving", () => {
  it("agrees with the original algorithm over deterministic mazes", () => {
    for (let mask = 0; mask < 8; mask++) {
      scenario();
      // Scattered blockers rather than Math.random, so a failure reproduces.
      for (let x = 4; x < map.width; x++) {
        for (let y = 4; y < map.height; y++) {
          if ((x * 7 + y * 13 + mask * 5) % 11 === 0) map.setTileModelAt(x, y, wallTile!);
        }
      }
      // A door in the mix, so the DOORS path is exercised too.
      map.placeMapObject(closedDoor(), new Point(9, 9));

      const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(4, 4));
      const rf = new RouteFinder();
      rf.actor = actor;

      let checked = 0;
      for (const allowed of [SpecialActions.DOORS, SpecialActions.DOORS | SpecialActions.ADJ_TO_DEST_IS_GOAL]) {
        rf.allowedActions = allowed;
        for (let dx = -8; dx <= 8; dx += 2) {
          for (let dy = -8; dy <= 8; dy += 2) {
            const dest = new Point(4 + dx, 4 + dy);
            if (!map.isInBoundsPoint(dest)) continue;
            const maxDist = game.rules.gridDistance(actor.location.position, dest);
            const expected = referenceCanReachSimple(actor, dest, maxDist, allowed);
            const actual = rf.canReachSimple(game, dest, maxDist, game.rules.gridDistance);
            expect(actual, `mask ${mask}, allowed ${allowed}, dest ${dest.x},${dest.y}`).toBe(expected);
            checked++;
          }
        }
      }
      // A guard on the guard: if the sweep ever degenerates to a handful of
      // cases, the differential assertion above would still pass while proving
      // nothing.
      expect(checked, "the sweep actually exercised the search").toBeGreaterThan(50);
    }
  }, 60_000);
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Intelligent NPCs avoid damaging traps
// ────────────────────────────────────────────────────────────────────────────

describe("trap avoidance in behaviorIntelligentBumpToward", () => {
  /**
   * C# `BaseAI.cs:811-823` adds `MOVE_INTO_TRAPS_PENALTY` to a candidate tile's
   * cost and refuses outright when the trap would kill, unless the actor is
   * starving or courageous. The port had dropped the whole block; the two
   * constants it used (`MOVE_INTO_TRAPS_PENALTY`, `ComputeTrapsMaxDamageForMe`)
   * were left behind with no callers, which is what identified the omission.
   */
  const bearTrap = (): ItemTrap => new ItemTrap(Models.items.get(ItemID.TRAP_BEAR_TRAP));
  const TRAP_LINE = [new Point(11, 10), new Point(12, 10), new Point(13, 10)];

  /** Tiles the AI would step into, over many rolls. */
  function chosenSteps(ai: AnyAI, goal: Point): Point[] {
    const bump = ai.behaviorIntelligentBumpToward as unknown as
      (g: RogueGame, goal: Point, breakOk: boolean, pushOk: boolean) => unknown;
    const steps: Point[] = [];
    for (let i = 0; i < 60; i++) {
      const action = bump.call(ai, game, goal, true, false) as { newLocation?: Location } | null;
      const p = action?.newLocation?.position;
      if (p) steps.push(p);
    }
    return steps;
  }

  it("steps around a bear trap when neither starving nor courageous", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    for (const p of TRAP_LINE) map.getOrCreateItemsAt(p).addAll(bearTrap());
    const ai = aiFor(actor);

    const steps = chosenSteps(ai, new Point(15, 10));
    expect(steps.length, "the AI actually moved").toBeGreaterThan(0);
    for (const step of steps) {
      expect(
        TRAP_LINE.some(t => t.equals(step)),
        `stepped into the trap at ${step.x},${step.y}`,
      ).toBe(false);
    }
  });

  it("walks over the bear trap when courageous, as the C# allows", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    for (const p of TRAP_LINE) map.getOrCreateItemsAt(p).addAll(bearTrap());
    const ai = aiFor(actor);
    (ai as unknown as { directives: { courage: ActorCourage } }).directives.courage = ActorCourage.COURAGEOUS;

    const steps = chosenSteps(ai, new Point(15, 10));
    expect(steps.length, "the AI actually moved").toBeGreaterThan(0);
    expect(
      steps.some(step => TRAP_LINE.some(t => t.equals(step))),
      "a courageous actor ignores the trap penalty",
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. isSoldier and hasLeader
// ────────────────────────────────────────────────────────────────────────────

describe("isSoldier", () => {
  /**
   * C# is `actor.Controller is SoldierAI` (`BaseAI.cs:5808`). The port tested
   * `actor.faction.id === FactionID.TheArmy`, which is a different set:
   * `GameActors` maps *both* ARMY_NATIONAL_GUARD and BLACKOPS_MAN to
   * `SoldierAI`, but the BlackOps are faction `TheBlackOps`. So civilians never
   * relayed BlackOps sightings, which is the whole point of `CivilianAI` rule 25.
   */
  it("counts a BlackOps soldier, whose faction is not TheArmy", () => {
    scenario();
    const blackops = spawn(ActorID.BLACKOPS_MAN, FactionID.TheBlackOps, new Point(10, 10));
    const guard = spawn(ActorID.ARMY_NATIONAL_GUARD, FactionID.TheArmy, new Point(11, 10));
    const civ = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(12, 10));

    const isSoldier = aiFor(civ).isSoldier as unknown as (a: Actor | null) => boolean;
    expect(blackops.faction.id, "the premise: BlackOps are not faction TheArmy").not.toBe(FactionID.TheArmy);
    expect(isSoldier(blackops), "BlackOps run SoldierAI, so they are soldiers").toBe(true);
    expect(isSoldier(guard)).toBe(true);
    expect(isSoldier(civ)).toBe(false);
    expect(isSoldier(null)).toBe(false);
  });

  it("leaves the discriminant opt-in", () => {
    expect(new SoldierAI().isSoldierAI).toBe(true);
    expect(new CivilianAI().isSoldierAI).toBe(false);
  });
});

describe("Actor.hasLeader", () => {
  it("is false once the leader is dead", () => {
    scenario();
    const leader = spawn(ActorID.MALE_CIVILIAN, FactionID.TheSurvivors, new Point(10, 10));
    const follower = spawn(ActorID.FEMALE_CIVILIAN, FactionID.TheSurvivors, new Point(11, 10));
    follower.leader = leader;
    expect(follower.hasLeader).toBe(true);

    leader.isDead = true;
    expect(follower.hasLeader, "C# Actor.cs:399 is `m_Leader != null && !m_Leader.IsDead`").toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. MemorizedSensor must not hand out its internal array
// ────────────────────────────────────────────────────────────────────────────

describe("MemorizedSensor.sense", () => {
  it("returns a copy, so a caller pruning in place cannot corrupt the memory", () => {
    scenario();
    const actor = spawn(ActorID.MALE_CIVILIAN, FactionID.TheCivilians, new Point(10, 10));
    const loc = new Location(map, new Point(10, 10));
    class FixedSensor extends Sensor {
      sense(): Percept[] { return [new Percept("thing", map.localTime.turnCounter, loc)]; }
    }
    const sensor = new MemorizedSensor(new FixedSensor(), 20);

    const first = sensor.sense(game, actor);
    expect(first).toHaveLength(1);
    // Exactly what `BaseAI.filterOutUnreachablePercepts` does to the list it is
    // handed, and exactly what GangAI/CHARGuardAI/SoldierAI would hand it.
    first.splice(0, 1);

    const second = sensor.sense(game, actor);
    expect(second, "the sensor forgot nothing").toHaveLength(1);
    expect(second[0].percepted).toBe("thing");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Map's positional key
// ────────────────────────────────────────────────────────────────────────────

describe("Map positional key", () => {
  it("still finds a border-ring exit, which sits outside the tile grid", () => {
    scenario();
    const pos = new Point(map.width, 12);
    const exit = new Exit(map, new Point(3, 3));
    map.addExit(pos, exit);
    expect(map.getExitAt(pos), "x === width is out of bounds but legal for an exit").toBe(exit);
    expect(map.getExitAtXY(pos.x, pos.y)).toBe(exit);
  });

  it("gives every tile on and just past the border its own key", () => {
    scenario();
    for (const p of [
      new Point(0, 0), new Point(1, 0), new Point(0, 1),
      new Point(map.width - 1, 0), new Point(0, map.height - 1),
      new Point(map.width - 1, map.height - 1),
      new Point(map.width, 0), new Point(0, map.height),
      new Point(map.width, map.height),
    ]) {
      const exit = new Exit(map, new Point(1, 1));
      map.addExit(p, exit);
      expect(map.getExitAt(p), `exit at ${p.x},${p.y} not found`).toBe(exit);
    }
  });
});
