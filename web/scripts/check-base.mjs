#!/usr/bin/env node
/**
 * Assert the built output contains no root-absolute URL.
 *
 *   BASE_PATH=/some/subdir/ npm run build && node scripts/check-base.mjs
 *
 * The port used to hardcode `/assets` and was therefore only ever correct at a
 * domain root. It now takes its base from `base-path.ts`, and the failure mode
 * of getting that wrong is unusually bad: every sprite is preloaded before the
 * first frame, so a wrong base is not a game with missing images, it is a blank
 * canvas and a console full of 404s. Nothing in the test suite can see it — the
 * asset-existence checks resolve against `public/` on disk and never build a URL
 * a browser would request — and the type-checker certainly cannot.
 *
 * So this checks the artifact instead of the intent. Two assertions, because
 * they fail differently and it is worth knowing which happened:
 *
 *   1. The base actually appears in the output. Without this, a build that
 *      ignored BASE_PATH entirely would pass check 2 by containing no absolute
 *      paths at all, and the guard would be reporting success on a broken build.
 *   2. No root-absolute URL survives anywhere in the output.
 *
 * Source maps are skipped. They embed the original source, doc comments and all,
 * and several of those quote `/assets/...` as an example of the shape a path
 * takes. The maps are not fetched by a browser, so flagging them would be
 * flagging a comment.
 *
 * Takes the dist directory as an optional argument, defaulting to `dist/`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.argv[2] ? join(webRoot, process.argv[2]) : join(webRoot, "dist");

/**
 * The base this build was made with, from the environment rather than from the
 * output. The alternative — inferring it from dist/index.html — would let a
 * build with no base at all look like a build with `base: "/"` and quietly
 * satisfy check 1, which is the failure this script exists to prevent.
 */
const base = (process.env.BASE_PATH ?? "/").replace(/\/?$/, "/");

/**
 * A root-absolute reference to something the build owns. The leading
 * delimiter is required: a bare `/assets/` also occurs inside longer strings
 * and inside prose, and matching those would bury the real finding in noise.
 */
const ABSOLUTE_URL =
  /["'(=]\/(assets|fonts|js|icon-[\w.-]*\.png|manifest\.webmanifest|index\.html|src)\b/g;

const skipped = (rel) => rel.endsWith(".map") || rel.endsWith(".woff2");

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const findings = [];
let scanned = 0;
let sawBase = false;

for (const file of walk(distDir)) {
  const rel = relative(distDir, file);
  if (skipped(rel)) continue;
  scanned++;
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (base !== "/" && line.includes(base)) sawBase = true;
    // Only meaningful for a subpath build. At base "/" a root-absolute URL is
    // the correct form — that is what the base *is* — so flagging one there
    // would report the build that is right and fail the build that is wrong.
    if (base === "/") continue;
    for (const match of line.matchAll(ABSOLUTE_URL)) {
      // Report the match with a little context, not the start of the line. The
      // bundle is one minified line long, so the first 120 characters of it are
      // the same Vite modulepreload polyfill whatever matched, which is how the
      // first version of this reported three identical, useless findings.
      const at = match.index ?? 0;
      const from = Math.max(0, at - 40);
      findings.push({
        file: rel,
        line: i + 1,
        text: line.slice(from, at + match[0].length + 40),
      });
    }
  }
}

console.log(`[check-base] scanned ${scanned} files in ${relative(webRoot, distDir) || "dist/"}`);

if (base !== "/" && !sawBase) {
  console.error(
    `[check-base] FAIL: the base "${base}" does not appear anywhere in the output.\n` +
      `  The build ignored BASE_PATH. Check that base-path.ts is wired into\n` +
      `  vite.config.mts, and that BASE_PATH reached the build environment.`,
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error(`[check-base] FAIL: ${findings.length} root-absolute URL(s) in the output:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  …${f.text}…`);
  }
  console.error(
    `\n  A root-absolute URL is correct only when the game is served from the\n` +
      `  domain root. Under a subdirectory it 404s, and because the port preloads\n` +
      `  every sprite before the first frame, the result is a black screen.`,
  );
  process.exit(1);
}

// A root build is not "clean" by merit: at base "/" a root-absolute URL is the
// correct form, so this assertion has nothing to assert. Saying so is the honest
// outcome, and it is why CI runs this with a subpath — that is the only
// configuration where a finding would mean anything.
if (base === "/") {
  console.log(
    `[check-base] OK: no findings, but note this build is at the domain root,\n` +
      `  where a root-absolute URL is correct by definition. This check only has\n` +
      `  teeth for a subpath build; CI re-runs it with BASE_PATH set.`,
  );
} else {
  console.log(`[check-base] OK: no root-absolute URLs (base: ${base})`);
}
