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
import { isScoreSpoiler } from "./spoilers";

// Keyed `${sport}:${game.id}` — game.id === the ESPN event id the prebake keys
// on. `official` = 1st button (channel recap), `extended` = 2nd button (already
// deduped against `official` at bake time).
export type BakedHighlight = {
  t?: number;
  // When the bake first wrote this game (never rewritten). `t` is refreshed every run.
  firstSeen?: number;
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
  // Length of the `extended` clip, so the 2nd button reads "9m", not "Alt".
  extendedDurationSec?: number;
  mlbOrder?: "official-first";
  sourcePolicy?: "official-channel";
  // Soccer only: the official id came from the match's FotMob page, not from a
  // channel lookup, so officialChannel is whatever uploader FotMob linked (a
  // club, league or broadcaster). The bake gated it through oEmbed, both teams
  // and the upload date. See scripts/lib/fotmob.mjs.
  src?: "fotmob";
  // FotMob official only: false when the uploader refuses every embed but the
  // clip plays on youtube.com (LALIGA EA SPORTS, Ligue 1). The button opens
  // straight on the "Watch on YouTube" card, like the NFL's. officialTitleScore
  // marks a YouTube title that prints the result, so the card says so.
  officialEmbeddable?: false;
  officialTitleScore?: true;
  // La Liga only: ESPN's ~70 s spoiler-free "Game Highlights" mp4, baked when
  // the official is missing or embed-blocked. Plays in-app; never its poster.
  espnClipUrl?: string;
  espnClipHeadline?: string;
  espnClipSec?: number;
};

const BAKED_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

const BAKED_CHANNEL_KEY = {
  official: "officialChannel",
  extended: "extendedChannel",
  telemundo: "telemundoChannel",
  telemundoExtended: "telemundoExtendedChannel",
  club: "clubChannel",
} as const;

// A fresh, official-channel record for exactly this matchup.
function bakedRecordFits(baked: BakedHighlight | null | undefined, expectedAway: string, expectedHome: string): baked is BakedHighlight {
  if (!baked || baked.sourcePolicy !== "official-channel") return false;
  if (!Number.isFinite(baked.t) || Date.now() - Number(baked.t) >= BAKED_MAX_AGE_MS) return false;
  const normalizeTeam = (name: string) => name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const expectedMatchup = [normalizeTeam(expectedAway), normalizeTeam(expectedHome)].sort().join("|");
  return !!baked.matchup && baked.matchup === expectedMatchup;
}

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
  if (!expectedChannel || !bakedRecordFits(baked, expectedAway, expectedHome)) return null;
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

// The baked ESPN clip for this game, or null. Only when the official YouTube
// cut cannot play in our player (missing or embed-blocked), only a direct mp4
// on ESPN's CDN, and only if its headline passes the score check again here.
export function getVerifiedEspnClip(
  baked: BakedHighlight | null | undefined,
  expectedAway: string,
  expectedHome: string,
): { url: string; durationSec: number | null } | null {
  if (!bakedRecordFits(baked, expectedAway, expectedHome) || !baked.espnClipUrl) return null;
  if (baked.official && baked.officialEmbeddable !== false) return null;
  if (!/^https:\/\/[a-z0-9.-]+\.akamaized\.net\/.+\.mp4(\?|$)/i.test(baked.espnClipUrl)) return null;
  if (!baked.espnClipHeadline || isScoreSpoiler(baked.espnClipHeadline)) return null;
  return { url: baked.espnClipUrl, durationSec: Number.isFinite(baked.espnClipSec) ? (baked.espnClipSec as number) : null };
}

// Fetched once per session and shared across every card (one small static
// request vs. N live scrapes). On any miss the promise is cleared so the next
// card retries rather than caching an empty map for the page's whole lifetime.
//
// The manifest is re-read later (refreshBakedHighlights) so an open tab picks up
// a clip the bake adds after the page loaded. Cards subscribe and re-render when
// a re-read brings a different manifest.
let bakedPromise: Promise<Record<string, BakedHighlight>> | null = null;
let bakedCache: Record<string, BakedHighlight> | null = null;
let bakedRaw = "";
const bakedListeners = new Set<() => void>();

function publishBaked(raw: string, games: Record<string, BakedHighlight>) {
  const changed = raw !== bakedRaw;
  bakedRaw = raw;
  bakedCache = games;
  bakedPromise = Promise.resolve(games);
  if (changed) bakedListeners.forEach((cb) => cb());
}

// Reads highlights.json. Returns the games map, or null on any miss (network,
// non-200, or a body with no `games` map: a malformed or partial deploy, an R2
// stub, or a bare `{}` is a miss, not an empty day). A present-but-empty
// `{games:{}}` (a valid day with nothing baked yet) is valid.
async function fetchBaked(): Promise<{ raw: string; games: Record<string, BakedHighlight> } | null> {
  try {
    const res = await fetch(`${getApiBase()}/news/highlights.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.text();
    const data = JSON.parse(raw);
    if (!data?.games) return null;
    return { raw, games: data.games as Record<string, BakedHighlight> };
  } catch {
    return null;
  }
}

export function loadBakedHighlights(): Promise<Record<string, BakedHighlight>> {
  if (!bakedPromise) {
    bakedPromise = (async () => {
      const got = await fetchBaked();
      if (!got) {
        bakedPromise = null;
        return {};
      }
      publishBaked(got.raw, got.games);
      return got.games;
    })();
  }
  return bakedPromise;
}

let bakedRefreshing: Promise<void> | null = null;

// Re-read the manifest now. Listeners fire only when the body changed. One read
// at a time; a miss leaves the current manifest untouched.
export function refreshBakedHighlights(): Promise<void> {
  if (!bakedRefreshing) {
    bakedRefreshing = (async () => {
      const got = await fetchBaked();
      if (got) publishBaked(got.raw, got.games);
    })().finally(() => { bakedRefreshing = null; });
  }
  return bakedRefreshing;
}

export function subscribeBaked(cb: () => void): () => void {
  bakedListeners.add(cb);
  return () => { bakedListeners.delete(cb); };
}

export const BAKED_REFRESH_MS = 10 * 60 * 1000;

// Cards that are finished with no button yet register here. While at least one
// is registered, the manifest is re-read every 10 minutes and whenever the tab
// returns to the front. Counted, so N waiting cards share one timer.
let bakedWatchers = 0;
let bakedTimer: ReturnType<typeof setInterval> | null = null;
function onBakedVisible() {
  if (document.visibilityState === "visible") void refreshBakedHighlights();
}

export function watchBakedHighlights(): () => void {
  if (typeof document === "undefined") return () => {};
  bakedWatchers++;
  if (bakedWatchers === 1) {
    bakedTimer = setInterval(() => { void refreshBakedHighlights(); }, BAKED_REFRESH_MS);
    document.addEventListener("visibilitychange", onBakedVisible);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bakedWatchers--;
    if (bakedWatchers === 0) {
      if (bakedTimer) clearInterval(bakedTimer);
      bakedTimer = null;
      document.removeEventListener("visibilitychange", onBakedVisible);
    }
  };
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
