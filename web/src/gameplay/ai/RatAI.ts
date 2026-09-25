/**
 * RatAI.
 * Ported from src/Gameplay/AI/RatAI.cs
 *
 * Rat AI : used by Zombie Rat branch.
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import type { ActorAction } from '@data/ActorAction';
import { Odor } from '@data/Odor';
import type { Percept } from '@engine/ai/Sensors';
import { BaseAI } from './BaseAI';
import { LOSSensor, SensingFilter, SmellSensor } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class RatAI extends BaseAI {
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
    const mapPercepts = this.filterSameMap(game, percepts);

    //////////////////////////////////////////////////////////////
    // 1 move closer to an enemy, nearest & visible enemies first
    // 2 eat corpses
    // 3 move to highest living scent
    // 4 wander
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
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, false, false);
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
            const bumpAction = this.behaviorStupidBumpToward(game, enemyP.location.position, false, false);
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

    // 2 eat corpses.
    const corpses = this.filterCorpses(game, mapPercepts);
    if (corpses) {
      const eatCorpses = this.behaviorGoEatCorpse(game, corpses);
      if (eatCorpses) {
        this.controlledActor.activity = Activity.IDLE;
        return eatCorpses;
      }
    }

    // 3 move to highest living scent
    const trackLivingAction = this.behaviorTrackScent(game, this.m_LivingSmellSensor.scents);
    if (trackLivingAction) {
      this.controlledActor.activity = Activity.TRACKING;
      return trackLivingAction;
    }

    // 4 wander
    this.controlledActor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
