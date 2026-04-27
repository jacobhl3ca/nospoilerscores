// HideScore service worker.
// Goals: faster repeat visits (precache shell), graceful offline fallback,
// never cache /api/youtube responses long-term (results stale fast).

const CACHE_VERSION = "hidescore-v2";
const PRECACHE_URLS = [
  "/",
  "/today",
  "/tomorrow",
  "/manifest.json",
  "/favicon.svg",
  "/favicon-32.png",
  "/favicon-16.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/og-image.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll fails the whole install if any URL 404s; use Promise.allSettled
      // around individual puts so a single missing asset doesn't break SW install.
      Promise.allSettled(
        PRECACHE_URLS.map((u) =>
          fetch(u, { cache: "reload" })
            .then((r) => (r.ok ? cache.put(u, r) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /api/youtube — network-first, no cache write. Stale results would mean
  // serving yesterday's highlight for a game played today.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // /news/*.json — prebake refreshes every 30 min and the React code passes
  // `cache: "no-store"`. Without a network-first branch here the SW's static
  // stale-while-revalidate served yesterday's prebake on first load each
  // session, which mobile users saw as "wrong day" news.
  if (url.pathname.startsWith("/news/") && url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || new Response("", { status: 504 })))
    );
    return;
  }

  // HTML navigations — network-first, fall back to cached page or "/" shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/"))
        )
    );
    return;
  }

  // Static assets — stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
