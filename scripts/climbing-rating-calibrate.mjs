#!/usr/bin/env node
// Rate every finished World Cup final of a season with the worker's own rating
// functions (public/_worker.js climbFinalRating), so the weights can be tuned
// against real finals. Prints a table and the tier counts; --out writes the
// same table as an HTML page.
//
//   node scripts/climbing-rating-calibrate.mjs [--season 2026] [--out FILE.html]
//
// ⛔ Names no athlete: the signal column is gaps, tops and times only, so the
// page can be read by someone who has not watched the finals yet.
import { writeFileSync } from "node:fs";
import { climbFinalRating, climbParseHeight } from "../public/_worker.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const SEASON = Number(opt("season", "2026"));
const OUT = opt("out", "");
const CAL = "https://github.com/sportclimbing/ifsc-calendar/releases/latest/download/IFSC-World-Cups-and-World-Championships.json";
const ORIGIN = "https://ifsc.results.info";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session() {
  const r = await fetch(`${ORIGIN}/`, { headers: { "User-Agent": UA } });
  const html = await r.text();
  const token = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const cookie = (r.headers.get("set-cookie") || "").match(/_ifsc_resultservice_session=[^;,\s]+/)?.[0];
  if (!token || !cookie) throw new Error("results handshake failed");
  return { token, cookie };
}

async function api(s, path) {
  await sleep(300);
  const r = await fetch(`${ORIGIN}${path}`, {
    headers: { Cookie: s.cookie, "X-Csrf-Token": s.token, Referer: `${ORIGIN}/`, Accept: "application/json", "User-Agent": UA },
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// The fact behind each rating, in words that name no one.
function signal(res) {
  const r = (res.ranking ?? []).filter((a) => Number.isFinite(a?.rank)).sort((a, b) => a.rank - b.rank);
  const d = String(res.discipline).toLowerCase();
  if (d === "boulder") {
    const gap = parseFloat(r[0].score) - parseFloat(r[1].score);
    const tops = r.reduce((s, a) => s + (a.ascents ?? []).filter((x) => x.top).length, 0);
    const ids = (res.routes ?? []).map((x) => x.id);
    const last = ids[ids.length - 1];
    const before = r.map((a) => (a.ascents ?? []).filter((x) => x.route_id !== last).reduce((s, x) => s + (Number(x.points) || 0), 0));
    const change = before[0] < Math.max(...before) - 1e-9;
    return `gap ${gap.toFixed(1)} pts · ${tops} tops${change ? " · leader changed on the last boulder" : ""}`;
  }
  if (d === "lead") {
    const gap = climbParseHeight(r[0].score) - climbParseHeight(r[1].score);
    return gap === 0 ? "1st and 2nd on the same hold (countback)" : `gap ${gap} hold${gap === 1 ? "" : "s"}`;
  }
  const big = [...(res.speed_elimination_stages ?? [])].reverse().find((s) => /^final$/i.test(s.stage_name));
  const times = (big?.heats?.[0]?.athletes ?? [])
    .map((a) => ((a.ascents ?? []).some((x) => x.dnf || x.dns) ? null : a.stage_result?.time))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  if (times.length < 2) return "decided by a fall";
  return `margin ${times[1] - times[0]} ms · winning time ${(times[0] / 1000).toFixed(2)} s`;
}

const tier = (n) => (n >= 85 ? "GREAT" : n >= 70 ? "GOOD" : n >= 50 ? "MEH" : "SKIP");

const cal = await (await fetch(CAL)).json();
const events = cal.events.filter((e) => e.league_name === "World Cups and World Championships" && Number(e.season) === SEASON);
const s = await session();
const rows = [];
for (const ev of events) {
  const info = await api(s, `/api/v1/events/${ev.id}`);
  for (const dc of info.d_cats ?? []) {
    if (!/^(boulder|lead|speed)$/i.test(dc.discipline_kind)) continue;
    for (const cr of dc.category_rounds ?? []) {
      if (cr.name !== "Final" || cr.status !== "finished") continue;
      const res = await api(s, `/api/v1/category_rounds/${cr.category_round_id}/results`);
      const rating = climbFinalRating(res);
      rows.push({
        event: ev.location,
        date: String(ev.starts_at).slice(0, 10),
        round: `${dc.category_name === "Women" ? "Women's" : "Men's"} ${res.discipline} Final`,
        rating,
        tier: rating == null ? "—" : tier(rating),
        signal: signal(res),
      });
    }
  }
}

const counts = Object.fromEntries(["GREAT", "GOOD", "MEH", "SKIP"].map((t) => [t, rows.filter((r) => r.tier === t).length]));
for (const r of rows) console.log(`${String(r.rating).padStart(3)} ${r.tier.padEnd(5)} ${r.event.padEnd(24)} ${r.round.padEnd(22)} ${r.signal}`);
const pct = (n) => `${Math.round((100 * n) / rows.length)}%`;
console.log(`${rows.length} finals · GREAT ${counts.GREAT} (${pct(counts.GREAT)}) · GOOD ${counts.GOOD} (${pct(counts.GOOD)}) · MEH ${counts.MEH} · SKIP ${counts.SKIP}`);

if (OUT) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const color = { GREAT: "#16a34a", GOOD: "#ca8a04", MEH: "#ea580c", SKIP: "#b91c1c" };
  const body = rows
    .map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.event)}</td><td>${esc(r.round)}</td><td><span class="b" style="background:${color[r.tier] ?? "#666"}">${esc(r.tier)}</span> ${esc(r.rating)}</td><td>${esc(r.signal)}</td></tr>`)
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HideScore climbing ratings, ${SEASON} finals</title>
<style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#666}.b{color:#fff;font-weight:700;font-size:11px;padding:2px 6px;border-radius:4px}p{max-width:60em}</style></head><body>
<h1>Climbing final ratings, ${SEASON} World Cups</h1>
<p>${rows.length} finished finals · GREAT ${counts.GREAT} (${pct(counts.GREAT)}) · GOOD ${counts.GOOD} (${pct(counts.GOOD)}) · MEH ${counts.MEH} · SKIP ${counts.SKIP}. Target: about 25% GREAT and 35% GOOD. No athlete names: the last column is the fact behind the badge. Made ${new Date().toISOString().slice(0, 10)} by scripts/climbing-rating-calibrate.mjs.</p>
<p>Boulder: 0.8 × (100 − 2 × points gap) + min(15, 1.5 × tops) + 12 if the leader changed on the last boulder. Lead: 100 − 12 × holds gap, +8 same hold, +5 two or more tops, +10 if the last climber won. Speed: 100 − margin ms / 6, −20 for a fall, +10 within 0.05 s of the world record.</p>
<table><thead><tr><th>Date</th><th>Event</th><th>Round</th><th>Badge</th><th>Signal</th></tr></thead><tbody>
${body}
</tbody></table></body></html>
`;
  writeFileSync(OUT, html);
  console.log(`wrote ${OUT}`);
}
