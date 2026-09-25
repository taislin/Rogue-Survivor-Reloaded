/**
 * SewersThingAI.
 * Ported from src/Gameplay/AI/SewersThingAI.cs
 *
 * Sewers Thing AI, used by Unique Sewers Thing.
 * Based on a much simplified Zombie AI.
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { Odor } from '@data/Odor';
import { MemorizedSensor, Percept } from '@engine/ai/Sensors';
import { BaseAI } from './BaseAI';
import { LOSSensor, SensingFilter, SmellSensor } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class SewersThingAI extends BaseAI {
  private static readonly LOS_MEMORY = 20;

  private m_LOSSensor!: MemorizedSensor;
  private m_LivingSmellSensor!: SmellSensor;
  private m_MasterSmellSensor!: SmellSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new MemorizedSensor(new LOSSensor(SensingFilter.ACTORS), SewersThingAI.LOS_MEMORY);
    this.m_LivingSmellSensor = new SmellSensor(Odor.LIVING);
    this.m_MasterSmellSensor = new SmellSensor(Odor.UNDEAD_MASTER);
  }

  protected override updateSensors(game: Game): Percept[] {
    const list = this.m_LOSSensor.sense(game, this.controlledActor);
    const living = this.m_LivingSmellSensor.sense(game, this.controlledActor);
    const master = this.m_MasterSmellSensor.sense(game, this.controlledActor);
    return [...list, ...living, ...master];
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const mapPercepts = this.filterSameMap(game, percepts);

    //////////////////////////////////////////////////////////////
    // 1 move closer to an enemy, nearest & visible enemies first
    // 2 move to highest living scent
    // 3 wander
    //////////////////////////////////////////////////////////////

    // 1 move closer to an enemy, nearest & visible enemies first
    const enemies = this.filterEnemies(game, mapPercepts);
    if (enemies) {
      const turn = this.controlledActor.location.map?.localTime.turnCounter ?? 0;

      // try visible enemies first, the closer the best.
      const visibleEnemies = this.filter(game, enemies, p => p.turn === turn);
      if (visibleEnemies) {
        let bestEnemyPercept: Percept | null = null;
        let bestBumpAction: ActorAction | null = null;
        let closest = Number.MAX_VALUE;

        for (const enemyP of visibleEnemies) {
          const distance = game.rules.gridDistance(this.controlledActor.location.position, enemyP.location.position);
          if (distance < closest) {
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
            if (bumpAction) {
              closest = distance;
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

      // then try rest, the closer the best.
      const oldEnemies = this.filter(game, enemies, p => p.turn !== turn);
      if (oldEnemies) {
        let bestEnemyPercept: Percept | null = null;
        let bestBumpAction: ActorAction | null = null;
        let closest = Number.MAX_VALUE;

        for (const enemyP of oldEnemies) {
          const distance = game.rules.gridDistance(this.controlledActor.location.position, enemyP.location.position);
          if (distance < closest) {
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, true, true);
            if (bumpAction) {
              closest = distance;
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

    // 2 move to highest living scent
    const trackLivingAction = this.behaviorTrackScent(game, this.m_LivingSmellSensor.scents);
    if (trackLivingAction) {
      this.controlledActor.activity = Activity.TRACKING;
      return trackLivingAction;
    }

    // 3 wander
    this.controlledActor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
