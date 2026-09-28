import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "brush past" is the sibling of the already-masked "brush aside": the same beat-easily
// framing in the "X past Y" construction the recap/highlight titles lean on. In a match
// title "X brush past Y" means nothing but X beating Y comfortably — it names the side that
// was swept away, yet it carries no digits for SCORE_RX and slipped past both the
// "brush …aside" pattern (the "aside" is mandatory there) and the "ease/glide/get past" verb
// group, so a recap written this way leaked the result before.
test("a 'brush past' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Man City brush past Brentford | Premier League Highlights",
    "Liverpool brushing past Everton",
    "Arsenal brushed past Fulham",
    "Real Madrid brush past Getafe",
    "Djokovic brushes past his opponent",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the mandatory "past" tail, so the bare "brush" senses that have
// nothing to do with a result must still pass through untouched.
test("bare 'brush' uses without the 'past' tail are not over-hidden", () => {
  for (const title of [
    "How to brush your teeth properly",
    "A brush with greatness: player profile",
    "Groundskeeper's brush keeps the clay pristine",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
