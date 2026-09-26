import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner, HeadlessMetrics } from "../../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";

/**
 * End-to-end: the game at map zoom 2.
 *
 * The zoom is a display-only feature, but it puts a scaled drawing scope around
 * three regions of the play screen — the map, the overlays, and the markers
 * `DrawMiniMap` puts *on the map* as opposed to on the minimap. An unbalanced
 * `save`/`restore` there would leak a 2x transform into the side panel, and a
 * scope opened around the wrong region would scale the HUD: neither is visible
 * to a type-check, and the default-zoom suite runs the identical code path with
 * the scope compiled out (`withMapZoom` returns early at zoom 1).
 *
 * One run per file, like `headless-run.test.ts`: `Session.get()` is a
 * process-wide singleton, and Vitest gives each file a fresh worker.
 */

const SEED = 54321;
const TURNS = 25;

let ui: NullRogueUI;
let metrics: HeadlessMetrics;

beforeAll(async () => {
  ui = new NullRogueUI();
  ui.profiling = true;
  const runner = new HeadlessRunner(SEED, ui);
  // Before the run, so every frame of it is drawn zoomed.
  runner.rogueGame.SetMapZoom(2);
  metrics = await runner.run({
    worldSize: 1,
    maxTurns: TURNS,
    isUndead: true,
    bot: true,
  });
  // Leave the process-wide display preference as it was found.
  runner.rogueGame.SetMapZoom(1);
}, 120_000);

afterAll(() => {
  ui.profiling = false;
});

describe("headless simulation at map zoom 2", () => {
  it("completes the run without throwing", () => {
    expect(metrics.error).toBeUndefined();
  });

  it("plays turns at the zoomed camera", () => {
    expect(metrics.turnsPlayed).toBeGreaterThan(0);
    expect(metrics.turnsPlayed).toBeLessThanOrEqual(TURNS);
  });

  it("actually enters the scaled drawing scope", () => {
    // Zero here would mean the zoom never reached the renderer, and this whole
    // file would be testing the unzoomed path.
    expect(ui.callCounts.UI_BeginScaledDraw ?? 0).toBeGreaterThan(0);
  });

  it("balances every scaled scope", () => {
    // An unbalanced begin would leave the context scaled for the rest of the
    // frame, painting the HUD at 2x. The counts have to match exactly.
    expect(ui.callCounts.UI_BeginScaledDraw).toBe(ui.callCounts.UI_EndScaledDraw);
  });

  it("still draws the map and the panel", () => {
    expect(ui.callCounts.UI_DrawImage ?? 0).toBeGreaterThan(0);
    expect(ui.callCounts.UI_DrawString ?? 0).toBeGreaterThan(0);
    expect(ui.callCounts.UI_DrawMinimap ?? 0).toBeGreaterThan(0);
  });
});
