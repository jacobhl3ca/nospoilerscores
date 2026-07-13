// Prebaked per-game highlight video IDs, written by scripts/prebake-news.mjs
// (bakeGameHighlights) to /news/highlights.json and deployed with the static
// site. The score-card highlight buttons (GameHighlights.tsx) read these so
// they resolve with ZERO live /api/youtube lookups — buttons appear instantly,
// all at once, no per-card scrape and no stagger. A finished game that isn't
// baked yet (recap uploaded after the last cron) simply falls back to a live
// resolve, so nothing regresses when a bake is missing.
import { getApiBase } from "@/lib/youtube";

// Keyed `${sport}:${game.id}` — game.id === the ESPN event id the prebake keys
// on. `official` = 1st button (channel recap), `extended` = 2nd button (already
// deduped against `official` at bake time).
export type BakedHighlight = {
  official?: string;
  extended?: string;
  telemundo?: string;
  telemundoExtended?: string;
  mlbOrder?: "official-first";
  sourcePolicy?: "official-channel";
};

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
        bakedCache = (data?.games ?? {}) as Record<string, BakedHighlight>;
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
