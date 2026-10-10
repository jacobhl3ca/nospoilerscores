import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  NEWS_SEEN_STORAGE_KEY,
  SEEN_MAX_AGE_MS,
  SEEN_MAX_ENTRIES,
  dropSeen,
  isSeen,
  markSeen,
  pruneSeen,
  resetSeenCache,
  seenKeys,
} from "../src/lib/newsSeen.ts";

// Minimal localStorage for node: the store reads globalThis.localStorage.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  resetSeenCache();
});

const stored = () => JSON.parse(globalThis.localStorage.getItem(NEWS_SEEN_STORAGE_KEY) ?? "{}");

test("markSeen / isSeen round-trip and write through to storage", () => {
  assert.equal(isSeen("https://reddit.com/r/nba/1"), false);
  markSeen("https://reddit.com/r/nba/1");
  assert.equal(isSeen("https://reddit.com/r/nba/1"), true);
  assert.ok(stored()["https://reddit.com/r/nba/1"] > 0);
  // A fresh load (new page) reads it back from storage.
  resetSeenCache();
  assert.equal(isSeen("https://reddit.com/r/nba/1"), true);
});

test("an empty key is never stored", () => {
  markSeen("");
  assert.equal(seenKeys().size, 0);
});

test("pruneSeen drops entries older than 14 days", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  markSeen("old", now - SEEN_MAX_AGE_MS - 1);
  markSeen("edge", now - SEEN_MAX_AGE_MS);
  markSeen("new", now - 1000);
  pruneSeen(now);
  assert.deepEqual([...seenKeys()].sort(), ["edge", "new"]);
  assert.deepEqual(Object.keys(stored()).sort(), ["edge", "new"]);
});

test("pruneSeen caps the store at the newest SEEN_MAX_ENTRIES", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const raw: Record<string, number> = {};
  for (let i = 0; i < SEEN_MAX_ENTRIES + 50; i++) raw[`k${i}`] = now - i * 1000;
  globalThis.localStorage.setItem(NEWS_SEEN_STORAGE_KEY, JSON.stringify(raw));
  resetSeenCache();
  pruneSeen(now);
  const keys = seenKeys();
  assert.equal(keys.size, SEEN_MAX_ENTRIES);
  assert.ok(keys.has("k0"));
  assert.ok(!keys.has(`k${SEEN_MAX_ENTRIES + 49}`));
});

test("a corrupt store reads as empty instead of throwing", () => {
  globalThis.localStorage.setItem(NEWS_SEEN_STORAGE_KEY, "{not json");
  resetSeenCache();
  assert.equal(seenKeys().size, 0);
  markSeen("a");
  assert.equal(isSeen("a"), true);
});

test("dropSeen keys on articleUrl, falls back to id, and keeps unknown keys", () => {
  const items = [
    { id: "1", articleUrl: "https://x/1" },
    { id: "2", articleUrl: "" },
    { id: "3", articleUrl: "https://x/3" },
  ];
  const out = dropSeen(items, new Set(["https://x/1", "2", "https://x/unrelated"]));
  assert.deepEqual(out.map((i) => i.id), ["3"]);
});

test("dropSeen with no keys returns the same array (toggle off)", () => {
  const items = [{ id: "1", articleUrl: "https://x/1" }];
  assert.equal(dropSeen(items, undefined), items);
  assert.equal(dropSeen(items, new Set()), items);
});

test("a snapshot does not grow: a post seen after it is not dropped", () => {
  markSeen("https://x/1");
  const snapshot = seenKeys();
  markSeen("https://x/2");
  const items = [{ id: "1", articleUrl: "https://x/1" }, { id: "2", articleUrl: "https://x/2" }];
  assert.deepEqual(dropSeen(items, snapshot).map((i) => i.id), ["2"]);
  // The next snapshot picks it up.
  assert.deepEqual(dropSeen(items, seenKeys()).map((i) => i.id), []);
});
