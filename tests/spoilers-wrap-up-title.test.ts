import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "wrap up the title/championship/series/..." is the missing sibling of the already-keyworded
// "claim/clinch/seal the title" cluster: a side that WRAPS UP the title (or championship, crown,
// pennant, Scudetto, playoff series, sweep, win) has clinched it — the single biggest reveal the
// filter exists to hide. Season-clinch, F1-championship and playoff recaps lead with exactly this
// wording, yet it carries no digits for SCORE_RX and matched none of the existing claim/clinch/seal
// verbs. The wrap-up verb immediately before an unambiguous clinch object is what makes it a spoiler.
test("a 'wrap up the title' clinch reveal never reads as a clean title", () => {
  for (const title of [
    "Liverpool wrap up the title at Anfield",
    "Manchester City wrap up the Premier League title",
    "Verstappen wraps up the championship in Vegas",
    "Napoli wrapping up the Scudetto",
    "Celtics wrapped up the series in six",
    "Yankees wrap up the pennant",
    "Bayern wrap up a record title",
    "Dodgers wrap-up the sweep",
    "Real Madrid wrap up the crown",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to an unambiguous clinch object directly after the wrap-up verb, so the
// everyday news-summary sense of "wrap-up" — which is one of the commonest title words this filter
// sees — must still pass through untouched: every summary form ends at "wrap-up" (or is followed by
// "show"/"of the week"), never by a title/series object.
test("news-summary 'wrap-up' titles are not over-hidden", () => {
  for (const title of [
    "Match wrap-up",
    "Weekly wrap-up show",
    "Transfer news wrap-up",
    "Gameweek 5 wrap-up",
    "Premier League wrap-up",
    "Season wrap-up",
    "Fantasy football wrap-up",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
