import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { collectOneFeedClips, dropClipIds } from "../scripts/lib/espn-onefeed-clips.mjs";

// Trimmed oneFeed (10/7): a Story with an Analysis clip, a module with two
// Media clips of a game with no block, and the Brewers–Padres game block with
// 6 videos (one PressConference, the recap listed second).
const feed = JSON.parse(readFileSync(new URL("./fixtures/onefeed-clips.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-10-07T12:00:00Z");

test("a game block becomes ONE clip set: talk dropped, recap first, ESPN order after", () => {
  const items = collectOneFeedClips(feed, NOW);
  const game = items.find((i) => i.gameId === "401908004");
  assert.ok(game, "the game set is there");
  assert.equal(game.clips.length, 5, "6 videos minus the PressConference");
  assert.deepEqual(game.clips.map((c) => c.id), ["50122460", "50122461", "50122309", "50122066", "50121898"]);
  assert.ok(!game.clips.some((c) => /Shildt/.test(c.headline)));
  assert.equal(items.filter((i) => i.gameId === "401908004").length, 1, "nested Media copies do not make a second card");
});

test("a set's card fields follow clip 1; published is the newest clip's", () => {
  const game = collectOneFeedClips(feed, NOW).find((i) => i.gameId === "401908004");
  assert.equal(game.id, "50122460");
  assert.equal(game.headline, game.clips[0].headline);
  assert.equal(game.videoUrl, game.clips[0].videoUrl);
  assert.equal(game.imageUrl, game.clips[0].imageUrl);
  assert.equal(game.articleUrl, "https://www.espn.com/video/clip?id=50122460");
  assert.equal(game.section, "MLB");
  assert.equal(game.published, "2026-10-07T05:16:25Z");
  assert.equal(game.feedClip, true);
  for (const c of game.clips) {
    assert.match(c.videoUrl, /^https:\/\/[a-z0-9.-]+\.akamaized\.net\/.+\.mp4$/);
    assert.ok(c.published, `clip ${c.id} has a publish time`);
    assert.ok(c.durationSec > 0);
  }
});

test("module clips with no game block are single cards under the module title", () => {
  const items = collectOneFeedClips(feed, NOW);
  const singles = items.filter((i) => !i.clips);
  assert.deepEqual(singles.map((i) => i.id), ["50121179", "50120760"]);
  for (const s of singles) assert.equal(s.section, "The air up there");
});

test("a Story's video and an Analysis Media clip never reach the card", () => {
  const ids = collectOneFeedClips(feed, NOW).flatMap((i) => [i.id, ...(i.clips ?? []).map((c) => c.id)]);
  assert.ok(!ids.includes("50116472"));
});

test("expired, premium and title-guarded clips drop out", () => {
  const later = Date.parse("2026-10-10T00:00:00Z");
  assert.equal(collectOneFeedClips(feed, later).length, 0, "every fixture clip expires 10/9");
  const noFreeman = collectOneFeedClips(feed, NOW, { titleOk: (t) => !/Freeman/.test(t) });
  assert.ok(!noFreeman.some((i) => i.id === "50120760"));
  const premium = structuredClone(feed);
  for (const v of premium.feed[2].data.event.videos) v.premium = true;
  for (const n of premium.feed[2].data.now[0].inlines) n.inlines[0].video[0].premium = true;
  assert.ok(!collectOneFeedClips(premium, NOW).some((i) => i.gameId === "401908004"));
});

test("dropClipIds: a clip shown as its own card leaves the set; a set of 1 becomes a plain clip", () => {
  const items = collectOneFeedClips(feed, NOW);
  const out = dropClipIds(items, new Set(["50122460"]));
  const game = out.find((i) => i.gameId === "401908004");
  assert.equal(game.id, "50122461");
  assert.equal(game.clips.length, 4);
  const one = dropClipIds(items, new Set(["50122460", "50122461", "50122309", "50122066"]))
    .find((i) => i.gameId === "401908004");
  assert.equal(one.id, "50121898");
  assert.equal(one.clips, undefined);
  assert.equal(one.videoUrl.endsWith(".mp4"), true);
});
