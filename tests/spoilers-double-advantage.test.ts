import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "<verb> (their/the) advantage" is the sibling of the "leads?" keyword: a recap reports a second
// (or further) goal by saying a side "double/restore/extend/stretch/increase their advantage" —
// "Chelsea double their advantage", "Arsenal restore their advantage", "City extend their
// advantage". Each names a scoreline-moving result, yet none carries digits for SCORE_RX and
// "advantage" (unlike "lead") matched no keyword, so the reveal was leaking.
test("a '<verb> their advantage' scoreline reveal never reads as a clean title", () => {
  for (const title of [
    "Chelsea double their advantage",
    "Arsenal restore their advantage before half-time",
    "City extend their advantage at Anfield",
    "United stretch their advantage",
    "Liverpool increase their advantage late on",
    "Spurs doubled their advantage",
    "Rovers extend the advantage",
    "Salah restores the advantage for Liverpool",
    "Kane doubles his advantage in the tie",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to a scoring verb sitting directly before "(their/the) advantage", which
// keeps the everyday non-result sense out: "home advantage", "man advantage" (a power play), a
// preview question, or "make home advantage count" have no such verb-then-possessive in front of
// the bare word, so they still pass through untouched (a false positive here would drop a legit
// preview or highlight, not merely keep a title masked).
test("non-result uses of 'advantage' are not over-hidden", () => {
  for (const title of [
    "Making home advantage count on Saturday",
    "How to watch: home advantage in the playoffs",
    "Preview: who has the advantage?",
    "Home advantage could prove decisive",
    "City look to extend their man advantage on the power play",
    "The advantage of a midweek rest",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
