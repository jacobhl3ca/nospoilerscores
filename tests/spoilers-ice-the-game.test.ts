import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "ice the game/win" is the North-American seal-the-win idiom NBA/NHL recaps lead with
// when a side closes a game out late — the free-throw, empty-net or clock-killing move
// that settles the result: "Curry ices the game from the line", "Empty-netter ices the
// win for Boston", "Reaves iced the contest". Icing the game IS winning it outright, yet
// on its own it carries no digits for SCORE_RX (the "… 4-2"/"… by 10" tally is what
// SCORE_RX catches) and matched none of the existing beat/win/seal keywords, so a bare
// "… ices the game" leaked. It joins "put the game to bed"/"put it beyond doubt" as the
// closeout twin.
test("an 'ice the game/win' closeout reveal never reads as a clean title", () => {
  for (const title of [
    "Curry ices the game with free throws | NBA Highlights",
    "Lillard iced the game late in Portland",
    "Chiefs ice the game in the fourth quarter",
    "Empty-netter ices the win for Boston",
    "Doncic icing the game from the line",
    "Rangers ice the match at the Garden",
    "Reaves ices the contest with a steal",
    "Late three ices the victory for Denver",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the "ice" verb governing a result noun (game/match/win/
// victory/contest/result), with a \b so the "ice" buried inside prices/voices/services
// can't fire and a negative lookbehind dropping the literal-ice framings ("on the ice the
// game", "hits the ice") — so the recovery, rink, weather and hockey-surface senses all
// stay visible, and a false positive here would drop a legit item from the worker's
// search results rather than merely mask a title.
test("literal-ice and recovery uses are not over-hidden", () => {
  for (const title of [
    "Back on the ice the game felt faster",
    "Ice hockey game preview tonight",
    "Ice the injury and rest for a week",
    "Called for icing the puck late",
    "Ice bath before the game",
    "Ice-cold shooting in the first half",
    "The ice rink reopens for the season",
    "Iceland game preview and predictions",
    "How to watch the game tonight",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
