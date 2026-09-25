/**
 * CHARGuardAI.
 * Ported from src/Gameplay/AI/CHARGuardAI.cs
 *
 * CHAR Guard AI.
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { ActorCourage } from '@data/ActorDirective';
import { MemorizedSensor, Percept } from '@engine/ai/Sensors';
import { ActionSay, ActionSleep, ActionWait, SayFlags } from '@engine/actions/Actions';
import { FactionID } from '@gameplay/GameFactions';
import { OrderableAI } from './OrderableAI';
import { LOSSensor, SensingFilter } from './GameplaySensors';
import { SpecialActions } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class CHARGuardAI extends OrderableAI {
  // Constants
  private static readonly LOS_MEMORY = 10;

  private static readonly FIGHT_EMOTES = ['Go away', "Damn it I'm trapped!", 'Hey'];

  private m_LOSSensor!: LOSSensor;
  private m_MemorizedSensor!: MemorizedSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS | SensingFilter.ITEMS);
    this.m_MemorizedSensor = new MemorizedSensor(this.m_LOSSensor, CHARGuardAI.LOS_MEMORY);
  }

  protected override updateSensors(game: Game): Percept[] {
    return this.m_MemorizedSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const mapPercepts = this.filterSameMap(game, percepts);

    // alpha10
    // don't run by default.
    actor.isRunning = false;

    // 0. Equip best item
    const bestEquip = this.behaviorEquipBestItems(game, true, true);
    if (bestEquip) return bestEquip;
    // end alpha10

    // 1. Follow order
    if (this.order) {
      const orderAction = this.executeOrder(game, this.order, mapPercepts, null);
      if (!orderAction) {
        this.setOrder(null);
      } else {
        actor.activity = Activity.FOLLOWING_ORDER;
        return orderAction;
      }
    }

    ///////////////////////////////////////
    // alpha10 OBSOLETE 1 equip weapon
    // alpha10 OBSOLETE 2 equip armor
    // 3 fire at nearest enemy.
    // 4 hit adjacent enemy.
    // 5 warn trepassers.
    // 6 shout
    // 7 rest if tired
    // 8 charge enemy
    // 9 sleep when sleepy.
    // 10 follow leader.
    // 11 wander in CHAR office.
    // 12 wander.
    //////////////////////////////////////

    // don't run by default.
    actor.isRunning = false;

    // get data.
    const allEnemies = this.filterEnemies(game, mapPercepts);
    const currentEnemies = this.filterCurrent(game, allEnemies);
    const checkOurLeader = actor.hasLeader && !this.dontFollowLeader;
    const hasAnyEnemies = allEnemies !== null;

    // 3 fire at nearest enemy.
    if (currentEnemies) {
      const fireTargets = this.filterFireTargets(game, currentEnemies);
      if (fireTargets) {
        const nearestTarget = this.filterNearest(game, fireTargets)!;
        const targetActor = nearestTarget.percepted as Actor;

        const fireAction = this.behaviorRangedAttack(game, nearestTarget);
        if (fireAction) {
          actor.activity = Activity.FIGHTING;
          actor.targetActor = targetActor;
          return fireAction;
        }
      }
    }

    // 4 hit adjacent enemy
    if (currentEnemies) {
      // fight or flee?
      const allowedChargeActions = SpecialActions.JUMP | SpecialActions.DOORS; // alpha10
      const fightOrFlee = this.behaviorFightOrFlee(
        game,
        currentEnemies,
        true,
        true,
        ActorCourage.COURAGEOUS,
        CHARGuardAI.FIGHT_EMOTES,
        allowedChargeActions
      );
      if (fightOrFlee) return fightOrFlee;
    }

    // 5 warn trepassers.
    const nonEnemies = this.filterNonEnemies(game, mapPercepts);
    if (nonEnemies) {
      const trespassers = this.filter(game, nonEnemies, p => {
        const other = p.percepted as Actor;
        if (other.faction.id === FactionID.TheCHARCorporation) return false;

        // alpha10 bug fix only if visible right now!
        if (p.turn !== (actor.location.map?.localTime.turnCounter ?? 0)) return false;

        return game.IsInCHARProperty(other.location);
      });
      if (trespassers) {
        // Hey YOU!
        const nearestTrespasser = this.filterNearest(game, trespassers)!;
        const trespasser = nearestTrespasser.percepted as Actor;

        game.DoMakeAggression(actor, trespasser);

        actor.activity = Activity.FIGHTING;
        actor.targetActor = trespasser;
        return new ActionSay(
          actor,
          game,
          trespasser,
          'Hey YOU!',
          SayFlags.IS_IMPORTANT | SayFlags.IS_DANGER
        );
      }
    }

    // 6 shout
    if (hasAnyEnemies && nonEnemies) {
      const nearestAllEnemy = this.filterNearest(game, allEnemies)!;
      const shoutAction = this.behaviorWarnFriends(game, nonEnemies, nearestAllEnemy.percepted as Actor);
      if (shoutAction) {
        actor.activity = Activity.IDLE;
        return shoutAction;
      }
    }

    // 7 rest if tired
    const restAction = this.behaviorRestIfTired(game);
    if (restAction) {
      actor.activity = Activity.IDLE;
      return new ActionWait(actor, game);
    }

    // 8 charge/chase enemy
    if (allEnemies) {
      let chasePercept = this.filterNearest(game, allEnemies)!;

      // cheat a bit for good chasing behavior.
      if (actor.location.equals(chasePercept.location)) {
        // memorized location reached, chase now the actor directly (cheat so they appear more intelligent)
        const chasedActor = chasePercept.percepted as Actor;
        chasePercept = new Percept(
          chasedActor,
          actor.location.map?.localTime.turnCounter ?? 0,
          chasedActor.location
        );
      }

      // alpha10 chase only if reachable
      if (
        this.canReachSimple(
          game,
          chasePercept.location.position,
          SpecialActions.DOORS | SpecialActions.JUMP
        )
      ) {
        // chase.
        const chargeAction = this.behaviorChargeEnemy(game, chasePercept, false, false);
        if (chargeAction) {
          actor.activity = Activity.FIGHTING;
          actor.targetActor = chasePercept.percepted as Actor;
          return chargeAction;
        }
      }
    }

    // 9 sleep when sleepy
    if (game.rules.isActorSleepy(actor) && !hasAnyEnemies) {
      const sleepAction = this.behaviorSleep(game, this.m_LOSSensor.fov);
      if (sleepAction) {
        if (sleepAction instanceof ActionSleep) actor.activity = Activity.SLEEPING;
        return sleepAction;
      }
    }

    // 10 follow leader
    if (checkOurLeader) {
      const leader = actor.leader!;
      const lastKnownLeaderPosition = leader.location.position;
      const isLeaderVisible = this.m_LOSSensor.fov.has(
        `${lastKnownLeaderPosition.x},${lastKnownLeaderPosition.y}`
      );
      const followAction = this.behaviorFollowActor(game, leader, lastKnownLeaderPosition, isLeaderVisible, 1);
      if (followAction) {
        actor.activity = Activity.FOLLOWING;
        actor.targetActor = leader;
        return followAction;
      }
    }

    // 11 wander in CHAR office.
    const wanderInOfficeAction = this.behaviorWander(game, loc => game.IsInCHAROffice(loc), null);
    if (wanderInOfficeAction) {
      actor.activity = Activity.IDLE;
      return wanderInOfficeAction;
    }

    // 12 wander
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
