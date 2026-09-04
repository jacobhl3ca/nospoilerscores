import { EventFetchResult, LeagueEventCard } from "./types";
import { getApiBase } from "./youtube";

// See EventFetchResult: the curated file being unreachable is not the same
// thing as it having no major on this date.
const EMPTY: EventFetchResult = { card: null, failed: false };
const FAILED: EventFetchResult = { card: null, failed: true };

type PokerTour = "WSOP" | "WPT" | "EPT" | "Triton";

interface PokerEventRecord {
  id: string;
  tour: PokerTour;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  location: string;
  broadcasts: string[];
  eventUrl: string;
  officialChannel: string;
  officialLabel: string;
  highlightQuery: string;
  priority: number;
}

interface PokerEventsFile {
  schemaVersion: number;
  verifiedAt: string;
  coverage: PokerTour[];
  events: PokerEventRecord[];
}

// Exact oEmbed author_name values, verified against a real upload from every
// tour. This is deliberately a closed map: a typo or an unreviewed fifth source
// drops the record instead of weakening the strict YouTube gate.
const OFFICIAL_CHANNEL: Record<PokerTour, string> = {
  WSOP: "World Series of Poker",
  WPT: "World Poker Tour",
  EPT: "PokerStars",
  Triton: "Triton Poker",
};

const OFFICIAL_HOST: Record<PokerTour, string> = {
  WSOP: "www.wsop.com",
  WPT: "www.worldpokertour.com",
  EPT: "www.pokerstarslive.com",
  Triton: "www.tritonpokerseries.com",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function validRecord(event: PokerEventRecord): boolean {
  if (!event.id || !event.title || !DATE_RX.test(event.startDate) || !DATE_RX.test(event.endDate)) return false;
  if (event.startDate > event.endDate || event.officialChannel !== OFFICIAL_CHANNEL[event.tour]) return false;
  // startTime/endTime are the only optional fields, and they drive the pre/in/post
  // state and the card's `date`. Hold them to the same "drop, don't weaken" gate as
  // everything else: an unparseable value slips past the checks above but then makes
  // the state math go NaN — an upcoming card renders "Final" — and the `date` renders
  // "Invalid Date". Reject the record instead.
  if (event.startTime !== undefined && isNaN(new Date(event.startTime).getTime())) return false;
  if (event.endTime !== undefined && isNaN(new Date(event.endTime).getTime())) return false;
  try {
    return new URL(event.eventUrl).hostname === OFFICIAL_HOST[event.tour];
  } catch {
    return false;
  }
}

// `isoDate` MUST be a DASHED calendar date (YYYY-MM-DD) — the format every
// caller here passes (validRecord gates startDate/endDate on DATE_RX, and
// fetchPokerEvent dashes the compact selectedDate before it reaches
// selectPokerEvent). NOT the app's usual compact `ymd` (YYYYMMDD): the param
// was named `ymd` but `new Date("20260809T12:00:00Z")` silently returns Invalid
// Date (see the same footgun documented in lib/etDay.ts), which would make an
// upcoming series read "Final" and its date render "Invalid Date". Renamed to
// keep the dashed-only contract self-evident at the call site.
function dateMs(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getTime();
}

function displayWindow(start: string, end: string): string {
  const fmt = (ymd: string, includeMonth = true) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    // Format in UTC — the instant is deliberately anchored to noon UTC (like
    // dateMs above and boxing.ts's displayDate), so a bare local-zone format
    // reads the wrong calendar day at UTC+12 and further east: noon UTC lands
    // after local midnight there, printing "Aug 17–30" for an Aug 16–29 series.
    // Pin the zone so the printed day is the ymd itself in every zone.
    return new Intl.DateTimeFormat("en-US", includeMonth ? { month: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" }).format(d);
  };
  if (start === end) return fmt(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start)}–${fmt(end, !sameMonth)}`;
}

// Longest-first renderings of the tile's two lines — the same ladder racing
// hands EventCard from lib/eventTiles.ts. Poker shipped ONE string per line, so
// a narrow column had nothing to trade away and went straight to shrinking the
// font; on a 135px card (two columns at 414px) even the 11px floor still
// clipped "Triton Super High Roller · Jeju" (Jacob 9/4). Each rung drops only a
// segment the OTHER line already carries, so no rung loses information the tile
// isn't still showing.
const segments = (text: string): string[] => text.split(" · ").map((part) => part.trim()).filter(Boolean);

// Tours repeat the host city in their own event names — "Triton Super High
// Roller · Jeju" sits directly above "Shinhwa World · Jeju". Drop those trailing
// segments, never the first one: segment 0 IS the event.
// The 3-char floor keeps a short, genuinely load-bearing tail ("Day 1", "Ep 2")
// from being swallowed by an incidental substring hit in the venue.
export function pokerTitleVariants(title: string, location: string): string[] {
  const loc = location.toLowerCase();
  const kept = segments(title);
  const out = [title];
  while (kept.length > 1) {
    const tail = kept[kept.length - 1];
    if (tail.length < 3 || !loc.includes(tail.toLowerCase())) break;
    kept.pop();
    out.push(kept.join(" · "));
  }
  return [...new Set(out)];
}

// Venue line: full venue + dates, then the venue's leading segment + dates,
// then the dates alone. The dates are the last thing to go because they are the
// only part a live tile's meta row does NOT already repeat.
export function pokerSubtitleVariants(location: string, dateWindow: string): string[] {
  const lead = segments(location)[0];
  return [...new Set([
    [location, dateWindow].filter(Boolean).join(" · "),
    [lead, dateWindow].filter(Boolean).join(" · "),
    dateWindow,
  ].filter(Boolean))];
}

// How far back a PAST board date will walk to find the event that had already
// happened."" Matches the 45-day window fetchLeagueEvent uses for F1/UFC/NASCAR
// (see the past-date lookback in lib/espn.ts) — long enough to bridge the gap
// between poker majors, short enough that a pre-season date still reads as
// upcoming rather than dredging up last year's series.
const PAST_LOOKBACK_DAYS = 45;
// On today/future dates a just-missed event stays claimable for a week, which
// is what keeps "Final + replay" on the board the day after a series ends.
const RECENT_DAYS = 7;

// `preferPast` = the viewed board date is in the past. A past date must walk
// BACKWARD (overlapping → most recent finished → upcoming) instead of the
// forward default, or every past tab shows the NEXT major in state "pre" and
// the replay button — which only renders on a finished tile — is unreachable.
// Bug seen 2026-08-09 (Jacob 8/10): Yesterday rendered "EPT Barcelona ·
// Aug 16–29" instead of the WSOP Main Event Final Table that had just wrapped.
// Same fix, and same reasoning, as the F1/UFC/chess past-date walk-back.
export function selectPokerEvent(
  events: PokerEventRecord[],
  targetYmd: string,
  preferPast = false,
): PokerEventRecord | null {
  const valid = events.filter(validRecord);
  const overlapping = valid
    .filter((event) => event.startDate <= targetYmd && event.endDate >= targetYmd)
    .sort((a, b) => b.priority - a.priority || a.startDate.localeCompare(b.startDate));
  if (overlapping.length) return overlapping[0];

  const target = dateMs(targetYmd);
  const windowDays = preferPast ? PAST_LOOKBACK_DAYS : RECENT_DAYS;
  const upcoming = valid
    .filter((event) => event.startDate > targetYmd && dateMs(event.startDate) - target <= 120 * DAY_MS)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.priority - a.priority);
  const recent = valid
    .filter((event) => event.endDate < targetYmd && target - dateMs(event.endDate) <= windowDays * DAY_MS)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.priority - a.priority);

  // NEAREST IN TIME wins — not a fixed past-then-future preference.
  //
  // The fixed order let a finished series own every board date right up to the
  // day the next one started: EPT Barcelona ended Aug 29 and still rendered
  // "Final" on Aug 30, 31, Sep 1, 2 and 3, while Triton Jeju was ONE day out on
  // Sep 3 (Jacob 9/4: "shouldn't it be the final video and done? it's not the
  // last one"). Poker majors sit weeks apart, so `recent` first — copied from
  // leagues that run every week — reads as a stale board rather than a replay.
  //
  // Distance keeps the 2026-08-09 fix this walk-back was written for: the day
  // after the WSOP Main Event final table, the finished WSOP is 1 day back and
  // EPT Barcelona 10 days out, so the replay still wins. It also makes the
  // forward path do what RECENT_DAYS already claimed — "Final + replay" stays
  // on the board the day after a series ends, which the old
  // [upcoming, recent] order never actually allowed whenever ANY major was
  // scheduled inside 120 days (i.e. almost always).
  //
  // Eligibility is still the asymmetric window above: a past date may reach 45
  // days back, a today/future date only 7. Ties go the way the viewed date
  // leans — a past date keeps the finished event, today/future takes the next.
  const next = upcoming[0];
  const last = recent[0];
  if (!next || !last) return next ?? last ?? null;
  const toNext = dateMs(next.startDate) - target;
  const toLast = target - dateMs(last.endDate);
  if (toNext === toLast) return preferPast ? last : next;
  return toLast < toNext ? last : next;
}

export async function fetchPokerEvent(date?: string): Promise<EventFetchResult> {
  try {
    const res = await fetch(`${getApiBase()}/poker-events.json`, { cache: "no-store" });
    if (!res.ok) return FAILED;
    const data = (await res.json()) as PokerEventsFile;
    // A schema we don't recognise is a broken deploy, not an empty calendar.
    if (data.schemaVersion !== 1 || !Array.isArray(data.events)) return FAILED;
    const todayYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const targetYmd = date && /^\d{8}$/.test(date)
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : todayYmd;
    const chosen = selectPokerEvent(data.events, targetYmd, targetYmd < todayYmd);
    // The file loaded and simply has no major in range — an empty stretch.
    if (!chosen) return EMPTY;

    const now = Date.now();
    const starts = chosen.startTime ? new Date(chosen.startTime).getTime() : dateMs(chosen.startDate) - DAY_MS / 2;
    const ends = chosen.endTime ? new Date(chosen.endTime).getTime() : dateMs(chosen.endDate) + DAY_MS / 2;
    const state: "pre" | "in" | "post" = now < starts ? "pre" : now <= ends ? "in" : "post";
    const exactBroadcast = !!chosen.startTime;
    const dateWindow = displayWindow(chosen.startDate, chosen.endDate);
    const title = `${chosen.tour} ${chosen.title}`.replace(new RegExp(`^${chosen.tour} ${chosen.tour}\\b`), chosen.tour);
    const card: LeagueEventCard = {
      kind: "poker",
      title,
      titleVariants: pokerTitleVariants(title, chosen.location),
      subtitle: [chosen.location, dateWindow].filter(Boolean).join(" · "),
      subtitleVariants: pokerSubtitleVariants(chosen.location, dateWindow),
      state,
      statusDetail: state === "in" ? "Live" : state === "post" ? "Final" : dateWindow,
      date: chosen.startTime ?? `${chosen.startDate}T12:00:00Z`,
      broadcasts: chosen.broadcasts,
      highlightQuery: chosen.highlightQuery,
      officialChannel: chosen.officialChannel,
      officialLabel: chosen.officialLabel,
      eventUrl: chosen.eventUrl,
      scheduleLabel: exactBroadcast ? undefined : dateWindow,
    };
    return { card, failed: false };
  } catch {
    return FAILED;
  }
}
