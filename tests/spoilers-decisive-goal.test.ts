import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "decisive" match-deciding score: "the decisive goal", "scores the decisive penalty", "a decisive
// strike". It names the score that settled the match — a result reveal as plain as the already-masked
// "winner" / "matchwinner" / "game-winning" family — but "decisive" was the one such synonym no branch
// caught, and the phrases carry no digits for SCORE_RX. Byte-identical token in the worker
// (public/_worker.js), so the client un-mask call and the server pre-skip agree.
test("a 'decisive' match-deciding score reveal never reads as a clean title", () => {
  for (const title of [
    "The decisive goal came in stoppage time",
    "Kane scores the decisive penalty",
    "A decisive strike from Salah",
    "The decisive touchdown late in the fourth",
    "Chelsea grab the decisive goal",
    "The decisive score sealed it",
    "A decisive penalty settles the derby",
    "The decisive try in the corner",
    "The decisive basket with seconds left",
    "A decisive bucket down the stretch",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The scoring noun is mandatory: bare "decisive" is a common non-result word (action, week, leadership,
// factor), and the vaguer scoring-ish words (run of form, blow, breakthrough) are deliberately left out,
// so none of these previews or off-field notes should be masked by this alternative.
test("non-scoring uses of 'decisive' stay visible", () => {
  for (const title of [
    "Coach calls for decisive action after slow start",
    "A decisive week looms in the title race",
    "Manager decisive in the transfer market",
    "The decisive factor will be fitness",
    "Referee praised for a decisive intervention",
    "Fans want decisive moves this window",
    "The board takes a decisive stance",
    "A decisive moment approaches for the franchise",
    "Villa on a decisive run of fixtures",
    "A decisive blow to their playoff hopes off the field",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hid: ${title}`);
  }
});
