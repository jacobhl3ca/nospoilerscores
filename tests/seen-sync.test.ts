import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";

import { NEWS_SEEN_STORAGE_KEY, isSeen, markSeen, mergeSeen, resetSeenCache, seenSnapshot, setSeenMorningReset, setSeenSync } from "../src/lib/newsSeen.ts";
import { pullSeen, pushSeen, resetSeenSyncState, stopSeenSync } from "../src/lib/seenSync.ts";

// lib/seenSync under node: a fake fetch records every call, and mock timers
// drive the 2 s debounce.

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

type Call = { url: string; method: string; body: unknown; keepalive: boolean };
let calls: Call[] = [];
let answer: (call: Call) => Response | Promise<Response> = () => Response.json({ ok: true });
const realFetch = globalThis.fetch;

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  resetSeenCache();
  // These tests stamp fixed times; the 4 AM rule has its own file
  // (news-seen-morning.test.ts).
  setSeenMorningReset(false);
  resetSeenSyncState();
  setSeenSync(null);
  calls = [];
  answer = () => Response.json({ ok: true });
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const call = {
      url: String(input),
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      keepalive: Boolean(init.keepalive),
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  mock.timers.enable({ apis: ["setTimeout"] });
});

afterEach(() => {
  mock.timers.reset();
  globalThis.fetch = realFetch;
});

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const posts = () => calls.filter((c) => c.method === "POST");

test("pushSeen coalesces marks inside the 2 s debounce into one POST", async () => {
  pushSeen("a", 1);
  mock.timers.tick(1500);
  pushSeen("b", 2);
  mock.timers.tick(1999);
  assert.equal(posts().length, 0);
  mock.timers.tick(1);
  await settle();
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].url, "/api/seen");
  assert.deepEqual(posts()[0].body, { add: { a: 1, b: 2 } });
});

test("markSeen reaches the server once setSeenSync(pushSeen) is wired", async () => {
  setSeenSync(pushSeen);
  markSeen("https://x/1", 10);
  mock.timers.tick(2000);
  await settle();
  assert.deepEqual(posts()[0].body, { add: { "https://x/1": 10 } });
});

test("a failed POST re-queues its marks and the next send carries them", async () => {
  answer = () => { throw new TypeError("offline"); };
  pushSeen("a", 1);
  mock.timers.tick(2000);
  await settle();
  assert.equal(posts().length, 1);
  answer = () => Response.json({ ok: true });
  pushSeen("b", 2);
  mock.timers.tick(2000);
  await settle();
  assert.equal(posts().length, 2);
  assert.deepEqual(posts()[1].body, { add: { a: 1, b: 2 } });
});

test("a 5xx re-queues; a 4xx (signed out) does not", async () => {
  answer = () => new Response("", { status: 503 });
  pushSeen("a", 1);
  mock.timers.tick(2000);
  await settle();
  answer = () => new Response("", { status: 401 });
  pushSeen("b", 2);
  mock.timers.tick(2000);
  await settle();
  assert.deepEqual(posts()[1].body, { add: { a: 1, b: 2 } });
  answer = () => Response.json({ ok: true });
  pushSeen("c", 3);
  mock.timers.tick(2000);
  await settle();
  assert.deepEqual(posts()[2].body, { add: { c: 3 } });
});

test("pullSeen merges the account's marks and sends up what the account lacks", async () => {
  const now = Date.now();
  markSeen("local-only", now - 1000);
  markSeen("both", now - 5000);
  answer = (c) => c.method === "GET"
    ? Response.json({ seen: { "from-phone": now - 2000, both: now - 3000 } })
    : Response.json({ ok: true });
  await pullSeen();
  assert.equal(isSeen("from-phone"), true);
  assert.equal(seenSnapshot().both, now - 3000);
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(NEWS_SEEN_STORAGE_KEY)!)["from-phone"], now - 2000);
  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, { add: { "local-only": now - 1000 } });
});

test("pullSeen is quiet on a failure and sends nothing when in step", async () => {
  answer = () => new Response("", { status: 401 });
  await pullSeen();
  answer = () => { throw new TypeError("offline"); };
  await pullSeen();
  const now = Date.now();
  markSeen("a", now);
  answer = () => Response.json({ seen: { a: now } });
  await pullSeen();
  assert.equal(posts().length, 0);
});

test("a big backlog goes up in slices under 64 KB", async () => {
  const now = Date.now();
  const add: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) add[`https://www.reddit.com/r/baseball/comments/${i}/a_long_enough_title_slug/`] = now - i;
  answer = (c) => c.method === "GET" ? Response.json({ seen: add }) : Response.json({ ok: true });
  await pullSeen();
  // More local marks (mergeSeen: no push), pruned to the newest 3,000.
  mergeSeen(Object.fromEntries(Object.keys(add).map((k) => [`${k}x`, now])));
  answer = (c) => c.method === "GET" ? Response.json({ seen: {} }) : Response.json({ ok: true });
  await pullSeen();
  assert.ok(posts().length > 1);
  let total = 0;
  for (const p of posts()) {
    assert.ok(JSON.stringify(p.body).length < 64 * 1024);
    total += Object.keys((p.body as { add: object }).add).length;
  }
  assert.equal(total, 3000);
});

test("stopSeenSync unhooks the mirror; sign out flushes with keepalive, delete drops", async () => {
  setSeenSync(pushSeen);
  markSeen("a", 1);
  stopSeenSync(true);
  await settle();
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].keepalive, true);
  markSeen("b", 2);
  mock.timers.tick(5000);
  await settle();
  assert.equal(posts().length, 1);
  setSeenSync(pushSeen);
  markSeen("c", 3);
  stopSeenSync(false);
  mock.timers.tick(5000);
  await settle();
  assert.equal(posts().length, 1);
});
