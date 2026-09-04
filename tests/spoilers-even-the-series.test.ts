import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "even/level/square/tie/knot the series" is the series-EQUALISER idiom NBA/NHL/MLB
// playoff recaps lead with when the trailing side wins a game to draw a best-of-seven
// back level: "Bruins even the series", "Heat level the series", "Rays knot the
// series". Drawing the series level means that game was won — a decisive reveal — yet
// on its own it carries no digits for SCORE_RX (the "… at 2-2" scoreline is what
// SCORE_RX catches) and matched no existing keyword, so a bare "… even the series"
// leaked. It joins the series-CLINCH ("close out the series") and series-DECIDER
// ("settle the series") idioms as the series-tying twin.
test("a 'X the series' equaliser reveal never reads as a clean title", () => {
  for (const title of [
    "Bruins even the series | NHL Highlights",
    "Heat level the series in Boston",
    "Rays knot the series at Fenway",
    "Oilers square the series with a Game 4 win",
    "Knicks evened the series on the road",
    "Stars leveled the series",
    "Jazz squared the series in Denver",
    "Red Sox tied the series",
    "Panthers even up the series",
    "Preds knotting the series",
    "Warriors levelling the series",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the fixed "<verb> (up) the series" frame — each verb has to
// immediately govern "the series" — so the everyday senses of these very common verbs
// ("even the odds", "level the playing field", "tie the knot") pass through untouched,
// as do previews and non-result mentions of a series.
test("ordinary uses of even/level/square/tie/knot are not over-hidden", () => {
  for (const title of [
    "How to watch the series opener this weekend",
    "The series continues Thursday in Miami | Preview",
    "Even keel: the series that defined a decade",
    "Underdogs look to even the odds before the game",
    "New rules aim to level the playing field",
    "Star couple tie the knot in the offseason",
    "Best-of-seven series preview and predictions",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
