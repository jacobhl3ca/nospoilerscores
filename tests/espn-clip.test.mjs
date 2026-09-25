import assert from "node:assert/strict";
import test from "node:test";

import { pickEspnGameClip, espnVideoMp4 } from "../scripts/lib/espn-clip.mjs";
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
