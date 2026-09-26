import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A dominance/motion verb sprinting straight to a trophy noun — "storms to the
// title", "eases to the crown", "rolls to the championship", "marches to glory"
// — declares the champion outright. The already-covered title clauses were the
// deliberate wordings ("(re)claim the title", "wrap up the title", "lift the
// trophy"); this motion-verb shorthand carried no digits for SCORE_RX and hit
// none of them, so a plain "… storms to the title" recap leaked the winner.
test("a '<verb> to the title/crown' clincher never reads as a clean title", () => {
  for (const title of [
    "Aces storm to the title",
    "City march to the title",
    "Nadal powers to the title",
    "Djokovic surges to the crown",
    "Swiatek eases to the title",
    "Federer breezes to the crown",
    "Chiefs roll to the championship",
    "Real Madrid waltz to the title",
    "United march to glory",
    "Verstappen storms to the title | Race Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Anchored to the verb + "to (the) <trophy>" adjacency, with a lookahead that
// lets the preview collocations of "title" through — "title bout/fight/race/
// shot/showdown/decider" and the like are upcoming-event framing, not a result
// — and the bare verbs never fire on their own away from a trophy noun.
test("preview and ordinary 'to the title/…' wording is not over-hidden", () => {
  for (const title of [
    "The race to the title is wide open",
    "Preview: the road to the title bout",
    "Every title fight on the card",
    "Power to the people rally downtown",
    "Ease into your morning routine",
    "A refreshing sea breeze on the promenade",
    "Title race hots up as the season nears its end",
    "Severe thunderstorms expected tonight",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
