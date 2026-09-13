import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "shade it"/"shade the set" is the tennis/boxing/darts/snooker sibling of the
// "nick it"/"steal it" narrow-win idioms — the phrasing those recaps reach for
// constantly when a side edges a tight-margin result: "Djokovic shades it in
// five", "Fury shaded the early rounds", "Alcaraz shades the opener", "Selby
// shades the deciding frame". Shading it IS winning it, yet on its own it carries
// no digits for SCORE_RX (the "… 3-1"/"… in five sets" tally is what SCORE_RX
// catches) and matched none of the existing beat/win/nick/steal keywords, so a
// bare "… shades it" leaked.
test("a 'shade it/shade the set' narrow-win reveal never reads as a clean title", () => {
  for (const title of [
    "Djokovic shades it in five sets | Highlights",
    "Fury shaded the early rounds on the cards",
    "Alcaraz shades the opener in Paris",
    "Nadal shaded the contest in a thriller",
    "Selby shades the deciding frame",
    "Ronnie shades the decider at the Crucible",
    "Federer shades the first set",
    "Raducanu shading it in three sets",
    "Canelo shaded the middle rounds",
    "Wales shade the bout in a tight one",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause is pinned to the "shade" verb governing a trailing result object
// ("it", or "the/this/that <result noun>") so the everyday non-result senses of
// bare "shade" — a look ("shades of Messi"), a taunt ("throwing shade"), a
// dribble ("shade the defender"), literal shadow ("in the shade") — all stay
// visible, and a false positive here would drop a legit item from the worker's
// search results rather than merely mask a title.
test("look/taunt/dribble/shadow senses of 'shade' are not over-hidden", () => {
  for (const title of [
    "Shades of Messi in that finish",
    "Throwing shade at the referee",
    "Playing in the shade at Wimbledon",
    "Shade the defender and cut inside",
    "A shaded visor for the bright sun",
    "Shades of green on the new kit",
    "How to watch the game tonight",
    "Match preview and predictions",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
