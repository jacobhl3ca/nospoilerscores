// The "#N" a college-football card shows next to a team name.
//
// Its own leaf module for two reasons. It is the one league whose rank does NOT
// come from the standings endpoint, so keeping the rule in one testable place
// stops it drifting back onto that path; and lib/espn.ts is not importable from
// a node --test run (its extensionless ./types import doesn't resolve under the
// type-stripping loader), so a helper buried there could not be unit-tested at
// all.
//
// WHY NOT STANDINGS. NCAAF standings entries expose `leagueWinPercent` and
// `wins` but no `winPercent`, which is the stat RANK_METRIC sorts on — so every
// team scored null and fetchStandingsRanks("ncaaf") returned an EMPTY map
// (measured 2026-09-04: 0 entries, against 30 for mlb). No NCAAF card had ever
// rendered a rank. And a win%-sort over 136 FBS teams would say nothing in
// September anyway, when most of the sport is 1-0.
//
// WHAT ESPN GIVES US. `competitor.curatedRank.current` on the scoreboard event:
// the AP Top 25 during the regular season, the CFP committee's ranking once
// that begins — hence the poll-neutral wording on the card's tooltip. The value
// is frozen at kickoff and survives on finished events (verified against
// 2025-11-29, where Michigan reads #15 on a game it lost to #1 Ohio State),
// which is what makes it safe to show on a past card the way the static FIFA
// world ranking is, and unlike every live standings position.

import type { Sport } from "./types";

// The shape this reads off an ESPN competitor. Structural on purpose so both
// espn.ts's RawCompetitor and a test fixture satisfy it.
export type PollRankCompetitor = { curatedRank?: { current?: number } };

// NCAA MEN'S HOCKEY takes the same path, for a stronger reason: its standings
// endpoint is effectively empty. Read 2026-09-12, 10 conference groups held ONE
// entry between them (Ohio State, "24-0-0" with 26 games played), so a win% sort
// would crown a bogus #1. curatedRank there is the USCHO Top 20, frozen onto the
// event the same way (13 of 26 games on 2026-01-17 carried a ranked team, and
// every October 2026 fixture reads 99).
//
// NCAA BASEBALL and SOFTBALL (added 2026-09-14) carry a Top 25 poll on
// curatedRank the same way (UNC 5 / OU null on the 2026 CWS final; Texas Tech
// 11 / Texas 2 on the WCWS final). The 1..25 guard fits both.
//
// NCAA WOMEN'S HOCKEY (2026-09-14): no standings feed at all; curatedRank is the
// USCHO women's Top 15, so the 1..25 guard below already accepts it.
//
// NCAA WOMEN'S VOLLEYBALL (2026-09-14): curatedRank is the AVCA Top 25 on the
// event (1, 2, 3, 4, 8 seen on the 2026-09-12 slate; 99 = unranked).
const POLL_RANK_SPORTS = new Set<Sport>(["ncaaf", "ncaah", "ncaawh", "ncaavb", "ncaabase", "ncaasoft"]);

// Returns null for every sport but the college poll leagues above, and for the two shapes ESPN uses to
// mean "not ranked": the sentinel 99, and an absent curatedRank.
//
// The 1-25 bound is deliberate rather than a bare `!== 99`. The AP Top 25 and
// the CFP ranking stop at 25 (the USCHO poll at 20), so anything from 26 to 98 is a shape we have
// never observed — better to show no chip than to invent a "#41".
export function collegeFootballPollRank(
  competitor: PollRankCompetitor,
  sport: Sport,
): number | null {
  if (!POLL_RANK_SPORTS.has(sport)) return null;
  const current = competitor.curatedRank?.current;
  return typeof current === "number" && current >= 1 && current <= 25 ? current : null;
}
