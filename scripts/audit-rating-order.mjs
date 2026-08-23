#!/usr/bin/env node
// Audit: does the Rated-view order actually put the better game first?
//
// The column sorts finished games by `rating` desc, so an ORDER complaint is a
// RATING complaint. This flags two things per league:
//   INVERSION  a game with a strictly BIGGER final margin outranks a closer one
//   FLAT       many games share one rating, so the order inside them is arbitrary
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { fetchGames } = await jiti.import("../src/lib/espn.ts");

const BASE = "https://site.web.api.espn.com/apis/site/v2/sports";
const SKIP = new Set(["chess", "boxing", "poker", "esports", "f1", "nascar", "indycar", "ufc", "golf", "tennis"]);
const SAMPLE_DAYS = 4;
const VERBOSE = process.argv.includes("--verbose");

const SRC = readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
const paths = {};
{
  const start = SRC.indexOf("const SPORT_PATHS");
  const block = SRC.slice(start, SRC.indexOf("\n};", start));
  for (const m of block.matchAll(/^\s{2}([a-z0-9]+):\s*"([^"]*)"/gm)) if (m[2]) paths[m[1]] = m[2];
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const shift = (n) => ymd(new Date(Date.now() + n * 86400000));
const etYmd = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");

async function rangeDays(sport, fromBack, toBack) {
  const r = await fetch(`${BASE}${paths[sport]}?limit=1000&dates=${shift(-toBack)}-${shift(-fromBack)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const out = new Set();
  for (const e of j.events ?? []) {
    const st = e.status?.type?.state ?? e.competitions?.[0]?.status?.type?.state;
    if (st === "post" && e.date) out.add(etYmd(e.date));
  }
  return [...out].sort().reverse();
}
async function scanDays(sport, maxBack = 400) {
  const found = [];
  for (let b = 0; b < maxBack && found.length < SAMPLE_DAYS; b++) {
    const d = shift(-b);
    const r = await fetch(`${BASE}${paths[sport]}?dates=${d}`);
    if (!r.ok) continue;
    const j = await r.json();
    if ((j.events ?? []).some((e) => (e.status?.type?.state ?? e.competitions?.[0]?.status?.type?.state) === "post")) found.push(d);
  }
  return found;
}

const rows = [];
for (const sport of Object.keys(paths)) {
  if (SKIP.has(sport)) continue;
  let days = await rangeDays(sport, 0, 45);
  if (days === null) days = await scanDays(sport);            // path rejects ranges
  else for (let back = 45; days.length === 0 && back < 400; back += 45) days = (await rangeDays(sport, back, back + 45)) ?? [];
  days = days.slice(0, SAMPLE_DAYS);
  if (!days.length) { rows.push({ sport, note: "no finished games" }); continue; }

  const byDay = [];
  for (const d of days) {
    const { games } = await fetchGames(sport, d).catch(() => ({ games: [] }));
    const post = games.filter((g) => g.state === "post" && g.rating != null)
      .map((g) => {
        const hs = parseInt(g.homeTeam.score, 10), as = parseInt(g.awayTeam.score, 10);
        return { r: g.rating, margin: Number.isFinite(hs) && Number.isFinite(as) ? Math.abs(hs - as) : null,
                 label: `${g.awayTeam.shortDisplayName} ${g.awayTeam.score}-${g.homeTeam.score} ${g.homeTeam.shortDisplayName}` };
      })
      .filter((g) => g.margin !== null);
    if (post.length > 1) byDay.push({ d, post });
  }
  if (!byDay.length) { rows.push({ sport, note: "no rateable finished games" }); continue; }

  let pairs = 0, inversions = 0, n = 0, flatWorst = 0;
  const examples = [];
  for (const { d, post } of byDay) {
    n += post.length;
    const counts = {};
    for (const g of post) counts[g.r] = (counts[g.r] || 0) + 1;
    flatWorst = Math.max(flatWorst, Math.max(...Object.values(counts)));
    const order = [...post].sort((a, b) => b.r - a.r);
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      if (order[i].r === order[j].r) continue;
      // Draws are excluded on purpose: the soccer low-scoring penalty
      // DELIBERATELY demotes a 0-0 below a decided game, so counting that as an
      // inversion would mask the real ones.
      if (order[i].margin === 0 || order[j].margin === 0) continue;
      pairs++;
      if (order[i].margin > order[j].margin) {
        inversions++;
        if (examples.length < 3) examples.push(`${d}: ${order[i].label} (r${order[i].r}, by ${order[i].margin}) ABOVE ${order[j].label} (r${order[j].r}, by ${order[j].margin})`);
      }
    }
  }
  rows.push({ sport, n, pairs, inversions, pct: pairs ? Math.round((inversions / pairs) * 100) : 0, flatWorst, examples });
  process.stderr.write(".");
}
process.stderr.write("\n");
rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
console.log("sport         games  pairs  inverted  %    biggest-tie");
for (const r of rows) {
  if (r.note) { console.log(r.sport.padEnd(14) + "!! " + r.note); continue; }
  console.log(r.sport.padEnd(14) + String(r.n).padEnd(7) + String(r.pairs).padEnd(7) + String(r.inversions).padEnd(10) + String(r.pct).padEnd(5) + r.flatWorst);
  if (VERBOSE) for (const e of r.examples) console.log("    " + e);
}
