import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// espn.ts imports "./types" without an extension, which node's type-stripping
// loader cannot resolve — hence jiti rather than a plain import. Nothing here
// touches the network: ALL_LEAGUES and the two date predicates are pure.
const jiti = createJiti(import.meta.url);
const { ALL_LEAGUES, isLeagueActive, isLeagueUpcoming } = await jiti.import<{
  ALL_LEAGUES: Array<{ sport: string; label: string; hidden?: boolean }>;
  isLeagueActive: (l: unknown, d: Date) => boolean;
  isLeagueUpcoming: (l: unknown, d: Date) => boolean;
}>("../src/lib/espn.ts");

// The switcher's dedupe rule, lifted from HomeContent's thirdLeagueOptions: for
// one sport on one date, which config's LABEL does the row show?
function switcherLabel(sport: string, iso: string): string | null {
  const viewDate = new Date(`${iso}T12:00:00`);
  let chosen: { label: string } | null = null;
  let chosenActive = false;
  for (const league of ALL_LEAGUES) {
    if (league.hidden || league.sport !== sport) continue;
    const active = isLeagueActive(league, viewDate);
    const upcoming = !active && isLeagueUpcoming(league, viewDate);
    if (!active && !upcoming && league.sport !== "nba") continue;
    if (chosen && (chosenActive || !active)) continue;
    if (active) chosenActive = true;
    chosen = league;
  }
  return chosen?.label ?? null;
}

// THE REGRESSION. "NFL" (09-07 → 02-16) sorts ahead of "NFL Preseason"
// (07-21 → 09-03) in ALL_LEAGUES, so once the regular season became UPCOMING
// the old first-config-wins dedupe labelled the row "NFL · 9/9" — a league that
// has not started — on days the preseason column was live and playing games.
// Measured 2026-08-29 and 2026-09-03 before the fix.
test("a live preseason column is never advertised as the not-yet-started league", () => {
  for (const day of ["2026-08-01", "2026-08-22", "2026-08-29", "2026-09-03"]) {
    assert.equal(switcherLabel("nfl", day), "NFL Preseason", `wrong label on ${day}`);
  }
});

// …and it must hand the name back the moment the preseason window closes, or
// the row would advertise an exhibition slate through the real Week 1.
test("the name returns to NFL once the preseason window closes", () => {
  for (const day of ["2026-09-04", "2026-09-13", "2026-12-01"]) {
    assert.equal(switcherLabel("nfl", day), "NFL", `wrong label on ${day}`);
  }
});

// The rule is general, not an NFL special case: any sport with a single config
// still reports that config on every day it is offered.
test("single-config sports are unaffected", () => {
  assert.equal(switcherLabel("mlb", "2026-09-03"), "MLB");
  assert.equal(switcherLabel("ncaaf", "2026-09-03"), "NCAAF");
});

// Preseason has to be legible on the CARD too, because two places have no
// column header saying it: a team's schedule (preseason, regular season and
// playoffs in one list) and a board column that has fallen back to "last game
// played" after 09-03, where an Aug 29 exhibition sits under a plain "NFL".
test("the card marker is suppressed only when the header already says it", () => {
  const card = fs.readFileSync(new URL("../src/components/GameCard.tsx", import.meta.url), "utf8");
  assert.ok(
    /game\.isPreseason && !\/preseason\/i\.test\(leagueLabel \?\? ""\)/.test(card),
    "the Pre chip must render on isPreseason unless the league label already says Preseason",
  );
});

// isPreseason has to come off the season type, not off the column window — the
// window closes on 09-03 while the games it describes stay on the board.
test("isPreseason is derived from the season type", () => {
  const src = fs.readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
  assert.ok(/const isPreseason = event\.season\?\.type === 1;/.test(src));
  assert.ok(/^\s{4}isPreseason,$/m.test(src), "parseGame must return the flag");
});

// The team-schedule endpoint is a DIFFERENT shape from the scoreboard: its
// `season` is only {year, displayName} and the type sits on a sibling
// `seasonType` object. Reading `e.season?.type` there returned 0 for every
// event, which disabled the preseason filter and parseGame's season.type===3
// playoff flag on every team schedule in the app.
test("the team schedule reads season type off seasonType, not season", () => {
  const src = fs.readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
  assert.ok(
    /const resolvedSeasonType = e\.seasonType\?\.type \?\? e\.season\?\.type;/.test(src),
    "must prefer the schedule endpoint's seasonType object",
  );
  // Scoped to fetchTeamSchedule on purpose: the SCOREBOARD path
  // (eventsToGames) reads `e.season?.type ?? 0` and is right to — that shape
  // really does carry the type there. Only the schedule path was wrong.
  const scheduleFn = src.slice(src.indexOf("export async function fetchTeamSchedule("));
  assert.ok(
    !/const seasonType = e\.season\?\.type \?\? 0;/.test(scheduleFn),
    "the old season.type-only read must be gone from fetchTeamSchedule",
  );
});

// ESPN returns ONE season type per call and picks the default itself. On
// 2026-09-04 it defaulted to preseason, so a Lions schedule was three August
// exhibitions and none of the seventeen real games. Ask for each type.
test("gridiron schedules ask for every season type", () => {
  const src = fs.readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
  assert.ok(
    /const seasonTypes = sport === "nfl" \|\| sport === "ncaaf" \? \[1, 2, 3\] : \[undefined\];/.test(src),
    "gridiron must request preseason + regular + postseason",
  );
  assert.ok(/url\.searchParams\.set\("seasontype", String\(seasonType\)\)/.test(src));
});
