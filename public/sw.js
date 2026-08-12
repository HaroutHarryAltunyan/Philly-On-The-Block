const CACHE_NAME = "otb-pwa-v2";
const CACHEABLE_PATHS = ["/images/", "/icons/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Return the last cached page that is actually a successful response. Never
// fall back to a cached error page (401/404/500) — that is what makes
// navigation dead-end on a sign-in screen.
async function lastGoodNavigation(cache, request) {
  const cached = await cache.match(request);
  if (cached && cached.ok) return cached;
  const home = await cache.match("/");
  if (home && home.ok) return home;
  return null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            try {
              await cache.put(request, fresh.clone());
            } catch {
              // cache write is best-effort
            }
            return fresh;
          }
          // Never cache or serve broken responses (401/404/500). If the
          // network gave us a failure, fall back to the last good page so
          // navigation never dead-ends on an error screen.
          return (await lastGoodNavigation(cache, request)) || fresh;
        } catch {
          return (await lastGoodNavigation(cache, request)) || Response.error();
        }
      })(),
    );
    return;
  }

  const isCacheable = CACHEABLE_PATHS.some((prefix) => url.pathname.startsWith(prefix));
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && isCacheable) {
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
