import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "straight sets" is the decisive-tennis (and volleyball) result descriptor the
// Grand Slam / ATP titles this app surfaces reach for constantly: a win in which
// the winner dropped no set. It reveals both that the match is over and that it
// was one-sided — the same partial-result leak as "shutout"/"clean sheet"/
// "sweep" for other sports — yet bare "straight sets" carries no digits for
// SCORE_RX and, without a co-occurring verb, matched no existing keyword, so a
// plain "… in straight sets" recap leaked.
test("a bare 'straight sets' tennis reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz eases through in straight sets",
    "Straight sets for Sabalenka | US Open Highlights",
    "Sinner into the final in straight sets",
    "A straight-sets masterclass at Wimbledon",
    "Italy win in straight sets over Poland", // volleyball
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the "straight" + "set(s)" adjacency, so the bare
// words never fire on their own — an ordinary "set piece", "two sets of ..." or
// "straightforward"/"straighten" all pass through untouched.
test("ordinary 'set'/'straight' wording is not over-hidden", () => {
  for (const title of [
    "Best set pieces of the season",
    "Two sets of twins in the same squad",
    "A straightforward afternoon for the groundstaff",
    "The players straighten up for the anthem",
    "Behind the scenes: setting up centre court",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
