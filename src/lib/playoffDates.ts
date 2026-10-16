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

// European cup knockouts, by date (added 2026-10-14).
//
// ESPN files every Champions Cup and Challenge Cup game, final included, as
// season type 1 with no notes and no week (read 2026-10-14 off the 2025-26
// knockouts: R16 Apr 3–5, QF Apr 10–12, SF May 2–3, finals May 22–23). So
// the feed never says a game is a knockout, and parseGame reads the round off
// this table, keyed on the game's Eastern date. Each round spans its whole
// Thursday-to-Monday weekend; the pool rounds never fall in those weeks.
//
// 2026-27 comes off ESPN's league calendar (read 2026-10-14): R16 from Apr 1,
// QF from Apr 8, SF from Apr 29, Challenge Cup final May 21, Champions Cup
// final May 22. Add the next season's rows when its knockout dates are out;
// a season with no rows reads every game as a pool game, so the pairing cover
// in pairingMask.ts cannot work for it.
export type EpcrSport = "rugbychamp" | "challengecup";

interface KnockoutRound {
  from: string; // YYYY-MM-DD, Eastern, inclusive
  to: string;   // YYYY-MM-DD, Eastern, inclusive
  label: string;
}

const EPCR_ROUNDS: readonly KnockoutRound[] = [
  { from: "2026-04-02", to: "2026-04-06", label: "Round of 16" },
  { from: "2026-04-09", to: "2026-04-13", label: "Quarterfinal" },
  { from: "2026-04-30", to: "2026-05-04", label: "Semifinal" },
  { from: "2026-05-21", to: "2026-05-24", label: "Final" },
  { from: "2027-04-01", to: "2027-04-05", label: "Round of 16" },
  { from: "2027-04-08", to: "2027-04-12", label: "Quarterfinal" },
  { from: "2027-04-29", to: "2027-05-03", label: "Semifinal" },
  { from: "2027-05-20", to: "2027-05-24", label: "Final" },
];

// Both cups share the EPCR calendar, so one table serves the two.
export const EPCR_KNOCKOUT_ROUNDS: Record<EpcrSport, readonly KnockoutRound[]> = {
  rugbychamp: EPCR_ROUNDS,
  challengecup: EPCR_ROUNDS,
};

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isEpcrSport(sport: string): sport is EpcrSport {
  return sport === "rugbychamp" || sport === "challengecup";
}

// The knockout round a Champions Cup or Challenge Cup game belongs to, or null
// for a pool game (or a season with no rows yet).
export function epcrKnockoutRound(sport: EpcrSport, iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = ET_DAY.format(d);
  return EPCR_KNOCKOUT_ROUNDS[sport].find((r) => day >= r.from && day <= r.to)?.label ?? null;
}
