import { Point } from "@engine/Point";

/**
 * THE positional key for a tile. One function, one formula, one coordinate
 * space.
 *
 * ## Why it is a number
 *
 * This used to be `` `${x},${y}` `` — a string, allocated on *every* call, to do
 * an integer-to-integer hash. The spatial tables in `Map` are read by
 * `isWalkable`, `isTransparent`, `isBlockingFire` and `isBlockingThrow`, i.e.
 * once per step of every raycast in `LOS` and once per candidate tile in
 * `RouteFinder`: thousands of short-lived strings per actor per turn.
 *
 * The Field Of View had the same problem, worse. `LOS.computeFOVFor` builds a
 * `(2r+1)²` box (19×19 = 361 tiles for a living actor), allocating a string per
 * tile for the `has` probe, and `fovSub` then traces a ray to each of those and
 * allocates a *further* string per ray step. Roughly **5 000 string allocations
 * and 5 000 `Set` hash operations per actor per turn**, before any AI runs, and
 * the sensors then `split(",")`-parsed the whole set back three times per `sense()`.
 *
 * ## Why it is shared rather than duplicated
 *
 * `Map` had already been converted to a numeric key with the same formula and
 * the same reasoning written out at length; the FOV was simply never done. Two
 * copies of one formula is how they drift, and a drifted key does not throw — it
 * answers `false` for a tile that is in the set. So `Map.key` and `LOS.fovKey`
 * both delegate here.
 *
 * ## The formula
 *
 * `y * STRIDE + x` is injective for any two points whose `x` both lie in
 * `0..STRIDE-1`: then `y1*S + x1 == y2*S + x2` forces equal `x` and equal `y`.
 *
 * The stride is 1024 for headroom over the largest `x` that can actually be
 * stored. Maps are capped at 100×100 (`RogueGame.MAP_MAX_WIDTH/HEIGHT`) and the
 * widest thing ever keyed is a border-ring exit at `x == map.width`, so real
 * keys stay well inside 0..1023. A coordinate beyond that — say x = 1500 — would
 * alias onto (476, y+1), but nothing keys a tile that far out.
 *
 * Note the deliberate absence of an `isInBounds` check. The string key had no
 * bounds requirement, and the tables that use this are not all in-bounds: border
 * exits sit on the *outside* ring at `x == map.width`, so guarding the readers
 * against `isInBounds` silently hid every exit on the map edge. The stride
 * supplies the safety instead.
 */
export const COORD_KEY_STRIDE = 1024;

/** The key a tile at `(x, y)` is stored under. */
export function coordKey(x: number, y: number): number {
  return y * COORD_KEY_STRIDE + x;
}

/** Inverse of {@link coordKey}. */
export function coordKeyToPoint(k: number): Point {
  return new Point(k % COORD_KEY_STRIDE, Math.floor(k / COORD_KEY_STRIDE));
}
