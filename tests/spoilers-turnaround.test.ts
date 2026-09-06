import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "complete/stage/mount/produce/orchestrate/pull off a turnaround" is the noun sibling
// of the "comeback" keyword: a recap phrased this way is reporting a came-from-behind
// result just as plainly as "comeback" does — the side named did the turning around, so
// it won from a losing position. The word itself was uncaught, so only the ones that
// happened to also carry "stunning"/"dramatic" (matched by the stun\w* keyword) were
// masked; a plainer "complete the turnaround" slipped through.
test("a 'complete/stage a turnaround' comeback reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal complete the turnaround at the Emirates",
    "United complete a stunning turnaround",
    "City stage a remarkable turnaround",
    "Chelsea staged a dramatic turnaround at the Bridge",
    "Liverpool mount an incredible turnaround",
    "Spurs pull off a turnaround",
    "Barca pulled off a stunning turnaround",
    "Rangers produce a second-half turnaround",
    "Dortmund orchestrate a memorable turnaround",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to those completion verbs, so the everyday scheduling sense of
// "turnaround" — the short rest between fixtures that shows up constantly in previews —
// still passes through untouched (a false positive here would drop a legit item from the
// worker's search results, not merely keep a title masked).
test("non-result 'turnaround' (rest between games) reports are not over-hidden", () => {
  for (const title of [
    "Chiefs face a quick turnaround before Thursday",
    "Short turnaround for the Lakers this week",
    "The turnaround time between games is brutal",
    "A quick turnaround awaits after the road trip",
    "How teams cope with a three-day turnaround",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
