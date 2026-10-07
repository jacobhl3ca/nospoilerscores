import assert from "node:assert/strict";
import test from "node:test";

import { isRealEspnClip, mergeVideos, orderVideos } from "../scripts/lib/video-order.mjs";

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

test("orderVideos: pinned only, and cap at 20", () => {
  assert.deepEqual(orderVideos([v(9, 50)], "9").map((i) => i.id), ["9"]);
  const many = Array.from({ length: 25 }, (_, k) => v(k + 1, (k + 1) * 10));
  const out = orderVideos(many);
  assert.equal(out.length, 20);
  assert.equal(out[0].id, "25");
  assert.equal(orderVideos(many, undefined, 10).length, 10);
});

test("orderVideos: the newest hero scrape leads, ICYMI second, then sets + clips newest first", () => {
  const hero = v(100, 500);
  const icymi = v(90, 500);
  const set = { ...v(300, 500), feedClip: true, gameId: "g1", clips: [] };
  const single = { ...v(200, 600), feedClip: true };
  const out = orderVideos([set, single, icymi, hero], "90");
  assert.deepEqual(out.map((i) => i.id), ["100", "90", "200", "300"]);
});

test("orderVideos: only feed clips → the newest one leads", () => {
  const out = orderVideos([{ ...v(1, 100), feedClip: true }, { ...v(2, 200), feedClip: true }]);
  assert.deepEqual(out.map((i) => i.id), ["2", "1"]);
});

test("mergeVideos: a fresh game set replaces the carried set of the same game and keeps its first sighting", () => {
  const carry = [{ ...v(10, 100), gameId: "g1", clips: [{ id: "10" }, { id: "11" }] }, v(5, 50)];
  const fresh = [{ ...v(12, undefined), gameId: "g1", clips: [{ id: "12" }, { id: "10" }, { id: "11" }] }];
  const byId = mergeVideos(carry, fresh, 999);
  assert.deepEqual([...byId.keys()].sort(), ["12", "5"]);
  assert.equal(byId.get("12").firstSeenAt, 100);
  assert.equal(byId.get("12").clips.length, 3, "clips ride along");
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

test("isRealEspnClip: live-stream placeholder id \"1\" is not a clip", () => {
  assert.equal(isRealEspnClip({ id: "1", headline: "College GameDay" }), false);
});

test("isRealEspnClip: a 5-digit id is not a clip", () => {
  assert.equal(isRealEspnClip({ id: "12345", headline: "Some highlight" }), false);
});

test("isRealEspnClip: a \"Watch live:\" headline is not a clip, any case", () => {
  assert.equal(isRealEspnClip({ id: "47112233", headline: "Watch live: College GameDay from Iowa City" }), false);
  assert.equal(isRealEspnClip({ id: "47112233", headline: "WATCH LIVE: Big Ten" }), false);
});

test("isRealEspnClip: a real 8-digit clip passes", () => {
  assert.equal(isRealEspnClip({ id: "47112233", headline: "Ohtani homers twice" }), true);
});
