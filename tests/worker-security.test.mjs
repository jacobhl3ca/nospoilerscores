import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// Security fixes before the HN post (2026-10). Each test pins one fix:
// bounded /api/youtube input, cache keys built from parsed params (youtube,
// cricket-intl, esports, chess), one global boxing snapshot for a 100-call
// monthly quota, a capped unfurl label, and same-origin native sign-in.

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const assets = { async fetch() { return new Response("STATIC", { status: 404 }); } };

// caches.default stand-in keyed by URL, plus a ctx whose waitUntil work can be
// awaited before the next request.
function withCaches() {
  const m = new Map();
  const real = globalThis.caches;
  globalThis.caches = {
    default: {
      async match(req) { const r = m.get(req.url); return r ? r.clone() : undefined; },
      async put(req, res) { m.set(req.url, res); },
      async delete(req) { return m.delete(req.url); },
    },
  };
  return { m, restore: () => { if (real === undefined) delete globalThis.caches; else globalThis.caches = real; } };
}
function ctx() {
  const pending = [];
  return { waitUntil(p) { pending.push(p); }, settle: () => Promise.all(pending) };
}

// Count upstream fetches and answer them with `handler`.
async function withUpstream(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => { const u = String(input); calls.push(u); return handler(u); };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}

async function call(path, env = { ASSETS: assets }, c = ctx(), init) {
  const res = await worker.fetch(new Request(`https://hidescore.com${path}`, init), env, c);
  await c.settle();
  return res;
}

test("/api/youtube rejects an oversized query or exclude list before any YouTube fetch", async () => {
  await withUpstream(() => new Response(""), async (calls) => {
    assert.equal((await call(`/api/youtube?q=${"a".repeat(301)}`)).status, 400);
    const ids = Array.from({ length: 26 }, (_, i) => `id${String(i).padStart(9, "0")}`).join(",");
    assert.equal((await call(`/api/youtube?q=Cubs%20vs%20Reds%20highlights&exclude=${ids}`)).status, 400);
    assert.equal(calls.length, 0);
    // A normal lookup still reaches YouTube (empty page → the usual 404).
    assert.equal((await call("/api/youtube?q=Cubs%20vs%20Reds%20highlights")).status, 404);
    assert.equal(calls.length, 1);
  });
});

test("/api/youtube shares one answer per lookup; junk or reordered params do not bypass it", async () => {
  const { restore } = withCaches();
  const page = `"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Cubs vs. Reds Highlights"}]},"ownerText":{"runs":[{"text":"MLB"`;
  try {
    await withUpstream(() => new Response(page), async (calls) => {
      const a = await call("/api/youtube?q=Cubs%20vs%20Reds%20highlights&channel=MLB");
      const first = await a.json();
      const n = calls.length;
      assert.ok(n >= 1);
      const b = await call("/api/youtube?junk=1&channel=mlb&q=Cubs%20vs%20Reds%20highlights");
      assert.equal(b.status, a.status);
      assert.deepEqual(await b.json(), first);
      assert.equal(calls.length, n, "second lookup served from the edge cache");
    });
  } finally { restore(); }
});

test("/api/cricket-intl cache key ignores params it does not read", async () => {
  const { restore } = withCaches();
  try {
    await withUpstream(() => json({}), async (calls) => {
      const env = { ASSETS: { async fetch() { return json({ series: [] }); } } };
      await call("/api/cricket-intl?dates=20261010", env);
      const n = calls.length;
      assert.ok(n >= 1);
      for (let i = 0; i < 3; i++) await call(`/api/cricket-intl?dates=20261010&x=${i}`, env);
      assert.equal(calls.length, n);
    });
  } finally { restore(); }
});

test("/api/esports: one PandaScore call per date, whatever else the URL carries", async () => {
  const { restore } = withCaches();
  try {
    await withUpstream(() => json([]), async (calls) => {
      const env = { ASSETS: assets, PANDASCORE_TOKEN: "t" };
      assert.deepEqual(await (await call("/api/esports?date=2026-10-10", env)).json(), { games: [] });
      await call("/api/esports?date=2026-10-10&cb=1", env);
      await call("/api/esports?cb=2&date=2026-10-10", env);
      assert.equal(calls.length, 1);
      await call("/api/esports?date=2026-10-11", env);
      assert.equal(calls.length, 2);
    });
  } finally { restore(); }
});

test("/api/chess: one Lichess call per cache lifetime", async () => {
  const { restore } = withCaches();
  try {
    await withUpstream(() => json({ active: [], upcoming: [], past: { currentPageResults: [] } }), async (calls) => {
      await call("/api/chess");
      await call("/api/chess?x=1");
      assert.equal(calls.length, 1);
    });
  } finally { restore(); }
});

function r2() {
  const m = new Map();
  return {
    m,
    async get(k) { const v = m.get(k); return v == null ? null : { body: v, async json() { return JSON.parse(v); } }; },
    async put(k, v) { m.set(k, String(v)); },
  };
}

test("/api/boxing keeps one global snapshot: repeat visitors spend no quota", async () => {
  const DATA = r2();
  const env = { ASSETS: assets, BOXING_API_KEY: "k", DATA };
  const feed = { data: [{ id: 7, title: "A vs B", date: "2026-11-01", broadcast: [] }] };
  await withUpstream(() => json(feed), async (calls) => {
    const first = await (await call("/api/boxing", env)).json();
    assert.equal(first.events[0].id, "7");
    for (let i = 0; i < 5; i++) assert.deepEqual(await (await call(`/api/boxing?cb=${i}`, env)).json(), first);
    assert.equal(calls.length, 1);
  });
});

test("/api/boxing serves the last good snapshot when the quota is spent", async () => {
  const DATA = r2();
  DATA.m.set("cache/boxing-schedule.json", JSON.stringify({ fetchedAt: 0, events: [{ id: "9", title: "C vs D", date: "2026-12-01" }] }));
  const env = { ASSETS: assets, BOXING_API_KEY: "k", DATA };
  await withUpstream(() => json({ message: "quota" }, 429), async (calls) => {
    const body = await (await call("/api/boxing", env)).json();
    assert.equal(calls.length, 1, "stale snapshot triggers one refresh attempt");
    assert.equal(body.events[0].id, "9");
  });
});

test("news unfurl caps the caller's label like the headline", async () => {
  const real = globalThis.HTMLRewriter;
  const set = {};
  globalThis.HTMLRewriter = class {
    on(sel, h) { h.element({ setAttribute: (_a, v) => { set[sel] = v; } }); return this; }
    transform(r) { return r; }
  };
  try {
    await call(`/?ht=Headline&hl=${"L".repeat(500)}`);
    const desc = set['meta[property="og:description"]'];
    assert.ok(desc.startsWith(`${"L".repeat(59)}… · Watch`), desc.slice(0, 80));
    await call("/?ht=Headline&hl=r%2Fsoccer");
    assert.equal(set['meta[property="og:description"]'], "r/soccer · Watch on HideScore — catch up without seeing the score.");
  } finally {
    if (real === undefined) delete globalThis.HTMLRewriter; else globalThis.HTMLRewriter = real;
  }
});

test("native sign-in POSTs refuse cross-site callers", async () => {
  const env = { ASSETS: assets, SESSION_SECRET: "s", DATA: r2() };
  for (const path of ["/auth/apple/native", "/auth/google/native"]) {
    const cross = await call(path, env, ctx(), {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      body: "{}",
    });
    assert.equal(cross.status, 403, path);
    // Same-origin requests still reach the handler (and fail on the empty body).
    const same = await call(path, env, ctx(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://hidescore.com", "Sec-Fetch-Site": "same-origin" },
      body: "{}",
    });
    assert.notEqual(same.status, 403, path);
  }
});
