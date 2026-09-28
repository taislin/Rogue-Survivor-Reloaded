import { describe, it, expect } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

/**
 * A headless run must terminate.
 *
 * Hangs are the failure mode this project cannot see. A crash throws and the
 * suite goes red; a hang just eats the CI timeout, and on a developer machine
 * it looks like "the test suite is slow today". §1.2 of the plan says to watch
 * for hangs specifically, and this suite exists because of one.
 *
 * Found by the seed sweep that re-baselined §1.2: **seed 8 hung forever on
 * turn 94.** The bot player repeatedly chose `ActionUseExit` toward an exit
 * whose destination was blocked by an actor. `DoLeaveMap` returned early in
 * that case *without spending action points* -- faithful to the C# at
 * `RogueGame.cs:13159-13179`, where it is harmless because a human presses
 * another key. A player skips the `!actor.isPlayer` AP spend, so nothing was
 * consumed, `canActorUseExit` passed again next turn, and the loop never
 * advanced. Fixed by spending `BASE_ACTION_COST` on the blocked path, which is
 * the idiom the C# already uses twenty lines above for a failed
 * `TryActorLeaveTile` ("waste ap").
 *
 * The seeds are the ones that actually hung or died during the sweep, so this
 * is a real regression set rather than an arbitrary sample. Each is capped at
 * 120 turns: the bug appeared at turn 94, and a cap keeps the test fast while
 * still crossing it.
 */

const SEEDS = [1, 2, 3, 7, 8, 9, 10];
const TURNS = 120;

/** Resolves on completion, rejects if `ms` elapses first. */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

describe("headless runs terminate", () => {
  it.each(SEEDS)("seed %i does not hang or throw", async (seed) => {
    const runner = new HeadlessRunner(seed);
    const metrics = await withDeadline(
      runner.run({ worldSize: 1, maxTurns: TURNS, isUndead: true, bot: true }),
      60_000,
      `seed ${seed}`
    );
    // A thrown engine error is reported here rather than escaping; either way
    // the run must finish and produce metrics.
    expect(metrics.error, `seed ${seed} threw: ${metrics.error}`).toBeUndefined();
    expect(metrics.turnsPlayed).toBeGreaterThan(0);
  }, 70_000);

  it("the 900-turn run that used to hang now completes", async () => {
    // Seed 8 specifically: this is the exact configuration that livelocked.
    //
    // **Why this no longer asserts 900 turns.** It used to, and it was the
    // wrong assertion. The run loop breaks on `player.isDead`
    // (`HeadlessRunner.ts:172`), so `turnsPlayed` is capped by *when the bot
    // dies*, not by the turn limit — and the undead bot dies to survivor
    // gunfire, which §1.2 of the plan already records as expected ("the undead
    // bot dies to ranged fire"). `toBe(900)` was therefore asserting a balance
    // outcome, not a liveness property, and it went red the moment any change
    // made the AI fight back: the FOV-weather fix (`182c763`) and the AI
    // fidelity fixes both end this run at ~150 turns. Those runs are *more*
    // correct, not less.
    //
    // The consequence, stated plainly: with the bot dying at ~150 it never
    // reaches turn 94, so no turn-count assertion here can catch a regression in
    // the `DoLeaveMap` AP spend. **The deadline is the guard.** A livelock spins
    // until the deadline rejects, and that is what notices — not an assertion
    // on the turn total.
    const runner = new HeadlessRunner(8);
    const metrics = await withDeadline(
      runner.run({ worldSize: 1, maxTurns: 900, isUndead: true, bot: true }),
      120_000,
      "seed 8 @900"
    );
    expect(metrics.error).toBeUndefined();
    expect(metrics.turnsPlayed).toBeGreaterThan(0);
  }, 130_000);
});
