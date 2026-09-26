// "Add to calendar" for an upcoming game — the pure half. Builds ONE
// spoiler-free calendar event (title / start / duration / description /
// location / uid) from a Game or an event tile, then renders it as a Google
// Calendar prefill URL or as .ics text for Apple / Outlook. Nothing here
// touches the DOM; the modals decide where the links go (see
// components/CalendarButtons.tsx and lib/openExternal.ts).
//
// ⛔ Spoiler contract: the description carries the broadcast list and the
// hidescore.com link, never a score, a rating, or a record. The event is
// built ONLY for state === "pre", so a finished game can never reach a
// calendar with anything result-adjacent attached.

import type { Game, LeagueEventCard, FightBout } from "./types";
import { buildShareCard } from "./shareCard";

export interface CalendarEvent {
  title: string;
  startIso: string;
  durationMin: number;
  description: string;
  location?: string;
  uid: string;
}

// Typical length per sport, in minutes. A calendar block, not a forecast —
// erring long keeps the slot free through a late finish.
const DURATION_MIN: Record<string, number> = {
  mlb: 180, ncaabase: 180, ncaasoft: 150,
  nfl: 195, ncaaf: 195, cfl: 195,
  nba: 150, wnba: 150, ncaam: 150, ncaaw: 150,
  nhl: 165, ncaah: 165, ncaawh: 165,
  ncaavb: 150,
  tennis: 180,
  golf: 180, f1: 180, nascar: 180, indycar: 180,
  ufc: 240, boxing: 240,
  epl: 120, mls: 120, ucl: 120, uel: 120, fifa: 120, laliga: 120, seriea: 120,
  bundesliga: 120, ligue1: 120, ligamx: 120, nwsl: 120, efl: 120,
  libertadores: 120, euro: 120, afcon: 120, saudi: 120,
  uecl: 120, facup: 120, copadelrey: 120, dfbpokal: 120, nations: 120,
};
const DEFAULT_DURATION_MIN = 150;

export function eventDurationMin(sport: string): number {
  return DURATION_MIN[sport] ?? DEFAULT_DURATION_MIN;
}

const SITE_URL = "https://hidescore.com";
const UID_DOMAIN = "@hidescore.com";

// ESPN's tennis clock is an order-of-play estimate, not a start time. Treat a
// statusDetail as a real clock only when it is JUST a clock ("3:00 PM ET");
// "Not before 3:00 PM", "Followed by", "TBD" all flag an estimate.
const TENNIS_ESTIMATE = /not before|followed by|tbd/i;
const CLOCK = /\d{1,2}:\d{2}/;
export function isTennisTimeEstimate(statusDetail: string): boolean {
  const s = (statusDetail || "").trim();
  if (!s) return true;
  return !CLOCK.test(s) || TENNIS_ESTIMATE.test(s);
}
const TENNIS_ESTIMATE_NOTE = "Start time is ESPN's estimate — check the order of play.";

function teamLabel(t: Game["homeTeam"] | undefined): string {
  return t?.shortDisplayName || t?.displayName || t?.abbreviation || "";
}

function validStart(date: string | undefined): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

function describe(broadcasts: string[], extraNote?: string): string {
  const lines: string[] = [];
  const watch = (broadcasts || []).filter(Boolean).join(" · ");
  if (watch) lines.push(watch);
  if (extraNote) lines.push(extraNote);
  return [lines.join("\n"), SITE_URL].filter(Boolean).join("\n\n");
}

/**
 * Calendar event for an upcoming score-card game, or null when there is no
 * honest event to make: not pre-game, no usable date, a TBD placeholder team,
 * or a tennis match whose date fell back to the tournament day.
 * `leagueLabel` is the column header ("MLB", "Premier League") — the title
 * prefix for team sports; defaults to the sport key upper-cased.
 */
export function buildCalendarEvent(game: Game, leagueLabel?: string): CalendarEvent | null {
  if (!game || game.state !== "pre") return null;
  const start = validStart(game.date);
  if (!start) return null;
  // Same placeholder guard as the share card: a future playoff slot has no
  // team to name.
  const away = game.awayTeam;
  const home = game.homeTeam;
  if (!away?.abbreviation && !away?.shortDisplayName) return null;
  if (!home?.abbreviation && !home?.shortDisplayName) return null;

  const isTennis = game.sport === "tennis";
  if (isTennis && game.dateIsEstimate) return null;

  let title: string;
  let note: string | undefined;
  if (isTennis) {
    // "Shelton vs Alcaraz · US Open 2026 · Quarterfinal · Not before 3:00 PM"
    const parts = [game.shortName || `${teamLabel(away)} vs ${teamLabel(home)}`];
    if (game.seriesNote) parts.push(game.seriesNote);
    if (game.playoffLabel) parts.push(game.playoffLabel);
    if (isTennisTimeEstimate(game.statusDetail)) {
      if (game.statusDetail?.trim()) parts.push(game.statusDetail.trim());
      note = TENNIS_ESTIMATE_NOTE;
    }
    title = parts.join(" · ");
  } else {
    // Away-at-home, the order the card prints.
    const league = leagueLabel || game.sport.toUpperCase();
    title = `${league}: ${teamLabel(away)} at ${teamLabel(home)}`;
  }

  const location = game.venue
    ? [game.venue, game.venueLocation].filter(Boolean).join(", ")
    : undefined;

  const card = buildShareCard(game, leagueLabel);
  const uid = `${card ? card.key : `${game.sport}-${game.id}`}${UID_DOMAIN}`;

  return {
    title,
    startIso: start.toISOString(),
    durationMin: eventDurationMin(game.sport),
    description: describe(game.broadcasts, note),
    location,
    uid,
  };
}

/**
 * Calendar event for an event tile (race / fight card / bout / boxing / chess
 * / poker). Null when the headline (or the tapped bout) is not upcoming, when
 * the date is unusable, or when the tile carries a date WINDOW instead of a
 * clock (poker festivals, `scheduleLabel`).
 */
export function buildEventCalendarEvent(event: LeagueEventCard, fight?: FightBout): CalendarEvent | null {
  if (!event) return null;
  if ((fight?.state ?? event.state) !== "pre") return null;
  if (!fight && event.scheduleLabel) return null;
  const start = validStart(fight?.date ?? event.date);
  if (!start) return null;

  const title = fight ? `${fight.red.name} vs ${fight.blue.name} · ${event.title}` : event.title;
  // The race tile is shared by F1 / NASCAR / IndyCar; officialLabel says which.
  const sport = event.kind === "f1" && event.officialLabel
    ? event.officialLabel.toLowerCase()
    : event.kind;
  const id = fight
    ? `${event.kind}-${fight.id}`
    : `${event.kind}-${slug(event.title)}-${start.toISOString().slice(0, 10)}`;
  return {
    title,
    startIso: start.toISOString(),
    durationMin: eventDurationMin(sport),
    description: describe(event.broadcasts),
    location: event.subtitle || undefined,
    uid: `${id}${UID_DOMAIN}`,
  };
}

function slug(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "2026-09-13T19:05:00.000Z" → "20260913T190500Z" (UTC, the form both Google
// and RFC 5545 take without a TZID).
export function utcStamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function calendarEnd(ev: CalendarEvent): Date {
  return new Date(new Date(ev.startIso).getTime() + ev.durationMin * 60_000);
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const q = [
    ["action", "TEMPLATE"],
    ["text", ev.title],
    ["dates", `${utcStamp(ev.startIso)}/${utcStamp(calendarEnd(ev))}`],
    ["details", ev.description],
    ...(ev.location ? [["location", ev.location]] : []),
  ] as [string, string][];
  return `https://calendar.google.com/calendar/render?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
function icsEscape(s: string): string {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold lines longer than 75 octets (RFC 5545 §3.1) — a continuation line
// starts with one space. Counted in UTF-16 units, which is conservative
// enough for the ASCII-heavy text this app writes.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return out.join("\r\n");
}

export function icsText(ev: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HideScore//hidescore.com//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(ev.startIso)}`,
    `DTEND:${utcStamp(calendarEnd(ev))}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    `URL:${SITE_URL}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsDataUrl(ev: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText(ev))}`;
}

// Filename for the .ics download: the uid without its domain, e.g.
// "hidescore-mlb-nym-phi-20260913.ics".
export function icsFileName(ev: CalendarEvent): string {
  const base = ev.uid.replace(/@.*$/, "").replace(/[^a-z0-9-]/gi, "-");
  return `hidescore-${base}.ics`;
}

// https:// .ics for the native wrapper. SFSafariViewController takes only
// http(s), so a data: URL cannot reach the iOS "Add to Calendar" sheet; the
// worker's /api/ics echoes the text back as text/calendar (public/_worker.js).
export function icsHttpsUrl(ev: CalendarEvent): string {
  return `${SITE_URL}/api/ics?t=${encodeURIComponent(icsText(ev))}`;
}
