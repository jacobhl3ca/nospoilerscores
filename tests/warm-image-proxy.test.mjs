import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { proxyImage, warmImageProxy, warmUrlsFor } from "../scripts/lib/warm-image-proxy.mjs";

// The bake's copy of proxyImage must build the same URL the client asks for,
// or the warm fills a cache key no reader ever hits.
test("bake proxyImage body matches src/lib/news.ts", () => {
  const body = (src) => src.match(/function proxyImage\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)[1].replace(/\s+/g, " ").trim();
  const client = readFileSync(new URL("../src/lib/news.ts", import.meta.url), "utf8");
  const bake = readFileSync(new URL("../scripts/lib/warm-image-proxy.mjs", import.meta.url), "utf8");
  assert.equal(body(bake), body(client));
});

test("proxyImage wraps redd.it only", () => {
  assert.equal(proxyImage("https://i.redd.it/abc.jpeg", 1400), "https://images.weserv.nl/?url=i.redd.it%2Fabc.jpeg&w=1400&we");
  assert.equal(proxyImage("https://example.com/a.jpg", 1400), "https://example.com/a.jpg");
});

test("warmUrlsFor: lightbox, Feed hero and row thumb widths", () => {
  const urls = warmUrlsFor([
    { imageFullUrl: "https://i.redd.it/full.jpeg", imageUrl: "https://i.redd.it/full.jpeg" },
    { imageUrl: "https://i.redd.it/g1.jpeg", images: ["https://i.redd.it/g1.jpeg", "https://i.redd.it/g2.jpeg"] },
    { imageUrl: "https://b.thumbs.redditmedia.com/t.jpg", thumbOnly: true },
    { headline: "text only" },
  ]);
  const p = (u, w) => proxyImage(u, w);
  assert.deepEqual(new Set(urls), new Set([
    p("https://i.redd.it/full.jpeg", 1400),
    p("https://i.redd.it/full.jpeg", 1200),
    p("https://i.redd.it/full.jpeg", 160),
    p("https://i.redd.it/g1.jpeg", 1400),
    p("https://i.redd.it/g2.jpeg", 1400),
    p("https://i.redd.it/g1.jpeg", 1200),
    p("https://i.redd.it/g1.jpeg", 160),
  ]));
});

test("warmImageProxy never throws, skips seen URLs, caps concurrency", async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = async (url) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    if (url.endsWith("bad")) throw new Error("boom");
    return { ok: !url.endsWith("404") };
  };
  const seen = new Map([["u0", 1]]);
  const urls = ["u0", ...Array.from({ length: 10 }, (_, i) => `u${i + 1}`), "x-bad", "x-404"];
  const r = await warmImageProxy(urls, { concurrency: 3, seen, fetchImpl });
  assert.deepEqual(r, { ok: 10, failed: 2, skipped: 1 });
  assert.ok(peak <= 3);
  assert.ok(seen.has("u10"));
  assert.ok(!seen.has("x-404"));
});
