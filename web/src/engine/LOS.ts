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
import { Options as GameOptionsSingleton } from '@engine/GameOptions';
import { GameTiles } from '@gameplay/GameTiles';
import { Models } from '@data/Models';
import { GameImages } from '@gameplay/GameImages';
import { DollPart } from '@data/Doll';
import { ItemLight } from '@engine/items/ItemLight';
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
    weather: Weather,
    checkForOtherLitTiles: boolean = false
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

    // Still Alive, Release 6-5, and the second half of `Feature.DarknessFov`.
    //
    // A tile with a light source on it is visible even when it is *outside* the
    // actor's own FOV -- otherwise a survivor standing in a pitch-dark basement
    // cannot see the burning barrel two tiles away that is the only reason they
    // are not dead. The 2a half of the feature is the FOV floor of 0; this half is
    // what makes a floor with a fire in it playable.
    //
    // `actor.isPlayer` only, and the C#'s reason is worth quoting: "otherwise the
    // game runs like a slideshow" (Release 7-1). Lighting sources are added to the
    // *same* visible set for the AI as for the player, so every NPC would see
    // every light on the map and walk straight to it. The C# has no per-tile light
    // level grid either -- this only ever adds keys to the set it already had --
    // which is why both renderers get it for free.
    // Both conditions here rather than at the four call sites, which is what the
    // C# does: it passes `true` everywhere and filters on `actor.IsPlayer` inside
    // ("otherwise the game runs like a slideshow", Release 7-1). The feature gate
    // is the branch's own addition, and it belongs beside the player check so the
    // two cannot disagree about when the scan is worth its cost.
    if (
      checkForOtherLitTiles &&
      actor.isPlayer &&
      hasFeature(Session.get().ruleset, Feature.DarknessFov)
    ) {
      LOS.addOtherLitTiles(map, actor, visibleSet);
    }

    return visibleSet;
  }

  /**
   * The whole-map scan for lights outside the actor's own FOV. Still Alive,
   * Release 6-5/7-5/7-6 (`LOS.cs:404-621`).
   *
   * Four kinds of source, checked in the C#'s order and each `continue`ing after
   * it fires, so the first match wins and a tile lit by two things is not
   * processed twice:
   *
   * | source | footprint |
   * |---|---|
   * | burning map object (barrel, campfire, car) | own tile, 8 neighbours, and unless `reducedMapObjectLighting` the two-over and the eight three-point bearings |
   * | tile fire | own tile and 8 neighbours, **skipped on a wall** |
   * | actor holding a working light | own tile and 8 neighbours |
   * | lit candle decoration | own tile and 8 neighbours |
   * | throwable light on the ground | own tile and 8 neighbours |
   *
   * Two details that are load-bearing:
   *
   * - **The LOS check uses range 10, not the actor's FOV.** That is the whole
   *   point: a source beyond the actor's view range but within ten tiles and in
   *   line of sight is still seen.
   * - **A tile fire does not light a wall.** Lighting a wall makes it
   *   "visible", which makes it *transparent*, and you can see straight through
   *   the building. Hence `GameTiles.isWallModel`, the explicit fifteen-model
   *   list rather than `!isWalkable`.
   */
  private static addOtherLitTiles(
    map: GameMap,
    actor: Actor,
    visibleSet: Set<number>
  ): void {
    const from = actor.location.position;
    const reduced = GameOptionsSingleton.reducedMapObjectLighting;

    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        const spot = new Point(x, y);
        if (spot.x === from.x && spot.y === from.y) continue;

        // Only consider spots we actually have line of sight to, at range 10.
        const trace = new Set<number>();
        trace.add(coordKey(x, y));
        if (!LOS.fovSub(map, from, spot, 10, trace)) continue;

        const lightNeighbourhood = (): void => {
          visibleSet.add(coordKey(x, y));
          for (const d of Direction.COMPASS) {
            const next = d.applyTo(spot);
            if (map.isInBounds(next.x, next.y)) visibleSet.add(coordKey(next.x, next.y));
          }
        };

        // 1. burning map objects -- barrels, campfires, cars
        const mapObj = map.getMapObjectAtPoint(spot);
        if (mapObj !== null && mapObj.isOnFire) {
          LOS.lightMapObject(map, spot, visibleSet, reduced);
          continue;
        }

        // 2. tile fires, but not on a wall (see the doc comment)
        if (map.isAnyTileFireThere(spot)) {
          if (!(Models.tiles as GameTiles).isWallModel(map.getTileAt(x, y)!.model)) {
            lightNeighbourhood();
            continue;
          }
        }

        // 3. actors holding a working light
        const other = map.getActorAtPoint(spot);
        if (other !== null) {
          const held = other.getEquippedItem(DollPart.LEFT_HAND);
          if (held instanceof ItemLight && held.batteries > 0) {
            lightNeighbourhood();
            continue;
          }
        }

        // 4. a lit candle
        if (map.getTileAt(x, y)!.hasDecoration(GameImages.DECO_LIT_CANDLE)) {
          lightNeighbourhood();
          continue;
        }

        // 5. a throwable light on the ground. A dropped *torch* does not count:
        //    a torch should be off when nobody is holding it.
        for (const item of map.getItemsAt(spot)?.items ?? []) {
          if (item instanceof ItemLight && item.model.isThrowable) {
            lightNeighbourhood();
            break;
          }
        }
      }
    }
  }

  /**
   * The footprint of a burning map object, which is the one non-trivial shape
   * here: the 8-neighbourhood plus, at two tiles out along the same bearing, the
   * tile itself and the two three-point bearings either side of it.
   *
   * That lights a 21-tile blob rather than the 9-tile disc the other sources get,
   * so a burning barrel is visible from further away than a lit candle. The
   * corner cells (NE/SE/SW/NW at two tiles) are deliberately *not* lit -- the
   * C#'s comment calls them out by name -- which is why this is not simply a
   * radius-2 disc.
   */
  private static lightMapObject(
    map: GameMap,
    spot: Point,
    visibleSet: Set<number>,
    reduced: boolean
  ): void {
    const lit = (p: Point, range: number): void => {
      if (LOS.extendedIsInViewLineCheck(map, spot, p, range)) {
        visibleSet.add(coordKey(p.x, p.y));
      }
    };
    visibleSet.add(coordKey(spot.x, spot.y));
    for (const d of Direction.COMPASS) {
      const next = d.applyTo(spot);
      if (!map.isInBounds(next.x, next.y)) continue;
      visibleSet.add(coordKey(next.x, next.y));
      if (reduced) continue;

      // Two steps out along the *same* bearing -- so the diagonals of the
      // 8-ring get a two-over too, and the cardinals get theirs.
      const twoOver = d.applyTo(next);
      // Range 3, not 1: the C# allows for the two-step.
      lit(twoOver, 3);

      // And the two three-point bearings, e.g. NNE and NNW when going north.
      for (const three of LOS.threePointBearings(d, twoOver)) {
        lit(three, 2);
      }
    }
  }

  /** In bounds, and in line of sight. `LOS.cs:625` (Release 7-6). */
  private static extendedIsInViewLineCheck(
    map: GameMap,
    from: Point,
    to: Point,
    tilesRange: number = 1
  ): boolean {
    if (!map.isInBounds(to.x, to.y)) return false;
    return LOS.canTraceViewLine(map, from, to, tilesRange);
  }

  /**
   * The two three-point bearings either side of a cardinal, as offsets from the
   * tile two steps out along it.
   *
   * The C# writes these out as four blocks in a switch, naming eight positions:
   * N gives NNE and NNW, E gives ENE and ESE, S gives SSE and SSW, W gives WSW and
   * WNW. **None of those eight exist as a `Direction` in the port** -- the
   * compass stops at the eight points -- so they are computed from the cardinal's
   * own offset rather than looked up, which also removes four chances to get the
   * handedness wrong:
   *
   *   bearing = (2*cx ± cy, 2*cy ± cx)
   *
   * which for N (0,-1) gives (1,-2) and (-1,-2) -- NNE and NNW, in that order.
   * A test pins all eight against the C#'s names.
   */
  private static threePointBearings(
    cardinal: Direction,
    twoOver: Point
  ): readonly [Point, Point] {
    const cx = cardinal.dx;
    const cy = cardinal.dy;
    return [
      new Point(twoOver.x + cy, twoOver.y + cx),
      new Point(twoOver.x - cy, twoOver.y - cx),
    ];
  }
}
