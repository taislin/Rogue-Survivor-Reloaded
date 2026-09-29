/*
 * Service worker — offline play.
 *
 * Strategy, and why:
 *
 *   navigations  network-first, cache fallback. A stale index.html would load
 *                a stale hashed JS bundle, so freshness wins; the cached copy
 *                is only there so the game still opens with no connection.
 *   /assets/*    cache-first. These are content-addressed by name and never
 *                change without a new build, and they are the bulk of the
 *                download (1 124 sprites + 54 audio tracks, ~55 MB). Fetching
 *                55 MB on install to precache would make the first load
 *                unusably slow, so they are cached as they are requested.
 *   same-origin  stale-while-revalidate.
 *
 * The precache list is deliberately tiny and contains only unhashed, stable
 * URLs. Vite emits content-hashed filenames (index-<hash>.js), so the bundle
 * cannot be named here; it is picked up by the runtime handler on first load
 * instead. That avoids needing a build plugin to inject a precache manifest.
 */

/**
 * The version namespaces every cache below, and the activate handler deletes
 * every cache that does not start with it. So bumping this is what evicts the
 * previous build: without a bump, the cache-first /assets/ handler keeps
 * serving the old sprites and audio to anyone who has played before, and the
 * update only lands once that handler is bypassed — which reads exactly like
 * "the fix didn't work".
 *
 * This is the committed fallback, used for local `npm run build` and for any
 * build that does not run the stamping step. Deployment does not edit it by
 * hand — `scripts/stamp-cache-version.mjs` rewrites this line in the built
 * output to a hash of the built files, so the version changes exactly when the
 * cached content does and not when an unrelated file does. See that script for
 * why the input is the built output rather than the commit SHA.
 *
 * If you change this constant, change the committed value and nothing else;
 * the stamping step overwrites it per build.
 */
const CACHE_VERSION = "rsr-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/**
 * Where this worker is mounted, derived from its own URL rather than written
 * down.
 *
 * A service worker cannot read the build's base path: this file lives in
 * `public/`, and Vite copies `public/` to the output untransformed, so there is
 * no `import.meta.env` here and nothing for a build step to substitute into.
 * The two options were therefore to make this file base-agnostic, or to have
 * something template it. Resolving against the script's own URL is the better
 * of the two: it is correct at any mount point, and it cannot be wrong in the
 * way a hardcoded path is, because there is no path to get out of date. The
 * same build works on a domain root, under a Pages project subdirectory, and
 * from a local file server.
 *
 * `self.location` is the worker script's URL in both the classic and module
 * registrations, so this holds either way.
 */
const SCOPE_PATH = new URL("./", self.location.href).pathname;
const ASSETS_PREFIX = `${SCOPE_PATH}assets/`;
const INDEX_URL = new URL("index.html", self.location.href).href;

// The favicon is precached alongside the shell: it is what a browser shows
// when the game is launched from the home screen with no connection, and a
// missing one falls back to a default page icon.
//
// The font faces are here for the same reason, and more strongly: every glyph in
// the game is drawn with one, so an offline first run without them renders the
// entire UI in a fallback face. All four selectable families are precached, not
// just the default, because a player who chose Iosevka on a connected run and
// then went offline should not silently get the platform font instead — and the
// faces are 306 KB together, which is small next to the 55 MB of sprites and
// audio that are deliberately *not* precached below.
//
// Relative, for the reason above: the Cache API resolves these against the
// worker's own URL, so "./index.html" is the right file at any mount point.
const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-reloaded.png",
  "./icon-192.png",
  "./icon-512.png",
  "./fonts/JetBrainsMono-Regular.woff2",
  "./fonts/JetBrainsMono-Bold.woff2",
  "./fonts/IosevkaTermSlab-Regular.woff2",
  "./fonts/IosevkaTermSlab-Bold.woff2",
  "./fonts/hack-regular.woff2",
  "./fonts/hack-bold.woff2",
  "./fonts/IBMPlexMono-Regular.woff2",
  "./fonts/IBMPlexMono-Bold.woff2",
];

/**
 * Whether a response may be written to the Cache API.
 *
 * `response.ok` is true for any 2xx, but `cache.put` rejects anything that is
 * not a complete 200: a 206 Partial Content — what the browser asks for when it
 * seeks within a media file, which the .ogg tracks encourage — throws
 * "Partial response (status code 206) is unsupported". That rejection escaped
 * as an unhandled promise rejection and aborted the rest of the handler.
 *
 * A 206 is a range of a larger file, not a storable representation of the URL,
 * so the right response is to pass it through uncached and let the network
 * answer range requests directly.
 */
function isCacheable(response) {
  return response.status === 200 && response.type === "basic";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is all-or-nothing: one 404 would leave the SW uninstalled, so
      // add individually and tolerate a miss.
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle our own origin; leave cross-origin requests alone.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a new build is picked up immediately.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match(INDEX_URL)))
    );
    return;
  }

  // Game assets: cache first, they are immutable for a given build.
  if (url.pathname.startsWith(ASSETS_PREFIX)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else same-origin (the hashed JS/CSS bundle): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
