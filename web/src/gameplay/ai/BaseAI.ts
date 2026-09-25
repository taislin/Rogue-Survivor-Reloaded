/**
 * BaseAI abstract class.
 * Ported from src/Gameplay/AI/BaseAI.cs
 *
 * Implements core AI decision-making:
 * - Filtering sensors/percepts
 * - Movement and bump behaviors (stupid, intelligent, wander, explore)
 * - Combat (melee, charge, fire, flee)
 * - Corpse eating, scent tracking, exit usage, item handling
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import { ActorDirective } from '@data/ActorDirective';
import type { ActorModel } from '@data/ActorModel';
import type { ActorOrder } from '@data/ActorOrder';
import { AIController } from '@data/AIController';
import type { Map as GameMap } from '@data/Map';
import type { Item } from '@data/Item';
import { Location } from '@data/Location';
import type { MapObject } from '@data/MapObject';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import {
  ActionBashDoor,
  ActionBreak,
  ActionBump,
  ActionEatCorpse,
  ActionMeleeAttack,
  ActionMoveStep,
  ActionOpenDoor,
  ActionPush,
  ActionSay,
  ActionShout,
  ActionSleep,
  ActionSwitchPlace,
  ActionUseExit,
  ActionWait,
} from '@engine/actions/Actions';
import type { ActorAction } from '@data/ActorAction';
import { Percept } from '@engine/ai/Sensors';
import { ExplorationData } from './ExplorationData';
import { AIScent } from './GameplaySensors';
import { RouteFinder } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class ChoiceEval<T> {
  constructor(
    public readonly choice: T,
    public readonly value: number
  ) {}

  toString(): string {
    return `ChoiceEval(${String(this.choice)}; ${this.value.toFixed(2)})`;
  }
}

export const enum UseExitFlags {
  NONE = 0,
  BREAK_BLOCKING_OBJECTS = 1 << 0,
  ATTACK_BLOCKING_ENEMIES = 1 << 1,
  DONT_BACKTRACK = 1 << 2,
}

export abstract class BaseAI extends AIController {
  // Constants
  protected static readonly FLEE_THROUGH_EXIT_CHANCE = 90;
  protected static readonly EMOTE_GRAB_ITEM_CHANCE = 30;
  protected static readonly EMOTE_FLEE_CHANCE = 30;
  protected static readonly EMOTE_FLEE_TRAPPED_CHANCE = 50;
  protected static readonly EMOTE_CHARGE_CHANCE = 30;
  protected static readonly MOVE_DISTANCE_PENALTY = 0.42;
  protected static readonly MOVE_INTO_TRAPS_PENALTY = 1;
  protected static readonly IN_LEADER_LOF_SAFETY_PENALTY = 1;

  // Fields
  protected m_Order: ActorOrder | null = null;
  protected m_Directive: ActorDirective = new ActorDirective();
  protected m_prevLocation: Location = new Location();
  protected m_TabooItems: Item[] | null = null;
  protected m_TabooTiles: Point[] | null = null;
  protected m_TabooTrades: Actor[] | null = null;
  protected m_RouteFinder: RouteFinder | null = null;
  protected m_ReservedEquipmentSlots: number = 0;

  get order(): ActorOrder | null {
    return this.m_Order;
  }

  get directives(): ActorDirective {
    return this.m_Directive;
  }

  set directives(value: ActorDirective) {
    this.m_Directive = value;
  }

  get prevLocation(): Location {
    return this.m_prevLocation;
  }

  get controlledActor(): Actor {
    return this.actor!;
  }

  override takeControl(actor: Actor): void {
    super.takeControl(actor);
    this.createSensors();
    this.m_TabooItems = null;
    this.m_TabooTiles = null;
    this.m_TabooTrades = null;
  }

  override setOrder(newOrder: ActorOrder | null): void {
    this.m_Order = newOrder;
  }

  override getAction(game: Game): ActorAction {
    const percepts = this.updateSensors(game);

    if (!this.m_prevLocation.map) {
      this.m_prevLocation = this.controlledActor.location;
    }
    this.controlledActor.targetActor = null;
    const bestAction = this.selectAction(game, percepts);
    this.m_prevLocation = this.controlledActor.location;

    if (!bestAction) {
      this.controlledActor.activity = Activity.IDLE;
      return new ActionWait(this.controlledActor, game);
    }
    return bestAction;
  }

  protected abstract createSensors(): void;
  protected abstract updateSensors(game: Game): Percept[];
  protected abstract selectAction(game: Game, percepts: Percept[]): ActorAction | null;

  // ── Filters ──────────────────────────────────────────────────────────────

  protected filterSameMap(_game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const map = this.controlledActor.location.map;
    const list = percepts.filter(p => p.location.map === map);
    return list.length > 0 ? list : null;
  }

  protected filterEnemies(game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list: Percept[] = [];
    for (const p of percepts) {
      const other = p.percepted as Actor;
      if (other && other !== this.controlledActor && game.rules.areEnemies(this.controlledActor, other)) {
        list.push(p);
      }
    }
    return list.length > 0 ? list : null;
  }

  protected filterNonEnemies(game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list: Percept[] = [];
    for (const p of percepts) {
      const other = p.percepted as Actor;
      if (other && other !== this.controlledActor && !game.rules.areEnemies(this.controlledActor, other)) {
        list.push(p);
      }
    }
    return list.length > 0 ? list : null;
  }

  protected filterCurrent(_game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const turn = this.controlledActor.location.map?.localTime?.turnCounter ?? 0;
    const list = percepts.filter(p => p.turn === turn);
    return list.length > 0 ? list : null;
  }

  protected filterNearest(game: Game, percepts: Percept[] | null): Percept | null {
    if (!percepts || percepts.length === 0) return null;
    let best = percepts[0];
    let nearest = game.rules.stdDistance(this.controlledActor.location.position, percepts[0].location.position);
    for (let i = 1; i < percepts.length; i++) {
      const p = percepts[i];
      const dist = game.rules.stdDistance(this.controlledActor.location.position, p.location.position);
      if (dist < nearest) {
        best = p;
        nearest = dist;
      }
    }
    return best;
  }

  protected filterStrongestScent(_game: Game, scents: Percept[] | null): Percept | null {
    if (!scents || scents.length === 0) return null;
    let pBest: Percept | null = null;
    let bestStrength = -1;
    for (const p of scents) {
      const aiScent = p.percepted as AIScent;
      if (aiScent && (pBest === null || aiScent.strength > bestStrength)) {
        bestStrength = aiScent.strength;
        pBest = p;
      }
    }
    return pBest;
  }

  protected filterActorsModel(_game: Game, percepts: Percept[] | null, model: ActorModel): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list = percepts.filter(p => (p.percepted as Actor)?.model === model);
    return list.length > 0 ? list : null;
  }

  protected filterActors(_game: Game, percepts: Percept[] | null, predicateFn: (a: Actor) => boolean): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list = percepts.filter(p => {
      const a = p.percepted as Actor;
      return a && predicateFn(a);
    });
    return list.length > 0 ? list : null;
  }

  protected filterCorpses(_game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list = percepts.filter(p => Array.isArray(p.percepted));
    return list.length > 0 ? list : null;
  }

  protected filter(
    _game: Game,
    percepts: Percept[] | null,
    predicateFn: (p: Percept) => boolean
  ): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list = percepts.filter(predicateFn);
    return list.length > 0 ? list : null;
  }

  // ── Choice making ────────────────────────────────────────────────────────

  protected choose<T>(
    game: Game,
    listOfChoices: readonly T[],
    isChoiceValidFn: (c: T) => boolean,
    evalChoiceFn: (c: T) => number,
    isBetterEvalThanFn: (a: number, b: number) => boolean
  ): ChoiceEval<T> | null {
    if (listOfChoices.length === 0) return null;

    let hasValue = false;
    let bestValue = 0;
    const validChoices: ChoiceEval<T>[] = [];

    for (const choice of listOfChoices) {
      if (!isChoiceValidFn(choice)) continue;
      const val = evalChoiceFn(choice);
      if (Number.isNaN(val)) continue;
      validChoices.push(new ChoiceEval(choice, val));
      if (!hasValue || isBetterEvalThanFn(val, bestValue)) {
        hasValue = true;
        bestValue = val;
      }
    }

    if (validChoices.length === 0) return null;
    if (validChoices.length === 1) return validChoices[0];

    const candidates = validChoices.filter(c => c.value === bestValue);
    if (candidates.length === 0) return null;

    const idx = game.rules.roll(0, candidates.length);
    return candidates[idx];
  }

  protected chooseExtended<T, TData>(
    game: Game,
    listOfChoices: readonly T[],
    isChoiceValidFn: (c: T) => TData | null,
    evalChoiceFn: (c: T, data: TData) => number,
    isBetterEvalThanFn: (a: number, b: number) => boolean
  ): ChoiceEval<TData> | null {
    if (listOfChoices.length === 0) return null;

    let hasValue = false;
    let bestValue = 0;
    const validChoices: ChoiceEval<TData>[] = [];

    for (const choice of listOfChoices) {
      const data = isChoiceValidFn(choice);
      if (!data) continue;
      const val = evalChoiceFn(choice, data);
      if (Number.isNaN(val)) continue;
      validChoices.push(new ChoiceEval(data, val));
      if (!hasValue || isBetterEvalThanFn(val, bestValue)) {
        hasValue = true;
        bestValue = val;
      }
    }

    if (validChoices.length === 0) return null;
    if (validChoices.length === 1) return validChoices[0];

    const candidates = validChoices.filter(c => c.value === bestValue);
    if (candidates.length === 0) return null;

    const idx = game.rules.roll(0, candidates.length);
    return candidates[idx];
  }

  // ── Behaviors ────────────────────────────────────────────────────────────

  protected behaviorWander(
    game: Game,
    goodWanderLocFn: ((l: Location) => boolean) | null = null,
    exploration: ExplorationData | null = null
  ): ActorAction | null {
    const chooseDir = this.choose<Direction>(
      game,
      Direction.COMPASS,
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        if (goodWanderLocFn && !goodWanderLocFn(next)) return false;
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next);
        return this.isValidWanderAction(game, bumpAction.action);
      },
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        let score = 0;
        const BACKTRACKING = -10000;
        const BREAKING_BARRICADES = -1000;
        const BREAKING_OBJ = -50000;
        const UNEXPLORED_LOC = 1000;
        const DOORWINDOWS = 100;
        const EXITS = 50;
        const INSIDE_WHEN_ALMOST_SLEEPY = 100;
        const WANDER_RANDOM = 10;

        if (next.equals(this.m_prevLocation)) score += BACKTRACKING;

        const mobj = next.map?.getMapObjectAtPoint(next.position);
        if (mobj) {
          const bumpObjAction = game.rules.isBumpableFor(this.controlledActor, game, next).action;
          if (bumpObjAction instanceof ActionBashDoor) score += BREAKING_BARRICADES;
          else if (bumpObjAction instanceof ActionBreak) score += BREAKING_OBJ;
        }

        if (exploration) {
          const locAge = exploration.getExploredLocationAge(next);
          score += locAge === 0 ? UNEXPLORED_LOC : locAge;
        }

        if (mobj && (mobj as any).isDoor !== undefined) score += DOORWINDOWS;
        if (next.map?.getExitAt(next.position)) score += EXITS;

        if (game.rules.isAlmostSleepy(this.controlledActor) && next.map?.getTileAt(next.position.x, next.position.y)?.isInside) {
          score += INSIDE_WHEN_ALMOST_SLEEPY;
        }

        score += game.rules.roll(0, WANDER_RANDOM);
        return score;
      },
      (a, b) => a > b
    );

    return chooseDir ? new ActionBump(this.controlledActor, game, chooseDir.choice) : null;
  }

  protected behaviorBumpToward(
    game: Game,
    goal: Point,
    canCheckBreak: boolean,
    canCheckPush: boolean,
    distanceFn: (a: Point, b: Point) => number
  ): ActorAction | null {
    const bestCloserDir = this.chooseExtended<Direction, ActorAction>(
      game,
      Direction.COMPASS,
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next).action;
        if (!bumpAction) {
          if (this.controlledActor.model.abilities.isUndead && game.rules.hasActorPushAbility(this.controlledActor)) {
            const obj = this.controlledActor.location.map?.getMapObjectAtPoint(next.position);
            if (obj && game.rules.canActorPush(this.controlledActor, obj).ok) {
              const pushDir = game.rules.rollDirection();
              if (game.rules.canPushObjectTo(obj, pushDir.applyTo(obj.location.position)).ok) {
                return new ActionPush(this.controlledActor, game, obj, pushDir);
              }
            }
          }
          if (canCheckBreak) {
            const obj = this.controlledActor.location.map?.getMapObjectAtPoint(next.position);
            if (obj && game.rules.isBreakableFor(this.controlledActor, obj).ok) {
              return new ActionBreak(this.controlledActor, game, obj);
            }
          }
          if (canCheckPush) {
            const obj = this.controlledActor.location.map?.getMapObjectAtPoint(next.position);
            if (obj && game.rules.canActorPush(this.controlledActor, obj).ok) {
              const pushDir = game.rules.rollDirection();
              if (game.rules.canPushObjectTo(obj, pushDir.applyTo(obj.location.position)).ok) {
                return new ActionPush(this.controlledActor, game, obj, pushDir);
              }
            }
          }
          return null;
        }

        if (next.position.equals(goal)) return bumpAction;
        return this.isValidMoveTowardGoalAction(bumpAction) ? bumpAction : null;
      },
      (dir, action) => {
        const next = this.controlledActor.location.addDirection(dir);
        let cost = distanceFn ? distanceFn(next.position, goal) : game.rules.stdDistance(next.position, goal);
        if (!Number.isNaN(cost) && this.controlledActor.model.abilities.isIntelligent) {
          cost += this.estimateBumpActionCost(game, next, action);
        }
        return cost;
      },
      (a, b) => !Number.isNaN(a) && a < b
    );

    return bestCloserDir ? bestCloserDir.choice : null;
  }

  protected estimateBumpActionCost(_game: Game, loc: Location, action: ActorAction): number {
    let cost = 0;
    if (this.controlledActor.model.abilities.canTire) {
      if (action instanceof ActionMoveStep) {
        const mobj = loc.map?.getMapObjectAtPoint(loc.position);
        if (mobj && mobj.isJumpable) cost = BaseAI.MOVE_DISTANCE_PENALTY;
      }
      if (action instanceof ActionBashDoor || action instanceof ActionBreak || action instanceof ActionPush) {
        cost = BaseAI.MOVE_DISTANCE_PENALTY;
      }
    }
    return cost;
  }

  protected behaviorStupidBumpToward(
    game: Game,
    goal: Point,
    canCheckBreak: boolean,
    canCheckPush: boolean
  ): ActorAction | null {
    return this.behaviorBumpToward(game, goal, canCheckBreak, canCheckPush, (ptA, ptB) => {
      if (ptA.equals(ptB)) return 0;
      let distance = game.rules.stdDistance(ptA, ptB);
      if (!game.rules.isWalkableFor(this.controlledActor, this.controlledActor.location.map, ptA.x, ptA.y).ok) {
        distance += BaseAI.MOVE_DISTANCE_PENALTY;
      }
      return distance;
    });
  }

  protected behaviorIntelligentBumpToward(
    game: Game,
    goal: Point,
    canCheckBreak: boolean,
    canCheckPush: boolean
  ): ActorAction | null {
    const currentDistance = game.rules.stdDistance(this.controlledActor.location.position, goal);
    return this.behaviorBumpToward(game, goal, canCheckBreak, canCheckPush, (ptA, ptB) => {
      if (ptA.equals(ptB)) return 0;
      const distance = game.rules.stdDistance(ptA, ptB);
      if (distance >= currentDistance) return Number.NaN;
      return distance;
    });
  }

  protected behaviorGoEatCorpse(game: Game, corpsesPercepts: Percept[] | null): ActorAction | null {
    if (!corpsesPercepts) return null;
    if (this.controlledActor.model.abilities.isUndead && this.controlledActor.hitPoints >= game.rules.actorMaxHPs(this.controlledActor)) {
      return null;
    }

    const corpses = this.controlledActor.location.map?.getCorpsesAt(this.controlledActor.location.position);
    if (corpses && corpses.length > 0) {
      const eatIt = corpses[0];
      if (game.rules.canActorEatCorpse(this.controlledActor, eatIt).ok) {
        return new ActionEatCorpse(this.controlledActor, game, eatIt);
      }
    }

    const nearest = this.filterNearest(game, corpsesPercepts);
    if (!nearest) return null;

    return this.controlledActor.model.abilities.isIntelligent
      ? this.behaviorIntelligentBumpToward(game, nearest.location.position, true, true)
      : this.behaviorStupidBumpToward(game, nearest.location.position, true, true);
  }

  protected behaviorUseExit(game: Game, useFlags: number): ActorAction | null {
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const exit = map.getExitAt(this.controlledActor.location.position);
    if (!exit || !exit.isAnAIExit) return null;

    if (useFlags & UseExitFlags.DONT_BACKTRACK) {
      if (exit.toMap === this.m_prevLocation.map && exit.toPosition.equals(this.m_prevLocation.position)) {
        return null;
      }
    }

    if (useFlags & UseExitFlags.ATTACK_BLOCKING_ENEMIES) {
      const blockingActor = exit.toMap?.getActorAt(exit.toPosition.x, exit.toPosition.y);
      if (blockingActor && game.rules.areEnemies(this.controlledActor, blockingActor)) {
        return new ActionMeleeAttack(this.controlledActor, game, blockingActor);
      }
    }

    if (useFlags & UseExitFlags.BREAK_BLOCKING_OBJECTS) {
      const blockingObj = exit.toMap?.getMapObjectAt(exit.toPosition.x, exit.toPosition.y);
      if (blockingObj && game.rules.isBreakableFor(this.controlledActor, blockingObj).ok) {
        return new ActionBreak(this.controlledActor, game, blockingObj);
      }
    }

    if (!game.rules.canActorUseExit(this.controlledActor, this.controlledActor.location.position).ok) {
      return null;
    }

    return new ActionUseExit(this.controlledActor, game, this.controlledActor.location.position);
  }

  protected behaviorTrackScent(game: Game, scents: Percept[]): ActorAction | null {
    if (!scents || scents.length === 0) return null;
    const best = this.filterStrongestScent(game, scents);
    if (!best) return null;

    if (this.controlledActor.location.position.equals(best.location.position)) {
      const exitThere = this.controlledActor.location.map?.getExitAt(this.controlledActor.location.position);
      if (exitThere && this.controlledActor.model.abilities.aiCanUseAIExits) {
        return this.behaviorUseExit(game, UseExitFlags.ATTACK_BLOCKING_ENEMIES | UseExitFlags.BREAK_BLOCKING_OBJECTS);
      }
      return null;
    }

    return this.behaviorIntelligentBumpToward(game, best.location.position, false, false);
  }

  protected behaviorPushNonWalkableObject(game: Game): ActorAction | null {
    if (!game.rules.hasActorPushAbility(this.controlledActor)) return null;
    const map = this.controlledActor.location.map;
    if (!map) return null;

    const pushables: MapObject[] = [];
    for (const dir of Direction.COMPASS) {
      const pt = dir.applyTo(this.controlledActor.location.position);
      const obj = map.getMapObjectAtPoint(pt);
      if (obj && !obj.isWalkable && game.rules.canActorPush(this.controlledActor, obj).ok) {
        pushables.push(obj);
      }
    }

    if (pushables.length === 0) return null;
    const targetObj = pushables[game.rules.roll(0, pushables.length)];
    const pushDir = game.rules.rollDirection();
    const action = new ActionPush(this.controlledActor, game, targetObj, pushDir);
    return action.isLegal() ? action : null;
  }

  protected behaviorExplore(game: Game, exploration: ExplorationData): ActorAction | null {
    const chooseExploreDir = this.choose<Direction>(
      game,
      Direction.COMPASS,
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        if (exploration.hasExploredLocation(next)) return false;
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next).action;
        if (bumpAction instanceof ActionBreak || bumpAction instanceof ActionBashDoor) return false;
        return this.isValidMoveTowardGoalAction(bumpAction);
      },
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        let score = 0;
        if (next.equals(this.m_prevLocation)) score -= 10000;
        const locAge = exploration.getExploredLocationAge(next);
        score += locAge === 0 ? 500 : 2 * locAge;
        score += game.rules.roll(0, 10);
        return score;
      },
      (a, b) => !Number.isNaN(a) && a > b
    );

    return chooseExploreDir ? new ActionBump(this.controlledActor, game, chooseExploreDir.choice) : null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  protected isValidWanderAction(_game: Game, a: ActorAction | null | undefined): boolean {
    return !!a && (
      a instanceof ActionMoveStep ||
      a instanceof ActionSwitchPlace ||
      a instanceof ActionPush ||
      a instanceof ActionOpenDoor ||
      a instanceof ActionBashDoor ||
      a instanceof ActionBreak
    );
  }

  protected isValidMoveTowardGoalAction(a: ActorAction | null | undefined): boolean {
    return !!a && !(
      a instanceof ActionSay ||
      a instanceof ActionShout ||
      a instanceof ActionSleep
    );
  }

  protected randomPositionNear(rules: any, map: GameMap, goal: Point, range: number): Point {
    let x = goal.x + rules.roll(-range, range + 1);
    let y = goal.y + rules.roll(-range, range + 1);
    x = Math.max(0, Math.min(map.width - 1, x));
    y = Math.max(0, Math.min(map.height - 1, y));
    return new Point(x, y);
  }

  protected canReachSimple(game: Game, dest: Point, allowedActions: number): boolean {
    if (!this.m_RouteFinder) this.m_RouteFinder = new RouteFinder();
    this.m_RouteFinder.actor = this.controlledActor;
    this.m_RouteFinder.allowedActions = allowedActions;
    const maxDist = game.rules.gridDistance(this.controlledActor.location.position, dest);
    return this.m_RouteFinder.canReachSimple(game, dest, maxDist, game.rules.gridDistance);
  }
}
