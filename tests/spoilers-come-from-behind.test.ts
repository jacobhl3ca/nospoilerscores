import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "come from behind" / "come from N goals|sets down" is one of the oldest comeback-reveal
// members, but its conjugation set was incomplete: the literal "behind" branch carried only
// bare "come" and the "…down" branch carried come|came — so the past tense every recap title
// leans on ("came from behind to level") and the American present ("comes from behind") both
// slipped through the "behind" branch, and the "…down" branch missed "comes from two goals
// down" for the same reason. Each reveals the same score-state leak "comeback" already hides —
// a side was behind and rallied — so completing the come/comes/came conjugation closes the gap.
test("a 'come/comes/came from behind (or from N down)' comeback reveal never reads as a clean title", () => {
  for (const title of [
    "Chelsea come from behind to level at Stamford Bridge",
    "Chelsea comes from behind to snatch a point",
    "Chelsea came from behind to draw at the Bridge",
    "Alcaraz comes from two sets down",
    "Alcaraz came from two sets down to advance",
    "Liverpool come from two goals down",
    "Liverpool comes from two goals down at Anfield",
    "United came from a goal down after the break",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to the "behind"/"…down" tail, so the everyday "the X comes from Y"
// construction — where "comes from" merely attributes a source and no comeback is implied —
// still passes through untouched (a false positive here would drop a legit item from the
// worker's search results, not merely keep a title masked).
test("non-result 'comes from' (source attribution) reports are not over-hidden", () => {
  for (const title of [
    "Where the best goals come from",
    "This save comes from years of training",
    "The captain's leadership comes from experience",
    "A look at where the pressure comes from",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
