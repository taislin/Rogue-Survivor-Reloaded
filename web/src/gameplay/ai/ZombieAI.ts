/**
 * ZombieAI.
 * Ported from src/Gameplay/AI/ZombieAI.cs
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import { Odor } from '@data/Odor';
import type { ActorAction } from '@data/ActorAction';
import { MemorizedSensor, Percept } from '@engine/ai/Sensors';
import { BaseAI, UseExitFlags } from './BaseAI';
import { ExplorationData } from './ExplorationData';
import { LOSSensor, SensingFilter, SmellSensor } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class ZombieAI extends BaseAI {
  private static readonly LOS_MEMORY = 20;
  private static readonly EXPLORATION_LOCATIONS = 30;
  private static readonly EXPLORATION_ZONES = 3;
  private static readonly USE_EXIT_CHANCE = 50;
  private static readonly PUSH_OBJECT_CHANCE = 20;

  private m_MemLOSSensor!: MemorizedSensor;
  private m_LivingSmellSensor!: SmellSensor;
  private m_MasterSmellSensor!: SmellSensor;
  private m_Exploration: ExplorationData | null = null;

  override takeControl(actor: Actor): void {
    super.takeControl(actor);
    if (this.controlledActor.model.abilities.zombieAIExplore) {
      this.m_Exploration = new ExplorationData(ZombieAI.EXPLORATION_LOCATIONS, ZombieAI.EXPLORATION_ZONES);
    }
  }

  protected override createSensors(): void {
    this.m_MemLOSSensor = new MemorizedSensor(
      new LOSSensor(SensingFilter.ACTORS | SensingFilter.CORPSES),
      ZombieAI.LOS_MEMORY
    );
    this.m_LivingSmellSensor = new SmellSensor(Odor.LIVING);
    this.m_MasterSmellSensor = new SmellSensor(Odor.UNDEAD_MASTER);
  }

  protected override updateSensors(game: Game): Percept[] {
    const list = this.m_MemLOSSensor.sense(game, this.controlledActor);
    const living = this.m_LivingSmellSensor.sense(game, this.controlledActor);
    const master = this.m_MasterSmellSensor.sense(game, this.controlledActor);
    return [...list, ...living, ...master];
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const mapPercepts = this.filterSameMap(game, percepts);

    if (this.controlledActor.model.abilities.zombieAIExplore && this.m_Exploration) {
      this.m_Exploration.update(this.controlledActor.location);
    }

    // 1 move closer to an enemy, nearest & visible enemies first
    const enemies = this.filterEnemies(game, mapPercepts);
    if (enemies) {
      const turn = this.controlledActor.location.map?.localTime?.turnCounter ?? 0;
      const visibleEnemies = this.filter(game, enemies, p => p.turn === turn);
      if (visibleEnemies) {
        let bestEnemyPercept: Percept | null = null;
        let bestBumpAction: ActorAction | null = null;
        let closest = Number.MAX_VALUE;

        for (const enemyP of visibleEnemies) {
          const dist = game.rules.gridDistance(this.controlledActor.location.position, enemyP.location.position);
          if (dist < closest) {
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
            if (bumpAction) {
              closest = dist;
              bestEnemyPercept = enemyP;
              bestBumpAction = bumpAction;
            }
          }
        }

        if (bestBumpAction && bestEnemyPercept) {
          this.controlledActor.activity = Activity.CHASING;
          this.controlledActor.targetActor = bestEnemyPercept.percepted as Actor;
          return bestBumpAction;
        }
      }

      const oldEnemies = this.filter(game, enemies, p => p.turn !== turn);
      if (oldEnemies) {
        let bestEnemyPercept: Percept | null = null;
        let bestBumpAction: ActorAction | null = null;
        let closest = Number.MAX_VALUE;

        for (const enemyP of oldEnemies) {
          const dist = game.rules.gridDistance(this.controlledActor.location.position, enemyP.location.position);
          if (dist < closest) {
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
            if (bumpAction) {
              closest = dist;
              bestEnemyPercept = enemyP;
              bestBumpAction = bumpAction;
            }
          }
        }

        if (bestBumpAction && bestEnemyPercept) {
          this.controlledActor.activity = Activity.CHASING;
          this.controlledActor.targetActor = bestEnemyPercept.percepted as Actor;
          return bestBumpAction;
        }
      }
    }

    // 2 eat corpses
    const corpses = this.filterCorpses(game, mapPercepts);
    if (corpses) {
      const eatCorpses = this.behaviorGoEatCorpse(game, corpses);
      if (eatCorpses) {
        this.controlledActor.activity = Activity.IDLE;
        return eatCorpses;
      }
    }

    // 3 use exit (if ability)
    if (this.controlledActor.model.abilities.aiCanUseAIExits && game.rules.rollChance(ZombieAI.USE_EXIT_CHANCE)) {
      const useExit = this.behaviorUseExit(
        game,
        UseExitFlags.ATTACK_BLOCKING_ENEMIES | UseExitFlags.BREAK_BLOCKING_OBJECTS | UseExitFlags.DONT_BACKTRACK
      );
      if (useExit) {
        this.m_MemLOSSensor.clear();
        this.controlledActor.activity = Activity.IDLE;
        return useExit;
      }
    }

    // 4 move close to nearest undead master (if not master)
    if (!this.controlledActor.model.abilities.isUndeadMaster) {
      const nearestMaster = this.filterNearest(
        game,
        this.filterActors(game, mapPercepts, a => a.model.abilities.isUndeadMaster)
      );
      if (nearestMaster && this.controlledActor.location.map) {
        const bumpAction = this.behaviorStupidBumpToward(
          game,
          this.randomPositionNear(game.rules, this.controlledActor.location.map, nearestMaster.location.position, 3),
          true,
          true
        );
        if (bumpAction) {
          this.controlledActor.activity = Activity.FOLLOWING;
          this.controlledActor.targetActor = nearestMaster.percepted as Actor;
          return bumpAction;
        }
      }
    }

    // 5 move to highest undead master scent (if not master)
    if (!this.controlledActor.model.abilities.isUndeadMaster) {
      const trackMasterAction = this.behaviorTrackScent(game, this.m_MasterSmellSensor.scents);
      if (trackMasterAction) {
        this.controlledActor.activity = Activity.TRACKING;
        return trackMasterAction;
      }
    }

    // 6 move to highest living scent
    const trackLivingAction = this.behaviorTrackScent(game, this.m_LivingSmellSensor.scents);
    if (trackLivingAction) {
      this.controlledActor.activity = Activity.TRACKING;
      return trackLivingAction;
    }

    // 8 randomly push objects around
    if (game.rules.hasActorPushAbility(this.controlledActor) && game.rules.rollChance(ZombieAI.PUSH_OBJECT_CHANCE)) {
      const pushAction = this.behaviorPushNonWalkableObject(game);
      if (pushAction) {
        this.controlledActor.activity = Activity.IDLE;
        return pushAction;
      }
    }

    // 9 explore (if ability)
    if (this.controlledActor.model.abilities.zombieAIExplore && this.m_Exploration) {
      const exploreAction = this.behaviorExplore(game, this.m_Exploration);
      if (exploreAction) {
        this.controlledActor.activity = Activity.IDLE;
        return exploreAction;
      }
    }

    // 10 wander
    this.controlledActor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
