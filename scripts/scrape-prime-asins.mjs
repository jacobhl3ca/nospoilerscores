// Scrape Prime Video's sports hub to build a matchup → ASIN map so HideScore
// can deep-link Prime broadcasts straight to the per-game /gp/video/detail
// page (one click to play) instead of the generic Prime sports landing.
//
// Runs from GitHub Actions on a cron. Failures are non-fatal: if the scrape
// fails or returns nothing parseable, we keep the previous file so the site
// falls back gracefully.
//
// Output shape (public/prime-asins.json):
//   {
//     "generatedAt": "2026-04-18T12:00:00Z",
//     "matchups": {
//       "raptors vs. cavaliers": "B0GX1TS2BB",
//       "chiefs vs. bills": "B0XXXXXXXX",
//       ...
//     }
//   }
//
// The key is the lowercased "Away vs. Home" string as Prime renders it in
// the tile's aria-label. The frontend builds the same key from ESPN's
// shortDisplayName values, which match Prime's team labels in the common
// case.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SOURCES = [
  "https://www.primevideo.com/sports",
  "https://www.primevideo.com/storefront/home/?contentType=sports",
];
const OUT_PATH = resolve("public/prime-asins.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept-language": "en-US,en;q=0.9",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function extractMatchups(html) {
  const found = new Map();
  // Prime renders each event tile with an aria-label containing the matchup
  // (e.g. "Raptors vs. Cavaliers") and a sibling link to /detail/{id}.
  // The id comes in two formats: classic ASINs ("B0XXXXXXXX", 10 chars) for
  // older on-demand content and GTI-style ids (26 alphanumeric chars starting
  // with "0") for newer live events. Both work under both primevideo.com/detail
  // and amazon.com/gp/video/detail paths.
  const ariaRegex = /aria-label="([^"]+\s+vs\.\s+[^"]+)"/gi;
  let m;
  while ((m = ariaRegex.exec(html))) {
    const matchup = m[1].trim();
    // Skip obvious non-matchups ("More details for …", highlight labels)
    if (/^more details/i.test(matchup)) continue;
    const start = Math.max(0, m.index - 400);
    const end = Math.min(html.length, m.index + 2200);
    const window = html.slice(start, end);
    const idMatch = window.match(/\/detail\/((?:B0[A-Z0-9]{8})|[A-Z0-9]{20,40})/);
    if (!idMatch) continue;
    const key = matchup.toLowerCase();
    if (!found.has(key)) found.set(key, idMatch[1]);
  }
  return found;
}

async function main() {
  const merged = new Map();
  let anySuccess = false;
  for (const url of SOURCES) {
    try {
      const html = await fetchHtml(url);
      const matchups = extractMatchups(html);
      for (const [k, v] of matchups) {
        if (!merged.has(k)) merged.set(k, v);
      }
      anySuccess = true;
      console.log(`ok  ${url} — ${matchups.size} matchups`);
    } catch (e) {
      console.log(`err ${url} — ${e.message}`);
    }
  }

  if (!anySuccess) {
    console.log("all sources failed; keeping previous prime-asins.json");
    process.exit(0);
  }

  // Don't overwrite an existing file with an empty result — Prime may just
  // not have any live events listed right now, but we'd rather keep yesterday's
  // data than nuke it.
  if (merged.size === 0 && existsSync(OUT_PATH)) {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    const prevCount = Object.keys(prev.matchups ?? {}).length;
    if (prevCount > 0) {
      console.log(`scrape returned 0 matchups; keeping previous ${prevCount}`);
      process.exit(0);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    matchups: Object.fromEntries(
      [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
  };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`wrote ${merged.size} matchups → ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
