import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "turn the tables on" is the reversal twin of the already-masked "get one over on": to
// turn the tables on an opponent is to beat the side that beat you, the payback recap
// headlines lean on. In a match title "X turn the tables on Y" means nothing but X beating
// Y: it names the winner, yet it carries no digits for SCORE_RX and named no existing
// token, so a recap written this way leaked the result before.
test("a 'turn the tables on' reversal-win reveal never reads as a clean title", () => {
  for (const title of [
    "Celtics turn the tables on the Heat | Highlights",
    "France turned the tables on Argentina",
    "Arsenal turning the tables on Chelsea",
    "Hamilton turns the tables on Verstappen",
    "Real Madrid turn the tables on Barcelona in the Clasico",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the full four-word idiom with a mandatory trailing "on", which
// fixes the beat-an-opponent sense: the general figurative "turn the tables for …" (no "on")
// and the bare "table(s)" senses (league table, table tennis) must all stay visible.
test("figurative and bare 'table(s)' uses without the 'on' tail are not over-hidden", () => {
  for (const title of [
    "New rules turn the tables for small-market teams",
    "How the transfer window turns the tables in the title race",
    "Table tennis rules explained",
    "Where every club sits in the league table right now",
    "Top 10 turnarounds of the decade",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
