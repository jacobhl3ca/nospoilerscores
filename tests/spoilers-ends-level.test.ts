import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "ends level" / "finish level" is the plainest way a recap title states a drawn
// result without a scoreline — "the derby ends level", "Arsenal and Chelsea end
// level", "Real and Barca finish level". It reveals parity every time yet slipped
// past the existing draw idioms: "held to a draw", "ends in a draw" and "play out
// a draw" all need the word "draw", and the combat "finish(?:es|ed)" keyword only
// caught the "finishes/finished level" forms incidentally — leaving "ends level"
// and the present-tense "finish level" uncovered. The pattern anchors "end"/"finish"
// directly before "level" (an optional all/dead/honours modifier aside) so it stays
// a result reveal, not a bare "level".
test("an 'ends level' / 'finish level' draw reveal never reads as a clean title", () => {
  for (const title of [
    "The derby ends level",
    "Arsenal and Chelsea end level",
    "The match ended level at full time",
    "United and City ending level again",
    "The game ends all level",
    "The Clasico ended dead level",
    "Honours even as the sides end level",
    "Real and Barca finish level",
    "The tie finished level after 90",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on "level" sitting directly behind "end/ends/ended/ending"
// or "finish/finishes/finished/finishing", so the everyday senses of "level",
// "ends" and "finish" — which appear all over ordinary titles — must still pass
// through untouched.
test("ordinary uses of 'level', 'ends' and 'finish' are not over-hidden", () => {
  for (const title of [
    "Level up your matchday experience",
    "A level playing field for both sides",
    "Next-level skills on show",
    "On level terms before kickoff",
    "It's all level at half-time — preview",
    "How the season ends for the title chasers",
    "Where the transfer window ends",
    "Can they reach the next level this year",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
