// League-wide recap records, written by scripts/prebake-news.mjs
// (bakeLeagueRecaps → /news/recaps.json). One record per series per coverage
// window: NFL "Top 15 Plays From Week N", MLB FastCast / Real Fast, NBA "Top 10
// Plays of the Night", EPL / MLS "Every goal". LeagueRecapCard renders them on
// top of a league column on past-date boards.
//
// Records carry NO title or thumbnail on purpose — the bake strips them
// (scripts/lib/recaps.mjs stripRecapRecord) because the titles spoil.
import { getApiBase } from "./youtube";

export type RecapRecord = {
  sport: string;
  key: string;
  heading: string;
  label: string;
  cadence: "daily" | "weekly";
  coversDate?: string;   // YYYYMMDD (daily)
  coversWeek?: number;   // weekly
  windowStart?: string;  // YYYYMMDD (weekly)
  windowEnd?: string;    // YYYYMMDD (weekly)
  videoId?: string;      // YouTube
  playbackUrl?: string;  // MLB.com HLS
  poster?: string | null;
  pageUrl: string;
  channel: string;
  durationSec?: number;
  published?: string;
  t?: number;
  sourcePolicy?: "official-channel" | "mlb.com";
};

// The uploader each series is allowed to come from. A record naming any other
// channel is dropped at this trust boundary, the same rule
// getChannelVerifiedBakedId applies to per-game slots. ⚠️ Keep in sync with
// RECAP_SERIES in scripts/lib/recaps.mjs — tests/recaps.test.ts diffs the two.
export const RECAP_EXPECTED_CHANNELS: Record<string, Record<string, string>> = {
  nfl: { top15: "NFL", everytd: "NFL", topplays: "NFL", bestsunday: "NFL" },
  mlb: { fastcast: "MLB.com", realfast: "MLB.com", morninglineup: "MLB" },
  nba: { top10: "NBA" },
  epl: { everygoal: "Premier League", everygoalnbc: "NBC Sports" },
  mls: { everygoal: "Major League Soccer" },
  nhl: { topplays: "NHL" },
};

export function recapChannelVerified(rec: RecapRecord | null | undefined): boolean {
  if (!rec?.sport || !rec.key || !rec.channel) return false;
  const expected = RECAP_EXPECTED_CHANNELS[rec.sport]?.[rec.key];
  return !!expected && expected.toLowerCase() === rec.channel.toLowerCase();
}

// Is `ymd` inside this record's coverage? Weekly = window, daily = the day.
export function recapCoversDay(rec: RecapRecord, ymd: string): boolean {
  if (!/^\d{8}$/.test(ymd)) return false;
  if (rec.cadence === "weekly") {
    return !!rec.windowStart && !!rec.windowEnd && rec.windowStart <= ymd && ymd <= rec.windowEnd;
  }
  return rec.coversDate === ymd;
}

// Fetched once per session (one small static request); on any miss the
// promise is cleared so the next card retries instead of caching an empty map
// for the page's whole lifetime — same idiom as loadBakedHighlights.
let recapsPromise: Promise<Record<string, RecapRecord[]>> | null = null;

export function loadBakedRecaps(): Promise<Record<string, RecapRecord[]>> {
  if (!recapsPromise) {
    recapsPromise = (async () => {
      try {
        const res = await fetch(`${getApiBase()}/news/recaps.json`, { cache: "no-store" });
        if (!res.ok) {
          recapsPromise = null;
          return {};
        }
        const data = await res.json();
        if (!data?.recaps || typeof data.recaps !== "object") {
          recapsPromise = null;
          return {};
        }
        return data.recaps as Record<string, RecapRecord[]>;
      } catch {
        recapsPromise = null;
        return {};
      }
    })();
  }
  return recapsPromise;
}

// Records for one sport that cover `ymd`, uploader-verified, shortest first.
export function selectRecaps(all: Record<string, RecapRecord[]> | null | undefined, sport: string, ymd: string): RecapRecord[] {
  const list = Array.isArray(all?.[sport]) ? all![sport] : [];
  return list
    .filter((rec) => recapChannelVerified(rec) && recapCoversDay(rec, ymd) && (rec.videoId || rec.playbackUrl))
    .sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
}

export async function getRecapsFor(sport: string, ymd: string): Promise<RecapRecord[]> {
  return selectRecaps(await loadBakedRecaps(), sport, ymd);
}

// "▶ 8m" — whole minutes, rounded; under a minute reads in seconds; unknown
// reads as the bare play glyph.
export function formatRecapDuration(sec: number | null | undefined): string {
  if (!Number.isFinite(sec as number) || (sec as number) <= 0) return "";
  const s = sec as number;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.max(1, Math.round(s / 60))}m`;
}

// "Detroit Lions" → "Lions", bare "Raiders" → "Raiders". The club button's label.
export function clubNickname(channel: string | null | undefined): string {
  const words = String(channel ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : "";
}
