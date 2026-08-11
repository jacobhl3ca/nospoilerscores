#!/usr/bin/env node
// Audits INDYCAR_TRACKS (src/lib/eventTiles.ts) against ESPN's own IndyCar calendar.
//
// Why this needs a guard at all: ESPN publishes NO venue for IndyCar — 15 of
// the 18 events on the 2026 calendar carry neither `competition.venue` nor
// `event.venue` — so the track name on the tile is hand-typed from
// indycar.com's schedule, keyed by ESPN's event name. That key is the fragile
// part. When the 2027 calendar lands, a renamed race ("Grand Prix of Ontario"
// → whatever the next title sponsor calls it) silently drops out of the map and
// the tile goes back to having no subtitle. Nothing throws; nobody notices.
//
//   node scripts/check-indycar-tracks.mjs
//   node scripts/check-indycar-tracks.mjs --season=2027
//
// Exits 1 if any event on ESPN's calendar has no mapping AND no venue of its
// own — i.e. exactly the races that would render bare. An entry in the map that
// ESPN no longer lists is reported as stale but does NOT fail the run: last
// season's races legitimately linger there and cost nothing.
//
// ⚠️ site.api.espn.com 403s a `Mozilla/5.0` UA (the default undici/curl UA is
// fine) and returns ZERO events if you pass `&limit=1000`. Both learned the
// hard way; see the season-windows checker for the same two traps.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src", "lib", "eventTiles.ts");
const ENDPOINT = "https://site.api.espn.com/apis/site/v2/sports/racing/irl/scoreboard";

const season = Number(
  (process.argv.find((a) => a.startsWith("--season=")) || "").split("=")[1] || new Date().getFullYear(),
);

// Parse the map out of the TypeScript source rather than keeping a second copy
// here. A checker with its own copy of the table validates the bug instead of
// catching it — that is exactly how a wrong Liga MX channel string survived a
// monitor for a week (see check-highlight-fallbacks.mjs, which still has the
// problem for OFFICIAL_CHANNELS).
function readTrackKeys() {
  const src = readFileSync(SRC, "utf8");
  const block = src.match(/const INDYCAR_TRACKS[^{]*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.error("✗ Could not find INDYCAR_TRACKS in src/lib/eventTiles.ts — did it move or get renamed?");
    process.exit(1);
  }
  const keys = new Map();
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*"([^"]+)":\s*\{\s*track:\s*"([^"]+)",\s*location:\s*"([^"]+)"/);
    if (m) keys.set(m[1], { track: m[2], location: m[3] });
  }
  return keys;
}

async function fetchSeason(year) {
  const url = `${ENDPOINT}?dates=${year}0101-${year}1231`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  const data = await res.json();
  return (data.events ?? []).map((e) => {
    const comp = (e.competitions ?? []).at(-1) ?? {};
    const venue = comp.venue ?? e.venue ?? {};
    return {
      name: String(e.name || e.shortName || "").trim(),
      date: String(e.date || "").slice(0, 10),
      espnVenue: venue.fullName || null,
    };
  });
}

const tracks = readTrackKeys();
const events = await fetchSeason(season);
if (!events.length) {
  console.error(`✗ ESPN returned no ${season} IndyCar events — endpoint shape changed, or the season isn't published.`);
  process.exit(1);
}

const missing = [];
const seen = new Set();
for (const ev of events) {
  const key = ev.name.toLowerCase();
  seen.add(key);
  const hit = tracks.get(key);
  if (hit) {
    console.log(`  ok   ${ev.date}  ${ev.name}  →  ${hit.track} · ${hit.location}`);
  } else if (ev.espnVenue) {
    console.log(`  espn ${ev.date}  ${ev.name}  →  ${ev.espnVenue} (unmapped, but ESPN supplies a venue)`);
  } else {
    console.log(`  MISS ${ev.date}  ${ev.name}  →  no mapping and no ESPN venue — tile renders bare`);
    missing.push(ev);
  }
}

const stale = [...tracks.keys()].filter((k) => !seen.has(k));
if (stale.length) {
  console.log(`\n  ${stale.length} mapped race(s) not on the ${season} calendar (fine if the season rolled):`);
  for (const k of stale) console.log(`    - ${k}`);
}

console.log(
  `\n${season}: ${events.length} events, ${events.length - missing.length} with a track, ${missing.length} bare.`,
);
if (missing.length) {
  console.error(
    `\n✗ Add these to INDYCAR_TRACKS in src/lib/eventTiles.ts — copy the track name and city\n` +
      `  from indycar.com/schedule, do NOT infer them from the race name:\n` +
      missing.map((e) => `    "${e.name.toLowerCase()}": { track: "?", location: "?" },`).join("\n"),
  );
  process.exit(1);
}
console.log("✓ Every IndyCar race on the calendar resolves to a track.");
