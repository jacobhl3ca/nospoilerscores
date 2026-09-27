import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "surge past" is the momentum member of the comfortable-win "X past Y" family
// (ease/power/breeze/coast/sail/stroll/storm/glide/waltz/roll past): a side that
// SURGES past its opponent has overtaken and beaten them, and recap titles across
// soccer, motorsport and the American sports reach for it — "Chiefs surge past the
// Raiders", "Verstappen surged past Hamilton for the lead", "Barca surge past
// Sevilla" — each naming the beaten/overtaken side, yet it carries no digits (so
// SCORE_RX misses it) and, though "surge" is already trusted in the regex's "surge
// to the title" and "surge into the next round" idioms and its "surge …top of the
// table" clause, it was the one momentum verb missing from the "past" cluster.
test("a 'surge past' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Chiefs surge past the Raiders in AFC West clash",
    "Verstappen surged past Hamilton for the lead",
    "Barca surge past Sevilla in the title race",
    "Alcaraz surges past Sinner in straight sets",
    "Warriors surge past the Suns",
    "Liverpool surged past Everton in the derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb is anchored to the mandatory trailing "past" — exactly like its
// breeze/coast/storm/waltz siblings — so the bare "surge" senses never fire: a
// power surge, a surge in demand or prices, surge pricing and a forward-looking
// preview all pass through untouched.
test("bare 'surge' uses and look-aheads are not over-hidden", () => {
  for (const title of [
    "A power surge at the stadium delays the broadcast",
    "Ticket demand surge crashes the box office site",
    "Surge pricing hits fans travelling to the game",
    "A late surge in season-ticket sales for the club",
    "Preview: can the Chiefs surge in the standings this month?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
