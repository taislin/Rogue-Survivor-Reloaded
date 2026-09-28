import { DayPhase } from "@engine/WorldTime";

/**
 * `Rules.losDistance` multiplies Euclidean distance by this, so a `Rules.actorFOV`
 * value of `n` is a visible radius of `n / LOS_DISTANCE_FACTOR` tiles.
 *
 * Named and exported rather than re-derived at the call site. It is the number that
 * turns "a field of view of 3" into "three and a half tiles", and getting the
 * direction of the division wrong shortens the view by a seventh with nothing to
 * report it.
 */
export const LOS_DISTANCE_FACTOR = 0.8660254;

/**
 * How bright to draw the first-person view, 0..1, for a time of day.
 *
 * **A synthesis, and marked as one.** `Map.lighting` is per *map*, so a LIT
 * interior has the same value at midnight as at noon: the view that prompted this
 * was 3am in a lit subway station and rendered as bright concrete, which is
 * wrong-looking rather than wrong, so it wanted an answer from somewhere other than
 * `lighting`.
 *
 * The values are a rough inverse of `Rules.nightFovPenalty` — the same hours, the
 * same order — so the darkness and the shortened sight agree about what night is.
 * They are *not* a second source of truth for the FOV: that still comes from
 * `Rules.actorFOV`. If a night's penalty is retuned, this should move with it, and
 * the honest fix at that point is to read the penalty rather than keep two tables.
 *
 * It can only darken. `scaleColor` clamps at 1, so this can never brighten a map
 * past full daylight, and it can never make a dark map visible.
 */
export function daylightFor(phase: DayPhase): number {
  switch (phase) {
    case DayPhase.SUNSET:    return 0.75;
    case DayPhase.EVENING:   return 0.55;
    case DayPhase.MIDNIGHT:  return 0.30;
    case DayPhase.DEEP_NIGHT: return 0.22;
    case DayPhase.SUNRISE:   return 0.70;
    default:                 return 1;
  }
}
