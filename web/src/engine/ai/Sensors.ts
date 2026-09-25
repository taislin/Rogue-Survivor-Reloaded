/**
 * AI sensing primitives: Percept, Sensor, MemorizedSensor.
 * Ported from src/Engine/AI/Percept.cs, Sensor.cs, MemorizedSensor.cs
 */

import type { Actor } from '@data/Actor';
import type { Location } from '@data/Location';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ────────────────────────────────────────────────────────────────────────────
// Percept – a single sensed entity (actor, item stack, corpse list, scent…)
// ────────────────────────────────────────────────────────────────────────────

export class Percept {
  /** What was perceived (Actor, Item[], Corpse[], AIScent, …). */
  readonly percepted: unknown;
  /** Map turn counter when this percept was recorded. */
  turn: number;
  /** Where the percept was observed. */
  location: Location;

  constructor(percepted: unknown, turn: number, location: Location) {
    if (percepted == null) throw new Error('percepted cannot be null');
    this.percepted = percepted;
    this.turn = turn;
    this.location = location;
  }

  /** How old this percept is relative to the current turn. Always ≥ 0. */
  getAge(currentTurn: number): number {
    return Math.max(0, currentTurn - this.turn);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sensor – abstract sensing interface
// ────────────────────────────────────────────────────────────────────────────

export abstract class Sensor {
  abstract sense(game: Game, actor: Actor): Percept[];
}

// ────────────────────────────────────────────────────────────────────────────
// MemorizedSensor – wraps another sensor and keeps a rolling memory of
// past percepts for `persistance` turns.
// ────────────────────────────────────────────────────────────────────────────

export class MemorizedSensor extends Sensor {
  readonly sensor: Sensor;
  private readonly percepts: Percept[] = [];
  private readonly persistance: number;

  constructor(sensor: Sensor, persistance: number) {
    super();
    this.sensor = sensor;
    this.persistance = persistance;
  }

  /** Forget all memorized percepts. */
  clear(): void {
    this.percepts.length = 0;
  }

  sense(game: Game, actor: Actor): Percept[] {
    const currentTurn = actor.location.map?.localTime?.turnCounter ?? 0;

    // 1. Forget aged percepts.
    for (let i = 0; i < this.percepts.length; ) {
      if (this.percepts[i].getAge(currentTurn) > this.persistance) {
        this.percepts.splice(i, 1);
      } else {
        i++;
      }
    }

    // 2. Forget dead actors or actors no longer on the same map.
    for (let i = 0; i < this.percepts.length; ) {
      const p = this.percepts[i];
      const a = p.percepted as Actor | null;
      if (a && typeof (a as any).isDead !== 'undefined') {
        if ((a as Actor).isDead || (a as Actor).location?.map !== actor.location.map) {
          this.percepts.splice(i, 1);
          continue;
        }
      }
      i++;
    }

    // 3. Get fresh percepts from the wrapped sensor.
    const fresh = this.sensor.sense(game, actor);

    // 4. Update existing or add new.
    const toAdd: Percept[] = [];
    for (const fp of fresh) {
      let updated = false;
      for (const old of this.percepts) {
        if (old.percepted === fp.percepted) {
          old.location = fp.location;
          old.turn = fp.turn;
          updated = true;
          break;
        }
      }
      if (!updated) toAdd.push(fp);
    }
    for (const p of toAdd) this.percepts.push(p);

    return this.percepts;
  }
}
