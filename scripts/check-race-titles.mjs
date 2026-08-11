#!/usr/bin/env node
// Audits the race-title shortening ladder (src/lib/eventTiles.ts) against
// ESPN's own F1 / NASCAR / IndyCar calendars.
//
// Why this needs a guard: the single-event tile gives its title ONE line beside
// a glyph and nothing else, so a title that can't be shortened gets clipped —
// and on a race tile the clipped tail is the identity of the race ("Heineken
// Dutch Grand …"). The shortenings are therefore load-bearing, and two of them
// are hand-maintained data that goes stale on a season boundary:
//
//   • F1_TITLE_SPONSORS — title sponsors rotate EVERY year. An unlisted one
//     doesn't strip, so the tile falls back to the font step and (on a narrow
//     column) to truncation. Silent.
//   • the NASCAR series prefix — if ESPN renames "NASCAR Cup Series at <track>"
//     the strip stops firing and every NASCAR tile regrows four wasted words.
//
// ⛔ The fix is never "make the regex smarter". Deriving the sponsor from the
// name turns "Mexico City GP" into "City GP" and "MSC Cruises United States GP"
// into "States GP" — a wrongly-named race is worse than a truncated one. When
// this script flags a name, add the sponsor to the list by hand.
//
//   node scripts/check-race-titles.mjs
//   node scripts/check-race-titles.mjs --season=2027
//
// Exits 1 when a title cannot be shortened to something that fits the tile.
// A shortening that produces an EMPTY string also fails — that would blank the
// tile, which is worse than the truncation this whole ladder exists to avoid.
//
// ⚠️ site.api.espn.com 403s a `Mozilla/5.0` UA (the default undici UA is fine)
// and returns ZERO events if you pass `&limit=1000`. Same two traps as the
// IndyCar and season-window checkers.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src", "lib", "eventTiles.ts");

const season = Number(
  (process.argv.find((a) => a.startsWith("--season=")) || "").split("=")[1] || new Date().getFullYear(),
);

// The tile's own budget, in TOKENS rather than characters, so a long single
// word ("Barcelona-Catalunya GP") isn't punished for being one long name while
// "Fictional Bank Dutch GP" — an unstripped sponsor — is caught. Measured
// against the whole 2026 F1 calendar: every correctly-stripped name lands at
// 2-4 tokens, and the widest of them ("Bahrain GP in Malaysia") fits a 3-column
// mobile tile at the 11px floor.
const MAX_TOKENS = 4;

// Parse the sponsor list out of the TypeScript source rather than keeping a
// second copy here — a checker with its own copy validates the bug instead of
// catching it (the lesson check-indycar-tracks.mjs records).
function readSponsors() {
  const src = readFileSync(SRC, "utf8");
  const block = src.match(/export const F1_TITLE_SPONSORS[^[]*\[([\s\S]*?)\n\];/);
  if (!block) {
    console.error("✗ Could not find F1_TITLE_SPONSORS in src/lib/eventTiles.ts — did it move or get renamed?");
    process.exit(1);
  }
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const SPONSORS = readSponsors();

// Mirrors of the three shortenings in eventTiles.ts. Kept in sync BY THE TESTS
// (tests/event-tiles.test.ts pins each one's output), so this file only has to
// stay honest about the data — which it reads from source above.
const stripF1Sponsor = (n) => {
  const s = String(n || "").trim();
  for (const sp of SPONSORS) {
    if (s.toLowerCase().startsWith(sp.toLowerCase() + " ")) return s.slice(sp.length).trim();
  }
  return s;
};
const stripNascar = (n) =>
  String(n || "").replace(/^NASCAR\s+Cup\s+Series\s+(?:at\s+)?/i, "").trim() || String(n || "").trim();
const shortenIndycar = (n) => {
  const m = /^Grand\s+Prix\s+of\s+(.+)$/i.exec(String(n || "").trim());
  return m ? `${m[1].trim()} GP` : String(n || "").trim();
};

const SERIES = [
  { key: "f1", path: "racing/f1", shorten: (name, short) => stripF1Sponsor(short || name) },
  { key: "nascar", path: "racing/nascar-premier", shorten: (name) => stripNascar(name) },
  { key: "indycar", path: "racing/irl", shorten: (name) => shortenIndycar(name) },
];

async function calendar(path) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${season}0101-${season}1231`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const data = await res.json();
  return (data.events ?? []).map((e) => ({ name: e.name ?? "", short: e.shortName ?? "" }));
}

const failures = [];
for (const s of SERIES) {
  let events;
  try {
    events = await calendar(s.path);
  } catch (err) {
    console.error(`✗ ${s.key}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  if (!events.length) {
    console.log(`  ${s.key}: ESPN lists no ${season} events (out of season?) — nothing to check.`);
    continue;
  }
  let worst = 0;
  for (const ev of events) {
    const shortest = s.shorten(ev.name, ev.short);
    const tokens = shortest.split(/\s+/).filter(Boolean).length;
    worst = Math.max(worst, tokens);
    if (!shortest) {
      failures.push(`${s.key}: "${ev.name}" shortens to an EMPTY string — the tile would render blank.`);
    } else if (tokens > MAX_TOKENS) {
      failures.push(
        `${s.key}: "${ev.name}" only shortens to "${shortest}" (${tokens} tokens) — too long for the tile.` +
          (s.key === "f1"
            ? `\n      → add the leading sponsor to F1_TITLE_SPONSORS in src/lib/eventTiles.ts, by hand.`
            : `\n      → ESPN's naming for this series changed; update the ${s.key} shortening.`),
      );
    }
  }
  console.log(`  ${s.key}: ${events.length} ${season} events, longest shortened title ${worst} tokens.`);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} race title(s) cannot be shortened to fit the tile:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`\n✓ Every ${season} race title shortens to something the tile can hold.`);
