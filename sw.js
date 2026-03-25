/* eslint-disable no-restricted-globals */

const CACHE_NAME = "sfr-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/main.js",
  "./src/ui.js",
  "./src/store.js",
  "./src/catalog.js",
  "./src/text.js",
  "./src/search.js",
  "./src/convert.js",
  "./src/sw-register.js",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

function isSameOrigin(requestUrl) {
  try {
    return new URL(requestUrl).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: false });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Only cache same-origin & successful responses
        if (res.ok && isSameOrigin(req.url)) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // If navigation fails offline, fall back to app shell
        if (req.mode === "navigate") {
          const shell = await cache.match("./");
          if (shell) return shell;
        }
        throw e;
      }
    })()
  );
});

