import { Activity } from '@data/Activity';
import { Actor, Actor as ActorClass } from '@data/Actor';
import { ActorDirective, ActorCourage } from '@data/ActorDirective';
import { ActorModel } from '@data/ActorModel';
import { ActorOrder } from '@data/ActorOrder';
import { AIController } from '@data/AIController';
import { Map as GameMap, Lighting, Exit } from '@data/Map';
import { Item } from '@data/Item';
import { Location } from '@data/Location';
import { MapObject } from '@data/MapObject';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import { ActionBashDoor, ActionBreak, ActionBump, ActionEatCorpse, ActionMeleeAttack, ActionMoveStep, ActionOpenDoor, ActionPush, ActionSay, ActionShout, ActionSleep, ActionSwitchPlace, ActionUseExit, ActionWait, ActionEquipItem, ActionRangedAttack, ActionUnequipItem, ActionUseItem, ActionDropItem, ActionTakeItem, ActionBuildFortification, ActionTakeLead, ActionBarricadeDoor, ActionCloseDoor, SayFlags, ActionEatFoodOnGround, ActionReviveCorpse, ActionSprayOdorSuppressor, ActionThrowGrenade } from '@engine/actions/Actions';
import { ActorAction } from '@data/ActorAction';
import { Percept } from '@engine/ai/Sensors';
import { ExplorationData } from './ExplorationData';
import { AIScent } from './GameplaySensors';
import { RouteFinder, SpecialActions } from './RouteFinder';
import { Odor } from '@data/Odor';
import { Inventory } from '@data/Inventory';
import { Attack, FireMode } from '@data/Attack';
import { DollPart } from '@data/Doll';
import { SkillID } from '@gameplay/Skills';
import { LOS } from '@engine/LOS';
import { ItemTracker } from '@engine/items/ItemTracker';
import { ItemMeleeWeapon, ItemRangedWeapon, ItemRangedWeaponModel, ItemAmmo, ItemWeapon } from '@engine/items/ItemWeapon';
import { Rules, RuleResult } from '@engine/Rules';
import { ItemLight } from '@engine/items/ItemLight';
import { ItemSprayPaint, ItemSprayScent, ItemEntertainment, ItemBarricadeMaterial, ItemSprayScentModel } from '@engine/items/ItemMisc';
import { DoorWindow, Fortification } from '@engine/mapobjects/MapObjects';
import { ItemTrap } from '@engine/items/ItemTrap';
import { ItemMedicine } from '@engine/items/ItemMedicine';
import { Session } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { Corpse } from '@data/Corpse';
import { ItemGrenade, ItemGrenadeModel, ItemPrimedExplosive, ItemExplosive, ItemExplosiveModel } from '@engine/items/ItemExplosive';
import { ItemFood } from '@engine/items/ItemFood';
import { ItemBodyArmor } from '@engine/items/ItemBodyArmor';
import { ItemModel } from '@data/ItemModel';
import { FactionID } from '@gameplay/GameFactions';

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


// ---- Nested enums from BaseAI.cs hoisted to module scope (TS has no nested types) ----
// ---- Top-level (outside the class body) ----
// C# has nested enums, TS has not (a class body only accepts properties/methods).
// BaseAI.ItemSource (alpha10.1) and BaseAI.ItemRating (alpha10) therefore live at
// module top level, exactly like UseExitFlags does in BaseAI.ts.
// Keep them here: the merge step must place them outside the class body.

// alpha10.1 added item/inventory source
export const enum ItemSource {
  // Item is in a ground stack (could be a container, which is the same thing)
  GROUND_STACK = 0,
  // Item is in the actor own inventory.
  OWNED = 1,
  // Item is in another actor inventory.
  ANOTHER_ACTOR = 2,
}

// alpha10 new item rating and trading logic
export const enum ItemRating {
  JUNK = 0,   // dont want it at all, the lowest possible rating.
  OKAY = 1,
  NEED = 2,   // wants it to cover a need, the highest possible rating.
}

// ---- Top-level (outside the class body) ----
// C# has a nested enum, TS has not (a class body only accepts properties/methods).
// BaseAI.TradeRating therefore lives at module top level, exactly like UseExitFlags
// in BaseAI.ts and ItemRating/ItemSource in baseAI_part9.ts.
// Keep it here: the merge step must place it outside the class body.

// offeredRating X askedRating => tradeRating
export const enum TradeRating {
  REFUSE = 0,
  MAYBE = 1,  // will need a charisma roll, accept if success refuse if failed.
  ACCEPT = 3,
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
      // See filterActors: percepted is a union, so instanceof is the only
      // reliable actor test.
      if (!(p.percepted instanceof ActorClass)) continue;
      const other = p.percepted;
      if (other !== this.controlledActor && !game.rules.areEnemies(this.controlledActor, other)) {
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
      // Must be a real Actor: `percepted` is a union, and a truthiness check
      // lets MapObjects/Corpses/Items through, which then blow up in every
      // caller that (correctly, per C#) assumes an Actor.
      if (!(p.percepted instanceof ActorClass)) return false;
      return predicateFn(p.percepted);
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
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next.map!, next.position.x, next.position.y);
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
          const bumpObjAction = game.rules.isBumpableFor(this.controlledActor, game, next.map!, next.position.x, next.position.y).action;
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
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next.map!, next.position.x, next.position.y).action;
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
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next.map!, next.position.x, next.position.y).action;
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
  protected filterOdor(_game: Game, percepts: Percept[] | null, odor: Odor): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const list: Percept[] = [];
    for (const p of percepts) {
      const aiScent = p.percepted;
      if (aiScent instanceof AIScent && aiScent.odor === odor) list.push(p);
    }
    return list.length > 0 ? list : null;
  }
  protected filterStrongestAdjacentScent(game: Game, percepts: Percept[] | null): Percept | null {
    if (!percepts || percepts.length === 0) return null;
    let best: Percept | null = null;
    // int.MaxValue in the C# original: no scent strength can ever beat it.
    let strongest = Number.MAX_SAFE_INTEGER;
    for (const p of percepts) {
      const aiScent = p.percepted;
      if (!(aiScent instanceof AIScent)) continue;
      if (
        aiScent.strength > strongest &&
        game.rules.isAdjacent(p.location.position, this.controlledActor.location.position)
      ) {
        best = p;
        strongest = aiScent.strength;
      }
    }
    return best;
  }
  protected filterStrongestVisibleScent(
    _game: Game,
    percepts: Percept[] | null,
    fov: ReadonlySet<string>
  ): Percept | null {
    if (!percepts || percepts.length === 0) return null;
    let best: Percept | null = null;
    let strongest = Number.MIN_SAFE_INTEGER;
    for (const p of percepts) {
      const aiScent = p.percepted;
      if (!(aiScent instanceof AIScent)) continue;
      const pos = p.location.position;
      if (aiScent.strength > strongest && fov.has(`${pos.x},${pos.y}`)) {
        best = p;
        strongest = aiScent.strength;
      }
    }
    return best;
  }
  protected filterFireTargets(game: Game, percepts: Percept[] | null): Percept[] | null {
    return this.filter(game, percepts, p => {
      const other = p.percepted as Actor | null;
      if (!other || !other.model) return false;
      return game.rules.canActorFireAt(this.controlledActor, other).ok;
    });
  }
  protected filterStacks(game: Game, percepts: Percept[] | null): Percept[] | null {
    return this.filter(game, percepts, p => p.percepted instanceof Inventory);
  }
  protected filterFirst(
    _game: Game,
    percepts: Percept[] | null,
    predicateFn: (p: Percept) => boolean
  ): Percept | null {
    if (!percepts || percepts.length === 0) return null;
    for (const p of percepts) {
      if (predicateFn(p)) return p;
    }
    return null;
  }
  protected filterOut(
    game: Game,
    percepts: Percept[] | null,
    rejectPredicateFn: (p: Percept) => boolean
  ): Percept[] | null {
    return this.filter(game, percepts, p => !rejectPredicateFn(p));
  }
  // Closest first.
  protected sortByDistance(game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const from = this.controlledActor.location.position;
    const sortedList = [...percepts];
    sortedList.sort((pA, pB) => {
      const dA = game.rules.stdDistance(pA.location.position, from);
      const dB = game.rules.stdDistance(pB.location.position, from);
      return dA > dB ? 1 : dA < dB ? -1 : 0;
    });
    return sortedList;
  }
  // Most recent first.
  protected sortByDate(_game: Game, percepts: Percept[] | null): Percept[] | null {
    if (!percepts || percepts.length === 0) return null;
    const sortedList = [...percepts];
    sortedList.sort((pA, pB) => (pA.turn < pB.turn ? 1 : pA.turn > pB.turn ? -1 : 0));
    return sortedList;
  }
  // ---- Movement ----
  protected behaviorWalkAwayFrom(game: Game, goals: Percept | Percept[]): ActorAction | null {
    const dangerPercepts: Percept[] = Array.isArray(goals) ? goals : [goals];
    // stuff to avoid stepping into leader LoF.
    const myLeader = this.controlledActor.leader;
    const leaderIsFiring =
      this.controlledActor.hasLeader &&
      this.controlledActor.getEquippedWeapon() instanceof ItemRangedWeapon;
    let leaderNearestTarget: Actor | null = null;
    if (leaderIsFiring && myLeader) {
      leaderNearestTarget = this.getNearestTargetFor(game, myLeader);
    }
    const checkLeaderLoF =
      leaderNearestTarget !== null &&
      leaderNearestTarget.location.map === this.controlledActor.location.map;
    let leaderLoF: Point[] | null = null;
    if (checkLeaderLoF && myLeader && myLeader.location.map && leaderNearestTarget) {
      leaderLoF = [];
      const wpn = this.controlledActor.getEquippedWeapon();
      if (wpn instanceof ItemRangedWeapon && wpn.model instanceof ItemRangedWeaponModel) {
        LOS.canTraceFireLine(
          myLeader.location.map,
          myLeader.location.position,
          leaderNearestTarget.location.position,
          wpn.model.attack.range,
          leaderLoF
        );
      }
    }
    const bestAwayDir = this.choose<Direction>(
      game,
      Direction.COMPASS,
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        const bumpAction = game.rules.isBumpableFor(this.controlledActor, game, next.map!, next.position.x, next.position.y).action;
        return this.isValidFleeingAction(bumpAction);
      },
      dir => {
        const next = this.controlledActor.location.addDirection(dir);
        // Heuristic value:
        // - Safety from dangers.
        // - If follower, stay close to leader but avoid stepping into leader LoF.
        let safetyValue = this.safetyFrom(game, next.position, dangerPercepts);
        if (this.controlledActor.hasLeader && myLeader) {
          // stay close to leader.
          safetyValue -= 100 * game.rules.gridDistance(next.position, myLeader.location.position);
          // don't step into leader LoF.
          if (checkLeaderLoF && leaderLoF && leaderLoF.some(pt => pt.equals(next.position))) {
            safetyValue -= 100 * BaseAI.IN_LEADER_LOF_SAFETY_PENALTY;
          }
        }
        return safetyValue;
      },
      (a, b) => a > b
    );
    // moving is always better than not moving
    return bestAwayDir ? new ActionBump(this.controlledActor, game, bestAwayDir.choice) : null;
  }
  // ---- Melee attack ----
  protected behaviorMeleeAttack(game: Game, target: Percept): ActorAction | null {
    // C# does `Target.Percepted as Actor`; a non-actor percept means there is
    // no one to hit, which is "no action", not a crash.
    if (!(target.percepted instanceof ActorClass)) return null;
    const targetActor = target.percepted;
    if (!game.rules.canActorMeleeAttack(this.controlledActor, targetActor).ok) {
      return null;
    }
    return new ActionMeleeAttack(this.controlledActor, game, targetActor);
  }
  // ---- Ranged attack ----
  protected behaviorRangedAttack(game: Game, target: Percept): ActorAction | null {
    // See behaviorMeleeAttack: a non-actor percept means no target.
    if (!(target.percepted instanceof ActorClass)) return null;
    const targetActor = target.percepted;
    if (!game.rules.canActorFireAt(this.controlledActor, targetActor).ok) {
      return null;
    }
    // alpha10
    // select rapid fire if one shot is not enough to kill target, has more than one ammo loaded and chances to hit good enough.
    let fireMode = FireMode.DEFAULT;
    const eqWeapon = this.getEquippedWeapon();
    if (eqWeapon instanceof ItemRangedWeapon && eqWeapon.ammo >= 2) {
      const rangedAttack: Attack = game.rules.actorRangedAttack(
        this.controlledActor,
        this.controlledActor.currentRangedAttack,
        game.rules.gridDistance(this.controlledActor.location.position, targetActor.location.position),
        targetActor
      );
      if (rangedAttack.damageValue < targetActor.hitPoints) {
        const rapidHit1Chance = game.rules.computeChancesRangedHit(this.controlledActor, targetActor, 1);
        const rapidHit2Chance = game.rules.computeChancesRangedHit(this.controlledActor, targetActor, 2);
        // "good chances" = both hits at least 50%
        if (rapidHit1Chance >= 50 && rapidHit2Chance >= 50) {
          fireMode = FireMode.RAPID;
        }
      }
    }
    return new ActionRangedAttack(this.controlledActor, game, targetActor, fireMode);
  }
  // ---- Equipping items ----
  // alpha10 BehaviorEquipWeapon obsolete (kept from the #if false block in C#)
  // ---- Ranged first ----
  protected behaviorEquipWeapon(game: Game): ActorAction | null {
    const eqWpn = this.getEquippedWeapon();
    if (eqWpn instanceof ItemRangedWeapon) {
      // ranged weapon equipped, if directive disabled unequip it!
      if (!this.directives.canFireWeapons) {
        return new ActionUnequipItem(this.controlledActor, game, eqWpn);
      }
      // ranged weapon equipped, reload it?
      if (eqWpn.ammo <= 0) {
        // reload it if we can.
        const ammoIt = this.getCompatibleAmmoItem(game, eqWpn, true);
        if (ammoIt) {
          return new ActionUseItem(this.controlledActor, game, ammoIt);
        }
      } else {
        // nope, ranged equipped with ammo, nothing more to do with it.
        return null;
      }
    }
    // No ranged weapon equipped or equipped but out of ammo and no ammos to reload.
    // Equip other best available ranged weapon, if allowed to fire.
    if (this.directives.canFireWeapons) {
      const newRanged = this.getBestRangedWeaponWithAmmo(it => !this.isItemTaboo(it));
      if (newRanged && game.rules.canActorEquipItem(this.controlledActor, newRanged).ok) {
        return new ActionEquipItem(this.controlledActor, game, newRanged);
      }
    }
    // ---- Melee second ----
    // Get best melee weapon in inventory.
    const bestMeleeWeapon = this.getBestMeleeWeapon(game, it => !this.isItemTaboo(it));
    // If none, nothing to do.
    if (!bestMeleeWeapon) {
      return null;
    }
    // If it is already equipped, done.
    if (eqWpn === bestMeleeWeapon) {
      return null;
    }
    // If no weapon equipped, equip best now.
    if (!eqWpn) {
      if (game.rules.canActorEquipItem(this.controlledActor, bestMeleeWeapon).ok) {
        return new ActionEquipItem(this.controlledActor, game, bestMeleeWeapon);
      }
      return null;
    }
    // Another weapon equipped, unequip it.
    if (game.rules.canActorUnequipItem(this.controlledActor, eqWpn).ok) {
      return new ActionUnequipItem(this.controlledActor, game, eqWpn);
    }
    // Fail.
    return null;
  }
  protected behaviorEquipBestBodyArmor(game: Game): ActorAction | null {
    // Get best armor available.
    const bestArmor = this.getBestBodyArmor(game, it => !this.isItemTaboo(it));
    // If none, don't bother.
    if (!bestArmor) {
      return null;
    }
    // If already equipped, fine.
    const eqArmor = this.getEquippedBodyArmor();
    if (eqArmor === bestArmor) {
      return null;
    }
    // If another armor already equipped, unequip it first.
    if (eqArmor) {
      if (game.rules.canActorUnequipItem(this.controlledActor, eqArmor).ok) {
        return new ActionUnequipItem(this.controlledActor, game, eqArmor);
      }
      return null;
    }
    // Equip the new armor.
    if (game.rules.canActorEquipItem(this.controlledActor, bestArmor).ok) {
      return new ActionEquipItem(this.controlledActor, game, bestArmor);
    }
    // Fail.
    return null;
  }
  protected behaviorEquipCellPhone(game: Game): ActorAction | null {
    // Only equip cellphone if :
    // - is a leader.
    // - or if leader does.
    let wantTracker = false;
    const leader = this.controlledActor.leader;
    if (this.controlledActor.countFollowers > 0) {
      wantTracker = true;
    } else if (this.controlledActor.hasLeader && leader) {
      const leaderItem = leader.getEquippedItem(DollPart.LEFT_HAND);
      let leaderHasTrackerEq = false;
      if (leaderItem instanceof ItemTracker && leaderItem.canTrackFollowersOrLeader) {
        leaderHasTrackerEq = true;
      }
      wantTracker = leaderHasTrackerEq;
    }
    // If already equiped a cellphone, nothing to do or unequip it.
    const eqTrack = this.getEquippedCellPhone();
    if (eqTrack) {
      if (!wantTracker && game.rules.canActorUnequipItem(this.controlledActor, eqTrack).ok) {
        return new ActionUnequipItem(this.controlledActor, game, eqTrack);
      }
      return null;
    }
    if (!wantTracker) {
      return null;
    }
    // Equip first available cellphone.
    const newTracker = this.getFirstTracker(it => it.canTrackFollowersOrLeader && !this.isItemTaboo(it));
    if (newTracker && game.rules.canActorEquipItem(this.controlledActor, newTracker).ok) {
      return new ActionEquipItem(this.controlledActor, game, newTracker);
    }
    // Fail.
    return null;
  }
  protected behaviorUnequipCellPhoneIfLeaderHasNot(game: Game): ActorAction | null {
    // alpha10
    // if we are leader, dont unequip.
    if (this.controlledActor.countFollowers > 0) {
      return null;
    }
    // get left eq item.
    const tr = this.controlledActor.getEquippedItem(DollPart.LEFT_HAND);
    if (!(tr instanceof ItemTracker)) {
      return null;
    }
    if (!tr.canTrackFollowersOrLeader) {
      return null;
    }
    // we have a cell phone equiped.
    // unequip if leader has not one equiped.
    const leaderTr = this.controlledActor.leader?.getEquippedItem(DollPart.LEFT_HAND);
    if (!(leaderTr instanceof ItemTracker) || !leaderTr.canTrackFollowersOrLeader) {
      // unequip!
      if (game.rules.canActorUnequipItem(this.controlledActor, tr).ok) {
        return new ActionUnequipItem(this.controlledActor, game, tr);
      }
    }
    // fail.
    return null;
  }
  protected behaviorUnequipLeftItem(game: Game): ActorAction | null {
    // get left eq item.
    const eqLeft = this.controlledActor.getEquippedItem(DollPart.LEFT_HAND);
    if (!eqLeft) {
      return null;
    }
    // try to unequip it.
    if (game.rules.canActorUnequipItem(this.controlledActor, eqLeft).ok) {
      return new ActionUnequipItem(this.controlledActor, game, eqLeft);
    }
    // fail.
    return null;
  }
  // alpha10
  // Get action to perform to manage the best ranged weapon we have.
  // - equip a new best ranged weapon
  // - reload the one we have equiped
  // - unequip a completly out of ammo weapon
  // - nothing if we already have equiped the best we have
  protected behaviorEquipBestRangedWeapon(game: Game): ActorAction | null {
    // get best range weapon with ammo we have
    const best = this.getBestRangedWeaponWithAmmo(it => !this.isItemTaboo(it));
    if (!best) {
      // useless equipped rw we should unequip (best is null in this case since no ammo in inv):
      // if we have a rw equiped but out of ammo and no ammo to reload it, unequip, leave hand free for melee weapon.
      const eqRw = this.controlledActor.getEquippedWeapon();
      if (
        eqRw instanceof ItemRangedWeapon &&
        eqRw.ammo === 0 &&
        !this.getCompatibleAmmoItem(game, eqRw, false)
      ) {
        return new ActionUnequipItem(this.controlledActor, game, eqRw);
      }
      // no rw with ammo to equip
      return null;
    }
    if (best.isEquipped) {
      // if out of ammo try to reload, else unequip to make room for a melee weapon
      if (best.ammo === 0) {
        const ammo = this.getCompatibleAmmoItem(game, best, true);
        if (ammo) {
          return new ActionUseItem(this.controlledActor, game, ammo);
        }
        return new ActionUnequipItem(this.controlledActor, game, best);
      }
      // best ranged weapon equiped & has ammo, we're fine.
      return null;
    }
    // if not equiped but out of ammo and no ammo to reload it, dont equip, leave hand free for melee weapon.
    if (best.ammo === 0 && !this.getCompatibleAmmoItem(game, best, false)) {
      return null;
    }
    // replace current weapon with best one
    return this.behaviorReplaceEquipped(game, this.controlledActor.getEquippedWeapon(), best);
  }
  protected behaviorEquipBestMeleeWeapon(game: Game): ActorAction | null {
    const best = this.getBestMeleeWeapon(game, it => !this.isItemTaboo(it));
    if (!best) {
      return null;
    }
    if (best.isEquipped) {
      return null;
    }
    return this.behaviorReplaceEquipped(game, this.controlledActor.getEquippedWeapon(), best);
  }
  protected behaviorEquipBestLight(game: Game): ActorAction | null {
    const best = this.getBestLight(game, it => !this.isItemTaboo(it));
    if (!best) {
      return null;
    }
    if (best.isEquipped) {
      // unequip if light out of batteries
      if (best.batteries <= 0) {
        return new ActionUnequipItem(this.controlledActor, game, best);
      }
      // already got best light equiped
      return null;
    }
    // don't equip if out of batteries
    if (best.batteries <= 0) {
      return null;
    }
    // replace current left hand item with best one
    return this.behaviorReplaceEquipped(game, this.controlledActor.getEquippedItem(DollPart.LEFT_HAND), best);
  }
  protected behaviorEquipBestCellPhone(game: Game): ActorAction | null {
    const best = this.getBestCellPhone(game, it => !this.isItemTaboo(it));
    if (!best) {
      return null;
    }
    if (best.isEquipped) {
      // unequip if phone out of batteries
      if (best.batteries <= 0) {
        return new ActionUnequipItem(this.controlledActor, game, best);
      }
      // already got best phone equiped
      return null;
    }
    // don't equip if out of batteries
    if (best.batteries <= 0) {
      return null;
    }
    // replace current left hand item with best one
    return this.behaviorReplaceEquipped(game, this.controlledActor.getEquippedItem(DollPart.LEFT_HAND), best);
  }
  protected behaviorEquipBestStenchKiller(game: Game): ActorAction | null {
    const best = this.getBestStenchKiller(game, it => !this.isItemTaboo(it));
    if (!best) {
      return null;
    }
    if (best.isEquipped) {
      // unequip if out of spray
      if (best.sprayQuantity <= 0) {
        return new ActionUnequipItem(this.controlledActor, game, best);
      }
      return null;
    }
    // don't equip if out of spray
    if (best.sprayQuantity <= 0) {
      return null;
    }
    // replace current left hand item with best one
    return this.behaviorReplaceEquipped(game, this.controlledActor.getEquippedItem(DollPart.LEFT_HAND), best);
  }
  protected wantsCellPhoneEquipped(_game: Game): boolean {
    // follower wants if leader has one equipped,
    // leader wants if any follower has one with batteries in its inventory
    if (this.controlledActor.hasLeader) {
      const leaderPhone = this.controlledActor.leader?.getEquippedItem(DollPart.LEFT_HAND);
      if (leaderPhone instanceof ItemTracker && leaderPhone.canTrackFollowersOrLeader) {
        return true;
      }
      return false;
    }
    if (this.controlledActor.countFollowers > 0) {
      const followers = this.controlledActor.followers;
      if (followers) {
        for (const follower of followers) {
          const hasTracker = follower.inventory?.hasItemMatching(
            it =>
              it instanceof ItemTracker &&
              it.canTrackFollowersOrLeader &&
              it.batteries > 0
          );
          if (hasTracker) {
            return true;
          }
        }
      }
      return false;
    }
    return false;
  }
  // Will try to unequip old item first, then equip the new one.
  // equipped can be null, replaceWith can be null.
  protected behaviorReplaceEquipped(
    game: Game,
    equipped: Item | null,
    replaceWith: Item | null
  ): ActorAction | null {
    if (equipped) {
      if (game.rules.canActorUnequipItem(this.controlledActor, equipped).ok) {
        return new ActionUnequipItem(this.controlledActor, game, equipped);
      }
      return null;
    }
    if (replaceWith) {
      if (game.rules.canActorEquipItem(this.controlledActor, replaceWith).ok) {
        return new ActionEquipItem(this.controlledActor, game, replaceWith);
      }
    }
    return null;
  }
  // Equip best items available : armors, weapons, lights/sprays/phones.
  // Will ignore an equipment slot that is reserved by other behaviors (taboo).
  // Actions:
  // - equip an item
  // - unequip an item
  // - reload a weapon
  protected behaviorEquipBestItems(
    game: Game,
    allowCellPhones: boolean,
    allowStenchKiller: boolean
  ): ActorAction | null {
    let action: ActorAction | null = null;
    // keep in mind which equipment slots are reserved by other behaviors and dont mess with them
    const canUseTorso = !this.isEquipmentSlotTaboo(DollPart.TORSO);
    const canUseRightHand = !this.isEquipmentSlotTaboo(DollPart.RIGHT_HAND);
    const canUseLeftHand = !this.isEquipmentSlotTaboo(DollPart.LEFT_HAND);
    // armor
    if (canUseTorso) {
      action = this.behaviorEquipBestBodyArmor(game);
      if (action) {
        return action;
      }
    }
    // right hand weapons, prefering ranged weapon over melee in most cases.
    if (canUseRightHand) {
      // equip best ranged weapon only if not forbidden by directives or ai
      if (
        this.directives.canFireWeapons &&
        !this.controlledActor.model.abilities.aiNotInterestedInRangedWeapons
      ) {
        action = this.behaviorEquipBestRangedWeapon(game);
        if (action) {
          return action;
        }
      } else {
        const equippedRw = this.getEquippedWeapon();
        if (equippedRw instanceof ItemRangedWeapon) {
          return new ActionUnequipItem(this.controlledActor, game, equippedRw);
        }
      }
      // equip melee only if no ranged weapon equiped and not skilled martial artist
      if (
        !this.hasEquipedRangedWeapon(this.controlledActor) &&
        this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS) < 3
      ) {
        action = this.behaviorEquipBestMeleeWeapon(game);
        if (action) {
          return action;
        }
      } else {
        const equippedMw = this.getEquippedWeapon();
        if (equippedMw instanceof ItemMeleeWeapon) {
          return new ActionUnequipItem(this.controlledActor, game, equippedMw);
        }
      }
    }
    // left-hand items
    if (canUseLeftHand) {
      // ordered by priority: cellphone -> lights -> spray
      const eqCellphone = this.getEquippedCellPhone();
      const eqLight = this.getEquippedLight();
      const eqStenchKiller = this.getEquippedStenchKiller();
      // cellphone
      if (allowCellPhones && this.wantsCellPhoneEquipped(game)) {
        action = this.behaviorEquipBestCellPhone(game);
        if (action) {
          return action;
        }
      } else {
        if (eqCellphone) {
          return new ActionUnequipItem(this.controlledActor, game, eqCellphone);
        }
      }
      // lights, if no cellphone equipped
      if (!eqCellphone) {
        if (this.needsLight(game)) {
          action = this.behaviorEquipBestLight(game);
          if (action) {
            return action;
          }
        } else {
          // doesnt need light, unequip if equipped.
          if (eqLight) {
            return new ActionUnequipItem(this.controlledActor, game, eqLight);
          }
        }
      }
      // spray scent, if no cellphone or light equipped
      if (!eqCellphone && !eqLight) {
        if (allowStenchKiller) {
          action = this.behaviorEquipBestStenchKiller(game);
          if (action) {
            return action;
          }
        } else {
          if (eqStenchKiller) {
            return new ActionUnequipItem(this.controlledActor, game, eqStenchKiller);
          }
        }
      }
    }
    // no equipement action to do
    return null;
  }
  // ---- Getting items ----
  protected behaviorGrabFromStack(
    game: Game,
    position: Point,
    stack: Inventory | null,
    canBreak: boolean,
    canPush: boolean
  ): ActorAction | null {
    // ignore empty stacks.
    if (!stack || stack.isEmpty) return null;
    // fix: don't try to get items under blocking map objects - bumping will say "yes can move" but we actually cannot take it.
    const objThere = this.controlledActor.location.map?.getMapObjectAtPoint(position);
    if (objThere) {
      // un-walkable fortification
      if (objThere instanceof Fortification && !objThere.isWalkable) return null;
      // barricaded door/window
      if (objThere instanceof DoorWindow && objThere.isBarricaded) return null;
    }
    // for each item in the stack, consider only the takeable and interesting ones.
    let goodItem: Item | null = null;
    for (const it of stack.items) {
      // if can't take, ignore.
      if (!game.rules.canActorGetItem(this.controlledActor, it).ok) continue;
      // if not interesting, ignore.
      if (!this.isInterestingItemToOwn(game, it, ItemSource.GROUND_STACK)) continue;
      // gettable and interesting, get it.
      goodItem = it;
      break;
    }
    // if no good item, ignore.
    if (goodItem === null) return null;
    // take it!
    const takeIt = goodItem;
    // emote?
    if (game.rules.rollChance(BaseAI.EMOTE_GRAB_ITEM_CHANCE))
      game.DoEmote(this.controlledActor, `${takeIt.aName}! Great!`);
    // try to move/get one.
    if (position.equals(this.controlledActor.location.position))
      return new ActionTakeItem(this.controlledActor, game, position, takeIt);
    else
      return this.behaviorIntelligentBumpToward(game, position, canBreak, canPush);
  }
  // alpha10 made improved get item rule into a new behaviour; need taboo tile upkeep by caller though!
  // lastItemsSaw is the C# `ref` out-parameter: written only when setLastItemsSaw is true.
  protected behaviorGoGetInterestingItems(
    game: Game,
    mapPercepts: Percept[],
    canBreak: boolean,
    canPush: boolean,
    cantGetItemEmote: string,
    setLastItemsSaw: boolean,
    lastItemsSaw: { value: Percept | null }
  ): ActorAction | null {
    const allowedActions = SpecialActions.JUMP | SpecialActions.DOORS;
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const interestingReachableStacks = this.filterOut(
      game,
      this.filterStacks(game, mapPercepts),
      (p: Percept): boolean => {
        if (p.turn !== map.localTime.turnCounter) return true;
        if (this.isOccupiedByOther(map, p.location.position)) return true;
        if (this.isTileTaboo(p.location.position)) return true;
        if (!this.hasAnyInterestingItem(game, p.percepted as Inventory, ItemSource.GROUND_STACK)) return true;
        // alpha10 check reachability
        let a = allowedActions;
        if (this.isContainerAt(p.location)) a |= SpecialActions.ADJ_TO_DEST_IS_GOAL;
        if (!this.canReachSimple(game, p.location.position, a)) return true;
        // can and wants to get it
        return false;
      }
    );
    if (interestingReachableStacks === null) return null;
    // update last percept saw.
    const nearestStack = this.filterNearest(game, interestingReachableStacks);
    if (setLastItemsSaw) lastItemsSaw.value = nearestStack;
    if (nearestStack === null) return null;
    // make room for food if needed.
    const makeRoomForFood = this.behaviorMakeRoomForFood(game, interestingReachableStacks);
    if (makeRoomForFood !== null) {
      this.controlledActor.activity = Activity.IDLE;
      return makeRoomForFood;
    }
    // try to grab.
    const grabAction = this.behaviorGrabFromStack(
      game,
      nearestStack.location.position,
      nearestStack.percepted as Inventory,
      canBreak,
      canPush
    );
    if (grabAction !== null) {
      this.controlledActor.activity = Activity.IDLE;
      return grabAction;
    }
    // we can't grab the item. mark the tile as taboo.
    this.markTileAsTaboo(nearestStack.location.position);
    // emote
    game.DoEmote(this.controlledActor, cantGetItemEmote);
    // failed
    return null;
  }
  // ---- Droping items ----
  protected behaviorDropItem(game: Game, it: Item | null): ActorAction | null {
    if (it === null) return null;
    // 1. unequip?
    if (game.rules.canActorUnequipItem(this.controlledActor, it).ok) {
      // mark item as taboo.
      this.markItemAsTaboo(it);
      // unequip.
      return new ActionUnequipItem(this.controlledActor, game, it);
    }
    // 2. drop?
    if (game.rules.canActorDropItem(this.controlledActor, it).ok) {
      // unmark item as taboo.
      this.unmarkItemAsTaboo(it);
      // drop.
      return new ActionDropItem(this.controlledActor, game, it);
    }
    // failed!
    return null;
  }
  protected behaviorDropUselessItem(game: Game): ActorAction | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty) return null;
    // unequip/drop first light/tracker/spray out of batteries/quantity.
    // alpha10 ammo with no compatible ranged weapon and inventory full
    // alpha10 duplicate ranged weapon with no ammo if inventory 50% full
    // alpha10 empty cans!
    const isInvFull = inv.isFull;
    const isInv50Full = inv.countItems >= inv.maxCapacity / 2;
    for (const it of inv.items) {
      let dropIt = false;
      if (it instanceof ItemLight)
        dropIt = it.batteries <= 0;
      else if (it instanceof ItemTracker)
        dropIt = it.batteries <= 0;
      else if (it instanceof ItemSprayPaint)
        dropIt = it.paintQuantity <= 0;
      else if (it instanceof ItemSprayScent)
        dropIt = it.sprayQuantity <= 0;
      // alpha10 ammo with no compatible ranged weapon and inventory full
      else if (isInvFull && it instanceof ItemAmmo) {
        if (this.getCompatibleRangedWeapon(game, it) === null)
          dropIt = true;
      }
      // alpha10 duplicate ranged weapon with no ammo if inventory 50% full
      else if (isInv50Full && it instanceof ItemRangedWeapon) {
        if (it.ammo === 0) {
          // if we have the same rw with ammo, this one is useless as rw dont break.
          // there is still the risk we get disarmed and would have loved a spare rw,
          // so we are a bit conservative and drop it only if 50% inv full as we prob need
          // the item slot for something else.
          for (const otherIt of inv.items) {
            if (otherIt !== it && otherIt.model === it.model) {
              if (otherIt instanceof ItemRangedWeapon && otherIt.ammo > 0) {
                dropIt = true;
                break;
              }
            }
          }
        }
      }
      // alpha10 empty cans!
      // comparing model instead of attributes is bad but makes sense in this case
      else if (it.model === game.GameItems.EMPTY_CAN) {
        dropIt = true;
      }
      if (dropIt) return this.behaviorDropItem(game, it);
    }
    // nope.
    return null;
  }
  // ---- Resting, Eating & Sleeping ----
  protected behaviorRestIfTired(game: Game): ActorAction | null {
    // if not tired, don't.
    if (this.controlledActor.staminaPoints >= Rules.STAMINA_MIN_FOR_ACTIVITY) return null;
    // tired, rest.
    return new ActionWait(this.controlledActor, game);
  }
  protected behaviorEat(game: Game): ActorAction | null {
    // find best edible eat.
    const it = this.getBestEdibleItem(game);
    if (it === null) return null;
    // i can haz it?
    if (!game.rules.canActorUseItem(this.controlledActor, it).ok) return null;
    // eat it!
    return new ActionUseItem(this.controlledActor, game, it);
  }
  protected behaviorSleep(game: Game, fov: ReadonlySet<string>): ActorAction | null {
    // can?
    if (!game.rules.canActorSleep(this.controlledActor).ok) return null;
    // if next to a door/window, try moving away from it.
    const map = this.controlledActor.location.map;
    if (!map) return null;
    if (map.hasAnyAdjacentInMap(this.controlledActor.location.position, pt => map.getMapObjectAtPoint(pt) instanceof DoorWindow)) {
      // wander where there is no door/window and not adjacent to a door window.
      const wanderAwayFromDoor = this.behaviorWander(
        game,
        loc =>
          !(map.getMapObjectAtPoint(loc.position) instanceof DoorWindow) &&
          !map.hasAnyAdjacentInMap(loc.position, pt => loc.map?.getMapObjectAtPoint(pt) instanceof DoorWindow),
        null
      );
      if (wanderAwayFromDoor !== null) return wanderAwayFromDoor;
      // no good spot, just try normal sleep behavior.
    }
    // sleep on a couch.
    if (game.rules.isOnCouch(this.controlledActor)) {
      return new ActionSleep(this.controlledActor, game);
    }
    // find nearest couch.
    let couchPos: Point | null = null;
    let nearestDist = Number.MAX_VALUE;
    for (const key of fov) {
      const [x, y] = key.split(',').map(Number);
      const p = new Point(x, y);
      const mapObj = map.getMapObjectAtPoint(p);
      if (mapObj && mapObj.isCouch && map.getActorAtPoint(p) === null) {
        const dist = game.rules.stdDistance(this.controlledActor.location.position, p);
        if (dist < nearestDist) {
          nearestDist = dist;
          couchPos = p;
        }
      }
    }
    // if we have a couch, try to get there.
    if (couchPos !== null) {
      const moveThere = this.behaviorIntelligentBumpToward(game, couchPos, false, false);
      if (moveThere !== null) {
        return moveThere;
      }
    }
    // no couch or can't move there, sleep there.
    return new ActionSleep(this.controlledActor, game);
  }
  // ---- Barricading & Building & Traps ----
  protected computeTrapsMaxDamageForMe(game: Game, map: GameMap, pos: Point): number {
    const inv = map.getItemsAt(pos);
    if (!inv) return 0;
    let sum = 0;
    for (const it of inv.items) {
      if (!(it instanceof ItemTrap)) continue;
      // alpha10 ignore safe traps we can't trigger them
      if (!game.rules.isSafeFromTrap(it, this.controlledActor)) sum += it.trapModel.damage;
    }
    return sum;
  }
  protected behaviorBuildTrap(game: Game): ActorAction | null {
    // don't bother if we don't have a trap.
    const trap = this.controlledActor.inventory?.getFirstByType(ItemTrap);
    if (!trap) return null;
    // is this a good spot for a trap?
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const spot = this.isGoodTrapSpot(game, map, this.controlledActor.location.position);
    if (!spot.ok) return null;
    // if trap needs to be activated, do it.
    if (!trap.isActivated && !trap.trapModel.activatesWhenDropped)
      return new ActionUseItem(this.controlledActor, game, trap);
    // trap ready to setup, do it!
    game.DoEmote(this.controlledActor, `${spot.reason} ${trap.aName}!`, true);
    return new ActionDropItem(this.controlledActor, game, trap);
  }
  protected isGoodTrapSpot(_game: Game, map: GameMap, pos: Point): RuleResult {
    let reason = '';
    let potentialSpot = false;
    // 1. Potential spot?
    // outside and has a corpse.
    const isInside = map.getTileAt(pos.x, pos.y)?.isInside ?? false;
    if (!isInside && map.getCorpsesAt(pos) !== null) {
      reason = 'that corpse will serve as a bait for';
      potentialSpot = true;
    } else {
      // entering or leaving a building?
      const wasInside =
        this.m_prevLocation.map?.getTileAt(this.m_prevLocation.position.x, this.m_prevLocation.position.y)
          ?.isInside ?? false;
      if (wasInside !== isInside) {
        reason = 'protecting the building with';
        potentialSpot = true;
      } else {
        // ...or a door/window?
        const objThere = map.getMapObjectAtPoint(pos);
        if (objThere instanceof DoorWindow) {
          reason = 'protecting the doorway with';
          potentialSpot = true;
        } else if (map.getExitAt(pos)) {
          // ...or an exit?
          reason = 'protecting the exit with';
          potentialSpot = true;
        }
      }
    }
    if (!potentialSpot) return { ok: false, reason };
    // 2. Don't overdo it.
    // Never drop more than 3 traps.
    const itemsThere = map.getItemsAt(pos);
    if (itemsThere) {
      const countActivated = itemsThere.countItemsMatching(it => {
        if (!(it instanceof ItemTrap)) return false;
        return it.isActivated;
      });
      if (countActivated > 3) return { ok: false, reason };
    }
    // TODO Need at least 2 neighbouring non adjacent tiles free of activated traps.
    // ok!
    return { ok: true, reason };
  }
  protected behaviorBuildSmallFortification(game: Game): ActorAction | null {
    // don't bother if no carpentry skill or not enough material.
    if (this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY) === 0) return null;
    if (
      game.rules.countBarricadingMaterial(this.controlledActor) <
      game.rules.actorBarricadingMaterialNeedForFortification(this.controlledActor, false)
    ) {
      return null;
    }
    const map = this.controlledActor.location.map;
    if (!map) return null;
    // pick a good adjacent tile.
    // good tiles are :
    // - in bounds, walkable, empty, not border.
    // - not exits.
    // - doorways.
    // eval is random.
    const choice = this.choose<Direction>(
      game,
      Direction.COMPASS,
      dir => {
        const pt = dir.applyTo(this.controlledActor.location.position);
        if (!map.isInBoundsPoint(pt)) return false;
        if (!map.isWalkablePoint(pt)) return false;
        if (pt.x === 0 || pt.x === map.width - 1 || pt.y === 0 || pt.y === map.height - 1) return false;
        if (map.getActorAtPoint(pt)) return false;
        if (map.getExitAt(pt)) return false;
        return this.isDoorwayOrCorridor(game, map, pt);
      },
      () => game.rules.roll(0, 666),
      (a, b) => a > b
    );
    // if no choice, fail.
    if (!choice) return null;
    // get pos.
    const adj = choice.choice.applyTo(this.controlledActor.location.position);
    // if can't build there, fail.
    if (!game.rules.canActorBuildFortification(this.controlledActor, adj, false).ok) return null;
    // ok!
    return new ActionBuildFortification(this.controlledActor, game, adj, false);
  }
  // Try to make a line of large fortifications.
  protected behaviorBuildLargeFortification(game: Game, startLineChance: number): ActorAction | null {
    // don't bother if no carpentry skill or not enough material.
    if (this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.CARPENTRY) === 0) return null;
    if (
      game.rules.countBarricadingMaterial(this.controlledActor) <
      game.rules.actorBarricadingMaterialNeedForFortification(this.controlledActor, true)
    ) {
      return null;
    }
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const countAdjacentInMap = (pt: Point, predicateFn: (p: Point) => boolean): number => {
      if (!map.isInBoundsPoint(pt)) return 0;
      let count = 0;
      for (const d of Direction.COMPASS) {
        const next = d.applyTo(pt);
        if (map.isInBoundsPoint(next) && predicateFn(next)) count++;
      }
      return count;
    };
    // pick a good adjacent tile.
    // good tiles are :
    // - not exit.
    // - not map border.
    // - outside and anchor/continue wall.
    // all things being equal, eval is random.
    const choice = this.choose<Direction>(
      game,
      Direction.COMPASS,
      dir => {
        const pt = dir.applyTo(this.controlledActor.location.position);
        if (!map.isInBoundsPoint(pt)) return false;
        if (!map.isWalkablePoint(pt)) return false;
        if (pt.x === 0 || pt.x === map.width - 1 || pt.y === 0 || pt.y === map.height - 1) return false;
        if (map.getActorAtPoint(pt)) return false;
        if (map.getExitAt(pt)) return false;
        // outside.
        if (map.getTileAt(pt.x, pt.y)?.isInside) return false;
        // count stuff there.
        const wallsAround = countAdjacentInMap(
          pt,
          ptAdj => !(map.getTileAt(ptAdj.x, ptAdj.y)?.model.isWalkable ?? false)
        );
        const lfortsAround = countAdjacentInMap(pt, ptAdj => {
          const f = map.getMapObjectAtPoint(ptAdj);
          return f instanceof Fortification && !f.isTransparent;
        });
        // good spot?
        if (wallsAround === 3 && lfortsAround === 0 && game.rules.rollChance(startLineChance))
          // fort line anchor.
          return true;
        if (wallsAround === 0 && lfortsAround === 1)
          // fort line continuation.
          return true;
        // nope.
        return false;
      },
      () => game.rules.roll(0, 666),
      (a, b) => a > b
    );
    // if no choice, fail.
    if (!choice) return null;
    // get pos.
    const adj = choice.choice.applyTo(this.controlledActor.location.position);
    // if can't build there, fail.
    if (!game.rules.canActorBuildFortification(this.controlledActor, adj, true).ok) return null;
    // ok!
    return new ActionBuildFortification(this.controlledActor, game, adj, true);
  }
  // ---- Breaking objects ----
  protected behaviorAttackBarricade(game: Game): ActorAction | null {
    const map = this.controlledActor.location.map;
    if (!map) return null;
    // find barricades.
    const adjBarricades = map.filterAdjacentInMap(this.controlledActor.location.position, pt => {
      const door = map.getMapObjectAtPoint(pt);
      return door instanceof DoorWindow && door.isBarricaded;
    });
    // if none, fail.
    if (!adjBarricades) return null;
    // try to attack one at random.
    const target = map.getMapObjectAtPoint(adjBarricades[game.rules.roll(0, adjBarricades.length)]);
    if (!(target instanceof DoorWindow)) return null;
    const attackBarricade = new ActionBreak(this.controlledActor, game, target);
    if (attackBarricade.isLegal()) return attackBarricade;
    // nope :(
    return null;
  }
  protected behaviorAssaultBreakables(game: Game, fov: ReadonlySet<string>): ActorAction | null {
    const map = this.controlledActor.location.map;
    if (!map) return null;
    // find all barricades & breakables in fov.
    let breakables: Percept[] | null = null;
    for (const key of fov) {
      const [x, y] = key.split(',').map(Number);
      const mapObj = map.getMapObjectAt(x, y);
      if (!mapObj) continue;
      if (!mapObj.isBreakable) continue;
      if (!breakables) breakables = [];
      breakables.push(new Percept(mapObj, map.localTime.turnCounter, new Location(map, new Point(x, y))));
    }
    // if nothing to assault, fail.
    if (!breakables) return null;
    // get nearest.
    const nearest = this.filterNearest(game, breakables);
    if (!nearest) return null;
    // if adjacent, try to break it.
    if (game.rules.isAdjacent(this.controlledActor.location.position, nearest.location.position)) {
      const breakIt = new ActionBreak(this.controlledActor, game, nearest.percepted as MapObject);
      if (breakIt.isLegal()) return breakIt;
      // illegal, don't bother with it.
      return null;
    }
    // not adjacent, try to get there.
    return this.behaviorIntelligentBumpToward(game, nearest.location.position, true, true);
  }
  // ---- Healing & Entertainment ----
  protected behaviorUseMedecine(
    game: Game,
    factorHealing: number,
    factorStamina: number,
    factorSleep: number,
    factorCure: number,
    factorSan: number
  ): ActorAction | null {
    // if no items, don't bother.
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty) return null;
    // check needs.
    const needHP = this.controlledActor.hitPoints < game.rules.actorMaxHPs(this.controlledActor);
    const needSTA = game.rules.isActorTired(this.controlledActor);
    const needSLP =
      this.controlledActor.model.abilities.hasToSleep &&
      this.wouldLikeToSleep(game, this.controlledActor);
    const needCure = this.controlledActor.infection > 0;
    const needSan =
      this.controlledActor.model.abilities.hasSanity &&
      this.controlledActor.sanity < Math.floor(0.75 * game.rules.actorMaxSanity(this.controlledActor));
    // if no need, don't.
    if (!needHP && !needSTA && !needSLP && !needCure && !needSan) return null;
    // list meds items.
    const medItems = inv.getItemsByType<ItemMedicine>(ItemMedicine);
    if (medItems.length === 0) return null;
    // use best item.
    const bestMedChoice = this.choose<ItemMedicine>(
      game,
      medItems,
      () => true,
      it => {
        let score = 0;
        if (needHP) score += factorHealing * it.healing;
        if (needSTA) score += factorStamina * it.staminaBoost;
        if (needSLP) score += factorSleep * it.sleepBoost;
        if (needCure) score += factorCure * it.infectionCure;
        if (needSan) score += factorSan * it.sanityCure;
        return score;
      },
      (a, b) => a > b
    );
    // if no suitable items or best item scores zero, do not want!
    if (!bestMedChoice || bestMedChoice.value <= 0) return null;
    // use med.
    return new ActionUseItem(this.controlledActor, game, bestMedChoice.choice);
  }
  protected behaviorUseEntertainment(game: Game): ActorAction | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty) return null;
    // use first entertainment item available.
    const ent = inv.getFirstByType(ItemEntertainment);
    if (!ent) return null;
    if (!game.rules.canActorUseItem(this.controlledActor, ent).ok) return null;
    return new ActionUseItem(this.controlledActor, game, ent);
  }
  protected behaviorDropBoringEntertainment(game: Game): ActorAction | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty) return null;
    for (const it of inv.items) {
      // alpha10 boring items item centric
      if (it instanceof ItemEntertainment && it.isBoringFor(this.controlledActor)) {
        return new ActionDropItem(this.controlledActor, game, it);
      }
    }
    return null;
  }
  // ---- Following ----
  protected behaviorFollowActor(
    game: Game,
    other: Actor | null,
    otherPosition: Point,
    isVisible: boolean,
    maxDist: number
  ): ActorAction | null {
    // if no other or dead, don't.
    if (!other || other.isDead) return null;
    // if close enough and visible, wait there.
    const dist = game.rules.gridDistance(this.controlledActor.location.position, otherPosition);
    if (isVisible && dist <= maxDist) return new ActionWait(this.controlledActor, game);
    // if in different map and standing on an exit that leads there, try to use the exit.
    if (other.location.map !== this.controlledActor.location.map) {
      const exitThere = this.controlledActor.location.map?.getExitAt(
        this.controlledActor.location.position
      ) ?? null;
      if (exitThere && exitThere.toMap === other.location.map) {
        if (game.rules.canActorUseExit(this.controlledActor, this.controlledActor.location.position).ok) {
          return new ActionUseExit(this.controlledActor, game, this.controlledActor.location.position);
        }
      }
    }
    // try to get close.
    const bumpAction = this.behaviorIntelligentBumpToward(game, otherPosition, false, false);
    if (bumpAction && bumpAction.isLegal()) {
      // run if other is running.
      if (other.isRunning) this.runIfPossible(game.rules);
      // done.
      return bumpAction;
    }
    // fail.
    return null;
  }
  protected behaviorHangAroundActor(
    game: Game,
    other: Actor | null,
    otherPosition: Point,
    minDist: number,
    maxDist: number
  ): ActorAction | null {
    // if no other or dead, don't.
    if (!other || other.isDead) return null;
    const map = this.controlledActor.location.map;
    // pick a random spot around other within distance.
    let hangSpot: Point = otherPosition;
    let tries = 0;
    const maxTries = 100;
    do {
      let x = otherPosition.x + game.rules.roll(minDist, maxDist + 1) - game.rules.roll(minDist, maxDist + 1);
      let y = otherPosition.y + game.rules.roll(minDist, maxDist + 1) - game.rules.roll(minDist, maxDist + 1);
      if (map) {
        x = Math.max(0, Math.min(map.width - 1, x));
        y = Math.max(0, Math.min(map.height - 1, y));
      }
      hangSpot = new Point(x, y);
    } while (game.rules.gridDistance(hangSpot, otherPosition) < minDist && ++tries < maxTries);
    // try to get close.
    const bumpAction = this.behaviorIntelligentBumpToward(game, hangSpot, false, false);
    if (bumpAction && this.isValidMoveTowardGoalAction(bumpAction) && bumpAction.isLegal()) {
      // run if other is running.
      if (other.isRunning) this.runIfPossible(game.rules);
      // done.
      return bumpAction;
    }
    // fail.
    return null;
  }
  // ---- Charging enemy ----
  // alpha10 added break and push
  protected behaviorChargeEnemy(
    game: Game,
    target: Percept,
    canCheckBreak: boolean,
    canCheckPush: boolean
  ): ActorAction | null {
    // try melee attack first.
    const attack = this.behaviorMeleeAttack(game, target);
    if (attack) return attack;
    const enemy = target.percepted as Actor;
    // if we are tired and next to enemy, use med or rest to recover our STA for the next attack.
    if (game.rules.isActorTired(this.controlledActor) && game.rules.isAdjacent(this.controlledActor.location, target.location)) {
      // meds?
      const useMed = this.behaviorUseMedecine(game, 0, 1, 0, 0, 0);
      if (useMed) return useMed;
      // rest!
      return new ActionWait(this.controlledActor, game);
    }
    // then try getting closer.
    const bumpAction = this.behaviorIntelligentBumpToward(game, target.location.position, canCheckBreak, canCheckPush);
    if (bumpAction) {
      // do we rush?
      // we want to rush if enemy has a range advantage, we want to get closer asap.
      if (this.controlledActor.currentRangedAttack.range < enemy.currentRangedAttack.range) {
        this.runIfPossible(game.rules);
      }
      // chaaarge!
      return bumpAction;
    }
    // failed.
    return null;
  }
  // ---- Leading ----
  protected behaviorLeadActor(game: Game, target: Percept): ActorAction | null {
    const other = target.percepted as Actor;
    // if can't lead him, fail.
    if (!game.rules.canActorTakeLead(this.controlledActor, other).ok) return null;
    // if next to him, lead him.
    if (game.rules.isAdjacent(this.controlledActor.location.position, other.location.position)) {
      return new ActionTakeLead(this.controlledActor, game, other);
    }
    // then try getting closer.
    const bumpAction = this.behaviorIntelligentBumpToward(game, other.location.position, false, false);
    if (bumpAction) return bumpAction;
    // failed.
    return null;
  }
  protected behaviorDontLeaveFollowersBehind(
    game: Game,
    distance: number
  ): { action: ActorAction | null; target: Actor | null } {
    let target: Actor | null = null;
    // alpha10.1 dont always check for lagging followers, prevent leader from getting stuck waiting too much.
    // side effect is more occurence of followers lagging behind.
    if (game.rules.rollChance(25)) return { action: null, target };
    // Scan the group:
    // - Find farthest member of the group.
    // - If at least half the group is close enough we consider the group cohesion to be good enough and do nothing.
    let worstDist = Number.NEGATIVE_INFINITY;
    const map = this.controlledActor.location.map;
    const myPos = this.controlledActor.location.position;
    let closeCount = 0;
    const halfGroup = Math.floor(this.controlledActor.countFollowers / 2);
    const followers = this.controlledActor.followers;
    if (followers) {
      for (const a of followers) {
        // ignore actors on different map.
        if (a.location.map !== map) continue;
        // this actor close enough?
        if (game.rules.gridDistance(a.location.position, myPos) <= distance) {
          // if half close enough, nothing to do.
          if (++closeCount >= halfGroup) return { action: null, target };
        }
        // farthest?
        const dist = game.rules.gridDistance(a.location.position, myPos);
        if (target === null || dist > worstDist) {
          target = a;
          worstDist = dist;
        }
      }
    }
    // try to move toward farther dude.
    if (target === null) return { action: null, target: null };
    return {
      action: this.behaviorIntelligentBumpToward(game, target.location.position, false, false),
      target,
    };
  }
  // ---- Fight or Flee ----
  // Engage in melee fight with the nearest reachable enemy or flee from him.
  // emotes: 0 = flee; 1 = trapped; 2 = charge
  protected behaviorFightOrFlee(
    game: Game,
    enemies: Percept[],
    _hasVisibleLeader: boolean,
    isLeaderFighting: boolean,
    courage: ActorCourage,
    emotes: string[],
    allowedChargeActions: number
  ): ActorAction | null {
    // alpha10 filter out unreachables if no ranged weapon equipped
    // (we shouldnt be here anyway if we have a ranged weapon)
    if (!(this.controlledActor.getEquippedWeapon() instanceof ItemRangedWeapon)) {
      this.filterOutUnreachablePercepts(game, enemies, allowedChargeActions);
      if (enemies.length === 0)
        return null;
    }
    const nearestEnemy = this.filterNearest(game, enemies);
    if (!nearestEnemy)
      return null;
    let decideToFlee: boolean;
    let doRun = false;  // don't run by default.
    const enemy = nearestEnemy.percepted as Actor;
    // alpha10
    // get enemy attack
    const enemyAttack: Attack = this.getActorAttack(game, enemy);
    // always try to heal if enemy next attack could kill us
    if (this.controlledActor.hitPoints - enemyAttack.damageValue <= 0) {
      const healAction = this.behaviorUseMedecine(game, 10, 0, 0, 0, 0);
      if (healAction) {
        this.controlledActor.activity = Activity.FIGHTING;
        this.controlledActor.targetActor = enemy;
        return healAction;
      }
    }
    // get safe range from enemy, just out of his reach.
    const safeRange = Math.max(2, enemyAttack.range + 1);  // melee attack range is 0 not 1!
    const distToEnemy = game.rules.gridDistance(this.controlledActor.location.position, enemy.location.position);
    // Cases that are a no brainer, in this order:
    // 1. Always fight if he has a ranged weapon.
    // 2. Always fight if law enforcer vs murderer.
    // 3. Always flee melee if tired
    // 1. Always fight if enemy has ranged weapon.
    // if we are here, it means we can't shoot him, cause firing behavior has priority.
    // so we want to get a chance at melee a shooting enemy.
    if (this.hasEquipedRangedWeapon(enemy))
      decideToFlee = false;
    // 2. Always fight if law enforcer vs murderer.
    // do our duty.
    else if (this.controlledActor.model.abilities.isLawEnforcer && enemy.murdersCounter > 0)
      decideToFlee = false;
    // 3. Always flee melee if tired
    else if (game.rules.isActorTired(this.controlledActor) && distToEnemy === 1)
      decideToFlee = true;
    // Case need more analysis.
    else
    {
      if (this.controlledActor.leader != null)
      {
        //////////////////////////
        // Fighting with a leader.
        //////////////////////////
        switch (courage)
        {
          case ActorCourage.COWARD:
            // always flee and run.
            decideToFlee = true;
            doRun = true;
            break;
          case ActorCourage.CAUTIOUS:
            // kite.
            decideToFlee = this.wantToEvadeMelee(game, this.controlledActor, courage, enemy);
            doRun = !this.hasSpeedAdvantage(game, this.controlledActor, enemy);
            break;
          case ActorCourage.COURAGEOUS:
            // fight if leader is fighting.
            // otherwise kite.
            if (isLeaderFighting)
              decideToFlee = false;
            else
            {
              decideToFlee = this.wantToEvadeMelee(game, this.controlledActor, courage, enemy);
              doRun = !this.hasSpeedAdvantage(game, this.controlledActor, enemy);
            }
            break;
          default:
            throw new Error('unhandled courage');
        }
      }
      else
      {
        ////////////////////////
        // Leaderless fighting.
        ////////////////////////
        switch (courage)
        {
          case ActorCourage.COWARD:
            // always flee and run.
            decideToFlee = true;
            doRun = true;
            break;
          case ActorCourage.CAUTIOUS:
          case ActorCourage.COURAGEOUS:
            // kite.
            decideToFlee = this.wantToEvadeMelee(game, this.controlledActor, courage, enemy);
            doRun = !this.hasSpeedAdvantage(game, this.controlledActor, enemy);
            break;
          default:
            throw new Error('unhandled courage');
        }
      }
    }
    // alpha10
    // Improve STA management a bit.
    // Cancel running if this would make us tired and we don't have equipped a ranged weapon so keeping
    // TODO -- consider other cases were running would be a waste of STA.
    if (doRun && this.willTireAfterRunning(game, this.controlledActor))
    {
      if (!this.hasEquipedRangedWeapon(this.controlledActor))
        doRun = false;
    }
    // alpha10
    // If we have no ranged weapon and target is unreachable, no point charging him as we can't get into
    // melee contact. Flee if enemy has equipped a ranged weapon and do nothing if not.
    if (!decideToFlee)
    {
      if (!this.hasAnyRangedWeaponWithAmmo())
      {
        // check route
        if (!this.canReachSimple(game, enemy.location.position, allowedChargeActions))
        {
          const enemyWpn = enemy.getEquippedWeapon();
          if (enemyWpn instanceof ItemRangedWeapon)
          {
            // even if out of ammo assumes he will reload or find ammo, better be safe.
            decideToFlee = true;
          }
          else
          {
            // enemy has no ranged weapon and unreachable, possibly no threat to us better
            // do something else instead.
            return null;
          }
        }
      }
    }
    // flee or fight?
    if (decideToFlee)
    {
      // ---- Flee ----
      ////////////////////////////////////////////////////////////////////////////////////////
      // Try to:
      // 1. Close door between me and the enemy if he can't open it right after we closed it.
      // 2. Barricade door between me and the enemy.
      // 3. Use exit?
      // 4. Use medecine?
      // 5. Rest if tired and at safe distance  // alpha10
      // 6. Walk/run away.
      // 7. Blocked, turn to fight.
      ////////////////////////////////////////////////////////////////////////////////////////
      // emote?
      if (this.controlledActor.model.abilities.canTalk && game.rules.rollChance(BaseAI.EMOTE_FLEE_CHANCE))
        game.DoEmote(this.controlledActor, `${emotes[0]} ${enemy.name}!`);
      // 1. Close door between me and the enemy if he can't open it right after we closed it.
      if (this.controlledActor.model.abilities.canUseMapObjects)
      {
        const closeDoorBetweenDirection = this.choose<Direction>(
          game,
          Direction.COMPASS,
          dir =>
          {
            const pos = dir.applyTo(this.controlledActor.location.position);
            const doorObj = this.controlledActor.location.map?.getMapObjectAtPoint(pos);
            if (!(doorObj instanceof DoorWindow))
              return false;
            if (!this.isBetween(game, this.controlledActor.location.position, pos, enemy.location.position))
              return false;
            if (!game.rules.isClosableFor(this.controlledActor, doorObj).ok)
              return false;
            if (game.rules.gridDistance(pos, enemy.location.position) === 1 && game.rules.isClosableFor(enemy, doorObj).ok)
              return false;
            return true;
          },
          _dir => game.rules.roll(0, 666),  // random eval, all things being equal.
          (a, b) => a > b
        );
        if (closeDoorBetweenDirection != null)
        {
          const doorObj = this.controlledActor.location.map?.getMapObjectAtPoint(
            closeDoorBetweenDirection.choice.applyTo(this.controlledActor.location.position)
          );
          if (doorObj instanceof DoorWindow)
            return new ActionCloseDoor(this.controlledActor, game, doorObj);
        }
      }
      // 2. Barricade door between me and the enemy.
      if (this.controlledActor.model.abilities.canBarricade)
      {
        const barricadeDoorBetweenDirection = this.choose<Direction>(
          game,
          Direction.COMPASS,
          dir =>
          {
            const pos = dir.applyTo(this.controlledActor.location.position);
            const doorObj = this.controlledActor.location.map?.getMapObjectAtPoint(pos);
            if (!(doorObj instanceof DoorWindow))
              return false;
            if (!this.isBetween(game, this.controlledActor.location.position, pos, enemy.location.position))
              return false;
            if (!game.rules.canActorBarricadeDoor(this.controlledActor, doorObj).ok)
              return false;
            return true;
          },
          _dir => game.rules.roll(0, 666),  // random eval, all things being equal.
          (a, b) => a > b
        );
        if (barricadeDoorBetweenDirection != null)
        {
          const doorObj = this.controlledActor.location.map?.getMapObjectAtPoint(
            barricadeDoorBetweenDirection.choice.applyTo(this.controlledActor.location.position)
          );
          if (doorObj instanceof DoorWindow)
            return new ActionBarricadeDoor(this.controlledActor, game, doorObj);
        }
      }
      // 3. Use exit?
      if (this.controlledActor.model.abilities.aiCanUseAIExits &&
        game.rules.rollChance(BaseAI.FLEE_THROUGH_EXIT_CHANCE))
      {
        const useExit = this.behaviorUseExit(game, UseExitFlags.NONE);
        if (useExit)
        {
          let doUseExit = true;
          // Exception : if follower use exit only if leading to our leader.
          // we don't want to leave our leader behind (mostly annoying for the player).
          if (this.controlledActor.hasLeader)
          {
            const exitThere = this.controlledActor.location.map?.getExitAt(this.controlledActor.location.position);
            const leader = this.controlledActor.leader;
            if (exitThere != null && leader != null) // well. who knows?
              doUseExit = (leader.location.map === exitThere.toMap);
          }
          // do it?
          if (doUseExit)
          {
            this.controlledActor.activity = Activity.FLEEING;
            return useExit;
          }
        }
      }
      // 4. Use medecine?
      // when to use medecine? only when fighting vs an unranged enemy and not in contact.
      if (!(enemy.getEquippedWeapon() instanceof ItemRangedWeapon) && !game.rules.isAdjacent(this.controlledActor.location, enemy.location))
      {
        const medAction = this.behaviorUseMedecine(game, 2, 2, 1, 0, 0);
        if (medAction)
        {
          this.controlledActor.activity = Activity.FLEEING;
          return medAction;
        }
      }
      // alpha10
      // 5. Rest if tired and at safe distance
      if (game.rules.isActorTired(this.controlledActor))
      {
        if (game.rules.gridDistance(this.controlledActor.location.position, enemy.location.position) >= safeRange)
        {
          this.controlledActor.activity = Activity.FLEEING;
          return new ActionWait(this.controlledActor, game);
        }
      }
      // 6. Walk/run away.
      const bumpAction = this.behaviorWalkAwayFrom(game, enemies);
      if (bumpAction != null)
      {
        if (doRun)
          this.runIfPossible(game.rules);
        this.controlledActor.activity = Activity.FLEEING;
        return bumpAction;
      }
      // 7. Blocked, turn to fight.
      if (bumpAction == null)
      {
        // fight!
        if (this.isAdjacentToEnemy(game, enemy))
        {
          // emote?
          if (this.controlledActor.model.abilities.canTalk && game.rules.rollChance(BaseAI.EMOTE_FLEE_TRAPPED_CHANCE))
            game.DoEmote(this.controlledActor, emotes[1], true);
          return this.behaviorMeleeAttack(game, nearestEnemy);
        }
      }
    }
    else
    {
      // ---- Fight ----
      const attackAction = this.behaviorChargeEnemy(game, nearestEnemy, true, true);
      if (attackAction != null)
      {
        // emote?
        if (this.controlledActor.model.abilities.canTalk && game.rules.rollChance(BaseAI.EMOTE_CHARGE_CHANCE))
          game.DoEmote(this.controlledActor, `${emotes[2]} ${enemy.name}!`);
        // chaaarge!
        this.controlledActor.activity = Activity.FIGHTING;
        this.controlledActor.targetActor = nearestEnemy.percepted as Actor;
        return attackAction;
      }
    }
    // nope.
    return null;
  }
  // ---- Communication ----
  protected behaviorWarnFriends(game: Game, friends: Percept[], nearestEnemy: Actor): ActorAction | null {
    // Never if actor is itself adjacent to the enemy.
    if (game.rules.isAdjacent(this.controlledActor.location, nearestEnemy.location)) return null;
    // Shout if leader is sleeping.
    // (kinda hax, but make followers more useful for players over phone)
    const leader = this.controlledActor.leader;
    if (leader && leader.isSleeping) return new ActionShout(this.controlledActor, game);
    // Shout if we have a friend sleeping.
    for (const p of friends) {
      if (!(p.percepted instanceof ActorClass)) continue;
      const other = p.percepted;
      if (other === this.controlledActor) continue;
      if (!other.isSleeping) continue;
      if (game.rules.areEnemies(this.controlledActor, other)) continue;
      if (!game.rules.areEnemies(other, nearestEnemy)) continue;
      // friend sleeping, wake up!
      const shoutText =
        nearestEnemy === null
          ? `Wake up ${other.name}!`
          : `Wake up ${other.name}! ${nearestEnemy.name} sighted!`;
      return new ActionShout(this.controlledActor, game, shoutText);
    }
    // no one to alert.
    return null;
  }
  protected behaviorTellFriendAboutPercept(game: Game, percept: Percept): ActorAction | null {
    // get an adjacent awake friend, if none nothing to do.
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const friends = map.filterAdjacentInMap(this.controlledActor.location.position, pt => {
      const otherActor = map.getActorAtPoint(pt);
      if (!otherActor) return false;
      if (otherActor.isSleeping) return false;
      if (game.rules.areEnemies(this.controlledActor, otherActor)) return false;
      return true;
    });
    if (!friends || friends.length === 0) return null;
    // pick a random friend.
    const friend = map.getActorAtPoint(friends[game.rules.roll(0, friends.length)]);
    if (!friend) return null;
    // make message.
    let tellMsg: string;
    const whereMsg = this.makeCentricLocationDirection(game, this.controlledActor.location, percept.location);
    const timeMsg = `${WorldTime.makeTimeDurationMessage(map.localTime.turnCounter - percept.turn)} ago`;
    const perceived = percept.percepted;
    if (perceived instanceof ActorClass) {
      tellMsg = `I saw ${perceived.name} ${whereMsg} ${timeMsg}.`;
    } else if (perceived instanceof Inventory) {
      // tell about a random item from the pile.
      // warning: the items might have changed since then, the AI cheats a bit by knowing which items are there now.
      if (perceived.isEmpty) return null; // all items were taken or destroyed.
      const what = perceived.getItem(game.rules.roll(0, perceived.countItems));
      if (!what) return null;
      // ignore worthless items (eg: don't spam about stupid items like planks)
      if (!this.isItemWorthTellingAbout(what)) return null;
      // ignore stacks that are probably in plain view of the friend.
      const friendFOVRange = game.rules.actorFOV(friend, map.localTime, Session.get().world?.weather);
      if (
        percept.location.map === friend.location.map &&
        game.rules.stdDistance(percept.location.position, friend.location.position) <= 2 + friendFOVRange
      ) {
        return null;
      }
      // do it.
      tellMsg = `I saw ${what.aName} ${whereMsg} ${timeMsg}.`;
    } else if (typeof perceived === 'string') {
      tellMsg = `I heard ${perceived} ${whereMsg} ${timeMsg}!`;
    } else {
      throw new Error('unhandled percept.percepted type');
    }
    // tell friend - if legal.
    const say = new ActionSay(this.controlledActor, game, friend, tellMsg, SayFlags.NONE);
    return say.isLegal() ? say : null;
  }
  // ---- Advanced movement ----
  protected behaviorCloseDoorBehindMe(game: Game, previousLocation: Location): ActorAction | null {
    // if we've gone through a door, try to close it.
    const prevObj = previousLocation.map?.getMapObjectAtPoint(previousLocation.position) ?? null;
    if (!(prevObj instanceof DoorWindow)) return null;
    if (game.rules.isClosableFor(this.controlledActor, prevObj).ok) {
      return new ActionCloseDoor(this.controlledActor, game, prevObj);
    }
    // nope.
    return null;
  }
  protected behaviorSecurePerimeter(game: Game, fov: ReadonlySet<string>): ActorAction | null {
    /////////////////////////////////////
    // Secure room procedure:
    // 1. Close doors/windows.
    // 2. Barricade unbarricaded windows.
    /////////////////////////////////////
    const map = this.controlledActor.location.map;
    if (!map) return null;
    for (const key of fov) {
      const [x, y] = key.split(',').map(Number);
      const mapObj = map.getMapObjectAt(x, y);
      if (!mapObj) continue;
      if (!(mapObj instanceof DoorWindow)) continue;
      const door: DoorWindow = mapObj;
      // 1. Close doors/windows.
      if (door.isOpen && game.rules.isClosableFor(this.controlledActor, door).ok) {
        if (game.rules.isAdjacent(door.location.position, this.controlledActor.location.position)) {
          return new ActionCloseDoor(this.controlledActor, game, door);
        }
        return this.behaviorIntelligentBumpToward(game, door.location.position, false, false);
      }
      // 2. Barricade unbarricaded windows.
      if (door.isWindow && !door.isBarricaded && game.rules.canActorBarricadeDoor(this.controlledActor, door).ok) {
        if (game.rules.isAdjacent(door.location.position, this.controlledActor.location.position)) {
          return new ActionBarricadeDoor(this.controlledActor, game, door);
        }
        return this.behaviorIntelligentBumpToward(game, door.location.position, false, false);
      }
    }
    // nothing to secure.
    return null;
  }
  // ---- Explosives ----
  protected behaviorFleeFromExplosives(game: Game, itemStacks: Percept[] | null): ActorAction | null {
    // if no items in view, don't bother.
    if (!itemStacks || itemStacks.length === 0) return null;
    // filter stacks that have primed explosives.
    const primedExplosives = this.filter(game, itemStacks, p => {
      const stack = p.percepted;
      if (!(stack instanceof Inventory) || stack.isEmpty) return false;
      // found a primed explosive?
      for (const it of stack.items) {
        if (it instanceof ItemPrimedExplosive) return true;
      }
      // no primed explosive in this stack.
      return false;
    });
    // if no primed explosive in sight, no worries.
    if (!primedExplosives) return null;
    // run away from primed explosives!
    const runAway = this.behaviorWalkAwayFrom(game, primedExplosives);
    if (!runAway) return null;
    this.runIfPossible(game.rules);
    return runAway;
  }
  protected behaviorThrowGrenade(game: Game, fov: ReadonlySet<string>, enemies: Percept[] | null): ActorAction | null {
    // don't bother if no enemies.
    if (!enemies || enemies.length === 0) return null;
    // only throw if enough enemies.
    if (enemies.length < 3) return null;
    // don't bother if no grenade in inventory.
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty) return null;
    const grenade: ItemGrenade | null = this.getFirstGrenade((it: Item) => !this.isItemTaboo(it));
    if (!grenade) return null;
    const model = grenade.model as ItemGrenadeModel;
    const map = this.controlledActor.location.map;
    if (!map) return null;
    const myPos = this.controlledActor.location.position;
    // find the best throw point : a spot with many enemies around and no friend to hurt.
    const maxThrowRange = game.rules.actorMaxThrowRange(this.controlledActor, model.maxThrowDistance);
    let bestSpot: Point | null = null;
    let bestSpotScore = 0;
    for (const key of fov) {
      const [ptX, ptY] = key.split(',').map(Number);
      const pt = new Point(ptX, ptY);
      const distToMe = game.rules.gridDistance(myPos, pt);
      // never throw within blast radius - don't suicide ^^
      if (distToMe <= model.blastAttack.radius) continue;
      // if we can't throw there, don't bother.
      if (distToMe > maxThrowRange) continue;
      if (!LOS.canTraceThrowLine(map, myPos, pt, maxThrowRange, null)) continue;
      // compute interest of throwing there.
      // - pro: number of enemies within blast radius.
      // - cons: friend in radius.
      // don't bother checking for blast wave actuallly reaching the targets.
      let score = 0;
      for (let x = pt.x - model.blastAttack.radius; x <= pt.x + model.blastAttack.radius; x++)
        for (let y = pt.y - model.blastAttack.radius; y <= pt.y + model.blastAttack.radius; y++) {
          if (!map.isInBounds(x, y)) continue;
          const otherActor = map.getActorAt(x, y);
          if (!otherActor) continue;
          if (otherActor === this.controlledActor) continue;
          const blastDistToTarget = game.rules.gridDistance(pt, otherActor.location.position);
          if (blastDistToTarget > model.blastAttack.radius) continue;
          // other actor within blast radius.
          // - if friend, abort and never throw there.
          // - if enemy, increase score.
          if (game.rules.areEnemies(this.controlledActor, otherActor)) {
            // score = damage inflicted vs target toughness(max hp).
            // -> means it is better to hurt badly one big enemy than a few scratch on a group of weaklings.
            const value =
              game.rules.blastDamage(blastDistToTarget, model.blastAttack) * game.rules.actorMaxHPs(otherActor);
            score += value;
          } else {
            score = -1;
            break;
          }
        }
      // if negative score (eg: friends get hurt), don't throw.
      if (score <= 0) continue;
      // possible spot. best one?
      if (!bestSpot || score > bestSpotScore) {
        bestSpot = pt;
        bestSpotScore = score;
      }
    }
    // if no throw point, don't.
    if (!bestSpot) return null;
    // equip then throw.
    if (!grenade.isEquipped) {
      // alpha10 mark right hand as taboo so behavior BehaviorEquipBestItems will not undo us and loop forever
      this.markEquipmentSlotAsTaboo(DollPart.RIGHT_HAND);
      const otherEquipped = this.controlledActor.getEquippedWeapon();
      if (otherEquipped) return new ActionUnequipItem(this.controlledActor, game, otherEquipped);
      return new ActionEquipItem(this.controlledActor, game, grenade);
    }
    // alpha10 release right hand from taboo so behavior BehaviorEquipBestItems can use right hand
    this.unmarkEquipmentSlotAsTaboo(DollPart.RIGHT_HAND);
    const throwAction = new ActionThrowGrenade(this.controlledActor, game, bestSpot);
    if (!throwAction.isLegal()) return null;
    return throwAction;
  }
  // ---- Inventory management ----
  protected behaviorMakeRoomForFood(game: Game, stacks: Percept[] | null): ActorAction | null {
    // if no items in view, fail.
    if (!stacks || stacks.length === 0) return null;
    const myInv = this.controlledActor.inventory;
    if (!myInv) return null;
    // if inventory not full, no need.
    const maxInv = game.rules.actorMaxInv(this.controlledActor);
    if (myInv.countItems < maxInv) return null;
    // if food item in inventory, no need.
    if (this.hasItemOfType(ItemFood)) return null;
    // if no food item in view, fail.
    let hasFoodVisible = false;
    for (const p of stacks) {
      const inv = p.percepted;
      if (!(inv instanceof Inventory)) continue;
      if (inv.hasItemOfType(ItemFood)) {
        hasFoodVisible = true;
        break;
      }
    }
    if (!hasFoodVisible) return null;
    // want to get rid of an item.
    // order of preference:
    // 1. get rid of not interesting item.
    // 2. get rid of barricading material.
    // 3. get rid of light & sprays.
    // 4. get rid of ammo.
    // 5. get rid of entertainment  // alpha10
    // 6. get rid of medecine.
    // 7. last resort, get rid of random item.
    // 1. get rid of not interesting item.
    const notInteresting = myInv.getFirstMatching(it => !this.isInterestingItemToOwn(game, it, ItemSource.OWNED));
    if (notInteresting) return this.behaviorDropItem(game, notInteresting);
    // 2. get rid of barricading material.
    const material = myInv.getFirstMatching(it => it instanceof ItemBarricadeMaterial);
    if (material) return this.behaviorDropItem(game, material);
    // 3. get rid of light & sprays.
    const light = myInv.getFirstMatching(it => it instanceof ItemLight);
    if (light) return this.behaviorDropItem(game, light);
    let spray = myInv.getFirstMatching(it => it instanceof ItemSprayPaint);
    if (spray) return this.behaviorDropItem(game, spray);
    spray = myInv.getFirstMatching(it => it instanceof ItemSprayScent);
    if (spray) return this.behaviorDropItem(game, spray);
    // 4. get rid of ammo.
    const ammo = myInv.getFirstMatching(it => it instanceof ItemAmmo);
    if (ammo) return this.behaviorDropItem(game, ammo);
    // 5. get rid of entertainment  // alpha10
    const ent = myInv.getFirstMatching(it => it instanceof ItemEntertainment);
    if (ent) return this.behaviorDropItem(game, ent);
    // 6. get rid of medecine.
    const med = myInv.getFirstMatching(it => it instanceof ItemMedicine);
    if (med) return this.behaviorDropItem(game, med);
    // 7. last resort, get rid of random item.
    const anyItem = myInv.getItem(game.rules.roll(0, myInv.countItems));
    return this.behaviorDropItem(game, anyItem);
  }
  // ---- Sprays ----
  protected behaviorUseStenchKiller(game: Game): ActorAction | null {
    const equippedItem = this.controlledActor.getEquippedItem(DollPart.LEFT_HAND);
    if (!(equippedItem instanceof ItemSprayScent)) return null;
    const spray = equippedItem;
    // if no spray or empty, nope.
    if (spray.sprayQuantity <= 0) return null;
    // if not proper odor, nope.
    const model = spray.model as ItemSprayScentModel;
    if (model.odor !== Odor.SUPPRESSOR) return null; // alpha10
    // alpha10
    // first check if wants to use it on self, then check on adj leader/follower
    let sprayOn: Actor | null = null;
    const wantsToSprayOn = (a: Actor): boolean => {
      // never spray on player, could mess with his tactics
      if (a.isPlayer) return false;
      // only if self or adjacent
      if (!(a === this.controlledActor || game.rules.isAdjacent(this.controlledActor.location, a.location))) {
        return false;
      }
      // dont spray if already suppressed for 2h or more
      if (a.odorSuppressorCounter >= 2 * WorldTime.TURNS_PER_HOUR) return false;
      // spot must be interesting to spray for either us or the target.
      const myMap = this.controlledActor.location.map;
      if (myMap && this.isGoodStenchKillerSpot(game, myMap, this.controlledActor.location.position)) return true;
      const aMap = a.location.map;
      if (aMap && this.isGoodStenchKillerSpot(game, aMap, a.location.position)) return true;
      return false;
    };
    // self?...
    if (wantsToSprayOn(this.controlledActor)) sprayOn = this.controlledActor;
    else {
      // ...adj leader/mates/followers
      if (this.controlledActor.hasLeader) {
        const leader = this.controlledActor.leader;
        if (leader) {
          if (wantsToSprayOn(leader)) sprayOn = leader;
          else {
            for (const mate of leader.followers ?? []) {
              if (!sprayOn && mate !== this.controlledActor && wantsToSprayOn(mate)) sprayOn = mate;
            }
          }
        }
      }
      if (!sprayOn && this.controlledActor.countFollowers > 0) {
        for (const follower of this.controlledActor.followers ?? []) {
          if (!sprayOn && wantsToSprayOn(follower)) sprayOn = follower;
        }
      }
    }
    //  spray?
    if (sprayOn) {
      const sprayIt = new ActionSprayOdorSuppressor(this.controlledActor, game, spray, sprayOn);
      if (sprayIt.isLegal()) return sprayIt;
    }
    // nope.
    return null;
  }
  protected isGoodStenchKillerSpot(_game: Game, map: GameMap, pos: Point): boolean {
    // alpha10 obsolete 1. Don't spray at an already sprayed spot.
    // 2. Spray in a good position:
    //    2.1 entering or leaving a building.
    //    2.2 a door/window.
    //    2.3 an exit.
    // 2. Spray in a good position:
    //    2.1 entering or leaving a building.
    const prevMap = this.m_prevLocation.map;
    const wasInside = !!prevMap?.getTileAt(this.m_prevLocation.position.x, this.m_prevLocation.position.y)?.isInside;
    const isInside = !!map.getTileAt(pos.x, pos.y)?.isInside;
    if (wasInside !== isInside) return true;
    //    2.2 a door/window.
    const objThere = map.getMapObjectAtPoint(pos);
    if (objThere instanceof DoorWindow) return true;
    //    2.3 an exit.
    if (map.getExitAt(pos)) return true;
    // nope.
    return false;
  }
  // ---- Law enforcement ----
  protected behaviorEnforceLaw(
    game: Game,
    percepts: Percept[] | null,
    target: { value: Actor | null }
  ): ActorAction | null {
    target.value = null;
    // sanity checks.
    if (!this.controlledActor.model.abilities.isLawEnforcer) return null;
    if (!percepts) return null;
    // filter murderers that are not our enemies yet.
    const murderers = this.filterActors(
      game,
      percepts,
      a => a.murdersCounter > 0 && !game.rules.areEnemies(this.controlledActor, a)
    );
    // if none, nothing to do.
    if (!murderers) return null;
    // get nearest murderer.
    const nearestMurderer = this.filterNearest(game, murderers);
    if (!nearestMurderer) return null;
    const murderer = nearestMurderer.percepted as Actor;
    target.value = murderer;
    // roll against target unsuspicious skill.
    if (game.rules.rollChance(game.rules.actorUnsuspicousChance(this.controlledActor, murderer))) {
      // emote.
      game.DoEmote(murderer, `moves unnoticed by ${this.controlledActor.name}.`);
      // done.
      return null;
    }
    // mmmmhhh. who's that?
    game.DoEmote(this.controlledActor, `takes a closer look at ${murderer.name}.`);
    // then roll chance to spot and recognize him as murderer.
    const spotChance = game.rules.actorSpotMurdererChance(this.controlledActor, murderer);
    // if did not spot, nothing to do.
    if (!game.rules.rollChance(spotChance)) return null;
    // make him our enemy and tell him!
    game.DoMakeAggression(this.controlledActor, murderer);
    return new ActionSay(
      this.controlledActor,
      game,
      murderer,
      `HEY! YOU ARE WANTED FOR ${murderer.murdersCounter} MURDER${murderer.murdersCounter > 1 ? 's' : ''}!`,
      SayFlags.IS_DANGER
    );
  }
  // ---- Animals ----
  protected behaviorGoEatFoodOnGround(game: Game, stacksPercepts: Percept[] | null): ActorAction | null {
    // nope if no percepts.
    if (!stacksPercepts) return null;
    // filter stacks with food.
    const foodStacks = this.filter(game, stacksPercepts, p => {
      const inv = p.percepted;
      return inv instanceof Inventory && inv.hasItemOfType(ItemFood);
    });
    // nope if no food stacks.
    if (!foodStacks) return null;
    // either 1) eat there or 2) go get it
    // 1) check food here.
    const invThere = this.controlledActor.location.map?.getItemsAt(this.controlledActor.location.position) ?? null;
    if (invThere && invThere.hasItemOfType(ItemFood)) {
      // eat the first food we get.
      const eatIt = invThere.getFirstByType(ItemFood);
      if (eatIt) return new ActionEatFoodOnGround(this.controlledActor, game, eatIt);
    }
    // 2) go to nearest food.
    const nearest = this.filterNearest(game, foodStacks);
    if (!nearest) return null;
    return this.behaviorStupidBumpToward(game, nearest.location.position, false, false);
  }
  // ---- Corpses & Revival ----
  // Try to revive non-enemy corpses.
  protected behaviorGoReviveCorpse(game: Game, corpsesPercepts: Percept[] | null): ActorAction | null {
    // nope if no percepts.
    if (!corpsesPercepts) return null;
    // make sure we have the basics : medic skill & medikit item.
    if (this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.MEDIC) === 0) return null;
    if (!this.hasItemOfModel(game.GameItems.MEDIKIT)) return null;
    // keep only corpses stacks where we can revive at least one corpse.
    const revivables = this.filter(game, corpsesPercepts, p => {
      const corpsesThere = p.percepted;
      if (!Array.isArray(corpsesThere)) return false;
      for (const c of corpsesThere as Corpse[]) {
        // dont revive enemies!
        if (
          game.rules.canActorReviveCorpse(this.controlledActor, c).ok &&
          !game.rules.areEnemies(this.controlledActor, c.deadGuy)
        ) {
          return true;
        }
      }
      return false;
    });
    if (!revivables) return null;
    // either 1) revive corpse or 2) go get them.
    // 1) check corpses here.
    const corpses = this.controlledActor.location.map?.getCorpsesAt(this.controlledActor.location.position) ?? null;
    if (corpses) {
      // get the first corpse we can revive.
      for (const c of corpses) {
        if (
          game.rules.canActorReviveCorpse(this.controlledActor, c).ok &&
          !game.rules.areEnemies(this.controlledActor, c.deadGuy)
        ) {
          return new ActionReviveCorpse(this.controlledActor, game, c);
        }
      }
    }
    // 2) go to nearest revivable.
    const nearest = this.filterNearest(game, revivables);
    if (!nearest) return null;
    return this.controlledActor.model.abilities.isIntelligent
      ? this.behaviorIntelligentBumpToward(game, nearest.location.position, false, false)
      : this.behaviorStupidBumpToward(game, nearest.location.position, false, false);
  }
  // ---- Messages ----
  private makeCentricLocationDirection(game: Game, from: Location, to: Location): string {
    // if not same location, just says the map.
    if (from.map !== to.map) {
      return `in ${to.map?.name ?? ''}`;
    }
    // same location, says direction.
    const fromPos = from.position;
    const toPos = to.position;
    const vDir = new Point(toPos.x - fromPos.x, toPos.y - fromPos.y);
    return `${Math.floor(game.rules.stdDistanceOf(vDir))} tiles to the ${Direction.approximateFromVector(vDir.x, vDir.y)}`;
  }
  // ---- Items ----
  protected isItemWorthTellingAbout(it: Item | null): boolean {
    if (it === null)
      return false;
    // items type to ignore:
    // - barricading material (planks drop a lot).
    if (it instanceof ItemBarricadeMaterial)
      return false;
    // ignore items we are carrying (we have seen it then taken it)
    const inv = this.controlledActor.inventory;
    if (inv && !inv.isEmpty && inv.contains(it))
      return false;
    // ok.
    return true;
  }
  protected getEquippedWeapon(): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items)
      if (it.isEquipped && it instanceof ItemWeapon)
        return it;
    return null;
  }
  // Get best ranged weapon in our inventory that has ammo loaded or we have ammo to reload it.
  protected getBestRangedWeaponWithAmmo(fn: ((it: Item) => boolean) | null = null): ItemRangedWeapon | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    let best: ItemRangedWeapon | null = null;
    let bestSc = 0;
    for (const it of inv.items) {
      if (it instanceof ItemRangedWeapon && (fn === null || fn(it))) {
        let checkIt = false;
        if (it.ammo > 0) {
          checkIt = true;
        } else {
          // out of ammo, but do we have a matching ammo item in inventory we could reload it with?
          for (const itReload of inv.items) {
            if (itReload instanceof ItemAmmo && (fn === null || fn(itReload))) {
              if (itReload.ammoType === it.ammoType) {
                checkIt = true;
                break;
              }
            }
          }
        }
        if (checkIt) {
          const sc = this.scoreRangedWeapon(it);
          if (best === null || sc > bestSc) {
            best = it;
            bestSc = sc;
          }
        }
      }
    }
    return best;
  }
  // Score this rw over others. Prefer range then attack then ammo loaded.
  protected scoreRangedWeapon(rWp: ItemRangedWeapon): number {
    // prefer range then damage
    const a = rWp.rangedWeaponModel.attack;
    return 10000 * a.range + 100 * a.damageValue + rWp.ammo;
  }
  protected getFirstMeleeWeapon(fn: ((it: Item) => boolean) | null = null): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemMeleeWeapon && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected getFirstBodyArmor(fn: ((it: Item) => boolean) | null = null): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemBodyArmor && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected getFirstGrenade(fn: ((it: Item) => boolean) | null = null): ItemGrenade | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemGrenade && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected getEquippedBodyArmor(): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items)
      if (it.isEquipped && it instanceof ItemBodyArmor)
        return it;
    return null;
  }
  protected getEquippedCellPhone(): ItemTracker | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items)
      if (it.isEquipped && it instanceof ItemTracker && it.canTrackFollowersOrLeader)
        return it;
    return null;
  }
  protected getFirstTracker(fn: ((t: ItemTracker) => boolean) | null = null): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemTracker && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected getEquippedLight(): ItemLight | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items)
      if (it.isEquipped && it instanceof ItemLight)
        return it;
    return null;
  }
  protected getFirstLight(fn: ((it: Item) => boolean) | null = null): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemLight && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected getEquippedStenchKiller(): ItemSprayScent | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items)
      if (it.isEquipped && it instanceof ItemSprayScent && it.odor === Odor.SUPPRESSOR) // alpha10
        return it;
    return null;
  }
  protected getFirstStenchKiller(fn: ((it: ItemSprayScent) => boolean) | null = null): ItemSprayScent | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    for (const it of inv.items) {
      if (it instanceof ItemSprayScent && (fn === null || fn(it)))
        return it;
    }
    return null;
  }
  protected isRangedWeaponOutOfAmmo(it: Item): boolean {
    if (!(it instanceof ItemRangedWeapon))
      return false;
    return it.ammo <= 0;
  }
  protected isLightOutOfBatteries(it: Item): boolean {
    if (!(it instanceof ItemLight))
      return false;
    return it.batteries <= 0;
  }
  protected getBestEdibleItem(game: Game): Item | null {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return null;
    const turn = this.controlledActor.location.map?.localTime.turnCounter ?? 0;
    const need = game.rules.actorMaxFood(this.controlledActor) - this.controlledActor.foodPoints;
    let bestFood: Item | null = null;
    let bestScore = Number.MIN_SAFE_INTEGER;
    for (const it of inv.items) {
      if (!(it instanceof ItemFood))
        continue;
      // compute heuristic score.
      // - economize food : punish food wasting, the more waste the worse.
      // - keep non-perishable food : punish eating non-perishable food, the more nutrition the worse.
      let score = 0;
      const nutrition = game.rules.foodItemNutrition(it, turn);
      const waste = nutrition - need;
      // - punish food wasting, the more waste the worse.
      if (waste > 0)
        score -= waste;
      // - punish eating non-perishable food, the more nutrition the worse.
      if (!it.isPerishable)
        score -= nutrition;
      // best?
      if (bestFood === null || score > bestScore) {
        bestFood = it;
        bestScore = score;
      }
    }
    // return best.
    return bestFood;
  }
  public isInterestingItemToOwn(game: Game, it: Item, itemSrc: ItemSource): boolean {
    // alpha10 base idea is any non-junk non-taboo item is interesting.
    // using itemrating is consistent with new trade logic.
    // exception:
    // - reject anything new not food if no food and only one one slot left; needed to be consistent
    // with BehaviorMakeRoomForFood() or the npc will cycle drop-take-drop...
    // DO NOT USE FOR TRADING use rateItem() and rateTradeOffer() instead.
    // taboo
    if (this.isItemTaboo(it))
      return false;
    // consistent with BehaviorMakeRoomForFood (was already in alpha9)
    const inv = this.controlledActor.inventory;
    if (inv && itemSrc !== ItemSource.OWNED && inv.countItems >= inv.maxCapacity - 1) {
      if (!(it instanceof ItemFood) && this.countItemQuantityOfType(ItemFood) === 0)
        return false;
    }
    // alpha10.1 not interested in picking up safe traps from the ground : dont undo your or your friends traps!
    if (itemSrc === ItemSource.GROUND_STACK && it instanceof ItemTrap) {
      if (game.rules.isSafeFromTrap(it, this.controlledActor))
        return false;
    }
    // then use normal rating as if was trading and accept anything non-junk.
    const rating = this.rateItem(game, it, false);
    return rating !== ItemRating.JUNK;
  }
  public hasAnyInterestingItem(game: Game, inv: Inventory | null, inventorySrc: ItemSource): boolean {
    if (inv === null)
      return false;
    for (const it of inv.items)
      if (this.isInterestingItemToOwn(game, it, inventorySrc))
        return true;
    return false;
  }
  protected firstInterestingItem(game: Game, inv: Inventory | null, inventorySrc: ItemSource): Item | null {
    if (inv === null)
      return null;
    for (const it of inv.items)
      if (this.isInterestingItemToOwn(game, it, inventorySrc))
        return it;
    return null;
  }
  // alpha10 new helpers
  public isContainerAt(loc: Location): boolean {
    const mobj = loc.map?.getMapObjectAtPoint(loc.position) ?? null;
    return mobj !== null && mobj.isContainer;
  }
  // Get best melee weapon in inventory, best score wins.
  protected getBestMeleeWeapon(_game: Game, fn: ((it: Item) => boolean) | null = null): ItemMeleeWeapon | null {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return null;
    let best: ItemMeleeWeapon | null = null;
    let bestScore = -1;
    for (const it of inv.items) {
      if (fn === null || fn(it)) {
        if (it instanceof ItemMeleeWeapon) {
          const score = this.scoreMeleeWeapon(it);
          if (best === null || score > bestScore) {
            best = it;
            bestScore = score;
          }
        }
      }
    }
    return best;
  }
  protected scoreMeleeWeapon(mWp: ItemMeleeWeapon): number {
    // prefer weapon with more dmg, then atk, then disarm, then less sta loss.
    const a = mWp.meleeWeaponModel.attack;
    return 100000 * a.damageValue + 1000 * a.hitValue + a.disarmChance - a.staminaPenalty;
  }
  // Get best light in inventory with preference for currently equipped light to avoid infinite
  // equip-unequip loops. Note that the returned light might have 0 batteries!
  protected getBestLight(_game: Game, fn: ((it: Item) => boolean) | null = null): ItemLight | null {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return null;
    const equippedLight = this.getEquippedLight();
    let bestScoringLight: ItemLight | null = null;
    let bestScore = -1;
    let bestFovLight: ItemLight | null = null;
    let bestFov = -1;
    // keep using currently equipped light if it has the best fov and batteries left,
    // otherwise pick best scoring one.
    // we need to check equipped light because equipping a light actually consumes one battery
    // point (see RogueGame OnEquipItem, was added as an anti player fov exploit) and it will
    // make the ai loop forever switching between lights constantly since equip/unequip is a free ap action.
    if (equippedLight !== null) {
      bestFovLight = equippedLight;
      bestFov = bestFovLight.fovBonus;
      bestScore = this.scoreLight(equippedLight);
      bestScoringLight = equippedLight;
    }
    for (const it of inv.items) {
      if (fn === null || fn(it)) {
        if (it instanceof ItemLight && !it.isEquipped) { // skip equiped because we already scored it
          const fov = it.fovBonus;
          if (fov > bestFov) {
            bestFovLight = it;
            bestFov = fov;
          }
          const score = this.scoreLight(it);
          if (bestScoringLight === null || score > bestScore) {
            bestScoringLight = it;
            bestScore = score;
          }
        }
      }
    }
    if (bestFovLight === equippedLight)
      return equippedLight;
    return bestScoringLight;
  }
  protected scoreLight(light: ItemLight): number {
    // out of batteries sucks
    if (light.batteries <= 0)
      return 0;
    // prefer range then batteries
    return 10000 * light.fovBonus + light.batteries;
  }
  protected getBestCellPhone(_game: Game, fn: ((it: Item) => boolean) | null = null): ItemTracker | null {
    // if one equipped with batteries, that's it.
    const eqPhone = this.getEquippedCellPhone();
    if (eqPhone !== null && eqPhone.batteries > 0 && (fn === null || fn(eqPhone)))
      return eqPhone;
    // find first phone with batteries
    const found = this.controlledActor.inventory?.getFirstMatching(it => {
      if (fn !== null && !fn(it))
        return false;
      return it instanceof ItemTracker && it.batteries > 0 && it.canTrackFollowersOrLeader;
    });
    return found instanceof ItemTracker ? found : null;
  }
  protected getBestStenchKiller(_game: Game, fn: ((it: Item) => boolean) | null = null): ItemSprayScent | null {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return null;
    let best: ItemSprayScent | null = null;
    let bestScore = -1;
    for (const it of inv.items) {
      if (fn === null || fn(it)) {
        if (it instanceof ItemSprayScent) {
          const score = this.scoreStenchKiller(it);
          if (best === null || score > bestScore) {
            best = it;
            bestScore = score;
          }
        }
      }
    }
    return best;
  }
  protected scoreStenchKiller(spray: ItemSprayScent): number {
    // out of spray sucks
    if (spray.sprayQuantity <= 0)
      return 0;
    const mSpray = spray.sprayScentModel;
    // must be stench killer
    if (mSpray.odor !== Odor.SUPPRESSOR) // alpha10
      return -1;
    // prefer stronger strength then spray quantity
    return 10000 * mSpray.strength + spray.sprayQuantity;
  }
  protected getItemNutritionValue(game: Game, it: Item): number {
    if (!(it instanceof ItemFood))
      return 0;
    return game.rules.actorItemNutritionValue(this.controlledActor, it.nutrition);
  }
  protected getTotalNutritionInInventory(game: Game): number {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return 0;
    let total = 0;
    for (const it of inv.items)
      total += this.getItemNutritionValue(game, it);
    return total;
  }
  protected countFullAmmoStacksInInventoryFor(rWp: ItemRangedWeapon): number {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return 0;
    let count = 0;
    for (const it of inv.items) {
      if (it instanceof ItemAmmo && it.ammoType === rWp.ammoType) {
        if (it.quantity >= it.model.stackingLimit)
          count++;
      }
    }
    return count;
  }
  // Total ammo for this weapon in our inventory, including ammo in the weapon.
  protected countTotalAmmoInInventoryFor(rWp: ItemRangedWeapon): number {
    let ammo = 0;
    // add weapon ammo
    ammo += rWp.ammo;
    // add ammo from inventory
    const inv = this.controlledActor.inventory;
    if (inv) {
      for (const it of inv.items) {
        if (it instanceof ItemAmmo && it.ammoType === rWp.ammoType)
          ammo += it.quantity;
      }
    }
    return ammo;
  }
  protected countItemsFullStacksOfSameType(
    typeCtor: new (...args: any[]) => Item,
    excludingThisOne: Item | null = null
  ): number {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return 0;
    let count = 0;
    for (const otherIt of inv.items) {
      if (otherIt !== excludingThisOne && !otherIt.canStackMore && otherIt instanceof typeCtor)
        count++;
    }
    return count;
  }
  // ---- Item rating & trading ----
  public rateItem(game: Game, it: Item, owned: boolean): ItemRating {
    //////////////////////////////////////////////////////
    // Junk :
    // j1 AI forbidden items.
    // **disabled; handled preventively in IsInterestingItemToOwn* Anything new not food if only one slot left.**
    // j3 Spray paint (ai never use it)
    // j4 Melee weapons if martial arts or enough.
    // j5 Unsafe activated traps and empty cans
    // j6 Primed explosives.
    // j7 Light/Tracker/Spray scent out of batteries/paint or if has already enough
    // j8 Entertainment: boring or already enough
    // j9 Ammo with no compatible ranged weapon.
    // j10 Ranged weapons
    //     - ai not interested in rw
    //     - no ammo for it
    //     - has already same model with more potential ammo
    //     - has already better scoring rw with ammo
    // j11 Barricading material if has already enough.
    // Need :
    // n1 Food if hungry or not enough food in inventory.
    // n2 Ammo for ranged weapon if not enough.
    // n3 Melee weapon if no ranged weapon with ammo.
    // n4 Ranged weapon if none with ammo.
    // n5 Any meds if none. Other meds if need it.
    // n6 Barricade material if none.
    // **disabled** n7 Light if bad fov.
    // n8 (Unprimed) Explosive if none.
    // n9 Armor if none.
    // n10 Entertainment if not sane.
    // Okay:
    // - Anything else.
    ///////////////////////////////////////////////////////
    // Junk :
    // j1 AI forbidden items.
    if (it.isForbiddenToAI)
      return ItemRating.JUNK;
    // j2 Anything new not food if only one slot left.
    //if (!owned && (m_Actor.Inventory.CountItems >= game.Rules.ActorMaxInv(m_Actor) - 1) && !(it is ItemFood))
    //    return ItemRating.JUNK;
    // j3 Spray paint.
    if (it instanceof ItemSprayPaint)
      return ItemRating.JUNK;
    // j4 Melee weapons if martial arts or enough.
    if (it instanceof ItemMeleeWeapon) {
      if (this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS) > 0)
        return ItemRating.JUNK;
      // one melee weapon is enough
      if (this.countItemsOfSameType(ItemMeleeWeapon, it) >= 1)
        return ItemRating.JUNK;
    }
    // j5 Unsafe activated traps and empty cans
    if (it instanceof ItemTrap) {
      if (it.model === game.GameItems.EMPTY_CAN)
        return ItemRating.JUNK;
      if (it.isActivated && !game.rules.isSafeFromTrap(it, this.controlledActor))
        return ItemRating.JUNK;
    }
    // j6 Primed explosives.
    if (it instanceof ItemPrimedExplosive)
      return ItemRating.JUNK;
    // j7 Light/Tracker/Spray scent out of batteries/paint or if has already enough
    if (it instanceof ItemLight) {
      if (it.batteries <= 0)
        return ItemRating.JUNK;
      // light is junk if already has 6 hours of batteries worth.
      let totalLightsBatteries = 0;
      this.controlledActor.inventory?.forEach(i => {
        if (i === it)
          return;
        if (!(i instanceof ItemLight))
          return;
        totalLightsBatteries += i.batteries;
      });
      if (totalLightsBatteries >= 6 * WorldTime.TURNS_PER_HOUR)
        return ItemRating.JUNK;
    }
    if (it instanceof ItemTracker) {
      if (it.batteries <= 0)
        return ItemRating.JUNK;
      // don't hoard trackers, one with batteries is enough.
      const enough = this.controlledActor.inventory?.hasItemMatching(i => {
        if (i === it)
          return false;
        return i instanceof ItemTracker && i.batteries > 0;
      }) ?? false;
      if (enough)
        return ItemRating.JUNK;
    }
    if (it instanceof ItemSprayScent) {
      if (it.sprayQuantity <= 0)
        return ItemRating.JUNK;
      // don't hoard spray scent, one with spray left is enough.
      const enough = this.controlledActor.inventory?.hasItemMatching(i => {
        if (i === it)
          return false;
        return i instanceof ItemSprayScent && i.sprayQuantity > 0;
      }) ?? false;
      if (enough)
        return ItemRating.JUNK;
    }
    // j8 Entertainment: boring or already enough
    if (it instanceof ItemEntertainment) {
      if (it.isBoringFor(this.controlledActor))
        return ItemRating.JUNK;
      // one full stack of entertainment is enough if sane
      if (!game.rules.isActorDisturbed(this.controlledActor)
        && this.countItemsFullStacksOfSameType(ItemEntertainment, it) >= 1)
        return ItemRating.JUNK;
    }
    // j9 Ammo with no compatible ranged weapon.
    if (it instanceof ItemAmmo) {
      if (this.getCompatibleRangedWeapon(game, it) === null)
        return ItemRating.JUNK;
    }
    // j10 Ranged weapons
    //     - ai not interested in rw
    //     - no ammo for it
    //     - has already same model with at least more potential ammo
    //     - has already better scoring rw with ammo
    if (it instanceof ItemRangedWeapon) {
      // ai not interested in rw
      if (this.controlledActor.model.abilities.aiNotInterestedInRangedWeapons)
        return ItemRating.JUNK;
      // no ammo for it
      const ammoInInv = this.countTotalAmmoInInventoryFor(it);
      if (ammoInInv === 0)
        return ItemRating.JUNK;
      // has already same model with at least more potential ammo
      // has already at least better scoring rw with ammo
      const scoreIt = this.scoreRangedWeapon(it);
      const invItems = this.controlledActor.inventory?.items ?? [];
      for (const invIt of invItems) {
        if (invIt !== it) {
          if (invIt instanceof ItemRangedWeapon) {
            if (invIt.model === it.model && this.countTotalAmmoInInventoryFor(invIt) >= it.ammo)
              return ItemRating.JUNK;
            if (invIt.ammo > 0 && this.scoreRangedWeapon(invIt) >= scoreIt)
              return ItemRating.JUNK;
          }
        }
      }
    }
    // j11 Barricading material if has already enough.
    if (it instanceof ItemBarricadeMaterial) {
      // one full stack of barricading material is enough
      if (this.countItemsFullStacksOfSameType(ItemBarricadeMaterial, it) >= 1)
        return ItemRating.JUNK;
    }
    // Need :
    // n1 Food if hungry or not enough food in inventory.
    if (it instanceof ItemFood) {
      if (game.rules.isActorHungry(this.controlledActor))
        return ItemRating.NEED;
      let nutritionPoints = this.getTotalNutritionInInventory(game);
      if (owned)
        nutritionPoints -= this.getItemNutritionValue(game, it);
      // rule of thumb: has to cover 25% more than hungry level
      if (nutritionPoints <= (5 * Rules.FOOD_HUNGRY_LEVEL) / 4)
        return ItemRating.NEED;
    }
    // n2 Ammo for ranged weapon if not enough.
    if (it instanceof ItemAmmo) {
      const rWp = this.getCompatibleRangedWeapon(game, it);
      if (rWp !== null) {
        // we want 2 full stacks of ammo
        if (this.countFullAmmoStacksInInventoryFor(rWp) < 2)
          return ItemRating.NEED;
      }
    }
    // n3 Melee weapon if no ranged weapon with ammo.
    if (it instanceof ItemMeleeWeapon) {
      if (!this.hasAnyRangedWeaponWithAmmo())
        return ItemRating.NEED;
    }
    // n4 Ranged weapon if none with ammo.
    if (it instanceof ItemRangedWeapon) {
      if (!this.hasAnyRangedWeaponWithAmmo(it))
        return ItemRating.NEED;
    }
    // n5 Any meds if none. Other meds if need (or could) it.
    if (it instanceof ItemMedicine) {
      if (this.countItemsOfSameType(ItemMedicine, it) === 0)
        return ItemRating.NEED;
      // be lenient and consider we need a med if the corresponding stat is about 75% or less.
      // exception: always want to cure health and infection.
      // this is will allow the player to trade meds for other items, which will increase the
      // value of meds players mostly ignored previously (eg: sta healers).
      if ((it.healing > 0) && (this.controlledActor.hitPoints < game.rules.actorMaxHPs(this.controlledActor)))
        return ItemRating.NEED;
      if ((it.staminaBoost > 0) && (this.controlledActor.staminaPoints < 0.75 * game.rules.actorMaxSTA(this.controlledActor)))
        return ItemRating.NEED;
      if ((it.sleepBoost > 0) && (this.controlledActor.sleepPoints < 0.75 * game.rules.actorMaxSleep(this.controlledActor)))
        return ItemRating.NEED;
      if ((it.sanityCure > 0) && (this.controlledActor.sanity < 0.75 * game.rules.actorMaxSanity(this.controlledActor)))
        return ItemRating.NEED;
      if ((it.infectionCure > 0) && (this.controlledActor.infection > 0)) // always want to cure infection
        return ItemRating.NEED;
    }
    // n6 Barricade material if none.
    if (it instanceof ItemBarricadeMaterial) {
      if (this.countItemsOfSameType(ItemBarricadeMaterial, it) === 0)
        return ItemRating.NEED;
    }
    // **disabled; was willing to eg trade away a weapon for a light during the night! **
    //// n7 Light if bad fov
    //// already handled lights out of batteries as junk
    //if (it is ItemLight)
    //{
    //    WorldTime time = m_Actor.Location.Map.LocalTime;
    //    if (game.Rules.NightFovPenalty(m_Actor, time) > 0)
    //        return ItemRating.NEED;
    //    Weather weather = game.Session.World.Weather;
    //    if (game.Rules.WeatherFovPenalty(m_Actor, weather) > 0)
    //        return ItemRating.NEED;
    //}
    // n8 (Unprimed) Explosive if none.
    if (it instanceof ItemExplosive) {
      if (this.countItemsOfSameType(ItemExplosive, it) === 0)
        return ItemRating.NEED;
    }
    // n9 Armor if none.
    if (it instanceof ItemBodyArmor) {
      if (this.countItemsOfSameType(ItemBodyArmor, it) === 0)
        return ItemRating.NEED;
    }
    // n10 Entertainment if not sane.
    if (it instanceof ItemEntertainment) {
      if (game.rules.isActorDisturbed(this.controlledActor))
        return ItemRating.NEED;
    }
    // Okay:
    // - Anything else.
    return ItemRating.OKAY;
  }
  private static readonly TRADE_RATING_MATRIX: TradeRating[][] = [
    // asked JUNK,        asked OKAY,         asked NEED
    [TradeRating.ACCEPT, TradeRating.MAYBE,  TradeRating.REFUSE],  // offered JUNK
    [TradeRating.ACCEPT, TradeRating.ACCEPT, TradeRating.REFUSE],  // offered OKAY
    [TradeRating.ACCEPT, TradeRating.ACCEPT, TradeRating.MAYBE],   // offered NEED
  ];
  // Rates a trade offer by another actor.
  // Check for trusted leader but do not check for charisma here, handled by the caller on "Maybe" answers.
  // Mostly wants to get an item of equal or better value, unless the item asked is needed, see the matrix.
  // Some additional rules are used for special tricky cases.
  public rateTradeOffer(game: Game, tradingWith: Actor, offered: Item, asked: Item): TradeRating {
    // always accept deals with trusted leader
    if (tradingWith === this.controlledActor.leader && game.rules.isActorTrustingLeader(this.controlledActor))
      return TradeRating.ACCEPT;
    // handle special case of trading items of the same type. eg: trading melee weapons.
    if (offered.constructor === asked.constructor)
      return this.rateItemExhange(game, asked, offered);
    // special case of asking a rw and offering compatible ammo.
    // eg: offering light rifle bullets but asking the rifle.
    // due to items individual ratings this could be accepted
    // (eg: both rated as needed and rolling charisma), which is silly.
    // always refuse such trades!
    if (asked instanceof ItemRangedWeapon && offered instanceof ItemAmmo) {
      if (asked.ammoType === offered.ammoType)
        return TradeRating.REFUSE;
    }
    // alpha10.1 never trade away a unique item, unless for another unique item
    if (asked.isUnique && !offered.isUnique)
      return TradeRating.REFUSE;
    // not a special case, compare item ratings.
    const offeredRating = this.rateItem(game, offered, false);
    const askedRating = this.rateItem(game, asked, true);
    // compare ratings with matrix (lazy way of doing lots of if/else)
    return BaseAI.TRADE_RATING_MATRIX[offeredRating][askedRating];
  }
  // ---- Rating exhange of items of same type ----
  // Compare items of the same type for trading. Items MUST be of the same type.
  // Needs to be handled differently than trading items of different types.
  // Wants to exhange items if get an improvement over the old one eg: a ranged weapon with better range.
  // TODO -- should also be used when considering picking up items
  //   oIt: item we are losing
  //   nIt: item we are getting
  protected rateItemExhange(game: Game, oIt: Item, nIt: Item): TradeRating {
    // first reject/accept if one is junk and not the other
    const oRating = this.rateItem(game, oIt, true);
    const nRating = this.rateItem(game, nIt, false);
    if (nRating === ItemRating.JUNK && oRating !== ItemRating.JUNK) return TradeRating.REFUSE;
    if (oRating === ItemRating.JUNK && nRating !== ItemRating.JUNK) return TradeRating.ACCEPT;
    // then compare items value
    if (oIt instanceof ItemAmmo) {
      // just compare quantity
      return nIt.quantity > oIt.quantity ? TradeRating.ACCEPT :
        nIt.quantity < oIt.quantity ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemBarricadeMaterial) {
      // just compare quantity
      return nIt.quantity > oIt.quantity ? TradeRating.ACCEPT :
        nIt.quantity < oIt.quantity ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemBodyArmor) {
      const oArm: ItemBodyArmor = oIt;
      const nArm = nIt as ItemBodyArmor;
      // prefer better overal protection
      const oScore = oArm.protectionHit + oArm.protectionShot;
      const nScore = nArm.protectionHit + nArm.protectionShot;
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemEntertainment) {
      const oEnt: ItemEntertainment = oIt;
      const nEnt = nIt as ItemEntertainment;
      // prefer non-boring ent first. if both are boring then maybe.
      const oBored = oEnt.isBoringFor(this.controlledActor);
      const nBored = nEnt.isBoringFor(this.controlledActor);
      if (!nBored && oBored) return TradeRating.ACCEPT;
      if (nBored && !nBored) return TradeRating.REFUSE; // alpha10 C# original, always false, kept as-is
      if (nBored && oBored) return TradeRating.MAYBE;
      // then prefer ent with more sanity potential
      // C# does integer division here, hence Math.floor.
      const oScore = Math.floor((oEnt.quantity * 100 * oEnt.entertainmentModel.value) / (1 + oEnt.entertainmentModel.boreChance));
      const nScore = Math.floor((nEnt.quantity * 100 * nEnt.entertainmentModel.value) / (1 + nEnt.entertainmentModel.boreChance));
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemExplosive) { // also ItemGrenade
      const oEx = oIt.model as ItemExplosiveModel;
      const nEx = (nIt as ItemExplosive).model as ItemExplosiveModel;
      // prefer explosive with more range 0 damage
      return nEx.blastAttack.damage[0] > oEx.blastAttack.damage[0] ? TradeRating.ACCEPT :
        nEx.blastAttack.damage[0] < oEx.blastAttack.damage[0] ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemFood) {
      const oFood: ItemFood = oIt;
      const nFood = nIt as ItemFood;
      // prefer food with more nutrition
      const oNut = this.getItemNutritionValue(game, oFood);
      const nNut = this.getItemNutritionValue(game, nFood);
      return nNut > oNut ? TradeRating.ACCEPT :
        nNut < oNut ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemLight) {
      const oLt: ItemLight = oIt;
      const nLt = nIt as ItemLight;
      // score
      const oScore = this.scoreLight(oLt);
      const nScore = this.scoreLight(nLt);
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemMedicine) {
      const oMed: ItemMedicine = oIt;
      const nMed = nIt as ItemMedicine;
      // first prefer med we need the most (basically re-use the med logic from item rating)
      if (nRating > oRating) return TradeRating.ACCEPT;
      if (oRating < nRating) return TradeRating.REFUSE; // alpha10 C# original, always false, kept as-is
      // for other cases, prefer in order: hp, inf, slp, san, sta
      // use scoring.
      const oScore = 10000 * oMed.healing + 1000 * oMed.infectionCure + 100 * oMed.sleepBoost + 10 * oMed.sanityCure + oMed.staminaBoost;
      const nScore = 10000 * nMed.healing + 1000 * nMed.infectionCure + 100 * nMed.sleepBoost + 10 * nMed.sanityCure + nMed.staminaBoost;
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemMeleeWeapon) {
      const oMw: ItemMeleeWeapon = oIt;
      const nMw = nIt as ItemMeleeWeapon;
      // score
      const oScore = this.scoreMeleeWeapon(oMw);
      const nScore = this.scoreMeleeWeapon(nMw);
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemPrimedExplosive) { // also ItemGrenadePrimed
      // refuse any primed explosive
      return TradeRating.REFUSE;
    }
    if (oIt instanceof ItemRangedWeapon) {
      const oRw: ItemRangedWeapon = oIt;
      const nRw = nIt as ItemRangedWeapon;
      // score
      const oScore = this.scoreRangedWeapon(oRw);
      const nScore = this.scoreRangedWeapon(nRw);
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemSprayPaint) {
      const oSp: ItemSprayPaint = oIt;
      const nSp = nIt as ItemSprayPaint;
      // useless items for ai, but prefer one with more spray left...
      return nSp.paintQuantity > oSp.paintQuantity ? TradeRating.ACCEPT :
        nSp.paintQuantity < oSp.paintQuantity ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemSprayScent) {
      const oSp: ItemSprayScent = oIt;
      const nSp = nIt as ItemSprayScent;
      // prefer spray scent with more spray left
      return nSp.sprayQuantity > oSp.sprayQuantity ? TradeRating.ACCEPT :
        nSp.sprayQuantity < oSp.sprayQuantity ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    if (oIt instanceof ItemTrap) {
      const oTr: ItemTrap = oIt;
      const nTr = nIt as ItemTrap;
      // prefer trap with more potential damage then blocking.
      // use scoring
      const oMtr = oTr.trapModel;
      const nMtr = nTr.trapModel;
      const oScore = 100 * oMtr.damage * oMtr.triggerChance + oMtr.blockChance * oMtr.triggerChance;
      const nScore = 100 * nMtr.damage * nMtr.triggerChance + nMtr.blockChance * nMtr.triggerChance;
      return nScore > oScore ? TradeRating.ACCEPT :
        nScore < oScore ? TradeRating.REFUSE :
        TradeRating.MAYBE;
    }
    // unhandled items! should not happen!
    throw new Error('RateItemExhange: unhandled item type' + oIt.constructor.name);
  }
  // alpha10 previous attempt at junk detection, currently inside a C# `#if false`
  // block (BaseAI.cs:5005-5324, dead code) - kept because it is part of this slice.
  protected isJunkItem(game: Game, it: Item): boolean {
    ////////////////////////////////////////////////
    // Junk items:
    // 0 Anything not food if only one slot left.
    // 1 AI forbidden items.
    // 2 Spray paint.
    // 3 Activated traps!
    // 4 Melee weapons if martial arts
    // 5 Lights out of batteries.
    // 9 Primed explosives!
    // 10 Boring items.
    ///////////////////////////////////////////////
    // 0 Anything not food if only one slot left.
    const inv = this.controlledActor.inventory;
    const onlyOneSlotLeft = inv !== null && inv.countItems === game.rules.actorMaxInv(this.controlledActor) - 1;
    if (onlyOneSlotLeft)
      return !(it instanceof ItemFood);
    // 1 AI forbidden items.
    if (it.isForbiddenToAI)
      return true;
    // 2 Spray paint.
    if (it instanceof ItemSprayPaint)
      return true;
    // 3 Activated traps!
    if (it instanceof ItemTrap) {
      if (it.isActivated)
        return true;
    }
    // 4 Melee weapons if martial arts
    // Reject medecine if we alredy have full stacks.
    if (it instanceof ItemMeleeWeapon) {
      if (this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS) > 0)
        return true;
    }
    // 5 Lights out of batteries.
    if (this.isLightOutOfBatteries(it))
      return true;
    // 6 Primed explosives!
    if (it instanceof ItemPrimedExplosive)
      return true;
    // 10 Boring items!
    if (this.controlledActor.isBoredOf(it))
      return true;
    // not junk
    return false;
  }
  // ---- Item scoring ----
  // alpha10 previous attempt; C# keeps IsJunkItem + ScoreItemValue inside #if false.
  public scoreItemValue(game: Game, it: Item, fromOwnInventory: boolean): number {
    // First we reject "junk" items and give them a score of 0.
    if (this.isJunkItem(game, it))
      return 0;
    const rules: Rules = game.rules;
    let isLastOfItsTypeInMyInventory = false;
    if (fromOwnInventory) {
      if (this.countItemsOfSameType(it.constructor as new (...args: any[]) => Item) === 1)
        isLastOfItsTypeInMyInventory = true;
    }
    // Score item ranking in its category (type). Average should be around 1000 so items from different
    // categories can be compared fairly.
    // Then score need for this type for item.
    // Final score is ranking score modified by need.
    // Eg of heuristics:
    // A food item
    // ranking score: nutrition of the food relative to our food bar
    // need: high if we are hungry
    let rankingScore = 1000;
    let needFactor = 1;
    if (it instanceof ItemFood) {
      // -- Food item ranking score
      const itFood = it as ItemFood;
      const turn = this.controlledActor.location.map?.localTime.turnCounter ?? 0;
      const maxFood = rules.actorMaxFood(this.controlledActor);
      // score food nutrition respective to our half our food bar.
      const nutritionScore1000 = Math.floor((2 * 1000 * rules.foodItemNutrition(itFood, turn)) / maxFood);
      // score duration.
      // consider non-perishable food as lasting 7 days.
      // consider 3 days as average (1000)
      let duration: number;
      if (!itFood.isPerishable)
        duration = 7 * WorldTime.TURNS_PER_DAY;
      else
        duration = (itFood.bestBefore?.turnCounter ?? turn) - turn;
      const durationScore1000 = Math.floor((1000 * duration) / (3 * WorldTime.TURNS_PER_DAY));
      // base score is nutrition and duration
      rankingScore = nutritionScore1000 + durationScore1000;
      // penalize even more spoiled/expired
      if (rules.isFoodExpired(itFood, turn))
        rankingScore /= 4;
      else if (rules.isFoodSpoiled(itFood, turn))
        rankingScore /= 2;
      // -- Need for food
      // base need if starved/hungry
      if (rules.isActorStarving(this.controlledActor))
        needFactor = 10;
      else if (rules.isActorHungry(this.controlledActor))
        needFactor = 2;
      // need food if not enough stockpiled to cover our needs
      // FIXME -- including last means the ai is not willing to trade for a better food!
      if (!this.hasEnoughFoodFor(game, maxFood - Rules.FOOD_HUNGRY_LEVEL) || isLastOfItsTypeInMyInventory)
        needFactor += 0.5;
    } else if (it instanceof ItemRangedWeapon) {
      // -- Ranged weapon ranking score
      const itRw = it as ItemRangedWeapon;
      // ranking score is just range with 5 considered average
      rankingScore = (1000 * itRw.rangedWeaponModel.attack.range) / 5;
      // small bonus for ammo left (to sort identical weapons)
      rankingScore += itRw.ammo;
      // -- Need for ranged weapon
      // need ranged weapon if none yet/last
      // FIXME -- including last means the ai is not willing to trade for a better ranged weapon!
      if (this.countItemsOfSameType(ItemRangedWeapon) === 0 || isLastOfItsTypeInMyInventory)
        needFactor = 4;
      // less need for a weapon we have no ammo for
      if (this.getCompatibleAmmoItem(game, itRw, true) === null)
        needFactor *= 2 / 3;
    } else if (it instanceof ItemAmmo) {
      // -- Ammo ranking score
      const itAmmo = it as ItemAmmo;
      // quantity to helping sort but misleading (eg: bolts have larger stacks and will be valued more than shotgun shells)
      rankingScore = 1000 + itAmmo.quantity;
      // -- Need for ammo
      // need ammo if compatible weapon and even more if not 2 full stacks of it
      if (this.getCompatibleRangedWeapon(game, itAmmo) !== null) {
        needFactor = 2;
        if (!this.hasAtLeastFullStackOfItemTypeOrModel(it, 2))
          needFactor += 1;
      } else
        // ammo are really not valuable if no ranged weapon for it
        needFactor = 0.1;
    } else if (it instanceof ItemMeleeWeapon) {
      // -- Melee weapon ranking score
      const itMw = it as ItemMeleeWeapon;
      const mMw = itMw.meleeWeaponModel;
      // base is damage, consider 6 as average (1000)
      rankingScore = Math.floor((1000 * mMw.attack.damageValue) / 6);
      // small penalty for stamina
      rankingScore -= mMw.attack.staminaPenalty;
      // -- Melee weapon need
      // need melee weapon if none/last and has no ranged weapon with ammo
      // FIXME -- including last means the ai is not willing to trade for a better melee weapon!
      if (this.countItemsOfSameType(ItemMeleeWeapon) === 0 || isLastOfItsTypeInMyInventory) {
        if (!this.hasAnyRangedWeaponWithAmmo())
          needFactor = 2;
      }
    } else if (it instanceof ItemMedicine) {
      // -- Medecine ranking score
      const itMed = it as ItemMedicine;
      // base is heal value, consider 2 as average (1000)
      rankingScore = (1000 * itMed.healing) / 2;
      // in games with infection, big bonus for infection cure
      if (Rules.hasInfection(Session.get().gameMode))
        rankingScore += 100 * itMed.infectionCure;
      // smaller bonus for sleep
      rankingScore += 10 * itMed.sleepBoost;
      // small bonuses for other effects
      rankingScore += 2 * itMed.sanityCure + itMed.staminaBoost;
      // bigger stacks are better
      rankingScore += it.quantity;
      // -- Need for medecine
      // need medecine if none or last
      // FIXME -- including last means the ai is not willing to trade for a better medecine!
      if (this.countItemsOfSameType(ItemMedicine) === 0 || isLastOfItsTypeInMyInventory)
        needFactor = 2;
      // need healing if hurt / sleep if sleepy / stamina if tired etc...
      if (this.controlledActor.hitPoints < rules.actorMaxHPs(this.controlledActor) && itMed.healing > 0)
        needFactor += 1;
      if (rules.isActorSleepy(this.controlledActor) && itMed.sleepBoost > 0)
        needFactor += 1;
      if (rules.isActorTired(this.controlledActor) && itMed.staminaBoost > 0)
        needFactor += 1;
      if (rules.isActorInsane(this.controlledActor) && itMed.sanityCure > 0)
        needFactor += 1;
      if (this.controlledActor.infection > 0 && itMed.infectionCure > 0)
        needFactor += 1;
    } else if (it instanceof ItemExplosive) {
      // TODO -- refine explosive scoring, basically stupid now. also explosive vs primed is a mess.
      // -- Explosive ranking score
      rankingScore = 1000;
      rankingScore += it.quantity;
      // -- Need for explosive
      // need explosive if none or last
      // FIXME -- including last means the ai is not willing to trade for a better explosive!
      if (this.countItemsOfSameType(ItemExplosive) === 0 || isLastOfItsTypeInMyInventory)
        needFactor = 2;
    } else if (it instanceof ItemBarricadeMaterial) {
      // -- Barricade material ranking
      rankingScore = 1000;
      rankingScore += it.quantity;
      // -- Need for barricade
      // need barricade if none or last
      // FIXME -- including last means the ai is not willing to trade for a better ranged weapon!
      if (this.countItemsOfSameType(ItemBarricadeMaterial) === 0 || isLastOfItsTypeInMyInventory)
        needFactor = 2;
    } else if (it instanceof ItemEntertainment) {
      // -- Entertainment ranking
      const mEnt = it.entertainmentModel;
      rankingScore = 1000;
      rankingScore += it.quantity;
      rankingScore += mEnt.value;
      // -- Entertainment need
      // need of entertainment if turning insane
      // mostly ignore entertainment altogether if san high enough
      if (rules.isActorDisturbed(this.controlledActor))
        needFactor = 4;
      else if (rules.isActorInsane(this.controlledActor))
        needFactor = 10;
      else if (rules.sanityToHoursUntilUnstable(this.controlledActor) >= 6)
        needFactor /= 10;
    } else if (it instanceof ItemLight) {
      // -- Light ranking
      const itLight = it as ItemLight;
      rankingScore = 1000;
      rankingScore += 10 * itLight.fovBonus;
      rankingScore += Math.floor(itLight.batteries / WorldTime.TURNS_PER_HOUR);
      // -- Light need
      // need for light if dark / no need at all if lit
      const mapL = this.controlledActor.location.map?.lighting;
      if (mapL === Lighting.DARKNESS)
        needFactor = 2;
      else if (mapL === Lighting.LIT)
        needFactor = 0;
    }
    // TODO -- other items
    // final score
    const score = rankingScore * needFactor;
    // make sure scoring is above zero as the item is not junk.
    return Math.max(Math.trunc(score), 1);
  }
  // ---- Inventory queries ----
  protected hasEnoughFoodFor(game: Game, nutritionNeed: number): boolean {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return false;
    const turnCounter = this.controlledActor.location.map?.localTime.turnCounter ?? 0;
    let nutritionTotal = 0;
    for (const it of inv.items) {
      if (it instanceof ItemFood) {
        nutritionTotal += game.rules.foodItemNutrition(it, turnCounter);
        if (nutritionTotal >= nutritionNeed) // exit asap
          return true;
      }
    }
    return false;
  }
  /** @deprecated */
  protected hasAtLeastFullStackOfItemTypeOrModel(it: Item, n: number): boolean {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return false;
    if (it.model.isStackable) {
      // we want N stacks of it.
      return this.countItemsQuantityOfModel(it.model) >= n * it.model.stackingLimit;
    } else {
      // not stackable, we are happy with N items of its type.
      return this.countItemsOfSameType(it.constructor as new (...args: any[]) => Item) >= n;
    }
  }
  protected hasItemOfModel(model: ItemModel): boolean {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return false;
    for (const it of inv.items)
      if (it.model === model)
        return true;
    return false;
  }
  protected countItemsQuantityOfModel(model: ItemModel): number {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return 0;
    let count = 0;
    for (const it of inv.items) {
      if (it.model === model)
        count += it.quantity;
    }
    return count;
  }
  protected hasItemOfType(tt: new (...args: any[]) => Item): boolean {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return false;
    return inv.hasItemOfType(tt);
  }
  protected countItemQuantityOfType(tt: new (...args: any[]) => Item, excludingThisOne: Item | null = null): number {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return 0;
    let quantity = 0;
    for (const otherIt of inv.items) {
      if (otherIt !== excludingThisOne && otherIt.constructor === tt)
        quantity += otherIt.quantity;
    }
    return quantity;
  }
  protected countItemsOfSameType(tt: new (...args: any[]) => Item, excludingThisOne: Item | null = null): number {
    const inv = this.controlledActor.inventory;
    if (!inv || inv.isEmpty)
      return 0;
    let count = 0;
    for (const otherIt of inv.items) {
      if (otherIt !== excludingThisOne && otherIt.constructor === tt)
        ++count;
    }
    return count;
  }
  // alpha10
  protected hasAnyRangedWeaponWithAmmo(excludingThisRangedWeapon: Item | null = null): boolean {
    const inv = this.controlledActor.inventory;
    if (!inv)
      return false;
    for (const it of inv.items) {
      if ((it !== excludingThisRangedWeapon) && (it instanceof ItemRangedWeapon)) {
        const itRw = it;
        if (itRw.ammo > 0)
          return true;
        for (const otherIt of inv.items) {
          if (otherIt instanceof ItemAmmo) {
            if (itRw.ammoType === otherIt.ammoType)
              return true;
          }
        }
      }
    }
    return false;
  }
  // ---- Running ----
  protected runIfPossible(rules: Rules): void {
    this.controlledActor.isRunning = rules.canActorRun(this.controlledActor).ok; // alpha10 fix
  }
  // ---- Distances & Safety ----
  protected gridDistancesSum(rules: Rules, from: Point, goals: Percept[]): number {
    let sum = 0;
    for (const to of goals)
      sum += rules.gridDistance(from, to.location.position);
    return sum;
  }
  // alpha10 new safety scoring
  /**
   * Compute safety from a list of dangers at a given position.
   * Returns a heuristic value, the higher the better the safety from the dangers; base 100.
   */
  protected safetyFrom(game: Game, from: Point, dangers: Percept[]): number {
    const rules: Rules = game.rules;
    const map = this.controlledActor.location.map;
    if (!map)
      return 0;
    const distFromDangers = this.gridDistancesSum(rules, from, dangers);
    const currentDistFromDangers = this.gridDistancesSum(rules, this.controlledActor.location.position, dangers);
    let score = 0;
    // Base score is 100*distance to danger then add minor heuristics.
    if (dangers.length > 0)
      score = Math.floor((100 * distFromDangers) / dangers.length);
    // Heuristics
    // 1. Reward more potential escape tiles.
    // 2. Reward going outside/inside if majority of dangers are inside/outside.
    // 3. Reward ladder/stairs exits.
    // 4. If can tire, prefer not jumping.
    // 5. Punish stepping into traps.
    // 6. Punish moving on or adj to explosives.
    // 1. Reward more potential escape tiles.
    // "Escape tile" = we can walk into it or open a door.
    // Better if it is farther to dangers. Better if ladders/stairs exit.
    for (const d of Direction.COMPASS) {
      const to = d.applyTo(from);
      let isEscape = rules.isWalkableFor(this.controlledActor, map, to.x, to.y).ok;
      if (!isEscape && this.controlledActor.model.abilities.canUseMapObjects) {
        const door = map.getMapObjectAt(to.x, to.y);
        if (door instanceof DoorWindow && !door.isBarricaded)
          isEscape = true;
      }
      if (isEscape) {
        score += 20;
        if (distFromDangers >= currentDistFromDangers) {
          score += 20;
        } else if (distFromDangers === currentDistFromDangers) {
          score += 10;
        }
        if (this.controlledActor.model.abilities.aiCanUseAIExits) {
          const adjExit = map.getExitAt(to);
          if (adjExit)
            score += 10;
        }
      }
    }
    // 2. Reward going outside/inside if majority of dangers are inside/outside.
    const isFromInside = map.getTileAt(from.x, from.y)?.isInside ?? false;
    let majorityDangersInside = 0;
    for (const p of dangers) {
      if (map.getTileAt(p.location.position.x, p.location.position.y)?.isInside)
        ++majorityDangersInside;
      else
        --majorityDangersInside;
    }
    if (isFromInside) {
      // from is inside, want that if majority dangers are outside.
      if (majorityDangersInside < 0) score += 100;
    } else {
      // from is outside, want that if majority dangers are inside.
      if (majorityDangersInside > 0) score += 100;
    }
    // 3. Reward ladder/stairs exits.
    if (this.controlledActor.model.abilities.aiCanUseAIExits) {
      const exitThere = map.getExitAt(from);
      if (exitThere && exitThere.isAnAIExit && exitThere.toMap?.district === map.district) {
        score += 200;
      }
    }
    // 4. If can tire, prefer not jumping.
    if (this.controlledActor.model.abilities.canTire && this.controlledActor.model.abilities.canJump) {
      const obj = map.getMapObjectAt(from.x, from.y);
      if (obj && obj.isJumpable) {
        score -= 50;
      }
    }
    // 5. Punish stepping into traps.
    // Less if has Light Feet
    if (this.isAnyUnsafeDamagingTrapThere(game, map, from)) {
      const lightFeetSkill = this.controlledActor.sheet.skillTable.getSkillLevel(SkillID.LIGHT_FEET);
      score -= Math.floor(100 / (1 + lightFeetSkill));
    }
    // 6. Punish moving on or adj to explosives.
    if (BaseAI.isAnyPrimedExplosiveThere(map, from))
      score -= 100;
    for (const d of Direction.COMPASS) {
      const to = d.applyTo(from);
      if (BaseAI.isAnyPrimedExplosiveThere(map, to))
        score -= 50;
    }
    // done
    return score;
  }
  // ---- Action filtering ----
  protected isValidFleeingAction(a: ActorAction | null | undefined): boolean {
    return !!a && (a instanceof ActionMoveStep || a instanceof ActionOpenDoor || a instanceof ActionSwitchPlace);
  }
  // ---- Actors predicates ----
  protected hasNoFoodItems(actor: Actor): boolean {
    const inv = actor.inventory;
    if (inv == null || inv.isEmpty) return true;
    return !inv.hasItemOfType(ItemFood);
  }
  protected isSoldier(actor: Actor | null): boolean {
    return actor != null && actor.controller instanceof AIController && actor.faction.id === FactionID.TheArmy;
  }
  protected wouldLikeToSleep(game: Game, actor: Actor): boolean {
    return game.rules.isAlmostSleepy(actor) || game.rules.isActorSleepy(actor);
  }
  protected isOccupiedByOther(map: GameMap, position: Point): boolean {
    const other = map.getActorAtPoint(position);
    return other != null && other !== this.controlledActor;
  }
  protected isAdjacentToEnemy(game: Game, actor: Actor | null): boolean {
    if (actor == null) return false;
    const map = actor.location.map;
    if (!map) return false;
    return map.hasAnyAdjacentInMap(actor.location.position, pt => {
      const other = map.getActorAtPoint(pt);
      if (other == null) return false;
      return game.rules.areEnemies(actor, other);
    });
  }
  protected isInside(actor: Actor | null): boolean {
    if (actor == null) return false;
    return actor.location.map?.getTileAt(actor.location.position.x, actor.location.position.y)?.isInside ?? false;
  }
  protected hasEquipedRangedWeapon(actor: Actor): boolean {
    return actor.getEquippedWeapon() instanceof ItemRangedWeapon;
  }
  protected getCompatibleAmmoItem(game: Game, rw: ItemRangedWeapon, checkForUseNow: boolean): ItemAmmo | null {
    const inv = this.controlledActor.inventory;
    if (inv == null) return null;
    // get first compatible ammo item.
    for (const it of inv.items) {
      if (!(it instanceof ItemAmmo)) continue;
      if (it.ammoType === rw.ammoType && (!checkForUseNow || game.rules.canActorUseItem(this.controlledActor, it).ok))
        return it;
    }
    // failed.
    return null;
  }
  protected getCompatibleRangedWeapon(_game: Game, am: ItemAmmo): ItemRangedWeapon | null {
    const inv = this.controlledActor.inventory;
    if (inv == null) return null;
    // get first compatible ranged weapon.
    for (const it of inv.items) {
      if (!(it instanceof ItemRangedWeapon)) continue;
      if (it.ammoType === am.ammoType) return it;
    }
    // failed.
    return null;
  }
  protected getBestBodyArmor(_game: Game, fn: ((it: Item) => boolean) | null): ItemBodyArmor | null {
    const inv = this.controlledActor.inventory;
    if (inv == null) return null;
    // best = most PRO.
    let bestPRO = 0;
    let bestArmor: ItemBodyArmor | null = null;
    for (const it of inv.items) {
      if (fn != null && !fn(it)) continue;
      if (!(it instanceof ItemBodyArmor)) continue;
      const pro = it.protectionHit + it.protectionShot;
      if (pro > bestPRO) {
        bestPRO = pro;
        bestArmor = it;
      }
    }
    // done.
    return bestArmor;
  }
  protected wantToEvadeMelee(game: Game, actor: Actor, courage: ActorCourage, target: Actor): boolean {
    ///////////////////////////////////////////////////////
    // Targets to evade or not:
    // 1. Yes : if fighting makes me tired vs a slower target (so i will lose my speed advantage by tiring) // alpha10 added slower target condition
    // 2. Yes : slower targets that will act next turn (kiting) and are targetting us.
    // 3. No  : target is weaker.
    // 4. Yes : actor is weaker.
    // 5. Unclear cases, utimately decide on courage.
    ///////////////////////////////////////////////////////
    const hasSpeedAdvantage = game.rules.actorSpeed(actor) > game.rules.actorSpeed(target);
    // 1. Yes : if fighting makes me tired vs a slower target (so i will lose my speed advantage by tiring) // alpha10 added slower target condition
    if (hasSpeedAdvantage && this.willTireAfterAttack(game, actor)) return true;
    // 2. Yes : slower targets that will act next turn (kiting) and are targetting us.
    if (hasSpeedAdvantage) {
      // don't evade if we're gonna act again.
      if (game.rules.willActorActAgainBefore(actor, target)) return false;
      // evade if he is targetting us.
      if (target.targetActor === actor) return true;
    }
    // get weaker actor in melee.
    const weakerOne = this.findWeakerInMelee(game, this.controlledActor, target);
    // 3. No : target is weaker.
    if (weakerOne === target) return false;
    // 4. Yes : actor is weaker.
    if (weakerOne === this.controlledActor) return true;
    // 5. Unclear cases, utimately decide on courage.
    return courage !== ActorCourage.COURAGEOUS;
  }
  /** Get which of the two actor can be considered as a weaker one in a melee fight. Returns the weaker actor, null if they are equal. */
  protected findWeakerInMelee(_game: Game, a: Actor, b: Actor): Actor | null {
    // alpha10 count how many hits it would take to kill each other
    // the actor that dies faster is the weaker one
    // silly cases of peope already dead, you never know -_-
    if (a.isDead) return a;
    if (b.isDead) return b;
    // count hits, lowest hit dies first
    const hitsToKillA = Math.ceil(a.hitPoints / b.currentMeleeAttack.damageValue);
    const hitsToKillB = Math.ceil(b.hitPoints / a.currentMeleeAttack.damageValue);
    return hitsToKillA < hitsToKillB ? a : hitsToKillA > hitsToKillB ? b : null;
  }
  protected willTireAfterAttack(_game: Game, actor: Actor): boolean {
    if (!actor.model.abilities.canTire) return false;
    const staAfter = actor.staminaPoints - Rules.STAMINA_COST_MELEE_ATTACK;
    return staAfter < Rules.STAMINA_MIN_FOR_ACTIVITY;
  }
  protected willTireAfterRunning(_game: Game, actor: Actor): boolean {
    if (!actor.model.abilities.canTire) return false;
    const staAfter = actor.staminaPoints - Rules.STAMINA_COST_RUNNING;
    return staAfter < Rules.STAMINA_MIN_FOR_ACTIVITY;
  }
  protected hasSpeedAdvantage(game: Game, actor: Actor, target: Actor): boolean {
    const actorSpeed = game.rules.actorSpeed(actor);
    const targetSpeed = game.rules.actorSpeed(target);
    // if better speed, yes.
    if (actorSpeed > targetSpeed) return true;
    // if we can run and the target can't and that would make us faster without tiring us, then yes!
    if (
      game.rules.canActorRun(actor).ok &&
      !game.rules.canActorRun(target).ok &&
      !this.willTireAfterRunning(game, actor) &&
      actorSpeed * 2 > targetSpeed
    )
      return true;
    // TODO: other tricky cases?
    return false;
  }
  protected needsLight(_game: Game): boolean {
    const map = this.controlledActor.location.map;
    if (!map) return false;
    switch (map.lighting) {
      case Lighting.DARKNESS:
        return true;
      case Lighting.LIT:
        return false;
      case Lighting.OUTSIDE:
        // alpha10 outside, lights have an effect only during the night.
        return map.localTime.isNight;
      default:
        throw new Error('unhandled lighting');
    }
  }
  /** Check if a point can be considered between two others. */
  protected isBetween(game: Game, A: Point, between: Point, B: Point): boolean {
    const A_between = game.rules.stdDistance(A, between);
    const B_between = game.rules.stdDistance(B, between);
    const A_B = game.rules.stdDistance(A, B);
    return A_between + B_between <= A_B + 0.25;
  }
  protected isDoorwayOrCorridor(_game: Game, map: GameMap, pos: Point): boolean {
    ///////////////////////////////////////
    // Check for simple shapes:
    // FREE-WALL-FREE       FREE-FREE-FREE
    // FREE-FREE-FREE       WALL-FREE-WALL
    // FREE-WALL-FREE       FREE-FREE-FREE
    ///////////////////////////////////////
    const wall = !(map.getTileAt(pos.x, pos.y)?.model.isWalkable ?? false);
    if (wall) return false;
    const isWall = (p: Point): boolean =>
      map.isInBoundsPoint(p) && !(map.getTileAt(p.x, p.y)?.model.isWalkable ?? false);
    const nWall = isWall(Direction.N.applyTo(pos));
    const sWall = isWall(Direction.S.applyTo(pos));
    const eWall = isWall(Direction.E.applyTo(pos));
    const wWall = isWall(Direction.W.applyTo(pos));
    const neWall = isWall(Direction.NE.applyTo(pos));
    const nwWall = isWall(Direction.NW.applyTo(pos));
    const seWall = isWall(Direction.SE.applyTo(pos));
    const swWall = isWall(Direction.SW.applyTo(pos));
    const freeCorners = !neWall && !seWall && !nwWall && !swWall;
    if (freeCorners && nWall && sWall && !eWall && !wWall) return true;
    if (freeCorners && eWall && wWall && !nWall && !sWall) return true;
    return false;
  }
  /** Not an enemy AND same faction. */
  protected isFriendOf(game: Game, other: Actor): boolean {
    return !game.rules.areEnemies(this.controlledActor, other) && this.controlledActor.faction === other.faction;
  }
  protected getNearestTargetFor(game: Game, actor: Actor): Actor | null {
    const map = actor.location.map;
    if (!map) return null;
    let nearest: Actor | null = null;
    // int.MaxValue in the C# original: no distance can ever beat it.
    let best = Number.MAX_SAFE_INTEGER;
    // quite uggly but better than computing the whole FoV...
    for (const a of map.actors) {
      if (a.isDead) continue;
      if (a === actor) continue;
      if (!game.rules.areEnemies(actor, a)) continue;
      const d = game.rules.gridDistance(a.location.position, actor.location.position);
      if (d < best) {
        if (d === 1 || LOS.canTraceViewLine(map, actor.location.position, a.location.position)) {
          best = d;
          nearest = a;
        }
      }
    }
    return nearest;
  }
  // alpha10
  protected getActorAttack(_game: Game, actor: Actor): Attack {
    return actor.getEquippedWeapon() instanceof ItemRangedWeapon ? actor.currentRangedAttack : actor.currentMeleeAttack;
  }
  // ---- Exits ----
  protected listAdjacentExits(_game: Game, fromLocation: Location): Exit[] | null {
    let list: Exit[] | null = null;
    for (const d of Direction.COMPASS) {
      const nextPos = d.applyTo(fromLocation.position);
      const exit = fromLocation.map?.getExitAt(nextPos);
      if (!exit) continue;
      if (!list) list = [];
      list.push(exit);
    }
    return list;
  }
  protected pickAnyAdjacentExit(game: Game, fromLocation: Location): Exit | null {
    // get all adjacent exits.
    const list = this.listAdjacentExits(game, fromLocation);
    // if none, failed.
    if (!list) return null;
    // pick one at random.
    return list[game.rules.roll(0, list.length)];
  }
  // ---- Map ----
  // alpha10
  public isAnyUnsafeDamagingTrapThere(game: Game, map: GameMap, pos: Point): boolean {
    const inv = map.getItemsAt(pos);
    if (!inv || inv.isEmpty) return false;
    return (
      inv.getFirstMatching(
        it =>
          it instanceof ItemTrap &&
          it.isActivated &&
          it.trapModel.damage > 0 &&
          !game.rules.isSafeFromTrap(it, this.controlledActor)
      ) !== null
    );
  }
  // alpha10
  public static isAnyPrimedExplosiveThere(map: GameMap, pos: Point): boolean {
    const inv = map.getItemsAt(pos);
    if (!inv || inv.isEmpty) return false;
    return inv.getFirstMatching(it => it instanceof ItemPrimedExplosive) !== null;
  }
  public static isZoneChange(map: GameMap, pos: Point): boolean {
    const zonesHere = map.getZonesAt(pos.x, pos.y);
    if (zonesHere.length === 0) return false;
    // adjacent to another zone.
    return map.hasAnyAdjacentInMap(pos, adj => {
      const zonesAdj = map.getZonesAt(adj.x, adj.y);
      if (zonesAdj.length === 0) return false;
      for (const z of zonesAdj) {
        if (!zonesHere.includes(z)) return true;
      }
      return false;
    });
  }
  // alpha10.1
  // 0 for null objs, total hitpoints for breakable objects, a silly large amount for unbreakable objs
  protected getObjectHitPoints(mobj: MapObject | null): number {
    if (!mobj) return 0;
    if (!mobj.isBreakable) return 100000;
    let hp = mobj.hitPoints;
    // add barricade hps
    if (mobj instanceof DoorWindow && mobj.isBarricaded) hp += mobj.barricadePoints;
    return hp;
  }
  // ---- Route checking ----
  // alpha10
  protected filterOutUnreachablePercepts(game: Game, percepts: Percept[], allowedActions: number): void {
    let i = 0;
    while (i < percepts.length) {
      if (this.canReachSimple(game, percepts[i].location.position, allowedActions)) i++;
      else percepts.splice(i, 1);
    }
  }
  // ---- Taboo items ----
  protected markItemAsTaboo(it: Item): void {
    if (this.m_TabooItems === null) this.m_TabooItems = [];
    else if (this.m_TabooItems.includes(it)) return;
    this.m_TabooItems.push(it);
  }
  protected unmarkItemAsTaboo(it: Item): void {
    if (this.m_TabooItems === null) return;
    const idx = this.m_TabooItems.indexOf(it);
    if (idx >= 0) this.m_TabooItems.splice(idx, 1);
    if (this.m_TabooItems.length === 0) this.m_TabooItems = null;
  }
  protected isItemTaboo(it: Item): boolean {
    if (this.m_TabooItems === null) return false;
    return this.m_TabooItems.includes(it);
  }
  // ---- Taboo tiles ----
  protected markTileAsTaboo(p: Point): void {
    if (this.m_TabooTiles === null) this.m_TabooTiles = [];
    else if (this.m_TabooTiles.some(pt => pt.equals(p))) return;
    this.m_TabooTiles.push(p);
  }
  protected isTileTaboo(p: Point): boolean {
    if (this.m_TabooTiles === null) return false;
    return this.m_TabooTiles.some(pt => pt.equals(p));
  }
  protected clearTabooTiles(): void {
    this.m_TabooTiles = null;
  }
  // ---- Taboo trades ----
  protected markActorAsRecentTrade(other: Actor): void {
    if (this.m_TabooTrades === null) this.m_TabooTrades = [];
    else if (this.m_TabooTrades.includes(other)) return;
    this.m_TabooTrades.push(other);
  }
  protected isActorTabooTrade(other: Actor): boolean {
    if (this.m_TabooTrades === null) return false;
    return this.m_TabooTrades.includes(other);
  }
  protected clearTabooTrades(): void {
    this.m_TabooTrades = null;
  }
  // ---- Taboo equipment slots ----
  // alpha10 Taboo Equipment slots
  // Simple solution to cases of ai getting stuck in an infinite unequip-equip loop.
  // Typically caused by conflicting behaviors that will "compete" for an equipment slot and will keep doing
  // infinite cycle of equip-unequip, each behavior trying to get "his" item equiped on the same doll part.
  // Current solution is to temporaly reserve a doll part by using taboo doll parts until the behavior is done with it.
  // It relies on each competing behavior checking and setting taboo slots correctly.
  // A Behavior wants to reserve an equipment slot for use in the next ai ticks.
  // The same Behavior can keep reserving the same slot over many ticks until it is done.
  // It must then release the slot by unmarking it.
  // Must reserve slots ONLY FOR AP FREE actions like Equip and Unequip.
  protected markEquipmentSlotAsTaboo(part: DollPart): void {
    this.m_ReservedEquipmentSlots |= 1 << part;
  }
  // A Behavior releases an equipment slot for use by other behaviors.
  // MUST RELEASE an equipment slot before returning a NON-AP FREE action or the lock will persist for next turn.
  protected unmarkEquipmentSlotAsTaboo(part: DollPart): void {
    this.m_ReservedEquipmentSlots &= ~(1 << part);
  }
  // A Behavior checks if an equipment slot is reserved and it should not do anything with it.
  protected isEquipmentSlotTaboo(part: DollPart): boolean {
    return (this.m_ReservedEquipmentSlots & (1 << part)) !== 0;
  }
}
