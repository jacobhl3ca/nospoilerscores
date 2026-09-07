import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "<verb> (to the) top of the <table/league/…>" is the standings-mover reveal: a result that
// lifts a side to first place is the everyday way a football recap reports the win without a
// scoreline — "Arsenal go top of the table", "Liverpool move to the top of the Premier League",
// "Leeds storm to the top of the Championship", "Napoli sit top of the league". Each names a
// completed result (the win that took them there, or the standings that already reflect prior
// wins), yet none carries digits for SCORE_RX and none trips the win/lead keywords: "leads?"/
// "leaders?" fire only on those exact words, never on "top of the table".
test("a 'go top of the table' standings reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal go top of the table with win over Chelsea",
    "Liverpool move to the top of the Premier League",
    "City climb to the top of the league",
    "Leeds storm to the top of the Championship",
    "Bayern go back to the top of the Bundesliga",
    "Inter move top of Serie A",
    "Spurs jump to the top of the standings",
    "Rangers return to the top of the table",
    "Napoli sit top of the league",
    "United rise to the top of the pile",
    "Ajax vault to the top of the Eredivisie",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to a movement/position verb sitting in front of "top of the …", which is
// what keeps the everyday preview use out: a "top of the table clash" billing or a "who will finish
// top of the table?" question has no such verb before the phrase and reveals no result, so it still
// passes through untouched (a false positive here would drop a legit preview or highlight, not
// merely keep a title masked). "finish" is deliberately not a mover verb — it fronts previews.
test("preview uses of 'top of the table' are not over-hidden", () => {
  for (const title of [
    "Top of the table clash preview: Arsenal vs City",
    "Who will finish top of the table this season?",
    "Top 10 goals of the season",
    "The top scorer race heats up",
    "How to watch: top-of-the-table showdown Saturday",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
