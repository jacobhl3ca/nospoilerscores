import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get past <opponent>" is the plainest member of the "X past Y" family — the
// neutral idiom every sport reaches for when one side simply beats another. It
// names the beaten opponent yet carries no hyphenated scoreline for SCORE_RX,
// and it slipped past every other member of the "ease/power/breeze/coast/
// stroll/waltz/roll/blow/battle/grind past" group before "get"/"gets"/
// "getting"/"got" was added to it.
test("a 'get past <opponent>' win reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal get past Spurs in the north London derby",
    "Alcaraz gets past Zverev in four sets",
    "Bayern got past Dortmund | Bundesliga Highlights",
    "Chiefs getting past the Bills to reach the AFC final",
    "Real Madrid get past Man City on penalties",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the mandatory trailing "past", so the hugely
// common bare "get"/"got"/"getting" pass through untouched, as do the existing
// "get the better of" / "get the job done" clauses that need their own trailing
// phrase.
test("ordinary uses of 'get' and 'got' are not over-hidden", () => {
  for (const title of [
    "Get well soon: star striker out for six weeks",
    "Rookie got the start against the defending champions",
    "Getting fit ahead of the new season",
    "How to get tickets for the derby",
    "Manager: we got the players we wanted this window",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
