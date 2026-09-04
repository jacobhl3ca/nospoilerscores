import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "the/a/their (league|domestic|season) double over <rival>" is the rivalry-
// double reveal football recaps reach for when a side beats the same opponent
// home and away — "Arsenal complete the double over Tottenham", "City do the
// league double over United". Completing the double means both meetings were
// won, yet the phrase carries no hyphenated score for SCORE_RX and — with
// "seal"/"clinch" already keyworded but "complete"/"do"/"get"/"record" not —
// the bare title leaked. The pattern is pinned to an article/possessive
// ("the"/"a"/"their") sitting immediately before "double over".
test("a 'the double over <rival>' rivalry-double reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal complete the double over Tottenham",
    "City do the league double over United",
    "Liverpool complete the double over Everton | Highlights",
    "United record the double over their rivals",
    "Chelsea complete a double over Arsenal this season",
    "Rangers finally get their double over Celtic",
    "Barcelona complete the domestic double over Real Madrid",
    "Napoli seal their season double over Juventus",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The frame needs an article/possessive immediately before "double over", so
// the everyday injury sense "doubled over" (past participle, no article) and
// the "double" senses that carry no leading article all stay visible.
test("everyday 'doubled over' / 'double' phrasings are not over-hidden", () => {
  for (const title of [
    "Star striker doubled over in pain after the tackle",
    "The whole bench doubled over laughing",
    "How to watch: double header this weekend",
    "Ranking every player, doubled over the years",
    "Double the excitement over the weekend",
    "Men's doubles final preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
