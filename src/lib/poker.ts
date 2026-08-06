import { LeagueEventCard } from "./types";
import { getApiBase } from "./youtube";

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
  try {
    return new URL(event.eventUrl).hostname === OFFICIAL_HOST[event.tour];
  } catch {
    return false;
  }
}

function dateMs(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getTime();
}

function displayWindow(start: string, end: string): string {
  const fmt = (ymd: string, includeMonth = true) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-US", includeMonth ? { month: "short", day: "numeric" } : { day: "numeric" }).format(d);
  };
  if (start === end) return fmt(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start)}–${fmt(end, !sameMonth)}`;
}

export function selectPokerEvent(events: PokerEventRecord[], targetYmd: string): PokerEventRecord | null {
  const valid = events.filter(validRecord);
  const overlapping = valid
    .filter((event) => event.startDate <= targetYmd && event.endDate >= targetYmd)
    .sort((a, b) => b.priority - a.priority || a.startDate.localeCompare(b.startDate));
  if (overlapping.length) return overlapping[0];

  const target = dateMs(targetYmd);
  const upcoming = valid
    .filter((event) => event.startDate > targetYmd && dateMs(event.startDate) - target <= 120 * DAY_MS)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.priority - a.priority);
  if (upcoming.length) return upcoming[0];

  const recent = valid
    .filter((event) => event.endDate < targetYmd && target - dateMs(event.endDate) <= 7 * DAY_MS)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.priority - a.priority);
  return recent[0] ?? null;
}

export async function fetchPokerEvent(date?: string): Promise<LeagueEventCard | null> {
  try {
    const res = await fetch(`${getApiBase()}/poker-events.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as PokerEventsFile;
    if (data.schemaVersion !== 1 || !Array.isArray(data.events)) return null;
    const targetYmd = date && /^\d{8}$/.test(date)
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
    const chosen = selectPokerEvent(data.events, targetYmd);
    if (!chosen) return null;

    const now = Date.now();
    const starts = chosen.startTime ? new Date(chosen.startTime).getTime() : dateMs(chosen.startDate) - DAY_MS / 2;
    const ends = chosen.endTime ? new Date(chosen.endTime).getTime() : dateMs(chosen.endDate) + DAY_MS / 2;
    const state: "pre" | "in" | "post" = now < starts ? "pre" : now <= ends ? "in" : "post";
    const exactBroadcast = !!chosen.startTime;
    return {
      kind: "poker",
      title: `${chosen.tour} ${chosen.title}`.replace(new RegExp(`^${chosen.tour} ${chosen.tour}\\b`), chosen.tour),
      subtitle: [chosen.location, displayWindow(chosen.startDate, chosen.endDate)].filter(Boolean).join(" · "),
      state,
      statusDetail: state === "in" ? "Live" : state === "post" ? "Final" : displayWindow(chosen.startDate, chosen.endDate),
      date: chosen.startTime ?? `${chosen.startDate}T12:00:00Z`,
      broadcasts: chosen.broadcasts,
      highlightQuery: chosen.highlightQuery,
      officialChannel: chosen.officialChannel,
      officialLabel: chosen.officialLabel,
      eventUrl: chosen.eventUrl,
      scheduleLabel: exactBroadcast ? undefined : displayWindow(chosen.startDate, chosen.endDate),
    };
  } catch {
    return null;
  }
}
