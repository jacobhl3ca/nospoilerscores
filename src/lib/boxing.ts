import { LeagueEventCard } from "./types";
import { getApiBase } from "./youtube";

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

function dateMs(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getTime();
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

function displayDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

export async function fetchCuratedBoxingEvent(date?: string): Promise<LeagueEventCard | null> {
  try {
    const res = await fetch(`${getApiBase()}/boxing-events.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as BoxingEventsFile;
    if (data.schemaVersion !== 1 || !Array.isArray(data.events)) return null;
    const valid = data.events.filter(validRecord);
    const targetYmd = date && /^\d{8}$/.test(date)
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
    const target = dateMs(targetYmd);
    const chosen = valid
      .filter((event) => event.startDate <= targetYmd && target - dateMs(event.endDate) <= 7 * DAY_MS)
      .sort((a, b) =>
        Number(b.endDate >= targetYmd) - Number(a.endDate >= targetYmd) ||
        b.endDate.localeCompare(a.endDate) || b.priority - a.priority
      )[0];
    if (!chosen) return null;

    const now = Date.now();
    const starts = dateMs(chosen.startDate) - DAY_MS / 2;
    const ends = dateMs(chosen.endDate) + DAY_MS / 2;
    const state: "pre" | "in" | "post" = now < starts ? "pre" : now <= ends ? "in" : "post";
    return {
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
  } catch {
    return null;
  }
}
