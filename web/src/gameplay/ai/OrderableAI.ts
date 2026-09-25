/**
 * OrderableAI.
 * Ported from src/Gameplay/AI/OrderableAI.cs
 *
 * Base class for AIs that can follow orders and is notified of raid events.
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { ActorOrder, ActorTasks } from '@data/ActorOrder';
import type { Location } from '@data/Location';
import {
  ActionBarricadeDoor,
  ActionBuildFortification,
  ActionSay,
  ActionShout,
  ActionSleep,
  ActionWait,
  SayFlags,
} from '@engine/actions/Actions';
import { Percept } from '@engine/ai/Sensors';
import { DoorWindow } from '@engine/mapobjects/MapObjects';
import { RaidType } from '@engine/Session';
import { BaseAI } from './BaseAI';
import type { ExplorationData } from './ExplorationData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export abstract class OrderableAI extends BaseAI {
  protected m_LastEnemySaw: Percept | null = null;
  protected m_LastItemsSaw: Percept | null = null;
  protected m_LastSoldierSaw: Percept | null = null;
  protected m_LastRaidHeard: Percept | null = null;

  protected m_ReachedPatrolPoint = false;
  protected m_ReportStage = 0;

  dontFollowLeader = false;

  // ── Orders ───────────────────────────────────────────────────────────────

  override setOrder(newOrder: ActorOrder | null): void {
    super.setOrder(newOrder);

    // reset order states.
    this.m_ReachedPatrolPoint = false;
    this.m_ReportStage = 0;
  }

  protected executeOrder(
    game: Game,
    order: ActorOrder,
    percepts: Percept[] | null,
    exploration: ExplorationData | null
  ): ActorAction | null {
    const actor = this.controlledActor;

    // cancel if leader is dead!
    if (!actor.leader || actor.leader.isDead) return null;

    // execute task.
    switch (order.task) {
      case ActorTasks.BARRICADE_ONE:
        return this.executeBarricading(game, order.location, false);
      case ActorTasks.BARRICADE_MAX:
        return this.executeBarricading(game, order.location, true);
      case ActorTasks.BUILD_SMALL_FORTIFICATION:
        return this.executeBuildFortification(game, order.location, false);
      case ActorTasks.BUILD_LARGE_FORTIFICATION:
        return this.executeBuildFortification(game, order.location, true);
      case ActorTasks.DROP_ALL_ITEMS:
        return this.executeDropAllItems(game);
      case ActorTasks.GUARD:
        return this.executeGuard(game, order.location, percepts);
      case ActorTasks.PATROL:
        return this.executePatrol(game, order.location, percepts, exploration);
      case ActorTasks.REPORT_EVENTS:
        return this.executeReport(game, percepts);
      case ActorTasks.SLEEP_NOW:
        return this.executeSleepNow(game, percepts);
      case ActorTasks.FOLLOW_TOGGLE:
        return this.executeToggleFollow(game);
      case ActorTasks.WHERE_ARE_YOU:
        return this.executeReportPosition(game);
      default:
        throw new Error(`order task not handled: ${String(order.task)}`);
    }
  }

  // ── Barricading ──────────────────────────────────────────────────────────

  private executeBarricading(game: Game, location: Location, toTheMax: boolean): ActorAction | null {
    // 1. Check validity.
    // 2. Perform.
    const actor = this.controlledActor;

    // 1. Check validity.
    const barricadeMap = location.map;
    if (!barricadeMap || actor.location.map !== barricadeMap) return null;
    const door = barricadeMap.getMapObjectAtPoint(location.position);
    if (!(door instanceof DoorWindow)) return null;
    if (!game.rules.canActorBarricadeDoor(actor, door).ok) return null;

    // 2.1 If adjacent, barricade.
    if (game.rules.isAdjacent(actor.location.position, location.position)) {
      const barricadeAction = new ActionBarricadeDoor(actor, game, door);
      if (barricadeAction.isLegal()) {
        if (!toTheMax) this.setOrder(null);
        return barricadeAction;
      }
      return null;
    }

    // 2.2 Move closer.
    const moveAction = this.behaviorIntelligentBumpToward(game, location.position, false, false);
    if (moveAction) {
      this.runIfPossible(game.rules);
      return moveAction;
    }
    return null;
  }

  // ── Building fortification ───────────────────────────────────────────────

  private executeBuildFortification(game: Game, location: Location, isLarge: boolean): ActorAction | null {
    // 1. Check validity.
    // 2. Perform.
    const actor = this.controlledActor;

    // 1. Check validity.
    if (actor.location.map !== location.map) return null;
    if (!game.rules.canActorBuildFortification(actor, location.position, isLarge).ok) return null;

    // 2.1 If adjacent, build.
    if (game.rules.isAdjacent(actor.location.position, location.position)) {
      const buildAction = new ActionBuildFortification(actor, game, location.position, isLarge);
      if (buildAction.isLegal()) {
        this.setOrder(null);
        return buildAction;
      }
      return null;
    }

    // 2.2 Move closer.
    const moveAction = this.behaviorIntelligentBumpToward(game, location.position, false, false);
    if (moveAction) {
      this.runIfPossible(game.rules);
      return moveAction;
    }
    return null;
  }

  // ── Guarding ─────────────────────────────────────────────────────────────

  private executeGuard(game: Game, location: Location, percepts: Percept[] | null): ActorAction | null {
    // 1. See enemy => raise alarm.
    const alarm = this.raiseAlarm(game, percepts);
    if (alarm) return alarm;

    const actor = this.controlledActor;

    // 1. Mimick leader cell phone usage.
    const phoneAction = this.behaviorEquipCellPhone(game);
    if (phoneAction) {
      actor.activity = Activity.IDLE;
      return phoneAction;
    }
    const unequipPhoneAction = this.behaviorUnequipCellPhoneIfLeaderHasNot(game);
    if (unequipPhoneAction) {
      actor.activity = Activity.IDLE;
      return unequipPhoneAction;
    }

    // 2. Move to guard position.
    if (!actor.location.position.equals(location.position)) {
      const bumpAction = this.behaviorIntelligentBumpToward(game, location.position, false, false);
      if (bumpAction) {
        actor.activity = Activity.IDLE;
        return bumpAction;
      }
    }

    // 3. Eat if hungry.
    if (game.rules.isActorHungry(actor)) {
      const eatAction = this.behaviorEat(game);
      if (eatAction) {
        actor.activity = Activity.IDLE;
        return eatAction;
      }
    }

    // 4. Heal if need to.
    const useMedAction = this.behaviorUseMedecine(game, 2, 1, 2, 4, 2);
    if (useMedAction) {
      actor.activity = Activity.IDLE;
      return useMedAction;
    }

    // 5. Wait.
    actor.activity = Activity.IDLE;
    return new ActionWait(actor, game);
  }

  // ── Patrolling ───────────────────────────────────────────────────────────

  private executePatrol(
    game: Game,
    location: Location,
    percepts: Percept[] | null,
    exploration: ExplorationData | null
  ): ActorAction | null {
    // 1. See enemy => raise alarm.
    const alarm = this.raiseAlarm(game, percepts);
    if (alarm) return alarm;

    const actor = this.controlledActor;

    // Check patrol position reached.
    if (!this.m_ReachedPatrolPoint) {
      this.m_ReachedPatrolPoint = actor.location.position.equals(location.position);
    }

    // 1. Mimick leader cell phone usage.
    const phoneAction = this.behaviorEquipCellPhone(game);
    if (phoneAction) {
      actor.activity = Activity.IDLE;
      return phoneAction;
    }
    const unequipPhoneAction = this.behaviorUnequipCellPhoneIfLeaderHasNot(game);
    if (unequipPhoneAction) {
      actor.activity = Activity.IDLE;
      return unequipPhoneAction;
    }

    // 2. Move to patrol position.
    if (!this.m_ReachedPatrolPoint) {
      const bumpAction = this.behaviorIntelligentBumpToward(game, location.position, false, false);
      if (bumpAction) {
        actor.activity = Activity.IDLE;
        return bumpAction;
      }
    }

    // 3. Eat if hungry.
    if (game.rules.isActorHungry(actor)) {
      const eatAction = this.behaviorEat(game);
      if (eatAction) {
        actor.activity = Activity.IDLE;
        return eatAction;
      }
    }

    // 4. Heal if need to.
    const useMedAction = this.behaviorUseMedecine(game, 2, 1, 2, 4, 2);
    if (useMedAction) {
      actor.activity = Activity.IDLE;
      return useMedAction;
    }

    // 5. Wander in patrol zones.
    const order = this.order!;
    const patrolMap = order.location.map;
    const patrolZones = patrolMap
      ? patrolMap.getZonesAt(order.location.position.x, order.location.position.y)
      : [];
    return this.behaviorWander(
      game,
      loc => {
        const zonesHere = loc.map ? loc.map.getZonesAt(loc.position.x, loc.position.y) : null;
        if (!zonesHere || zonesHere.length === 0) return false;
        for (const zHere of zonesHere) for (const zPatrol of patrolZones) if (zHere === zPatrol) return true;
        return false;
      },
      exploration
    );
  }

  // ── Dropping all items ───────────────────────────────────────────────────

  private executeDropAllItems(game: Game): ActorAction | null {
    const inv = this.controlledActor.inventory;

    // if no more items, done.
    if (!inv || inv.isEmpty) return null;

    // alpha10.1 bugfix followers drop all was looping
    // use drop item behaviour on the first item it can.
    for (let i = 0; i < inv.countItems; i++) {
      const dropAction = this.behaviorDropItem(game, inv.getItem(i));
      if (dropAction) return dropAction;
    }

    // we still have at least one item but cannot drop it for some reason,
    // consider the order done.
    return null;
  }

  // ── Reporting ────────────────────────────────────────────────────────────

  private executeReport(game: Game, percepts: Percept[] | null): ActorAction | null {
    // 1. See enemy => raise alarm.
    const alarm = this.raiseAlarm(game, percepts);
    if (alarm) return alarm;

    const leader = this.controlledActor.leader!;

    // Continue reporting.
    let reportAction: ActorAction | null = null;
    let isReportDone = false;

    switch (this.m_ReportStage) {
      case 0: // events.
        reportAction =
          this.m_LastRaidHeard !== null
            ? this.behaviorTellFriendAboutPercept(game, this.m_LastRaidHeard)
            : new ActionSay(this.controlledActor, game, leader, 'No raids heard.', SayFlags.NONE);
        ++this.m_ReportStage;
        break;

      case 1: // enemies.
        reportAction =
          this.m_LastEnemySaw !== null
            ? this.behaviorTellFriendAboutPercept(game, this.m_LastEnemySaw)
            : new ActionSay(this.controlledActor, game, leader, 'No enemies sighted.', SayFlags.NONE);
        ++this.m_ReportStage;
        break;

      case 2: // items.
        reportAction =
          this.m_LastItemsSaw !== null
            ? this.behaviorTellFriendAboutPercept(game, this.m_LastItemsSaw)
            : new ActionSay(this.controlledActor, game, leader, 'No items sighted.', SayFlags.NONE);
        ++this.m_ReportStage;
        break;

      case 3: // soldiers.
        reportAction =
          this.m_LastSoldierSaw !== null
            ? this.behaviorTellFriendAboutPercept(game, this.m_LastSoldierSaw)
            : new ActionSay(this.controlledActor, game, leader, 'No soldiers sighted.', SayFlags.NONE);
        ++this.m_ReportStage;
        break;

      case 4: // end of report.
        isReportDone = true;
        reportAction = new ActionSay(this.controlledActor, game, leader, "That's it.", SayFlags.NONE);
        break;

      default:
        break;
    }

    if (isReportDone) this.setOrder(null);
    if (reportAction) return reportAction;
    return new ActionSay(this.controlledActor, game, leader, 'Let me think...', SayFlags.NONE);
  }

  // ── Sleeping now ─────────────────────────────────────────────────────────

  private executeSleepNow(game: Game, percepts: Percept[] | null): ActorAction | null {
    const actor = this.controlledActor;

    // interrupt if seeing an enemy.
    const alarm = this.raiseAlarm(game, percepts);
    if (alarm) return alarm;

    // try to sleep.
    const sleepCheck = game.rules.canActorSleep(actor);
    if (sleepCheck.ok) {
      // start sleeping only one even turns so the player has at least one turn to cancel the order...
      if ((actor.location.map?.localTime.turnCounter ?? 0) % 2 === 0) return new ActionSleep(actor, game);
      return new ActionWait(actor, game);
    }

    this.setOrder(null);
    game.DoEmote(actor, `I can't sleep now : ${sleepCheck.reason}.`);
    return new ActionWait(actor, game);
  }

  // ── Toggle following ─────────────────────────────────────────────────────

  private executeToggleFollow(game: Game): ActorAction | null {
    // consider it done.
    this.setOrder(null);

    // toggle.
    this.dontFollowLeader = !this.dontFollowLeader;

    // emote.
    game.DoEmote(
      this.controlledActor,
      this.dontFollowLeader ? "OK I'll do my stuff, see you soon!" : "I'm ready!"
    );
    return new ActionWait(this.controlledActor, game);
  }

  // ── Where are you? ───────────────────────────────────────────────────────

  private executeReportPosition(game: Game): ActorAction | null {
    // consider it done.
    this.setOrder(null);

    // do it.
    const pos = this.controlledActor.location.position;
    const mapName = this.controlledActor.location.map?.name ?? '';
    const reportTxt = `I'm in ${mapName} at ${pos.x},${pos.y}.`;
    return new ActionSay(this.controlledActor, game, this.controlledActor.leader!, reportTxt, SayFlags.NONE);
  }

  /**
   * Shared "interrupt : see an enemy => raise alarm" pre-step used by guard,
   * patrol, report and sleep-now duties.
   */
  private raiseAlarm(game: Game, percepts: Percept[] | null): ActorAction | null {
    const enemies = this.filterEnemies(game, percepts);
    if (!enemies || enemies.length === 0) return null;

    // ALAAAARRMM!!
    this.setOrder(null);
    const nearest = this.filterNearest(game, enemies);
    if (!nearest) throw new Error('null nearest enemy');
    const nearestEnemy = nearest.percepted as Actor;
    return new ActionShout(this.controlledActor, game, `${nearestEnemy.name} sighted!!`);
  }

  // ── Raid notification ────────────────────────────────────────────────────

  onRaid(raid: RaidType, location: Location, turn: number): void {
    if (this.controlledActor.isSleeping) return;

    let raidDesc: string;
    switch (raid) {
      case RaidType.ARMY_SUPLLIES:
        raidDesc = 'a chopper hovering';
        break;
      case RaidType.BIKERS:
        raidDesc = 'motorcycles coming';
        break;
      case RaidType.BLACKOPS:
        raidDesc = 'a chopper hovering';
        break;
      case RaidType.GANGSTA:
        raidDesc = 'cars coming';
        break;
      case RaidType.NATGUARD:
        raidDesc = 'the army coming';
        break;
      case RaidType.SURVIVORS:
        raidDesc = 'honking coming';
        break;
      default:
        throw new Error(`unhandled raidtype ${String(raid)}`);
    }

    this.m_LastRaidHeard = new Percept(raidDesc, turn, location);
  }
}
