import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put it on ice" / "put the game on ice" is the North-American sealing idiom —
// the same result reveal the already-hidden "ice the game" clause catches, but
// in its far commoner "put … on ice" phrasing. A side that puts the game on ice
// has just secured the win in the closing moments; you cannot put it on ice and
// lose. Yet the existing ic(e) clause is anchored to the verb form ("iced the
// win") and its lookbehind deliberately blocks "on ice" (so a literal hockey
// "game on ice" stays visible), so these leaked. This branch pins "on ice" to a
// preceding put + a result object ("it", or the/this/that/their [word]
// game/match/tie/contest/result/series/win/victory/lead), so the sealing sense
// hides while literal "on ice" titles do not.
test("a 'put it on ice' sealing reveal never reads as a clean title", () => {
  for (const title of [
    "Curry puts it on ice with a dagger three",
    "Chiefs put the game on ice late | NFL Highlights",
    "Warriors put it on ice in the fourth quarter",
    "Late free throws put the game on ice",
    "Dodgers put the win on ice",
    "United put the tie on ice at Old Trafford",
    "A stunning goal puts the match on ice",
    "Putting the series on ice in Game 5",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The branch requires put + a result object right before "on ice", so the
// literal chill-it and hockey-surface senses — which never take that frame —
// stay visible.
test("literal 'on ice' titles are not over-hidden", () => {
  for (const title of [
    "Put the champagne on ice for the celebration",
    "Best hockey game on ice this year",
    "Winter Classic: an outdoor game on ice",
    "Legends on ice: a night to remember",
    "Disney on Ice comes to town",
    "Extended highlights: matchweek 5",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
