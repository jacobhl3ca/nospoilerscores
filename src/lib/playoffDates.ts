// 2025-26 season playoff start dates (update each season)
// singularLabel flags a grammatically SINGULAR label so the countdown subtitle
// in LeagueColumn agrees in number ("Postseason starts", "March Madness
// starts") instead of the plural "Playoffs start" default. Without it the
// hard-coded "start" verb rendered "Postseason start Oct 6" / "March Madness
// start tomorrow".
//
// Lives in lib (not LeagueColumn) because espn.ts reads it too: the playoff
// lookahead in fetchLeague (isInPlayoffs) widens the endgame slate between
// this date and the league's championshipDate.
export const PLAYOFF_START_DATES: Record<string, { date: string; label: string; singularLabel?: boolean; preDate?: string; preEndDate?: string; preLabel?: string }> = {
  nba: { date: "2026-04-18", label: "Playoffs", preDate: "2026-04-14", preEndDate: "2026-04-17", preLabel: "Play-in" },
  wnba: { date: "2026-09-14", label: "Playoffs" },
  nhl: { date: "2026-04-18", label: "Playoffs" },
  mlb: { date: "2026-09-29", label: "Postseason", singularLabel: true }, // Wild Card game 1 (StatsAPI postseason/series)
  nfl: { date: "2027-01-09", label: "Playoffs" },
  ncaam: { date: "2026-03-17", label: "March Madness", singularLabel: true },
};
