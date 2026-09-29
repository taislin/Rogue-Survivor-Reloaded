#!/usr/bin/env node
/**
 * Serve the assembled site the way GitHub Pages will, so the browser check is
 * real.
 *
 *   npm run build:pages && npm run preview:site
 *
 * ## Why this is not just `npx http-server _site`
 *
 * Because the whole point of this tool is to catch a wrong base path, and
 * serving `_site/` at `/` would hide exactly that. The game is built to believe
 * it lives at `<base_path>/game/`, so a static server that mounts the tree at
 * the root serves it a 404 for every asset — and the symptom on screen is a
 * black canvas, which reads exactly like the bug this is meant to detect.
 *
 * So this serves the site under a path prefix, and that prefix has to be the one
 * the build was made for. Hence `--base` defaults to the Pages project path
 * rather than to `/`: the URLs the browser requests and the URLs on disk then
 * line up, and if they do not, they disagree loudly instead of quietly.
 *
 * ## What this can and cannot tell you
 *
 * It is a faithful preview of *paths*. It is not a Pages emulator: no caching
 * headers are set, there is no CDN, and audio seeking is not supported (a Range
 * request is served as a whole file, so playback works and dragging the scrubber
 * does not). None of those are things the deploy does wrong — the browser check
 * this exists for is "does the game paint, and do the service worker and the
 * fonts load".
 *
 * One trap worth knowing: the service worker caches assets cache-first, so if
 * you rebuild and re-serve on the same port, a browser that has already loaded
 * this origin will keep serving the old sprites until the service worker
 * updates. `npm run build:pages` re-stamps `CACHE_VERSION` from a hash of the
 * built files, so a rebuild that changed anything does evict — but a browser
 * only checks for a new worker on navigation and at most daily. If the preview
 * seems to be showing you yesterday's build, that is why; a private window, or a
 * different port, avoids it entirely.
 *
 * Options:
 *   --port <n>   port to listen on (default 4173)
 *   --base <p>   path prefix to mount at (default /Rogue-Survivor-Reloaded).
 *                A leading and trailing slash is added if missing. Pass / to
 *                serve at the root — only correct for a root-base build.
 *   --open       print the URL only; do not start a server. Useful for copying
 *                the address, and for checking what the build expects.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const siteDir = join(repoRoot, "_site");

/** The Pages project path, so the default matches a real deploy. */
const DEFAULT_BASE = "/Rogue-Survivor-Reloaded";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const port = Number(flag("--port", "4173"));
const openOnly = args.includes("--open");

let base = flag("--base", DEFAULT_BASE);
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base = `${base}/`;

if (!existsSync(siteDir)) {
  console.error(
    `[preview:site] no _site/ yet.\n` +
      `  Run "npm run build:pages" from web/ first — this serves the assembled\n` +
      `  site rather than producing it.`,
  );
  process.exit(1);
}

const gameIndex = join(siteDir, "game", "index.html");
if (!existsSync(gameIndex)) {
  console.error(
    `[preview:site] _site/game/index.html is missing, so the tree was assembled\n` +
      `  without a game in it. Re-run "npm run build:pages".`,
  );
  process.exit(1);
}

const url = `http://localhost:${port}${base}`;
const gameUrl = `${url}game/`;

console.log(`[preview:site] _site/ mounted at ${base}`);
console.log(`[preview:site]   website  ${url}`);
console.log(`[preview:site]   game     ${gameUrl}`);

if (openOnly) process.exit(0);

// Matched longest-first is unnecessary; extensions are unambiguous here. The
// webmanifest one matters — Android will not install a PWA served as
// text/plain, and that is the sort of thing a preview should not lie about.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

const typeFor = (p) => TYPES[extname(p).toLowerCase()] ?? "application/octet-stream";

/**
 * Map a request path to a file in _site/, or null.
 *
 * Resolves *before* touching the filesystem, because `normalize` collapses the
 * `..` segments that a prefix-stripped path is unusually likely to contain, and
 * a static file server that can be walked out of is a static file server that
 * serves your home directory. The containment check is belt and braces on top:
 * the prefix is stripped only when it actually matches, so a request for
 * `/etc/passwd` falls through to a 404 rather than becoming
 * `_site/../../etc/passwd`.
 */
function resolveTarget(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);

  // Anything outside the prefix is a 404, even when it would resolve inside
  // _site/. Pages does not serve it — /game/ is not a route on the real site —
  // and a preview that answers 200 for paths production refuses is lying about
  // exactly the thing this tool exists to check. A wrong base shows up as a 404
  // here, which is the signal you want, rather than as a page that renders and
  // then fails to load its assets.
  if (!p.startsWith(base)) return null;

  p = p.slice(base.length - 1);
  if (p === "" || p.endsWith("/")) p += "index.html";

  const full = resolve(join(siteDir, normalize(p)));
  if (full !== siteDir && !full.startsWith(siteDir + sep)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  if (existsSync(full) && statSync(full).isDirectory()) {
    const idx = join(full, "index.html");
    if (existsSync(idx)) return idx;
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolveTarget(req.url ?? "/");

  if (file === null) {
    // A real 404, not the site. This matters: the game preloads every sprite
    // before the first frame, so a 200-with-wrong-content would be cached
    // under an asset URL and served forever after, whereas a 404 surfaces here
    // in the console where it can be read.
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 ${req.url}\n`);
    return;
  }

  res.writeHead(200, {
    "content-type": typeFor(file),
    "content-length": statSync(file).size,
    // No cache headers, deliberately. See the header: a preview that cached
    // would reproduce the one confusing failure this tool exists to avoid.
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log("\n[preview:site] Ctrl-C to stop.");
});
