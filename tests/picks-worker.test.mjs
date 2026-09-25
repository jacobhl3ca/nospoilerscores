import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../public/_worker.js";

// /api/picks — the shared bracket leaderboard. KV is an in-memory stand-in with
// the three calls the route uses (get / put / delete / list with metadata);
// StatsAPI is stubbed with the 2026 postseason feed (all games TBD, so the lock
// is noon ET on 9/29), shifted when a test needs the lock in the past.

const feed2026 = JSON.parse(readFileSync(new URL("./fixtures/mlb-postseason-2026.json", import.meta.url), "utf8"));

function kv() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const e = m.get(k);
      if (!e) return null;
      return type === "json" ? JSON.parse(e.value) : e.value;
    },
    async put(k, value, opts = {}) { m.set(k, { value: String(value), metadata: opts.metadata ?? null }); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) {
      const keys = [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, metadata: m.get(name).metadata }));
      return { keys, list_complete: true };
    },
  };
}

// Freeze "now" and the StatsAPI answer for one call.
async function withWorld({ now, feed = feed2026 }, fn) {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.startsWith("https://statsapi.mlb.com/")) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(feed), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  Date.now = () => Date.parse(now);
  try { return await fn(); } finally { globalThis.fetch = realFetch; Date.now = realNow; }
}

const env = (store) => ({ PICKS: store, ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } } });
const post = (store, body, ip = "1.2.3.4") =>
  worker.fetch(new Request("https://hidescore.com/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  }), env(store), { waitUntil() {} });
const get = (store) => worker.fetch(new Request("https://hidescore.com/api/picks?board=mlb-2026"), env(store), { waitUntil() {} });

const TOKEN_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PICKS = { "AL:wc-a": "136", ws: "147" };
const BEFORE = "2026-09-25T12:00:00Z";
const AFTER = "2026-09-29T16:00:01Z";

// The lock cache lives for 10 minutes per isolate; every test after the first
// sees the same 2026 answer, which is what each of them wants.

test("without the KV binding every call is a soft 503", async () => {
  const res = await worker.fetch(new Request("https://hidescore.com/api/picks?board=mlb-2026"), { ASSETS: {} }, {});
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { disabled: true });
});

test("before the lock: a POST saves, and GET returns names only", async () => {
  const store = kv();
  await withWorld({ now: BEFORE }, async () => {
    const r = await post(store, { board: "mlb-2026", name: "  Jacob  ", token: TOKEN_A, picks: PICKS });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, "Jacob");
    const g = await (await get(store)).json();
    assert.equal(g.locked, false);
    assert.equal(g.lockAt, "2026-09-29T16:00:00.000Z");
    assert.deepEqual(g.names, ["Jacob"]);
    assert.equal(g.entries, undefined);
    assert.ok(!JSON.stringify(g).includes("136"), "no picks leak before the lock");
  });
});

test("a name belongs to the device that took it; that device can edit and rename", async () => {
  const store = kv();
  await withWorld({ now: BEFORE }, async () => {
    assert.equal((await post(store, { board: "mlb-2026", name: "Jacob", token: TOKEN_A, picks: PICKS })).status, 200);
    const taken = await post(store, { board: "mlb-2026", name: "JACOB", token: TOKEN_B, picks: PICKS }, "5.6.7.8");
    assert.equal(taken.status, 409);
    // Same device edits.
    assert.equal((await post(store, { board: "mlb-2026", name: "jacob", token: TOKEN_A, picks: { ws: "119" } })).status, 200);
    // Same device renames: the old entry moves, it doesn't duplicate.
    assert.equal((await post(store, { board: "mlb-2026", name: "JHL", token: TOKEN_A, picks: { ws: "119" } })).status, 200);
    const g = await (await get(store)).json();
    assert.deepEqual(g.names, ["JHL"]);
    // The stored record keeps only a hash of the device token.
    const rec = [...store.m.entries()].find(([k]) => k.startsWith("e:"))[1].value;
    assert.ok(!rec.includes(TOKEN_A));
  });
});

test("after the lock: POST is refused and GET returns every bracket", async () => {
  const store = kv();
  await withWorld({ now: BEFORE }, () => post(store, { board: "mlb-2026", name: "Jacob", token: TOKEN_A, picks: PICKS }));
  await withWorld({ now: AFTER }, async () => {
    const r = await post(store, { board: "mlb-2026", name: "Late", token: TOKEN_B, picks: PICKS }, "9.9.9.9");
    assert.equal(r.status, 423);
    const g = await (await get(store)).json();
    assert.equal(g.locked, true);
    assert.deepEqual(g.entries, [{ name: "Jacob", picks: PICKS }]);
  });
});

test("shape checks: name, token, picks, board, size", async () => {
  const store = kv();
  await withWorld({ now: BEFORE }, async () => {
    const base = { board: "mlb-2026", name: "Ok", token: TOKEN_A, picks: PICKS };
    const bad = [
      { ...base, name: "<script>" },
      { ...base, name: "x".repeat(21) },
      { ...base, token: "short" },
      { ...base, picks: { "AL:wc-a": "4614" } },
      { ...base, picks: { "AL:zz": "136" } },
      { ...base, picks: ["136"] },
      { ...base, board: "mlb-2019" },
      { ...base, board: "nba-2026" },
    ];
    for (const [i, b] of bad.entries()) {
      const r = await post(store, b, `10.0.0.${i}`);
      assert.equal(r.status, 400, JSON.stringify(b));
    }
    const big = await post(store, { ...base, pad: "x".repeat(3000) }, "10.0.1.1");
    assert.equal(big.status, 413);
  });
});

test("an IP gets 10 POSTs per window, then 429", async () => {
  const store = kv();
  await withWorld({ now: BEFORE }, async () => {
    for (let i = 0; i < 10; i++) {
      const r = await post(store, { board: "mlb-2026", name: "Spam", token: TOKEN_A, picks: PICKS }, "7.7.7.7");
      assert.equal(r.status, 200);
    }
    const r = await post(store, { board: "mlb-2026", name: "Spam", token: TOKEN_A, picks: PICKS }, "7.7.7.7");
    assert.equal(r.status, 429);
    // Another address is unaffected.
    assert.equal((await post(store, { board: "mlb-2026", name: "Other", token: TOKEN_B, picks: PICKS }, "8.8.8.8")).status, 200);
  });
});

// /api/picks/account — the account holds one token, so every device on it
// edits the same entry. Sessions are the worker's own HMAC cookie.
const SECRET = "test-session-secret";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function session(sub) {
  const body = b64url(JSON.stringify({ sub, email: null, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `hs_session=${body}.${b64url(new Uint8Array(sig))}`;
}
const acctEnv = (store) => ({ ...env(store), SESSION_SECRET: SECRET });
const acct = (store, cookie, method = "GET", body) =>
  worker.fetch(new Request("https://hidescore.com/api/picks/account", {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }), acctEnv(store), { waitUntil() {} });

const ENTRY = { name: "JH", picks: PICKS, at: "2026-09-24T20:00:00.000Z" };

test("account picks: signed out is 401, signed in starts empty", async () => {
  const store = kv();
  assert.equal((await acct(store, null)).status, 401);
  const r = await acct(store, await session("apple:jacob"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { picks: null });
});

test("account picks: the first token sticks; a second device gets 409 and the stored record", async () => {
  const store = kv();
  const me = await session("apple:jacob");
  const put = await acct(store, me, "PUT", { token: TOKEN_A, boards: { "mlb-2026": ENTRY } });
  assert.equal(put.status, 200);
  assert.deepEqual((await (await acct(store, me)).json()).picks, { token: TOKEN_A, boards: { "mlb-2026": ENTRY } });

  const other = await acct(store, me, "PUT", { token: TOKEN_B, boards: {} });
  assert.equal(other.status, 409);
  assert.equal((await other.json()).picks.token, TOKEN_A);

  // Another account never sees it.
  assert.deepEqual(await (await acct(store, await session("apple:someone"))).json(), { picks: null });
});

test("account picks: boards merge newest-first under the same token", async () => {
  const store = kv();
  const me = await session("apple:jacob");
  await acct(store, me, "PUT", { token: TOKEN_A, boards: { "mlb-2026": ENTRY } });
  const older = { ...ENTRY, picks: { ws: "119" }, at: "2026-09-23T00:00:00.000Z" };
  await acct(store, me, "PUT", { token: TOKEN_A, boards: { "mlb-2026": older } });
  assert.deepEqual((await (await acct(store, me)).json()).picks.boards["mlb-2026"], ENTRY);
  const newer = { ...ENTRY, picks: { ws: "119" }, at: "2026-09-25T00:00:00.000Z" };
  await acct(store, me, "PUT", { token: TOKEN_A, boards: { "mlb-2026": newer } });
  assert.deepEqual((await (await acct(store, me)).json()).picks.boards["mlb-2026"], newer);
});

test("account picks: shape checks", async () => {
  const store = kv();
  const me = await session("apple:jacob");
  for (const body of [
    { token: "short", boards: {} },
    { token: TOKEN_A, boards: { "nba-2026": ENTRY } },
    { token: TOKEN_A, boards: { "mlb-2026": { ...ENTRY, name: "<b>" } } },
    { token: TOKEN_A, boards: { "mlb-2026": { ...ENTRY, at: "soon" } } },
    { token: TOKEN_A, boards: [] },
    "not json",
  ]) {
    assert.equal((await acct(store, me, "PUT", body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await acct(store, me, "PUT", { token: TOKEN_A, pad: "x".repeat(5000) })).status, 413);
});
