import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "nick …" is the British narrow/late-win idiom, the sibling of "snatch": match
// reports reach for it constantly to say who took the result in a tight game. The
// bare forms "nick it", "nick a point" and "nick the points" name only who came out
// on top (or who salvaged a draw) yet carry no scoreline for SCORE_RX and matched no
// existing keyword, so a plain narrow-win recap written this way leaked. The pattern
// is pinned to a trailing result object, which is what makes it a result reveal.
test("a 'nick' narrow-win reveal never reads as a clean title", () => {
  for (const title of [
    "Spurs nick it late on | EPL Highlights",
    "Rangers nick the points at Ibrox",
    "Barcelona nick a point at the death",
    "United nick a late winner",
    "Chelsea nicked the win in stoppage time",
    "City nick the lead through Haaland",
    "Arsenal nicking it in the 95th minute",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "nick" is common as a name (Nick) and in the "in the nick of time" idiom, and it
// opens "nickel", so — unlike bare "snatch" — it is gated on the trailing result
// object. Those everyday senses must still pass through untouched.
test("ordinary uses of 'nick' are not over-hidden", () => {
  for (const title of [
    "Nick Foles' greatest games",
    "In the nick of time: the best last-gasp moments",
    "Nick Kyrgios trick shots compilation",
    "How Nick coaches the defensive line",
    "Nickel package explained",
    "St Nick's Day football fixtures",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
