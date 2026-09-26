import { EventFetchResult, LeagueEventCard } from "./types";
import { getApiBase } from "./youtube";
import { getEtServiceDate, toYmd } from "./etDay";

interface CuratedBoxingEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  broadcasts: string[];
  eventUrl: string;
  officialChannel: string;
  officialLabel: string;
  highlightQuery: string;
  fixtureVideoId: string;
  priority: number;
}

interface BoxingEventsFile {
  schemaVersion: number;
  events: CuratedBoxingEvent[];
}

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const APPROVED_CHANNELS = new Set(["DAZN Boxing"]);

// `isoDate` MUST be a DASHED calendar date (YYYY-MM-DD) — the format every
// caller here passes (validRecord gates startDate/endDate on DATE_RX, and
// fetchCuratedBoxingEvent dashes the compact date before it reaches dateMs).
// NOT the app's usual compact `ymd` (YYYYMMDD): the param was named `ymd` but
// `new Date("20260809T12:00:00Z")` silently returns Invalid Date (the same
// footgun documented in lib/etDay.ts — the one that vanished the boxing tile on
// 8/10), whose NaN getTime() would make every window comparison false and drop
// the card to "no event". Renamed to keep the dashed-only contract self-evident.
function dateMs(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getTime();
}

function validRecord(event: CuratedBoxingEvent): boolean {
  if (!event.id || !event.title || !DATE_RX.test(event.startDate) || !DATE_RX.test(event.endDate)) return false;
  if (event.startDate > event.endDate || !APPROVED_CHANNELS.has(event.officialChannel)) return false;
  if (!event.highlightQuery || !event.fixtureVideoId || !event.broadcasts?.length) return false;
  try {
    return new URL(event.eventUrl).hostname === "www.youtube.com";
  } catch {
    return false;
  }
}

// Same dashed-only (YYYY-MM-DD) contract as dateMs above — never the compact
// `ymd`, or `new Date("20260809T12:00:00Z")` returns Invalid Date and this
// renders "Invalid Date" in the subtitle.
function displayDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

// See EventFetchResult for why a broken feed and an empty calendar are kept
// apart rather than both collapsing to null.
const EMPTY: EventFetchResult = { card: null, failed: false };
const FAILED: EventFetchResult = { card: null, failed: true };

export async function fetchCuratedBoxingEvent(date?: string): Promise<EventFetchResult> {
  try {
    const res = await fetch(`${getApiBase()}/boxing-events.json`, { cache: "no-store" });
    if (!res.ok) return FAILED;
    const data = (await res.json()) as BoxingEventsFile;
    // A schema we don't recognise is a broken deploy, not an empty calendar.
    if (data.schemaVersion !== 1 || !Array.isArray(data.events)) return FAILED;
    const valid = data.events.filter(validRecord);
    // The no-date "today" fallback must use the app's canonical service day, NOT
    // a hard-coded ET calendar day. getEtServiceDate()/toYmd is the single source
    // of truth (see lib/etDay.ts) that honors the Settings time-zone override and
    // the 1 AM rollover, so the date nav, the data layer, and the sibling
    // fetchChessEvent (which uses the same toYmd(getEtServiceDate())) can't
    // disagree about which day is "today". The old `Intl … timeZone:
    // "America/New_York"` literal ignored a user's chosen zone and would drift a
    // day near midnight for a non-ET user. Both branches now derive a compact
    // YYYYMMDD, then dash it to the YYYY-MM-DD the comparisons below expect.
    const compactYmd = date && /^\d{8}$/.test(date) ? date : toYmd(getEtServiceDate());
    const targetYmd = `${compactYmd.slice(0, 4)}-${compactYmd.slice(4, 6)}-${compactYmd.slice(6, 8)}`;
    const target = dateMs(targetYmd);
    const chosen = valid
      .filter((event) => event.startDate <= targetYmd && target - dateMs(event.endDate) <= 7 * DAY_MS)
      .sort((a, b) =>
        Number(b.endDate >= targetYmd) - Number(a.endDate >= targetYmd) ||
        b.endDate.localeCompare(a.endDate) || b.priority - a.priority
      )[0];
    // The file loaded and simply has nothing for this date — an empty day.
    if (!chosen) return EMPTY;

    const now = Date.now();
    // Curated dates are the fight's LOCAL calendar day, but dateMs anchors each
    // to noon UTC, so `endDate + DAY_MS/2` closed the live window at endDate
    // 24:00 UTC — 5 pm PT / 8 pm ET on fight day. A US card's main event runs in
    // the evening local time, i.e. the late-night/early-morning UTC of the NEXT
    // day, so from ~5 pm PT onward the tile flipped to "Final" (and surfaced the
    // finished-fight highlight button) while the fight was still ahead or under
    // way — spoiler-adjacent. Extend the tail a full day to endDate+1 12:00 UTC
    // (≈ next-morning local) so it stays "Live" through a late US main event and
    // only reads "Final" the following morning. The "pre" edge is unchanged.
    const starts = dateMs(chosen.startDate) - DAY_MS / 2;
    const ends = dateMs(chosen.endDate) + DAY_MS;
    const state: "pre" | "in" | "post" = now < starts ? "pre" : now <= ends ? "in" : "post";
    const card: LeagueEventCard = {
      kind: "boxing",
      title: chosen.title,
      subtitle: `${chosen.location} · ${displayDate(chosen.startDate)}`,
      state,
      statusDetail: state === "in" ? "Live" : state === "post" ? "Final" : "Fight Night",
      date: `${chosen.startDate}T12:00:00Z`,
      broadcasts: chosen.broadcasts,
      eventUrl: chosen.eventUrl,
      highlightQuery: chosen.highlightQuery,
      officialChannel: chosen.officialChannel,
      officialLabel: chosen.officialLabel,
    };
    return { card, failed: false };
  } catch {
    return FAILED;
  }
}
