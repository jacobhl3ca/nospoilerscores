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

// "Live" = today's round is actively in progress. ESPN's
// `competition.status.type.state` is the authoritative round-level signal
// — it flips to "post" the moment the last group signs their card, even
// though the tournament itself remains `event.state === "in"` until R4
// Sunday. Scraping per-player thru (the previous approach) gave false
// negatives between groups and false positives right after a round
// wrapped, which is how recap highlights leaked onto live round days.
export function isGolfLive(tournament: GolfTournament): boolean {
  if (tournament.state !== "in") return false;
  if (tournament.roundStatus !== "in") return false;
  // Belt-and-suspenders: roundStatus === "in" is the primary signal, but
  // require at least one player mid-hole so a stale ESPN status flag can't
  // light up the green indicator during a weather hold with no play.
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
// the team-sport "Playoffs Apr 19" subtitle). The card itself never shows
// round wording anymore — it just mirrors the team-sport live progress
// pattern ("Thru 14" ≈ "Q3 4:32") — so this subtitle always returns a
// string, including while play is happening.
export function getGolfSubtitle(
  tournament: GolfTournament,
  selectedDate: string
): string | null {
  const ds = getGolfDateState(tournament, selectedDate);
  if (!ds) return null;

  // Golf stroke-play events are always 4 rounds. We show the round
  // number out of total ("Round 3 of 4") rather than "After Round N",
  // because ESPN's roundStatus lags — on the morning of a round day it
  // can still report the previous round as "post", which used to render
  // "After Round 3" before round 3 had even teed off. "Round 3 of 4" is
  // unambiguous in every state.
  if (ds.relativeDay === "past") return `Round ${ds.roundNum} of 4`;

  if (ds.relativeDay === "future") {
    // Show ET tee time only when this future date is exactly tomorrow —
    // the eventDate ESPN ships is the *next* tee-off, so it's only
    // meaningful when the user is one day ahead of today. Dropped the
    // trailing " ET" because the combined string was overflowing the
    // column on narrow screens ("Round 3 · 10:30 AM ET" got cut off).
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
          })}`;
        } catch {
          /* ignore */
        }
      }
    }
    return `Round ${ds.roundNum} of 4${timeLabel}`;
  }

  // Today. Always show "Round N of 4" regardless of roundStatus — ESPN's
  // flag can lag into the morning of the next round, so we can't safely
  // emit "After Round N" from it. The card itself renders the live/pre
  // state (green thru indicator, tee time) so the subtitle doesn't need
  // to carry that information.
  return `Round ${ds.roundNum} of 4`;
}

// The round whose recap should appear on the selected date — or 0 if no
// recap should show.
//
// Rule: only show a recap once the round is unambiguously complete, to
// match how team-sport cards withhold highlights until the game is FINAL.
//  • Past dates → always safe to show that day's round recap.
//  • Today + tournament wrapped → show today's round (R4 Sunday case).
//  • Today + roundStatus === "post" → today's round has signed off. The
//    previous implementation leaned on a per-player "is anyone mid-hole?"
//    check which flipped false during lulls and leaked recaps onto live
//    round days; `roundStatus` from ESPN's competition.status is the
//    authoritative round-level signal and doesn't suffer that jitter.
//  • Future dates → never.
export function getGolfRecapRound(
  tournament: GolfTournament,
  selectedDate: string
): number {
  const ds = getGolfDateState(tournament, selectedDate);
  if (!ds) return 0;
  if (ds.relativeDay === "future") return 0;
  if (ds.relativeDay === "past") return ds.roundNum;
  // Today
  if (tournament.state === "post") return ds.roundNum;
  if (
    tournament.roundStatus === "post" &&
    tournament.currentRound >= ds.roundNum
  ) {
    return ds.roundNum;
  }
  return 0;
}
