// HideScore service worker.
// Goals: faster repeat visits (precache shell), graceful offline fallback,
// never cache /api/youtube responses long-term (results stale fast).
//
// Versioned path for production cache busting. Keep this file in sync with
// sw.js when bumping CACHE_VERSION.
const CACHE_VERSION = "hidescore-v12";
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

  // App bundle (/_next/static) — network-first, cache only as an offline
  // fallback. Turbopack chunk names are stable across builds, so the old
  // stale-while-revalidate branch could serve a returning user OLD chunk
  // *content* under the same filename against fresh HTML — a hydration
  // mismatch that blanks the screen (the wedge behind the sw-vN bumps). Going
  // network-first here means the app always boots on the deployed code; the
  // client-side self-heal watchdog in <head> is the backstop if it still fails.
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

  // HTML navigations — network-first, fall back to cached page or "/" shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        // The fallback chain MUST always resolve to a Response. The old version
        // ended at caches.match("/"), which resolves to `undefined` on a brand-new
        // session whose precache hasn't landed yet — respondWith(undefined) is what
        // the browser renders as "this page couldn't load" (Jacob 6/18, on the very
        // first nav after a cold open). Now: cached page → "/" shell → one more
        // network try → a tiny self-reloading shell, so a transient blip shows
        // "Reconnecting…" and heals itself instead of a hard error.
        .catch(() =>
          caches.match(req)
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || fetch(req))
            .catch(() => new Response(
              "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>HideScore</title><body style=\"margin:0;background:#0b0b0b;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh\"><div style=\"text-align:center;opacity:.85\"><div style=\"font-weight:700;font-size:20px\">HideScore</div><div style=\"margin-top:8px;font-size:14px;opacity:.7\">Reconnecting…</div></div><script>setTimeout(function(){location.reload()},1500)</script>",
              { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
            ))
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
