import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put paid to" is the British ending idiom recap titles lean on when a result kills off the
// other side's run, hopes, or challenge ("Liverpool put paid to Arsenal's unbeaten run"). It
// names the beaten side but carries no digits for SCORE_RX, and it slipped past the
// "end …reign / …unbeaten run" family — yet in a highlight title it means nothing but a
// decisive defeat/elimination, so a recap written this way leaked the result before.
test("a 'put paid to' defeat/ending reveal never reads as a clean title", () => {
  for (const title of [
    "Liverpool put paid to Arsenal's unbeaten run | Premier League Highlights",
    "City puts paid to United's title hopes",
    "A red card putting paid to the comeback",
    "Real Madrid put paid to Barcelona's Clasico dreams",
    "Celtics putting paid to the Heat's playoff push",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the three-word "put …paid …to" idiom, so unrelated "paid" and
// "put" uses stay clean: nothing here reveals a result.
test("unrelated 'put' / 'paid' uses are not over-hidden", () => {
  for (const title of [
    "How much are Premier League refs paid? A breakdown",
    "Fans have paid tribute to the club legend",
    "Top 10 goals of the season compilation",
    "Where to put your fantasy football budget this week",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
