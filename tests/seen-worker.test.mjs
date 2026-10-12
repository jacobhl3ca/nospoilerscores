import test from "node:test";
import assert from "node:assert/strict";
import worker, { _hsMergeSeen } from "../public/_worker.js";

// /api/seen — the account's opened news posts (src/lib/seenSync.ts). R2 is an
// in-memory stand-in with the calls the account code uses (get / put / head /
// delete); sessions are the worker's own HMAC cookie, as in picks-worker.

const DAY = 24 * 60 * 60 * 1000;

test("_hsMergeSeen: later time wins, bad entries skipped, 14-day and 3,000 caps", () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const out = _hsMergeSeen(
    { a: now - 5000, b: now - 1000, old: now - 15 * DAY, bad: "x" },
    { a: now - 2000, b: now - 9000, c: now, nan: Number.NaN, "": now },
    now,
  );
  assert.deepEqual(out, { c: now, b: now - 1000, a: now - 2000 });
  assert.deepEqual(_hsMergeSeen(null, [1, 2], now), {});
  const many = {};
  for (let i = 0; i < 3100; i++) many[`k${i}`] = now - i;
  const capped = _hsMergeSeen(many, {}, now);
  assert.equal(Object.keys(capped).length, 3000);
  assert.ok("k0" in capped && !("k3099" in capped));
});

function r2() {
  const m = new Map();
  return {
    m,
    async get(k) {
      if (!m.has(k)) return null;
      const value = m.get(k);
      return { body: value, async json() { return JSON.parse(value); }, async text() { return value; } };
    },
    async head(k) { return m.has(k) ? {} : null; },
    async put(k, v) { m.set(k, typeof v === "string" ? v : String(v)); },
    async delete(k) { m.delete(k); },
  };
}

const SECRET = "test-session-secret";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function session(sub) {
  const body = b64url(JSON.stringify({ sub, email: null, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `hs_session=${body}.${b64url(new Uint8Array(sig))}`;
}
const env = (DATA) => ({ DATA, SESSION_SECRET: SECRET, ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });
const call = (DATA, cookie, method = "GET", body, path = "/api/seen") =>
  worker.fetch(new Request(`https://hidescore.com${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }), env(DATA), { waitUntil() {} });

test("/api/seen: signed out is 401 for GET and POST", async () => {
  const DATA = r2();
  assert.equal((await call(DATA, null)).status, 401);
  assert.equal((await call(DATA, null, "POST", { add: { a: 1 } })).status, 401);
});

test("/api/seen: starts empty, POST merges, GET reads it back on another device", async () => {
  const DATA = r2();
  const me = await session("apple:jacob");
  assert.deepEqual(await (await call(DATA, me)).json(), { seen: {} });
  const now = Date.now();
  let r = await call(DATA, me, "POST", { add: { "https://x/1": now - 1000 } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, count: 1 });
  r = await call(DATA, me, "POST", { add: { "https://x/2": now, "https://x/1": now - 5000 } });
  assert.deepEqual(await r.json(), { ok: true, count: 2 });
  const seen = (await (await call(DATA, me)).json()).seen;
  assert.deepEqual(seen, { "https://x/2": now, "https://x/1": now - 1000 });
  // Another account sees none of it.
  assert.deepEqual(await (await call(DATA, await session("apple:someone"))).json(), { seen: {} });
});

test("/api/seen: bad JSON or shape is 400, over 64 KB is 413", async () => {
  const DATA = r2();
  const me = await session("apple:jacob");
  assert.equal((await call(DATA, me, "POST", "{nope")).status, 400);
  assert.equal((await call(DATA, me, "POST", { a: 1 })).status, 400);
  assert.equal((await call(DATA, me, "POST", { add: [1] })).status, 400);
  assert.equal((await call(DATA, me, "POST", { add: { a: "1" } })).status, 400);
  assert.equal((await call(DATA, me, "POST", { add: { a: 1 }, pad: "x".repeat(64 * 1024) })).status, 413);
});

test("DELETE /api/account removes seen/<uid>.json", async () => {
  const DATA = r2();
  const me = await session("apple:jacob");
  await call(DATA, me, "POST", { add: { a: Date.now() } });
  const keys = () => [...DATA.m.keys()].filter((k) => k.startsWith("seen/"));
  assert.equal(keys().length, 1);
  assert.equal((await call(DATA, me, "DELETE", undefined, "/api/account")).status, 200);
  assert.equal(keys().length, 0);
});
