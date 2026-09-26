import { describe, it, expect, beforeAll } from "vitest";
import { HeadlessRunner, HeadlessMetrics } from "../../src/sim/HeadlessRunner";

/**
 * End-to-end: boot the real game and play real turns.
 *
 * This is the test that matters most in this project. Phases 1-4 reached
 * "0 stubs, green type-check, green build" without ever executing the engine,
 * and the first run of the headless harness then found nine runtime bugs
 * including two that made the game unplayable. A green compiler is not
 * evidence; this file is.
 *
 * One run per file on purpose. `Session.get()` is a process-wide singleton and
 * the model databases register themselves into `Models` statics, so two games
 * in one process would share state. Vitest isolates each test file into a fresh
 * worker, so the single `beforeAll` run below is genuinely clean.
 */

const SEED = 12345;
const TURNS = 40;

let metrics: HeadlessMetrics;

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED);
  metrics = await runner.run({
    worldSize: 1,
    maxTurns: TURNS,
    isUndead: true, // undead do not have to eat, so the bot is not food-capped
    bot: true,
  });
}, 120_000);

describe("headless simulation", () => {
  it("completes the run without throwing", () => {
    // The single most important assertion. Every bug in §1.1 of the port plan
    // arrived through this field.
    expect(metrics.error).toBeUndefined();
  });

  it("actually plays turns rather than bailing out immediately", () => {
    expect(metrics.turnsPlayed).toBeGreaterThan(0);
    expect(metrics.turnsPlayed).toBeLessThanOrEqual(TURNS);
  });

  it("advances the world clock", () => {
    expect(metrics.finalTurn).toBeGreaterThan(0);
    expect(metrics.finalTurn).toBeLessThanOrEqual(TURNS);
  });

  it("generates a populated world", () => {
    expect(metrics.actorsAlive).toBeGreaterThan(50);
    expect(metrics.actorsUndead).toBeGreaterThan(0);
    expect(metrics.actorsLiving).toBeGreaterThan(0);
  });

  it("keeps actor accounting internally consistent", () => {
    expect(metrics.actorsUndead + metrics.actorsLiving).toBe(metrics.actorsAlive);
    expect(metrics.actorsUndead).toBeLessThanOrEqual(metrics.actorsAlive);
    expect(metrics.actorsLiving).toBeGreaterThanOrEqual(0);
  });

  it("leaves the player in a coherent state", () => {
    // Either outcome is legitimate; what must not happen is a player that is
    // simultaneously alive and dead, or a negative hit point count that the
    // engine has not accounted for. C# InflictDamage does allow hitPoints to
    // go negative, so only the alive/dead coherence is asserted here.
    expect(typeof metrics.playerAlive).toBe("boolean");
    if (metrics.playerAlive) {
      expect(metrics.playerHitPoints).toBeGreaterThan(0);
    }
  });

  it("scores the run", () => {
    expect(metrics.totalScore).toBeGreaterThanOrEqual(0);
    expect(metrics.playerKills).toBeGreaterThanOrEqual(0);
  });

  it("reports a plausible duration", () => {
    expect(metrics.durationMs).toBeGreaterThan(0);
    // A turn that never returns is the failure mode a timeout cannot catch, so
    // assert the run is also not absurdly fast (which would mean it skipped
    // work) — 40 turns of a 1x1 world takes hundreds of ms.
    expect(metrics.durationMs).toBeGreaterThan(50);
  });
});
