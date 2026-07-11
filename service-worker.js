/*
 * PixelProTech Remote Assistant — Service Worker
 * Provides installability + offline app-shell caching.
 * Strategy: cache-first for the static shell, network-first (with cache
 * fallback) for everything else, so the diagnostics UI keeps working
 * without a connection while still picking up updates when online.
 */

const CACHE_VERSION = "pixelprotech-v1.1.0";
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
  "./icon-32.png",
  "./favicon.ico",
  "./offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) =>
        // Cache each file individually rather than cache.addAll(), which fails
        // the WHOLE install if even one file 404s. This way a single missing
        // icon can't silently break the entire offline shell.
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => console.warn("Precache failed for", url, err))
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

  // App shell files: cache-first for instant loads.
  if (APP_SHELL.some((path) => url.pathname.endsWith(path.replace("./", "")))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else same-origin: network-first, fall back to cache, then offline page.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return caches.match("./offline.html");
        }
        return Response.error();
      })
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
