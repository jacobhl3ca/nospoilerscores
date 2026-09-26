import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "spoil …party" clause already masked the upset-win idiom ("Leeds spoil the
// party", "Brighton spoil United's party"). But recap headlines lean on the SAME
// idiom aimed at a milestone occasion just as often — a losing side "spoils" the
// other team's/player's homecoming, return, debut, farewell, reunion or swansong:
// "Heat spoil LeBron's return", "Rangers spoil Crosby's homecoming". Each names a
// completed result (you only spoil the occasion by winning) yet carries no
// scoreline for SCORE_RX and matched none of the beat/advance keywords, so a title
// written this way leaked. The clause is anchored to the "spoil"-verb + a
// connector ("the"/"their"/a possessive) + one of the milestone-occasion nouns.
test("a 'spoil X's return/debut/homecoming/…' upset-win reveal never reads as a clean title", () => {
  for (const title of [
    // existing party sense — must still fire
    "Leeds spoil the party at Old Trafford",
    "Brighton spoil United's party",
    "Wrexham spoiled the party",
    "Villa spoilt their party",
    // the extended occasion senses
    "Heat spoil LeBron's return",
    "Rangers spoil Crosby's return to Pittsburgh",
    "Wrexham spoil the homecoming",
    "Arsenal spoil Mourinho's debut",
    "Rovers spoiling their debut",
    "City spoil Rooney's farewell",
    "Spurs spoiled the farewell",
    "Chiefs spoil the reunion",
    "United spoil Ronaldo's swansong",
    "Rovers spoil the swan song",
    "Bruins spoil Ovechkin's homecoming",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause needs the "spoil"-verb AND a connector AND one of the milestone nouns,
// so the bare occasion nouns and the everyday "spoiler"/"spoil" senses stay visible:
// a plain schedule/preview line, the app's own "spoiler-free" wording, and generic
// "spoil"s with no milestone noun must all pass through untouched.
test("bare occasion nouns and ordinary 'spoil' uses are not over-hidden", () => {
  for (const title of [
    "LeBron's return: what time and channel",
    "Preview: Ronaldo's debut for the club",
    "Spoiler-free highlights explained",
    "Spoiler alert: preview inside",
    "The party continues in Miami",
    "How to watch the homecoming game",
    "Spoil yourself with these game-day deals",
    "Return leg preview: what to watch for",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
