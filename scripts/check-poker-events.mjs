#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const file = new URL("../public/poker-events.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));

const expected = {
  WSOP: { host: "www.wsop.com", channel: "World Series of Poker", fixture: "Zih5mb_5EVQ" },
  WPT: { host: "www.worldpokertour.com", channel: "World Poker Tour", fixture: "NWeocgkbzis" },
  EPT: { host: "www.pokerstarslive.com", channel: "PokerStars", fixture: "jUDEAbmjn7M" },
  Triton: { host: "www.tritonpokerseries.com", channel: "Triton Poker", fixture: "MLqiK0OHPQs" },
};
const fail = (message) => { throw new Error(message); };
const iso = /^\d{4}-\d{2}-\d{2}$/;

if (data.schemaVersion !== 1) fail("schemaVersion must be 1");
if (JSON.stringify([...data.coverage].sort()) !== JSON.stringify(Object.keys(expected).sort())) {
  fail("coverage must be exactly WSOP/WPT/EPT/Triton");
}

const ids = new Set();
for (const event of data.events) {
  const tour = expected[event.tour];
  if (!tour) fail(`${event.id}: unapproved tour ${event.tour}`);
  if (!event.id || ids.has(event.id)) fail(`${event.id || "<missing>"}: duplicate/missing id`);
  ids.add(event.id);
  if (!iso.test(event.startDate) || !iso.test(event.endDate) || event.startDate > event.endDate) {
    fail(`${event.id}: invalid date window`);
  }
  if (new URL(event.eventUrl).hostname !== tour.host) fail(`${event.id}: non-official source host`);
  if (event.officialChannel !== tour.channel) fail(`${event.id}: channel must be exact oEmbed author_name`);
  if (!event.highlightQuery || !event.broadcasts?.length || !Number.isFinite(event.priority)) {
    fail(`${event.id}: incomplete display/highlight metadata`);
  }
}

const onDate = (ymd) => data.events
  .filter((event) => event.startDate <= ymd && event.endDate >= ymd)
  .sort((a, b) => b.priority - a.priority || a.startDate.localeCompare(b.startDate))[0];
const aug5 = onDate("2026-08-05");
if (aug5?.id !== "wsop-main-final-table-2026-08-05" || aug5.broadcasts[0] !== "ESPN") {
  fail("acceptance fixture failed: 2026-08-05 must resolve to WSOP Main Event Final Table on ESPN");
}

// ── Runway: is the curated calendar about to run out? ───────────────────────
//
// This file is hand-curated on purpose (see lib/poker.ts — a closed tour map, an
// official-host URL per record, an exact oEmbed channel string), and nothing was
// watching it. It was last verified 2026-08-06 and by 2026-09-04 had a two-month
// hole: nothing at all between WPT Australia on Sep 30 and EPT Prague on Dec 2,
// so October and November would have shown a finished series or a major seven
// weeks out (Jacob 9/4).
//
// A scraper is not the answer. Measured 9/4: wsop.com and pokerstarslive.com
// serve their schedules to plain curl, tritonpokerseries.com needs headless
// Chromium, and worldpokertour.com is behind Cloudflare — 403 to curl, and it
// rate-limited a real browser after ONE event page. Any of those four breaking
// silently would leave the file stale exactly the way it already was, with a
// green check on top. So automate the DETECTION and keep the curation manual.
//
// RUNWAY_DAYS is a lead time, not a deadline: 45 days of remaining calendar is
// several weeks' warning before a viewer could ever see the gap, since the tile
// looks up to 120 days ahead for an upcoming major.
// VERIFIED_MAX_DAYS catches the other failure — a file that still has runway
// because its far-future entries were guesses nobody has re-read since.
const RUNWAY_DAYS = 45;
const VERIFIED_MAX_DAYS = 100;
const DAY_MS = 86_400_000;
const todayYmd = new Date().toISOString().slice(0, 10);
const dayGap = (from, to) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

const lastEnd = data.events.map((event) => event.endDate).sort().at(-1);
const runway = lastEnd ? dayGap(todayYmd, lastEnd) : -1;
const verifiedAge = iso.test(data.verifiedAt ?? "") ? dayGap(data.verifiedAt, todayYmd) : Infinity;
const problems = [];
if (runway < RUNWAY_DAYS) {
  problems.push(`only ${runway} days of calendar left (last event ends ${lastEnd}); needs ${RUNWAY_DAYS}+`);
}
if (verifiedAge > VERIFIED_MAX_DAYS) {
  problems.push(`verifiedAt is ${verifiedAge} days old (${data.verifiedAt}); re-read the tour schedules`);
}

if (process.argv.includes("--live")) {
  for (const [tourName, tour] of Object.entries(expected)) {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${tour.fixture}`)}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "HideScore/1.0 (+https://hidescore.com)" } });
    if (!res.ok) fail(`${tourName}: oEmbed fixture returned ${res.status}`);
    const meta = await res.json();
    if (meta.author_name !== tour.channel) fail(`${tourName}: expected ${tour.channel}, got ${meta.author_name}`);
  }
}

console.log(JSON.stringify({
  ok: problems.length === 0,
  runwayDays: runway,
  lastEventEnds: lastEnd,
  verifiedAgeDays: verifiedAge === Infinity ? null : verifiedAge,
  problems,
  events: data.events.length,
  tours: data.coverage,
  aug5: { id: aug5.id, broadcast: aug5.broadcasts[0] },
  liveChannels: process.argv.includes("--live"),
}, null, 2));

// Exit non-zero so the scheduled workflow goes red and GitHub emails the repo
// owner. Deliberately NOT an ntfy push: the ntfy topic in staleness-check.yml
// is inert since that service was retired, and a running-low calendar is a
// "curate this within the month" nudge, not a page.
if (problems.length) {
  for (const problem of problems) console.error(`::error::poker calendar: ${problem}`);
  process.exit(1);
}
