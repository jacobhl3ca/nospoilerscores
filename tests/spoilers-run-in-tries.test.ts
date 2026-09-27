import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "run in <n> tries" is rugby's standard recap phrasing for a side that ran up a
// dominant, high-scoring win ("Leinster run in six tries", "Saints ran in five
// tries"). A try is the sport's main scoring play, so the count is scoreline
// information — yet the lone number never pairs with a separator for SCORE_RX and
// no win/lead keyword fired on it, so a "… run in six tries" title leaked the
// result. Added as its own branch, tightly anchored as
// "(?:runs?|running|ran) in <number> tr(?:y|ies)" with a mandatory count between
// "run in" and "tries", so the season "run-in", "a good run in the cup" and a
// plain "long run in cold weather" all stay visible.
test("a 'run in <n> tries' rugby label never reads as a clean title", () => {
  for (const title of [
    "Leinster run in six tries",
    "Saints ran in five tries",
    "Bath running in three tries in the second half",
    "France run in eight tries",
    "Tigers run in 7 tries",
    "Ireland run in four tries to seal it",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

test("'run in' without a try count stays clean", () => {
  for (const title of [
    "The title run-in begins this weekend",
    "A good run in the cup for the underdogs",
    "England enjoy a strong run in the tournament",
    "He ran in from the wing", // no count, no "tries"
    "Wembley run-in to the final",
    "Long run in cold weather this weekend",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `false positive: ${title}`);
  }
});
