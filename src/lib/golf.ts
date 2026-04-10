// Golf-specific helpers shared by GolfLeaderboard (card) and LeagueColumn
// (header subtitle). All round/recap/live logic lives here so the card and
// the league header can't disagree about whether play is happening, which
// round is being played, or which recap to show.

import { GolfTournament } from "./types";

export interface GolfDateState {
  roundNum: number; // 1-4 — the round corresponding to the selected date
  relativeDay: "past" | "today" | "future";
}

// Map a YYYYMMDD viewed date onto a tournament round (or null if the date
// is outside the 4-day window). Past/today/future is computed against ET
// today, since the user could be navigating any date in the calendar.
export function getGolfDateState(
  tournament: GolfTournament,
  selectedDate: string
): GolfDateState | null {
  if (!/^\d{8}$/.test(selectedDate) || !tournament.startDate) return null;
  const selYear = parseInt(selectedDate.slice(0, 4), 10);
  const selMonth = parseInt(selectedDate.slice(4, 6), 10);
  const selDay = parseInt(selectedDate.slice(6, 8), 10);
  const [startMo, startDay] = tournament.startDate.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(startMo) || !Number.isFinite(startDay)) return null;

  const selDateObj = new Date(selYear, selMonth - 1, selDay);
  const startDateObj = new Date(selYear, startMo - 1, startDay);
  const dayIndex = Math.round(
    (selDateObj.getTime() - startDateObj.getTime()) / (24 * 3600 * 1000)
  );
  if (dayIndex < 0 || dayIndex > 3) return null;
  const roundNum = dayIndex + 1;

  const now = new Date();
  const todayET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const todayMidnight = new Date(todayET.getFullYear(), todayET.getMonth(), todayET.getDate());
  const selMidnight = new Date(selYear, selMonth - 1, selDay);

  let relativeDay: "past" | "today" | "future" = "today";
  if (selMidnight.getTime() < todayMidnight.getTime()) relativeDay = "past";
  else if (selMidnight.getTime() > todayMidnight.getTime()) relativeDay = "future";

  return { roundNum, relativeDay };
}

// "Live" = at least one player is mid-hole right now. Using player thru is
// far more reliable than ESPN's statusDetail string, which lingers on
// "Round N" / "After Round N" for hours past the actual play state.
export function isGolfLive(tournament: GolfTournament): boolean {
  if (tournament.state !== "in") return false;
  return tournament.players.some((p) => {
    const n = parseInt(p.thru ?? "", 10);
    return Number.isFinite(n) && n > 0 && n < 18;
  });
}

// The lowest non-F numeric thru in the top 10 — i.e. the latest group still
// on the course. Used as the "Q3 4:32"-style live progress indicator.
export function getGolfLiveThru(tournament: GolfTournament): string {
  const top10 = tournament.players.slice(0, 10);
  let lowest: number | null = null;
  for (const p of top10) {
    if (!p.thru || p.thru === "F") continue;
    const n = parseInt(p.thru, 10);
    if (!Number.isFinite(n)) continue;
    if (lowest === null || n < lowest) lowest = n;
  }
  return lowest === null ? "" : String(lowest);
}

// Italic round subtitle that renders under the league header (parity with
// the team-sport "Playoffs Apr 19" subtitle). Returns null when the live
// indicator on the card should take over instead (today + live).
export function getGolfSubtitle(
  tournament: GolfTournament,
  selectedDate: string
): string | null {
  const ds = getGolfDateState(tournament, selectedDate);
  if (!ds) return null;
  const live = isGolfLive(tournament);

  // Today + live → hide subtitle; the card's live indicator says it all
  if (ds.relativeDay === "today" && live) return null;

  if (ds.relativeDay === "past") return `After Round ${ds.roundNum}`;

  if (ds.relativeDay === "future") {
    // Show ET tee time only when this future date is exactly tomorrow —
    // the eventDate ESPN ships is the *next* tee-off, so it's only
    // meaningful when the user is one day ahead of today.
    let timeLabel = "";
    if (tournament.eventDate) {
      const now = new Date();
      const todayET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const tomorrowMidnight = new Date(
        todayET.getFullYear(),
        todayET.getMonth(),
        todayET.getDate() + 1
      );
      const selY = parseInt(selectedDate.slice(0, 4), 10);
      const selM = parseInt(selectedDate.slice(4, 6), 10) - 1;
      const selD = parseInt(selectedDate.slice(6, 8), 10);
      const selMidnight = new Date(selY, selM, selD);
      if (selMidnight.getTime() === tomorrowMidnight.getTime()) {
        try {
          const d = new Date(tournament.eventDate);
          timeLabel = ` · ${d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York",
          })} ET`;
        } catch {
          /* ignore */
        }
      }
    }
    return `Round ${ds.roundNum}${timeLabel}`;
  }

  // Today, not live: either the round hasn't started yet or it's already wrapped.
  // ESPN's currentRound = number of completed rounds, so >=roundNum means done.
  if (tournament.currentRound >= ds.roundNum) return `After Round ${ds.roundNum}`;
  return `Round ${ds.roundNum}`;
}

// The round whose recap should appear on the selected date — or 0 if no
// recap should show (round in progress, future date, or viewing a date
// other than the day the round was played).
//
// Key rule (Jacob's request 2026-04-10): R1 recap should ONLY appear on
// the R1 day (Thursday) view, never on Friday. Each day shows that day's
// round recap, never the previous day's.
export function getGolfRecapRound(
  tournament: GolfTournament,
  selectedDate: string
): number {
  const ds = getGolfDateState(tournament, selectedDate);
  if (!ds) return 0;
  if (ds.relativeDay === "future") return 0;
  if (ds.relativeDay === "past") return ds.roundNum; // any past round day is done
  // Today: only show if round is fully wrapped (not live + ESPN has logged it)
  if (!isGolfLive(tournament) && tournament.currentRound >= ds.roundNum) {
    return ds.roundNum;
  }
  return 0;
}
