import { Point } from "@engine/Point";
import { Direction } from "@engine/Direction";
import type { Map as GameMap } from "./Map";

export class Location {
  readonly map: GameMap | null;
  readonly position: Point;

  constructor(map?: GameMap | null, position?: Point) {
    this.map = map ?? null;
    this.position = position ?? Point.Zero;
  }

  equals(other: Location | null): boolean {
    if (!other) return false;
    return this.map === other.map && this.position.equals(other.position);
  }

  addDirection(dir: Direction): Location {
    return new Location(this.map, dir.applyTo(this.position));
  }
}
