import assert from "node:assert/strict";
import test from "node:test";

import { pickEspnGameClip, espnVideoMp4, pickEspnVideoClip, attachEspnVideoClips, espnClipKind, isEspnTalkKind } from "../scripts/lib/espn-clip.mjs";
import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// Shape trimmed from the live esp.1 summary for Racing Santander at Celta Vigo
// (event 401882864, 2026-09-19): one Game Highlights package, per-goal clips.
const mp4 = (slug) => `https://espnmedia-cdn.akamaized.net/espn/media/16x9/wsc/2026/0919/${slug}/${slug}.mp4`;
const video = (headline, slug, duration = 60) => ({
  headline,
  duration,
  thumbnail: `https://espnmedia-cdn.akamaized.net/espn/media/common/wsc/2026/0919/${slug}/${slug}.jpg`,
  links: { source: { href: mp4(slug), HD: { href: mp4(slug) }, mezzanine: { href: mp4(slug) } } },
});
const GAME = video("Celta Vigo vs. Racing Santander - Game Highlights", "game", 74);
const GOALS = [
  video("Hugo Gonzalez slots home penalty for Celta Vigo", "g1", 53),
  video("Ilaix Moriba finds the back of the net for Celta Vigo", "g2", 59),
  video("Pablo Durán scores goal for Celta Vigo", "g3", 65),
];
const SCORED = video("Celta Vigo 3-1 Racing Santander - Game Highlights", "scored", 80);

test("picks only the clean Game Highlights mp4, never a goal clip or a scored headline", () => {
  const { clip, reason } = pickEspnGameClip([...GOALS, SCORED, GAME], isScoreSpoiler);
  assert.equal(reason, "ok");
  assert.deepEqual(clip, { url: mp4("game"), headline: "Celta Vigo vs. Racing Santander - Game Highlights", sec: 74 });
  assert.ok(!clip.url.endsWith(".jpg"), "never the thumbnail");
});

test("returns null when the only Game Highlights entry prints the score", () => {
  assert.deepEqual(pickEspnGameClip([...GOALS, SCORED], isScoreSpoiler), { clip: null, reason: "score" });
});

test("returns null when there is no Game Highlights entry", () => {
  assert.deepEqual(pickEspnGameClip(GOALS, isScoreSpoiler), { clip: null, reason: "none" });
  assert.deepEqual(pickEspnGameClip(undefined, isScoreSpoiler), { clip: null, reason: "none" });
});

test("only a direct mp4 on ESPN's CDN counts, HD first", () => {
  assert.equal(espnVideoMp4({ links: { source: { HD: { href: "https://example.com/x.mp4" }, full: { href: mp4("f") } } } }), mp4("f"));
  assert.equal(espnVideoMp4({ links: { source: { HLS: { href: "https://cmp-espn.media.dssott.com/p/playlist.m3u8" } } } }), null);
  const noMp4 = { ...GAME, links: { source: {} } };
  assert.deepEqual(pickEspnGameClip([noMp4], isScoreSpoiler), { clip: null, reason: "none" });
});

// ESPN Videos feed: api-app.espn.com/v1/video/clips/<id>, shape trimmed from
// clip 50074034 (2026-10-01).
const apiPayload = (id, extra = {}) => ({
  videos: [{ id: Number(id), duration: 61, premium: false, links: { source: { href: mp4(`c${id}`), HD: { href: mp4(`c${id}`) }, HLS: { href: "https://cmp-espn.media.dssott.com/x/playlist.m3u8" } } }, ...extra }],
});

test("clip API: a normal payload gives the akamaized mp4 and its length", () => {
  assert.deepEqual(pickEspnVideoClip(apiPayload("50074034"), "50074034"), { url: mp4("c50074034"), sec: 61 });
});

test("clip API: premium, a non-akamaized URL, a wrong id, or an empty payload gives null", () => {
  assert.equal(pickEspnVideoClip(apiPayload("1", { premium: true }), "1"), null);
  assert.equal(pickEspnVideoClip({ videos: [{ id: 1, links: { source: { href: "https://cdn.example.com/a.mp4", HLS: { href: "https://x.akamaized.net/a.m3u8" } } } }] }, "1"), null);
  assert.equal(pickEspnVideoClip(apiPayload("2"), "1"), null);
  assert.equal(pickEspnVideoClip({}, "1"), null);
  assert.equal(pickEspnVideoClip(null, "1"), null);
  assert.equal(pickEspnVideoClip({ videos: [] }, "1"), null);
});

const feedItem = (id) => ({ id, headline: `clip ${id}`, articleUrl: `https://www.espn.com/video/clip?id=${id}` });
const noSleep = async () => {};

test("attach: unknown ids are asked once each, capped, and a premium answer is remembered", async () => {
  const asked = [];
  const state = { clips: {} };
  const fetchClip = async (id) => { asked.push(id); return apiPayload(id, id === "3" ? { premium: true } : {}); };
  const items = ["1", "2", "3", "4"].map(feedItem);
  const first = await attachEspnVideoClips(items, { on: true, off: false, prior: new Map(), state, fetchClip, max: 3, sleep: noSleep });
  assert.equal(first.requests, 3);
  assert.deepEqual(asked, ["1", "2", "3"]);
  assert.equal(first.items[0].videoUrl, mp4("c1"));
  assert.equal(first.items[0].durationSec, 61);
  assert.equal(first.items[2].videoUrl, undefined, "premium stays image + link");
  assert.equal(first.items[3].videoUrl, undefined, "over the cap waits for the next bake");
  assert.ok(state.clips["3"] && !state.clips["3"].url, "the premium miss is recorded");
  // Second bake: the prior file carries 1 and 2, the state knows 3, only 4 is new.
  const prior = new Map(first.items.map((i) => [i.id, i]));
  const second = await attachEspnVideoClips(items, { on: true, off: false, prior, state, fetchClip, max: 3, sleep: noSleep });
  assert.equal(second.requests, 1);
  assert.deepEqual(asked, ["1", "2", "3", "4"]);
  // Third bake: everything is known, so 0 requests.
  const third = await attachEspnVideoClips(items, { on: true, off: false, prior: new Map(second.items.map((i) => [i.id, i])), state, fetchClip, sleep: noSleep });
  assert.equal(third.requests, 0);
  assert.deepEqual(third.items.map((i) => !!i.videoUrl), [true, true, false, true]);
});

test("attach: a fresh scrape without videoUrl still gets the carried clip", async () => {
  // No state entry, so the id is asked once for its kind; the request fails,
  // and the item keeps the clip the prior file carries.
  const prior = new Map([["9", { ...feedItem("9"), videoUrl: mp4("c9"), durationSec: 40 }]]);
  const { items, requests } = await attachEspnVideoClips([feedItem("9")], { on: true, off: false, prior, state: { clips: {} }, fetchClip: async () => { throw new Error("network"); }, sleep: noSleep });
  assert.equal(requests, 1);
  assert.equal(items[0].videoUrl, mp4("c9"));
  assert.equal(items[0].durationSec, 40);
});

// ESPN's own clip type, videos[0].tracking.coverageType (read 2026-10-04).
test("talk kind: Analysis, InstantAnalysis, PressConference and Interview drop; the rest stay", () => {
  for (const k of ["Analysis", "InstantAnalysis", "PressConference", "Interview"]) assert.equal(isEspnTalkKind(k), true, k);
  for (const k of ["OnePlay", "Highlight", "Final Game Highlight", "Feature", ""]) assert.equal(isEspnTalkKind(k), false, k);
  assert.equal(isEspnTalkKind(undefined), false);
  assert.equal(isEspnTalkKind("Interview Highlights"), false, "a new type is kept");
  assert.equal(isEspnTalkKind("Press Conference"), true);
});

test("clip kind: read from tracking.coverageType, empty when absent or for another id", () => {
  assert.equal(espnClipKind(apiPayload("7", { tracking: { coverageType: "Analysis" } }), "7"), "Analysis");
  assert.equal(espnClipKind(apiPayload("7"), "7"), "");
  assert.equal(espnClipKind(apiPayload("7", { tracking: { coverageType: "Analysis" } }), "8"), "");
  assert.equal(espnClipKind(null, "7"), "");
});

test("attach: an Analysis clip leaves the feed, its kind is kept, and the next bake asks nothing", async () => {
  const state = { clips: {} };
  let asked = 0;
  const fetchClip = async (id) => { asked++; return apiPayload(id, { tracking: { coverageType: id === "50099411" ? "Analysis" : "OnePlay" } }); };
  const items = [feedItem("50099411"), feedItem("50099412")];
  const first = await attachEspnVideoClips(items, { on: true, off: false, prior: new Map(), state, fetchClip, sleep: noSleep });
  assert.deepEqual(first.items.map((i) => i.id), ["50099412"]);
  assert.equal(first.dropped, 1);
  assert.equal(state.clips["50099411"].kind, "Analysis");
  assert.equal(state.clips["50099412"].kind, "OnePlay");
  const second = await attachEspnVideoClips(items, { on: true, off: false, prior: new Map(first.items.map((i) => [i.id, i])), state, fetchClip, sleep: noSleep });
  assert.equal(second.requests, 0);
  assert.equal(asked, 2);
  assert.deepEqual(second.items.map((i) => i.id), ["50099412"]);
  assert.equal(second.items[0].videoUrl, mp4("c50099412"));
});

test("attach: a dropped talk clip makes room for the next item under the limit", async () => {
  const state = { clips: { "21": { at: Date.now(), kind: "Interview" } } };
  const never = async () => { throw new Error("must not ask"); };
  const { items, dropped } = await attachEspnVideoClips(["20", "21", "22", "23"].map(feedItem), { on: false, off: false, prior: new Map(), state, fetchClip: never, limit: 2, sleep: noSleep });
  assert.equal(dropped, 1);
  assert.deepEqual(items.map((i) => i.id), ["20", "22"]);
});

test("attach: an old state entry without kind is asked once, then never again", async () => {
  const state = { clips: { "6": { at: Date.now(), url: mp4("c6"), sec: 30 } } };
  const prior = new Map([["6", { ...feedItem("6"), videoUrl: mp4("c6"), durationSec: 30 }]]);
  let asked = 0;
  const fetchClip = async (id) => { asked++; return apiPayload(id, { tracking: { coverageType: "Highlight" } }); };
  const first = await attachEspnVideoClips([feedItem("6")], { on: true, off: false, prior, state, fetchClip, sleep: noSleep });
  assert.equal(first.requests, 1);
  assert.equal(state.clips["6"].kind, "Highlight");
  assert.equal(first.items[0].videoUrl, mp4("c6"));
  const second = await attachEspnVideoClips([feedItem("6")], { on: true, off: false, prior: new Map(first.items.map((i) => [i.id, i])), state, fetchClip, sleep: noSleep });
  assert.equal(second.requests, 0);
  assert.equal(asked, 1);
});

test("attach: on=false asks nothing, carries an entry without kind, drops a known talk clip", async () => {
  const state = { clips: {
    "11": { at: Date.now(), url: mp4("c11") },
    "12": { at: Date.now(), url: mp4("c12"), kind: "PressConference" },
    "13": { at: Date.now(), kind: "" },
  } };
  const never = async () => { throw new Error("must not ask"); };
  const { items, requests, dropped } = await attachEspnVideoClips(["11", "12", "13"].map(feedItem), { on: false, off: false, prior: new Map(), state, fetchClip: never, sleep: noSleep });
  assert.equal(requests, 0);
  assert.equal(dropped, 1);
  assert.deepEqual(items.map((i) => [i.id, i.videoUrl]), [["11", mp4("c11")], ["13", undefined]]);
});

test("attach: off drops every carried clip; GitHub Actions (on=false) carries but never asks", async () => {
  const prior = new Map([["9", { ...feedItem("9"), videoUrl: mp4("c9") }]]);
  const withUrl = [{ ...feedItem("9"), videoUrl: mp4("c9") }, feedItem("10")];
  const never = async () => { throw new Error("must not ask"); };
  const off = await attachEspnVideoClips(withUrl, { on: false, off: true, prior, state: { clips: {} }, fetchClip: never, sleep: noSleep });
  assert.deepEqual(off.items.map((i) => i.videoUrl), [undefined, undefined]);
  const gha = await attachEspnVideoClips(withUrl, { on: false, off: false, prior, state: { clips: {} }, fetchClip: never, sleep: noSleep });
  assert.equal(gha.requests, 0);
  assert.deepEqual(gha.items.map((i) => i.videoUrl), [mp4("c9"), undefined]);
});

test("attach: a failed request is not remembered, a carried non-akamaized URL is dropped", async () => {
  const state = { clips: {} };
  const prior = new Map([["5", { ...feedItem("5"), videoUrl: "https://evil.example.com/x.mp4" }]]);
  const { items, requests } = await attachEspnVideoClips([feedItem("5")], { on: true, off: false, prior, state, fetchClip: async () => null, sleep: noSleep });
  assert.equal(requests, 1);
  assert.equal(items[0].videoUrl, undefined);
  assert.deepEqual(state.clips, {});
});

test("attach: a oneFeed clip set keeps its own mp4 + clips and costs no request, even when off", async () => {
  let asked = 0;
  const fetchClip = async () => { asked++; return null; };
  const set = { ...feedItem("50122460"), feedClip: true, videoUrl: mp4("c50122460"), durationSec: 77, clips: [{ id: "50122460" }, { id: "50122461" }] };
  for (const flags of [{ on: true, off: false }, { on: false, off: true }]) {
    const { items, requests } = await attachEspnVideoClips([set], { ...flags, prior: new Map(), state: { clips: {} }, fetchClip, sleep: noSleep });
    assert.equal(requests, 0);
    assert.equal(items[0].videoUrl, mp4("c50122460"));
    assert.equal(items[0].clips.length, 2);
  }
  assert.equal(asked, 0);
});

test("attach: the clip API's publish time fills an item that had none (ICYMI)", async () => {
  const state = { clips: {} };
  const fetchClip = async (id) => apiPayload(id, { originalPublishDate: "2026-10-05T23:42:00Z" });
  const icymi = { ...feedItem("50113065"), published: "" };
  const { items } = await attachEspnVideoClips([icymi], { on: true, off: false, prior: new Map(), state, fetchClip, sleep: noSleep });
  assert.equal(items[0].published, "2026-10-05T23:42:00Z");
  assert.equal(state.clips["50113065"].pub, "2026-10-05T23:42:00Z");
});
