import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "succumb(s)/succumbed to <opponent>" is the third member of the defeat-preposition
// family beside "fall to" and "go down to": the way a recap names the beaten side when
// it carries neither a scoreline nor a beat/loss keyword — "Newcastle succumb to
// Liverpool", "England succumbed to Australia", "Djokovic succumbs to Alcaraz". It names
// the loser — and therefore the winner — every time, so a plain losing-side recap
// written this way slipped past the mask.
test("a 'succumb to <opponent>' loss reveal never reads as a clean title", () => {
  for (const title of [
    "Newcastle succumb to Liverpool at Anfield",
    "England succumbed to Australia in the second Test",
    "Spurs succumb to Arsenal in the derby",
    "Djokovic succumbs to Alcaraz in five sets",
    "Wales succumbing to New Zealand in Cardiff",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is gated behind a negative lookahead so the everyday non-result "succumb to
// <ailment>" report — the injury / illness / pressure senses that turn up constantly in
// sports feeds — still passes through untouched (a false positive here would drop a legit
// item from the worker's search results, not merely keep a title masked).
test("non-result 'succumb to …' reports are not over-hidden", () => {
  for (const title of [
    "Star striker succumbs to injury before the final",
    "Veteran defender succumbs to a hamstring injury",
    "Winger succumbs to a knee problem in training",
    "Rider succumbs to the heat midway through the stage",
    "Rookie succumbs to nerves on his debut",
    "Club legend succumbs to illness aged 82",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
