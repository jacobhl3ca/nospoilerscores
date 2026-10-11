import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFrontend, rewriteExternalUrl, spoilerSafeHref } from "../src/lib/frontendLinks.ts";

// Settings → Links (9/28): Reddit / YouTube links open on the user's own
// Redlib / Invidious instead of reddit.com / youtube.com.

const INV = "http://inv.test:3030";
const RED = "https://redlib.test";
const cfg = { reddit: RED, youtube: INV };

const cases: Array<[string, string, string]> = [
  ["watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", `${INV}/watch?v=dQw4w9WgXcQ`],
  ["m. watch", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", `${INV}/watch?v=dQw4w9WgXcQ`],
  ["music.", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1", `${INV}/watch?v=dQw4w9WgXcQ&list=PL1`],
  ["shorts", "https://youtube.com/shorts/dQw4w9WgXcQ", `${INV}/watch?v=dQw4w9WgXcQ`],
  ["live", "https://www.youtube.com/live/dQw4w9WgXcQ?si=x", `${INV}/watch?v=dQw4w9WgXcQ`],
  ["youtu.be keeps t=", "https://youtu.be/dQw4w9WgXcQ?t=42&si=abc", `${INV}/watch?v=dQw4w9WgXcQ&t=42`],
  ["search passes through", "https://www.youtube.com/results?search_query=mets+highlights", `${INV}/results?search_query=mets+highlights`],
  ["channel passes through", "https://www.youtube.com/@MLB/videos", `${INV}/@MLB/videos`],
  ["channel id", "https://www.youtube.com/channel/UCoLrcjPV5PbUrUyXq5mjc_A", `${INV}/channel/UCoLrcjPV5PbUrUyXq5mjc_A`],
  ["nss_* stripped", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&nss_strict=1&nss_channels=a,b&nss_race=x&nss_week=3", `${INV}/watch?v=dQw4w9WgXcQ`],
  ["nss_* stripped on search", "https://www.youtube.com/results?search_query=a&nss_strict=1&nss_comp=b", `${INV}/results?search_query=a`],
  ["reddit www", "https://www.reddit.com/r/nfl/comments/abc/title/?sort=top", `${RED}/r/nfl/comments/abc/title/?sort=top`],
  ["reddit old", "https://old.reddit.com/r/soccer/", `${RED}/r/soccer/`],
  ["reddit bare", "https://reddit.com/r/nba/comments/xyz/", `${RED}/r/nba/comments/xyz/`],
  ["redd.it short", "https://redd.it/1abcde", `${RED}/1abcde`],
];

for (const [name, input, want] of cases) {
  test(`rewrite: ${name}`, () => assert.equal(rewriteExternalUrl(input, cfg), want));
}

test("media, embed and TV hosts are never rewritten", () => {
  for (const url of [
    "https://i.redd.it/abc.jpg",
    "https://v.redd.it/abc/DASH_720.mp4",
    "https://preview.redd.it/abc.png?width=640",
    "https://tv.youtube.com/watch/abc",
    "https://www.youtube.com/iframe_api",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    "https://www.espn.com/nfl/story",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
  ]) assert.equal(rewriteExternalUrl(url, cfg), url);
});

test("no instance, a blank one, or an invalid one → the original URL", () => {
  const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&nss_strict=1";
  assert.equal(rewriteExternalUrl(yt, {}), yt);
  assert.equal(rewriteExternalUrl(yt, null), yt);
  assert.equal(rewriteExternalUrl(yt, { youtube: "" }), yt);
  assert.equal(rewriteExternalUrl(yt, { youtube: "inv.test" }), yt);
  assert.equal(rewriteExternalUrl(yt, { youtube: "javascript:alert(1)" }), yt);
  assert.equal(rewriteExternalUrl(yt, { youtube: "ftp://inv.test" }), yt);
  assert.equal(rewriteExternalUrl(yt, { youtube: "https://inv.test/?x=1" }), yt);
  // Only one side set: the other host is untouched.
  assert.equal(rewriteExternalUrl("https://reddit.com/r/nfl", { youtube: INV }), "https://reddit.com/r/nfl");
});

test("bad input never throws", () => {
  assert.equal(rewriteExternalUrl("", cfg), "");
  assert.equal(rewriteExternalUrl("not a url", cfg), "not a url");
  assert.equal(rewriteExternalUrl("raycast://x", cfg), "raycast://x");
});

test("instance: trailing slash trimmed, http allowed, a sub-path kept", () => {
  assert.equal(normalizeFrontend("https://redlib.test/"), "https://redlib.test");
  assert.equal(normalizeFrontend("  http://100.64.0.1:8380//  "), "http://100.64.0.1:8380");
  assert.equal(normalizeFrontend("https://home.test/invidious/"), "https://home.test/invidious");
  assert.equal(normalizeFrontend("https://user:pw@host.test"), null);
  assert.equal(normalizeFrontend("redlib.test"), null);
  assert.equal(
    rewriteExternalUrl("https://youtu.be/dQw4w9WgXcQ", { youtube: "https://home.test/invidious/" }),
    "https://home.test/invidious/watch?v=dQw4w9WgXcQ",
  );
});

// Jacob 10/10: a blurred headline was readable in the browser's status bar on
// hover, because a Reddit permalink and an ESPN story URL end in a slug of it.
const safe: Array<[string, string, string]> = [
  ["reddit post", "https://www.reddit.com/r/baseball/comments/1abc23/yankees_walk_it_off_in_the_9th/", "https://www.reddit.com/r/baseball/comments/1abc23/"],
  ["reddit post, no trailing slash, query kept", "https://old.reddit.com/r/nfl/comments/xyz9/chiefs_lose?sort=top", "https://old.reddit.com/r/nfl/comments/xyz9/?sort=top"],
  ["reddit comment keeps its id", "https://www.reddit.com/r/nba/comments/abc/lakers_win/k1x2y3/", "https://www.reddit.com/r/nba/comments/abc/_/k1x2y3/"],
  ["reddit post with no slug", "https://reddit.com/r/nba/comments/xyz/", "https://reddit.com/r/nba/comments/xyz/"],
  ["reddit sub page", "https://www.reddit.com/r/soccer/", "https://www.reddit.com/r/soccer/"],
  ["espn story", "https://www.espn.com/nfl/story/_/id/46512345/chiefs-beat-bills-overtime", "https://www.espn.com/nfl/story/_/id/46512345"],
  ["espn story, top level", "https://www.espn.com/story/_/id/123/who-won-the-world-series", "https://www.espn.com/story/_/id/123"],
  ["espn clip has no slug", "https://www.espn.com/video/clip/_/id/46512345", "https://www.espn.com/video/clip/_/id/46512345"],
  ["espn game page", "https://www.espn.com/mlb/recap/_/gameId/401581234", "https://www.espn.com/mlb/recap/_/gameId/401581234"],
  ["another site", "https://www.mlb.com/news/yankees-walk-off", "https://www.mlb.com/news/yankees-walk-off"],
  ["not a URL", "not a url", "not a url"],
];

for (const [name, input, expected] of safe) {
  test(`spoilerSafeHref: ${name}`, () => {
    assert.equal(spoilerSafeHref(input), expected);
  });
}

test("spoilerSafeHref: the stripped Reddit link still moves to the user's Redlib", () => {
  const stripped = spoilerSafeHref("https://www.reddit.com/r/baseball/comments/1abc23/yankees_walk_it_off/");
  assert.equal(rewriteExternalUrl(stripped, { reddit: RED }), `${RED}/r/baseball/comments/1abc23/`);
});
