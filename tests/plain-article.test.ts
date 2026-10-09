import assert from "node:assert/strict";
import test from "node:test";

import type { NewsItem } from "../src/lib/news.ts";
import { isPlainArticle } from "../src/lib/plainArticle.ts";

// A shown plain article opens the article, not the modal (Jacob 10/9).

const espn: NewsItem = {
  id: "1",
  headline: "Mets win",
  description: "",
  published: "2026-10-09T12:00:00Z",
  imageUrl: "https://a.espncdn.com/photo.jpg",
  articleUrl: "https://www.espn.com/mlb/story/_/id/1",
  byline: "",
  section: "MLB",
};

test("an ESPN headline with a thumb is a plain article", () => {
  assert.equal(isPlainArticle(espn), true);
  assert.equal(isPlainArticle({ ...espn, imageUrl: null }), true);
});

test("Reddit, clip, picture, gallery and body items are not", () => {
  assert.equal(isPlainArticle({ ...espn, section: "r/baseball" }), false);
  assert.equal(isPlainArticle({ ...espn, youtubeVideoId: "abc" }), false);
  assert.equal(isPlainArticle({ ...espn, playbackUrl: "https://x/m.m3u8" }), false);
  assert.equal(isPlainArticle({ ...espn, videoUrl: "https://v.redd.it/x" }), false);
  assert.equal(isPlainArticle({ ...espn, embedUrl: "https://players.brightcove.net/x" }), false);
  assert.equal(isPlainArticle({ ...espn, imageFullUrl: "https://i.redd.it/x.jpg" }), false);
  assert.equal(isPlainArticle({ ...espn, images: ["https://i.redd.it/a.jpg", "https://i.redd.it/b.jpg"] }), false);
  assert.equal(isPlainArticle({ ...espn, body: "selftext" }), false);
});

test("an empty picture set still counts as plain", () => {
  assert.equal(isPlainArticle({ ...espn, images: [] }), true);
});
