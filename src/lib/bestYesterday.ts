// "Best of yesterday" — the cross-league column of yesterday's best games
// (Jacob 9/12: "greatest cross league hoghlights on yesterday - same as top
// events one on todays thing").
//
// Built the way Top events is: a synthetic league ("best") that LeagueColumn
// renders like any other column. Three things differ:
//   1. The day. The pool is YESTERDAY's finished games — the day before the
//      board's own "today" (getEtServiceDate, the same day the date nav and the
//      recap pills use), so a day still being played can never feed it (the
//      9/20 "best of the day" lesson, #96).
//   2. The bar to get in. A card here exists to be played, so only a game with
//      a clip behind it qualifies. A finished game with no play button is left
//      out rather than shown with nothing to press.
//   3. The order. The game's final rating (calculateRating: 60 + 40·progress,
//      so a finished game can reach 100) — how close it was, never who won. It
//      reads closeness, not the score, which is what lets the column say which
//      games are worth the replay without saying how any of them ended.
//
// Pure, so the node unit runner can load it: type-only imports from ./types,
// and the one value import (./topEvents.ts) is pure too and carries the .ts
// extension node's type stripping needs (same as prefsSync → devicePrefs.ts).
import type { Game, Sport } from "./types";
import {
  isTopEventsGameSport,
  TOP_EVENTS_DEFAULT_COUNT,
  TOP_EVENTS_MAX_PER_LEAGUE,
  TOP_EVENTS_MAX_SOURCES,
} from "./topEvents.ts";

// Master switch. Off → the switcher row, the Settings option and the auto-add
// all go, a saved "best" slot resolves to Auto, and nothing fetches yesterday.
export const BEST_YESTERDAY_ENABLED = true;

export const BEST_YESTERDAY_LABEL = "Best of yesterday";
// Same shape as Top events: 8 cards, at most 3 from one league (MLB plays 15 a
// night and would otherwise be the whole column).
export const BEST_YESTERDAY_COUNT = TOP_EVENTS_DEFAULT_COUNT;
export const BEST_YESTERDAY_MAX_PER_LEAGUE = TOP_EVENTS_MAX_PER_LEAGUE;
// Yesterday scoreboards fetched for the column, at most. One request each.
export const BEST_YESTERDAY_MAX_SOURCES = TOP_EVENTS_MAX_SOURCES;
// The column puts itself on the today board (the last Auto column) only when
// at least this many games qualify. Two cards is a column not worth a slot.
export const BEST_YESTERDAY_MIN_GAMES = 3;

// Leagues the column can draw from: two-team game cards whose clips the app
// can play. Top events' set, plus the CFL (baked highlights, not on ESPN's
// strip) and tennis (per-match baked highlights during a Slam).
export function isBestYesterdaySourceSport(sport: Sport): boolean {
  return isTopEventsGameSport(sport) || sport === "cfl" || sport === "tennis";
}

// Which leagues to pull, in the user's order: the caller hands in its own
// ranking (board columns first, then favorite leagues, then the switcher's
// relevance order). Hidden leagues never feed the column, and the list is
// capped so the column cannot fan out into a dozen requests.
export function bestYesterdaySourceSports(
  ordered: readonly Sport[],
  hidden: readonly Sport[] = [],
  max = BEST_YESTERDAY_MAX_SOURCES,
): Sport[] {
  const out: Sport[] = [];
  for (const sport of ordered) {
    if (out.length >= max) break;
    if (!isBestYesterdaySourceSport(sport) || hidden.includes(sport) || out.includes(sport)) continue;
    out.push(sport);
  }
  return out;
}

// Over and done: a postponed game is "post" to ESPN too, but never completed.
export function isFinishedGame(game: Game): boolean {
  return game.state === "post" && game.completed;
}

export interface BestYesterdayContext {
  // The source leagues in the user's order — the tie-break after the rating.
  leagueOrder: readonly Sport[];
  // Does this game have a clip the card will actually play? The caller owns
  // the answer (baked highlights, MLB.com / NHL.com videos) so this stays pure.
  hasClip: (game: Game) => boolean;
  // When the game's clip was baked (highlights.json `t`), the last tie-break.
  bakedAt?: (game: Game) => number | undefined;
  count?: number;
  maxPerLeague?: number;
}

// Finished, has a clip, best rating first → the user's league order → bake
// time → id (stable across re-renders). At most `maxPerLeague` per league and
// `count` in all. The cap is a hard ceiling here, unlike Top events: a quiet
// night with only MLB shows three MLB games, not eight.
export function rankBestYesterday(games: readonly Game[], ctx: BestYesterdayContext): Game[] {
  const count = ctx.count ?? BEST_YESTERDAY_COUNT;
  const maxPerLeague = ctx.maxPerLeague ?? BEST_YESTERDAY_MAX_PER_LEAGUE;
  const leagueRank = (sport: Sport) => {
    const i = ctx.leagueOrder.indexOf(sport);
    return i === -1 ? ctx.leagueOrder.length : i;
  };
  const rating = (game: Game) => (Number.isFinite(game.rating) ? (game.rating as number) : -1);
  const baked = (game: Game) => {
    const t = ctx.bakedAt?.(game);
    return typeof t === "number" && Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  const seen = new Set<string>();
  const pool = games.filter((game) => {
    const key = `${game.sport}:${game.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return isFinishedGame(game) && ctx.hasClip(game);
  });
  pool.sort((a, b) => {
    const dr = rating(b) - rating(a);
    if (dr !== 0) return dr;
    const dl = leagueRank(a.sport) - leagueRank(b.sport);
    if (dl !== 0) return dl;
    const dt = baked(a) - baked(b);
    if (dt !== 0) return dt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const perLeague = new Map<Sport, number>();
  const picked: Game[] = [];
  for (const game of pool) {
    if (picked.length >= count) break;
    const used = perLeague.get(game.sport) ?? 0;
    if (used >= maxPerLeague) continue;
    perLeague.set(game.sport, used + 1);
    picked.push(game);
  }
  return picked;
}

// YYYYMMDD → the previous calendar day. UTC math, like etDay's nextYmd, so a
// DST change in the local zone cannot skip or repeat a day.
export function prevYmd(ymd: string): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
