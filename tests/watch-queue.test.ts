import assert from "node:assert/strict";
import test from "node:test";

import {
  pruneWatchQueue,
  toggleWatchQueue,
  removeFromWatchQueue,
  isQueued,
  WATCH_QUEUE_CAP,
  type WatchQueueEntry,
} from "../src/lib/watchQueue.ts";
import { withoutDeviceLocalPrefs } from "../src/lib/devicePrefs.ts";

const entry = (id: string, date = "20260927", league = "mlb"): WatchQueueEntry => ({ id, league, date, addedAt: 1 });

test("a game more than 3 days old is pruned; 3 days old stays", () => {
  const q = [entry("a", "20260923"), entry("b", "20260924"), entry("c", "20260927"), entry("d", "20260928")];
  assert.deepEqual(pruneWatchQueue(q, "20260927")?.map((e) => e.id), ["b", "c", "d"]);
});

test("prune crosses a month boundary by calendar day", () => {
  const q = [entry("sep27", "20260927"), entry("sep28", "20260928")];
  assert.deepEqual(pruneWatchQueue(q, "20261001")?.map((e) => e.id), ["sep28"]);
});

test("prune drops malformed and duplicate entries, and empties to undefined", () => {
  const q = [entry("a"), { id: "", league: "mlb", date: "20260927", addedAt: 1 }, { id: "x" }, null, "junk", entry("a")];
  assert.deepEqual(pruneWatchQueue(q, "20260927")?.map((e) => e.id), ["a"]);
  assert.equal(pruneWatchQueue([], "20260927"), undefined);
  assert.equal(pruneWatchQueue(undefined, "20260927"), undefined);
  assert.equal(pruneWatchQueue({ not: "an array" }, "20260927"), undefined);
});

test("toggle adds newest last and caps at 20, dropping the oldest", () => {
  let q: WatchQueueEntry[] | undefined;
  for (let i = 0; i < WATCH_QUEUE_CAP + 3; i++) q = toggleWatchQueue(q, entry(`g${i}`));
  assert.equal(WATCH_QUEUE_CAP, 20);
  assert.equal(q!.length, 20);
  assert.equal(q![0].id, "g3");
  assert.equal(q!.at(-1)!.id, `g${WATCH_QUEUE_CAP + 2}`);
});

test("toggle on a queued game removes it; the same id in another league is a different game", () => {
  let q = toggleWatchQueue(undefined, entry("401", "20260927", "nfl"));
  q = toggleWatchQueue(q, entry("401", "20260927", "ncaaf"));
  assert.equal(q!.length, 2);
  assert.equal(isQueued(q, "401", "nfl"), true);
  q = toggleWatchQueue(q, entry("401", "20260927", "nfl"));
  assert.equal(isQueued(q, "401", "nfl"), false);
  assert.equal(isQueued(q, "401", "ncaaf"), true);
  assert.equal(toggleWatchQueue(q, entry("401", "20260927", "ncaaf")), undefined);
});

test("Done removes one game and leaves the rest", () => {
  const q = [entry("a"), entry("b")];
  assert.deepEqual(removeFromWatchQueue(q, { id: "a", league: "mlb" })?.map((e) => e.id), ["b"]);
  assert.equal(removeFromWatchQueue([entry("a")], { id: "a", league: "mlb" }), undefined);
});

test("the Apple ID sync payload carries the queue (it is not device-local)", () => {
  const prefs = { watchQueue: [entry("a")], hideWatchLaterPill: true, singleColumn: true };
  const payload = withoutDeviceLocalPrefs(prefs) as Record<string, unknown>;
  assert.deepEqual(payload.watchQueue, [entry("a")]);
  assert.equal(payload.hideWatchLaterPill, true);
  assert.equal("singleColumn" in payload, false);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)).watchQueue, [entry("a")]);
});
