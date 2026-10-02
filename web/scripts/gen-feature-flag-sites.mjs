/**
 * Regenerates the `hasFeatureCallSites()` multiset that `tests/feature-flags.test.ts`
 * asserts, from a real scan of `src/`.
 *
 * This is a maintenance script, not a test - run it with
 * `node scripts/gen-feature-flag-sites.mjs`, paste the output over the array in the
 * test, and delete nothing. The point is that the array is a *multiset of call sites*
 * rather than a list of feature names somebody remembered, so adding a reader cannot be
 * a decision about what to type: it is one line of code and one run of this.
 *
 * It reads the source with the same regex and the same tree walk (including the same
 * "skip `node_modules`/`dist`/`coverage`" rule) as the test, so the two cannot drift
 * into disagreeing about what a call site is.
 *
 * This is the fourth such generator in the repo (`port-game-sounds.py`,
 * `port-item-factories.py`, `port-tile-models.py`, `merge-sprite-sets.py` are the
 * other direction), and it is the smallest of them: twenty lines of scan.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "..", "src");
const REGISTRY = join(SRC, "engine", "FeatureFlags.ts");

/** Every `.ts` file under `dir`, recursively. Same rule as `tests/helpers/grepAll.ts`. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** `hasFeature(<anything not a comma>, Feature.X)` - the test's own pattern. */
const CALL = /hasFeature\([^,]+,\s*Feature\.([A-Z][A-Za-z0-9_]*)/;

const sites = [];
for (const p of walk(SRC)) {
  if (p === REGISTRY) continue;
  const path = relative(SRC, p).split(/[\\/]/).join("/");
  readFileSync(p, "utf-8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(CALL);
      if (m) sites.push({ feature: m[1], at: `${path}:${i + 1}` });
    });
}

const sorted = sites.map((s) => s.feature).sort();

const PER_LINE = 10;
const lines = [];
for (let i = 0; i < sorted.length; i += PER_LINE) {
  lines.push(sorted.slice(i, i + PER_LINE).map((f) => `"${f}"`).join(", ") + ",");
}
// Indented to sit under `expect(sites.map((s) => s.feature).sort()).toEqual([`.
const pad = " ".repeat(3);
const width = Math.max(...lines.map((l) => l.length)) + pad.length;
console.log(lines.map((l, i) => (i === 0 ? l : pad + l.padEnd(width - pad.length, " "))).join("\n").trimEnd());
console.log(`// ${sorted.length} call sites across ${new Set(sorted).size} features`);
for (const f of ["ShoppingMall"]) {
  console.log(`${f}: ${sites.filter((s) => s.feature === f).map((s) => s.at).join(", ")}`);
}