// "Remind me" — a personal link template, off by default. Settings → Reminder
// link takes a URL with placeholders; an upcoming game's detail sheet then
// shows a button that opens the filled URL. Serves Raycast
// (raycast://script-commands/timer?arguments={minutes}m%20{title}), Apple
// Shortcuts (shortcuts://run-shortcut?name=…&input=text&text={minutes}),
// Alfred, Things, Todoist — anything with a URL scheme. Nobody sees the button
// unless they typed a template.

import type { CalendarEvent } from "./calendarLink";

// Placeholders: {minutes} (until start, never below 1; {minutes-5} subtracts a
// 5-minute lead), {title}, {iso}, {time} ("3:00 PM"), {date} ("Sat Sep 13").
export const REMINDER_PLACEHOLDERS = ["{minutes}", "{title}", "{iso}", "{time}", "{date}"] as const;

const REQUIRED = /\{(minutes(-\d+)?|iso|title)\}/;
const TOKEN = /\{(minutes(?:-(\d+))?|title|iso|time|date)\}/g;

export interface ReminderFill {
  url: string;
  minutes: number;
}

/**
 * Fill a template for one event. Null when the template is blank or has no
 * {minutes} / {iso} / {title} placeholder — a URL with nothing about the game
 * in it is a bookmark, not a reminder. Every substitution is URL-encoded.
 * `minutes` reports the plain (lead-free) minutes for the button label.
 */
export function fillReminderLink(
  template: string | undefined | null,
  ev: CalendarEvent,
  now: number = Date.now(),
): ReminderFill | null {
  const t = (template || "").trim();
  if (!t || !REQUIRED.test(t)) return null;
  const start = new Date(ev.startIso);
  if (isNaN(start.getTime())) return null;
  const rawMinutes = Math.round((start.getTime() - now) / 60_000);
  const minutes = Math.max(1, rawMinutes);
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  const values: Record<string, string> = {
    title: ev.title,
    iso: ev.startIso,
    time,
    date,
  };
  const url = t.replace(TOKEN, (_m, key: string, lead: string | undefined) => {
    if (key.startsWith("minutes")) return String(Math.max(1, rawMinutes - (lead ? Number(lead) : 0)));
    return encodeURIComponent(values[key]);
  });
  return { url, minutes };
}
