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
 * Bump this on every release that changes cached content (the JS bundle, `sw.js`
 * itself, or anything under /assets/). The version namespaces every cache, so a
 * bump is what evicts the previous build: without it, the stale-while-revalidate
 * runtime handler keeps serving the old bundle first and the update only lands
 * on the *next* load — which reads exactly like "the fix didn't work".
 */
const CACHE_VERSION = "rsr-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// The favicon is precached alongside the shell: it is what a browser shows
// when the game is launched from the home screen with no connection, and a
// missing one falls back to a default page icon.
const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-reloaded.png",
  "/icon-192.png",
  "/icon-512.png",
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
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/index.html")))
    );
    return;
  }

  // Game assets: cache first, they are immutable for a given build.
  if (url.pathname.startsWith("/assets/")) {
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
