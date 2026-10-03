import assert from "node:assert/strict";
import test from "node:test";

import { mergeVideos, orderVideos } from "../scripts/lib/video-order.mjs";

const v = (id, firstSeenAt) => ({ id: String(id), headline: `clip ${id}`, firstSeenAt });

test("orderVideos: ascending firstSeenAt comes out newest-first", () => {
  const out = orderVideos([v(1, 100), v(2, 200), v(3, 300), v(4, 400)]);
  assert.deepEqual(out.map((i) => i.firstSeenAt), [400, 300, 200, 100]);
});

test("orderVideos: same firstSeenAt breaks ties by clip id, highest first", () => {
  const out = orderVideos([v(101, 500), v(205, 500), v(150, 500)]);
  assert.deepEqual(out.map((i) => i.id), ["205", "150", "101"]);
});

test("orderVideos: non-numeric ids tie at 0 and sort after numeric ids", () => {
  const out = orderVideos([v("abc", 500), v(7, 500)]);
  assert.deepEqual(out.map((i) => i.id), ["7", "abc"]);
});

test("orderVideos: pinned ICYMI sits at index 1 and only there", () => {
  const out = orderVideos([v(1, 100), v(2, 200), v(9, 50), v(3, 300)], "9");
  assert.deepEqual(out.map((i) => i.id), ["3", "9", "2", "1"]);
  assert.equal(out.filter((i) => i.id === "9").length, 1);
});

test("orderVideos: pinned only, and cap at 10", () => {
  assert.deepEqual(orderVideos([v(9, 50)], "9").map((i) => i.id), ["9"]);
  const many = Array.from({ length: 15 }, (_, k) => v(k + 1, (k + 1) * 10));
  const out = orderVideos(many);
  assert.equal(out.length, 10);
  assert.equal(out[0].id, "15");
});

test("mergeVideos: carry-forward keeps the earliest firstSeenAt, fresh fields win", () => {
  const carry = [{ ...v(1, 100), headline: "old" }, v(2, undefined)];
  const fresh = [{ ...v(1, undefined), headline: "new" }, v(3, undefined)];
  const byId = mergeVideos(carry, fresh, 999);
  assert.equal(byId.get("1").firstSeenAt, 100);
  assert.equal(byId.get("1").headline, "new");
  assert.equal(byId.get("2").firstSeenAt, 999);
  assert.equal(byId.get("3").firstSeenAt, 999);
});
