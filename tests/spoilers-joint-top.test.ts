import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "joint top" variant of the standings-mover idiom: a result that leaves a side level on
// points at first place is reported as "X go joint top of the table". It names a completed
// result (the win that took them there) yet carries no scoreline for SCORE_RX and matched none
// of the win/lead keywords. The bare "top of the table" alternative anchored the movement verb
// DIRECTLY before "top", so the wedged-in "joint" slipped it and the result leaked. The optional
// "joint " now sits between the verb clause and "top of the <table/league/…>".
test("a 'joint top' standings reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal go joint top of the table",
    "Liverpool move joint top of the Premier League",
    "Spurs sit joint top of the league",
    "Leeds climb joint top of the Championship",
    "Napoli storm joint top of Serie A",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The plain outright-first form the idiom already caught must keep matching, and preview/billing
// uses that name the position without a preceding movement verb must still pass through untouched.
test("outright 'top of the table' still masks, and preview billings stay visible", () => {
  assert.equal(isScoreSpoiler("Arsenal go top of the table"), true);
  for (const title of [
    "Top of the table clash: Arsenal vs Liverpool",
    "Who will finish top of the table this season?",
    "Joint interview with both managers ahead of kickoff",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
