import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "go/goes/going/went/gone down to <opponent>" is the British-headline twin of "fall to":
// the everyday football/rugby/cricket way a defeat is written the other side of the Atlantic —
// "Arsenal go down to Chelsea", "England went down to Australia", "Wales have gone down to New
// Zealand". Like "fall to" it names the loser (and therefore the winner) every time, yet on its
// own it carries no scoreline for SCORE_RX and matched none of the beat/defeat/loss keywords, so
// a plain losing-side recap written this way slipped past the mask.
test("a 'go down to <opponent>' loss reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal go down to Chelsea in a thriller",
    "England went down to Australia",
    "Spurs go down to Liverpool | Highlights",
    "Wales have gone down to New Zealand",
    "Rockies go down to the Dodgers again",
    "India go down to a heavy defeat",
    "Liverpool going down to defeat at Anfield",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is gated behind a negative lookahead so the everyday "down to" continuations that
// reveal no result still pass through untouched — the close-finish "down to the wire"/"the last
// (kick/day)", the physical "down to earth", and the injury "goes down to injury". A false
// positive here would drop a legit video from the worker's search results, not merely keep a title
// masked. ("come/comes/came down to" is left out entirely — it is the preview idiom, not a result.)
test("benign 'down to …' idioms are not over-hidden", () => {
  for (const title of [
    "This one could go down to the wire",
    "It all goes down to the last kick of the game",
    "Verstappen comes back down to earth after Monaco",
    "Star striker goes down to injury in the warmup",
    "It all comes down to the final day of the season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
