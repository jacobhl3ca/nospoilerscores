import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "storm past" is the forceful-run member of the comfortable-win "X past Y" family
// (ease/power/breeze/coast/sail/stroll/glide/waltz/roll past): a side that STORMS
// past its opponent won, and often emphatically. Soccer, motorsport and NBA recap
// titles reach for it — "Chiefs storm past the Raiders", "Verstappen stormed past
// Hamilton for the lead", "City storm past Spurs" — each naming the beaten side, yet
// it carries no digits (SCORE_RX misses it) and, though "storm" is already trusted
// in the regex's "storm to the title" and "storm into the next round" idioms, it was
// the one comfortable-win verb missing from the "past" cluster.
test("a 'storm past' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Chiefs storm past the Raiders in AFC West clash",
    "Verstappen stormed past Hamilton for the lead",
    "City storm past Spurs at the Etihad",
    "Alcaraz storms past Sinner in straight sets",
    "Warriors storm past the Suns",
    "Liverpool stormed past Everton in the derby",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb is anchored to the mandatory trailing "past" — exactly like its
// breeze/coast/waltz siblings — so the bare "storm" senses never fire: a weather
// storm, the "perfect storm" idiom, a "Seattle Storm sign…" roster note and a
// forward-looking preview all pass through untouched.
test("bare 'storm' uses and look-aheads are not over-hidden", () => {
  for (const title of [
    "Storm brewing over the league's TV deal",
    "The perfect storm that shaped the offseason",
    "Seattle Storm sign a veteran guard for the playoff push",
    "Storm warning postpones the outdoor fixture",
    "Preview: can the Chiefs weather the storm on the road?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
