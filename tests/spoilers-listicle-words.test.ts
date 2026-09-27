import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A Title Case listicle/ranking headline can satisfy TEAM_SCORE_RX's "CapWord N, CapWord N" shape
// without naming any real team — "Tier 1, Tier 2", "Volume 3, Volume 4", "Chapter 1, Chapter 2".
// The serialization/ranking words that lead those phrases are never real team names, so a match built
// only from them is not a score reveal and must not be hidden. "Vol" was already exonerated; its full
// spelling "Volume", plus the "Chapter" serialization companion and the "Tier" ranking word, close the
// remaining gaps that were still over-hiding these headlines.
test("a Title Case listicle/ranking headline is not mistaken for a team score", () => {
  for (const title of [
    "NFL QB Tiers: Tier 1, Tier 2 and Where Everyone Lands",
    "Ranking the Draft Class: Tier 1, Tier 2 Prospects",
    "Highlights Volume 3, Volume 4 Now Streaming",
    "The Rivalry Retrospective: Chapter 1, Chapter 2",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// The exoneration only skips a match whose team slots are these listicle words. A real box-score line
// stays hidden even when a listicle word appears earlier in the headline, because TEAM_SCORE_RX still
// finds the actual "Team N, Team N" scoreline further along.
test("a real scoreline is still hidden even beside a listicle word", () => {
  for (const title of [
    "Lakers 110, Celtics 98",
    "Arsenal 3, Chelsea 1",
    "Chapter 1 recap as Lakers 110, Celtics 98",
    "Tier 1 defenses on show: Ravens 24, Steelers 17",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});
