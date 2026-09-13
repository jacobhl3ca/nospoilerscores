import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "glide past" is the smooth-motion member of the comfortable-win "X past Y" family
// (breeze/coast/waltz/stroll/roll past): a side that GLIDES past its opponent won
// comfortably. Tennis, motorsport and NBA recap titles reach for it — "Alcaraz
// glides past Sinner", "Verstappen glided past Hamilton for the lead", "Celtics
// glide past the Nets" — each naming the beaten side, yet it carries no digits
// (SCORE_RX misses it) and slipped past every verb already in the "past" cluster.
test("a 'glide past' comfortable-win reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz glides past Sinner | Highlights",
    "Verstappen glided past Hamilton for the lead",
    "Celtics glide past the Nets",
    "Djokovic glides past Medvedev in straight sets",
    "City glided past Spurs at the Etihad",
    "Warriors glide past the Suns",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb is anchored to the mandatory trailing "past" — exactly like its
// breeze/coast/waltz siblings — so the bare "glide" senses never fire: a "glide
// path", a hang-gliding clip, a glider feature all pass through untouched, and so
// do previews that merely look ahead to a fixture.
test("bare 'glide' uses and look-aheads are not over-hidden", () => {
  for (const title of [
    "On a glide path to the playoffs",
    "How gliders stay aloft — the physics of flight",
    "Hang gliding over the Alps | Travel",
    "Preview: can Alcaraz keep gliding through the draw?",
    "The best glider planes of 2026",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
