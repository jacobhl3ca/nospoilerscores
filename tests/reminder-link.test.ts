import assert from "node:assert/strict";
import test from "node:test";

import { fillReminderLink } from "../src/lib/reminderLink.ts";
import type { CalendarEvent } from "../src/lib/calendarLink.ts";

const ev: CalendarEvent = {
  title: "Shelton vs Alcaraz · US Open 2026",
  startIso: "2026-09-13T19:00:00Z",
  durationMin: 180,
  description: "https://hidescore.com",
  uid: "tennis-1@hidescore.com",
};
const NOW = Date.parse("2026-09-13T18:13:00Z"); // 47 minutes before
const RAYCAST = "raycast://script-commands/timer?arguments={minutes}m%20{title}";

test("{minutes} counts from a fixed now and {title} is URL-encoded", () => {
  const r = fillReminderLink(RAYCAST, ev, NOW);
  assert.ok(r);
  assert.equal(r.minutes, 47);
  assert.equal(r.url, "raycast://script-commands/timer?arguments=47m%20Shelton%20vs%20Alcaraz%20%C2%B7%20US%20Open%202026");
});

test("{minutes} never drops below 1, even after the start", () => {
  assert.equal(fillReminderLink(RAYCAST, ev, NOW + 60 * 60_000)!.minutes, 1);
  assert.match(fillReminderLink(RAYCAST, ev, NOW + 60 * 60_000)!.url, /arguments=1m/);
});

test("{minutes-N} subtracts a lead; the reported minutes stay lead-free", () => {
  const r = fillReminderLink("x://t?m={minutes-5}", ev, NOW)!;
  assert.equal(r.url, "x://t?m=42");
  assert.equal(r.minutes, 47);
  assert.equal(fillReminderLink("x://t?m={minutes-90}", ev, NOW)!.url, "x://t?m=1");
});

test("blank template and a template with no game placeholder are refused", () => {
  assert.equal(fillReminderLink("", ev, NOW), null);
  assert.equal(fillReminderLink("   ", ev, NOW), null);
  assert.equal(fillReminderLink(undefined, ev, NOW), null);
  assert.equal(fillReminderLink("https://example.com/bookmark", ev, NOW), null);
  assert.equal(fillReminderLink("x://t?when={time}", ev, NOW), null, "{time} alone is not enough");
});

test("{iso}, {time} and {date} fill and are encoded", () => {
  const r = fillReminderLink("shortcuts://run-shortcut?name=HS&input=text&text={iso}|{time}|{date}", ev, NOW)!;
  assert.match(r.url, /text=2026-09-13T19%3A00%3A00Z\|/);
  assert.match(r.url, /\|\d{1,2}%3A\d{2}%20[AP]M\|/);
  assert.match(r.url, /\|Sun%20Sep%2013$|\|Sun%20Sep%2014$/);
});
