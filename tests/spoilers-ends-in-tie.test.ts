import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "tie" is the NORTH-AMERICAN word for a drawn result — MLS, NWSL, NHL and the
// rare NFL recap say "tie" where every clause in the draw family says "draw"
// ("Sounders and Timbers play to a tie", "Revolution settle for a tie", "the
// match ends in a scoreless tie"). It reveals the outcome (level) every time,
// carries no scoreline for SCORE_RX, and slipped past the whole draw family
// because "draw"/"point"/"stalemate" were the only drawn-result nouns and bare
// "tie" is far too overloaded to be a keyword alone. The pattern is anchored to
// the same ends-in/play-to/settle-for verb frames the "draw" clauses use, with
// one optional describing word before the mandatory "tie" tail.
test("a 'tie' drawn-result reveal never reads as a clean title", () => {
  for (const title of [
    "The match ends in a tie",
    "Sounders and Timbers play to a tie",
    "Revolution settle for a tie",
    "Union and Crew played to a scoreless tie",
    "Rapids ended in a 1-1 tie",
    "Giants and Commanders finish in a tie",
    "Both sides settle for the tie",
    "The derby ends in a hard-fought tie",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// In soccer "tie" mostly names a FIXTURE ("cup tie", "first-leg tie"), and it is
// the stem of "tie-break"/"tiebreak" (a tennis tiebreak is not a draw), "tied",
// "tier" and the plural fixture "ties". None of those carries the
// ends-in/play-to/settle-for frame, and the tie(?![-\w]) tail keeps the hyphen/
// word-char forms out, so all must pass through untouched.
test("the fixture 'tie' and the tie-break/tier stems are not over-hidden", () => {
  for (const title of [
    "The first-leg tie is finely poised",
    "Set goes to a tie-break",
    "Match decided in a tiebreak",
    "How the playoff tie will be decided",
    "Alcaraz eyes another tier of greatness",
    "The draw for the quarter-final ties",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
