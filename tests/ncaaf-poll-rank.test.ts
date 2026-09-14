import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { collegeFootballPollRank } from "../src/lib/pollRank.ts";

// College football is the one league whose "#N" cannot come from the standings
// endpoint: NCAAF standings entries expose `leagueWinPercent` and `wins` but no
// `winPercent`, so RANK_METRIC scored every team null and fetchStandingsRanks
// returned an EMPTY map (measured 2026-09-04: 0 entries for ncaaf vs 30 for
// mlb). The rank now comes off the event's own curatedRank instead.
test("a ranked college team gets its poll number", () => {
  for (const [current, expected] of [[1, 1], [10, 10], [25, 25]] as const) {
    assert.equal(collegeFootballPollRank({ curatedRank: { current } }, "ncaaf"), expected);
  }
});

// 99 is ESPN's sentinel for unranked and it is the value on the large majority
// of competitors — 74 of 95 games in the 2026 opening window had NO ranked team.
// Rendering "#99" would be worse than rendering nothing.
test("99 means unranked, not ninety-ninth", () => {
  assert.equal(collegeFootballPollRank({ curatedRank: { current: 99 } }, "ncaaf"), null);
});

test("a missing or unrecognised rank yields no chip", () => {
  assert.equal(collegeFootballPollRank({}, "ncaaf"), null);
  assert.equal(collegeFootballPollRank({ curatedRank: {} }, "ncaaf"), null);
  assert.equal(collegeFootballPollRank({ curatedRank: { current: 0 } }, "ncaaf"), null);
  assert.equal(collegeFootballPollRank({ curatedRank: { current: 26 } }, "ncaaf"), null);
});

// Every other league keeps the standings rank hydrated after the fetch. If this
// ever started returning a number, applyTeamRanks and the poll would fight over
// the same field.
test("no other sport is touched", () => {
  for (const sport of ["mlb", "nfl", "ncaam", "ncaaw", "nba", "nhl"] as const) {
    assert.equal(collegeFootballPollRank({ curatedRank: { current: 3 } }, sport), null);
  }
});

// The two halves have to stay consistent: NCAAF fills `rank` in parseTeam, so it
// must NOT also be in RANK_LEAGUES, or applyTeamRanks would overwrite the poll
// number with a standings position the moment ESPN starts publishing one.
test("ncaaf is not also on the standings-rank path", () => {
  const src = fs.readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const RANK_LEAGUES"), src.indexOf("]);", src.indexOf("const RANK_LEAGUES")));
  assert.ok(!/"ncaaf"/.test(block), "ncaaf must stay out of RANK_LEAGUES");
  const metric = src.slice(src.indexOf("const RANK_METRIC"), src.indexOf("};", src.indexOf("const RANK_METRIC")));
  assert.ok(!/ncaaf:/.test(metric), "ncaaf must stay out of RANK_METRIC");
});

// GameCard shows the college chip on finished and past cards, unlike every
// standings rank. That is only safe because the stored value is frozen at
// kickoff — verified against 2025-11-29, where Michigan reads #15 on a game it
// lost to #1 Ohio State. Guard the branch so nobody re-adds a date gate.
test("the college chip is not hidden on finished cards", () => {
  const card = fs.readFileSync(new URL("../src/components/GameCard.tsx", import.meta.url), "utf8");
  const branch = card.slice(card.indexOf('} else if (game.sport === "ncaaf" || game.sport === "ncaah" || game.sport === "ncaawh" || game.sport === "ncaabase" || game.sport === "ncaasoft") {'), card.indexOf("} else if (team.rank != null"));
  assert.ok(branch.length > 0, "the ncaaf rank branch is gone");
  assert.ok(!/effectivePastDate|isFinished/.test(branch), "the ncaaf rank branch must not re-gate on date/finished");
});
