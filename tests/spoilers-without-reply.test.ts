import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "<count> (goals) without reply" is the British soccer/rugby recap idiom for the same
// scoring-run reveal the already-keyworded "unanswered" catches, phrased the other way
// round: one side scored while the other never answered. It carries no standalone score
// for SCORE_RX (the digit sits inside "four without reply") and matched no existing
// keyword, so a bare "… without reply" recap leaked the result. The count (a digit or
// one–ten, optionally trailed by a scoring noun) is required immediately before
// "without (a) reply", mirroring how the "unanswered" branch is pinned.
test("a 'without reply' scoring-run reveal never reads as a clean title", () => {
  for (const title of [
    "City score four without reply",
    "Three goals without reply for Arsenal",
    "Spain net four without reply",
    "Liverpool hit five without reply",
    "Two tries without reply at Twickenham",
    "United score three without a reply",
    "Four goals without reply at the Emirates",
    "France run in three tries without reply",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The count anchor keeps the general-language "without (a) reply" senses — preceded by a
// noun or verb, never a bare score — passing through untouched, exactly like the sibling
// "unanswered questions"/"went unanswered" exemption.
test("ordinary 'without reply' uses are not over-hidden", () => {
  for (const title of [
    "Arsenal vs City: match preview and predictions",
    "Fans left without a reply from the club",
    "Ticket query goes without reply for weeks",
    "Manager's statement went without a reply",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
