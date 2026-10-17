// The Schedule tab (Jacob 10/14): one list of the day's games across every
// league in the switcher, grouped by league, one line per game like the
// widget (time · away @ home · network). Never a score: nothing here reads
// `score`, `winner`, `rating` or `seriesSummary`.
//
// Pure, no React, `.ts` imports: `node --test` loads it directly.

import { startTimeLabel } from "./gameTime.ts";
import { shortNetwork } from "./networkShort.ts";
import type { Game, Sport } from "./types.ts";

// The board's condensed rule (LeagueColumn's renderCondensed): a league with
// 5 or fewer games shows them all; 6+ shows the top 3 and "Show N more".
export const SCHEDULE_FULL_MAX = 5;
export const SCHEDULE_CONDENSE_LIMIT = 3;

// No one-line-per-game shape: an event tile (golf, racing, fights, chess,
// poker, climbing), a tennis draw of athletes, and the two cross-league
// columns, which repeat games the real leagues already list.
export const SCHEDULE_SKIP: ReadonlySet<Sport> = new Set<Sport>([
  "golf", "f1", "nascar", "indycar", "ufc", "boxing", "chess", "poker", "climbing",
  "tennis", "top", "best",
]);

export interface ScheduleTeam {
  abbr: string;
  name: string;
  logo: string;
}

export interface ScheduleRow {
  id: string;
  state: Game["state"];
  // "7:05 PM", "LIVE", "Delay", "Final", "PPD", "Canc."
  timeLabel: string;
  away: ScheduleTeam;
  home: ScheduleTeam;
  network: string | null;
  game: Game;
}

export interface ScheduleGroup {
  sport: Sport;
  label: string;
  // The round every game in the league shares ("ALCS - Game 1"), else null.
  note: string | null;
  rows: ScheduleRow[];
}

export interface ScheduleLeagueInput {
  sport: Sport;
  label: string;
  games: Game[];
}

const chronoMs = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 8.64e15 : t;
};
const isDelayed = (g: Game) => g.state === "in" && /delay/i.test(g.statusDetail ?? "");

// The board's own order for the Games tab (LeagueColumn compareGames with the
// ratings sort off): starred teams first in star order, then live games
// (delayed ones last among them), then by start time. Finished games then drop
// below the rest, as the board's Final divider does.
export function sortScheduleGames(games: readonly Game[], favoriteTeams: readonly string[]): Game[] {
  const favPri = (g: Game) => {
    let best = Infinity;
    for (const id of [g.homeTeam.id, g.awayTeam.id]) {
      const i = favoriteTeams.indexOf(id);
      if (i !== -1 && i < best) best = i;
    }
    return best;
  };
  const cmp = (a: Game, b: Game) => {
    const fa = favPri(a), fb = favPri(b);
    if (fa !== fb) return fa - fb;
    if (a.state === "in" && b.state !== "in") return -1;
    if (b.state === "in" && a.state !== "in") return 1;
    if (a.state === "in" && b.state === "in") {
      const da = isDelayed(a), db = isDelayed(b);
      if (da !== db) return da ? 1 : -1;
    }
    return chronoMs(a.date) - chronoMs(b.date);
  };
  const sorted = [...games].sort(cmp);
  return [...sorted.filter((g) => g.state !== "post"), ...sorted.filter((g) => g.state === "post")];
}

export function scheduleTimeLabel(game: Game, tz?: string): string {
  const detail = game.statusDetail ?? "";
  if (/postpone/i.test(detail)) return "PPD";
  if (/cancel/i.test(detail)) return "Canc.";
  if (game.state === "in") return isDelayed(game) ? "Delay" : "LIVE";
  if (game.state === "post") return "Final";
  return (tz ? startTimeLabel(game, tz) : startTimeLabel(game)) || "TBD";
}

const team = (t: Game["homeTeam"]): ScheduleTeam => ({
  abbr: t.abbreviation || t.shortDisplayName || t.displayName,
  name: t.displayName,
  logo: t.logo,
});

export function scheduleRow(game: Game, tz?: string): ScheduleRow {
  const net = game.broadcasts?.[0];
  return {
    id: game.id,
    state: game.state,
    timeLabel: scheduleTimeLabel(game, tz),
    away: team(game.awayTeam),
    home: team(game.homeTeam),
    network: net ? shortNetwork(net) : null,
    game,
  };
}

// One group per league with games, in the order given (the caller puts the
// board's columns first). Empty leagues and skipped sports drop out.
export function buildSchedule(
  leagues: readonly ScheduleLeagueInput[],
  opts: { favoriteTeams?: readonly string[]; tz?: string } = {},
): ScheduleGroup[] {
  const out: ScheduleGroup[] = [];
  const seen = new Set<Sport>();
  for (const l of leagues) {
    if (SCHEDULE_SKIP.has(l.sport) || seen.has(l.sport)) continue;
    seen.add(l.sport);
    const games = l.games.filter((g) => g.homeTeam && g.awayTeam);
    if (!games.length) continue;
    const labels = new Set(games.map((g) => g.playoffLabel ?? ""));
    const only = labels.size === 1 ? [...labels][0] : "";
    out.push({
      sport: l.sport,
      label: l.label,
      note: only || null,
      rows: sortScheduleGames(games, opts.favoriteTeams ?? []).map((g) => scheduleRow(g, opts.tz)),
    });
  }
  return out;
}

// The rows a league shows: all of them at 5 or fewer, else the top 3 until
// "Show N more" is tapped. `more` = how many the button would add.
export function visibleScheduleRows<T>(rows: readonly T[], expanded: boolean): { shown: T[]; more: number } {
  if (rows.length <= SCHEDULE_FULL_MAX || expanded) return { shown: [...rows], more: 0 };
  return { shown: rows.slice(0, SCHEDULE_CONDENSE_LIMIT), more: rows.length - SCHEDULE_CONDENSE_LIMIT };
}

// The Live filter's "Also live" list (10/14, the FotMob pattern): the same
// groups cut to in-progress games. A league with nothing live drops out.
export function liveScheduleGroups(groups: readonly ScheduleGroup[]): ScheduleGroup[] {
  const out: ScheduleGroup[] = [];
  for (const g of groups) {
    const rows = g.rows.filter((r) => r.state === "in");
    if (rows.length) out.push({ ...g, rows });
  }
  return out;
}

export interface NextScheduleStart {
  sport: Sport;
  label: string;
  timeLabel: string;
  game: Game;
}

// "Nothing live right now · next: NHL 7:00 PM": the earliest game still to
// start across the given leagues. Postponed, cancelled and TBD games sit out,
// and so does a "pre" game whose start is more than 30 minutes gone (a feed
// that never flipped it to live is not "next").
export function nextScheduleStart(
  leagues: readonly ScheduleLeagueInput[],
  nowMs: number,
  tz?: string,
): NextScheduleStart | null {
  let best: NextScheduleStart | null = null;
  let bestMs = Infinity;
  for (const l of leagues) {
    if (SCHEDULE_SKIP.has(l.sport)) continue;
    for (const g of l.games) {
      if (g.state !== "pre" || !g.homeTeam || !g.awayTeam) continue;
      const at = new Date(g.date).getTime();
      if (Number.isNaN(at) || at < nowMs - 30 * 60_000 || at >= bestMs) continue;
      const timeLabel = scheduleTimeLabel(g, tz);
      if (timeLabel === "PPD" || timeLabel === "Canc." || timeLabel === "TBD") continue;
      best = { sport: l.sport, label: l.label, timeLabel, game: g };
      bestMs = at;
    }
  }
  return best;
}
