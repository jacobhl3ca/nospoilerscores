import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "led/ahead/in front from start to finish" is the spelled-out sibling of the
// already-masked "wire[- ]to[- ]wire" racing idiom — the everyday way a recap
// says a side led flag-to-flag and never surrendered the front. The lead phrase
// carried no digit for SCORE_RX and fired no other keyword, so
// "Verstappen led from start to finish at Suzuka" leaked. The branch requires a
// lead/front/control word IMMEDIATELY before "from start to finish" (no filler),
// so the quality-review use of the phrase, which has no lead word
// ("a thrilling match from start to finish"), and lead-word idioms that put an
// object between the two ("ahead of the game...", "led the tributes...") stay
// visible.
test("a 'led ... from start to finish' label never reads as a clean title", () => {
  for (const title of [
    "Rovers led from start to finish",
    "United in front from start to finish",
    "Verstappen led from start to finish at Suzuka",
    "Scheffler ahead from start to finish",
    "Hamilton in control from start to finish",
    "City out front from start to finish",
    "Djokovic in the lead from start to finish",
    "Rovers led from start-to-finish",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

test("'from start to finish' as a quality/feature phrase stays clean", () => {
  for (const title of [
    "A thrilling match from start to finish",
    "Entertaining from start to finish",
    "Ahead of the game from start to finish",
    "Stay ahead of the curve from start to finish",
    "Club led the tributes from start to finish",
    "Leading the coverage from start to finish",
    "In control of the process from start to finish",
    "Everything you need to know from start to finish",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `false positive: ${title}`);
  }
});
