import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "pull clear" is the direct sibling of the already-caught "pull away": a car,
// rider, or side that "pulls clear" has opened a decisive gap on the field or up
// the table, so the phrase names the winner/leader every time. It carries no
// scoreline for SCORE_RX and, with only "pull away" in the family before, a bare
// "Verstappen pulls clear" recap leaked. The mandatory trailing "clear" is what
// keeps it pinned.
test("a 'pull clear' lead/win reveal never reads as a clean title", () => {
  for (const title of [
    "Verstappen pulls clear at the front | Race Highlights",
    "Pogačar pulls clear on the final climb",
    "Arsenal pull clear at the top of the table",
    "City pulled clear in the second half",
    "Rovers pulling clear of the chasing pack",
    "Liverpool pull-clear with a late goal",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory "clear" tail keeps it safe: the everyday non-result uses of the
// bare verb never read "pull clear", and "clearance" is excluded by the closing
// word boundary, so a spoiler-free title survives.
test("ordinary uses of 'pull'/'clear' are not over-hidden", () => {
  for (const title of [
    "How to watch Arsenal vs City tonight",
    "Pull quote: what the manager said before kickoff",
    "Defensive drills: how to make a clean clearance",
    "Preview: the keeper needs to pull off a big save",
    "A clear favourite? Breaking down the matchup",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
