import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "break of serve" is tennis's defining result tell: a set is decided by breaks,
// so "Alcaraz breaks serve in the third", "a decisive break of serve" or
// "Swiatek broke Gauff's serve twice" each reveal who took control. On its own
// the phrase carries no digits for SCORE_RX (the "… 6-4"/"… in three sets" tally
// is what SCORE_RX catches) and matched none of the existing win keywords, so a
// bare break recap leaked. Both the verb form ("breaks/breaking/broke … serve",
// with an optional back/the/possessive slot) and the noun form ("break(s) of
// serve") are covered.
test("a 'break of serve' reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz breaks serve in the third set | Highlights",
    "Djokovic breaks Sinner's serve to love",
    "Swiatek broke Gauff’s serve twice in the decider",
    "Nadal broke serve immediately in Paris",
    "A decisive break of serve settles it",
    "Two breaks of serve in the opening set",
    "Sabalenka breaking serve at 5-4",
    "Medvedev breaks back serve straight away",
    "Raducanu breaks the serve and consolidates",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clauses are pinned to the object "serve", which fixes the tennis sense: a
// bare "break" is a rain break, a break in play, a lunch break — none reach
// "serve" — and the leading \b keeps "outbreak serves warning" out. "Held serve"
// is deliberately left visible: holding serve is the neutral, expected outcome
// and reveals no result.
test("neutral or non-tennis senses of 'break'/'serve' are not over-hidden", () => {
  for (const title of [
    "Held serve throughout a tense opener",
    "On serve in the opening set",
    "Big serve from the Spaniard",
    "Took a break during the rain delay",
    "A break in play after the injury",
    "Flu outbreak serves warning to organisers",
    "How to watch the match tonight",
    "Match preview and predictions",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
