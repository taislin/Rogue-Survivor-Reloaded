/**
 * LOS – Line Of Sight & Field Of View computing, line tracing, and raycasting.
 * Ported from src/Engine/LOS.cs
 */

import type { Actor } from '@data/Actor';
import type { Map as GameMap } from '@data/Map';
import type { Weather } from '@data/Weather';
import { Direction } from '@engine/Direction';
import { Point } from '@engine/Point';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Session } from '@engine/Session';
import { coordKey, coordKeyToPoint } from '@engine/CoordKey';
import type { WorldTime } from '@engine/WorldTime';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rules = any;

/**
 * A Field Of View: the set of tile coordinates an actor can see.
 *
 * Keyed by {@link LOS.fovKey}, which is the shared {@link coordKey} — the same
 * key `Map`'s spatial tables use. It was a `"x,y"` string until recently, which
 * cost ~5 000 short-lived string allocations and `Set` hash operations per actor
 * per turn; see {@link CoordKey} for the measurement and the formula.
 */
export type FOV = ReadonlySet<number>;

export class LOS {
  /**
   * The key a FOV set stores a tile under.
   *
   * Read the two mistakes this exists to prevent, both of which were live:
   *
   * 1. **`Point.toString()` is not this.** `Point.toString()` renders `(x, y)` —
   *    parentheses, and a space after the comma — while this is `x,y`. Asking
   *    `fov.has(somePoint.toString())` therefore compiles, type-checks, and is
   *    **always false**. Four call sites in `RogueGame` did exactly that, which
   *    is what silently disabled the whole of ORDER_MODE: the player could not
   *    click a tile to order a follower to barricade, guard, patrol or build.
   * 2. **`Point` is a class here and a struct in the C#.** So `Set<Point>.has(p)`
   *    and `a === b` are *reference* identity in the port where the C# had value
   *    equality, and never true for two separately-constructed points. The C# at
   *    `RogueGame.cs:9340` is `fovs[iFo].Contains(player.Location.Position)` on
   *    a `HashSet<Point>` of a struct, which compares by value. A third site
   *    (`RogueGame.DrawPlayerActorTargets`) compared two `Point`s with `==` for
   *    the same reason and never ran.
   *
   * So: never hand-write the key, never put a `Point` in a FOV, and never
   * compare two `Point`s with `==` — use `fovHas`, `fovPoints`, and
   * `Point.equals`. `tests/point-identity.test.ts` fails if any of those creep
   * back in.
   */
  static fovKey(x: number, y: number): number {
    return coordKey(x, y);
  }

  /** Whether `fov` contains the tile at `p`. The only safe FOV membership test. */
  static fovHas(fov: FOV, p: Point): boolean {
    return fov.has(coordKey(p.x, p.y));
  }

  /**
   * The FOV's tiles as `Point`s, for the callers that need to iterate.
   *
   * Callers that walk the whole FOV to find one thing should prefer
   * {@link LOS.fovHas} against a candidate position, which allocates nothing.
   */
  static fovPoints(fov: FOV): Point[] {
    const out: Point[] = [];
    for (const key of fov) out.push(coordKeyToPoint(key));
    return out;
  }

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
    visibleSet: Set<number>
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
          visibleSet.add(coordKey(x, y));
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
  ): Set<number> {
    const map = actor.location.map;
    const visibleSet = new Set<number>();
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

        // Still Alive, Release 6-2: adjacent tiles skip the circular distance
        // test entirely.
        //
        // `losDistance` is a *circle* (`sqrt(0.75 * d^2)`), which excludes the
        // four diagonal neighbours of a tile at Chebyshev distance 1. So at
        // `maxRange` 0 the player would see the four cardinal neighbours but not
        // the corners -- a visible cross with four blind corners, and the C#'s
        // comment says exactly that. Below, `isAdjacent && maxRange > 0` then
        // admits them outright.
        //
        // Gated because it is only observable once `MINIMAL_FOV_PLAYER` is 0;
        // with vanilla's floor of 2 the diagonals are inside the circle anyway and
        // the two branches agree.
        const darkFov = hasFeature(Session.get().ruleset, Feature.DarknessFov);
        const isAdjacent = rules.isAdjacent(from, to);
        if (!darkFov || !isAdjacent) {
          if (rules.losDistance(from, to) > maxRange) continue;
        }
        const key = coordKey(x, y);
        if (visibleSet.has(key)) continue;

        // ... and are visible without being traced, provided there is any range
        // at all.
        //
        // The `maxRange > 0` clause is unreachable as written, because the loop
        // bounds above already collapse to the actor's own tile at range 0. The
        // C# has the same clause and the same bounds. It is kept for fidelity and
        // because the bounds are the kind of thing that gets refactored; the test
        // says so rather than pretending to cover it.
        if (darkFov && isAdjacent && maxRange > 0) {
          visibleSet.add(key);
          continue;
        }

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
        if (visibleSet.has(coordKey(next.x, next.y))) {
          const tile = map.getTileAt(next.x, next.y);
          if (tile && tile.model.isTransparent && tile.model.isWalkable) {
            count++;
          }
        }
      }
      if (count >= 3) {
        visibleSet.add(coordKey(wall.x, wall.y));
      }
    }

    return visibleSet;
  }
}
