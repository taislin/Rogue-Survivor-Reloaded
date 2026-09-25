/**
 * FeralDogAI.
 * Ported from src/Gameplay/AI/FeralDogAI.cs
 *
 * alpha10 this unused for now
 */

import { Activity } from '@data/Activity';
import type { ActorAction } from '@data/ActorAction';
import { Odor } from '@data/Odor';
import type { Percept } from '@engine/ai/Sensors';
import { Point } from '@engine/Point';
import { ActionSleep, ActionWait, SayFlags } from '@engine/actions/Actions';
import { BaseAI } from './BaseAI';
import { LOSSensor, SensingFilter, SmellSensor } from './GameplaySensors';
import { SpecialActions } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class FeralDogAI extends BaseAI {
  // Constants
  private static readonly FOLLOW_NPCLEADER_MAXDIST = 1;
  private static readonly FOLLOW_PLAYERLEADER_MAXDIST = 1;
  /** dogs run to their target when close enough */
  private static readonly RUN_TO_TARGET_DISTANCE = 3;

  private static readonly FIGHT_EMOTES = [
    'waf', // flee
    'waf!?', // trapped
    'GRRRRR WAF WAF', // fight
  ];

  private m_LOSSensor!: LOSSensor;
  private m_LivingSmellSensor!: SmellSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS | SensingFilter.CORPSES);
    this.m_LivingSmellSensor = new SmellSensor(Odor.LIVING);
  }

  protected override updateSensors(game: Game): Percept[] {
    const list = this.m_LOSSensor.sense(game, this.controlledActor);
    const living = this.m_LivingSmellSensor.sense(game, this.controlledActor);
    return [...list, ...living];
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const mapPercepts = this.filterSameMap(game, percepts);

    //////////////////////////////////////////////////////////////
    // 1 defend our leader.
    // 2 attack or flee enemies.
    // 3 go eat food on floor if almost hungry
    // 4 go eat corpses if hungry
    // 5 rest or sleep
    // 6 follow leader
    // 7 wander
    /////////////////////////////////////////////////////////////

    // 1 defend our leader
    const leader = actor.leader;
    if (leader) {
      const target = leader.targetActor;
      if (target && target.location.map === actor.location.map) {
        // emote: bark
        game.DoSay(actor, target, 'GRRRRRR WAF WAF', SayFlags.IS_FREE_ACTION | SayFlags.IS_DANGER);
        // charge.
        const chargeEnemy = this.behaviorStupidBumpToward(game, target.location.position, true, false);
        if (chargeEnemy) {
          this.runToIfCloseTo(game, target.location.position, FeralDogAI.RUN_TO_TARGET_DISTANCE);
          actor.activity = Activity.FIGHTING;
          actor.targetActor = target;
          return chargeEnemy;
        }
      }
    }

    const enemies = this.filterEnemies(game, mapPercepts);
    const isLeaderVisible =
      !!leader && this.m_LOSSensor.fov.has(`${leader.location.position.x},${leader.location.position.y}`);
    const isLeaderFighting = !!leader && this.isAdjacentToEnemy(game, leader);

    // 2 attack or flee enemies.
    if (enemies) {
      const allowedChargeActions = SpecialActions.JUMP; // alpha10
      const ff = this.behaviorFightOrFlee(
        game,
        enemies,
        isLeaderVisible,
        isLeaderFighting,
        this.directives.courage,
        FeralDogAI.FIGHT_EMOTES,
        allowedChargeActions
      );
      if (ff) {
        // run to (or away if fleeing) if close.
        if (actor.targetActor) {
          this.runToIfCloseTo(game, actor.targetActor.location.position, FeralDogAI.RUN_TO_TARGET_DISTANCE);
        }
        return ff;
      }
    }

    // 3 go eat food on floor if almost hungry
    if (game.IsAlmostHungry(actor)) {
      const itemsStack = this.filterStacks(game, mapPercepts);
      if (itemsStack) {
        const eatFood = this.behaviorGoEatFoodOnGround(game, itemsStack);
        if (eatFood) {
          this.runIfPossible(game.rules);
          actor.activity = Activity.IDLE;
          return eatFood;
        }
      }
    }

    // 4 go eat corpses if hungry
    if (game.rules.isActorHungry(actor)) {
      const corpses = this.filterCorpses(game, mapPercepts);
      if (corpses) {
        const eatCorpses = this.behaviorGoEatCorpse(game, corpses);
        if (eatCorpses) {
          this.runIfPossible(game.rules);
          actor.activity = Activity.IDLE;
          return eatCorpses;
        }
      }
    }

    // 5 rest or sleep
    if (game.rules.isActorTired(actor)) {
      actor.activity = Activity.IDLE;
      return new ActionWait(actor, game);
    }
    if (game.rules.isActorSleepy(actor)) {
      actor.activity = Activity.SLEEPING;
      return new ActionSleep(actor, game);
    }

    // 6 follow leader
    if (leader) {
      const lastKnownLeaderPosition = leader.location.position;
      const maxDist = leader.isPlayer
        ? FeralDogAI.FOLLOW_PLAYERLEADER_MAXDIST
        : FeralDogAI.FOLLOW_NPCLEADER_MAXDIST;
      const followAction = this.behaviorFollowActor(game, leader, lastKnownLeaderPosition, isLeaderVisible, maxDist);
      if (followAction) {
        actor.isRunning = false;
        actor.activity = Activity.FOLLOWING;
        actor.targetActor = leader;
        return followAction;
      }
    }

    // 7 wander
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }

  // ── Dogs specifics ───────────────────────────────────────────────────────

  protected runToIfCloseTo(game: Game, pos: Point, closeDistance: number): void {
    if (game.rules.gridDistance(this.controlledActor.location.position, pos) <= closeDistance) {
      this.controlledActor.isRunning = game.rules.canActorRun(this.controlledActor).ok;
    } else {
      this.controlledActor.isRunning = false;
    }
  }
}
