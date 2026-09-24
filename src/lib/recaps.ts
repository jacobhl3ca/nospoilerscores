// League-wide recap records, written by scripts/prebake-news.mjs
// (bakeLeagueRecaps → /news/recaps.json). One record per series per coverage
// window: NFL "Top 15 Plays From Week N", MLB FastCast / Real Fast, NBA "Top 10
// Plays of the Night", EPL / MLS "Every goal". LeagueRecapCard renders them on
// top of a league column on past-date boards.
//
// Records carry NO title or thumbnail on purpose — the bake strips them
// (scripts/lib/recaps.mjs stripRecapRecord) because the titles spoil.
import { getApiBase } from "./youtube";
import { getEtServiceDate, toYmd } from "./etDay";

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
  // Days inside the window the record must NOT cover — for the NFL, next
  // week's Sunday, so a completed week's cut never sits on top of a live
  // football Sunday. See nflWeekWindow in scripts/lib/recaps.mjs.
  skipDays?: string[];
  videoId?: string;      // YouTube
  playbackUrl?: string;  // MLB.com HLS
  poster?: string | null;
  pageUrl: string;
  channel: string;
  durationSec?: number;
  published?: string;
  t?: number;
  sourcePolicy?: "official-channel" | "mlb.com";
  // Bake-time verdict from YouTube's /embed/ shell. The NFL blocks embeds per
  // video, so `true` lets a cut play in the modal despite its channel.
  embeddable?: boolean;
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
    return !!rec.windowStart && !!rec.windowEnd && rec.windowStart <= ymd && ymd <= rec.windowEnd
      && !(rec.skipDays ?? []).includes(ymd);
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
// Weekly windows from different uploaders are approximate and can overlap by a
// day (EPL: the PL channel's Matchweek 4 and NBC's Matchweek 3 both cover the
// Monday between them), so when matching weekly records disagree on the week
// only the latest week is kept — one heading, one set of buttons.
export function selectRecaps(
  all: Record<string, RecapRecord[]> | null | undefined,
  sport: string,
  ymd: string,
  // The board's own "today". A DAILY cut of a day that has not finished cannot
  // exist — MLB's "Best of the day" for tonight's slate posts tomorrow morning
  // — so a daily record dated today or later is premature and never renders
  // (Jacob 9/20: a 9m "Best of the day" sat on top of MLB's live Sunday board,
  // stamped today because the bake could not read the upload time). Weekly
  // records are unaffected: the NFL week pill belongs on a live Thursday.
  todayYmd?: string,
): RecapRecord[] {
  const list = Array.isArray(all?.[sport]) ? all![sport] : [];
  const today = /^\d{8}$/.test(todayYmd ?? "") ? todayYmd! : "";
  const hits = list.filter((rec) => recapChannelVerified(rec) && recapCoversDay(rec, ymd) && (rec.videoId || rec.playbackUrl)
    && !(rec.cadence === "daily" && today && (rec.coversDate ?? "") >= today));
  const weeks = hits.map((r) => (r.cadence === "weekly" ? r.coversWeek : undefined)).filter((w): w is number => Number.isFinite(w));
  const latestWeek = weeks.length ? Math.max(...weeks) : null;
  return hits
    .filter((rec) => rec.cadence !== "weekly" || latestWeek === null || rec.coversWeek === latestWeek)
    .sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
}

export async function getRecapsFor(sport: string, ymd: string): Promise<RecapRecord[]> {
  // Same "today" the date nav uses, so the gate agrees with the board.
  return selectRecaps(await loadBakedRecaps(), sport, ymd, toYmd(getEtServiceDate()));
}

// "▶ 8m" — whole minutes, rounded; under a minute reads in seconds; unknown
// reads as the bare play glyph.
export function formatRecapDuration(sec: number | null | undefined): string {
  if (!Number.isFinite(sec as number) || (sec as number) <= 0) return "";
  const s = sec as number;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.max(1, Math.round(s / 60))}m`;
}

// Below this column width the recap pill stacks its heading over its buttons
// (LeagueRecapCard). One row cannot hold both on a phone: a 390px viewport
// gives a column 114px, the pill 92px inside its padding, and the NFL's three
// cuts ("6m", "17m", "30m", each ~47px with the play glyph) alone run ~150px —
// they spilled straight into the next column (Jacob 9/24), and MLB's two cuts
// (~92px) left "Best of the day" with no room at all, so it read "Best of…".
// The sm column (192px, 170px inside) loses the same fight: NFL's row wants
// ~197px, MLB's ~195px. From md up (225px+, 203px inside) both fit, so 200 is
// the line. Same idea as HEADER_SHORT_LABEL_MAX_PX in leagueLabels.
export const RECAP_STACK_MAX_PX = 200;

// The heading on that stacked, narrow layout: the line is 100px wide at 390px,
// about 14 characters of 11.5px semibold. The NFL week goes to "W2" (Jacob
// 9/24: "w2 flip"); the rest change only where the full form would not fit. A
// heading that still overflows its line is dropped by the card — buttons only,
// their aria-labels keep the series name (Jacob: "to nothing if none fit").
export function shortRecapHeading(heading: string): string {
  return heading
    .replace(/^Week (\d+)$/i, "W$1")                         // NFL "Week 2" → "W2"
    .replace(/^Best of the day$/i, "Best of day")           // MLB, 15 → 11
    .replace(/^Every goal, /i, "")                           // EPL/MLS: "Matchweek 36" / "Matchday 31"
    .replace(/ of the night$/i, "");                         // NBA "Top 10 plays", NHL "Top plays"
}

// The headings the stacked layout tries, longest first; the card shows the
// first that fits its line. The NFL week leads with "Week 2 highlights" (Jacob
// 9/24: "since its a new line now can put full description"): 91–99px for
// weeks 1–18 against the 100px line at 390px (measured 2026-09-24, Geist 600
// 11.5px tight), so a narrower phone falls back to "W2".
export function stackedRecapHeadings(heading: string): string[] {
  const short = shortRecapHeading(heading);
  const week = heading.match(/^Week (\d+)$/i);
  return week ? [`Week ${week[1]} highlights`, short] : [short];
}

// "Detroit Lions" → "Lions", bare "Raiders" → "Raiders". The club button's label.
export function clubNickname(channel: string | null | undefined): string {
  const words = String(channel ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : "";
}
