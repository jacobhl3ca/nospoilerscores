import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// At an Olympics/Worlds/championship, "settle for silver/bronze" names a runner-up podium result
// outright — the podium twin of the "settle for a draw/point/stalemate" clause and the mirror image of
// the "(claim/take/secure/grab/…) the gold/silver/bronze" winner clause. Naming the second/third finish
// gives the placing away just as surely as naming the winner does, yet it carries no digit (SCORE_RX
// misses it) and no other keyword fires ("settle" is too common alone, "silver"/"bronze" are not
// keywords), so a "… settle for silver" recap title was leaking the result.
test("a 'settle for silver/bronze' runner-up result never reads as a clean title", () => {
  for (const title of [
    "Team USA settle for silver in Paris",
    "Biles settles for silver",
    "Great Britain settled for bronze",
    "Australia settling for the silver medal",
    "Ledecky has to settle for silver",
    "GB settle for a bronze medal",
    "Canada settle for the silver",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause is anchored to "settle for <optional article> silver|bronze" with the same "(?!coast)"
// Gold/Silver-Coast guard and "(?![-\w])" tail the sibling medal clause uses: "silverware"/"silvery"
// stay visible, gold is deliberately absent (you clinch gold, you don't "settle" for it — that case is
// the "take/claim gold" winner clause), and the benign "settle" senses lack the medal object entirely.
test("a non-medal use of settle/silver/bronze is not over-hidden", () => {
  for (const title of [
    "How to watch on the Silver Coast",
    "They settle for less this season",
    "Team settles down after a shaky start",
    "How to settle the GOAT debate",
    "They bring home the silverware talk",
    "Adam Silver addresses the media",
    "A silvery display of skill on the ice",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
