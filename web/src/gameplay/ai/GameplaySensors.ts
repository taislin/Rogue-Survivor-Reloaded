/**
 * LOSSensor – line-of-sight based sensor.
 * SmellSensor – odor-tracking sensor.
 *
 * Ported from src/Gameplay/AI/Sensors/LOSSensor.cs
 *              src/Gameplay/AI/Sensors/SmellSensor.cs
 */

import type { Actor } from '@data/Actor';
import { Odor } from '@data/Odor';
import { Location } from '@data/Location';
import { Point } from '@engine/Point';
import { Percept, Sensor } from '@engine/ai/Sensors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ────────────────────────────────────────────────────────────────────────────
// LOSSensor
// ────────────────────────────────────────────────────────────────────────────

export const enum SensingFilter {
  ACTORS  = 1 << 0,
  ITEMS   = 1 << 1,
  CORPSES = 1 << 2,
}

export class LOSSensor extends Sensor {
  private _fov: Set<string> = new Set();
  filters: number;

  constructor(filters: number) {
    super();
    this.filters = filters;
  }

  /** The FOV point-set from the last call to `sense()`. */
  get fov(): ReadonlySet<string> { return this._fov; }

  sense(game: Game, actor: Actor): Percept[] {
    // Compute FOV via game rules.
    this._fov = game.rules.computeFOVFor(actor);
    const maxRange: number = game.rules.actorFOV(actor);
    const map = actor.location.map;
    if (!map) return [];

    const list: Percept[] = [];
    const turn = map.localTime.turnCounter;

    // ── Actors ────────────────────────────────────────────────────────────
    if (this.filters & SensingFilter.ACTORS) {
      const fovSize = this._fov.size;
      const actorCount: number = map.countActors;

      if (fovSize < actorCount) {
        // FOV iteration (cheaper when many actors on map).
        for (const key of this._fov) {
          const [x, y] = key.split(',').map(Number);
          const other = map.getActorAt(x, y);
          if (other && other !== actor) {
            list.push(new Percept(other, turn, other.location));
          }
        }
      } else {
        // Actor list iteration (cheaper when few actors).
        for (const other of map.actors as Actor[]) {
          if (other === actor) continue;
          const dist = game.rules.losDistance(actor.location.position, other.location.position);
          if (dist > maxRange) continue;
          const key = `${other.location.position.x},${other.location.position.y}`;
          if (this._fov.has(key)) {
            list.push(new Percept(other, turn, other.location));
          }
        }
      }
    }

    // ── Items ─────────────────────────────────────────────────────────────
    if (this.filters & SensingFilter.ITEMS) {
      for (const key of this._fov) {
        const [x, y] = key.split(',').map(Number);
        const inv = map.getItemsAt(new Point(x, y));
        if (inv && !inv.isEmpty) {
          list.push(new Percept(inv, turn, new Location(map, new Point(x, y))));
        }
      }
    }

    // ── Corpses ───────────────────────────────────────────────────────────
    if (this.filters & SensingFilter.CORPSES) {
      for (const key of this._fov) {
        const [x, y] = key.split(',').map(Number);
        const corpses = map.getCorpsesAt(new Point(x, y));
        if (corpses && corpses.length > 0) {
          list.push(new Percept(corpses, turn, new Location(map, new Point(x, y))));
        }
      }
    }

    return list;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SmellSensor
// ────────────────────────────────────────────────────────────────────────────

export class AIScent {
  readonly odor: Odor;
  readonly strength: number;

  constructor(odor: Odor, strength: number) {
    this.odor = odor;
    this.strength = strength;
  }
}

export class SmellSensor extends Sensor {
  private readonly odorToSmell: Odor;
  private _scents: Percept[] = [];

  constructor(odor: Odor) {
    super();
    this.odorToSmell = odor;
  }

  /** The scent percepts from the last call to `sense()`. */
  get scents(): Percept[] { return this._scents; }

  sense(game: Game, actor: Actor): Percept[] {
    this._scents = [];
    const map = actor.location.map;
    if (!map) return this._scents;

    const minStrength: number = game.rules.actorSmellThreshold(actor);
    const pos = actor.location.position;
    const turn = map.localTime.turnCounter;

    const xmin = Math.max(0, pos.x - 1);
    const xmax = Math.min(map.width - 1, pos.x + 1);
    const ymin = Math.max(0, pos.y - 1);
    const ymax = Math.min(map.height - 1, pos.y + 1);

    for (let x = xmin; x <= xmax; x++) {
      for (let y = ymin; y <= ymax; y++) {
        const pt = new Point(x, y);
        const strength: number = map.getScentByOdorAt(this.odorToSmell, pt);
        if (strength >= 0 && strength >= minStrength) {
          this._scents.push(
            new Percept(new AIScent(this.odorToSmell, strength), turn, new Location(map, pt))
          );
        }
      }
    }

    return this._scents;
  }
}
