import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "on penalties" (and the US "on penalty kicks") is the surface form of the
// penalty-shootout reveal this WC-heavy app sees most through the knockout
// rounds. A shootout only happens once a match is level after extra time, so
// the phrase alone reveals the game went the distance and was settled from the
// spot — the same partial-result leak as "shootout" — yet it carries no digits
// for SCORE_RX and, on its own, matched no existing verb, so a bare "… on
// penalties" recap leaked.
test("an 'on penalties' shootout reveal never reads as a clean title", () => {
  for (const title of [
    "Croatia go through on penalties",
    "Heartbreak for Spain on penalties",
    "Netherlands beaten on penalties after 1-1 draw",
    "USA advance on penalties | World Cup Highlights",
    "Chelsea edged it on penalties in the Carabao Cup final",
    "Argentina prevail on penalty kicks",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the mandatory leading "on ", so a single in-game
// spot-kick — the ordinary meaning of "penalty" in a title — passes through
// untouched, and the leading \b keeps it clear of words that merely end in
// "on" ("iron", "Lyon").
test("an ordinary in-game penalty is not over-hidden", () => {
  for (const title of [
    "Messi penalty in the first half",
    "Two penalties awarded in a wild opening 20 minutes",
    "VAR overturns a penalty appeal",
    "Ronaldo misses from the spot",
    "Iron will from the back line all night",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
