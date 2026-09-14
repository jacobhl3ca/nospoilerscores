import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "leapfrog" is the standings-mover sibling of the already-masked "top of the table" idiom: a
// result that vaults a side above a named rival is reported as "X leapfrog Y". It names a
// completed result (the win that jumped them ahead), yet carries no digits for SCORE_RX and
// matched none of the win/lead keywords, so a recap written this way leaked the result before.
test("a 'leapfrog' standings-overtake reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal leapfrog Spurs into the top four",
    "Leeds leapfrogged Norwich | Championship Highlights",
    "City leapfrogging their title rivals",
    "Rovers leapfrogs Wolves in the table",
    "Napoli leapfrog Inter at the summit",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The token is anchored to the full "leapfrog" stem, so the everyday "leap"/"leaps"/"leaping" of a
// jump — which shares no stem — must still pass through untouched, as must ordinary preview and
// compilation titles that name no result at all.
test("plain 'leap' words and non-result titles are not over-hidden", () => {
  for (const title of [
    "Keeper leaps to tip it over | Save of the week",
    "Wonder-kid leaping into the first team: profile",
    "How to watch tonight's match",
    "Top 10 goals of the season compilation",
    "Match preview: what to look out for",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
