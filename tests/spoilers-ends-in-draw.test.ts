import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "ends in a draw" is the plainest way a recap title states a drawn result —
// "Arsenal vs City ends in a draw", "the derby ended in a goalless draw". It
// reveals the outcome (level) every time, yet it carries no scoreline for
// SCORE_RX and slipped past the existing draw idioms: "held to a draw" needs the
// losing-favourite verb and "play out a draw" needs that exact verb, so a title
// that simply names the outcome matched neither. Its cousin "finished in a draw"
// only ever hit incidentally via the combat "finish(es|ed)" token. The pattern
// mirrors the sibling "held to a(n) [word] draw" — one optional describing word
// before the mandatory "draw" tail — so it stays a result reveal, not a bare "draw".
test("an 'ends in a draw' result reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal vs Chelsea ends in a draw",
    "The North London derby ended in a draw",
    "United and City end in a draw",
    "Barca and Madrid ending in a goalless draw",
    "The match ended in an entertaining draw",
    "Everton and Spurs end in a scoreless draw",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the "draw" tail sitting behind "end/ends/ended/ending
// in a(n)", so the everyday senses of "ends" and "draw" — which appear all over
// ordinary titles — must still pass through untouched.
test("ordinary uses of 'ends' and 'draw' are not over-hidden", () => {
  for (const title of [
    "How the season ends for the title chasers",
    "The FA Cup draw in full",
    "Draw your own conclusions before kickoff",
    "How to draw a football pitch",
    "Where the transfer window ends",
    "The series ends tonight",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
