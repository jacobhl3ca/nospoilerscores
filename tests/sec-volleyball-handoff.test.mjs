import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { parseWatchPageOwner, parseWatchPagePlayable, parseEmbedPlayable } from "../scripts/lib/recaps.mjs";

const { sportChannelBlocksEmbeds, leadChannelBlocksEmbeds } = await createJiti(import.meta.url).import("../src/lib/youtube.ts");

// SEC volleyball, 2026-10-03. Its cuts refuse every embed (oEmbed 401,
// playableInEmbed false: 5 of 5) while its soccer cuts embed, and each
// volleyball cut's YouTube description opens with the result. The watch-page
// fields below are cut down from pWQrdkkKIiA's own page (read 2026-10-03);
// the decoy block is made up.

const watchPage = [
  // A recommended video's overlay block comes first on the page; never its title or owner.
  `"videoDetails":{"playerOverlayVideoDetailsRenderer":{"title":{"simpleText":"Top 10 Plays of Week 4"},"author":"Decoy"}}`,
  `"playabilityStatus":{"status":"OK","playableInEmbed":false,"miniplayer":{}}`,
  `"videoDetails":{"videoId":"pWQrdkkKIiA","title":"South Carolina Gamecocks vs. No. 16 Texas A\\u0026M Aggies | Match Highlights | 2026 SEC Volleyball","lengthSeconds":"154","channelId":"UC60q_WUDde_NK-ze3frvtiA","isOwnerViewing":false,"shortDescription":"No. 16 Texas A\\u0026M opened SEC play with a dominant sweep of South Carolina, winning 25-14, 25-14, 25-18 at Reed Arena behind a career night from Taryn Morris.\\n\\n...","isCrawlable":true,"thumbnail":{"thumbnails":[{"url":"https://i.ytimg.com/vi/pWQrdkkKIiA/default.jpg","width":120,"height":90}]},"allowRatings":true,"viewCount":"3050","author":"SEC","isPrivate":false}`,
  `"embedPreview":{"previewPlayabilityStatus\\":{\\"status\\":\\"OK\\",\\"playableInEmbed\\":false}}`,
].join(",");

test("the watch page names the upload's own title and owner", () => {
  assert.deepEqual(parseWatchPageOwner(watchPage), {
    title: "South Carolina Gamecocks vs. No. 16 Texas A&M Aggies | Match Highlights | 2026 SEC Volleyball",
    channelId: "UC60q_WUDde_NK-ze3frvtiA",
    author: "SEC",
  });
  // It plays on youtube.com, never embedded.
  assert.equal(parseWatchPagePlayable(watchPage), true);
  assert.equal(parseEmbedPlayable(watchPage), false);
});

test("a page with no videoDetails names no owner", () => {
  assert.equal(parseWatchPageOwner(""), null);
  assert.equal(parseWatchPageOwner("<html>google.com/sorry</html>"), null);
  assert.equal(parseWatchPageOwner(`"videoDetails":{"playerOverlayVideoDetailsRenderer":{"title":{"simpleText":"x"}}}`), null);
  // A block cut short before the owner.
  assert.equal(parseWatchPageOwner(`"videoDetails":{"videoId":"pWQrdkkKIiA","title":"x","lengthSeconds":"155"`), null);
});

test("only SEC volleyball opens on the hand-off; the SEC's soccer and every other volleyball channel embed", () => {
  assert.equal(sportChannelBlocksEmbeds("ncaavb", "SEC"), true);
  assert.equal(sportChannelBlocksEmbeds("ncaawsoc", "SEC"), false);
  assert.equal(sportChannelBlocksEmbeds("ncaamsoc", "SEC"), false);
  assert.equal(sportChannelBlocksEmbeds("ncaaf", "SEC"), false);
  for (const channel of ["ACC Digital Network", "Big 12 Conference", "Big Ten Volleyball", "Women's Sports on FOX"]) {
    assert.equal(sportChannelBlocksEmbeds("ncaavb", channel), false, channel);
  }
  assert.equal(sportChannelBlocksEmbeds("ncaavb", null), false);
  assert.equal(sportChannelBlocksEmbeds("ncaavb", undefined), false);
  // Not a whole-channel block: the SEC soccer cuts must keep playing in-app.
  assert.equal(leadChannelBlocksEmbeds(["SEC"]), false);
});
