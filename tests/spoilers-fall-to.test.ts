import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "fall(s)/fell to <opponent>" is the everyday US-headline form for a defeat, and the
// losing-side sibling of the "fall short" idiom next to it: "Lakers fall to Celtics",
// "Djokovic falls to Alcaraz", "Rockies fall to the Dodgers again". It names the loser —
// and therefore the winner — every time, yet on its own it carries no scoreline for
// SCORE_RX and matched none of the beat/defeat/loss keywords (the sibling "fall short"
// needs the "short" tail this form lacks), so a plain losing-side recap written this way
// slipped past the mask.
test("a 'fall to <opponent>' loss reveal never reads as a clean title", () => {
  for (const title of [
    "Lakers fall to Celtics | NBA Highlights",
    "Jets fall to Patriots in overtime thriller",
    "Djokovic falls to Alcaraz in five sets",
    "Rockies fall to the Dodgers again",
    "Spain fell to Germany in the semifinal",
    "Heat fall to the Nuggets in Game 5",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is gated behind a negative lookahead so the everyday physical-collapse
// senses of "fall to" — which reveal no result and turn up constantly in highlight
// titles — still pass through untouched (a false positive here would drop a legit video
// from the worker's search results, not merely keep a title masked).
test("physical 'fall to …' idioms are not over-hidden", () => {
  for (const title of [
    "Player falls to his knees in emotional tribute",
    "Team falls to pieces in the second half",
    "Keeper fell to the ground clutching his leg",
    "Boxer falls to the canvas after the bell",
    "Fans fall to their feet as the whistle blows",
    "Every point-blank save of the season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
