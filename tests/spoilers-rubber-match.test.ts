import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A "rubber match" (or "rubber game") is the deciding game of a tied series, so a
// side that TAKES it has won the whole series: "Yankees take the rubber match",
// "Astros took the rubber game in extras", "Mets claim the rubber game". That is the
// same series-outcome reveal the series-CLINCH ("close out the series"), the series-
// EQUALISER ("even the series") and the series-EXTENDING ("force Game 7") idioms
// beside it mask — yet it carries no digits, so SCORE_RX ignores it, and it matched no
// existing keyword, so a bare "… take the rubber match" recap leaked.
test("a 'take the rubber match/game' series-decider reveal never reads as a clean title", () => {
  for (const title of [
    "Yankees take the rubber match | MLB Highlights",
    "Astros took the rubber game in extras",
    "Mets claim the rubber game at Citi Field",
    "Red Sox take rubber match",
    "Dodgers taking the rubber match in the 9th",
    "Cubs claimed the rubber game",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to a possession verb (take/took/claim) immediately governing
// the "rubber match/game" object, so the everyday preview framing that merely NAMES
// the fixture — a "rubber match preview", a "how to watch", an "eye the rubber match"
// look-ahead — passes through untouched, and the literal "rubber" senses ("rubber
// duck race") never trip it.
test("previews and literal 'rubber' uses are not over-hidden", () => {
  for (const title of [
    "Rubber match preview: Yankees vs Red Sox",
    "How to watch the rubber match tonight",
    "Astros eye the rubber match tonight",
    "Rubber duck race raises money for charity",
    "Where the rubber meets the road | Column",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
