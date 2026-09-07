import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "pegged back" and "pull/grab one back" are the other half of the comeback reveal —
// the trailing side scoring to cut the deficit — the mirror of the already-covered
// "claw…back". They are the staple soccer/cricket framing for it ("Real Madrid pegged
// back by Barca", "United pull one back", "Chelsea grabbed another back"), each
// revealing the same score-state leak "claw back" already hides: a lead was cut and the
// game is closer than the neutral title lets on. None carries the literal "comeback"/
// "claw" nor any digit for SCORE_RX, so a title written this way stood unmasked before.
test("a 'pegged back' / 'pull one back' comeback reveal never reads as a clean title", () => {
  for (const title of [
    "Real Madrid pegged back by Barcelona | LaLiga",
    "City pegged back late on at the Etihad",
    "United peg back Chelsea to level it",
    "England pegged back to 2-2 by India",
    "United pull one back before half time",
    "Chelsea pulled one back at Stamford Bridge",
    "Arsenal pull a goal back in stoppage time",
    "Spurs grab one back late",
    "Liverpool grabbed another back to set up a finish",
    "Rooney pulling one back for United",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pull/grab branch is gated on the object "one"/"a goal"/"another" sitting before
// "back", precisely so the bare "pull back" cutback-cross idiom — an assist that reveals
// no result — and the ordinary uses of "peg"/"back" pass through untouched.
test("the cutback-cross idiom and ordinary 'peg'/'back' uses are not over-hidden", () => {
  for (const title of [
    "Great pull-back from Messi and a tap-in",
    "Guardiola pulls the ball back across goal",
    "Superb pullback and finish of the season",
    "Kane pulls it back for Son",
    "Round peg in a square hole: tactical breakdown",
    "Transfer fee pegged at 50 million",
    "The best peg-leg goal celebrations",
    "Defender pulls back the striker for a foul",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
