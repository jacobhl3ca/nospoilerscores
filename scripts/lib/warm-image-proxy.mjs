// Warm the image proxy for baked Reddit pictures.
//
// The client wraps every *.redd.it picture in images.weserv.nl (proxyImage in
// src/lib/news.ts). The FIRST viewer of a picture pays weserv's cold fetch +
// resize, and on 10/17 that read as a blank lightbox on r/baseball (Jacob). A
// HEAD to the exact URL the client will ask for makes weserv fetch and cache it
// during the bake, so readers get the cached copy.

// Must match proxyImage() in src/lib/news.ts byte for byte, or the warm request
// fills a cache key no reader ever asks for. tests/warm-image-proxy.test.mjs
// checks the two stay in step.
export function proxyImage(url, width) {
  if (!url) return undefined;
  if (!/\.redd\.it\//.test(url)) return url;
  const w = width ? `&w=${width}&we` : "";
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}${w}`;
}

// Every proxied URL a reader can request for these items, deduped:
//   1400 = lightbox (VideoModal: each gallery frame, else the full picture)
//   1200 = phone Feed hero (NewsFeed: gallery cover, full picture, or thumb tile)
//    160 = row thumbnail (NewsColumn, SensitiveHiddenModal)
// Non-Reddit URLs are not proxied, so they are skipped.
export function warmUrlsFor(items) {
  const out = new Set();
  const add = (u, w) => {
    const p = proxyImage(u, w);
    if (p && p !== u) out.add(p);
  };
  for (const it of items ?? []) {
    if (!it) continue;
    const gallery = (it.images ?? []).filter(Boolean);
    const full = it.imageFullUrl || (it.thumbOnly ? null : it.imageUrl);
    // The modal's imageUrl is imageFullUrl, else a non-thumbOnly imageUrl.
    if (gallery.length > 1) gallery.forEach((g) => add(g, 1400));
    else if (full) add(full, 1400);
    const hero = gallery[0] || full;
    if (hero) add(hero, 1200);
    else if (it.imageUrl) add(it.imageUrl, 1200);
    if (it.imageUrl) add(it.imageUrl, 160);
  }
  return [...out];
}

// HEAD each URL, `concurrency` in flight, `timeoutMs` each. Never throws: a
// slow or failing proxy only costs the warm, never the bake. `seen` (a Map of
// url → epoch ms) skips URLs warmed on an earlier bake.
export async function warmImageProxy(urls, { concurrency = 6, timeoutMs = 8000, seen = null, fetchImpl = fetch } = {}) {
  const todo = urls.filter((u) => !seen?.has(u));
  let ok = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      try {
        const res = await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) {
          ok++;
          seen?.set(url, Date.now());
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { ok, failed, skipped: urls.length - todo.length };
}
