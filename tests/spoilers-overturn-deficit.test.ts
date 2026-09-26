import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "overturn/overhaul/wipe out/erase the deficit" is the completed-comeback reveal —
// the trailing side reversing (or wiping out) a score/aggregate gap to win or level —
// the sibling of the already-covered "comeback"/"come from behind"/"claw…back". Staple
// soccer two-legged-tie and NBA framing ("Real Madrid overturn the deficit", "Warriors
// erase a 20-point deficit"), each revealing the same score-state leak: a side was
// behind and turned it around. Written without the literal "comeback"/"claw" and often
// without any digit for SCORE_RX (the two-leg "overturn the deficit" carries no number),
// so a title written this way stood unmasked before.
test("an 'overturn/erase the deficit' comeback reveal never reads as a clean title", () => {
  for (const title of [
    "Real Madrid overturn the deficit to reach the semis",
    "Barcelona overturn a two-goal deficit",
    "United overturned a 3-1 first-leg deficit",
    "City overhaul the aggregate deficit at the Etihad",
    "Warriors erase a 20-point deficit in the fourth",
    "Nuggets wipe out the deficit late",
    "Liverpool overturning the deficit at Anfield",
    "Chiefs overhaul the deficit in the final quarter",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The branch is anchored on the object "deficit", precisely so the result-free uses of
// these verbs — a VAR/refereeing "overturn", a "squad/roster overhaul" transfer story,
// "erase memories", a court "overturn the ruling" — pass through untouched.
test("VAR overturns, squad overhauls and other non-deficit uses are not over-hidden", () => {
  for (const title of [
    "VAR overturns the decision after review",
    "Referee overturns the penalty call",
    "United announce a summer squad overhaul",
    "A total roster overhaul is coming this window",
    "Arsenal erase memories of last season",
    "Club plans to overhaul its youth academy",
    "The court could overturn the ruling",
    "New manager to overhaul the coaching staff",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
