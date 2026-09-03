import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "X downs Y" is the transitive defeat verb tennis, combat-sports and single-name-team
// recap titles lean on constantly ("Alcaraz downs Sinner", "Kansas City downs Denver").
// It names the winner outright, yet carries no scoreline for SCORE_RX and matched no
// existing keyword — so a plain result recap written this way leaked. Only the "s"/"ed"
// inflections are covered (bare "down" is far too overloaded — "4th down", "down the
// stretch", "shut down"); those two forms join the sink/sank/sunk defeat family.
test("a 'downs'/'downed' winner reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz downs Sinner in Rome final",
    "Kansas City downs Denver",
    "Nadal downs Federer in five sets",
    "Swiatek downed Gauff to reach the final",
    "Chiefs downed the Raiders",
    "Real Madrid downed by Barcelona in the Clasico",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Bare "down" is one of the most overloaded words in sports copy, and the idiom
// "ups and downs" collides with "downs". Guard against over-hiding all of it — the
// (?<!ups and ) lookbehind and the narrow "s"/"ed"-only forms keep these clean.
test("everyday 'down' vocabulary is not over-hidden", () => {
  for (const title of [
    "The ups and downs of the 2026 season",
    "Fourth and one: the biggest plays",
    "Breaking down the offense",
    "Down the stretch: the playoff race",
    "Tom Brady sit-down interview",
    "Countdown to kickoff",
    "How the defense shut down the run",
    "A down year for the franchise",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
