/**
 * ExplorationData – tracks recently visited locations and zones for AI
 * exploration logic.
 *
 * Ported from src/Gameplay/AI/ExplorationData.cs (alpha10.1)
 */

import type { Location } from '@data/Location';
import type { Zone } from '@data/Zone';

export class ExplorationData {
  private readonly locQueueSize: number;
  private readonly locQueue: Location[] = [];
  private readonly zoneQueueSize: number;
  private readonly zoneQueue: Zone[] = [];

  constructor(locationsToRemember: number, zonesToRemember: number) {
    if (locationsToRemember < 1) throw new RangeError('locationsToRemember < 1');
    if (zonesToRemember < 1) throw new RangeError('zonesToRemember < 1');
    this.locQueueSize = locationsToRemember;
    this.zoneQueueSize = zonesToRemember;
  }

  clear(): void {
    this.locQueue.length = 0;
    this.zoneQueue.length = 0;
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  hasExploredLocation(loc: Location): boolean {
    return this.locQueue.some(l => l.equals(loc));
  }

  addExploredLocation(loc: Location): void {
    if (this.locQueue.length >= this.locQueueSize) this.locQueue.shift();
    this.locQueue.push(loc);
  }

  /** Returns how many turns ago `loc` was added (1 = most recent). 0 if not found. */
  getExploredLocationAge(loc: Location): number {
    const n = this.locQueue.length;
    for (let i = n - 1; i >= 0; i--) {
      if (this.locQueue[i].equals(loc)) return n - i;
    }
    return 0;
  }

  // ── Zones ──────────────────────────────────────────────────────────────────

  hasExploredZone(zone: Zone): boolean {
    return this.zoneQueue.includes(zone);
  }

  /** Returns true if all zones in the list have been explored. Null/empty → true. */
  hasExploredAllZones(zones: Zone[] | null | undefined): boolean {
    if (!zones || zones.length === 0) return true;
    return zones.every(z => this.zoneQueue.includes(z));
  }

  addExploredZone(zone: Zone): void {
    if (this.zoneQueue.length >= this.zoneQueueSize) this.zoneQueue.shift();
    this.zoneQueue.push(zone);
  }

  /** Returns how many turns ago `zone` was added. 0 if not found. */
  getExploredZoneAge(zone: Zone): number {
    const n = this.zoneQueue.length;
    for (let i = n - 1; i >= 0; i--) {
      if (this.zoneQueue[i] === zone) return n - i;
    }
    return 0;
  }

  /** Returns the youngest (most recent) exploration age from a zone list. 0 if null/empty. */
  getExploredZonesAge(zones: Zone[] | null | undefined): number {
    if (!zones || zones.length === 0) return 0;
    let youngest = Number.MAX_SAFE_INTEGER;
    for (const z of zones) {
      const age = this.getExploredZoneAge(z);
      if (age < youngest) youngest = age;
    }
    return youngest;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(location: Location): void {
    if (!this.hasExploredLocation(location)) this.addExploredLocation(location);

    const zones = location.map?.getZonesAt(location.position.x, location.position.y);
    if (zones) {
      for (const z of zones) {
        if (!this.hasExploredZone(z)) this.addExploredZone(z);
      }
    }
  }
}
