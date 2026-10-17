#!/usr/bin/env node
// Highlight coverage, every baked league at once (added 2026-10-17).
//
// For each league the bake walks (HL_LEAGUES in scripts/prebake-news.mjs, read
// out of the source), counts the finished games of the last N ET days and how
// many of them have a baked clip in the live manifest, then lists every game
// that has none. Writes a JSON report and an HTML page:
//
//   npm run highlights:coverage                    # last 7 days
//   npm run highlights:coverage -- --days 3 --league saudi
//   npm run highlights:coverage -- --verdicts gaps.json
//
// --verdicts reads the JSON that `audit-highlight-gaps.mjs --out <file>` writes
// (key → BAKE-GAP / NO-RECAP / WRONG-OWNER) and puts it on each gap row. A gap
// with no audit verdict gets the cause the data alone shows (buffer still open,
// league has no channel, tour event, a called game).
//
// ESPN is read with Node fetch, not curl: Akamai refuses curl's TLS shape.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const DAYS = Math.min(30, Math.max(1, Number(arg("days", 7)) || 7));
const ONLY = arg("league");
const VERDICTS_PATH = arg("verdicts");
const etYmd = (offsetDays, now = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(now + offsetDays * 86400000)).replace(/-/g, "");
const TODAY = etYmd(0);
const OUT_HTML = arg("html", join(homedir(), `hidescore-highlight-scrub-${TODAY.slice(0, 4)}-${TODAY.slice(4, 6)}-${TODAY.slice(6, 8)}.html`));
const OUT_JSON = arg("json", join(ROOT, ".bake-state", `highlight-coverage-${TODAY}.json`));

// ── Tables read out of the source, never copied ─────────────────────────────
const PREBAKE = readFileSync(join(ROOT, "scripts/prebake-news.mjs"), "utf8");
const hlBlock = PREBAKE.slice(PREBAKE.indexOf("const HL_LEAGUES = ["), PREBAKE.indexOf("\n];", PREBAKE.indexOf("const HL_LEAGUES = [")));
const HL_LEAGUES = [...hlBlock.matchAll(/\{\s*sport:\s*"([a-z0-9]+)",\s*path:\s*"([^"]+)",\s*channel:\s*(null|"((?:[^"\\]|\\.)*)")([^}]*)\}/g)]
  .map((m) => ({ sport: m[1], path: m[2], channel: m[4] ?? null, worker: /worker:\s*true/.test(m[5]) }));
const COLLEGE = JSON.parse(readFileSync(join(ROOT, "src/lib/collegeHighlightChannels.json"), "utf8"));
const GH = readFileSync(join(ROOT, "src/components/GameHighlights.tsx"), "utf8");
const BUFFER_H = Object.fromEntries([...GH.slice(GH.indexOf("const highlightBufferHours"), GH.indexOf("};", GH.indexOf("const highlightBufferHours"))).matchAll(/\b([a-z0-9]+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
const ESPN_TS = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");
const tourBlock = ESPN_TS.match(/export const TENNIS_TOUR_EVENTS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? "";
const TOUR = [...tourBlock.matchAll(/\{\s*id:\s*"([^"]+)",\s*city:\s*"([^"]+)",\s*name:\s*\/((?:[^/\\]|\\.)+)\/([a-z]*),\s*draws:\s*"(men|women|both)"\s*\}/g)]
  .map((m) => ({ id: m[1], city: m[2], name: new RegExp(m[3], m[4]), draws: m[5] }));
const tourEvent = (event) => {
  const id = String(event?.id ?? "").split("-")[0];
  return TOUR.find((t) => t.id === id) ?? (event?.name ? TOUR.find((t) => t.name.test(event.name)) : null) ?? null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1500);
  }
  return null;
}

const isCalled = (e) => /postpon|cancel|suspend|forfeit/i.test(e?.status?.type?.name ?? "") || /postpon|cancel|suspend/i.test(e?.status?.type?.description ?? "");
const etDate = (iso) => etYmd(0, Date.parse(iso));

// One league's finished games for one ET day: [{ id, fixture, date, note }].
function gamesFor(row, data, ymd) {
  if (row.sport === "tennis") {
    const out = [];
    for (const event of data?.events ?? []) {
      const tour = event?.major ? null : tourEvent(event);
      if (!event?.major && !tour) continue;
      for (const g of event.groupings ?? []) {
        const slug = String(g?.grouping?.slug ?? "").toLowerCase();
        if (!slug.includes("singles") || slug.includes("doubles")) continue;
        const draw = /women/.test(slug) ? "women" : "men";
        if (tour && tour.draws !== "both" && tour.draws !== draw) continue;
        for (const m of g.competitions ?? []) {
          if (m?.status?.type?.state !== "post" || isCalled(m)) continue;
          if (tour && /^qualifying/i.test(m?.round?.displayName ?? "")) continue;
          const date = m.date ?? event.date;
          if (etDate(date) !== ymd) continue;
          const c = m.competitors ?? [];
          const home = c.find((x) => x.homeAway === "home") ?? c[0];
          const away = c.find((x) => x.homeAway === "away") ?? c[1];
          out.push({
            id: m.id, date,
            fixture: `${away?.athlete?.displayName ?? "?"} v ${home?.athlete?.displayName ?? "?"}`,
            note: tour ? `${tour.city} (${draw})` : event.name,
            tour: !!tour,
          });
        }
      }
    }
    return out;
  }
  return (data?.events ?? []).filter((e) => e?.status?.type?.state === "post").map((e) => {
    const c = e.competitions?.[0]?.competitors ?? [];
    const away = c.find((x) => x.homeAway === "away")?.team;
    const home = c.find((x) => x.homeAway === "home")?.team;
    return {
      id: e.id, date: e.date, called: isCalled(e),
      fixture: `${away?.shortDisplayName ?? "?"} v ${home?.shortDisplayName ?? "?"}`,
      awayId: away?.id, homeId: home?.id,
      awayConf: away?.conferenceId, homeConf: home?.conferenceId,
    };
  });
}

// Does this college game have any channel in its chain? Same shape as
// hlFallbackChain: conference, team and network channels, plus "always".
function collegeHasChain(sport, g) {
  const cfg = COLLEGE[sport];
  if (!cfg) return true;
  if ((cfg.always ?? []).length) return true;
  const conf = cfg.conferences ?? {};
  const team = cfg.teamChannels ?? {};
  return !!(conf[g.awayConf] || conf[g.homeConf] || team[g.awayId] || team[g.homeId]);
}

const manifest = (await getJson(`${BASE}/news/highlights.json?ts=${Date.now()}`))?.games ?? {};
let verdicts = {};
if (VERDICTS_PATH) {
  try { verdicts = JSON.parse(readFileSync(VERDICTS_PATH, "utf8")); } catch (e) { console.warn(`verdicts not read: ${e.message}`); }
}

const dates = Array.from({ length: DAYS }, (_, i) => etYmd(-i));
const rows = new Map(); // sport → { finished, baked, gaps[], dark }
const seen = new Set();
const leagues = HL_LEAGUES.filter((l) => !ONLY || l.sport === ONLY);
for (const row of leagues) {
  const r = rows.get(row.sport) ?? { sport: row.sport, channel: row.channel, finished: 0, baked: 0, gaps: [], unmapped: 0 };
  rows.set(row.sport, r);
  for (const ymd of dates) {
    const url = row.worker ? `${BASE}${row.path}?dates=${ymd}` : `${ESPN}${row.path}?dates=${ymd}${row.sport === "ncaaf" ? "&groups=80&limit=400" : ""}`;
    const data = await getJson(url);
    if (!data) continue;
    for (const g of gamesFor(row, data, ymd)) {
      const key = `${row.sport}:${g.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (g.called) continue;
      // College leagues with no channel for either school are dark on the
      // card; they are counted apart so they do not read as misses.
      if (!row.channel && row.sport !== "tennis" && !collegeHasChain(row.sport, g)) { r.unmapped++; continue; }
      r.finished++;
      const entry = manifest[key];
      if (entry?.official || entry?.extended || entry?.club || entry?.espnClipUrl) { r.baked++; continue; }
      const ageH = (Date.now() - Date.parse(g.date)) / 3600e3;
      const buffer = BUFFER_H[row.sport] ?? 4;
      const v = verdicts[key];
      const cause = v?.verdict
        ? `${v.verdict}${v.detail ? ` — ${v.detail}` : ""}`
        : ageH < buffer ? `buffer open (${ageH.toFixed(1)} h of ${buffer} h)`
        : row.sport === "tennis" && !g.tour ? "Slam: no cut found"
        : row.sport === "tennis" ? "tour: no Tennis TV / WTA cut found"
        : "not audited";
      r.gaps.push({ key, date: ymd, fixture: g.fixture, note: g.note ?? "", cause });
    }
  }
}

const report = { at: new Date().toISOString(), days: DAYS, dates, leagues: [...rows.values()] };
mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(report, null, 1));

// ── Console table ───────────────────────────────────────────────────────────
const pct = (r) => (r.finished ? Math.round((100 * r.baked) / r.finished) : null);
console.log(`highlight coverage, last ${DAYS} ET days (${dates.at(-1)}–${dates[0]})`);
for (const r of report.leagues) {
  if (!r.finished && !r.unmapped) continue;
  console.log(`${r.sport.padEnd(14)} ${String(r.baked).padStart(4)}/${String(r.finished).padEnd(4)} ${pct(r) === null ? "  -" : String(pct(r)).padStart(3) + "%"}${r.unmapped ? `   (+${r.unmapped} no channel for either school)` : ""}`);
}

// ── HTML page ───────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const shown = report.leagues.filter((r) => r.finished || r.unmapped);
const totalF = shown.reduce((a, r) => a + r.finished, 0);
const totalB = shown.reduce((a, r) => a + r.baked, 0);
const summaryRows = shown.map((r) => {
  const p = pct(r);
  const cls = p === null ? "" : p >= 90 ? "ok" : p >= 70 ? "mid" : "low";
  return `<tr><td>${esc(r.sport)}</td><td>${esc(r.channel ?? "chain")}</td><td class="n">${r.finished}</td><td class="n">${r.baked}</td><td class="n ${cls}">${p === null ? "–" : p + "%"}</td><td class="n">${r.unmapped || ""}</td></tr>`;
}).join("\n");
const gapRows = shown.flatMap((r) => r.gaps.map((g) => `<tr><td>${esc(r.sport)}</td><td>${esc(g.date)}</td><td>${esc(g.fixture)}${g.note ? ` <span class="dim">${esc(g.note)}</span>` : ""}</td><td><code>${esc(g.key)}</code></td><td>${esc(g.cause)}</td></tr>`)).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HideScore highlight scrub ${esc(TODAY)}</title>
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fafafa;--dim:#666;--line:#ddd;--ok:#1b7f3a;--mid:#9a6700;--low:#c62828}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--bg:#141414;--dim:#9a9a9a;--line:#333;--ok:#5fd37f;--mid:#e3b341;--low:#ff7b7b}}
body{font:15px/1.45 -apple-system,system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:1100px;margin:2rem auto;padding:0 1rem}
table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{border-bottom:1px solid var(--line);padding:.35rem .5rem;text-align:left;vertical-align:top}
th{font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--ok)}.mid{color:var(--mid)}.low{color:var(--low);font-weight:600}
.dim{color:var(--dim);font-size:.9em}code{font-size:.85em}
</style></head><body>
<h1>Highlight scrub, last ${DAYS} days</h1>
<p class="dim">ET days ${esc(dates.at(-1))}–${esc(dates[0])}. Finished games vs games with a baked clip in <code>${esc(BASE)}/news/highlights.json</code>. Built ${esc(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }))} ET by <code>npm run highlights:coverage</code>.</p>
<p><b>${totalB} of ${totalF}</b> finished games have a clip (${totalF ? Math.round((100 * totalB) / totalF) : 0}%).</p>
<h2>Per league</h2>
<table><thead><tr><th>League</th><th>Channel</th><th class="n">Finished</th><th class="n">Clip</th><th class="n">%</th><th class="n">No channel</th></tr></thead><tbody>
${summaryRows}
</tbody></table>
<p class="dim">"No channel" = college games where neither school's conference or team has an approved uploader. Those cards are dark on purpose and are not in the %.</p>
<h2>Every game with no clip (${shown.reduce((a, r) => a + r.gaps.length, 0)})</h2>
<p class="dim">Cause: BAKE-GAP = a live lookup finds it, the bake missed it. NO-RECAP = the approved channel has no cut. WRONG-OWNER = only another channel has it.</p>
<table><thead><tr><th>League</th><th>Day</th><th>Game</th><th>Key</th><th>Cause</th></tr></thead><tbody>
${gapRows}
</tbody></table>
</body></html>`;
mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, html);
console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_HTML}`);
