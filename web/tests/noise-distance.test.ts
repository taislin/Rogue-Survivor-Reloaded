import { describe, it, expect } from "vitest";

import { Point } from "@engine/Point";
import { DiceRoller } from "@engine/DiceRoller";
import { Rules } from "@engine/Rules";
import {
  NOISE_RADII,
  NO_NOISE_RADIUS,
  OFF_MAP_DISTANCE,
  NoiseBand,
  bandFor,
  bandForDistance,
  euclideanDistance,
  isAudibleTo,
  isWithinBand,
  isWithinNoiseRadius,
  noiseDistance,
} from "@engine/NoiseDistance";
import { NullSoundManager } from "@engine/audio/NullSoundManager";

/**
 * The noise-distance model — `engine/NoiseDistance.ts`.
 *
 * Still Alive ships one event as several recordings at several distances
 * (`PISTOL_SINGLE_SHOT_PLAYER` / `_NEARBY` / `_FAR` are one gunshot) and picks
 * between them with a four-step radius ladder. The port has the recordings and
 * no ladder, so 177 of the 180 ids are inert and three features are blocked. The
 * ladder is four comparisons against four constants, which is exactly the shape
 * of code that passes review while being off by one: a `<` where the C# has a
 * `<=` moves a band boundary by one tile, nothing throws, and the mistake is only
 * audible in play. So this file asserts the boundaries, not the shape.
 *
 * **The C# has no tests for this, so there are none to port.**
 * `_refs/StillAlive-master/Rogue Survivor Still Alive.sln` declares two projects —
 * the game and a config tool — and neither is a test project; there is no
 * `[Fact]`, `[Test]` or `Assert.` in the tree. Nothing below is a translation of
 * an upstream case. What is transcribed instead is the C#'s own code, twice and
 * independently of the implementation: the `if/else if` chain of
 * `RogueGame.cs:10535-10542` and the `IsAudibleToPlayer` gates of `:1009-1021`,
 * both written out below in the C#'s own shape. `bandFor` then has to agree with
 * the C# at every distance rather than merely look like it does.
 *
 * **The mutations this file exists to catch**, all run and all observed to turn
 * it red — see the report for the counts. Flipping the ladder's `<=` to `<`; an
 * off-by-one radius; reading the ladder in Euclidean instead of Chebyshev;
 * reading the outer `audioRange` gate in Chebyshev instead of Euclidean; making
 * the single-radius primitive exclusive; and reading the `radius === 0` sentinel
 * as a radius of zero rather than as "no tier limit". The last two are the ones
 * a reviewer is least likely to look for, and each of them is silent in play.
 */
const { QUIET, MODERATE, LOUD, BOOMING } = NOISE_RADII;

/**
 * The port's own distance methods, for checking the model against them. Fixed
 * seed because nothing here rolls — the only reason a `Rules` needs one is its
 * constructor.
 */
const rules = new Rules(new DiceRoller(1));

/** A source `distance` grid tiles east of the listener, on the same row. */
const eastOf = (distance: number): Point => new Point(distance, 0);

/** The reference listener for the sample grids below. */
const origin = new Point(0, 0);

/**
 * `RogueGame.cs:10535-10542`, transcribed. Deliberately *not* a loop and
 * deliberately keeping the C#'s longhand lower bounds, so that an implementation
 * which is wrong in the same way as a transcription mistake here is caught, and
 * so that the redundancy in the C# is visible rather than tidied away.
 */
function csharpTierLadder(dist: number): NoiseBand {
  if (dist <= QUIET) return NoiseBand.Quiet;
  if (dist > QUIET && dist <= MODERATE) return NoiseBand.Moderate;
  if (dist > MODERATE && dist <= LOUD) return NoiseBand.Loud;
  if (dist <= BOOMING) return NoiseBand.Booming;
  return NoiseBand.Inaudible;
}

/** `IsAudibleToPlayer` — `RogueGame.cs:1009-1021` — for the state it is given. */
function csharpIsAudibleTo(
  listener: Point,
  source: Point,
  audioRange: number,
  audioRadius: number,
): boolean {
  if (rules.stdDistance(listener, source) > audioRange) return false;
  if (audioRadius === 0) return true;
  return rules.gridDistance(listener, source) <= audioRadius;
}

describe("the C#'s radii", () => {
  it("are the four constants of Rules.cs:226-229, unchanged", () => {
    // Transcribed from the C# rather than recomputed, because the whole model's
    // value is that a radius nobody re-derived is the radius in the C#.
    expect(QUIET, "Rules.cs:229").toBe(5);
    expect(MODERATE, "Rules.cs:228").toBe(8);
    expect(LOUD, "Rules.cs:227").toBe(14);
    expect(BOOMING, "Rules.cs:226").toBe(23);
  });

  it("are a strictly ascending scale, which the ladder requires", () => {
    // Not a style assertion. The ladder is a scan over ascending ceilings, so
    // two equal radii would leave one band with no distance at all.
    const radii = [QUIET, MODERATE, LOUD, BOOMING];
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!, `${NoiseBand[i]} must be above ${NoiseBand[i - 1]}`).toBeGreaterThan(
        radii[i - 1]!,
      );
    }
  });

  it("does not reuse the port's older, same-named LOUD_NOISE_RADIUS", () => {
    // `Rules.LOUD_NOISE_RADIUS` is 5 — the vanilla RS value, from before the
    // fork raised it to 14 (Release 5-3, cited at `Rules.cs:227`). The port's
    // copy is load-bearing: `OnLoudNoise` bounds the square it scans for sleepers
    // to wake by it, and `actorLoudNoiseWakeupChance` uses it in the distance
    // bonus. So the two numbers are deliberately *not* reconciled here, and this
    // is the tripwire that says so out loud.
    //
    // They are 9 apart, and the trap is the coincidence: the C#'s
    // `QUIET_NOISE_RADIUS` is *also* 5, the number the port's
    // `LOUD_NOISE_RADIUS` holds. So a reader who assumes the port's constant is
    // the fork's silently gets the quiet radius for every gunshot tier, and the
    // three `_far` ids would answer to a gun five tiles away.
    expect(Rules.LOUD_NOISE_RADIUS).toBe(5);
    expect(NOISE_RADII.QUIET).toBe(Rules.LOUD_NOISE_RADIUS);
    expect(NOISE_RADII.LOUD).not.toBe(Rules.LOUD_NOISE_RADIUS);
    expect(NOISE_RADII.LOUD).toBeGreaterThan(Rules.LOUD_NOISE_RADIUS);
  });
});

describe("the tier ladder matches the C# at every distance", () => {
  it("agrees with the C#'s if/else if chain from 0 to 40 tiles", () => {
    // The boundary is decided at `RogueGame.cs:10535`, and the way to be sure of
    // it is to run the C#'s own chain over the same numbers rather than to read
    // the implementation and agree with it.
    const disagreements: string[] = [];
    for (let dist = 0; dist <= 40; dist++) {
      const got = bandForDistance(dist);
      const want = csharpTierLadder(dist);
      if (got !== want) {
        disagreements.push(`dist ${dist}: model ${NoiseBand[got]}, C# ${NoiseBand[want]}`);
      }
    }
    expect(disagreements, `the ladder and the C# differ:\n  ${disagreements.join("\n  ")}`).toEqual([]);
  });

  it("holds the C#'s four boundaries, on both sides and exactly on them", () => {
    // Each radius is an inclusive upper bound: every comparison at
    // `RogueGame.cs:10535-10541` is `dist <= RADIUS`, so a source *on* the
    // radius belongs to the *nearer* band. One step further out and it drops one
    // band, never two.
    //
    // The numbers are literals rather than the destructured constants on
    // purpose, so that moving a boundary fails *this* test with a message that
    // names the boundary. Derived from `NOISE_RADII`, this table would move with
    // the model and only the transcription test would notice — and that one
    // transcribes from the same source, so it cannot.
    const ladder: readonly (readonly [number, NoiseBand, string])[] = [
      [5, NoiseBand.Quiet, "Rules.cs:229"],
      [8, NoiseBand.Moderate, "Rules.cs:228"],
      [14, NoiseBand.Loud, "Rules.cs:227"],
      [23, NoiseBand.Booming, "Rules.cs:226"],
    ];
    for (const [radius, band, source] of ladder) {
      expect(bandForDistance(radius - 1), `just inside ${radius} (${source})`).toBe(band);
      expect(bandForDistance(radius), `exactly on ${radius} (${source})`).toBe(band);
      const next = ladder[ladder.findIndex(([r]) => r === radius) + 1];
      if (next !== undefined) {
        expect(bandForDistance(radius + 1), `just outside ${radius} (${source})`).toBe(next[1]);
      } else {
        expect(bandForDistance(radius + 1), `just outside ${radius} (${source})`).toBe(
          NoiseBand.Inaudible,
        );
      }
    }
  });

  it("puts exactly one source 23 tiles away in BOOMING and one 24 tiles away in none", () => {
    // Stated on its own because BOOMING is the only radius whose far side is a
    // *band* rather than a band change, and it is the one the helicopter's
    // `_FARTHEST` track hangs on.
    expect(bandForDistance(BOOMING)).toBe(NoiseBand.Booming);
    expect(bandForDistance(BOOMING + 1)).toBe(NoiseBand.Inaudible);
    expect(bandForDistance(1000)).toBe(NoiseBand.Inaudible);
  });

  it("measures a diagonal as one tile per step, which is what GridDistance means", () => {
    // `Rules.cs:4303-4311` is Chebyshev. A band boundary drawn on a circle would
    // be a different game, and the difference is 40% of the radius: at a 5,5
    // offset the C# says `QUIET` (5) where a Euclidean reading says `MODERATE`.
    const listener = new Point(0, 0);
    for (let d = 0; d <= BOOMING; d++) {
      expect(noiseDistance(listener, new Point(d, d)), `diagonal ${d},${d}`).toBe(d);
    }
    expect(bandFor(listener, new Point(QUIET, QUIET))).toBe(NoiseBand.Quiet);
    expect(bandFor(listener, new Point(MODERATE, MODERATE))).toBe(NoiseBand.Moderate);
  });
});

describe("the distance primitives", () => {
  it("puts the origin and a shared tile at distance 0", () => {
    // 0 has to be in band by the ladder's own rule — every ceiling is a `<=` — and
    // not by a special case, because a special case for zero is where an
    // off-by-one in the first comparison would hide.
    expect(noiseDistance(origin, origin)).toBe(0);
    expect(bandFor(origin, origin)).toBe(NoiseBand.Quiet);
    expect(bandForDistance(0)).toBe(NoiseBand.Quiet);
    expect(euclideanDistance(origin, origin)).toBe(0);
  });

  it("puts a listener and a source on the same tile in the same tile's band", () => {
    // Not the same as the origin case: a real `Location.position` is never
    // (0,0) — maps run 1..width — so this is the only version of "same tile"
    // that the game can actually produce.
    const here = new Point(37, 19);
    expect(noiseDistance(here, new Point(37, 19))).toBe(0);
    expect(bandFor(here, here)).toBe(NoiseBand.Quiet);
    expect(isWithinNoiseRadius(here, here, 0)).toBe(true);
  });

  it("agrees with the port's own Rules, which is the C# formula again", () => {
    // The model recomputes rather than calling `Rules`, so that it can be used
    // from anywhere without dragging `Rules` in — and therefore the two have to
    // be checked against each other rather than assumed equal.
    const points = [
      new Point(0, 0),
      new Point(1, 1),
      new Point(4, 9),
      new Point(-3, 7),
      new Point(50, 2),
    ];
    for (const a of points) {
      for (const b of points) {
        expect(noiseDistance(a, b), `grid ${a} -> ${b}`).toBe(rules.gridDistance(a, b));
        expect(euclideanDistance(a, b), `std ${a} -> ${b}`).toBe(rules.stdDistance(a, b));
      }
    }
  });

  it("never returns a negative distance, whatever the coordinates", () => {
    // `Math.abs` is what guarantees it, and a negative distance would satisfy
    // every `<=` in the ladder and pin a source to `Quiet` from the far side of
    // the map. A subtraction without it produces exactly that.
    const pairs: [Point, Point][] = [
      [new Point(0, 0), new Point(9, 4)],
      [new Point(9, 4), new Point(0, 0)],
      [new Point(-4, -9), new Point(-1, -2)],
      [new Point(3, 3), new Point(-3, -3)],
    ];
    for (const [listener, source] of pairs) {
      expect(noiseDistance(listener, source)).toBeGreaterThanOrEqual(0);
      expect(euclideanDistance(listener, source)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("coordinates that are not tiles", () => {
  it("handles negative and off-map coordinates without throwing", () => {
    // `Map` is 1-based and finite, so nothing the game produces is negative or
    // off the edge — but `Location.position` is read out of save graphs and AI
    // target calculations, and the model touches no map, so a coordinate that
    // could never be placed must still be a number rather than an exception. The
    // C# has the same property: `GridDistance` is two subtractions and an
    // absolute value, and it is called with `ArmyHelicopterRescue_Coordinates`
    // before anything checks that a helicopter is there.
    //
    // Expected bands stated per point rather than in a loop, because they differ:
    // only (-1,-1) is inside any radius, and a single blanket expectation here is
    // how a sign bug in the `Math.abs` would slip through.
    const offMap: readonly (readonly [Point, number, NoiseBand])[] = [
      [new Point(-1, -1), 1, NoiseBand.Quiet],
      [new Point(-40, -40), 40, NoiseBand.Inaudible],
      [new Point(-1000, 3), 1000, NoiseBand.Inaudible],
      [new Point(9999, 9999), 9999, NoiseBand.Inaudible],
    ];
    for (const [p, distance, band] of offMap) {
      expect(() => bandFor(p, p)).not.toThrow();
      expect(noiseDistance(p, p)).toBe(0);
      expect(bandFor(p, p)).toBe(NoiseBand.Quiet);

      // The same tile, read as "the source is out on the map somewhere": no
      // throw, a real number, and the band the radius that far out earns.
      expect(() => bandFor(p, origin)).not.toThrow();
      expect(noiseDistance(p, origin)).toBe(distance);
      expect(bandFor(p, origin), `${p} -> origin`).toBe(band);
      expect(() => isAudibleTo(p, origin, 999)).not.toThrow();
      // With no tier limit and no hearing range to speak of, a coordinate that
      // could never be placed is still a distance rather than a rejection.
      expect(isAudibleTo(p, origin, Number.MAX_SAFE_INTEGER), `${p} -> origin`).toBe(true);
    }
  });

  it("answers Inaudible rather than throwing for a non-finite coordinate", () => {
    // `NaN` is the realistic one: it arrives from a division by a zero range or
    // an `undefined` read on a save graph. Every comparison against `NaN` is
    // false, so the ladder falls through to `Inaudible` — silent, not a crash,
    // and not `Quiet`.
    const nan = new Point(NaN, 0);
    expect(bandFor(new Point(0, 0), nan)).toBe(NoiseBand.Inaudible);
    expect(bandForDistance(NaN)).toBe(NoiseBand.Inaudible);
    expect(isAudibleTo(new Point(0, 0), nan, 100, QUIET)).toBe(false);
  });

  it("treats the C#'s off-map sentinel as out of earshot", () => {
    // `DistanceToPlayer` answers `int.MaxValue` when the player is on another map
    // (`RogueGame.cs:28946-28948`) so the map check does not have to be repeated
    // at each of the 40 `IsAudibleToPlayer(…, radius)` call sites in the C#.
    // If the port's sentinel ever compared inside a band, a caller that forgot
    // the map check would loop a helicopter track at the farthest tier forever.
    //
    // The sentinel is a *distance*, not a radius, so it is exercised as one: a
    // source that far away is past every radius, and past any `AudioRange` a
    // character sheet can hold.
    expect(OFF_MAP_DISTANCE).toBe(2147483647);
    expect(bandForDistance(OFF_MAP_DISTANCE)).toBe(NoiseBand.Inaudible);
    const listener = new Point(0, 0);
    const acrossTheMap = new Point(OFF_MAP_DISTANCE, 0);
    expect(noiseDistance(listener, acrossTheMap)).toBe(OFF_MAP_DISTANCE);
    expect(isWithinNoiseRadius(listener, acrossTheMap, BOOMING)).toBe(false);
    expect(isAudibleTo(listener, acrossTheMap, BOOMING, BOOMING)).toBe(false);
    expect(isAudibleTo(listener, acrossTheMap, BOOMING)).toBe(false);
  });
});

describe("isWithinNoiseRadius — the single-radius primitive", () => {
  it("is the C#'s inclusive GridDistance test, on both sides of the radius", () => {
    const listener = new Point(10, 10);
    for (const radius of [QUIET, MODERATE, LOUD, BOOMING]) {
      expect(isWithinNoiseRadius(listener, new Point(10 + radius, 10), radius)).toBe(true);
      expect(isWithinNoiseRadius(listener, new Point(10 + radius + 1, 10), radius)).toBe(false);
    }
  });

  it("is false at every distance for a negative radius, which is what `<=` gives", () => {
    // Not a guard against a mistake: the C# has no such guard either. A negative
    // `audioRadius` is a caller bug, and reproducing the C# means it is a silent
    // one rather than a thrown one.
    expect(isWithinNoiseRadius(new Point(0, 0), new Point(0, 0), -1)).toBe(false);
    expect(isWithinNoiseRadius(new Point(0, 0), eastOf(1), -1)).toBe(false);
  });

  it("is what the tier ladder is made of, band for band", () => {
    // The C#'s weapon-fire ladder (`RogueGame.cs:19010`, `:19077`, `:19138`) is an
    // `else if` chain of this test against successively larger radii, so the band
    // a source falls in and the radius that contains it are the same decision
    // stated two ways. This is the identity the 177 unwired `_PLAYER`/`_NEARBY`/
    // `_FAR` call sites will be written against, and the one that has to hold
    // before any of them can be ported.
    for (let dist = 0; dist <= 40; dist++) {
      const band = bandForDistance(dist);
      if (band === NoiseBand.Inaudible) {
        // Past `BOOMING` there is no radius that contains it, which is the one
        // thing the band model has to add over a chain of radius tests.
        for (const radius of [QUIET, MODERATE, LOUD, BOOMING]) {
          expect(
            isWithinNoiseRadius(new Point(0, 0), eastOf(dist), radius),
            `dist ${dist} should be past every radius, not inside ${radius}`,
          ).toBe(false);
        }
        continue;
      }
      expect(
        isWithinNoiseRadius(new Point(0, 0), eastOf(dist), ceilingOf(band)),
        `dist ${dist} against the ${NoiseBand[band]} radius`,
      ).toBe(true);
      if (band > NoiseBand.Quiet) {
        // And no narrower radius does: the band is the *tightest* that contains
        // the distance, which is what makes `bandFor` and the `else if` chain the
        // same selection.
        const narrower = band - 1;
        expect(
          isWithinNoiseRadius(new Point(0, 0), eastOf(dist), ceilingOf(narrower)),
          `dist ${dist} against the ${NoiseBand[narrower]} radius`,
        ).toBe(false);
      }
    }
  });
});

/** The inclusive upper bound of an audible band. */
function ceilingOf(band: NoiseBand): number {
  switch (band) {
    case NoiseBand.Quiet:
      return QUIET;
    case NoiseBand.Moderate:
      return MODERATE;
    case NoiseBand.Loud:
      return LOUD;
    case NoiseBand.Booming:
      return BOOMING;
    default:
      throw new Error(`${NoiseBand[band]} has no ceiling`);
  }
}

describe("isWithinBand — the stop half of the ladder", () => {
  it("is in band for exactly the distances that would have started it", () => {
    for (let dist = 0; dist <= 40; dist++) {
      const current = bandForDistance(dist);
      for (const band of [
        NoiseBand.Quiet,
        NoiseBand.Moderate,
        NoiseBand.Loud,
        NoiseBand.Booming,
      ]) {
        expect(isWithinBand(band, dist), `${NoiseBand[band]} at dist ${dist}`).toBe(band === current);
      }
    }
  });

  it("is never in band for Inaudible, which has no track", () => {
    expect(isWithinBand(NoiseBand.Inaudible, 0)).toBe(false);
    expect(isWithinBand(NoiseBand.Inaudible, 1000)).toBe(false);
  });

  it("is stricter than the C#'s stop ladder, on purpose", () => {
    // The C# stops a track with `IsPlaying(track) && dist > upperBound`
    // (`RogueGame.cs:10545-10555`), so a `NEAR` track keeps playing out to
    // `MODERATE` — including the 3 tiles at which the C# is simultaneously
    // starting `VISIBLE`, which is what happens to a player walking towards a
    // landed helicopter. `isWithinBand` asks the question that ladder meant to
    // ask, so a ported caller stops the stale tier; the divergence is the
    // caller's to record, and it is asserted here so it cannot be discovered by
    // listening for it in play.
    const cppStopsNear = (dist: number): boolean => dist > MODERATE;
    const modelStopsNear = (dist: number): boolean => !isWithinBand(NoiseBand.Moderate, dist);
    const diffs: number[] = [];
    for (let dist = 0; dist <= 40; dist++) {
      if (cppStopsNear(dist) !== modelStopsNear(dist)) diffs.push(dist);
    }
    // The disagreements are the nested distances: in band by the C#'s rule, out
    // of band by the model's. Every one of them is a distance the C# has another
    // track playing.
    expect(diffs).toEqual([0, 1, 2, 3, 4, 5]);
    for (const dist of diffs) {
      expect(bandForDistance(dist), `dist ${dist} starts a nearer track`).toBe(NoiseBand.Quiet);
    }
  });
});

describe("isAudibleTo — the C#'s two gates", () => {
  it("agrees with the C#'s IsAudibleToPlayer over both metrics and both radii", () => {
    // The diagonals are the point of the sample, not decoration. Every offset on
    // an axis has one distance, so swapping `StdDistance` for `GridDistance` in
    // the outer gate is invisible on it; an offset of `d,d` has grid distance `d`
    // and standard distance `1.41d`, and the pair below is chosen so a sampled
    // `audioRange` falls *between* the two for each of them. Without that, this
    // whole grid passes with the metrics transposed.
    const points = [
      new Point(0, 0),
      new Point(3, 3),
      new Point(4, 4), // grid 4, std 5.66
      new Point(6, 0),
      new Point(7, 7), // grid 7, std 9.90
      new Point(9, 4),
      new Point(10, 10), // grid 10, std 14.14
      new Point(13, 13), // grid 13, std 18.38
      new Point(20, 0),
    ];
    const ranges = [0, 5, 8, 14, 23, 40];
    const radii = [NO_NOISE_RADIUS, QUIET, MODERATE, LOUD, BOOMING, -1];

    // The guard on the guard. A sampled `audioRange` has to land *between* the
    // two metrics for some pair, or the grid below proves nothing about the
    // outer gate and passes happily with the metrics transposed — which is what
    // it did before the diagonals were added.
    const straddling = points.filter((p) =>
      ranges.some((r) => noiseDistance(p, origin) <= r && r < euclideanDistance(p, origin)),
    );
    expect(
      straddling.map((p) => p.toString()),
      "no sampled range falls between the two metrics, so this test cannot see them swapped",
    ).not.toEqual([]);

    const disagreements: string[] = [];
    for (const listener of points) {
      for (const source of points) {
        for (const audioRange of ranges) {
          for (const audioRadius of radii) {
            const got = isAudibleTo(listener, source, audioRange, audioRadius);
            const want = csharpIsAudibleTo(listener, source, audioRange, audioRadius);
            if (got !== want) {
              disagreements.push(
                `${listener}->${source} range ${audioRange} radius ${audioRadius}: model ${got}, C# ${want}`,
              );
            }
          }
        }
      }
    }
    expect(
      disagreements,
      `isAudibleTo and the C# differ:\n  ${disagreements.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the outer Euclidean gate, which is a different metric from the radius", () => {
    // `StdDistance(...) <= AudioRange` (`:1010`) outside, `GridDistance(...) <=
    // audioRadius` (`:1018`) inside. At a 9,9 offset the grid distance is 9 and
    // the standard distance 12.7, so an `audioRange` of 10 stops the noise before
    // the radius on the diagonal while admitting it on the axis. Writing the
    // outer gate in grid distance is the single easiest way to get the model
    // subtly wrong, and it is invisible on the axes — which is why the assertion
    // is a *pair*.
    const listener = new Point(0, 0);
    const diagonal = new Point(9, 9);
    expect(noiseDistance(listener, diagonal)).toBe(9);
    expect(euclideanDistance(listener, diagonal)).toBeCloseTo(12.728, 3);
    // Inside the BOOMING tier either way, so only the outer gate can decide.
    expect(isWithinNoiseRadius(listener, diagonal, BOOMING)).toBe(true);
    expect(isAudibleTo(listener, diagonal, 10, BOOMING), "diagonal, range 10").toBe(false);
    expect(isAudibleTo(listener, eastOf(9), 10, BOOMING), "axis, range 10").toBe(true);
    // And both admitted once the range clears the Euclidean distance.
    expect(isAudibleTo(listener, diagonal, 13, BOOMING)).toBe(true);
    expect(isAudibleTo(listener, eastOf(9), 13, BOOMING)).toBe(true);
  });

  it("reads a radius of zero as 'no tier limit', which is the C#'s default", () => {
    // `audioRadius = 0` is the parameter default at `RogueGame.cs:993` and is
    // tested at `:1012`, where it returns true for anything inside
    // `AudioRange`. Reading it as "a radius of zero" instead — audible only on
    // the listener's own tile — would silence every one of the C#'s call sites
    // that omit the radius, and `RogueGame.cs:21774` is one of them.
    const listener = new Point(0, 0);
    expect(NO_NOISE_RADIUS).toBe(0);
    for (const dist of [0, 1, 5, 8, 14, 23]) {
      expect(isAudibleTo(listener, eastOf(dist), 999, NO_NOISE_RADIUS), `dist ${dist}`).toBe(true);
    }
    // The outer gate still applies: `NO_NOISE_RADIUS` removes the tier test, not
    // the hearing range.
    expect(isAudibleTo(listener, eastOf(30), 23, NO_NOISE_RADIUS)).toBe(false);
  });

  it("lets the tighter of the two gates decide, as the C#'s nesting does", () => {
    // The C#'s radius test is *inside* the `AudioRange` branch (`:1010-1021`),
    // so it can only ever remove audibility, never add it. A `radius` far larger
    // than `audioRange` therefore buys nothing: the outer gate has already said
    // no, and the inner one is never reached.
    const listener = new Point(0, 0);
    // The radius gate says no at 24, in a range that would admit it.
    expect(isWithinNoiseRadius(listener, eastOf(BOOMING + 1), BOOMING)).toBe(false);
    expect(isAudibleTo(listener, eastOf(BOOMING + 1), 999, BOOMING)).toBe(false);
    // The range gate says no at 30, with a radius wide enough to admit it.
    expect(isWithinNoiseRadius(listener, eastOf(30), 999)).toBe(true);
    expect(isAudibleTo(listener, eastOf(30), BOOMING, 999)).toBe(false);
    // Both say yes.
    expect(isAudibleTo(listener, eastOf(QUIET), 999, BOOMING)).toBe(true);
  });
});

describe("the model is pure", () => {
  it("selects the fork's far tier for a distant listener and the nearby tier for a close one", () => {
    // What the tiers are *for*, stated as the decision the 177 unwired ids are
    // missing: a gunshot 12 tiles off is the `_FAR` recording, the same gunshot 6
    // tiles off is `_NEARBY`, and 3 tiles off is the player's own recording. No
    // sound is played here and no id is named — the ids are gated behind
    // `Feature.ExtendedAudio` and `tests/extended-audio.test.ts` asserts the three
    // that exist, so naming a fourth from this file would move that list rather
    // than test it. The decision is the whole of this subsystem.
    const listener = new Point(0, 0);
    expect(bandFor(listener, eastOf(3))).toBe(NoiseBand.Quiet);
    expect(bandFor(listener, eastOf(6))).toBe(NoiseBand.Moderate);
    expect(bandFor(listener, eastOf(12))).toBe(NoiseBand.Loud);
    // Past `LOUD` but inside `BOOMING`: the band with no sound-id tier of its
    // own, which the helicopter's `_FARTHEST` track is the only thing that uses.
    expect(bandFor(listener, eastOf(20))).toBe(NoiseBand.Booming);
    expect(bandFor(listener, eastOf(30))).toBe(NoiseBand.Inaudible);

    // And the same decision taken the way the C#'s weapon ladder takes it, which
    // is what a ported call site will actually write.
    const tier = (dist: number): string => {
      if (isWithinNoiseRadius(listener, eastOf(dist), QUIET)) return "player";
      if (isWithinNoiseRadius(listener, eastOf(dist), MODERATE)) return "nearby";
      if (isWithinNoiseRadius(listener, eastOf(dist), LOUD)) return "far";
      return "silent";
    };
    expect([0, 3, 5, 6, 8, 14, 15, 23, 24].map(tier)).toEqual([
      "player",
      "player",
      "player",
      "nearby",
      "nearby",
      "far",
      "silent",
      "silent",
      "silent",
    ]);
  });

  it("answers the same thing every time it is asked", () => {
    // Determinism is a build rule, and the model is the first place a future
    // edit could quietly break it: a `Math.random()` tie-break between two
    // equally close tiers, or a `Date.now()` in a cache key. Both would pass
    // every other test here.
    const listener = new Point(4, 7);
    // 12 grid tiles east, 5 south: 12 Chebyshev, so the `Loud` band by the
    // ceiling, and 13.0 by the metric `AudioRange` is measured in.
    const source = new Point(16, 12);
    expect(noiseDistance(listener, source)).toBe(12);
    const first = bandFor(listener, source);
    for (let i = 0; i < 1000; i++) {
      expect(bandFor(listener, source)).toBe(first);
    }
    expect(first).toBe(NoiseBand.Loud);
  });

  it("leaves the sound channel alone, so a null manager stays a no-op", () => {
    // The model has no audio state, and this is the observable form of that: a
    // `NullSoundManager` is still a no-op after it has been asked every
    // question. The port plays every effect through the *music* manager and has
    // no `m_SoundManager` at all (see plans/BROWSER_PORT_PLAN, `ExtendedAudio`), so
    // this is the manager a headless run actually has, and a model that reached
    // for one would break every headless test in the suite.
    const sounds = new NullSoundManager();
    for (let dist = 0; dist <= 40; dist++) {
      sounds.play(`tier-${dist}`);
    }
    expect(sounds.getVolume()).toBe(0);
    expect(() => sounds.stopAll()).not.toThrow();
    expect(() => sounds.setVolume(1)).not.toThrow();
  });
});
