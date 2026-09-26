import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The medal clause catches the podium-result idiom that dominates Olympics,
// athletics, swimming and cycling recaps: a winning verb (claim/take/secure/grab/
// bag/scoop/strike) followed by gold/silver/bronze names a first/second/third-place
// result with no scoreline for SCORE_RX to catch. "wins gold" already fell to "win"
// and "clinch/snatch/seal gold" to their own stems; this adds the everyday verbs
// that named the medal and nothing else.
test("a 'claim/take gold' podium result never reads as a clean title", () => {
  for (const title of [
    "Team GB claim gold in the 4x100m relay",
    "Ledecky takes gold again | Swimming Highlights",
    "Kerr claims bronze medal in Paris",
    "GB take silver in the team pursuit",
    "Duplantis secures gold with a world record",
    "Australia bag gold in the pool",
    "Team USA scoop bronze",
    "Farah struck gold in the 10,000m",
    "Norway claim the gold medal",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause is anchored on both ends — a winning verb must precede the colour, the
// "(?!\s*coast)" lookahead keeps the Australian "Gold Coast" side out, and the
// trailing "(?![-\w])" stops adjectival compounds firing — so the preview senses and
// the non-medal uses of these words must still pass through untouched.
test("ordinary uses of medal colours are not over-hidden", () => {
  for (const title of [
    "Going for gold: the road to Milan",
    "Gold medal match preview and predictions",
    "A gold rush for Australia this summer?",
    "Gold Coast Suns season preview",
    "Lucy Bronze on life at Barcelona",
    "Silverstone qualifying preview",
    "The gold standard of youth academies",
    "Chasing a first Olympic gold — who can do it?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
