import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "take/took/drop the series" is the series-DECIDED idiom NBA/NHL/MLB playoff recaps
// lead with when a best-of-seven is won or lost outright: "Celtics take the series in
// six", "Nuggets took the series", "Yankees drop the series", "Astros dropped the
// series". Taking a series is winning it and dropping it is losing it — a decisive
// winner/loser reveal — yet on its own it carries no digits for SCORE_RX (the "… in
// six"/"… 4-2" tally is what SCORE_RX catches) and the "win"/"lose" keywords fire on
// those verbs but not on "take"/"took"/"drop", so a bare "… take the series" leaked. It
// joins the series-CLINCH ("close out the series"), series-EQUALISER ("even the series")
// and series-DECIDER ("force Game 7") idioms as the outright win/loss twin.
test("a 'take/drop the series' reveal never reads as a clean title", () => {
  for (const title of [
    "Celtics take the series | NBA Highlights",
    "Nuggets take the series in six games",
    "Heat took the series on the road",
    "Warriors taking the series to Denver in five",
    "Panthers takes the series",
    "Yankees drop the series to the Red Sox",
    "Dodgers dropped the series in Atlanta",
    "Astros drop the series opener",
    "Bruins dropping the series after Game 6",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the fixed "<verb> the series" frame — each verb has to
// immediately govern "the series" — so the everyday senses of these very common verbs
// ("take the field", "drop the ball", "take a look") pass through untouched, as do
// previews and non-result mentions of a series.
test("ordinary uses of take/took/drop are not over-hidden", () => {
  for (const title of [
    "How to watch the series opener this weekend",
    "Best-of-seven series preview and predictions",
    "Take the field: lineups for tonight",
    "Drop the ball no more — new gloves reviewed",
    "Take a look at the series schedule",
    "The series continues Thursday in Miami | Preview",
    "Injury forces star to drop out before the series",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
