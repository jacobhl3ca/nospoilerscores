import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "leave it late"/"left it late" is the stock late-decider idiom recaps reach for
// when a side gets the winner or equaliser at the death — "Liverpool leave it late
// to sink Fulham", "United leave it late", "Spurs left it late at the Emirates".
// Leaving it late IS getting the decisive result late, yet on its own it carries no
// digits for SCORE_RX and matched none of the existing buzzer-beater/last-gasp
// keywords, so a bare "… leave it late" leaked. It joins the dramatic-finish family.
test("a 'leave it late/left it late' late-decider reveal never reads as a clean title", () => {
  for (const title of [
    "Liverpool leave it late to sink Fulham | Highlights",
    "United leave it late",
    "Spurs left it late at the Emirates",
    "City leaving it late again in the derby",
    "Barcelona leaves it late in the Clasico",
    "Leave-it-late winner stuns the champions",
  ]) {
    assert.equal(isScoreSpoiler(title), true, title);
  }
});

// The "it late" adjacency plus the closing "late\b" keep the benign senses visible:
// "later" keeps going past the boundary, and the leave/left inflections don't fire
// on unrelated "leave" mentions. None of these is a per-match result reveal.
test("benign 'leave'/'late' phrasings stay visible", () => {
  for (const title of [
    "Star striker to leave the club this summer",
    "Manager granted leave of absence",
    "Why you shouldn't leave it later than kickoff to tune in",
  ]) {
    assert.equal(isScoreSpoiler(title), false, title);
  }
});
