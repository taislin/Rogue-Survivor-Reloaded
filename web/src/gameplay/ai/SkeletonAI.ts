/**
 * SkeletonAI.
 * Ported from src/Gameplay/AI/SkeletonAI.cs
 */

import { Activity } from '@data/Activity';
import type { Actor } from '@data/Actor';
import { ActionWait } from '@engine/actions/Actions';
import type { ActorAction } from '@data/ActorAction';
import { Percept } from '@engine/ai/Sensors';
import { BaseAI } from './BaseAI';
import { LOSSensor, SensingFilter } from './GameplaySensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export class SkeletonAI extends BaseAI {
  private static readonly IDLE_CHANCE = 80;

  private m_LOSSensor!: LOSSensor;

  protected override createSensors(): void {
    this.m_LOSSensor = new LOSSensor(SensingFilter.ACTORS);
  }

  protected override updateSensors(game: Game): Percept[] {
    return this.m_LOSSensor.sense(game, this.controlledActor);
  }

  protected override selectAction(game: Game, percepts: Percept[]): ActorAction | null {
    const mapPercepts = this.filterSameMap(game, percepts);

    // 1 move in straight line to nearest enemy
    const nearestEnemy = this.filterNearest(game, this.filterEnemies(game, mapPercepts));
    if (nearestEnemy) {
      const bumpAction = this.behaviorStupidBumpToward(game, nearestEnemy.location.position, true, false);
      if (bumpAction) {
        this.controlledActor.activity = Activity.CHASING;
        this.controlledActor.targetActor = nearestEnemy.percepted as Actor;
        return bumpAction;
      }
    }

    // 2 idle? % chance.
    if (game.rules.rollChance(SkeletonAI.IDLE_CHANCE)) {
      this.controlledActor.activity = Activity.IDLE;
      return new ActionWait(this.controlledActor, game);
    }

    // 3 wander
    this.controlledActor.activity = Activity.IDLE;
    return this.behaviorWander(game, null);
  }
}
