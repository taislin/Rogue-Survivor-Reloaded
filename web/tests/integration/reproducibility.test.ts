import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { build } from "esbuild";

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

/**
 * Bundle the CLI through esbuild's **JavaScript API**, not its CLI binary.
 *
 * This has been wrong twice, in opposite directions, and both times the
 * mistake was in a *comment* asserting something untrue about the file being
 * invoked — so the record of the failure is kept here deliberately:
 *
 * 1. It used to shell out to a bare `npx`. That cannot work on Windows: `npx`
 *    resolves to `npx.ps1` there, and `execFileSync` does not go through
 *    PowerShell, so every run died with `spawnSync npx ENOENT` before a single
 *    assertion executed. The suite's only end-to-end CLI test was permanently
 *    unrunnable on a developer's own machine.
 *
 * 2. That was "fixed" by invoking `node_modules/esbuild/bin/esbuild` through
 *    `process.execPath`, justified here as *"`.../bin/esbuild` is a plain Node
 *    script"*. It is not. On Linux and macOS it is the **native binary** — a
 *    statically-linked Go ELF (or Mach-O) executable — so `node` tried to
 *    parse an ELF header and threw `SyntaxError: Invalid or unexpected token`
 *    from `beforeAll`, skipping all three tests. The Windows fix broke Linux
 *    and macOS, and CI runs on `ubuntu-latest`, so the "fixed" suite was red.
 *
 * The lesson is that there is no path to an esbuild CLI that is correct on
 * every platform: it is a bare ELF/Mach-O/`.cmd`/`.ps1` depending on both the
 * OS and how it was installed. The JS API is the one interface that is the
 * same everywhere, so it is the one that is used. `esbuild` is a transitive
 * dependency of Vite and is imported by the toolchain already.
 */

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

beforeAll(async () => {
  // Bundle once; the runs below then differ only by their arguments.
  await build({
    entryPoints: ["sim/cli.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: resolve(webRoot, "tsconfig.json"),
    outfile: bundle,
    logLevel: "warning",
    // Matches `npm run sim` in package.json, so this tests the shipped path
    // rather than a slightly different one.
    absWorkingDir: webRoot,
  });
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
