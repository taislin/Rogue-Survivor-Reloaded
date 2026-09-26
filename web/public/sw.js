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

const CACHE_VERSION = "rsr-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

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
          if (response.ok && response.type === "basic") {
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
          if (response.ok && response.type === "basic") {
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
