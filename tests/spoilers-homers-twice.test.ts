import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The multi-score idiom "<verb> twice/thrice/three times" already hid soccer recaps
// ("Salah scores twice", "Kane nets twice"), but baseball's own verb for it — "homer" —
// named no token, so "Ohtani homers twice" leaked while "Ohtani scores twice" was hidden.
// A player homering two-plus times IS the reveal (a big offensive night, and the box score
// with it), and it is the single most common two-run-plus MLB highlight headline, so the
// mask must hold across the tenses those titles actually use.
test("a <player> homers N times recap never reads as a clean title", () => {
  for (const title of [
    "Shohei Ohtani homers twice",
    "Aaron Judge homered twice vs Red Sox",
    "Judge homers three times in Yankees rout",
    "Ohtani homering twice powers the Dodgers",
    "Schwarber homers thrice",
    "Soto homers four times this week",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory count word (twice/thrice/three|four times) right after the verb is what keeps
// "homer" safe: the name "Homer", the poet, and the Simpsons sense never carry a tally in that
// exact slot, and a preview that only asks whether a homer might come stays visible.
test("the homers-N-times idiom does not swallow the name or a preview", () => {
  for (const title of [
    "Homer Simpson twice as funny this season",
    "The Homer at the museum reopens",
    "Preview: can Ohtani homer tonight?",
    "How to watch: Dodgers vs Padres",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
