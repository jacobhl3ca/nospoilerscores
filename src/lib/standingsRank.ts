// League-wide "#N" standings rank, resolved from one ESPN standings payload.
//
// Own leaf module (same reason as pollRank.ts): lib/espn.ts is not importable
// from a node --test run, and the two rules below are exactly the kind that
// drift silently — an early-season number that LOOKS like a rank but is just
// ESPN's listing order (Lions "#22" on 2026-09-13 while 30 of 32 NFL teams sat
// at 0-0), and a 0-1 team sorting above 0-0 teams because both are .000.
//
// Two rules:
//  1. EARLY-SEASON GATE. No rank at all until the league has played enough for
//     win% / points to mean something. Measured on the MEDIAN team's games
//     played (a single postponed fixture can't hold the whole league at zero).
//  2. TIEBREAK. Equal metric → fewer losses first, so 0-0 and 0-1 no longer
//     share a coin-flip order.
import type { Sport } from "./types";

export type StandingEntry = {
  team?: { id?: string };
  stats?: Array<{ name?: string; value?: number; displayValue?: string }>;
};

export type StandingsPayload = {
  children?: Array<{ standings?: { entries?: StandingEntry[] } }>;
  standings?: { entries?: StandingEntry[] };
};

// When ESPN groups standings by conference/division (no single league-wide
// rank), we compute an overall rank by sorting every team on the sport's
// primary standings metric, higher = better. Point-table sports use points;
// the rest use win%. Single-table soccer leagues skip this — their own `rank`
// stat is the real position.
export const RANK_METRIC: Partial<Record<Sport, "points" | "winPercent">> = {
  nhl: "points", mls: "points",
  nba: "winPercent", wnba: "winPercent", mlb: "winPercent", nfl: "winPercent", ufl: "winPercent",
  ncaam: "winPercent", ncaaw: "winPercent", ncaaf: "winPercent",
};

// Games the MEDIAN team must have played before "#N" shows. Roughly the first
// fifth of each season — after that the order stops reshuffling every night.
// A league missing here shows its rank from game one (as before).
export const MIN_RANK_GAMES: Partial<Record<Sport, number>> = {
  nfl: 4, ncaaf: 4, ligamx: 4,          // 17-game seasons
  ufl: 2,                               // 10-game spring season
  cfl: 4,                               // 18 (the worker's playoff_seed still reads as listing order at 0-0)
  nba: 15, nhl: 15,                     // 82
  wnba: 8,                              // 44
  mlb: 30,                              // 162
  ncaam: 8, ncaaw: 8,                   // ~30
  epl: 6, laliga: 6, seriea: 6, bundesliga: 6, ligue1: 6, saudi: 6, mls: 6, // 34-38
  nwsl: 5,                              // 26
  efl: 8,                               // 46
  ucl: 3, uel: 3,                       // 8-game league phase
};

const statVal = (e: StandingEntry, name: string): number | null => {
  const s = e.stats?.find((x) => x.name === name);
  if (!s) return null;
  const v = s.value ?? (s.displayValue != null ? parseFloat(s.displayValue) : NaN);
  return Number.isFinite(v) ? (v as number) : null;
};

// NFL / NBA / college standings carry no `gamesPlayed` — sum the record.
export function gamesPlayed(e: StandingEntry): number | null {
  const gp = statVal(e, "gamesPlayed");
  if (gp != null) return gp;
  const w = statVal(e, "wins");
  const l = statVal(e, "losses");
  if (w == null && l == null) return null;
  return (w ?? 0) + (l ?? 0) + (statVal(e, "ties") ?? 0) + (statVal(e, "otLosses") ?? 0);
}

function medianGames(entries: StandingEntry[]): number {
  const xs = entries.map(gamesPlayed).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// True when the league is still too early for a rank to mean anything.
export function tooEarlyToRank(sport: Sport, entries: StandingEntry[]): boolean {
  const min = MIN_RANK_GAMES[sport];
  if (min == null) return false;
  return medianGames(entries) < min;
}

// ESPN standings payload → { teamId -> overall league rank (1 = best) }.
// Empty map = show nothing (too early, or payload unusable).
export function rankFromStandings(sport: Sport, data: StandingsPayload): Map<string, number> {
  const map = new Map<string, number>();
  const groupLists = (data.children ?? [])
    .map((g) => g.standings?.entries ?? [])
    .filter((e) => e.length);
  const flat = data.standings?.entries ?? [];
  const all = groupLists.length ? groupLists.flat() : flat;
  if (!all.length) return map;
  if (tooEarlyToRank(sport, all)) return map;

  // One combined table (most soccer leagues, UCL/UEL league phase): ESPN's
  // `rank` is the real position (with goal-difference tiebreakers baked in).
  const oneTable = groupLists.length <= 1;
  if (oneTable && all.every((e) => statVal(e, "rank") != null)) {
    for (const e of all) {
      const id = e.team?.id;
      const r = statVal(e, "rank");
      if (id && r != null) map.set(id, Math.round(r));
    }
    return map;
  }

  // Conference/division split (or no per-row rank): rank the whole league
  // on its primary metric so "#N" means total-league position, not seed.
  const metric = RANK_METRIC[sport] ?? "winPercent";
  all
    .map((e) => ({
      id: e.team?.id,
      v: statVal(e, metric),
      losses: statVal(e, "losses") ?? 0,
    }))
    .filter((x): x is { id: string; v: number; losses: number } => !!x.id && x.v != null)
    .sort((a, b) => b.v - a.v || a.losses - b.losses)
    .forEach((x, i) => map.set(x.id, i + 1));
  return map;
}
