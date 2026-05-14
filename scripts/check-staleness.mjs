#!/usr/bin/env node
// Staleness check for prebaked feeds served via the R2-backed worker.
//
// Hits each feed at the public origin (so worker + R2 + DNS are all on the
// hook), parses `fetchedAt` / `generatedAt`, and exits non-zero if any feed
// is older than its per-feed threshold or the response is unreadable.
//
// Run locally:   node scripts/check-staleness.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-staleness.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";

// Per-feed max-age in hours. Tuned to roughly 2-3× the upstream cadence so a
// single missed run doesn't page; two consecutive misses do.
const NEWS_HOURLY = [
  "cbs-epl", "cbs-general", "cbs-golf", "cbs-mlb", "cbs-mls",
  "cbs-nba", "cbs-ncaam", "cbs-nfl", "cbs-nhl", "cbs-tennis",
  "espn-top", "espn-videos",
  "mlb", "mlb-videos", "nba", "nba-videos", "nhl",
  "reddit-epl", "reddit-general", "reddit-golf", "reddit-mlb", "reddit-mls",
  "reddit-nba", "reddit-ncaam", "reddit-nfl", "reddit-nhl", "reddit-tennis",
  "thescore-epl", "thescore-general", "thescore-mlb", "thescore-mls",
  "thescore-nba", "thescore-ncaam", "thescore-nfl", "thescore-nhl",
];

const FEEDS = [
  ...NEWS_HOURLY.map((slug) => ({ path: `/news/${slug}.json`, maxAgeHours: 6 })),
  { path: "/espn-airings.json", maxAgeHours: 6 },          // GHA every 2h
  { path: "/prime-asins.json", maxAgeHours: 18 },          // GHA every 6h
  { path: "/big-inning-schedule.json", maxAgeHours: 36 },  // GHA 2×/day, 14h gap
];

const TIMESTAMP_FIELDS = ["fetchedAt", "generatedAt"];
const FETCH_TIMEOUT_MS = 15000;

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function extractTimestamp(json) {
  for (const field of TIMESTAMP_FIELDS) {
    const v = json?.[field];
    if (typeof v === "string") {
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return { ts, field };
    }
  }
  return null;
}

const now = Date.now();
const rows = [];
const failures = [];

const results = await Promise.all(
  FEEDS.map(async (feed) => {
    const url = `${BASE}${feed.path}`;
    const row = { path: feed.path, status: "ok", ageH: null, note: "", maxAgeHours: feed.maxAgeHours };
    try {
      const json = await fetchJson(url);
      const ts = extractTimestamp(json);
      if (!ts) {
        row.status = "stale";
        row.note = "no fetchedAt/generatedAt";
      } else {
        row.ageH = (now - ts.ts) / 3600000;
        if (row.ageH > feed.maxAgeHours) {
          row.status = "stale";
          row.note = `>${feed.maxAgeHours}h (field=${ts.field})`;
        }
      }
    } catch (err) {
      row.status = "error";
      row.note = String(err?.message || err);
    }
    return row;
  }),
);

rows.push(...results);
for (const r of rows) {
  if (r.status === "ok") continue;
  const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
  failures.push(`${r.path} — ${r.status} (${age}, ${r.note})`);
}

console.log(`Staleness check @ ${new Date(now).toISOString()}`);
console.log(`Base:  ${BASE}`);
console.log(`Feeds: ${rows.length}\n`);

const pathW = Math.max(...rows.map((r) => r.path.length));
for (const r of rows) {
  const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
  console.log(
    `${r.status.padEnd(5)} ${r.path.padEnd(pathW)}  age=${age.padStart(6)}  max=${String(r.maxAgeHours).padStart(2)}h  ${r.note}`,
  );
}

if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll feeds fresh.");
