import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// Motorsport and other racing sit almost entirely outside the rest of SPOILER_RX,
// which is built around team-sport result verbs. "takes/claims the chequered flag"
// and "crosses the line first" are the canonical winner reveals for a timed race
// (F1/IndyCar/NASCAR/MotoGP, plus athletics/cycling/swimming) — each named the
// winner outright yet read as a clean title before these were added. "claims" is a
// winner-only verb too (a backmarker never "claims" the flag), so it joins take/took.
test("a race-winner reveal never reads as a clean title", () => {
  for (const title of [
    "Verstappen takes the chequered flag at Monaco",
    "Hamilton took the checkered flag",
    "Norris taking the chequered flag | Race Highlights",
    "Verstappen takes chequered flag",
    "Leclerc claims the chequered flag at Monza",
    "Norris claimed the checkered flag",
    "Verstappen claiming the chequered flag | Race Highlights",
    "Piastri claims chequered flag",
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

// "Podium finish" is the top-3 result reveal the chequered-flag/line-first pair
// misses: those name only the RACE WINNER, so a "podium finish" (2nd/3rd in
// F1/MotoGP/cycling/athletics) still leaked. The phrase is always a sports
// placing — a lectern or ceremony "podium" never takes "finish" — so it is
// anchored tightly to podium+finish and carries no false-positive risk.
test("a podium-finish reveal never reads as a clean title", () => {
  for (const title of [
    "Hamilton takes a podium finish at Monza",
    "Norris secures a podium finish",
    "Leclerc's podium finish | Race Highlights",
    "Podium finish for Alpine in Miami",
    "Two podium finishes for Ferrari this weekend",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The podium anchor needs the trailing "finish": the lectern/ceremony senses of
// "podium" reveal no result, so the mask must still lift for them.
test("the podium anchor does not swallow the lectern or ceremony sense", () => {
  for (const title of [
    "How to watch the podium ceremony",
    "The president takes the podium",
    "Podium presentation | Full replay",
    "Where does the podium go after the race?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "Laps the field" is the crushing-dominance reveal the winner-only flag/line/
// podium idioms miss: a leader who laps the entire field has won by a full lap,
// yet the phrase names no placing digit for SCORE_RX and matches no result verb.
// It is a race outcome across F1/NASCAR/IndyCar/MotoGP, track cycling and
// athletics. Pinned to the finite/participle forms + the object "the field", so
// the everyday racing senses stay visible (see the guard test below).
test("a laps-the-field reveal never reads as a clean title", () => {
  for (const title of [
    "Verstappen laps the field at Monza",
    "Hamilton lapped the field",
    "He was lapping the field all afternoon | Race Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The anchor is the whole phrase "laps the field": the bare "laps" of a swim
// set or the metaphor "laps up", and "field" on its own, name no outcome, so
// the mask must still lift for them. The infinitive "lap the field" (a preview
// question) is deliberately left out — only the finite/participle forms fire.
test("the laps-the-field anchor does not swallow ordinary racing titles", () => {
  for (const title of [
    "20 laps of the pool | Training day",
    "Ferrari laps up the Monza atmosphere",
    "Two laps to go and the field is bunched",
    "Can Verstappen lap the field this weekend?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
