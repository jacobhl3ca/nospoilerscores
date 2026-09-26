#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const file = new URL("../public/boxing-events.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
const fail = (message) => { throw new Error(message); };
const iso = /^\d{4}-\d{2}-\d{2}$/;
const approvedChannels = new Set(["DAZN Boxing"]);

if (data.schemaVersion !== 1) fail("schemaVersion must be 1");
const ids = new Set();
for (const event of data.events) {
  if (!event.id || ids.has(event.id)) fail(`${event.id || "<missing>"}: duplicate/missing id`);
  ids.add(event.id);
  if (!iso.test(event.startDate) || !iso.test(event.endDate) || event.startDate > event.endDate) {
    fail(`${event.id}: invalid date window`);
  }
  if (!approvedChannels.has(event.officialChannel)) fail(`${event.id}: unapproved official channel`);
  if (new URL(event.eventUrl).hostname !== "www.youtube.com") fail(`${event.id}: source must be an official YouTube upload`);
  if (!event.highlightQuery || !event.fixtureVideoId || !event.broadcasts?.length || !Number.isFinite(event.priority)) {
    fail(`${event.id}: incomplete display/highlight metadata`);
  }
}

// Mirror the production selection in fetchCuratedBoxingEvent (src/lib/boxing.ts)
// EXACTLY so this guard actually validates the window it claims to. Production
// filters on `startDate <= target` (the fight has begun) plus a 7-day-after-end
// retention, and floats a still-open/future card (`endDate >= target`) above
// finished ones in the sort. The old fixture filtered on `endDate <= target`
// and omitted that ongoing-preference term — different logic that happened to
// agree only because every shipped event is single-day; a multi-day card
// ongoing on the target date would pass this guard while production picked a
// different event.
const target = "2026-08-05";
const targetMs = new Date(`${target}T12:00:00Z`).getTime();
const endMs = (event) => new Date(`${event.endDate}T12:00:00Z`).getTime();
const aug5 = data.events
  .filter((event) => event.startDate <= target && targetMs - endMs(event) <= 7 * 86400000)
  .sort((a, b) =>
    Number(b.endDate >= target) - Number(a.endDate >= target) ||
    b.endDate.localeCompare(a.endDate) || b.priority - a.priority
  )[0];
if (aug5?.id !== "roach-zepeda-2026-08-01") fail("acceptance fixture failed: Aug 5 must retain the Aug 1 major");

if (process.argv.includes("--live")) {
  for (const event of data.events) {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${event.fixtureVideoId}`)}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "HideScore/1.0 (+https://hidescore.com)" } });
    if (!res.ok) fail(`${event.id}: oEmbed returned ${res.status}`);
    const meta = await res.json();
    if (meta.author_name !== event.officialChannel) fail(`${event.id}: expected ${event.officialChannel}, got ${meta.author_name}`);
    if (!String(meta.html).includes(`/embed/${event.fixtureVideoId}`)) fail(`${event.id}: oEmbed did not return an embed`);
  }
}

console.log(JSON.stringify({
  ok: true,
  events: data.events.length,
  aug5: { id: aug5.id, channel: aug5.officialChannel },
  liveChannels: process.argv.includes("--live"),
}, null, 2));
