import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A late-drama qualifier ("last-gasp", "stoppage-time", "injury-time", "last-minute",
// "added-time", "dying seconds", an "Nth-minute" stamp, or plain "late") followed by
// "goal"/"strike" reveals that a goal was scored — usually the decisive one — yet it
// carries no scoreline for SCORE_RX and the bare "goal"/"strike" noun matched none of
// the existing keywords (the winner/equaliser wordings were caught, but "last-gasp goal"
// / "stoppage-time strike" slipped through). "goal" and "strike" are used here only
// because, behind a late qualifier, each unambiguously names a goal.
test("a late-drama goal/strike reveal never reads as a clean title", () => {
  for (const title of [
    "Rashford's last-gasp goal sinks City",
    "Last-minute goal wins it for Arsenal",
    "Stoppage-time strike downs United",
    "Dramatic late goal at Anfield",
    "Late strike settles the derby",
    "Added-time goal breaks Spurs hearts",
    "Injury-time goal caps the comeback",
    "95th-minute goal steals the points",
    "90th minute strike from range",
    "Dying seconds goal sends fans wild",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause is pinned to the "goal"/"strike" scoring nouns with a word boundary and a
// negative lookahead, so the compound forms ("goalkeeper", "goalscorer", "goal-line",
// "goal kick", "goal difference"), the industrial-action sense of "strike", and every
// non-scoring "late"/"last-minute" headline (team news, transfers, kick-off time, a late
// fitness test) reveal no result and must still pass through untouched.
test("non-scoring 'late'/'last-minute' headlines are not over-hidden", () => {
  for (const title of [
    "Late goalkeeper change before kick-off",
    "Late goalscorer named in the squad",
    "Late goal-line clearance keeps them level",
    "Late goal kick routine explained",
    "Late goal difference swing in the table race",
    "Late strike action threatens fixtures",
    "Late team news ahead of the derby",
    "Last-minute transfer on deadline day",
    "Late fitness test for the striker",
    "Late kick-off confirmed for Sunday",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
