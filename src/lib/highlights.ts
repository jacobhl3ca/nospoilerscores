// Prebaked per-game highlight video IDs, written by scripts/prebake-news.mjs
// (bakeGameHighlights) to /news/highlights.json and deployed with the static
// site. The score-card highlight buttons (GameHighlights.tsx) read these so
// they resolve with ZERO live /api/youtube lookups — buttons appear instantly,
// all at once, no per-card scrape and no stagger. A finished game that isn't
// baked yet (recap uploaded after the last cron) simply falls back to a live
// resolve, so nothing regresses when a bake is missing.
// Relative, not "@/lib/youtube": espn.ts imports this file, and the unit tests
// load espn.ts through jiti, which does not know the "@/" alias.
import { getApiBase } from "./youtube";

// Keyed `${sport}:${game.id}` — game.id === the ESPN event id the prebake keys
// on. `official` = 1st button (channel recap), `extended` = 2nd button (already
// deduped against `official` at bake time).
export type BakedHighlight = {
  t?: number;
  matchup?: string;
  teams?: [string, string];
  eventDate?: string;
  official?: string;
  officialChannel?: string;
  extended?: string;
  extendedChannel?: string;
  telemundo?: string;
  telemundoChannel?: string;
  telemundoExtended?: string;
  telemundoExtendedChannel?: string;
  // NFL regular season only: the shorter CLUB-channel package (see
  // nflTeamChannels.ts) beside the league's cut, plus both durations so the
  // buttons can read "NFL 16m" / "Lions 10m". Bake-only; never live-resolved.
  club?: string;
  clubChannel?: string;
  clubDurationSec?: number;
  officialDurationSec?: number;
  mlbOrder?: "official-first";
  sourcePolicy?: "official-channel";
};

const BAKED_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

const BAKED_CHANNEL_KEY = {
  official: "officialChannel",
  extended: "extendedChannel",
  telemundo: "telemundoChannel",
  telemundoExtended: "telemundoExtendedChannel",
  club: "clubChannel",
} as const;

// A policy label alone is not proof: older manifests carried stale or unscoped
// IDs while still saying "official-channel". Trust a prebaked slot only when it
// names the exact channel the current caller expects. Legacy records safely fall
// back to the same strict live resolver until the next bake adds these markers.
export function getChannelVerifiedBakedId(
  baked: BakedHighlight | null | undefined,
  slot: keyof typeof BAKED_CHANNEL_KEY,
  expectedChannel: string | null | undefined,
  expectedAway: string,
  expectedHome: string,
): string | null {
  if (!baked || baked.sourcePolicy !== "official-channel" || !expectedChannel) return null;
  if (!Number.isFinite(baked.t) || Date.now() - Number(baked.t) >= BAKED_MAX_AGE_MS) return null;
  const normalizeTeam = (name: string) => name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const expectedMatchup = [normalizeTeam(expectedAway), normalizeTeam(expectedHome)].sort().join("|");
  if (!baked.matchup || baked.matchup !== expectedMatchup) return null;
  const actualChannel = baked[BAKED_CHANNEL_KEY[slot]];
  const videoId = baked[slot];
  if (!videoId || actualChannel?.toLowerCase() !== expectedChannel.toLowerCase()) return null;
  // Even two slots from the same approved uploader must never render the same
  // clip under two labels. Reject the duplicate at the client trust boundary;
  // the strict live resolver can refill a distinct slot.
  const duplicated = (Object.keys(BAKED_CHANNEL_KEY) as (keyof typeof BAKED_CHANNEL_KEY)[])
    .some((otherSlot) => otherSlot !== slot && baked[otherSlot] === videoId);
  return duplicated ? null : videoId;
}

// Fetched once per session and shared across every card (one small static
// request vs. N live scrapes). On any miss the promise is cleared so the next
// card retries rather than caching an empty map for the page's whole lifetime.
let bakedPromise: Promise<Record<string, BakedHighlight>> | null = null;
let bakedCache: Record<string, BakedHighlight> | null = null;

export function loadBakedHighlights(): Promise<Record<string, BakedHighlight>> {
  if (!bakedPromise) {
    bakedPromise = (async () => {
      try {
        const res = await fetch(`${getApiBase()}/news/highlights.json`, { cache: "no-store" });
        if (!res.ok) {
          bakedPromise = null;
          return {};
        }
        const data = await res.json();
        // A 200 whose body carries no `games` map — a malformed or partial
        // deploy, an R2 stub, or a bare `{}` — is a miss, not an empty day:
        // clear the promise so the next card retries, rather than caching an
        // empty map for the page's whole lifetime (the documented behavior in
        // this file's header, until now wired only for the !res.ok and
        // thrown-error branches). A present-but-empty `{games:{}}` (a valid day
        // with nothing baked yet) still caches as before — one request, no
        // per-card refetch.
        if (!data?.games) {
          bakedPromise = null;
          return {};
        }
        bakedCache = data.games as Record<string, BakedHighlight>;
        return bakedCache;
      } catch {
        bakedPromise = null;
        return {};
      }
    })();
  }
  return bakedPromise;
}

export function getCachedBakedHighlight(sport: string, id: string): BakedHighlight | null {
  return bakedCache?.[`${sport}:${id}`] ?? null;
}

export async function getBakedHighlight(sport: string, id: string): Promise<BakedHighlight | null> {
  const cached = getCachedBakedHighlight(sport, id);
  if (cached) return cached;
  const games = await loadBakedHighlights();
  return games[`${sport}:${id}`] ?? null;
}
