import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "take care of business" is the US-sports idiom for winning the game you were
// supposed to win — a staple of NBA/NFL/MLB recap titles ("Celtics take care of
// business in Game 2", "Chiefs took care of business against the Broncos"). In a
// match title it always names the side that came away with the win, yet it carries
// no digits for SCORE_RX and matched no existing keyword, so a highlight title
// written this way slipped past the mask. The fixed "care of business" tail is
// what makes it a spoiler and keeps a bare "take care" (e.g. "take care of the
// ball") safe.
test("a 'take care of business' win reveal never reads as a clean title", () => {
  for (const title of [
    "Celtics take care of business in Game 2 | NBA Highlights",
    "Chiefs took care of business against the Broncos",
    "Dodgers taking care of business to close the series",
    "United take care of business at Old Trafford",
    "Warriors takes care of business on the road",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The "care of business" tail keeps the everyday, no-result senses visible: a
// bare "take care" of the ball/possession reveals no outcome, and a preview with
// no result noun is not over-hidden by this entry.
test("ordinary uses of 'take care' are not over-hidden by this entry", () => {
  for (const title of [
    "How the point guard learned to take care of the ball",
    "Coach on why his team must take care in transition",
    "Take care of yourself: an athlete's guide to recovery",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
