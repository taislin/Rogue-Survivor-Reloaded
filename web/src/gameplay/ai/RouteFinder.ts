/**
 * RouteFinder – lightweight A*-like reachability checker for AI.
 *
 * Ported from src/Gameplay/AI/Tools/RouteFinder.cs (alpha10)
 *
 * Only checks reachability (not the actual path), and restricts search to
 * tiles that are closer to the goal – mimicking the simple BehaviorBumpToward
 * movement logic so search stays tractable.
 */

import type { Actor } from '@data/Actor';
import type { Map as GameMap } from '@data/Map';
import { Point } from '@engine/Point';
import { Direction } from '@engine/Direction';
import { DoorWindow } from '@engine/mapobjects/MapObjects';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

// ────────────────────────────────────────────────────────────────────────────
// SpecialActions – bitmask of movement capabilities to consider during search
// ────────────────────────────────────────────────────────────────────────────

export const enum SpecialActions {
  NONE             = 0,
  DOORS            = 1 << 0,
  JUMP             = 1 << 1,
  PUSH             = 1 << 2,
  BREAK            = 1 << 3,
  ADJ_TO_DEST_IS_GOAL = 1 << 4,
}

// ────────────────────────────────────────────────────────────────────────────
// Internal node
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// RouteFinder
// ────────────────────────────────────────────────────────────────────────────

export class RouteFinder {
  /** The AI that owns this route finder. Set by BaseAI. */
  actor!: Actor;
  /** Which special actions are allowed when checking route. */
  allowedActions: number = SpecialActions.NONE;

  /**
   * Tiles already enqueued this call, so a tile reachable from several
   * parents is expanded once. Reused across calls to keep the search
   * allocation-free in the steady state.
   */
  private readonly enqueued = new Set<number>();

  /**
   * Check if the actor can likely reach `dest` using simple bump-toward
   * movement (plus any allowed special actions).
   *
   * @param game Game reference for rule queries.
   * @param dest Target position.
   * @param maxDist Maximum search radius.
   * @param distanceFn Distance metric, e.g. Chebyshev or Manhattan.
   */
  canReachSimple(
    game: Game,
    dest: Point,
    maxDist: number,
    distanceFn: (a: Point, b: Point) => number
  ): boolean {
    const a = this.actor;
    const start = a.location.position;
    const map = a.location.map;
    if (!map) return false;

    const adjToDestIsGoal = (this.allowedActions & SpecialActions.ADJ_TO_DEST_IS_GOAL) !== 0;

    // Trivial: already adjacent.
    if (distanceFn(start, dest) === 1) {
      if (adjToDestIsGoal) return true;
      return this.canMoveIn(game, a, map, dest);
    }

    /*
     * A best-first search, deliberately faithful to the C# in *what* it explores:
     * a node may only be expanded into neighbours strictly closer to the goal, so
     * this is not a plain flood fill and the two are not interchangeable.
     *
     * The frontier is a binary min-heap rather than the C#'s distance-sorted
     * `LinkedList`, and the node list is a `Set` of integer tile keys rather
     * than a `foreach` scan per neighbour. That drops the search from O(V^2) to
     * O(V log V): the C# rescans the whole list for the first unvisited node
     * (`RouteFinder.cs:143-162`) *and* `GetNode` linear-scans it for every
     * neighbour of every expansion, which on a 50x50 district with a 25-tile
     * target is thousands of comparisons per call - and this runs once per
     * percept, per actor, per turn.
     *
     * Popping the global minimum is what makes this a behaviour-preserving
     * swap rather than a faster variant, and it has to be the *global* minimum:
     * the C# resumes scanning from the head of the list after each expansion, so
     * it does eventually come back around to a higher `distToGoal` node once the
     * lower ones are spent. A single ascending pass over distance buckets would
     * be simpler, and wrong - it would expand strictly more tiles than the
     * original, because nodes discovered by a late parent would be dropped on
     * the floor. Ordering is load-bearing here; that is the whole reason the
     * C# discards nodes it has already visited rather than revisiting them.
     */
    const heap: Point[] = [];
    const heapDists: number[] = [];
    const enqueued = this.enqueued;
    enqueued.clear();

    const destKey = RouteFinder.tileKey(dest, map);

    const push = (pos: Point, dist: number): void => {
      let i = heap.length;
      heap.push(pos);
      heapDists.push(dist);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heapDists[parent] <= heapDists[i]) break;
        const tp = heap[parent]; heap[parent] = heap[i]; heap[i] = tp;
        const td = heapDists[parent]; heapDists[parent] = heapDists[i]; heapDists[i] = td;
        i = parent;
      }
    };

    const pop = (): Point => {
      const top = heap[0];
      const lastPos = heap.pop()!;
      const lastDist = heapDists.pop()!;
      if (heap.length > 0) {
        heap[0] = lastPos;
        heapDists[0] = lastDist;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let smallest = i;
          if (l < heap.length && heapDists[l] < heapDists[smallest]) smallest = l;
          if (r < heap.length && heapDists[r] < heapDists[smallest]) smallest = r;
          if (smallest === i) break;
          const tp = heap[smallest]; heap[smallest] = heap[i]; heap[i] = tp;
          const td = heapDists[smallest]; heapDists[smallest] = heapDists[i]; heapDists[i] = td;
          i = smallest;
        }
      }
      return top;
    };

    enqueued.add(RouteFinder.tileKey(start, map));
    push(start, distanceFn(start, dest));

    while (heap.length > 0) {
      const current = pop();

      if (RouteFinder.tileKey(current, map) === destKey) return true;
      if (adjToDestIsGoal && distanceFn(current, dest) === 1) return true;

      const curDist = distanceFn(current, dest);
      for (const dir of Direction.COMPASS) {
        const adj = dir.applyTo(current);
        if (!map.isInBoundsPoint(adj)) continue;
        const adjDist = distanceFn(adj, dest);
        if (adjDist >= curDist || adjDist > maxDist) continue;

        const adjKey = RouteFinder.tileKey(adj, map);
        if (enqueued.has(adjKey)) continue;
        if (!this.canMoveIn(game, a, map, adj)) continue;
        enqueued.add(adjKey);

        push(adj, adjDist);
      }
    }
    return false;
  }

  /**
   * Dense integer key for a tile, local to one map.
   *
   * The search uses it purely for dedup, so it only has to be injective over
   * the tiles this search can reach. `x + y * width` is injective across the
   * whole grid, which is a superset of what an A*-restricted search touches.
   */
  private static tileKey(pos: Point, map: GameMap): number {
    return pos.y * map.width + pos.x;
  }

  /**
   * Returns true if the actor can move into the tile at `pos`,
   * considering the allowed special actions.
   */
  private canMoveIn(game: Game, a: Actor, map: GameMap, pos: Point): boolean {
    if (map.isWalkablePoint(pos)) return true;

    const mobj = map.getMapObjectAtPoint(pos);
    if (!mobj) return false; // blocked by wall tile

    // ── Door? ────────────────────────────────────────────────────────────
    // C# is `DoorWindow door = mobj as DoorWindow; if (door != null)`
    // (src/Gameplay/AI/Tools/RouteFinder.cs:263). The port probed a
    // `isDoor` property that MapObject never had, so this block was
    // unreachable and a closed door counted as impassable. Every living AI
    // passes SpecialActions.DOORS, so the effect was that no NPC could route
    // through a closed door - and `behaviorGoGetInterestingItems` discards
    // stacks it cannot reach, which meant loot inside a closed building was
    // invisible to the whole town.
    if (this.allowedActions & SpecialActions.DOORS) {
      if (mobj instanceof DoorWindow) {
        if (game.rules.isOpenableFor(a, mobj).ok) return true;
        if ((this.allowedActions & SpecialActions.BREAK) && game.rules.isBreakableFor(a, mobj).ok) return true;
        return false;
      }
    }

    // ── Jumpable? ─────────────────────────────────────────────────────────
    if ((this.allowedActions & SpecialActions.JUMP) && mobj.isJumpable && game.rules.hasActorJumpAbility(a)) return true;

    // ── Pushable? ─────────────────────────────────────────────────────────
    if ((this.allowedActions & SpecialActions.PUSH) && game.rules.canActorPush(a, mobj).ok) return true;

    // ── Breakable? ───────────────────────────────────────────────────────
    if ((this.allowedActions & SpecialActions.BREAK) && game.rules.isBreakableFor(a, mobj).ok) return true;

    return false;
  }
}
