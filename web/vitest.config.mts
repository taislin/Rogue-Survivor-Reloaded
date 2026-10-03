import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "path";
import { BASE_PATH } from "./base-path";

/**
 * Simulation tests that dominate the suite's wall clock.
 *
 * These boot the real world generator with district simulation at FULL and play
 * real turns, several times over, so each one is measured in minutes rather than
 * seconds. They are **excluded from `npm test` and run by `npm run test:slow`**,
 * not deleted: they cover the idle catch-up that replaced a blocking burst on
 * district entry (measured at 274 ms after 60 turns before it), which is exactly
 * the kind of quiet regression worth keeping a test for.
 *
 * Excluded by *file* rather than by a `slow()` marker inside them, so the default
 * run does not pay to collect or transform a fixture it will never execute.
 */
const SLOW_TESTS = [
  "tests/idle-district-sim.test.ts",
  "tests/idle-auto-advance.test.ts",
];

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
 * The aliases must stay in sync with `vite.config.mts` and `tsconfig.json`; all
 * three list the same four roots.
 *
 * `base` must stay in sync with `vite.config.mts` too, and the way to guarantee
 * that is to import it from the same module rather than repeat the value. Vitest
 * does not inherit the Vite config, so without this the suite would keep
 * asserting `/assets/...` while the Pages build emits `/Rogue-Survivor-Reloaded/
 * game/assets/...` — passing, and shipping a game that cannot load a sprite.
 */
export default defineConfig(({ mode }) => ({
  base: BASE_PATH,
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
    // `npm run test:slow` sets `--mode slow`, which puts them back. Appending to
    // `configDefaults.exclude` rather than replacing it keeps Vitest's own
    // node_modules dist exclusion, which is easy to lose by accident.
    exclude:
      mode === "slow"
        ? configDefaults.exclude
        : [...configDefaults.exclude, ...SLOW_TESTS],
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
      // A measured floor, not a target. See §4.3 of plans/BROWSER_PORT_PLAN.md -- "do
      // not pick aspirational numbers on day one; the port is not at full
      // coverage and a failing threshold will just be disabled again". The suite
      // is deterministic (seeded sim, no wall-clock assertions on behaviour), so
      // the numbers do not drift run to run.
      //
      // Re-measured on 138 files / 2,956 tests, sitting ~2.5 points below actual
      // so ordinary edits do not flap the build while a real drop still fails CI.
      //
      // **Measure coverage with `--no-file-parallelism`.** The default parallel
      // run is not a measurement. Two runs of an identical tree disagree — not
      // only in the numerator but in the *denominator* (statements 26403 vs
      // 26409, lines 23983 vs 23989), because the set of instrumented modules
      // depends on which worker imports what and when. Per-file numbers are
      // stable throughout; only the aggregate moves. Serial runs are bit-identical
      // across repeats, and that is the number recorded here:
      //
      //   statements 69.74%  branches 57.53%  functions 80.56%  lines 71.18%
      //
      // (Re-measured 2026-10-03 at `master` `8d5dfc8`; the 69.88/57.94/80.64/71.30
      // figure previously recorded here, and the "139 files / 2,960 tests" count,
      // were both stale. **A comment here is a number nobody re-measured** — take
      // these from a `--no-file-parallelism` run, not from this paragraph.)
      // That is the first measurement since 58 files / 867 tests, and the suite grew
      // coverage by ~10 points on every axis, so the old gates were sitting ~12
      // points under the tree and no longer gating anything. They are re-pinned
      // ~2.5 below the new actual, which is the same policy as before applied to a
      // much larger suite: all four rise, so the gate is stricter than the one it
      // replaces.
      //
      // The wobble is ~0.05 points, so the gates are not *at* risk of flapping —
      // but a per-file improvement smaller than that is invisible globally, and
      // the honest way to judge a new test is the per-file row from
      // `--coverage.reporter=text`, not the total. Steering the total means
      // `RogueGame.ts`: 4374 uncovered branches, 41% of the project's, at 31%
      // covered, and the next-best targets are a handful of files at 0.
      //
      // **Why branches is a floor and not a target.** The original 75 came from
      // the first suite — 6 files, 74 tests, branches 76.39% — and no realistic
      // amount of testing reaches it now: `RogueGame.ts` alone is 6098 branches
      // and taking it to 50% still only reaches 58%. A gate that cannot be passed
      // is not a gate. The other three are set *above* where they used to be, so
      // the gate is net stricter than the one it replaces.
      //
      // Known blind spot, deliberately not excluded: the two WebAudio managers
      // (61 branches, 0%) call an API node does not have. Excluding 0.4% of the
      // denominator would not change the verdict, and a file being invisible to
      // the harness is worth knowing about rather than hiding.
      thresholds: {
        statements: 67,
        branches: 55,
        functions: 78,
        lines: 68,
      },
    },
  },
}));
