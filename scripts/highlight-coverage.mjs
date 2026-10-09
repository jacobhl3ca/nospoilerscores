#!/usr/bin/env node
// Highlight coverage for the main leagues (added 2026-10-09): every finished
// game in the last 7 days, looked up in the baked manifest the card reads, and
// — when the bake has no 1st-button clip — ONE live lookup through the card's
// own code path (fetchFirstVideoId in src/lib/youtube.ts). Prints a table per
// league and lists every game with no clip.
//
//   node scripts/highlight-coverage.mjs                 # bake + one live lookup per gap
//   node scripts/highlight-coverage.mjs --no-live       # bake data only
//   node scripts/highlight-coverage.mjs --manifest public/news/highlights.json
//   node scripts/highlight-coverage.mjs --league ncaaf --days 3 --json out.json
//
// PACING: live lookups go through the shared /api/youtube worker, which
// youtube.com soft-blocks when it is scraped in a burst (see
// scripts/audit-highlight-gaps.mjs). One lookup every 8 s by default; --pace
// only goes up. MLB costs no YouTube call: its row is MLB.com-native, read from
// /api/mlb-videos once per date.

import { readFileSync, writeFileSync } from "node:fs";
import {
  COVERAGE_LEAGUES, bakedSlots, bufferHours, coverageRow, etYmd, finishedGames, gapHints,
  highlightPlan, liveLookupArgs, mlbSlots, renderGaps, renderTable, scoreboardPaths, windowDates,
} from "./lib/highlight-coverage.mjs";
import { createJiti } from "jiti";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const DAYS = Math.max(1, Math.min(21, Number(arg("days", 7)) || 7));
const ONLY = arg("league", null);
const LIVE = !flag("no-live");
const PACE = Math.max(8, Number(arg("pace", 8))) * 1000;
const MANIFEST = arg("manifest", null);
const JSON_OUT = arg("json", null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The app's code calls relative /api/… paths (getApiBase() is "" off the
// browser). Point them at the worker; every other URL goes out unchanged.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => nativeFetch(typeof input === "string" && input.startsWith("/") ? `${BASE}${input}` : input, init);

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await nativeFetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return { data: await r.json() };
    } catch (e) {
      if (i === tries - 1) return { error: e?.cause?.code || e?.message || String(e) };
      await sleep(2000 * (i + 1));
    }
  }
  return { error: "unreachable" };
}

const jiti = createJiti(import.meta.url);
const { fetchFirstVideoId } = await jiti.import("../src/lib/youtube.ts");

const manifest = await (async () => {
  if (MANIFEST) return JSON.parse(readFileSync(MANIFEST, "utf8"))?.games ?? {};
  const { data, error } = await getJson(`${BASE}/news/highlights.json?ts=${Date.now()}`);
  if (error || !data?.games) {
    console.error(`baked manifest unreadable (${error ?? "no games map"}) — every game reads as unbaked`);
    return {};
  }
  return data.games;
})();

const paths = scoreboardPaths();
const buffers = bufferHours();
const dates = windowDates(DAYS);
const leagues = COVERAGE_LEAGUES.filter((l) => !ONLY || l.sport === ONLY);
const rowsBySport = {};
const outOfSeason = new Set();
const unreachable = new Set();
const errors = [];
let liveCalls = 0;

console.error(`window ${dates[dates.length - 1]}–${dates[0]} ET   live=${LIVE ? `on (pace ${PACE / 1000}s)` : "off"}   manifest=${MANIFEST ?? `${BASE}/news/highlights.json`} (${Object.keys(manifest).length} entries)`);

for (const lg of leagues) {
  const rows = [];
  const games = [];
  let boards = 0;
  for (const ymd of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports${paths[lg.sport]}?dates=${ymd}${lg.query ? `&${lg.query}` : ""}${lg.sport === "ncaaf" ? "&limit=300" : ""}`;
    const { data, error } = await getJson(url);
    if (error) { errors.push(`${lg.sport} ${ymd} scoreboard: ${error}`); continue; }
    boards++;
    for (const g of finishedGames(lg.sport, data)) if (dates.includes(etYmd(g.date)) && !games.some((x) => x.id === g.id)) games.push(g);
  }
  const mlbByDate = {};
  if (lg.sport === "mlb") {
    for (const ymd of new Set(games.map((g) => etYmd(g.date)))) {
      const { data, error } = await getJson(`${BASE}/api/mlb-videos?date=${ymd}`);
      if (error) errors.push(`mlb ${ymd} mlb-videos: ${error}`);
      mlbByDate[ymd] = data?.games ?? [];
    }
  }
  for (const game of games) {
    const plan = highlightPlan(game);
    const sameDay = games.filter((g) => etYmd(g.date) === etYmd(game.date));
    const slots = lg.sport === "mlb"
      ? mlbSlots(game, mlbByDate[etYmd(game.date)])
      : bakedSlots(plan, manifest[`${lg.sport}:${game.id}`] ?? null);
    let live = null;
    const ageH = (Date.now() - Date.parse(game.date)) / 3600000;
    const due = !(ageH < (buffers[lg.sport] ?? 3));
    if (lg.sport !== "mlb" && !slots.official && due) {
      const a = liveLookupArgs(plan);
      if (!LIVE || !a) {
        live = { id: null, skipped: true };
      } else {
        const id = await fetchFirstVideoId(a.query, a.channel, undefined, false, true, undefined, a.week, a.compTokens, a.gates);
        liveCalls++;
        live = { id };
        await sleep(PACE);
      }
    }
    rows.push(coverageRow({ game, plan, slots, live, buffers, hints: gapHints(game, plan, sameDay) }));
  }
  if (!boards) unreachable.add(lg.sport);
  else if (lg.seasonal && !rows.length) outOfSeason.add(lg.sport);
  rowsBySport[lg.sport] = rows;
}

const all = Object.values(rowsBySport).flat();
console.log(renderTable(leagues, rowsBySport, { outOfSeason, unreachable }));
console.log("\nGames with no clip:");
console.log(renderGaps(all));
console.log(`\nlive lookups: ${LIVE ? liveCalls : "off (bake data only)"}`);
if (errors.length) {
  console.log(`\nfetch errors (${errors.length}):\n${errors.map((e) => `- ${e}`).join("\n")}`);
  process.exitCode = 1;
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), dates, live: LIVE, rows: all }, null, 2));
