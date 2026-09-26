/**
 * CivilianAI.
 * Ported from src/Gameplay/AI/CivilianAI.cs
 *
 * Civilian AI : Civilians, Survivors, Cops.
 */

import { Activity } from '@data/Activity';
import { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { Percept } from '@engine/ai/Sensors';
import { ActionSleep, ActionTrade, ActionUnequipItem, ActionWait, SayFlags } from '@engine/actions/Actions';
import { Options } from '@engine/GameOptions';
import { Session } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { ItemFood } from '@engine/items/ItemFood';
import { ItemGrenade } from '@engine/items/ItemExplosive';
import { ItemRangedWeapon } from '@engine/items/ItemWeapon';
import { SkillID } from '@gameplay/Skills';
import { BaseAI, ItemSource, UseExitFlags } from './BaseAI';
import { OrderableAI } from './OrderableAI';
import { ExplorationData } from './ExplorationData';
import { LOSSensor, SensingFilter } from './GameplaySensors';
import { SpecialActions } from './RouteFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class CivilianAI extends OrderableAI {
  // Constants
  private static readonly FOLLOW_NPCLEADER_MAXDIST = 1;
  private static readonly FOLLOW_PLAYERLEADER_MAXDIST = 1;

  private static readonly EXPLORATION_MAX_LOCATIONS = 30;
  private static readonly EXPLORATION_MAX_ZONES = 6; // alpha10.1 doubled from 3 to 6

  private static readonly USE_EXIT_CHANCE = 20;

  private static readonly BUILD_TRAP_CHANCE = 50;
  private static readonly BUILD_SMALL_FORT_CHANCE = 20;
  private static readonly BUILD_LARGE_FORT_CHANCE = 50;
  private static readonly START_FORT_LINE_CHANCE = 1;

  private static readonly TELL_FRIEND_ABOUT_RAID_CHANCE = 20;
  private static readonly TELL_FRIEND_ABOUT_ENEMY_CHANCE = 10;
  private static readonly TELL_FRIEND_ABOUT_ITEMS_CHANCE = 10;
  private static readonly TELL_FRIEND_ABOUT_SOLDIER_CHANCE = 20;

  private static readonly MIN_TURNS_SAFE_TO_SLEEP = 10;

  private static readonly USE_STENCH_KILLER_CHANCE = 75;

  private static readonly HUNGRY_CHARGE_EMOTE_CHANCE = 50;
  private static readonly HUNGRY_PUSH_OBJECTS_CHANCE = 25;

  private static readonly LAW_ENFORCE_CHANCE = 30;

  private static readonly DONT_LEAVE_BEHIND_EMOTE_CHANCE = 50;

  private static readonly FIGHT_EMOTES = [
    'Go away', // flee
    "Damn it I'm trapped!", // trapped
    "I'm not afraid", // fight
  ];

  // alpha10
  private static readonly CANT_GET_ITEM_EMOTE = "Mmmh. Looks like I can't reach what I want.";

  // Unique emotes.
  private static readonly BIG_BEAR_EMOTES = ['You fool', "I'm fooled!", 'Be a man'];
  private static readonly FAMU_FATARU_EMOTES = ['Bakemono', 'Nani!?', 'Kawaii'];
  private static readonly SANTAMAN_EMOTES = [
    'DEM BLOODY KIDS!',
    "LEAVE ME ALONE I AIN'T HAVE NO PRESENTS!",
    "MERRY FUCKIN' CHRISTMAS",
  ];
  private static readonly ROGUEDJACK_EMOTES = [
    'Sorry butt I am le busy,',
    'I should have redone ze AI rootines!',
    'Let me test le something on you',
  ];
  private static readonly DUCKMAN_EMOTES = ["I'LL QUACK YOU BACK", 'THIS IS MY FINAL QUACK', "I'M GONNA QUACK YOU"];
  private static readonly HANS_VON_HANZ_EMOTES = ['RAUS', 'MEIN FUHRER!', 'KOMM HIER BITE'];

  private m_LOSSensor!: LOSSensor;

  private m_SafeTurns = 0;
  private m_Exploration!: ExplorationData;

  private m_Emotes: string[] | null = null;

  override takeControl(actor: Actor): void {
    super.takeControl(actor);

    this.m_SafeTurns = 0;
    this.m_Exploration = new ExplorationData(
      CivilianAI.EXPLORATION_MAX_LOCATIONS,
      CivilianAI.EXPLORATION_MAX_ZONES
    );

    this.m_LastEnemySaw = null;
    this.m_LastItemsSaw = null;
    this.m_LastSoldierSaw = null;
    this.m_LastRaidHeard = null;
    this.m_Emotes = null;
  }

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(
      SensingFilter.ACTORS | SensingFilter.ITEMS | SensingFilter.CORPSES
    );
  }

  protected override updateSensors(game: Game): Percept[] {
    // emotes!
    if (this.m_Emotes === null) {
      // FIXME: uggly code.
      const actor = this.controlledActor;
      if (actor.isUnique) {
        const uniques = Session.get().uniqueActors;
        if (actor === uniques.bigBear.theActor) this.m_Emotes = CivilianAI.BIG_BEAR_EMOTES;
        else if (actor === uniques.famuFataru.theActor) this.m_Emotes = CivilianAI.FAMU_FATARU_EMOTES;
        else if (actor === uniques.santaman.theActor) this.m_Emotes = CivilianAI.SANTAMAN_EMOTES;
        else if (actor === uniques.roguedjack.theActor) this.m_Emotes = CivilianAI.ROGUEDJACK_EMOTES;
        else if (actor === uniques.duckman.theActor) this.m_Emotes = CivilianAI.DUCKMAN_EMOTES;
        else if (actor === uniques.hansVonHanz.theActor) this.m_Emotes = CivilianAI.HANS_VON_HANZ_EMOTES;
        else this.m_Emotes = CivilianAI.FIGHT_EMOTES;
      } else {
        this.m_Emotes = CivilianAI.FIGHT_EMOTES;
      }
    }

    // sense.
    return this.m_LOSSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const actor = this.controlledActor;
    const fov = this.m_LOSSensor.fov;
    const mapPercepts = this.filterSameMap(game, percepts);

    ///////////////////////
    // 0. Equip best item.  // alpha10
    // 1. Follow order
    // 2. Normal behavior.
    ///////////////////////

    // alpha10
    // don't run by default.
    actor.isRunning = false;

    // 0. Equip best item
    const bestEquip = this.behaviorEquipBestItems(game, true, true);
    if (bestEquip) {
      return bestEquip;
    }
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

    // 2. Normal behavior.
    //////////////////////////////////////////////////////////////////////
    // BEHAVIOR
    // - FLAGS
    // "courageous" : has leader, see leader, he is fighting and actor not tired.
    // - RULES
    // 0 run away from primed explosives.
    // 1 throw grenades at enemies.
    // alpha10 OBSOLETE 2 equip weapon/armor
    // 3 fire at nearest (always if has leader, half of the time if not)  - check directives
    // 4 fight or flee, shout
    // 5 use medicine
    // 6 rest if tired
    // alpha10 obsolete and redundant with rule 4! 7 charge enemy if courageous
    // 8 eat when hungry (also eat corpses)
    // 9 sleep when almost sleepy and safe.
    // 10 drop light/tracker with no batteries
    // alpha10 OBSOLETE 11 equip light/tracker/scent spray
    // 12 make room for food items if needed.
    // 13 get nearby item/trade (not if seeing enemy) - check directives.
    // 14 if hungry and no food, charge at people for food (option, not follower or law enforcer)
    // 15 use stench killer.
    // 16 close door behind me.
    // 17 use entertainment
    // 18 follow leader.
    // 19 take lead (if leadership)
    // 20 if hungry, tear down barricades & push objects.
    // 21 go revive corpse.
    // 22 use exit.
    // 23 build trap or fortification.
    // 24 tell friend about latest raid.
    // 25 tell friend about latest friendly soldier.
    // 26 tell friend about latest enemy.
    // 27 tell friend about latest items.
    // 28 (law enforcer) watch for murderers.
    // 29 (leader) don't leave followers behind.
    // 30 explore.
    // 31 wander.
    //////////////////////////////////////////////////////////////////////

    // get data.
    const enemies = this.filterEnemies(game, mapPercepts);
    const hasEnemies = enemies !== null && enemies.length > 0;
    const checkOurLeader = actor.hasLeader && !this.dontFollowLeader;
    const seeLeader = checkOurLeader && fov.has(`${actor.leader!.location.position.x},${actor.leader!.location.position.y}`);
    const isLeaderFighting = checkOurLeader && this.isAdjacentToEnemy(game, actor.leader);
    // "courageous" (rule 7 is obsolete in alpha10, kept here for reference)
    // const isCourageous = checkOurLeader && seeLeader && isLeaderFighting && !game.rules.isActorTired(actor);

    // safety counter.
    if (hasEnemies) this.m_SafeTurns = 0;
    else ++this.m_SafeTurns;

    // exploration.
    this.m_Exploration.update(actor.location);

    // clear taboo tiles : periodically or when changing maps.
    if (
      (actor.location.map?.localTime.turnCounter ?? 0) % WorldTime.TURNS_PER_HOUR === 0 ||
      (this.prevLocation.map !== null && this.prevLocation.map !== actor.location.map)
    ) {
      this.clearTabooTiles();
    }
    // clear trades.
    if ((actor.location.map?.localTime.turnCounter ?? 0) % WorldTime.TURNS_PER_DAY === 0) {
      this.clearTabooTrades();
    }

    // last enemy saw.
    if (hasEnemies && enemies) this.m_LastEnemySaw = enemies[game.rules.roll(0, enemies.length)];

    // 0 run away from primed explosives.
    const runFromExplosives = this.behaviorFleeFromExplosives(game, this.filterStacks(game, mapPercepts));
    if (runFromExplosives) {
      actor.activity = Activity.FLEEING_FROM_EXPLOSIVE;
      return runFromExplosives;
    }

    // 1 throw grenades at enemies.
    // if directive off, unequip.
    if (!this.directives.canThrowGrenades) {
      // unequip grenade?
      const eqGrenade = actor.getEquippedWeapon();
      if (eqGrenade instanceof ItemGrenade) {
        const unequipGre = new ActionUnequipItem(actor, game, eqGrenade);
        if (unequipGre.isLegal()) {
          actor.activity = Activity.IDLE;
          return unequipGre;
        }
      }
    }
    // throw?
    if (hasEnemies) {
      const throwAction = this.behaviorThrowGrenade(game, fov, enemies!);
      if (throwAction) {
        return throwAction;
      }
    }

    // 3 fire at nearest enemy
    if (hasEnemies && this.directives.canFireWeapons && actor.getEquippedWeapon() instanceof ItemRangedWeapon) {
      const fireTargets = this.filterFireTargets(game, enemies!);
      if (fireTargets) {
        const nearestTarget = this.filterNearest(game, fireTargets)!;
        const target = nearestTarget.percepted as Actor;

        // flee contact from someone SLOWER with no ranged weapon.
        if (
          game.rules.gridDistance(nearestTarget.location.position, actor.location.position) === 1 &&
          !this.hasEquipedRangedWeapon(target) &&
          this.hasSpeedAdvantage(game, actor, target)
        ) {
          // flee!
          const fleeAction = this.behaviorWalkAwayFrom(game, nearestTarget);
          if (fleeAction) {
            this.runIfPossible(game.rules);
            actor.activity = Activity.FLEEING;
            return fleeAction;
          }
        }

        // fire ze missiles!
        const fireAction = this.behaviorRangedAttack(game, nearestTarget);
        if (fireAction) {
          actor.activity = Activity.FIGHTING;
          actor.targetActor = target;
          return fireAction;
        }
      }
    }

    // 4 fight or flee, shout
    if (hasEnemies) {
      // shout?
      if (game.rules.rollChance(50)) {
        const friends = this.filterNonEnemies(game, mapPercepts);
        if (friends) {
          const shoutAction = this.behaviorWarnFriends(
            game,
            friends,
            this.filterNearest(game, enemies!)!.percepted as Actor
          );
          if (shoutAction) {
            actor.activity = Activity.IDLE;
            return shoutAction;
          }
        }
      }
      // fight or flee.
      const allowedChargeActions = SpecialActions.JUMP | SpecialActions.DOORS; // alpha10
      const fightOrFlee = this.behaviorFightOrFlee(
        game,
        enemies!,
        seeLeader,
        isLeaderFighting,
        this.directives.courage,
        this.m_Emotes ?? CivilianAI.FIGHT_EMOTES,
        allowedChargeActions
      );
      if (fightOrFlee) {
        return fightOrFlee;
      }
    }

    // 5 use medicine
    const useMedAction = this.behaviorUseMedecine(game, 2, 1, 2, 4, 2);
    if (useMedAction) {
      actor.activity = Activity.IDLE;
      return useMedAction;
    }

    // 6 rest if tired
    const restAction = this.behaviorRestIfTired(game);
    if (restAction) {
      actor.activity = Activity.IDLE;
      return new ActionWait(actor, game);
    }

    // 8 eat when hungry (also eat corpses)
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

    // 9 sleep when almost sleepy and safe.
    if (
      this.m_SafeTurns >= CivilianAI.MIN_TURNS_SAFE_TO_SLEEP &&
      this.directives.canSleep &&
      this.wouldLikeToSleep(game, actor) &&
      this.isInside(actor) &&
      game.rules.canActorSleep(actor).ok
    ) {
      // secure sleep.
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

    // 10 drop useless light/tracker/spray
    const dropUseless = this.behaviorDropUselessItem(game);
    if (dropUseless) {
      actor.activity = Activity.IDLE;
      return dropUseless;
    }

    // 12 make room for food items if needed.
    // &&
    // 13 get nearby item/trade (not if seeing enemy)
    // ignore not currently visible items & blocked items.
    if (!hasEnemies && this.directives.canTakeItems) {
      const turn = actor.location.map?.localTime.turnCounter ?? 0;

      // Get items
      // alpha10 new common behaviour code, also used by GangAI
      // lastItemsSaw is the C# `ref m_LastItemsSaw` out-parameter.
      const lastItemsSawBox: { value: Percept | null } = { value: this.m_LastItemsSaw };
      const getItemAction = this.behaviorGoGetInterestingItems(
        game,
        mapPercepts!,
        false,
        false,
        CivilianAI.CANT_GET_ITEM_EMOTE,
        true,
        lastItemsSawBox
      );
      this.m_LastItemsSaw = lastItemsSawBox.value;

      if (getItemAction) return getItemAction;

      // Trade
      if (this.directives.canTrade) {
        // get actors we want to trade with.
        const tradingActors = this.filterOut(
          game,
          this.filterNonEnemies(game, mapPercepts),
          (p: Percept) => {
            if (p.turn !== turn) return true;
            // C# writes `p.Percepted as Actor` and dereferences it directly,
            // relying on FilterNonEnemies yielding only actor percepts. The TS
            // Percept is a union, so skip anything that is not an Actor
            // rather than blowing up on `undefined.model`.
            if (!(p.percepted instanceof Actor)) return true;
            const other = p.percepted;
            // dont bother player or someone we can't trade with or already did trade.
            if (other.isPlayer) return true;
            if (!game.rules.canActorInitiateTradeWith(actor, other).ok) return true;
            if (this.isActorTabooTrade(other)) return true;
            // alpha10 dont bother someone who is fighting or fleeing
            if (
              other.activity === Activity.CHASING ||
              other.activity === Activity.FIGHTING ||
              other.activity === Activity.FLEEING ||
              other.activity === Activity.FLEEING_FROM_EXPLOSIVE
            )
              return true;
            // dont bother if no interesting items.
            if (!this.hasAnyInterestingItem(game, other.inventory, ItemSource.ANOTHER_ACTOR)) return true;
            if (!(other.controller as BaseAI | null)?.hasAnyInterestingItem(game, actor.inventory, ItemSource.ANOTHER_ACTOR))
              return true;
            // alpha10 reject if unreachable by baseai simple behaviours
            if (
              !this.canReachSimple(game, other.location.position, SpecialActions.DOORS | SpecialActions.JUMP)
            )
              return true;
            // don't reject.
            return false;
          }
        );
        // trade with nearest.
        if (tradingActors && tradingActors.length > 0) {
          const tradeTarget = this.filterNearest(game, tradingActors)!.percepted as Actor;
          if (game.rules.isAdjacent(actor.location, tradeTarget.location)) {
            const tradeAction = new ActionTrade(actor, game, tradeTarget);
            if (tradeAction.isLegal()) {
              // remember we tried to trade.
              this.markActorAsRecentTrade(tradeTarget);
              // say, so we make sure we spend a turn and won't loop.
              game.DoSay(
                actor,
                tradeTarget,
                `Hey ${tradeTarget.name}, let's make a deal!`,
                SayFlags.NONE
              );
              return tradeAction;
            }
          } else {
            const bump = this.behaviorIntelligentBumpToward(
              game,
              tradeTarget.location.position,
              false,
              false
            );
            if (bump) {
              // alpha10 announce it to make it clear to the player whats happening but dont spend AP (free action)
              // might spam for a few turns, but its better than not understanding whats going on.
              game.DoSay(
                actor,
                tradeTarget,
                `Hey ${tradeTarget.name}, let's make a deal!`,
                SayFlags.IS_FREE_ACTION
              );

              actor.activity = Activity.FOLLOWING;
              actor.targetActor = tradeTarget;
              return bump;
            }
          }
        }
      }
    }

    // 14 if hungry and no food, charge at people for food (option, not follower or law enforcer)
    if (
      Options.isAggressiveHungryCiviliansOn &&
      mapPercepts !== null &&
      !actor.hasLeader &&
      !actor.model.abilities.isLawEnforcer &&
      game.rules.isActorHungry(actor) &&
      this.hasNoFoodItems(actor)
    ) {
      const targetForFood = this.filterNearest(
        game,
        this.filterActors(game, mapPercepts, a => {
          // reject self, dead and leader/follower.
          if (a === actor) return false;
          if (a.isDead) return false;
          if (!a.inventory || a.inventory.isEmpty) return false;
          if (a.leader === actor || actor.leader === a) return false;

          // actor has food or is standing on food.
          if (a.inventory.hasItemOfType(ItemFood)) return true;
          const groundInv = a.location.map?.getItemsAt(a.location.position) ?? null;
          if (!groundInv || groundInv.isEmpty) return false;
          return groundInv.hasItemOfType(ItemFood);
        })
      );

      if (targetForFood) {
        // alpha10 hungry civs can break and push
        const chargeAction = this.behaviorChargeEnemy(game, targetForFood, true, true);
        if (chargeAction) {
          // randomly emote.
          if (game.rules.rollChance(CivilianAI.HUNGRY_CHARGE_EMOTE_CHANCE)) {
            game.DoSay(
              actor,
              targetForFood.percepted as Actor,
              'HEY! YOU! SHARE SOME FOOD!',
              SayFlags.IS_FREE_ACTION | SayFlags.IS_DANGER
            );
          }

          // chaaarge!
          actor.activity = Activity.FIGHTING;
          actor.targetActor = targetForFood.percepted as Actor;
          return chargeAction;
        }
      }
    }

    // 15 use stench killer.
    if (game.rules.rollChance(CivilianAI.USE_STENCH_KILLER_CHANCE)) {
      const sprayAction = this.behaviorUseStenchKiller(game);
      if (sprayAction) {
        actor.activity = Activity.IDLE;
        return sprayAction;
      }
    }

    // 16 close door behind me.
    const closeBehindMe = this.behaviorCloseDoorBehindMe(game, this.prevLocation);
    if (closeBehindMe) {
      actor.activity = Activity.IDLE;
      return closeBehindMe;
    }

    // 17 use entertainment
    if (actor.model.abilities.hasSanity) {
      if (actor.sanity < 0.75 * game.rules.actorMaxSanity(actor)) {
        const entAction = this.behaviorUseEntertainment(game);
        if (entAction) {
          actor.activity = Activity.IDLE;
          return entAction;
        }
      }
      // TODO -- consider moving this to DropUselessItems()
      const dropEnt = this.behaviorDropBoringEntertainment(game);
      if (dropEnt) {
        actor.activity = Activity.IDLE;
        return dropEnt;
      }
    }

    // 18 build trap or fortification.
    // alpha10.1 moved trap/fortification rule before following leader rule so they will do it much more often
    if (game.rules.rollChance(CivilianAI.BUILD_TRAP_CHANCE)) {
      const trapAction = this.behaviorBuildTrap(game);
      if (trapAction) {
        actor.activity = Activity.IDLE;
        return trapAction;
      }
    }
    // large fortification.
    if (game.rules.rollChance(CivilianAI.BUILD_LARGE_FORT_CHANCE)) {
      const buildAction = this.behaviorBuildLargeFortification(game, CivilianAI.START_FORT_LINE_CHANCE);
      if (buildAction) {
        actor.activity = Activity.IDLE;
        return buildAction;
      }
    }
    // small fortification.
    if (game.rules.rollChance(CivilianAI.BUILD_SMALL_FORT_CHANCE)) {
      const buildAction = this.behaviorBuildSmallFortification(game);
      if (buildAction) {
        actor.activity = Activity.IDLE;
        return buildAction;
      }
    }

    // 19 follow leader
    if (checkOurLeader) {
      const leader = actor.leader!;
      const lastKnownLeaderPosition = leader.location.position;
      const isLeaderVisible = fov.has(`${lastKnownLeaderPosition.x},${lastKnownLeaderPosition.y}`);
      const maxDist = leader.isPlayer
        ? CivilianAI.FOLLOW_PLAYERLEADER_MAXDIST
        : CivilianAI.FOLLOW_NPCLEADER_MAXDIST;
      const followAction = this.behaviorFollowActor(
        game,
        leader,
        lastKnownLeaderPosition,
        isLeaderVisible,
        maxDist
      );
      if (followAction) {
        actor.activity = Activity.FOLLOWING;
        actor.targetActor = leader;
        return followAction;
      }
    }

    // 20 take lead (if leadership)
    const hasLeadership = actor.sheet.skillTable.getSkillLevel(SkillID.LEADERSHIP) >= 1;
    if (hasLeadership) {
      const canLead = !checkOurLeader && actor.countFollowers < game.rules.actorMaxFollowers(actor);
      if (canLead) {
        const nearestFriend = this.filterNearest(game, this.filterNonEnemies(game, mapPercepts));
        if (nearestFriend) {
          // alpha10 only if unreachable by baseai simple behaviours
          if (
            this.canReachSimple(
              game,
              nearestFriend.location.position,
              SpecialActions.DOORS | SpecialActions.JUMP
            )
          ) {
            const leadAction = this.behaviorLeadActor(game, nearestFriend);
            if (leadAction) {
              actor.activity = Activity.IDLE;
              actor.targetActor = nearestFriend.percepted as Actor;
              return leadAction;
            }
          }
        }
      }
    }

    // 21 if hungry, tear down barricades & push objects.
    if (game.rules.isActorHungry(actor)) {
      const attackBarricadeAction = this.behaviorAttackBarricade(game);
      if (attackBarricadeAction) {
        // emote.
        game.DoEmote(actor, 'Open damn it! I know there is food there!', true);

        // go!
        actor.activity = Activity.IDLE;
        return attackBarricadeAction;
      }
      if (game.rules.rollChance(CivilianAI.HUNGRY_PUSH_OBJECTS_CHANCE)) {
        // alpha10.1 do that only inside where food is more likely to be hidden, pushing cars outside is stupid -_-
        const map = actor.location.map;
        if (map && map.getTileAt(actor.location.position.x, actor.location.position.y)?.isInside) {
          const pushAction = this.behaviorPushNonWalkableObject(game);
          if (pushAction) {
            // emote.
            game.DoEmote(actor, 'Where is all the damn food?!', true);

            // go!
            actor.activity = Activity.IDLE;
            return pushAction;
          }
        }
      }
    }

    // 22 go revive corpse.
    const revive = this.behaviorGoReviveCorpse(game, this.filterCorpses(game, mapPercepts));
    if (revive) {
      actor.activity = Activity.IDLE;
      return revive;
    }

    // 23 use exit.
    if (game.rules.rollChance(CivilianAI.USE_EXIT_CHANCE)) {
      const useExit = this.behaviorUseExit(game, UseExitFlags.DONT_BACKTRACK);
      if (useExit) {
        actor.activity = Activity.IDLE;
        return useExit;
      }
    }

    // 24 tell friend about latest raid.
    // tell?
    if (this.m_LastRaidHeard && game.rules.rollChance(CivilianAI.TELL_FRIEND_ABOUT_RAID_CHANCE)) {
      const tellAction = this.behaviorTellFriendAboutPercept(game, this.m_LastRaidHeard);
      if (tellAction) {
        actor.activity = Activity.IDLE;
        return tellAction;
      }
    }

    // 25 tell friend about latest soldier.
    // update percept.
    const seeingSoldier = this.filterFirst(game, mapPercepts, p => {
      const other = p.percepted as Actor;
      if (!other || other === actor) return false;
      return this.isSoldier(other);
    });
    if (seeingSoldier) this.m_LastSoldierSaw = seeingSoldier;
    // tell?
    if (game.rules.rollChance(CivilianAI.TELL_FRIEND_ABOUT_SOLDIER_CHANCE) && this.m_LastSoldierSaw) {
      const tellAction = this.behaviorTellFriendAboutPercept(game, this.m_LastSoldierSaw);
      if (tellAction) {
        actor.activity = Activity.IDLE;
        return tellAction;
      }
    }

    // 26 tell friend about latest enemy.
    if (game.rules.rollChance(CivilianAI.TELL_FRIEND_ABOUT_ENEMY_CHANCE) && this.m_LastEnemySaw) {
      const tellAction = this.behaviorTellFriendAboutPercept(game, this.m_LastEnemySaw);
      if (tellAction) {
        actor.activity = Activity.IDLE;
        return tellAction;
      }
    }

    // 27 tell friend about latest items.
    if (game.rules.rollChance(CivilianAI.TELL_FRIEND_ABOUT_ITEMS_CHANCE) && this.m_LastItemsSaw) {
      const tellAction = this.behaviorTellFriendAboutPercept(game, this.m_LastItemsSaw);
      if (tellAction) {
        actor.activity = Activity.IDLE;
        return tellAction;
      }
    }

    // 28 (law enforcer) watch for murderers.
    if (actor.model.abilities.isLawEnforcer && mapPercepts !== null && game.rules.rollChance(CivilianAI.LAW_ENFORCE_CHANCE)) {
      const lawTarget: { value: Actor | null } = { value: null };
      const lawAction = this.behaviorEnforceLaw(game, mapPercepts, lawTarget);
      if (lawAction) {
        actor.targetActor = lawTarget.value;
        return lawAction;
      }
    }

    // 29 (leader) don't leave followers behind.
    if (actor.countFollowers > 0) {
      const stickTogetherResult = this.behaviorDontLeaveFollowersBehind(game, 2);
      const stickTogether = stickTogetherResult.action;
      if (stickTogether) {
        const target = stickTogetherResult.target!;

        // emote?
        if (game.rules.rollChance(CivilianAI.DONT_LEAVE_BEHIND_EMOTE_CHANCE)) {
          if (target.isSleeping) {
            game.DoEmote(actor, `patiently waits for ${target.name} to wake up.`);
          } else {
            if (fov.has(`${target.location.position.x},${target.location.position.y}`)) {
              game.DoEmote(actor, `Come on ${target.name}! Hurry up!`);
            } else {
              game.DoEmote(actor, `Where the hell is ${target.name}?`);
            }
          }
        }

        // go!
        actor.activity = Activity.IDLE;
        return stickTogether;
      }
    }

    // 30 explore
    const exploreAction = this.behaviorExplore(game, this.m_Exploration);
    if (exploreAction) {
      actor.activity = Activity.IDLE;
      return exploreAction;
    }

    // 31 wander.
    actor.activity = Activity.IDLE;
    return this.behaviorWander(game, null, this.m_Exploration);
  }
}
