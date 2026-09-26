import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "outfight …" / "outfought …" completes the outXXX family (beside "outmuscle"/
// "outduel"/"outgun"): the won-the-physical-battle verb recaps reach for across
// soccer/NFL/combat. It names the winner outright ("Real Madrid outfought Barcelona")
// yet carries no scoreline for SCORE_RX. Every sibling stem is a bare \w*, but
// "fight/fought" is the one irregular past tense a \w* can't reach — so "outfought"
// slipped through and had to be listed literally alongside "outfight\w*".
test("an 'outfight' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Real Madrid outfought Barcelona for a point",
    "Chelsea outfight Arsenal in a scrappy affair",
    "Warriors outfighting Celtics down the stretch",
    "Usyk outfought Fury over 12 rounds",
    "Boks outfight the All Blacks up front",
    "Liverpool outfights Everton in the Merseyside derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "outfight"/"outfought" have no benign non-result sense, but guard against
// over-hiding the everyday "fight"/"fought" vocabulary the stems must NOT swallow.
test("ordinary 'fight' vocabulary is not over-hidden", () => {
  for (const title of [
    "How fighters prepare for a title bout",
    "The best combat-sports conditioning drills",
    "Fight card announced for next month",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
