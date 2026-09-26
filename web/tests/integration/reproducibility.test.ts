import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * The `--seed` flag actually makes runs reproducible.
 *
 * This shells out to the real CLI rather than calling `HeadlessRunner` in
 * process, for two reasons: `Session.get()` is a process-wide singleton, so
 * two runs cannot share a process honestly; and the CLI is the thing users and
 * CI actually invoke, so testing it tests the shipped path.
 */

const webRoot = resolve(__dirname, "..", "..");
const bundle = resolve(webRoot, "node_modules", ".cache", "sim-repro-test.mjs");

/** Runs the bundled CLI and returns its parsed metric lines. */
function runSim(args: string[]): Map<string, string> {
  const out = execFileSync(process.execPath, [bundle, "--size", "1", "--turns", "20", ...args], {
    cwd: webRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Generous: covers slow CI runners without hanging forever.
    timeout: 120_000,
  });
  const metrics = new Map<string, string>();
  for (const line of out.split("\n")) {
    const m = /^(turns played|world clock|player|actors alive|corpses|score)\s*:\s*(.*)$/.exec(
      line.trim()
    );
    if (m) metrics.set(m[1], m[2].trim());
  }
  return metrics;
}

beforeAll(() => {
  // Bundle once; the two runs below then differ only by their arguments.
  execFileSync(
    "npx",
    [
      "esbuild",
      "sim/cli.ts",
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--tsconfig=${resolve(webRoot, "tsconfig.json")}`,
      `--outfile=${bundle}`,
      "--log-level=warning",
    ],
    { cwd: webRoot, stdio: "pipe" }
  );
}, 180_000);

describe("headless sim reproducibility", () => {
  it("produces identical metrics for the same seed", () => {
    const a = runSim(["--seed", "4242", "--undead"]);
    const b = runSim(["--seed", "4242", "--undead"]);

    // duration is wall-clock and must differ; everything else must not.
    for (const key of ["turns played", "world clock", "player", "actors alive", "corpses", "score"]) {
      expect(b.get(key), `metric "${key}" differed between identical runs`).toBe(a.get(key));
    }
    expect(a.get("turns played")).toBeDefined();
  });

  it("produces different worlds for different seeds", () => {
    const a = runSim(["--seed", "1", "--undead"]);
    const b = runSim(["--seed", "2", "--undead"]);
    // The seed reaches world generation, so the populations must differ.
    expect(b.get("actors alive")).not.toBe(a.get("actors alive"));
  });

  it("rejects an unknown flag rather than silently ignoring it", () => {
    let failed = false;
    try {
      execFileSync(process.execPath, [bundle, "--nonsense"], {
        cwd: webRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      failed = true;
      expect((e as { status: number | null }).status).toBe(2);
    }
    expect(failed).toBe(true);
  });
});
