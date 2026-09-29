#!/usr/bin/env node
/**
 * Assemble the published site: the docs at the root, the game beneath them.
 *
 *   npm run build && node scripts/stamp-cache-version.mjs && node scripts/build-site.mjs
 *
 * GitHub Pages serves one directory per site, and the two halves of this project
 * have to be in the same one:
 *
 *   _site/index.html          the docs site, at the project root
 *   _site/game/index.html     the game, one level down
 *
 * The docs site owns the root because it is the landing page, and the game goes
 * below it because it cannot be at the root of its own — `engine/AssetPaths.ts`
 * and two other modules take their asset paths from a base that the desktop
 * build needs to be `/`, while here it is the Pages subdirectory. That is the
 * whole reason `base-path.ts` exists, and it is why this is a script rather than
 * a `cp -r` in the workflow: the two halves are built by different commands, in
 * different directories, and have to land in one tree.
 *
 * Two things are excluded from the copy, and the second is load-bearing:
 *
 *   tools/     the site checker and the manual generator. Not part of the site.
 *   .nojekyll  A Pages marker that suppresses Jekyll processing, which is only
 *              needed when Pages builds the branch itself. Pages here is fed an
 *              artifact by actions/deploy-pages and never runs Jekyll, so the
 *              file is dead weight at best. It is also *misleading* in the
 *              output: `.nojekyll` is a Jekyll opt-out, and shipping one to a
 *              deployment that has no Jekyll asserts something false about it.
 *
 * `docs/404.html` *is* copied, and lands where Pages expects it — the 404
 * handler is looked up at the site root, so a subdirectory copy would be an
 * ordinary page that nothing ever serves.
 *
 * The output is wiped first, so what is published is always a complete
 * regeneration and never a mix of this build and a previous one — the same
 * reasoning as `dist-release/` in build-release.mjs.
 *
 * The assertions at the end are the two assembly mistakes that are otherwise
 * silent. A missing `docs/` or a failed `vite build` both leave a `_site/`
 * that uploads, deploys, and serves a 404 or a blank page to every visitor,
 * with a green workflow. Checking the two files that must be there, and that
 * the game carries a stamped cache version, turns that into a failed build.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..");
const docsDir = join(repoRoot, "docs");
const gameDir = join(webRoot, "dist");
const siteDir = join(repoRoot, "_site");

/**
 * Not part of the published site.
 *
 *   tools/     the site checker and the manual generator. Build scripts, and
 *              publishing them means a visitor can read how the site is made.
 *   README.md  contributor conventions for editing the site, not the site.
 *   .nojekyll  A Pages marker that suppresses Jekyll processing, which is only
 *              needed when Pages builds the branch itself. Pages here is fed an
 *              artifact by actions/deploy-pages and never runs Jekyll, so the
 *              file is dead weight at best. It is also *misleading* in the
 *              output: `.nojekyll` is a Jekyll opt-out, and shipping one to a
 *              deployment that has no Jekyll asserts something false about it.
 */
const DOCS_EXCLUDES = ["tools", ".nojekyll", "README.md"];

const GAME_SUBDIR = "game";

/**
 * Collect the reason a required input is missing, rather than throwing.
 *
 * A `throw` here prints a stack trace, which for a build script is noise that
 * buries the one line that matters — the input that was not there. Everything in
 * this file reports through `fail()` instead, so a failure reads the same
 * whether it is a missing build or an unstamped worker.
 */
function missingInput(dir, what) {
  fail([
    `${what} not found at ${relative(repoRoot, dir) || dir}.`,
    `  Run "npm run build" from web/ first — this script assembles an existing`,
    `  build rather than producing one.`,
  ]);
}

function fail(lines) {
  console.error("\n[build-site] FAIL:");
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

if (!existsSync(docsDir)) missingInput(docsDir, "docs/");
if (!existsSync(gameDir)) missingInput(gameDir, "the game build (web/dist)");

console.log(`> assembling ${relative(repoRoot, siteDir)}/`);
rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

// docs/ at the root. `filter` rather than copying then deleting: the excluded
// names never reach the output, so there is no window in which they exist in a
// tree that is about to be published.
cpSync(docsDir, siteDir, {
  recursive: true,
  filter: (src) => {
    const rel = relative(docsDir, src);
    if (rel === "") return true;
    const top = rel.split("/")[0];
    return !DOCS_EXCLUDES.includes(top);
  },
});
console.log(`  docs/ -> ${relative(repoRoot, siteDir)}/`);

// The game, built with the subpath base the Pages workflow sets.
const gameOut = join(siteDir, GAME_SUBDIR);
cpSync(gameDir, gameOut, { recursive: true });
console.log(`  web/dist -> ${relative(repoRoot, gameOut)}/`);

const problems = [];

for (const required of ["index.html", "404.html", "manual.html"]) {
  if (!existsSync(join(siteDir, required))) {
    problems.push(`docs/ is missing ${required}, so the site has no ${required === "index.html" ? "landing page" : required}`);
  }
}
for (const required of ["index.html", "sw.js", "manifest.webmanifest"]) {
  if (!existsSync(join(gameOut, required))) {
    problems.push(`the game build is missing ${required} — did "npm run build" run?`);
  }
}

// A game copied in before the cache version was stamped would deploy a worker
// that never evicts, which is the invisible failure described in
// stamp-cache-version.mjs. Catching it here beats discovering it from a player
// reporting a sprite that never updated.
if (existsSync(join(gameOut, "sw.js"))) {
  const sw = readFileSync(join(gameOut, "sw.js"), "utf8");
  const stamped = /const CACHE_VERSION = "(rsr-[0-9a-f]{12})";/.exec(sw);
  if (!stamped) {
    problems.push(
      "the game's sw.js still has its committed CACHE_VERSION.\n" +
        "    Run node scripts/stamp-cache-version.mjs after npm run build and\n" +
        "    before this script, or returning players keep the previous build.",
    );
  } else {
    console.log(`  cache version: ${stamped[1]}`);
  }
}

if (problems.length > 0) {
  console.error("\n[build-site] FAIL:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("[build-site] OK");
