#!/usr/bin/env node
// Staleness check for prebaked feeds served via the R2-backed worker.
//
// Hits each feed at the public origin (so worker + R2 + DNS are all on the
// hook), parses `fetchedAt` / `generatedAt`, and prints a per-feed status
// table. Two tiers:
//   - warn (past `warnH`)        — logged only, workflow stays green, no email
//   - crit (past `critH`) / err  — exits 1, GH Actions emails repo owner
// Manual runs always show the full table so you can spot a warn drift before
// it crosses crit.
//
// Run locally:   node scripts/check-staleness.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-staleness.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";

// warnH = "this feed missed a couple of runs, watch it"
// critH = "real outage, page someone" — set at 4× warnH so it takes a sustained
// failure, not a transient blip, to fire.
const NEWS_HOURLY = [
  "cbs-epl", "cbs-general", "cbs-golf", "cbs-mlb", "cbs-mls",
  "cbs-nba", "cbs-ncaam", "cbs-nfl", "cbs-nhl", "cbs-tennis",
  "espn-top", "espn-videos",
  "mlb", "mlb-videos", "nba", "nba-videos", "wnba", "wnba-videos", "nhl",
  "reddit-epl", "reddit-general", "reddit-golf", "reddit-mlb", "reddit-mls",
  "reddit-nba", "reddit-ncaam", "reddit-nfl", "reddit-nhl", "reddit-tennis", "reddit-wnba",
  "thescore-epl", "thescore-general", "thescore-mlb", "thescore-mls",
  "thescore-nba", "thescore-ncaam", "thescore-nfl", "thescore-nhl",
];

const FEEDS = [
  ...NEWS_HOURLY.map((slug) => ({ path: `/news/${slug}.json`, warnH: 6, critH: 24 })),
  { path: "/espn-airings.json", warnH: 6, critH: 24 },           // GHA every 2h
  { path: "/prime-asins.json", warnH: 18, critH: 72 },           // GHA every 6h
  { path: "/big-inning-schedule.json", warnH: 36, critH: 144 },  // GHA 2×/day
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

const rows = await Promise.all(
  FEEDS.map(async (feed) => {
    const url = `${BASE}${feed.path}`;
    const row = { path: feed.path, status: "ok", ageH: null, note: "", warnH: feed.warnH, critH: feed.critH };
    try {
      const json = await fetchJson(url);
      const ts = extractTimestamp(json);
      if (!ts) {
        row.status = "crit";
        row.note = "no fetchedAt/generatedAt";
      } else {
        row.ageH = (now - ts.ts) / 3600000;
        if (row.ageH > feed.critH) {
          row.status = "crit";
          row.note = `>${feed.critH}h critical (field=${ts.field})`;
        } else if (row.ageH > feed.warnH) {
          row.status = "warn";
          row.note = `>${feed.warnH}h warn (field=${ts.field})`;
        }
      }
    } catch (err) {
      row.status = "error";
      row.note = String(err?.message || err);
    }
    return row;
  }),
);

console.log(`Staleness check @ ${new Date(now).toISOString()}`);
console.log(`Base:  ${BASE}`);
console.log(`Feeds: ${rows.length}\n`);

const pathW = Math.max(...rows.map((r) => r.path.length));
for (const r of rows) {
  const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
  console.log(
    `${r.status.padEnd(5)} ${r.path.padEnd(pathW)}  age=${age.padStart(6)}  warn=${String(r.warnH).padStart(2)}h crit=${String(r.critH).padStart(3)}h  ${r.note}`,
  );
}

const warns = rows.filter((r) => r.status === "warn");
const fails = rows.filter((r) => r.status === "crit" || r.status === "error");

console.log("");
if (warns.length) {
  console.log(`${warns.length} warning(s) (workflow stays green, no alert):`);
  for (const r of warns) console.log(`  - ${r.path} (${r.ageH.toFixed(1)}h)`);
}
if (fails.length) {
  console.log(`${fails.length} critical (workflow will fail → email):`);
  for (const r of fails) {
    const age = r.ageH == null ? "—" : `${r.ageH.toFixed(1)}h`;
    console.log(`  - ${r.path} — ${r.status} (${age}, ${r.note})`);
  }
  process.exit(1);
}
if (!warns.length) console.log("All feeds fresh.");
