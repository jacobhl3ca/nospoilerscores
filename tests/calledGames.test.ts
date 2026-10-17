import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

import { calledKind, parseCalledNote, cleanRoundLabel, findNextMeeting, nextGameText } from "../src/lib/calledGames.ts";
import { shortenPlayoffLabel, playoffSubtitleTiers } from "../src/lib/playoffSubtitle.ts";

// Postponed / canceled / suspended games (Jacob 10/17). The fixture is ESPN's
// real MLB scoreboard for the ALCS Game 4 rainout, read 2026-10-17: Fri 10/16
// Game 4 postponed, Sat 10/17 Game 4 at 8 PM, Sun 10/18 "Game 5 Makeup of Oct 16".

type Ev = Record<string, unknown>;
const FIX = JSON.parse(readFileSync(new URL("./fixtures/alcs-rainout-2026-10-16.json", import.meta.url), "utf8")) as Record<string, Ev[]>;

test("the live note gives reason Rain and makeup Oct 18", () => {
  assert.deepEqual(parseCalledNote("ALCS - Game 4 Rain - Makeup on Oct 18"), { reason: "Rain", makeup: "Oct 18" });
});

test("a note with no makeup, a note with no cause, and no note at all", () => {
  assert.deepEqual(parseCalledNote("Postponed due to inclement weather"), { reason: "Inclement Weather", makeup: null });
  assert.deepEqual(parseCalledNote("ALCS - Game 4"), { reason: null, makeup: null });
  assert.deepEqual(parseCalledNote(""), { reason: null, makeup: null });
  assert.deepEqual(parseCalledNote(undefined), { reason: null, makeup: null });
});

test("status names: both spellings of canceled, and live games are not called", () => {
  assert.equal(calledKind("STATUS_POSTPONED"), "postponed");
  assert.equal(calledKind("STATUS_CANCELED"), "canceled");
  assert.equal(calledKind("STATUS_CANCELLED"), "canceled");
  assert.equal(calledKind("STATUS_SUSPENDED"), "suspended");
  assert.equal(calledKind("STATUS_FINAL"), null);
  assert.equal(calledKind("STATUS_SCHEDULED"), null);
  assert.equal(calledKind(undefined), null);
});

test("cleanRoundLabel removes both makeup tails and leaves plain labels alone", () => {
  assert.equal(cleanRoundLabel("ALCS - Game 5 Makeup of Oct 16"), "ALCS - Game 5");
  assert.equal(cleanRoundLabel("ALCS - Game 4 Rain - Makeup on Oct 18"), "ALCS - Game 4");
  assert.equal(cleanRoundLabel("ALCS - Game 4"), "ALCS - Game 4");
  assert.equal(cleanRoundLabel("East 1st Round - Game 7"), "East 1st Round - Game 7");
  // A cause not on the word list is still cut, and gives no reason.
  assert.equal(cleanRoundLabel("ALCS - Game 4 Field Conditions - Makeup on Oct 18"), "ALCS - Game 4");
  assert.deepEqual(parseCalledNote("ALCS - Game 4 Field Conditions - Makeup on Oct 18"), { reason: null, makeup: "Oct 18" });
  // A cause word inside the round name is not read as the cause.
  assert.deepEqual(parseCalledNote("Power Five Classic - Game 2 Rain - Makeup on Jun 3"), { reason: "Rain", makeup: "Jun 3" });
});

test("the column subtitle reads ALCS · Game 5 on the makeup day, no 'Makeup'", () => {
  assert.equal(shortenPlayoffLabel("ALCS - Game 5 Makeup of Oct 16"), "ALCS · Game 5");
  assert.deepEqual(playoffSubtitleTiers(["ALCS - Game 5 Makeup of Oct 16"]), ["ALCS · Game 5", "ALCS · G5"]);
});

test("next game text: a later day, tonight, ESPN's makeup date, nothing", () => {
  const tz = "America/New_York";
  const sat = { next: "2026-10-18T00:00Z", nextStatus: "10/17 - 8:00 PM EDT", makeup: "Oct 18" };
  // Viewed Fri 10/16, 9 PM ET.
  assert.equal(nextGameText(sat, Date.parse("2026-10-17T01:00Z"), tz), "Next game: Sat Oct 17, 8:00 PM");
  // Viewed Sat 10/17, noon ET.
  assert.equal(nextGameText(sat, Date.parse("2026-10-17T16:00Z"), tz), "Next game: tonight, 8:00 PM");
  assert.equal(nextGameText({ next: null, makeup: "Oct 18" }, Date.now(), tz), "Next game: Oct 18");
  assert.equal(nextGameText({ next: null, makeup: null }, Date.now(), tz), "New date not set yet");
});

test("findNextMeeting takes the next not-yet-started game of the same pair, either order", () => {
  const called = { date: "2026-10-17T00:00Z", homeTeam: { id: "mlb-5" }, awayTeam: { id: "mlb-30" } };
  const g = (id: string, date: string, home: string, away: string, state = "pre") => ({ id, date, state, homeTeam: { id: home }, awayTeam: { id: away } });
  const pool = [
    g("other", "2026-10-17T20:00Z", "mlb-10", "mlb-11"),
    g("g5", "2026-10-18T21:00Z", "mlb-5", "mlb-30"),
    g("g4", "2026-10-18T00:00Z", "mlb-30", "mlb-5"),
    g("old", "2026-10-15T00:00Z", "mlb-5", "mlb-30"),
  ];
  assert.equal(findNextMeeting(called, pool)?.id, "g4");
  assert.equal(findNextMeeting(called, [pool[0]]), null);
  // A past day viewed after the replay started still finds it.
  assert.equal(findNextMeeting(called, [g("g4", "2026-10-18T00:00Z", "mlb-30", "mlb-5", "post")])?.id, "g4");
});

test("ESPN's rainout becomes one called game, never a Game, and the next game is Sat 8 PM", async () => {
  const jiti = createJiti(import.meta.url);
  const espn = await jiti.import<{
    eventsToGames: (events: Ev[], sport: string) => Array<{ id: string; date: string; state: string; statusDetail: string; homeTeam: { id: string }; awayTeam: { id: string }; rating: number | null }>;
    eventsToCalledGames: (events: Ev[], sport: string) => Array<{ id: string; kind: string; isPlayoff: boolean; label: string | null; reason: string | null; makeup: string | null; date: string; homeTeam: { id: string; abbreviation: string; score: string }; awayTeam: { id: string; abbreviation: string } }>;
  }>("../src/lib/espn.ts");
  const fri = FIX["20261016"];
  assert.deepEqual(espn.eventsToGames(fri, "mlb"), []);
  const called = espn.eventsToCalledGames(fri, "mlb");
  assert.equal(called.length, 1);
  assert.equal(called[0].kind, "postponed");
  assert.equal(called[0].label, "ALCS - Game 4");
  assert.equal(called[0].reason, "Rain");
  assert.equal(called[0].makeup, "Oct 18");
  assert.equal(called[0].isPlayoff, true);
  assert.equal(called[0].awayTeam.abbreviation, "TB");
  assert.equal(called[0].homeTeam.abbreviation, "CLE");
  assert.equal(called[0].homeTeam.score, "");
  assert.ok(!("rating" in called[0]));

  const ahead = espn.eventsToGames([...FIX["20261017"], ...FIX["20261018"]], "mlb");
  const next = findNextMeeting(called[0], ahead);
  assert.ok(next);
  assert.equal(nextGameText({ next: next.date, nextStatus: next.statusDetail, makeup: called[0].makeup }, Date.parse("2026-10-17T01:00Z"), "America/New_York"), "Next game: Sat Oct 17, 8:00 PM");
  // A non-called day yields no called games.
  assert.deepEqual(espn.eventsToCalledGames(FIX["20261017"], "mlb"), []);
});
