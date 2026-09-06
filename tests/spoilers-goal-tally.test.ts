import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A player's multi-goal haul in a match is the same partial-result leak as a "brace" or a
// "hat-trick" — it reveals the match wasn't goalless and usually which side scored — but the
// count is spelled out ("scores twice") rather than hyphenated, so SCORE_RX misses it and none
// of the win-family verbs caught the bare "twice"/"thrice" wording. The scoring-verb-plus-count
// group closes that gap.
test("a scoring verb next to a count never reads as a clean title", () => {
  for (const title of [
    "Haaland scores twice in a comfortable night",
    "Ronaldo nets twice | Highlights",
    "Kane slots twice before the break",
    "Salah fires twice",
    "Mbappé scores three times",
    "Bruno converts twice from the spot",
    "Foden nets three times",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The count must sit directly after the scoring verb, and no bare "N goals" tally is matched —
// "top 10 goals of the season"-style compilation titles span many matches and are benign, so a
// lone goal, a preview question, and goal-count compilations must all stay clean.
test("previews, single goals, and goal compilations stay clean", () => {
  for (const title of [
    "One goal away from history",
    "The goal that changed everything",
    "Can he score tonight?",
    "Top 10 goals of the season compilation",
    "Best 5 goals of the week",
    "Two goalkeepers to watch this weekend",
    "Goal-line technology, explained",
    "A masterclass in goalkeeping",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
