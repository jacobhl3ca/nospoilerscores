// HideScore service worker.
// Goals: faster repeat visits (precache shell), graceful offline fallback,
// never cache /api/youtube responses long-term (results stale fast).
//
// Versioned path for production cache busting. Keep this file in sync with
// sw.js when bumping CACHE_VERSION.
const CACHE_VERSION = "hidescore-v11";
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

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // App bundle: always network-first so a fresh deploy's chunks are never
  // masked by a stale cached copy. A missing chunk (stale HTML referencing a
  // hash that no longer exists) is the root cause of the blank-screen wedge, so
  // for /_next/static we go straight to the network and only fall back to cache
  // when offline.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

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

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || fetch(req))
            .catch(() => new Response(
              "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>HideScore</title><body style=\"margin:0;background:#0b0b0b;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh\"><div style=\"text-align:center;opacity:.85\"><div style=\"font-weight:700;font-size:20px\">HideScore</div><div style=\"margin-top:8px;font-size:14px;opacity:.7\">Reconnecting...</div></div><script>setTimeout(function(){location.reload()},1500)</script>",
              { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
            ))
        )
    );
    return;
  }

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
