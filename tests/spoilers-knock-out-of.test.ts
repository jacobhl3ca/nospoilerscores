import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The knockout-elimination family already catches the forms where the verb sits right
// beside "out" — "dumped out", "crashed out", "bundled out", "knock out Germany". But
// the everyday ACTIVE phrasing names the eliminated side between the verb and "out"
// ("Arsenal knock Chelsea out of the Cup", "Alcaraz dumps Sinner out of the tournament"),
// which slipped past every one of them and carries no scoreline for SCORE_RX. It names
// the loser — and therefore the winner — every time, so a plain cup/playoff recap written
// this way leaked.
test("a transitive 'knock <side> out of <competition>' reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal knock Chelsea out of the Cup",
    "Spurs bundle United out of the FA Cup",
    "Alcaraz dumps Sinner out of the tournament",
    "Morocco knock Spain out of the World Cup",
    "Real Madrid boot City out of the Champions League",
    "Underdogs dump the holders out of the competition",
    "Wolves knock Liverpool out of the League Cup",
    "Spurs knock the Gunners out of the semis",
    "Chiefs knock the Bills out of the postseason",
    "Underdogs knock the favourites out of the quarter-finals",
    "Villa knock Spurs out of Europe",
    "Rookies dump the champions out of the play-offs",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is gated behind a following "out of <named competition/round>", so the
// everyday physical "knock X out of …" senses — which reveal no result and turn up in
// non-result and coaching titles — still pass through untouched. A false positive here
// would drop a legit video from the worker's search results, not merely keep a title
// masked, so the bare-"running"/"contention" idioms ("out of the running for MVP") are
// deliberately excluded too: those are preview talk, not a result.
test("physical / preview 'knock … out of …' phrasings are not over-hidden", () => {
  for (const title of [
    "How to knock the ball out of play every time",
    "Coach knocks the stuffing out of the home side",
    "Keeper knocks the wind out of their sails",
    "How defenders knock strikers out of their stride",
    "Who will knock whom out of the running for MVP",
    "Tips to knock shots out of the middle of the court",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
