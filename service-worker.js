/*
 * PixelProTech Remote Assistant — Service Worker
 * Provides installability + offline app-shell caching.
 * Strategy: stale-while-revalidate for the static shell (instant loads, but the
 * next launch always gets the newest CSS/JS), network-first with cache fallback
 * for everything else same-origin.
 */

const CACHE_VERSION = "pixelprotech-v1.2.1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./icon-32.png",
  "./favicon.ico",
  "./offline.html"
];

// Absolute pathnames of the shell, resolved against the SW scope so matching is exact.
const SHELL_PATHS = new Set(
  APP_SHELL.map((p) => new URL(p, self.location).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) =>
        // Individually, so one missing file can't break the whole shell.
        // cache:"reload" bypasses the browser HTTP cache so we never precache stale files.
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(new Request(url, { cache: "reload" }))
              .catch((err) => console.warn("Precache failed for", url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("pixelprotech-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin/API calls

  // Manifest and icons: always network-first so install criteria never see a stale/broken copy.
  if (/\/(manifest\.json|icon-[^/]*\.png)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request, { ignoreSearch: true })) || Response.error())
    );
    return;
  }

  // App shell: serve cached copy instantly, refresh it in the background.
  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const fresh = await network;
        if (fresh) return fresh;
        if (request.mode === "navigate") {
          return (await caches.match("./offline.html")) || Response.error();
        }
        return Response.error();
      })
    );
    return;
  }

  // Everything else same-origin: network-first, fall back to cache, then offline page.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("./offline.html")) || Response.error();
        }
        return Response.error();
      })
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
