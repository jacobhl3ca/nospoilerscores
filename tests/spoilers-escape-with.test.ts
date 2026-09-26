import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "escape with a win/draw/point" is the narrow-escape sibling of "grab a point",
// "salvage", and "sees out a win": a side that escapes with a result got out of the
// game with it intact, so the title names the outcome even though no digits give
// SCORE_RX a hook and no other keyword fires — the result leaked before this branch.
test("an 'escape with a result' reveal never reads as a clean title", () => {
  for (const title of [
    "Chelsea escape with a point at Anfield",
    "Rangers escape with a draw against Celtic",
    "Bruins escaped with a win in overtime",
    "United escape with a scrappy draw",
    "Arsenal escapes with victory",
    "Dodgers escape with a series-clinching win",
    "Nets escape with the result they needed",
    "Spurs escaped with a narrow win",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The branch is gated on a result noun (win/victory/draw/point(s)/result) directly
// after "escape with", so the non-result senses that dominate "escape" usage outside
// a scoreline — escaping with your life, with injuries, with a warning, with time to
// spare — must still pass through untouched.
test("non-result 'escape with' idioms are not over-hidden", () => {
  for (const title of [
    "Fans escape with their lives after stadium scare",
    "Driver escapes with minor injuries in crash",
    "Player escapes with a warning from the referee",
    "Team escapes with minutes to spare before kickoff",
    "How to watch: can City escape Anfield unbeaten?",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
