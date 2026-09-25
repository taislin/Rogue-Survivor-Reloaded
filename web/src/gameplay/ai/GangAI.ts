/**
 * GangAI.
 * Ported from src/Gameplay/AI/GangAI.cs
 *
 * Gang AI : Bikers, Gangstas...
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { ActorCourage } from '@data/ActorDirective';
import { MemorizedSensor, Percept } from '@engine/ai/Sensors';
import { ActionSay, ActionSleep, ActionWait, SayFlags } from '@engine/actions/Actions';
import { WorldTime } from '@engine/WorldTime';
import { SkillID } from '@gameplay/Skills';
import { ItemSource } from './BaseAI';
import { OrderableAI } from './OrderableAI';
import { ExplorationData } from './ExplorationData';
import { LOSSensor, SensingFilter } from './GameplaySensors';
import { SpecialActions } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class GangAI extends OrderableAI {
  // Constants
  private static readonly FOLLOW_NPCLEADER_MAXDIST = 1;
  private static readonly FOLLOW_PLAYERLEADER_MAXDIST = 1;
  private static readonly LOS_MEMORY = 10;

  private static readonly EXPLORATION_LOCATIONS = 30;
  private static readonly EXPLORATION_ZONES = 3;

  private static readonly DONT_LEAVE_BEHIND_EMOTE_CHANCE = 50;

  private static readonly FIGHT_EMOTES = ['Fuck you', "Fuck it I'm trapped!", 'Come on'];

  // alpha10
  private static readonly CANT_GET_ITEM_EMOTE = "Fuck can't get that shit!";

  private m_LOSSensor!: LOSSensor;
  private m_MemorizedSensor!: MemorizedSensor;

  private m_Exploration!: ExplorationData;

  // alpha10 needed as ref param to a new behavior but unused
  private m_DummyPerceptLastItemsSaw: { value: Percept | null } = { value: null };

  override takeControl(actor: Actor): void {
    super.takeControl(actor);

    this.m_Exploration = new ExplorationData(GangAI.EXPLORATION_LOCATIONS, GangAI.EXPLORATION_ZONES);
  }

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS | SensingFilter.ITEMS);
    this.m_MemorizedSensor = new MemorizedSensor(this.m_LOSSensor, GangAI.LOS_MEMORY);
  }

  protected override updateSensors(game: Game): Percept[] {
    return this.m_MemorizedSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const fov = this.m_LOSSensor.fov;
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
      const orderAction = this.executeOrder(game, this.order, mapPercepts, this.m_Exploration);
      if (!orderAction) {
        this.setOrder(null);
      } else {
        actor.activity = Activity.FOLLOWING_ORDER;
        return orderAction;
      }
    }

    //////////////////////////////////////////////////////////////////////
    // partial copy of Civilian AI 8) but always courageous and gets into fights.
    // BEHAVIOR
    // - FLAGS
    // "courageous" : always if not tired.
    // - RULES
    // alpha10 OBSOLETE 1 equip weapon/armor
    // 2 fire at nearest.
    // 3 shout, fight or flee.
    // 4 use medecine
    // 5 rest if tired
    // 7 eat when hungry (also eat corpses)
    // 8 sleep.
    // 9 drop light/tracker with no batteries
    // 11 get nearby item (not if seeing enemy)
    // 12 steal item from someone.
    // 13 tear down barricade
    // 14 follow leader
    // 15 take lead (if leadership)
    // 16 (leader) don't leave follower behind.
    // 17 explore
    // 18 wander
    //////////////////////////////////////////////////////////////////////

    // get data.
    const allEnemies = this.filterEnemies(game, mapPercepts);
    const currentEnemies = this.filterCurrent(game, allEnemies);
    const hasCurrentEnemies = currentEnemies !== null;
    const hasAnyEnemies = allEnemies !== null;
    const checkOurLeader = actor.hasLeader && !this.dontFollowLeader;
    const seeLeader = checkOurLeader && fov.has(`${actor.leader!.location.position.x},${actor.leader!.location.position.y}`);
    const isLeaderFighting = checkOurLeader && this.isAdjacentToEnemy(game, actor.leader);

    // exploration.
    this.m_Exploration.update(actor.location);

    // alpha10 needed due to uggraded get item behavior
    // clear taboo tiles : periodically or when changing maps.
    if (
      (actor.location.map?.localTime.turnCounter ?? 0) % WorldTime.TURNS_PER_HOUR === 0 ||
      this.prevLocation.map !== actor.location.map
    ) {
      this.clearTabooTiles();
    }

    // 2 fire at nearest enemy (always if has leader, half of the time if not)
    if (hasCurrentEnemies && currentEnemies && (checkOurLeader || game.rules.rollChance(50))) {
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
    }

    // 3 shout, fight or flee
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

      // fight or flee.
      // alpha10
      let allowedChargeActions = SpecialActions.JUMP | SpecialActions.DOORS;
      // gangs are allowed to make a mess :)
      allowedChargeActions |= SpecialActions.BREAK | SpecialActions.PUSH;
      const fightOrFlee = this.behaviorFightOrFlee(
        game,
        currentEnemies,
        seeLeader,
        isLeaderFighting,
        ActorCourage.COURAGEOUS,
        GangAI.FIGHT_EMOTES,
        allowedChargeActions
      );
      if (fightOrFlee) return fightOrFlee;
    }

    // 4 use medecine
    const useMedAction = this.behaviorUseMedecine(game, 2, 1, 2, 4, 2);
    if (useMedAction) {
      actor.activity = Activity.IDLE;
      return useMedAction;
    }

    // 5 rest if tired
    const restAction = this.behaviorRestIfTired(game);
    if (restAction) {
      actor.activity = Activity.IDLE;
      return new ActionWait(actor, game);
    }

    // 7 eat when hungry (also eat corpses)
    if (game.rules.isActorHungry(actor)) {
      let eatAction = this.behaviorEat(game);
      if (eatAction) {
        actor.activity = Activity.IDLE;
        return eatAction;
      }
      if (game.rules.isActorStarving(actor) || game.rules.isActorInsane(actor)) {
        eatAction = this.behaviorGoEatCorpse(game, this.filterCorpses(game, mapPercepts));
        if (eatAction) {
          actor.activity = Activity.IDLE;
          return eatAction;
        }
      }
    }

    // 8 sleep.
    if (!hasAnyEnemies && this.wouldLikeToSleep(game, actor) && this.isInside(actor) && game.rules.canActorSleep(actor).ok) {
      // secure sleep?
      const secureSleepAction = this.behaviorSecurePerimeter(game, fov);
      if (secureSleepAction) {
        actor.activity = Activity.IDLE;
        return secureSleepAction;
      }

      // sleep.
      const sleepAction = this.behaviorSleep(game, fov);
      if (sleepAction) {
        if (sleepAction instanceof ActionSleep) actor.activity = Activity.SLEEPING;
        return sleepAction;
      }
    }

    // 9 drop light/tracker with no batteries
    const dropOutOfBatteries = this.behaviorDropUselessItem(game);
    if (dropOutOfBatteries) {
      actor.activity = Activity.IDLE;
      return dropOutOfBatteries;
    }

    // 11 get nearby item (not if seeing enemy)
    // ignore not currently visible items & blocked items.
    // alpha10 upgraded rule to use the same new core behavior as CivilianAI with custom params
    if (!hasCurrentEnemies && mapPercepts) {
      // alpha10 new common behaviour code, also used by CivilianAI, but Gangs can break and push
      const getItemAction = this.behaviorGoGetInterestingItems(
        game,
        mapPercepts,
        true,
        true,
        GangAI.CANT_GET_ITEM_EMOTE,
        false,
        this.m_DummyPerceptLastItemsSaw
      );

      if (getItemAction) return getItemAction;
    }

    // 12 steal item from someone.
    if (!hasCurrentEnemies) {
      const mayStealFrom = this.filterActors(game, this.filterCurrent(game, mapPercepts), a => {
        if (!a.inventory || a.inventory.countItems === 0 || this.isFriendOf(game, a)) return false;
        if (game.rules.rollChance(game.rules.actorUnsuspicousChance(actor, a))) {
          // emote.
          game.DoEmote(a, `moves unnoticed by ${actor.name}.`);
          // unnoticed.
          return false;
        }
        return this.hasAnyInterestingItem(game, a.inventory, ItemSource.ANOTHER_ACTOR);
      });

      if (mayStealFrom) {
        // alpha10 make sure to consider only reachable victims
        let allowedActions =
          SpecialActions.ADJ_TO_DEST_IS_GOAL | SpecialActions.JUMP | SpecialActions.DOORS;
        // gangs can break & push stuff
        allowedActions |= SpecialActions.BREAK | SpecialActions.PUSH;
        this.filterOutUnreachablePercepts(game, mayStealFrom, allowedActions);

        if (mayStealFrom.length > 0) {
          // get data.
          const nearest = this.filterNearest(game, mayStealFrom)!;
          const victim = nearest.percepted as Actor;
          const wantIt = this.firstInterestingItem(game, victim.inventory, ItemSource.ANOTHER_ACTOR);

          // make an enemy of him.
          game.DoMakeAggression(actor, victim);

          // declare my evil intentions.
          actor.activity = Activity.CHASING;
          actor.targetActor = victim;
          return new ActionSay(
            actor,
            game,
            victim,
            `Hey! That's some nice ${wantIt!.model.singleName} you have here!`,
            SayFlags.IS_IMPORTANT | SayFlags.IS_DANGER
          );
        }
      }
    }

    // 13 tear down barricade
    const attackBarricadeAction = this.behaviorAttackBarricade(game);
    if (attackBarricadeAction) {
      actor.activity = Activity.IDLE;
      return attackBarricadeAction;
    }

    // 14 follow leader
    if (checkOurLeader) {
      const leader = actor.leader!;
      const lastKnownLeaderPosition = leader.location.position;
      const isLeaderVisible = fov.has(`${lastKnownLeaderPosition.x},${lastKnownLeaderPosition.y}`);
      const maxDist = leader.isPlayer
        ? GangAI.FOLLOW_PLAYERLEADER_MAXDIST
        : GangAI.FOLLOW_NPCLEADER_MAXDIST;
      const followAction = this.behaviorFollowActor(game, leader, lastKnownLeaderPosition, isLeaderVisible, maxDist);
      if (followAction) {
        actor.activity = Activity.FOLLOWING;
        actor.targetActor = leader;
        return followAction;
      }
    }

    // 15 take lead (if leadership)
    const isLeader = actor.sheet.skillTable.getSkillLevel(SkillID.LEADERSHIP) >= 1;
    const canLead =
      !checkOurLeader && isLeader && actor.countFollowers < game.rules.actorMaxFollowers(actor);
    if (canLead) {
      const nearestFriend = this.filterNearest(game, this.filterNonEnemies(game, mapPercepts));
      if (nearestFriend) {
        const leadAction = this.behaviorLeadActor(game, nearestFriend);
        if (leadAction) {
          actor.activity = Activity.IDLE;
          actor.targetActor = nearestFriend.percepted as Actor;
          return leadAction;
        }
      }
    }

    // 16 (leader) don't leave followers behind.
    if (actor.countFollowers > 0) {
      const stickTogetherResult = this.behaviorDontLeaveFollowersBehind(game, 3);
      const stickTogether = stickTogetherResult.action;
      if (stickTogether) {
        const target = stickTogetherResult.target!;

        // emote?
        if (game.rules.rollChance(GangAI.DONT_LEAVE_BEHIND_EMOTE_CHANCE)) {
          if (target.isSleeping) {
            game.DoEmote(actor, `patiently waits for ${target.name} to wake up.`);
          } else if (fov.has(`${target.location.position.x},${target.location.position.y}`)) {
            game.DoEmote(actor, `Hey ${target.name}! Fucking move!`);
          } else {
            game.DoEmote(actor, `Where is that ${target.name} retard?`);
          }
        }

        // go!
        actor.activity = Activity.IDLE;
        return stickTogether;
      }
    }

    // 17 explore
    const exploreAction = this.behaviorExplore(game, this.m_Exploration);
    if (exploreAction) {
      actor.activity = Activity.IDLE;
      return exploreAction;
    }

    // 18 wander
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null, this.m_Exploration);
  }
}
