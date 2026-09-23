import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The scoring-verb clause already masked "<verb> ahead / in front / into a lead"
// (fires/heads/nods/slots/taps/… a side ahead), but the same striking verbs plus
// "home" — the ball put into the net — leaked. "Salah slots home", "Kane nods
// home", "Foden taps home" each reveal a goal was scored (the score is no longer
// what you'd assume), the same single-scoring-event tell the already-masked "open
// the scoring" and go-ahead clauses hide, yet they carry no digit for SCORE_RX
// and matched none of the win-family keywords. Only the inflected forms
// (slots/slotted/slotting …) are caught, so a preview question ("can he tap
// home?") stays visible, and a trailing negative lookahead keeps the home-team
// nouns ("home form", "home record", "home advantage") visible.
test("a '<strike> home' goal reveal never reads as a clean title", () => {
  for (const title of [
    "Son slots home the opener at the Lane",
    "Foden taps home from close range",
    "Rashford nods home a header",
    "De Bruyne rifles home from the edge of the box",
    "Saka curls home a beauty",
    "Nunez prods home the rebound",
    "Jesus bundles home at the far post",
    "Martinelli lashes home",
    "Palmer tucks home the third",
    "Grealish volleys home",
    "Trippier steers home late on",
    "Salah slotted home to level",
    "Kane tapping home the winner",
    "Nketiah nodded home in stoppage time",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verbs excluded on purpose (head/drill/drive) carry an everyday "home"
// sense — a team travelling home, a coach driving a point home — so those stay
// visible, as does a bare-infinitive preview question and the home-team nouns
// the lookahead guards.
test("everyday 'home' phrasings and previews stay visible", () => {
  for (const title of [
    "England head home early after their group-stage exit",
    "Fans make their way home after the match",
    "Pochettino drills home the importance of discipline",
    "Coach drives the message home in training",
    "Can Kane tap home from there? Match preview",
    "How to slot home from close range like a pro",
    "Rovers boost home form with a point",
    "Villa extend home record to eight games",
    "Where is home advantage strongest this season?",
    "Team GB curling schedule and how to watch",
    "Rain lashing down at kick-off",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
