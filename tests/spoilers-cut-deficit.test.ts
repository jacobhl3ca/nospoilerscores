import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "cut/halve/reduce/trim/slash the deficit" is the PARTIAL-comeback reveal — the trailing
// side scoring to close (not yet reverse) a score/aggregate gap — the sibling of the
// already-covered "overturn/erase the deficit" (a full reversal) and "pull one back"/"pegged
// back" (the same comeback-goal leak in soccer/cricket framing). Staple NBA/soccer/NHL recap
// wording ("Lakers cut the deficit to five", "United halve the deficit at Old Trafford"), each
// revealing that a scoring event happened and the game is closer than the neutral title admits.
// Written without any digit for SCORE_RX to catch and matching no existing verb, so a title
// framed this way stood unmasked before.
test("a 'cut/halve/reduce the deficit' comeback reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal cut the deficit to one just before half-time",
    "Lakers reduce the deficit to five in the fourth",
    "United halve the deficit at Old Trafford",
    "Celtics trim the deficit late in the third",
    "Barcelona cut the deficit through Lewandowski",
    "Rangers reduced the deficit with a power-play goal",
    "Nuggets slashed the deficit to single digits",
    "City halving the deficit at the Etihad",
    // Sports qualifiers on "deficit" must still fire — only finance qualifiers are guarded.
    "United cut the two-goal deficit before the break",
    "Spurs cut the aggregate deficit to one",
    "Chelsea cut the points deficit at the top",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The branch is anchored on the object "deficit", and a negative lookbehind drops the finance
// qualifiers, so the result-free uses of these very common verbs pass through untouched: a
// squad/roster "cut" or "trim", a wage-bill "cut", and any economics "deficit" headline (the one
// place "deficit" is not a score gap). "narrow" is deliberately NOT a listed verb — the adjective
// phrase "a narrow deficit" would otherwise collide with a preview.
test("squad trims, wage cuts and economic-deficit headlines are not over-hidden", () => {
  for (const title of [
    "United face a narrow deficit going into the second leg",
    "The club moved to cut its wage bill",
    "Coach wants to trim the roster before the deadline",
    "Government pledges to reduce the budget deficit",
    "How to cut the trade deficit, explained",
    "Chancellor to slash the fiscal deficit",
    "Plan to reduce the national deficit unveiled",
    "Deficit hawks push for spending cuts",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
