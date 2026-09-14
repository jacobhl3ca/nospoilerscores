#!/usr/bin/env node
// One-off audit: per-league channel (broadcast) + rating coverage.
//
// Finds each league's most recent days that actually have FINISHED games by
// range-probing ESPN directly, then re-fetches those days through our own
// fetchGames() so the numbers reflect what the app renders, not raw ESPN.
//
//   node scripts/audit-league-coverage.mjs            # last 45 days, widen to 400
//   node scripts/audit-league-coverage.mjs --days=120
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { fetchGames } = await jiti.import("../src/lib/espn.ts");

const BASE = "https://site.web.api.espn.com/apis/site/v2/sports";
// Event-tile leagues (single card, no per-game rating/broadcast columns).
// cfl is a worker route (/api/cfl, theScore-backed), not an ESPN path — the
// BASE + path probe below would 404 against ESPN.
const SKIP = new Set(["chess", "boxing", "poker", "esports", "f1", "nascar", "indycar", "ufc", "golf", "tennis", "cfl"]);
const DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 45;
const SAMPLE_DAYS = 3; // how many recent finished-game days to pool per league

const SRC = readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
const paths = {};
{
  const start = SRC.indexOf("const SPORT_PATHS");
  const block = SRC.slice(start, SRC.indexOf("\n};", start));
  for (const m of block.matchAll(/^\s{2}([a-z0-9]+):\s*"([^"]*)"/gm)) if (m[2]) paths[m[1]] = m[2];
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const shift = (n) => ymd(new Date(Date.now() + n * 86400000));
// ESPN buckets its `dates=` param by EASTERN day, but event.date is UTC. A
// 8pm ET tip is next-day UTC, so bucketing the probe by UTC asks fetchGames for
// a day the game is not on and the league reads as empty when it is fine.
const etYmd = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");

async function finishedDays(sport, fromBack, toBack) {
  const url = `${BASE}${paths[sport]}?limit=1000&dates=${shift(-toBack)}-${shift(-fromBack)}`;
  const r = await fetch(url);
  if (!r.ok) return { err: `HTTP ${r.status}` };
  const j = await r.json();
  const out = new Set();
  for (const e of j.events ?? []) {
    const st = e.status?.type?.state ?? e.competitions?.[0]?.status?.type?.state;
    if (st === "post" && e.date) out.add(etYmd(e.date));
  }
  return { days: [...out].sort().reverse() };
}

// Day-by-day fallback: /basketball/*-college-basketball and /cricket/<id> 404
// on any `dates=A-B` range, so walk back one day at a time for those.
async function scanDays(sport, maxBack = 400) {
  const found = [];
  for (let b = 0; b < maxBack && found.length < SAMPLE_DAYS; b++) {
    const d = shift(-b);
    const r = await fetch(`${BASE}${paths[sport]}?dates=${d}`);
    if (!r.ok) continue;
    const j = await r.json();
    const any = (j.events ?? []).some((e) => (e.status?.type?.state ?? e.competitions?.[0]?.status?.type?.state) === "post");
    if (any) found.push(d);
  }
  return found.length ? { days: found } : { err: "no finished games in 400d" };
}

const rows = [];
const seen = new Set();
for (const sport of Object.keys(paths)) {
  if (SKIP.has(sport) || seen.has(sport)) continue;
  seen.add(sport);
  // ESPN 400s/404s on a range much wider than ~50 days, so widen by stepping
  // 45-day windows back through the last season rather than asking for 400 at once.
  let probe = await finishedDays(sport, 0, DAYS);
  for (let back = DAYS; !probe.err && !probe.days.length && back < 400; back += 45) {
    probe = await finishedDays(sport, back, back + 45);
  }
  if (probe.err) probe = await scanDays(sport);          // path rejects ranges
  if (probe.err) { rows.push({ sport, note: probe.err }); continue; }
  const days = probe.days.slice(0, SAMPLE_DAYS);
  if (!days.length) { rows.push({ sport, note: "no finished games in 400d" }); continue; }
  const games = [];
  for (const d of days) {
    try {
      const res = await fetchGames(sport, d);
      games.push(...res.games.filter((g) => g.state === "post"));
    } catch { /* one bad day must not kill the row */ }
  }
  if (!games.length) { rows.push({ sport, note: `ESPN had finished games on ${days[0]} but fetchGames returned none` }); continue; }
  const withB = games.filter((g) => (g.broadcasts ?? []).length > 0).length;
  const vals = games.filter((g) => g.rating != null).map((g) => g.rating);
  rows.push({
    sport, date: days[0], n: games.length,
    bcast: Math.round((withB / games.length) * 100),
    rated: Math.round((vals.length / games.length) * 100),
    spread: vals.length ? `${Math.min(...vals)}-${Math.max(...vals)}` : "-",
    distinct: new Set(vals).size,
  });
  process.stderr.write(".");
}
process.stderr.write("\n");

rows.sort((a, b) => (a.bcast ?? 999) - (b.bcast ?? 999));
console.log(["sport", "lastday", "post", "chan%", "rated%", "spread", "uniq"].map((h, i) => h.padEnd([14, 10, 5, 6, 7, 9, 4][i])).join(""));
for (const r of rows) {
  if (r.note) { console.log(r.sport.padEnd(14) + "!! " + r.note); continue; }
  console.log(
    r.sport.padEnd(14) + String(r.date).padEnd(10) + String(r.n).padEnd(5) +
    String(r.bcast).padEnd(6) + String(r.rated).padEnd(7) + String(r.spread).padEnd(9) + String(r.distinct)
  );
}
