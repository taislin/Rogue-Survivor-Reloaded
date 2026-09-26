import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Vitest config.
 *
 * `environment: "node"` on purpose. The engine is DOM-free by design (see the
 * no-platform-leakage rule in the port plan), and the browser layer already has
 * a no-op implementation for headless use (`ui/NullRogueUI.ts`), so the whole
 * test suite runs without jsdom. If a test ever needs a DOM, that is a signal
 * the DOM has leaked into `engine/` or `data/` — put it in a `*.dom.test.ts`
 * and opt that file in with a `@vitest-environment` docblock.
 *
 * The aliases must stay in sync with `vite.config.ts` and `tsconfig.json`; all
 * three list the same four roots.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@ui": resolve(__dirname, "src/ui"),
      "@data": resolve(__dirname, "src/data"),
      "@gameplay": resolve(__dirname, "src/gameplay"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The integration tests boot the real world generator and play real turns.
    // A single 1x1 world is ~250 ms to generate, so keep the budget generous
    // but finite: a genuine hang should fail rather than wedge CI forever.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // Only the layers under test. `sim/` and `main.ts` are entry points, not
      // library code, and are covered transitively by the integration tests.
      include: ["src/engine/**", "src/data/**", "src/gameplay/**", "src/ui/**"],
      exclude: ["src/**/*.d.ts"],
      // Deliberately modest: a measured floor, not a target. See §4.3 of
      // BROWSER_PORT_PLAN.md -- "do not pick aspirational numbers on day one;
      // the port is not at full coverage and a failing threshold will just be
      // disabled again".
      //
      // Measured baseline on the first suite (74 tests, 6 files):
      //   statements 51.09%  branches 76.39%  functions 58.64%  lines 51.09%
      //
      // These sit ~1-1.5 points below that so ordinary edits do not flap the
      // build, while a real drop still fails CI. Raise them as coverage lands.
      // The suite is deterministic (seeded sim, no wall-clock assertions on
      // behaviour), so the numbers do not drift run to run.
      thresholds: {
        statements: 50,
        branches: 75,
        functions: 57,
        lines: 50,
      },
    },
  },
});
