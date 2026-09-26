import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A run of "unanswered" points/goals/runs is the scoring-run reveal that
// basketball, NFL and rugby recaps lead with: it discloses one side pulled
// decisively clear ("18 unanswered points", "score 21 unanswered", "three
// unanswered goals") — the same run-of-play leak the comeback/deficit siblings
// mask from the other direction. The digit lives inside "18 unanswered" (no
// standalone score for SCORE_RX), and on its own the phrase matched no existing
// keyword, so a bare "… unanswered points" recap leaked.
test("an 'unanswered' scoring-run reveal never reads as a clean title", () => {
  for (const title of [
    "Warriors reel off 18 unanswered points",
    "Chiefs score 21 unanswered to pull away",
    "Ireland hit 15 unanswered points after the break",
    "Rovers concede three unanswered goals",
    "Mavericks close on a run of unanswered buckets",
    "20-unanswered flurry decides it",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Both branches are pinned — "unanswered" fires only with a leading count or a
// following scoring noun — so the general-news senses of the word ("unanswered
// questions", a letter that "went unanswered") pass through untouched.
test("ordinary 'unanswered' wording is not over-hidden", () => {
  for (const title of [
    "England face unanswered questions over selection",
    "The manager's future remains unanswered",
    "A fan's letter to the club went unanswered for weeks",
    "Preview: the unanswered questions before kickoff",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
