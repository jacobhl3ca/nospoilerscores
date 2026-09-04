import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "have/get the last laugh" is the ultimately-triumphed idiom underdog, cup and derby
// recaps reach for: "Wrexham have the last laugh at Wembley", "Chiefs get the last laugh
// over the Bills". In a per-match title it always reveals the game was won (and usually
// by whom), yet it carries no digits for SCORE_RX and matched no existing keyword — the
// sibling "(?:comes?|came) out on top" beside it is the same reveal in different words.
// The whole three-word "the last laugh" object, preceded by a have/get verb, is what
// makes it a spoiler.
test("a 'have/get the last laugh' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Wrexham have the last laugh at Wembley | FA Cup Highlights",
    "United had the last laugh in the Manchester derby",
    "Chiefs get the last laugh over the Bills",
    "Chelsea got the last laugh late on",
    "Rookie has the last laugh on his debut",
    "Underdogs having the last laugh in the cup",
    "Spurs getting the last laugh at the death",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the full "the last laugh" idiom preceded by a have/get verb,
// so the everyday senses of "laugh"/"last" — which appear in ordinary titles — must still
// pass through untouched.
test("ordinary uses of 'laugh' and 'last' are not over-hidden", () => {
  for (const title of [
    "Comedians share a laugh before kickoff | Behind the scenes",
    "A good laugh in the locker room ahead of the final",
    "Fans have a laugh at the mascot's antics",
    "The last dance for the veteran keeper this weekend | Preview",
    "Last chance for the Jets to reach the playoffs",
    "The last minute of the first half explained",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
