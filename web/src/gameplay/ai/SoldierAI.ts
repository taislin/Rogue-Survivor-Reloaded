/**
 * SoldierAI.
 * Ported from src/Gameplay/AI/SoldierAI.cs
 *
 * Soldier AI
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { ActorCourage } from '@data/ActorDirective';
import { MemorizedSensor, Percept } from '@engine/ai/Sensors';
import { ActionSleep } from '@engine/actions/Actions';
import { OrderableAI } from './OrderableAI';
import { ExplorationData } from './ExplorationData';
import { LOSSensor, SensingFilter } from './GameplaySensors';
import { SpecialActions } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class SoldierAI extends OrderableAI {
  // Constants
  private static readonly LOS_MEMORY = 10;
  private static readonly FOLLOW_LEADER_MIN_DIST = 1;
  private static readonly FOLLOW_LEADER_MAX_DIST = 2;

  private static readonly EXPLORATION_LOCATIONS = 30;
  private static readonly EXPLORATION_ZONES = 3;

  private static readonly BUILD_SMALL_FORT_CHANCE = 20;
  private static readonly BUILD_LARGE_FORT_CHANCE = 50;
  private static readonly START_FORT_LINE_CHANCE = 1;

  private static readonly DONT_LEAVE_BEHIND_EMOTE_CHANCE = 50;

  private static readonly FIGHT_EMOTES = ['Damn', "Fuck I'm cornered", 'Die'];

  private m_LOSSensor!: LOSSensor;
  private m_MemLOSSensor!: MemorizedSensor;

  private m_Exploration!: ExplorationData;

  override takeControl(actor: Actor): void {
    super.takeControl(actor);

    this.m_Exploration = new ExplorationData(
      SoldierAI.EXPLORATION_LOCATIONS,
      SoldierAI.EXPLORATION_ZONES
    );
  }

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS | SensingFilter.ITEMS);
    this.m_MemLOSSensor = new MemorizedSensor(this.m_LOSSensor, SoldierAI.LOS_MEMORY);
  }

  protected override updateSensors(game: Game): Percept[] {
    return this.m_MemLOSSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const mapPercepts = this.filterSameMap(game, percepts);

    // alpha10
    // don't run by default.
    actor.isRunning = false;

    // 0. Equip best item
    const bestEquip = this.behaviorEquipBestItems(game, false, true);
    if (bestEquip) return bestEquip;
    // end alpha10

    // 1. Follow order
    if (this.order) {
      const orderAction = this.executeOrder(game, this.order, mapPercepts, this.m_Exploration);
      if (!orderAction) {
        this.setOrder(null);
      } else {
        actor.activity = Activity.FOLLOWING_ORDER;
        return orderAction;
      }
    }

    /////////////////////////////////////
    // 0 run away from primed explosives.
    // 1 throw grenades at enemies.
    // alpha10 OBSOLETE 2 equip weapon/armor.
    // 3 shout, fire/hit at nearest enemy.
    // 4 rest if tired
    // alpha10 obsolete and redundant with rule 3! 5 charge enemy.
    // 6 use med.
    // 7 sleep.
    // 8 chase old enemy.
    // 9 build fortification.
    // 10 hang around leader.
    // 11 (leader) don't leave followers behind.
    // 12 explore.
    // 13 wander.
    ////////////////////////////////////

    // get data.
    const allEnemies = this.filterEnemies(game, mapPercepts);
    const currentEnemies = this.filterCurrent(game, allEnemies);
    const checkOurLeader = actor.hasLeader && !this.dontFollowLeader;
    const hasCurrentEnemies = currentEnemies !== null;
    const hasAnyEnemies = allEnemies !== null;

    // exploration.
    this.m_Exploration.update(actor.location);

    // 0 run away from primed explosives.
    const runFromExplosives = this.behaviorFleeFromExplosives(game, this.filterStacks(game, mapPercepts));
    if (runFromExplosives) {
      actor.activity = Activity.FLEEING_FROM_EXPLOSIVE;
      return runFromExplosives;
    }

    // 1 throw grenades at enemies.
    if (hasCurrentEnemies && currentEnemies) {
      const throwAction = this.behaviorThrowGrenade(game, this.m_LOSSensor.fov, currentEnemies);
      if (throwAction) return throwAction;
    }

    // 3 shout, fire/hit at nearest enemy.
    if (hasCurrentEnemies && currentEnemies) {
      // shout?
      if (game.rules.rollChance(50)) {
        const friends = this.filterNonEnemies(game, mapPercepts);
        if (friends) {
          const nearestEnemy = this.filterNearest(game, currentEnemies)!;
          const shoutAction = this.behaviorWarnFriends(game, friends, nearestEnemy.percepted as Actor);
          if (shoutAction) {
            actor.activity = Activity.IDLE;
            return shoutAction;
          }
        }
      }

      // fire?
      const fireTargets = this.filterFireTargets(game, currentEnemies);
      if (fireTargets) {
        const nearestTarget = this.filterNearest(game, fireTargets)!;
        const fireAction = this.behaviorRangedAttack(game, nearestTarget);
        if (fireAction) {
          actor.activity = Activity.FIGHTING;
          actor.targetActor = nearestTarget.percepted as Actor;
          return fireAction;
        }
      }

      // fight or flee?
      const allowedChargeActions = SpecialActions.JUMP | SpecialActions.DOORS; // alpha10
      const fightOrFlee = this.behaviorFightOrFlee(
        game,
        currentEnemies,
        true,
        true,
        ActorCourage.COURAGEOUS,
        SoldierAI.FIGHT_EMOTES,
        allowedChargeActions
      );
      if (fightOrFlee) return fightOrFlee;
    }

    // 4 rest if tired
    const restAction = this.behaviorRestIfTired(game);
    if (restAction) {
      actor.activity = Activity.IDLE;
      return restAction;
    }

    // 6 use medicine
    const useMedAction = this.behaviorUseMedecine(game, 2, 1, 2, 4, 2);
    if (useMedAction) {
      actor.activity = Activity.IDLE;
      return useMedAction;
    }

    // 7 sleep.
    if (!hasAnyEnemies && this.wouldLikeToSleep(game, actor) && this.isInside(actor) && game.rules.canActorSleep(actor).ok) {
      // secure sleep?
      const secureSleepAction = this.behaviorSecurePerimeter(game, this.m_LOSSensor.fov);
      if (secureSleepAction) {
        actor.activity = Activity.IDLE;
        return secureSleepAction;
      }

      // sleep.
      const sleepAction = this.behaviorSleep(game, this.m_LOSSensor.fov);
      if (sleepAction) {
        if (sleepAction instanceof ActionSleep) actor.activity = Activity.SLEEPING;
        return sleepAction;
      }
    }

    // 8 chase old enemy
    const turn = actor.location.map?.localTime.turnCounter ?? 0;
    const oldEnemies = this.filter(game, allEnemies, p => p.turn !== turn);
    if (oldEnemies) {
      let chasePercept = this.filterNearest(game, oldEnemies)!;

      // cheat a bit for good chasing behavior.
      if (actor.location.equals(chasePercept.location)) {
        // memorized location reached, chase now the actor directly (cheat so they appear more intelligent)
        const chasedActor = chasePercept.percepted as Actor;
        chasePercept = new Percept(chasedActor, turn, chasedActor.location);
      }

      // chase.
      const chargeAction = this.behaviorChargeEnemy(game, chasePercept, false, false);
      if (chargeAction) {
        actor.activity = Activity.FIGHTING;
        actor.targetActor = chasePercept.percepted as Actor;
        return chargeAction;
      }
    }

    // 9 build fortification
    // large fortification.
    if (game.rules.rollChance(SoldierAI.BUILD_LARGE_FORT_CHANCE)) {
      const buildAction = this.behaviorBuildLargeFortification(game, SoldierAI.START_FORT_LINE_CHANCE);
      if (buildAction) {
        actor.activity = Activity.IDLE;
        return buildAction;
      }
    }
    // small fortification.
    if (game.rules.rollChance(SoldierAI.BUILD_SMALL_FORT_CHANCE)) {
      const buildAction = this.behaviorBuildSmallFortification(game);
      if (buildAction) {
        actor.activity = Activity.IDLE;
        return buildAction;
      }
    }

    // 10 hang around leader.
    if (checkOurLeader) {
      const leader = actor.leader!;
      const lastKnownLeaderPosition = leader.location.position;
      const followAction = this.behaviorHangAroundActor(
        game,
        leader,
        lastKnownLeaderPosition,
        SoldierAI.FOLLOW_LEADER_MIN_DIST,
        SoldierAI.FOLLOW_LEADER_MAX_DIST
      );
      if (followAction) {
        actor.activity = Activity.FOLLOWING;
        actor.targetActor = leader;
        return followAction;
      }
    }

    // 11 (leader) don't leave followers behind.
    if (actor.countFollowers > 0) {
      const stickTogetherResult = this.behaviorDontLeaveFollowersBehind(game, 4);
      const stickTogether = stickTogetherResult.action;
      if (stickTogether) {
        const target = stickTogetherResult.target!;
        // emote?
        if (game.rules.rollChance(SoldierAI.DONT_LEAVE_BEHIND_EMOTE_CHANCE)) {
          if (target.isSleeping) {
            game.DoEmote(actor, `patiently waits for ${target.name} to wake up.`);
          } else if (this.m_LOSSensor.fov.has(`${target.location.position.x},${target.location.position.y}`)) {
            game.DoEmote(actor, `${target.name}! Don't lag behind!`);
          } else {
            game.DoEmote(actor, `Where the hell is ${target.name}?`);
          }
        }

        // go!
        actor.activity = Activity.IDLE;
        return stickTogether;
      }
    }

    // 12 explore
    const exploreAction = this.behaviorExplore(game, this.m_Exploration);
    if (exploreAction) {
      actor.activity = Activity.IDLE;
      return exploreAction;
    }

    // 13 wander
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null, this.m_Exploration);
  }
}
