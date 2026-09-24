import test from "node:test";
import assert from "node:assert/strict";
import { createWatchMetaStore } from "../scripts/lib/ytWatchMeta.mjs";

// The store behind the bake's fetchYtWatchMeta. On 2026-09-23 the bake read
// ~1,100 watch pages per run from the mini, YouTube blocked 72% of them, and
// the minutes label plus the upload-date gate both went blind. These tests pin
// the three things that fix it: a good read is reused across runs, a failed
// read is not stored, and live fetches stop at the per-run cap.

const PAGE = (d, p) => JSON.stringify({ d, p });
const parseDuration = (html) => JSON.parse(html).d;
const parsePublished = (html) => JSON.parse(html).p;
const NOW = Date.parse("2026-09-23T23:30:00Z");

function makeStore({ disk = {}, pages = {}, liveCap = 250, now = NOW } = {}) {
  const fetched = [];
  const saved = [];
  const store = createWatchMetaStore({
    load: () => disk,
    save: (data) => { saved.push(data); },
    fetchHtml: async (id) => {
      fetched.push(id);
      if (!(id in pages)) throw new Error("302 google.com/sorry");
      return pages[id];
    },
    parseDuration,
    parsePublished,
    liveCap,
    now: () => now,
  });
  return { store, fetched, saved };
}

test("a good read is saved and the next run serves it from disk with no fetch", async () => {
  const run1 = makeStore({ pages: { aaa: PAGE(597, 1_790_000_000_000) } });
  assert.deepEqual(await run1.store.get("aaa"), { durationSec: 597, publishedMs: 1_790_000_000_000 });
  await run1.store.flush();
  assert.equal(run1.saved.length, 1);
  assert.deepEqual(run1.saved[0].aaa, { at: NOW, d: 597, p: 1_790_000_000_000 });

  const run2 = makeStore({ disk: run1.saved[0] });
  assert.deepEqual(await run2.store.get("aaa"), { durationSec: 597, publishedMs: 1_790_000_000_000 });
  assert.deepEqual(run2.fetched, []);
  assert.equal(run2.store.stats().disk, 1);
});

test("a blocked read returns unknown, is not stored, and is retried next run", async () => {
  const run1 = makeStore();
  assert.deepEqual(await run1.store.get("bbb"), { durationSec: null, publishedMs: null });
  assert.equal(await run1.store.flush(), false);
  assert.equal(run1.saved.length, 0);
  assert.equal(run1.store.stats().liveFail, 1);

  const run2 = makeStore({ pages: { bbb: PAGE(120, 1_790_000_000_000) } });
  assert.equal((await run2.store.get("bbb")).durationSec, 120);
  assert.deepEqual(run2.fetched, ["bbb"]);
});

test("the same id is fetched at most once per run", async () => {
  const { store, fetched } = makeStore({ pages: { ccc: PAGE(60, 1) } });
  await store.get("ccc");
  await store.get("ccc");
  assert.deepEqual(fetched, ["ccc"]);
});

test("live fetches stop at the cap; ids past it return what the disk has", async () => {
  const pages = { a1: PAGE(1, 1), a2: PAGE(2, 2), a3: PAGE(3, 3) };
  const { store, fetched } = makeStore({ pages, liveCap: 2, disk: { a3: { at: NOW, d: 3 } } });
  await store.get("a1");
  await store.get("a2");
  assert.deepEqual(await store.get("a3"), { durationSec: 3, publishedMs: null });
  assert.deepEqual(fetched, ["a1", "a2"]);
  assert.equal(store.stats().capped, 1);
});

test("a partial row is completed by a later read and keeps the part it had", async () => {
  const { store, saved } = makeStore({
    disk: { ddd: { at: NOW - 1000, d: 400 } },
    pages: { ddd: JSON.stringify({ d: null, p: 1_790_000_000_000 }) },
  });
  assert.deepEqual(await store.get("ddd"), { durationSec: 400, publishedMs: 1_790_000_000_000 });
  await store.flush();
  assert.deepEqual(saved[0].ddd, { at: NOW, d: 400, p: 1_790_000_000_000 });
});

test("flush drops rows older than keepDays and survives a corrupt file", async () => {
  const old = NOW - 400 * 86_400_000;
  const { store, saved } = makeStore({
    disk: { stale: { at: old, d: 1, p: 1 } },
    pages: { fresh: PAGE(5, 5) },
  });
  await store.get("fresh");
  await store.flush();
  assert.deepEqual(Object.keys(saved[0]), ["fresh"]);

  const broken = createWatchMetaStore({
    load: () => { throw new SyntaxError("Unexpected end of JSON input"); },
    save: () => {},
    fetchHtml: async () => PAGE(9, 9),
    parseDuration,
    parsePublished,
  });
  assert.equal((await broken.get("x")).durationSec, 9);
});
