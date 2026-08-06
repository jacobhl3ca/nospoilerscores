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
  ok: true,
  events: data.events.length,
  tours: data.coverage,
  aug5: { id: aug5.id, broadcast: aug5.broadcasts[0] },
  liveChannels: process.argv.includes("--live"),
}, null, 2));
