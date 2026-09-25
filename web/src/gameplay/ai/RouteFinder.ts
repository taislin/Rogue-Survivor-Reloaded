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

interface Node {
  pos: Point;
  distToGoal: number;
  visited: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// RouteFinder
// ────────────────────────────────────────────────────────────────────────────

export class RouteFinder {
  /** The AI that owns this route finder. Set by BaseAI. */
  actor!: Actor;
  /** Which special actions are allowed when checking route. */
  allowedActions: number = SpecialActions.NONE;

  private readonly nodes: Node[] = [];

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

    // A*-like search.
    this.nodes.length = 0;
    this.insertSorted({ pos: start, distToGoal: distanceFn(start, dest), visited: false });

    for (;;) {
      // Find first unvisited node (nodes are sorted by distToGoal).
      let current: Node | undefined;
      for (const n of this.nodes) {
        if (n.pos.equals(dest)) return true;
        if (adjToDestIsGoal && distanceFn(n.pos, dest) === 1) return true;
        if (!n.visited) { current = n; break; }
      }
      if (!current) return false; // exhausted

      current.visited = true;
      const curDist = distanceFn(current.pos, dest);

      for (const dir of Direction.COMPASS) {
        const adj = dir.applyTo(current.pos);
        if (!map.isInBoundsPoint(adj)) continue;
        const adjDist = distanceFn(adj, dest);
        if (adjDist >= curDist || adjDist > maxDist) continue;
        if (!this.canMoveIn(game, a, map, adj)) continue;

        const existing = this.nodes.find(n => n.pos.equals(adj));
        if (!existing) {
          this.insertSorted({ pos: adj, distToGoal: adjDist, visited: false });
        }
        // If existing and not visited, it's already in the list – just leave it.
      }
    }
  }

  /** Insert a node keeping the list sorted by distToGoal ascending. */
  private insertSorted(node: Node): void {
    const idx = this.nodes.findIndex(n => n.distToGoal > node.distToGoal);
    if (idx === -1) {
      this.nodes.push(node);
    } else {
      this.nodes.splice(idx, 0, node);
    }
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
    if (this.allowedActions & SpecialActions.DOORS) {
      if ((mobj as any).isDoor !== undefined) {
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
