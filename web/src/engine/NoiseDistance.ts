/**
 * The noise-distance model: which of the C#'s four noise radii a source falls
 * in, for a given listener.
 *
 * Still Alive splits every loud effect into three or four recordings of the same
 * event at different distances — `PISTOL_SINGLE_SHOT_PLAYER` / `_NEARBY` / `_FAR`
 * are one gunshot, and which one you hear is a function of how far the shooter
 * is.
 *
 * The port declares 181 of the fork's ids and plays 76 of them. **78 of those 181
 * are distance variants** — a `_NEARBY` / `_FAR` / `_AUDIBLE` / `_VISIBLE` /
 * `_SOMEWHERE` suffix is a tier, not a separate event — and **39 of the 78 are now
 * played**, through the two centralised readers in `RogueGame` that the ladder
 * below feeds. The other 39 are inert: declared, tabled and on disk, with nothing
 * to select their tier.
 *
 * It used to say "all 180 of those pairs as files and plays three of them" and
 * "the other 177 ids are inert", which was the port's state when the ladder did
 * not exist. The claim that is still true, and is the one worth keeping, is the
 * next sentence: **the missing piece was never the audio, it was the decision.**
 * With no radius constants and no audibility predicate there is nothing to select
 * a tier with, so every tier is inert however many files ship. That is why the
 * remaining 39 are a missing-callsite problem and not a missing-audio one, and why
 * `Feature.HelicopterRescue` and one `Feature.AmbientAudio` track were blocked on
 * the same decision.
 *
 * ## Ported from
 *
 * - `Rules.QUIET_NOISE_RADIUS = 5`, `MODERATE = 8`, `LOUD = 14`, `BOOMING = 23`
 *   — `Rules.cs:226-229`, quoted in {@link NOISE_RADII}.
 * - The tier ladder — `RogueGame.cs:10535-10542`, in
 *   {@link bandForDistance}. Every comparison there is `dist <= RADIUS`, so every
 *   radius is an **inclusive** upper bound: a source 23 tiles away is still
 *   `BOOMING`, and one 24 tiles away is inaudible.
 * - `RogueGame.IsAudibleToPlayer(location, audioRadius = 0)` —
 *   `RogueGame.cs:993-1025`, in {@link isAudibleTo}.
 * - `RogueGame.DistanceToPlayer` returning `int.MaxValue` across maps —
 *   `RogueGame.cs:28944-28949`, in {@link OFF_MAP_DISTANCE}.
 *
 * ## Two distances, and mixing them is the bug
 *
 * The C# measures audibility with **two different metrics in one predicate**
 * (`RogueGame.cs:1010` and `:1018`), and which one applies depends on which gate
 * is being asked:
 *
 * - `StdDistance` — Euclidean, `sqrt(dx² + dy²)` (`Rules.cs:4319-4325`) — gates
 *   the whole predicate against the listener's own `Actor.AudioRange`.
 * - `GridDistance` — Chebyshev, `max(|dx|, |dy|)` (`Rules.cs:4303-4311`) — gates
 *   the supplied noise radius, and is the metric the tier ladder uses.
 *
 * Chebyshev never exceeds Euclidean, so the *same number* read in the other
 * metric is always the more permissive one, and substituting them still
 * type-checks and still looks reasonable. At a diagonal offset of 5,5 the grid
 * distance is 5 (`QUIET`) while the standard distance is 7.07 (`MODERATE`), so a
 * port that read the tier ladder in Euclidean would hand every band boundary to
 * the next tier out along the diagonals and leave the axes correct —
 * which is why it would survive a playtest and fail a review. Both metrics are
 * exported under their own names, and `tests/noise-distance.test.ts` pins the
 * disagreement at a diagonal.
 *
 * ## Why the radii are here and not on `Rules`
 *
 * `Rules.LOUD_NOISE_RADIUS` already exists, and it is **5, not 14** — the
 * vanilla RS value, from before the fork raised it (Release 5-3, cited at
 * `Rules.cs:227`). The port's copy is load-bearing: `RogueGame.OnLoudNoise`
 * (`RogueGame.ts:20064-20081`) uses it to bound the square it scans for sleepers
 * to wake, and `Rules.actorLoudNoiseWakeupChance` (`Rules.ts:3014`) uses it in
 * the distance bonus. Raising it to the fork's 14 is a real gameplay change —
 * more sleepers within earshot of a gunshot, a bigger scan every noise — and it
 * is not this model. So the two same-named numbers are kept apart deliberately,
 * and a test asserts they are still apart. The divergence that leaves is worth
 * stating plainly rather than in a report: **gunfire wakes sleepers on a 5-tile
 * radius in the port and a 14-tile radius in the C#**, so a survivor asleep in
 * the next district sleeps through a firefight the fork would have woken them
 * for. That is a real bug, and it is `Rules.LOUD_NOISE_RADIUS`'s to own, not
 * this module's to fix silently.
 *
 * ## Pure by construction
 *
 * No imports, no audio state, no I/O, no map or actor reads, no clock and no
 * `Math.random`. `bandFor` is a function of two coordinates, so the whole model
 * is testable without a world, a session or a ruleset — which is also why it
 * carries no `hasFeature` gate. The bands are not Still Alive content; the
 * *recordings* are, and those are what `Feature.ExtendedAudio` already gates.
 */

/** The four radii the C# names, keyed by its own constant names. */
export const NOISE_RADII = {
  /** `Rules.cs:229` — "eg conversation. can be used for Player or Visible sfxs". */
  QUIET: 5,
  /** `Rules.cs:228` — "eg climbing on a car. can be used for Nearby sfxs". */
  MODERATE: 8,
  /** `Rules.cs:227` — "eg firing a gun. can be used for Far sfxs". */
  LOUD: 14,
  /** `Rules.cs:226` — "loud ambients eg helicopters". */
  BOOMING: 23,
} as const;

/**
 * Which of those radii a source falls in for a given listener.
 *
 * Named after the radius constants rather than after the sound-id suffixes,
 * because the fork's suffixes are not one-to-one: the `QUIET` band is spelled
 * `_PLAYER` on a weapon effect and `_VISIBLE` on an ambient
 * (`FLAMETHROWER_VISIBLE`, `RogueGame.cs:19054`), and `BOOMING` has no suffix at
 * all — it names only the helicopter's `STATIONARY_HELICOPTER_FARTHEST`. The
 * model therefore speaks the C#'s vocabulary and the caller translates to an
 * asset name, so no tier is ever selected by string-matching a file name.
 */
export enum NoiseBand {
  /** Within `QUIET` tiles: close enough that the C# plays the source's own tier. */
  Quiet,
  /** Within `MODERATE`: the fork's `_NEARBY` tier. */
  Moderate,
  /** Within `LOUD`: the fork's `_FAR` tier. */
  Loud,
  /** Within `BOOMING`: the helicopter's `_FARTHEST`, and explosions. */
  Booming,
  /** Beyond `BOOMING`: no tier plays. Not a failure case — the common case. */
  Inaudible,
}

/**
 * A point the model can measure to. Structural, so both the engine's `Point` and
 * a bare `{ x, y }` off a save graph are accepted without a conversion.
 */
export interface NoisePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The C#'s "no radius was supplied" sentinel — `IsAudibleToPlayer`'s own default
 * (`RogueGame.cs:993`), tested at `:1012`.
 *
 * It means **unbounded by tier**, not "same tile only". A predicate that treated
 * it as a radius of zero would make `IsAudibleToPlayer(loc)` silent from one tile
 * away, which is the opposite of what the C# does and would break every
 * call site that omits the radius.
 */
export const NO_NOISE_RADIUS = 0;

/**
 * The C#'s "the player is on another map" distance — `int.MaxValue`
 * (`RogueGame.cs:28946-28948`), returned by `DistanceToPlayer` so a source on a
 * different map compares greater than every radius instead of being special-cased
 * at each call site. `bandForDistance(OFF_MAP_DISTANCE)` is `Inaudible`, so a
 * caller that forgets the map check hears nothing rather than the farthest tier.
 */
export const OFF_MAP_DISTANCE = 2147483647;

/**
 * `Rules.GridDistance` — `Rules.cs:4303-4311`.
 *
 * Chebyshev, so a diagonal step costs one tile and an axis-aligned step costs one
 * tile. This is the metric every noise radius is measured in.
 */
export function noiseDistance(listener: NoisePoint, source: NoisePoint): number {
  return Math.max(Math.abs(listener.x - source.x), Math.abs(listener.y - source.y));
}

/**
 * `Rules.StdDistance` — `Rules.cs:4319-4325`.
 *
 * Euclidean, and the metric of `Actor.AudioRange` rather than of any noise
 * radius. Exported so the outer gate in {@link isAudibleTo} and the inner one
 * cannot be written against the same number by accident.
 */
export function euclideanDistance(listener: NoisePoint, source: NoisePoint): number {
  const dX = source.x - listener.x;
  const dY = source.y - listener.y;
  return Math.sqrt(dX * dX + dY * dY);
}

/** Each audible band's inclusive upper bound, ascending. */
const BAND_CEILINGS: readonly { readonly band: NoiseBand; readonly maxDistance: number }[] = [
  { band: NoiseBand.Quiet, maxDistance: NOISE_RADII.QUIET },
  { band: NoiseBand.Moderate, maxDistance: NOISE_RADII.MODERATE },
  { band: NoiseBand.Loud, maxDistance: NOISE_RADII.LOUD },
  { band: NoiseBand.Booming, maxDistance: NOISE_RADII.BOOMING },
];

/**
 * The tier ladder — `RogueGame.cs:10535-10542`, verbatim.
 *
 * The C# writes each lower bound out longhand (`dist > QUIET && dist <= MODERATE`)
 * inside an `else if`, which says the same thing as this ascending scan. Every
 * comparison is `<=`, so a source exactly on a boundary is in the *nearer* band;
 * that is the C#'s answer and `RogueGame.cs:10535` is where it is decided.
 *
 * Total, and the fifth case matters: past `BOOMING` the C# plays nothing at all,
 * which is modelled as `Inaudible` rather than as a missing return, so a caller
 * cannot forget the "no tier for this distance" arm.
 */
export function bandForDistance(distance: number): NoiseBand {
  for (const { band, maxDistance } of BAND_CEILINGS) {
    if (distance <= maxDistance) return band;
  }
  return NoiseBand.Inaudible;
}

/**
 * The tier a source falls in for a given listener: {@link bandForDistance} of
 * {@link noiseDistance}.
 *
 * Takes positions rather than `Location`s or actors on purpose. Every question
 * this answers — which helicopter track, which gunshot — is about two tiles, and
 * the map, sleeping and hearing checks that surround it in the C# are the
 * caller's to make and to pass in through {@link isAudibleTo}.
 */
export function bandFor(listener: NoisePoint, source: NoisePoint): NoiseBand {
  return bandForDistance(noiseDistance(listener, source));
}

/**
 * Is `distance` inside `band`? One band in, every other out.
 *
 * That is the complement of the C#'s *start* ladder, which makes it the right
 * test for the *stop* half at `RogueGame.cs:10545-10555` — and where the C#
 * differs from it. The C# stops a track with `IsPlaying(track) && dist >
 * upperBound`, so a helicopter track for the `NEAR` tier keeps playing for every
 * distance up to `MODERATE`, including the 3 tiles at which the C# is
 * simultaneously starting `VISIBLE`; walking towards a landed helicopter leaves
 * two tracks running. `isWithinBand` asks the question that ladder meant to ask,
 * so a ported caller stops the stale tier, and the divergence becomes the
 * caller's to record rather than something to discover in play. `Inaudible` is
 * never "in band": no track exists for it.
 */
export function isWithinBand(band: NoiseBand, distance: number): boolean {
  return band !== NoiseBand.Inaudible && bandForDistance(distance) === band;
}

/**
 * `IsAudibleToPlayer`'s radius test on its own — `RogueGame.cs:1017-1018`,
 * `GridDistance(...) <= audioRadius`, inclusive.
 *
 * The single-radius primitive, kept because it is what the C#'s 177
 * `_PLAYER`/`_NEARBY`/`_FAR` chains are built from: each of those is an
 * `else if` ladder of this call against successively larger radii, which is
 * {@link bandFor} seen from the other side. A negative radius is false at every
 * distance, which is what the C#'s `<=` gives.
 */
export function isWithinNoiseRadius(
  listener: NoisePoint,
  source: NoisePoint,
  radius: number,
): boolean {
  return noiseDistance(listener, source) <= radius;
}

/**
 * The geometric core of `RogueGame.IsAudibleToPlayer` — `RogueGame.cs:1009-1021`.
 *
 * Both gates, in the C#'s order, with the two non-geometric conditions left to
 * the caller because they are about an `Actor` and a `Map` and not about
 * distance:
 *
 * 1. `StdDistance(...) <= audioRange` (`:1010`) — the listener's own hearing
 *    range, Euclidean. **Not** a noise radius, and it is the *outer* gate: no
 *    tier is audible past it even when the tier radius would allow it.
 * 2. `GridDistance(...) <= radius` (`:1017-1018`) — Chebyshev, skipped entirely
 *    when `radius` is {@link NO_NOISE_RADIUS} (`:1012-1013`).
 *
 * The C# answers `false` for a null player, a sleeping player, and a source on
 * another map (`:999-1007`, `:1002`); those stay at the call site, and
 * `isAudibleTo` is only reached once they have passed.
 */
export function isAudibleTo(
  listener: NoisePoint,
  source: NoisePoint,
  audioRange: number,
  radius: number = NO_NOISE_RADIUS,
): boolean {
  if (euclideanDistance(listener, source) > audioRange) return false;
  if (radius === NO_NOISE_RADIUS) return true;
  return isWithinNoiseRadius(listener, source, radius);
}
