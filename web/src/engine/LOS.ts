/**
 * LOS – Line Of Sight & Field Of View computing, line tracing, and raycasting.
 * Ported from src/Engine/LOS.cs
 */

import type { Actor } from '@data/Actor';
import type { Map as GameMap } from '@data/Map';
import type { Weather } from '@data/Weather';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import type { WorldTime } from '@engine/WorldTime';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rules = any;

export class LOS {
  /**
   * Asymmetric Bresenham line trace.
   *
   * @param maxSteps Maximum number of steps allowed.
   * @param map The map context.
   * @param xFrom Origin X.
   * @param yFrom Origin Y.
   * @param xTo Target X.
   * @param yTo Target Y.
   * @param line If provided, will be populated with the points along the segment (including origin).
   * @param fn Predicate called for each step; if it returns false, tracing halts.
   * @returns true if the line reached destination without being blocked.
   */
  static asymmetricBresenhamTrace(
    maxSteps: number,
    _map: GameMap,
    xFrom: number,
    yFrom: number,
    xTo: number,
    yTo: number,
    line: Point[] | null,
    fn: (x: number, y: number) => boolean
  ): boolean {
    const deltaX = Math.abs(xTo - xFrom) << 1;
    const deltaY = Math.abs(yTo - yFrom) << 1;

    const ix = xTo > xFrom ? 1 : -1;
    const iy = yTo > yFrom ? 1 : -1;

    if (line) {
      line.push(new Point(xFrom, yFrom));
    }

    let stepCount = 0;
    let curX = xFrom;
    let curY = yFrom;

    if (deltaX >= deltaY) {
      let error = deltaY - (deltaX >> 1);

      while (curX !== xTo) {
        if (error >= 0) {
          if (error !== 0 || ix > 0) {
            curY += iy;
            error -= deltaX;
          }
        }

        curX += ix;
        error += deltaY;

        if (++stepCount > maxSteps) return false;
        if (!fn(curX, curY)) return false;
        if (line) line.push(new Point(curX, curY));
      }
    } else {
      let error = deltaX - (deltaY >> 1);

      while (curY !== yTo) {
        if (error >= 0) {
          if (error !== 0 || iy > 0) {
            curX += ix;
            error -= deltaY;
          }
        }

        curY += iy;
        error += deltaX;

        if (++stepCount > maxSteps) return false;
        if (!fn(curX, curY)) return false;
        if (line) line.push(new Point(curX, curY));
      }
    }

    return true;
  }

  static directionTo(map: GameMap, from: Point, to: Point): Direction | null {
    const line: Point[] = [];
    LOS.asymmetricBresenhamTrace(1, map, from.x, from.y, to.x, to.y, line, () => true);
    if (line.length < 2) return null;
    return Direction.fromVector(line[1].x - from.x, line[1].y - from.y);
  }

  static canTraceViewLine(map: GameMap, from: Point, to: Point, maxRange = Number.MAX_SAFE_INTEGER): boolean {
    return LOS.asymmetricBresenhamTrace(
      maxRange,
      map,
      from.x,
      from.y,
      to.x,
      to.y,
      null,
      (x, y) => {
        if (map.isTransparent(x, y)) return true;
        if (x === to.x && y === to.y) return true;
        return false;
      }
    );
  }

  static canTraceFireLine(
    map: GameMap,
    from: Point,
    to: Point,
    maxRange: number,
    line: Point[] | null
  ): boolean {
    let clear = true;

    LOS.asymmetricBresenhamTrace(
      maxRange,
      map,
      from.x,
      from.y,
      to.x,
      to.y,
      line,
      (x, y) => {
        if (x === from.x && y === from.y) return true;
        if (x === to.x && y === to.y) return true;
        if (map.isBlockingFire(x, y)) clear = false;
        return true;
      }
    );

    return clear;
  }

  static canTraceThrowLine(
    map: GameMap,
    from: Point,
    to: Point,
    maxRange: number,
    line: Point[] | null
  ): boolean {
    let clear = true;

    LOS.asymmetricBresenhamTrace(
      maxRange,
      map,
      from.x,
      from.y,
      to.x,
      to.y,
      line,
      (x, y) => {
        if (x === from.x && y === from.y) return true;
        if (x === to.x && y === to.y) return true;
        if (map.isBlockingThrow(x, y)) clear = false;
        return true;
      }
    );

    if (map.isBlockingThrow(to.x, to.y)) {
      clear = false;
    }

    return clear;
  }

  private static fovSub(
    map: GameMap,
    from: Point,
    to: Point,
    maxRange: number,
    visibleSet: Set<string>
  ): boolean {
    return LOS.asymmetricBresenhamTrace(
      maxRange,
      map,
      from.x,
      from.y,
      to.x,
      to.y,
      null,
      (x, y) => {
        const viewThrough = (x === to.x && y === to.y) || map.isTransparent(x, y);
        if (viewThrough) {
          visibleSet.add(`${x},${y}`);
        }
        return viewThrough;
      }
    );
  }

  /**
   * Computes the Field Of View set of coordinates for an actor using raycasting
   * followed by a wall fix pass to eliminate dark corners.
   */
  static computeFOVFor(
    rules: Rules,
    actor: Actor,
    time: WorldTime,
    weather: Weather
  ): Set<string> {
    const map = actor.location.map;
    const visibleSet = new Set<string>();
    if (!map) return visibleSet;

    const from = actor.location.position;
    const maxRange: number = rules.actorFOV(actor, time, weather);

    const xmin = Math.max(0, from.x - maxRange);
    const xmax = Math.min(map.width - 1, from.x + maxRange);
    const ymin = Math.max(0, from.y - maxRange);
    const ymax = Math.min(map.height - 1, from.y + maxRange);

    const wallsToFix: Point[] = [];

    // 1st pass: trace ray to every perimeter/cell in range
    for (let x = xmin; x <= xmax; x++) {
      for (let y = ymin; y <= ymax; y++) {
        const to = new Point(x, y);
        if (rules.losDistance(from, to) > maxRange) continue;
        const key = `${x},${y}`;
        if (visibleSet.has(key)) continue;

        if (!LOS.fovSub(map, from, to, maxRange, visibleSet)) {
          const tile = map.getTileAt(x, y);
          const obj = map.getMapObjectAt(x, y);
          const isFovWall = (tile && !tile.model.isTransparent && !tile.model.isWalkable) || obj !== null;
          if (isFovWall) {
            wallsToFix.push(to);
          }
          continue;
        }

        visibleSet.add(key);
      }
    }

    // 2nd pass: wall fix pass
    for (const wall of wallsToFix) {
      let count = 0;
      for (const d of Direction.COMPASS) {
        const next = d.applyTo(wall);
        if (visibleSet.has(`${next.x},${next.y}`)) {
          const tile = map.getTileAt(next.x, next.y);
          if (tile && tile.model.isTransparent && tile.model.isWalkable) {
            count++;
          }
        }
      }
      if (count >= 3) {
        visibleSet.add(`${wall.x},${wall.y}`);
      }
    }

    return visibleSet;
  }
}
