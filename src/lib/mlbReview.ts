// MLB's own round-ups of the season that just ended, written by
// scripts/prebake-news.mjs (bakeMlbSeasonReview → /news/mlb-review.json): the
// monthly Top 25 / Oddities, each playoff round's Top 10 / Oddities, the
// postseason Top 25, MLB Network's year-end shows and the per-team/player
// "Stats & Oddities". Today's MLB column shows a "2026 in review" pill for
// them from the day after the World Series until spring training
// (LeagueRecapCard onShowReview → MlbSeasonReviewModal).
//
// Every record is MLB.com HLS (sourcePolicy "mlb.com"), played in VideoModal
// the same way the "Best of the day" pill plays Top 5 / Oddities.
import { getApiBase } from "./youtube";

export type MlbReviewRec = {
  slug: string;
  pageUrl: string;
  playbackUrl: string;
  poster?: string | null;
  durationSec?: number | null;
  published?: string | null;
  sourcePolicy: "mlb.com";
  channel: "MLB.com";
  // yearEnd only: the show's own title ("Top Bat Flips of 2026"), result-free
  // by the bake's classifier.
  title?: string;
};

export type MlbReviewTeamRec = MlbReviewRec & {
  subject: string;          // "Royals", "Cal Raleigh"
  mlbTeamIds: string[];     // StatsAPI ids
  espnTeamIds: string[];    // ESPN ids — favorites are "mlb-<espnId>"
};

export type MlbReviewSection = "months" | "playoffs" | "teams";

export type MlbReview = {
  fetchedAt: string;
  season: number;
  seasonOver: boolean;
  seasonOverSince?: string; // YYYYMMDD (ET), the first World Series cut
  months: { label: string; order: number; top25: MlbReviewRec | null; oddities: MlbReviewRec | null }[];
  postseasonTop25: MlbReviewRec | null;
  rounds: { key: string; label: string; top10: MlbReviewRec | null; oddities: MlbReviewRec | null }[];
  yearEnd: MlbReviewRec[];
  teams: MlbReviewTeamRec[];
};

// One fetch per session; a miss clears the promise so the next caller retries
// (same idiom as loadBakedRecaps).
let reviewPromise: Promise<MlbReview | null> | null = null;

export function getMlbReview(): Promise<MlbReview | null> {
  if (!reviewPromise) {
    reviewPromise = (async () => {
      try {
        const res = await fetch(`${getApiBase()}/news/mlb-review.json`, { cache: "no-store" });
        if (!res.ok) {
          reviewPromise = null;
          return null;
        }
        const data = await res.json();
        if (!data || typeof data.season !== "number" || !Array.isArray(data.months)) {
          reviewPromise = null;
          return null;
        }
        return data as MlbReview;
      } catch {
        reviewPromise = null;
        return null;
      }
    })();
  }
  return reviewPromise;
}

// Is there anything to open? The pill never leads to an empty modal.
export function mlbReviewHasContent(review: MlbReview | null | undefined): boolean {
  if (!review) return false;
  return review.months.some((m) => m.top25 || m.oddities)
    || review.rounds.some((r) => r.top10 || r.oddities)
    || !!review.postseasonTop25 || review.yearEnd.length > 0 || review.teams.length > 0;
}

// The last day of the pill: Feb 15 of the next year. Pitchers and catchers
// report around Feb 12–15, and from then on the board is about the new season.
export function mlbReviewPillEnd(season: number): string {
  return `${season + 1}0215`;
}

// TODAY's board only, from the first World Series cut's post day up to (not
// including) mlbReviewPillEnd.
export function mlbReviewPillDue(selectedDate: string, review: MlbReview | null | undefined, isToday: boolean): boolean {
  if (!isToday || !review?.seasonOver || !/^\d{8}$/.test(review.seasonOverSince ?? "")) return false;
  if (!/^\d{8}$/.test(selectedDate)) return false;
  return selectedDate >= review.seasonOverSince! && selectedDate < mlbReviewPillEnd(review.season)
    && mlbReviewHasContent(review);
}

// Favorites first, in favorite order (a player's cut counts for his team),
// then everyone else in the file's order. `favoriteTeams` holds "mlb-<espnId>".
export function sortTeamsForFavorites<T extends Pick<MlbReviewTeamRec, "espnTeamIds">>(
  teams: T[],
  favoriteTeams: string[],
): { favorites: T[]; others: T[] } {
  const favIds = favoriteTeams
    .filter((id) => id.startsWith("mlb-"))
    .map((id) => id.slice(4));
  const rank = (t: T) => {
    const hits = (t.espnTeamIds ?? []).map((id) => favIds.indexOf(id)).filter((i) => i >= 0);
    return hits.length ? Math.min(...hits) : -1;
  };
  const favorites = teams.filter((t) => rank(t) >= 0);
  // Stable sort: equal ranks keep the file's order.
  favorites.sort((a, b) => rank(a) - rank(b));
  return { favorites, others: teams.filter((t) => rank(t) < 0) };
}
