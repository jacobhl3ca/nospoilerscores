import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "bank the points" is the everyday win-side sibling of the existing
// "take|claim|grab|collect|pocket|scoop the points" family — the standard recap
// phrasing for a side that came away with all three points ("Arsenal bank the
// points at Anfield", "Rovers banked the points despite a late scare"). Standing
// alone it carries no digit for SCORE_RX and matched none of the win-family verbs,
// so a "… bank the points" title leaked the result. Added by dropping
// "bank(?:s|ed|ing)?" into that verb alternation, so it inherits the same
// "[- ]the[- ]points\b" anchor and cannot fire on "bank on youth", "bank holiday",
// or "bank record revenue".
test("a 'bank the points' win label never reads as a clean title", () => {
  for (const title of [
    "Arsenal bank the points at Anfield",
    "City bank the points in a nervy finish",
    "Rovers banked the points despite a late scare",
    "Wolves banking the points on the road",
    "United bank the points",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

test("'bank' in non-result contexts stays clean", () => {
  for (const title of [
    "Everton to bank on youth this season",
    "The bank holiday fixture list is out",
    "Club to bank record TV revenue",
    "How the points system works, explained",
    "West Bank derby preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `false positive: ${title}`);
  }
});
