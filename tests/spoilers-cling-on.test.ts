import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "cling on"/"clung on" and "cling to a lead" complete the protect-the-lead-to-win
// family alongside the already-masked "hold on"/"held on"/"hang on"/"hung on". A side
// that clings on is a side that finished ahead, so each of these titles names the
// winner even though no digits give SCORE_RX a hook and no other keyword fires — the
// result leaked before this branch existed.
test("a 'cling on' / 'cling to a lead' win reveal never reads as a clean title", () => {
  for (const title of [
    "Rangers cling on to beat Celtic | Highlights",
    "United cling on for victory at Old Trafford",
    "Arsenal clung on to a 1-0 lead",
    "Ten Hag's men cling on late in Manchester",
    "Chelsea clinging on at the death",
    "Spurs cling to a slender lead",
    "City cling to the win in stoppage time",
    "Liverpool clung to their advantage",
    "Rovers cling to three points",
    "Nadal clings to his lead in the fifth set",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The bare form is gated on the trailing "on", and the "cling to …" form requires a
// result object (win/victory/lead/advantage/point(s)/result). So the non-result idioms
// that dominate "cling" usage outside a scoreline — clinging to hope, survival, a job,
// a dream — must still pass through untouched, as must a bare "clinging" with no "on".
test("non-result 'cling' idioms are not over-hidden", () => {
  for (const title of [
    "Fans cling to hope of a late signing",
    "Rock climber clings to the cliff face",
    "Manager clings to his job amid the slump",
    "Supporters cling to a dream of promotion",
    "How to grow a clinging vine indoors",
    "Top 10 goals of the season compilation",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
