// Pro lacrosse playoff rounds, by date (added 2026-10-13).
//
// ESPN files every PLL and NLL game, finals included, as season type 2
// "regular-season" with no notes, no series object and no week (read
// 2026-10-13 off the whole 2026 PLL season and the 2025-26 NLL season). So the
// feed itself never says a game is a playoff. parseGame reads the round off
// this table instead, keyed on the game's Eastern date.
//
// The table is per season, like PLAYOFF_START_DATES: add the next season's
// rows when its playoff schedule is out. A season with no rows reads every
// game as regular season, so the pairing cover cannot work for it. BACKLOG
// carries the yearly reminder.
//
// Rounds read 2026-10-13:
// - PLL 2026 Championship Series (sixes, Feb 27 → Mar 8): the semifinal Mar 7
//   and the final Mar 8. Both pairings come from the group results.
// - PLL 2026 playoffs: quarterfinals Aug 29 (seeded off the table, so they
//   show), semifinals Sep 7 (Labor Day), Championship Sep 20.
// - NLL 2026 playoffs: quarterfinals Apr 24–25 (single games, 1v8 … 4v5 off
//   the table, so they show), semifinals best of 3 from Apr 30, Finals best of
//   3 from May 14.

export type LacrosseSport = "pll" | "nll";

interface Round {
  from: string; // YYYY-MM-DD, Eastern, inclusive
  to: string;   // YYYY-MM-DD, Eastern, inclusive
  label: string;
}

export const LACROSSE_PLAYOFF_ROUNDS: Record<LacrosseSport, readonly Round[]> = {
  pll: [
    { from: "2026-03-07", to: "2026-03-07", label: "Championship Series Semifinal" },
    { from: "2026-03-08", to: "2026-03-08", label: "Championship Series Final" },
    { from: "2026-08-28", to: "2026-08-30", label: "Quarterfinals" },
    { from: "2026-09-04", to: "2026-09-07", label: "Semifinals" },
    { from: "2026-09-19", to: "2026-09-20", label: "Championship" },
  ],
  nll: [
    { from: "2026-04-23", to: "2026-04-26", label: "Quarterfinals" },
    { from: "2026-04-30", to: "2026-05-11", label: "Semifinals" },
    { from: "2026-05-14", to: "2026-05-25", label: "Finals" },
  ],
};

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-09-20" for an instant, in Eastern time. Null for a date that does not parse.
function etDay(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ET_DAY.format(d);
}

export function isLacrosseSport(sport: string): sport is LacrosseSport {
  return sport === "pll" || sport === "nll";
}

// The playoff round a lacrosse game belongs to, or null for a regular-season
// game (or a season with no rows yet).
export function lacrossePlayoffRound(sport: LacrosseSport, iso: string): string | null {
  const day = etDay(iso);
  if (!day) return null;
  return LACROSSE_PLAYOFF_ROUNDS[sport].find((r) => day >= r.from && day <= r.to)?.label ?? null;
}
