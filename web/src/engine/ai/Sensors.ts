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

    // 1 + 2. Forget aged percepts, and dead actors / actors on another map.
    //
    // Both prunes are done in one rebuild-and-copy pass. They used to be two
    // `splice(i, 1)`-in-a-loop passes, which is O(removed x length) memmove
    // work; this runs once per actor per turn, and a survivor walking past a
    // corpse each turn expires several percepts at once.
    const kept: Percept[] = [];
    for (const p of this.percepts) {
      if (p.getAge(currentTurn) > this.persistance) continue;
      const a = p.percepted as Actor | null;
      if (a && typeof (a as any).isDead !== 'undefined') {
        if ((a as Actor).isDead || (a as Actor).location?.map !== actor.location.map) continue;
      }
      kept.push(p);
    }
    this.percepts.length = 0;
    for (const p of kept) this.percepts.push(p);

    // 3. Get fresh percepts from the wrapped sensor.
    const fresh = this.sensor.sense(game, actor);

    // 4. Update existing or add new.
    //
    // The lookup is a Map keyed on the perceived object rather than a linear
    // identity scan, which made this O(fresh x remembered) -- a few hundred
    // comparisons per actor per turn. The result is the same: one remembered
    // Percept per perceived object, updated in place, anything unseen appended.
    // (Sensors emit at most one percept per perceived object, so there are no
    // duplicate keys to collapse -- the old code would have appended a second
    // copy in that case.)
    const byPercepted = new Map<unknown, Percept>();
    for (const p of this.percepts) byPercepted.set(p.percepted, p);

    const toAdd: Percept[] = [];
    for (const fp of fresh) {
      const old = byPercepted.get(fp.percepted);
      if (old) {
        old.location = fp.location;
        old.turn = fp.turn;
      } else {
        byPercepted.set(fp.percepted, fp);
        toAdd.push(fp);
      }
    }
    for (const p of toAdd) this.percepts.push(p);

    // Hand back a copy, never `this.percepts` itself. `BaseAI` mutates the
    // lists it is given -- `filterOutUnreachablePercepts` splices in place --
    // and three controllers (GangAI, CHARGuardAI, SoldierAI) return this array
    // straight out of `updateSensors`, so leaking it would let one AI's
    // reachability pruning silently delete 20 turns of another AI's memory.
    // That has not happened yet only because every current caller happens to
    // pass a `.filter()` copy.
    return this.percepts.slice();
  }
}
