import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// Motorsport and other racing sit almost entirely outside the rest of SPOILER_RX,
// which is built around team-sport result verbs. "takes the chequered flag" and
// "crosses the line first" are the canonical winner reveals for a timed race
// (F1/IndyCar/NASCAR/MotoGP, plus athletics/cycling/swimming) — each named the
// winner outright yet read as a clean title before these were added.
test("a race-winner reveal never reads as a clean title", () => {
  for (const title of [
    "Verstappen takes the chequered flag at Monaco",
    "Hamilton took the checkered flag",
    "Norris taking the chequered flag | Race Highlights",
    "Verstappen takes chequered flag",
    "Hamilton crosses the line first",
    "Bolt crosses the finish line first",
    "Piastri crossed the line first",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The anchors keep the bare words safe: only the winner "takes" the flag (a
// backmarker merely "sees" it), and the trailing "first" is what turns the
// everyday "cross the line" metaphor into a race result. None of these ordinary
// titles names an outcome, so the mask must still lift for them.
test("the racing idioms do not swallow ordinary highlight titles", () => {
  for (const title of [
    "How the chequered flag got its pattern",
    "First look at the 2026 car",
    "He crossed the line with those comments",
    "Cross-country skiing | Course preview",
    "Finish Line Festival | Fan Zone Tour",
    "Grand Prix Qualifying | Full Session",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
