// "Fold games with no playoff stakes" (Settings, Jacob 9/24, rule 10/9): late
// in a season, a game between two teams that are BOTH out of the playoff race
// folds into one tap-to-open row at the end of its day. A game with a team
// still alive stays in the list as it is.
//
// The elimination flag is ESPN's standings `clincher` letter `e`, already read
// by lib/nflPlayoffPicture. Only the NFL feed is read that way today: the MLB
// picture reads MLB StatsAPI (lib/playoffPicture), and no NBA or NHL clincher
// is read anywhere, so the fold is NFL only.
//
// Never folds: a game with a starred team, a live game, or anything at all when
// the standings are missing, stale, or from another season (ESPN keeps serving
// the finished season's table into the next one).
//
// Leaf module (type imports only), so node --test can load it.

import type { Game } from "./types";
import type { NflClinch, NflPicture } from "./nflPlayoffPicture.ts";

export type ClinchSnapshot = {
  // Epoch ms of the fetch.
  at: number;
  season: number | null;
  // Keyed by the board's team id, `nfl-${espnId}` (see lib/espn.ts).
  teams: Record<string, NflClinch | null>;
};

// Older than this and nothing folds.
export const CLINCH_STALE_MS = 12 * 60 * 60 * 1000;

export function nflClinchSnapshot(picture: NflPicture, at: number): ClinchSnapshot {
  const teams: Record<string, NflClinch | null> = {};
  for (const c of picture.conferences) {
    for (const d of c.divisions) {
      for (const t of d.teams) teams[`nfl-${t.id}`] = t.clinch;
    }
  }
  return { at, season: picture.season, teams };
}

// The NFL season a game belongs to: September through February is one season,
// named for the year it starts.
export function nflSeasonOf(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

// In progress, or past its start time with the feed not yet saying so.
const isLive = (g: Game, now: number): boolean =>
  g.state === "in" || (g.state === "pre" && Date.parse(g.date) <= now);

export function splitFoldable(
  games: Game[],
  clinch: ClinchSnapshot | null | undefined,
  favourites: readonly string[],
  now: number,
): { shown: Game[]; folded: Game[] } {
  if (!clinch || clinch.season == null || now - clinch.at > CLINCH_STALE_MS || clinch.at - now > CLINCH_STALE_MS) {
    return { shown: games, folded: [] };
  }
  const out = (id: string) => !!id && clinch.teams[id] === "eliminated" && !favourites.includes(id);
  const shown: Game[] = [];
  const folded: Game[] = [];
  for (const g of games) {
    const fold = g.sport === "nfl"
      && nflSeasonOf(g.date) === clinch.season
      && out(g.homeTeam.id)
      && out(g.awayTeam.id)
      && !isLive(g, now);
    (fold ? folded : shown).push(g);
  }
  return { shown, folded };
}

export function foldRowLabel(n: number): string {
  return `${n} ${n === 1 ? "game" : "games"} between eliminated teams`;
}
