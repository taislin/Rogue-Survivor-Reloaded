#!/usr/bin/env node
/**
 * Stamp the service worker's CACHE_VERSION with a hash of the built output.
 *
 *   npm run build && node scripts/stamp-cache-version.mjs
 *
 * CACHE_VERSION namespaces every cache the worker owns, and the activate
 * handler deletes every cache whose name does not start with it. So this is
 * what makes a deploy actually reach players who have played before: bump the
 * version and the next load re-fetches the new bundle and assets; leave it
 * alone and the cache-first /assets/ handler serves the previous build to
 * those players indefinitely. That is not a hypothetical — it is the failure
 * the constant above exists to prevent, and it is invisible until someone
 * reports "my sprite is still the old one".
 *
 * The input is the built output, not the commit SHA. A commit-derived version
 * would be just as correct about staleness and much simpler, but it also
 * changes on every commit that touches no cached content at all — a README
 * edit, a docs reword — and every bump costs each returning player a
 * re-download of the shell plus every sprite and audio track they had cached.
 * Hashing the bytes means the version changes exactly when the cached content
 * changes, which is what the constant's own doc comment asks for.
 *
 * A useful side effect: because this script rewrites sw.js, a build whose
 * cached content did not change produces a byte-identical sw.js. The browser
 * compares the fetched worker against the installed one before reinstalling, so
 * an unchanged build is a genuine no-op for returning players rather than a
 * reinstall that evicts caches for no reason.
 *
 * Three exclusions, and the hash covers everything else in dist/:
 *
 *   sw.js     This script rewrites it, so it cannot be an input to itself.
 *   *.map     Source maps. The worker only ever caches one if devtools is
 *             open, so a map change is not a reason to evict player caches —
 *             and it is never a change on its own, since a map only differs
 *             when the bundle it describes does.
 *   docs/     The website is copied into dist/ after this runs and is not
 *             part of what the worker caches. Excluding it means this stays
 *             correct if the two steps are ever reordered.
 *
 * The walk is sorted so the hash does not depend on readdir order. The result
 * is that the script is idempotent: running it twice produces the same version.
 *
 * It throws rather than leaving the committed value in place. A silent
 * fallback would reintroduce exactly the bug this exists to prevent — a deploy
 * that changed assets without evicting the players holding the old ones — and
 * would do it quietly, on the release you most wanted to be sure about.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(webRoot, "dist");
const swPath = join(distDir, "sw.js");

const excluded = (rel) =>
  rel === "sw.js" || rel.endsWith(".map") || rel.startsWith(`docs${sep}`);

function* walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const hash = createHash("sha256");
let files = 0;
for (const file of walk(distDir)) {
  const rel = relative(distDir, file);
  if (excluded(rel)) continue;
  hash.update(rel);
  hash.update(readFileSync(file));
  files++;
}

// 12 hex chars is 48 bits: collision-free in practice for a version that only
// has to differ between your own builds, and short enough to stay readable in
// devtools' cache list when you are trying to work out what is cached.
const version = `rsr-${hash.digest("hex").slice(0, 12)}`;

const pattern = /const CACHE_VERSION = "[^"]*";/;
const sw = readFileSync(swPath, "utf8");
if (!pattern.test(sw)) {
  throw new Error(
    `No CACHE_VERSION declaration matched in ${swPath}. If the constant was ` +
      `renamed or reformatted, update the pattern in this script — leaving the ` +
      `committed version in place would ship a deploy that never evicts.`,
  );
}

// A no-op write is a legitimate outcome, not a failure: re-running against an
// already-stamped dist/ (no rebuild in between) recomputes the same version and
// replaces the value with itself. Only a *missing* declaration is a failure.
const stamped = sw.replace(pattern, `const CACHE_VERSION = "${version}";`);
if (stamped === sw) {
  console.log(`[stamp-cache-version] already current: CACHE_VERSION = ${version}`);
} else {
  writeFileSync(swPath, stamped);
  console.log(`[stamp-cache-version] hashed ${files} files -> CACHE_VERSION = ${version}`);
}
