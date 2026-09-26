import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "run rings (a)round" is the fourth "run"-headed blowout idiom beside the
// already-covered run riot / run rampant / run away with. It is the
// comprehensively-outplayed reveal a recap title carries when one side is said
// to run rings round the other — a total-dominance result that carries no
// scoreline for SCORE_RX and matched no existing keyword. The "(?:a)?round"
// tail covers both the British "round" and the American "around".
test("a 'run rings (a)round' dominance reveal never reads as a clean title", () => {
  for (const title of [
    "City run rings around United at the Etihad",
    "Barca ran rings round Real in the Clasico",
    "Mbappé running rings around the Chelsea defence",
    "Spain run rings around Georgia",
    "Warriors ran rings round the Suns",
    "Rangers runs rings around the Devils",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The idiom is anchored to the "rings (a)round" object, so the bare
// run/ran/runs/running verbs stay safe and unrelated "ring(s)" vocabulary is
// never over-hidden.
test("ordinary 'run' / 'ring' vocabulary is not over-hidden", () => {
  for (const title of [
    "How the marathon route runs around the harbour",
    "Boxing rings around the world get an upgrade",
    "Ronaldo runs the length of the pitch in training",
    "Ring of fire: the volcano's dramatic eruption",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
