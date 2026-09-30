import assert from "node:assert/strict";
import test from "node:test";
import { playoffSubtitleTiers } from "../src/lib/playoffSubtitle.ts";

// Every slate below is the real ESPN notes[0].headline list for that date.

test("MLB Wild Card day with AL and NL games reads Wild Card, not the first game's league", () => {
  // 2026-09-29: PHI@ATL came first, so the column said "NLWC · Game 1".
  const day = ["NLWC - Game 1", "ALWC - Game 1", "ALWC - Game 1", "NLWC - Game 1"];
  assert.deepEqual(playoffSubtitleTiers(day, "Postseason"), ["Wild Card · Game 1", "Wild Card · G1", "WC · G1"]);
});

test("MLB Division Series day with both leagues", () => {
  assert.deepEqual(playoffSubtitleTiers(["ALDS - Game 1", "NLDS - Game 1"]), [
    "Division Series · Game 1",
    "Division Series · G1",
    "DS · G1",
  ]);
  assert.deepEqual(playoffSubtitleTiers(["ALCS - Game 3", "NLCS - Game 2"]), ["LCS"]);
});

test("a Game 3 listed before it is needed merges like any other game", () => {
  // ESPN's Oct 1 slate, read 2026-09-29.
  const day = ["NLWC - Game 3 If Necessary", "ALWC - Game 3 If Necessary", "ALWC - Game 3 If Necessary", "NLWC - Game 3 If Necessary"];
  assert.deepEqual(playoffSubtitleTiers(day, "Postseason"), [
    "Wild Card · Game 3 If Necessary",
    "Wild Card · G3 If Necessary",
    "WC · G3 If Necessary",
  ]);
});

test("a one-league day keeps the league", () => {
  assert.deepEqual(playoffSubtitleTiers(["NLCS - Game 2"]), ["NLCS · Game 2", "NLCS · G2"]);
  assert.deepEqual(playoffSubtitleTiers(["NLWC - Game 2", "NLWC - Game 3"]), ["NLWC"]);
});

test("NBA/NHL: East + West on the same day drop the conference; mixed game numbers drop the game", () => {
  assert.deepEqual(playoffSubtitleTiers(["East 1st Round - Game 1", "West 1st Round - Game 1"]), [
    "1st Round · Game 1",
    "1st Round · G1",
  ]);
  // NHL 2026-04-20
  assert.deepEqual(
    playoffSubtitleTiers(["East 1st Round - Game 2", "East 1st Round - Game 2", "West 1st Round - Game 2", "West 1st Round - Game 1"]),
    ["1st Round"],
  );
  assert.deepEqual(playoffSubtitleTiers(["West Finals - Game 2"]), ["West Finals · Game 2", "West Finals · G2"]);
});

test("a conference final keeps both sides so it never reads as the league final", () => {
  // NFL 2026-01-25
  assert.deepEqual(playoffSubtitleTiers(["NFC Championship", "AFC Championship"]), ["AFC/NFC Championship"]);
  assert.deepEqual(playoffSubtitleTiers(["East Finals - Game 3", "West Finals - Game 3"]), [
    "East/West Finals · Game 3",
    "East/West Finals · G3",
  ]);
});

test("NFL playoff weekends merge AFC and NFC", () => {
  assert.deepEqual(playoffSubtitleTiers(["AFC Divisional Playoffs", "NFC Divisional Playoffs"]), ["Divisional Playoffs"]);
  assert.deepEqual(playoffSubtitleTiers(["NFC Wild Card Playoffs", "NFC Wild Card Playoffs"]), ["NFC Wild Card Playoffs"]);
});

test("March Madness regions merge to the round", () => {
  const day = [
    "NCAA Men's Basketball Championship - East Region - 1st Round",
    "NCAA Men's Basketball Championship - Midwest Region - 1st Round",
    "NCAA Men's Basketball Championship - South Region - 1st Round",
  ];
  assert.deepEqual(playoffSubtitleTiers(day, "March Madness"), ["1st Round"]);
  assert.deepEqual(playoffSubtitleTiers(["NCAA Men's Basketball Championship - South Region - Elite 8"]), ["South Region · Elite 8"]);
});

test("two different rounds name both, then fall back to the league's word", () => {
  assert.deepEqual(playoffSubtitleTiers(["East 1st Round - Game 6", "West 2nd Round - Game 1"], "Playoffs"), [
    "East 1st Round / West 2nd Round",
    "Playoffs",
  ]);
});

test("no labels, no subtitle", () => {
  assert.deepEqual(playoffSubtitleTiers([]), []);
});
