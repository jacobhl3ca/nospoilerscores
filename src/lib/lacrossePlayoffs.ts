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

// PLL highlight gate (PR 2, 2026-10-13). The PLL channel titles every 2026
// regular-season cut "Away vs. Home Week N Game Highlights | 2026 Season": a
// week, never a date. Six pairs met two or three times in 2026, so the date
// and year gates cannot pick the meeting, and the live worker served the Week
// 12 Atlas–Outlaws cut for their Week 3 game (probed 2026-10-13). The week is
// the only tell, and ESPN does not send one, so it comes off this table.
//
// Each entry is the Friday a week's weekend starts; the week runs Friday to
// Monday. null marks a weekend with no week number: 2026 Week 7 was All-Star
// weekend (Jul 3–5) and its games are titled by event, not by week. A year
// with no row gets no week, and a PLL game with no week and no round asks for
// no video at all (see pllHighlightGateMissing). Add next season's row when
// its schedule is out; BACKLOG carries the yearly reminder.
const PLL_WEEK_FRIDAYS: Record<number, readonly (string | null)[]> = {
  2026: ["05-08", "05-15", "05-29", "06-05", "06-19", "06-26", null, "07-10", "07-17", "07-24", "07-31", "08-07", "08-14"],
};

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The PLL regular-season week a game belongs to, or null (a playoff, the
// Championship Series, All-Star weekend, or a year with no table row).
export function pllWeekNumber(iso: string): number | null {
  const day = etDay(iso);
  if (!day || lacrossePlayoffRound("pll", iso)) return null;
  const year = Number(day.slice(0, 4));
  const fridays = PLL_WEEK_FRIDAYS[year];
  if (!fridays) return null;
  for (let i = 0; i < fridays.length; i++) {
    const friday = fridays[i];
    if (!friday) continue;
    const from = `${year}-${friday}`;
    if (day >= from && day <= addDays(from, 3)) return i + 1;
  }
  return null;
}

// Title tokens for a PLL playoff cut. The channel titles them "Away vs. Home
// Quarterfinals Game Highlights | 2026 Season", "… Semifinals Game …" and
// "… Championship Game Highlights …". "championship game" never matches a
// Championship Series cut ("… | 2026 Championship Series Final Full Game
// Highlights"). The Championship Series rounds get no tokens: they have no week
// either, so they stay dark. Mirrored by the bake, which loads this file.
export function pllPlayoffTitleTokens(playoffLabel: string | null | undefined): string[] {
  switch (playoffLabel) {
    case "Quarterfinals": return ["quarterfinals"];
    case "Semifinals": return ["semifinals"];
    case "Championship": return ["championship game"];
    default: return [];
  }
}
