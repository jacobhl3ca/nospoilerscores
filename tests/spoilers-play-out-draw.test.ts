import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "play out a draw" is the neutral recap phrasing for a drawn game — "Arsenal and
// Chelsea play out a draw", "United play out a dull draw at home". It reveals the
// result (level) every time, yet it carries no scoreline for SCORE_RX and slipped
// past the existing draw idioms: the filter already catches "held to a draw" and
// "settle for a draw", but a game its own report frames as one the sides *played*
// to a draw matched neither. Only forms that name a scoreline ("play out a 2-2
// draw") or a nil ("play out a goalless draw") were caught, via SCORE_RX and the
// "goalless" token; the plain and adjective-only forms leaked. The pattern mirrors
// the sibling "held to a(n) [word] draw" — one optional describing word before the
// mandatory "draw" tail — so it stays a result reveal, not a bare "draw".
test("a 'play out a draw' result reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal and Chelsea play out a draw",
    "United and City play out a dull draw",
    "Spurs play out a tense draw at home",
    "Liverpool played out an entertaining draw",
    "Barca and Madrid play out a hard-fought draw",
    "Everton play out a goalless draw",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the "draw" tail sitting behind "play/plays/played/playing
// out a(n)", so the everyday senses of "play out" and "draw" — which appear all over
// ordinary titles — must still pass through untouched.
test("ordinary uses of 'play out' and 'draw' are not over-hidden", () => {
  for (const title of [
    "How the title race will play out",
    "Let the season play out and draw your own conclusions",
    "Played out a drawn-out saga about the transfer",
    "The FA Cup draw in full",
    "How to draw a football pitch",
    "A guide to drawing the perfect free kick",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
