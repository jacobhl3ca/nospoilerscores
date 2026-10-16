// "Top games" — the Best of yesterday column's span row (Jacob 10/10):
// Yesterday · This week · This month · This year, plus an "All leagues" switch.
//
// Yesterday stays the live column (lib/bestYesterday.ts). The longer spans
// cannot be read live: ESPN answers one day per request (no date ranges since
// 9/16), so a year is ~280 requests per league. The Mac mini bakes them
// instead (scripts/lib/top-games-bake.mjs, run by prebake-news.mjs) into one
// file per span, news/top-games-<span>.json, holding each league's best rated
// finished games in that span. The client picks from those files; the weekly
// post generator (scripts/top-games-post.mjs) reads the same files, so the
// column and the post always agree.
//
// The order is the game's rating — how close it was, never who won — so the
// list says which games are worth the replay without saying how any ended.
// Nothing here ever reads a score.
//
// Pure, so the node unit runner and the bake can load it: type-only imports,
// and the one value import carries the .ts extension node's type stripping needs.
import type { Game, Sport } from "./types";
import { prevYmd } from "./bestYesterday.ts";

export type TopGamesSpan = "yesterday" | "week" | "month" | "year";
export const TOP_GAMES_SPANS: readonly TopGamesSpan[] = ["yesterday", "week", "month", "year"];
// The baked spans. Yesterday is baked too, for the "All leagues" switch: the
// live column only pulls the user's own (at most 8) leagues.
export const TOP_GAMES_BAKED_SPANS: readonly TopGamesSpan[] = TOP_GAMES_SPANS;

export const TOP_GAMES_SPAN_LABEL: Record<TopGamesSpan, string> = {
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  year: "This year",
};
// The column header for each span. "Best of yesterday" is BEST_YESTERDAY_LABEL.
export const TOP_GAMES_COLUMN_LABEL: Record<TopGamesSpan, string> = {
  yesterday: "Best of yesterday",
  week: "Best this week",
  month: "Best this month",
  year: "Best this year",
};
export const TOP_GAMES_EMPTY_LABEL: Record<TopGamesSpan, string> = {
  yesterday: "No highlights from yesterday yet",
  week: "No rated games this week yet",
  month: "No rated games this month yet",
  year: "No rated games this year yet",
};

// Cards per span in the column (Jacob's open question, default 5).
export const TOP_GAMES_COUNT = 5;
// Games the bake keeps per league per span: enough that the top 5 of any
// subset of leagues is always inside the file.
export const TOP_GAMES_KEEP_PER_LEAGUE = 5;
// In a mixed list, at most this many from one league (same as the Yesterday
// column): an NCAAF Saturday would otherwise be the whole week.
export const TOP_GAMES_MAX_PER_LEAGUE = 3;

export function isTopGamesSpan(v: unknown): v is TopGamesSpan {
  return typeof v === "string" && (TOP_GAMES_SPANS as readonly string[]).includes(v);
}

// YYYYMMDD minus n days (UTC math, like prevYmd).
export function minusDays(ymd: string, n: number): string {
  let out = ymd;
  for (let i = 0; i < n; i++) out = prevYmd(out);
  return out;
}

// The first day of a span that ends on `yesterday` (both inclusive). Week and
// month are rolling (the last 7 / 30 days), so Monday's "This week" is never
// empty; the year is the calendar year (Jacob's default, 10/10).
export function spanStartYmd(span: TopGamesSpan, yesterday: string): string {
  if (span === "yesterday") return yesterday;
  if (span === "week") return minusDays(yesterday, 6);
  if (span === "month") return minusDays(yesterday, 29);
  return `${yesterday.slice(0, 4)}0101`;
}

// Finished, not an exhibition, and rated. A postponed game is "post" to ESPN
// too, but never completed.
export function isRatedFinishedGame(game: Game): boolean {
  return game.state === "post" && game.completed && !game.isPreseason && Number.isFinite(game.rating);
}

const dateMs = (game: Game): number => {
  const t = new Date(game.date).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Best rating first, then (among 100s) the uncapped headroom, then the more
// recent game, then a stable key. At most
// `maxPerLeague` from one league and `count` in all. Duplicates (same league +
// id) count once.
export function rankTopGames(
  games: readonly Game[],
  { count = TOP_GAMES_COUNT, maxPerLeague = Infinity }: { count?: number; maxPerLeague?: number } = {},
): Game[] {
  const seen = new Set<string>();
  const pool = games.filter((game) => {
    const key = `${game.sport}:${game.id}`;
    if (seen.has(key) || !isRatedFinishedGame(game)) return false;
    seen.add(key);
    return true;
  });
  pool.sort((a, b) => {
    const dr = (b.rating as number) - (a.rating as number);
    if (dr !== 0) return dr;
    const dx = (b.ratingExcess ?? 0) - (a.ratingExcess ?? 0);
    if (dx !== 0) return dx;
    const dt = dateMs(b) - dateMs(a);
    if (dt !== 0) return dt;
    const ka = `${a.sport}:${a.id}`;
    const kb = `${b.sport}:${b.id}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
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

// One baked span file (news/top-games-<span>.json).
export interface TopGamesFile {
  v: 1;
  span: TopGamesSpan;
  from: string; // YYYYMMDD, inclusive
  to: string; // YYYYMMDD, inclusive (the bake's yesterday, ET)
  generatedAt: string;
  // Each league's best rated finished games in the span, best first, at most
  // TOP_GAMES_KEEP_PER_LEAGUE. Only games with a clip (or, for days older than
  // the clip index, not known to lack one).
  leagues: Partial<Record<Sport, Game[]>>;
}

export function isTopGamesFile(v: unknown): v is TopGamesFile {
  const f = v as TopGamesFile | null;
  return !!f && f.v === 1 && isTopGamesSpan(f.span) && typeof f.leagues === "object" && f.leagues !== null;
}

// The column's (and the post's) list from a span file. `sources` = the leagues
// to draw from (the user's switcher), or null for every league in the file.
// One league → no per-league cap; a mixed list → TOP_GAMES_MAX_PER_LEAGUE.
export function pickTopGames(
  file: TopGamesFile,
  sources: readonly Sport[] | null,
  count = TOP_GAMES_COUNT,
): Game[] {
  const sports = (Object.keys(file.leagues) as Sport[]).filter((s) => !sources || sources.includes(s));
  const games = sports.flatMap((s) => file.leagues[s] ?? []);
  return rankTopGames(games, { count, maxPerLeague: sports.length === 1 ? Infinity : TOP_GAMES_MAX_PER_LEAGUE });
}
