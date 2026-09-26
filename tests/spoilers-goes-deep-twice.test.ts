import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "goes/went deep" is the everyday baseball synonym for "homers", so a batter who "goes deep
// twice" hit two home runs — the exact multi-feat reveal the filter already masks for
// "homers twice"/"scores twice". It slipped through because the scoring-verb + count branch
// listed "homer" but not the "go(es)/going/went deep" idiom, so a "… goes deep twice" recap
// title was leaking. Added as a sibling verb in the same branch (both files, byte-identical).
test("a 'goes/went deep twice/thrice' home-run reveal never reads as a clean title", () => {
  for (const title of [
    "Aaron Judge goes deep twice vs the Red Sox | Highlights",
    "Ohtani goes deep twice",
    "Schwarber went deep twice at Citizens Bank Park",
    "Judge goes deep three times",
    "Soto goes deep thrice in a wild one",
    "Betts going deep twice powers the offense",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The match is anchored to the count word ("twice"/"thrice"/"three times") right after the
// "go(es)/went deep" idiom, so the plain advance-far-in-the-postseason sense of "go deep" —
// with no home-run count — must stay untouched.
test("a plain 'go deep' with no home-run count is not over-hidden", () => {
  for (const title of [
    "Can the Yankees go deep in October?",
    "Preview: how deep will they go this postseason",
    "Yankees look to go deep in the playoffs",
    "He goes deep into his bag of tricks",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
