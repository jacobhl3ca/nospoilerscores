#!/usr/bin/env node
// One static HTML page to review every team logo by eye: the logos ESPN gets
// wrong, the teams with no logo, and every logo on a light and a dark card,
// before and after (Jacob 10/14: a visual audit wants a before/after page with
// light + dark examples, not only a text report).
//
//   node --experimental-strip-types scripts/logo-gallery.mjs --out ~/hidescore-logos-2026-10-14.html
//   node … scripts/logo-gallery.mjs --days=7 --out /tmp/logos.html
//
// "After" is the real code path: fixTeamLogo / darkTeamLogo / logoOverride come
// from the leaf modules the app uses, not a copy. Sources: the live ESPN board
// ±14 days for every SPORT_PATHS league (same parse as audit-team-logos.mjs),
// plus the full team lists of NFL/NBA/MLB/NHL/WNBA/MLS/EPL. Behind a proxy run
// with NODE_USE_ENV_PROXY=1 (Node's fetch ignores HTTPS_PROXY otherwise).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { darkTeamLogo, fixTeamLogo, LOGO_REPLACE, logoOverride, teamLogoKey } from "../src/lib/teamLogos.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ESPN_SRC = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

const API = "https://site.api.espn.com/apis/site/v2/sports";
const CDN = "https://a.espncdn.com/i/teamlogos/";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const outArg = arg("out") ?? process.argv[process.argv.indexOf("--out") + 1];
if (!outArg || outArg.startsWith("--")) {
  console.error("usage: node --experimental-strip-types scripts/logo-gallery.mjs --out FILE.html [--days=14]");
  process.exit(2);
}
const OUT = resolve(outArg.replace(/^~(?=\/)/, homedir()));
const DAYS = Number(arg("days") ?? 14);

// ---- data -----------------------------------------------------------------

const pathsBlock = ESPN_SRC.slice(ESPN_SRC.indexOf("const SPORT_PATHS"));
const SPORT_PATHS = Object.fromEntries(
  [...pathsBlock.slice(0, pathsBlock.indexOf("\n};")).matchAll(/^\s+(\w+): "(\/[^"]+\/scoreboard)"/gm)]
    .filter(([, , p]) => !/^\/(golf|tennis|racing|mma)\//.test(p))
    .map(([, sport, p]) => [sport, p]),
);
const TEAM_LISTS = {
  nfl: "/football/nfl/teams",
  nba: "/basketball/nba/teams",
  mlb: "/baseball/mlb/teams",
  nhl: "/hockey/nhl/teams",
  wnba: "/basketball/wnba/teams",
  mls: "/soccer/usa.1/teams",
  epl: "/soccer/eng.1/teams",
};

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
  }
  return null;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dates = Array.from({ length: DAYS * 2 + 1 }, (_, i) => ymd(new Date(Date.now() + (i - DAYS) * 86400000)));
const isPlaceholder = (t) => !t.id || String(t.id).startsWith("-") || /^TBD\b/i.test(t.displayName ?? "");
// GameCard's teamInitials.
const initials = (t) => (t.abbreviation || t.shortDisplayName || t.displayName || "").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();

const teams = new Map(); // key -> { key, sport, id, name, abbr, espn }
const gaps = new Map(); // key -> { ...team, games }
const jobs = Object.entries(SPORT_PATHS).flatMap(([sport, path]) => dates.map((d) => [sport, `${API}${path}?dates=${d}`]));
let failedBoards = 0;
await pool(jobs, 12, async ([sport, url]) => {
  const data = await getJson(url);
  if (!data) failedBoards++;
  for (const e of data?.events ?? []) {
    for (const c of e.competitions?.[0]?.competitors ?? []) {
      const t = c.team ?? {};
      if (isPlaceholder(t)) continue;
      const key = `${sport}-${t.id}`;
      const row = { key, sport, id: String(t.id), name: t.displayName ?? "", abbr: initials(t), espn: t.logo || "" };
      if (!t.logo) {
        const g = gaps.get(key) ?? { ...row, games: new Set() };
        g.games.add(e.id);
        gaps.set(key, g);
      }
      if (!teams.has(key) || (!teams.get(key).espn && row.espn)) teams.set(key, row);
    }
  }
});
if (failedBoards > jobs.length / 2) {
  console.error(`board fetch failed: ${failedBoards} of ${jobs.length} ESPN boards did not load (behind a proxy? set NODE_USE_ENV_PROXY=1)`);
  process.exit(1);
}
for (const [sport, path] of Object.entries(TEAM_LISTS)) {
  const data = await getJson(`${API}${path}`);
  for (const { team: t } of data?.sports?.[0]?.leagues?.[0]?.teams ?? []) {
    const key = `${sport}-${t.id}`;
    if (teams.has(key) && teams.get(key).espn) continue;
    teams.set(key, { key, sport, id: String(t.id), name: t.displayName ?? "", abbr: initials(t), espn: t.logos?.[0]?.href ?? "" });
  }
}

// The app's own chain: ESPN's logo, else the override, then fixTeamLogo.
for (const t of teams.values()) {
  t.light = fixTeamLogo(t.espn || logoOverride(t.sport, t.id) || "");
  t.dark = t.light ? darkTeamLogo(t.light) : undefined;
}

// Does the dark copy differ from the light art? ESPN's ETag is the file's MD5.
async function etag(url) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    return res.ok ? (res.headers.get("etag") ?? `len:${res.headers.get("content-length")}`) : null;
  } catch {
    return null;
  }
}
const withDark = [...teams.values()].filter((t) => t.dark);
await pool(withDark, 24, async (t) => {
  const [a, b] = await Promise.all([etag(t.light), etag(t.dark)]);
  t.darkState = !b ? "missing" : a === b ? "same" : "changed";
});

// ---- render ---------------------------------------------------------------

// Card colours straight from globals.css; the dark ones are rgba over --bg.
function vars(selector) {
  const i = CSS.indexOf(`${selector} {`);
  const block = CSS.slice(i, CSS.indexOf("}", i));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
function over(rgba, bg) {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba);
  if (!m) return rgba;
  const b = bg.match(/[\da-f]{2}/gi).map((h) => parseInt(h, 16));
  const a = Number(m[4]);
  return `rgb(${[1, 2, 3].map((k, j) => Math.round(Number(m[k]) * a + b[j] * (1 - a))).join(",")})`;
}
const L = vars(":root");
const D = vars('[data-theme="dark"]');
const THEME = {
  light: { card: L["bg-card"], tile: L["bg-card-hover"], text: L.text, muted: L["text-muted"], border: L.border },
  dark: { card: over(D["bg-card"], D.bg), tile: over(D["bg-card-hover"], D.bg), text: D.text, muted: D["text-muted"], border: D.border },
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Self-hosted art is not live until the PR ships: inline it from public/.
const dataUris = new Map();
function src(url) {
  if (!url) return "";
  if (url.startsWith("/")) {
    if (!dataUris.has(url)) {
      const buf = readFileSync(join(ROOT, "public", url));
      const type = url.endsWith(".svg") ? "image/svg+xml" : "image/png";
      dataUris.set(url, `data:${type};base64,${buf.toString("base64")}`);
    }
    return dataUris.get(url);
  }
  // ESPN's combiner serves a 48 px thumbnail; ~3,000 full 500 px PNGs would not.
  if (url.startsWith(CDN)) return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${url.slice(CDN.length)}&w=48&h=48`;
  return url;
}
// A dark copy that fails falls back to the light art, as TeamLogo does in the
// app; only a light copy that fails marks the cell red.
const img = (url, fallback) =>
  `<img loading="lazy" src="${esc(src(url))}" alt=""${fallback && fallback !== url ? ` data-fb="${esc(src(fallback))}"` : ""} onerror="if(this.dataset.fb){this.src=this.dataset.fb;delete this.dataset.fb;this.closest('.cell').classList.add('fb')}else this.closest('.cell').classList.add('bad')">`;
const tile = (abbr) => `<span class="tile">${esc(abbr)}</span>`;
const cell = (theme, inner, label, note = "") =>
  `<div class="cell ${theme}"><div class="mark">${inner}</div><div class="lbl">${esc(label)}</div>${note ? `<div class="note">${esc(note)}</div>` : ""}</div>`;

// 1. Wrong logos.
const wrongRows = Object.entries(LOGO_REPLACE).map(([key, fixed]) => {
  const before = CDN + key;
  const beforeDark = darkTeamLogo(before) ?? before;
  const name = [...teams.values()].find((x) => x.espn && teamLogoKey(x.espn) === key)?.name ?? key;
  return `<div class="row"><div class="name">${esc(name)}<small>${esc(key)}</small></div>
    ${cell("light", img(before), "Before · light")}${cell("dark", img(beforeDark, before), "Before · dark")}
    ${cell("light", img(fixed), "After · light")}${cell("dark", img(fixed), "After · dark")}</div>`;
});

// 2. Missing logos.
const gapRows = [...gaps.values()].sort((a, b) => a.key.localeCompare(b.key)).map((g) => {
  const after = logoOverride(g.sport, g.id);
  return { g, after: after ? fixTeamLogo(after) : undefined };
});
const fixedGaps = gapRows.filter((r) => r.after);
const noSource = gapRows.filter((r) => !r.after);
const gapRow = ({ g, after }) => `<div class="row"><div class="name">${esc(g.name)}<small>${esc(g.key)} · ${g.games.size} game${g.games.size === 1 ? "" : "s"}</small></div>
  ${cell("light", tile(g.abbr), "Before · light")}${cell("dark", tile(g.abbr), "Before · dark")}
  ${after ? cell("light", img(after), "After · light") + cell("dark", img(darkTeamLogo(after) ?? after, after), "After · dark") : `<div class="tag">still initials: no source</div>`}</div>`;

// 3. All team logos, per league.
const bySport = new Map();
for (const t of teams.values()) {
  if (!t.light) continue;
  if (!bySport.has(t.sport)) bySport.set(t.sport, []);
  bySport.get(t.sport).push(t);
}
const sports = [...bySport.keys()].sort();
const changedCount = [...teams.values()].filter((t) => t.darkState === "changed").length;
const allLogos = [...bySport.values()].reduce((n, l) => n + l.length, 0);
const grid = sports.map((sport) => {
  const list = bySport.get(sport).sort((a, b) => a.name.localeCompare(b.name));
  const items = list.map((t) => {
    const note = t.darkState === "changed" ? "dark art differs" : t.darkState === "missing" ? "no dark copy → light" : t.dark ? "" : "no dark copy";
    return `<div class="team${t.darkState === "changed" ? " changed" : ""}" data-sport="${sport}"><div class="tname">${t.darkState === "changed" ? "◐ " : ""}${esc(t.name)}</div><div class="trio">
      ${cell("light", img(t.light), "Light")}${cell("dark", img(t.light), "Dark · before")}${cell("dark", img(t.darkState === "missing" ? t.light : (t.dark ?? t.light), t.light), "Dark · after", note)}</div></div>`;
  });
  return `<section class="league" data-sport="${sport}"><h3>${esc(sport.toUpperCase())} <small>${list.length}</small></h3><div class="teams">${items.join("")}</div></section>`;
});

const stamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HideScore team logos: before / after, light / dark</title>
<style>
:root{color-scheme:light dark;--pg:#fff;--fg:#111;--mut:#666;--line:#ddd}
@media (prefers-color-scheme:dark){:root{--pg:#0a0a0a;--fg:#ededed;--mut:#999;--line:#333}}
body{margin:0;padding:24px;background:var(--pg);color:var(--fg);font:14px/1.4 -apple-system,system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;border-top:1px solid var(--line);padding-top:16px}
h3{font-size:14px;margin:20px 0 8px}small{color:var(--mut);font-weight:normal}
.sum{color:var(--mut);margin:0 0 8px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap}
.name{width:240px;font-weight:600}.name small{display:block}
.cell{width:96px;height:78px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-sizing:border-box}
.cell.light{background:${THEME.light.card};color:${THEME.light.muted};border:1px solid ${THEME.light.border}}
.cell.dark{background:${THEME.dark.card};color:${THEME.dark.muted};border:1px solid ${THEME.dark.border}}
.cell.bad{outline:3px solid #e11d48}
.cell.fb::after{content:"no dark copy → light";font-size:9px;opacity:.8}
.mark{width:32px;height:32px;display:flex;align-items:center;justify-content:center}
.mark img{width:32px;height:32px;object-fit:contain}
.lbl{font-size:10px}.note{font-size:9px;opacity:.8}
.tile{width:32px;height:32px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.cell.light .tile{background:${THEME.light.tile};color:${THEME.light.muted}}
.cell.dark .tile{background:${THEME.dark.tile};color:${THEME.dark.muted}}
.tag{font-size:12px;padding:4px 8px;border-radius:999px;border:1px dashed var(--mut);color:var(--mut)}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px;position:sticky;top:0;background:var(--pg);padding:8px 0;z-index:1}
.pills button{font:inherit;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);background:none;color:inherit;cursor:pointer}
.pills button.on{background:var(--fg);color:var(--pg)}
.teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px}
.team{border:1px solid var(--line);border-radius:10px;padding:8px}.team.changed{border-color:#f59e0b}
.tname{font-size:12px;font-weight:600;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trio{display:flex;gap:6px}
body.only-changed .team:not(.changed){display:none}
#bad{color:#e11d48;font-weight:600}
</style></head><body>
<h1>HideScore team logos</h1>
<p class="sum">${esc(stamp)} ET · live ESPN boards ±${DAYS} days (${Object.keys(SPORT_PATHS).length} leagues) + NFL/NBA/MLB/NHL/WNBA/MLS/EPL team lists · <span id="bad"></span></p>

<h2>1. Wrong logos <small>${wrongRows.length}</small></h2>
<p class="sum">ESPN's art (before) vs the self-hosted fix in LOGO_REPLACE (after).</p>
${wrongRows.join("\n")}

<h2>2. Missing logos <small>${gapRows.length} teams with no ESPN logo · ${fixedGaps.length} fixed · ${noSource.length} no source</small></h2>
<p class="sum">Before = the initials tile GameCard draws. After = the LOGO_OVERRIDES logo.</p>
<h3>Fixed <small>${fixedGaps.length}</small></h3>
${fixedGaps.map(gapRow).join("\n")}
<h3>No source <small>${noSource.length}</small></h3>
${noSource.map(gapRow).join("\n")}

<h2>3. All team logos, light + dark <small>${allLogos} teams · ${changedCount} with different dark art (◐)</small></h2>
<p class="sum">Each team: light card · dark card today (light art) · dark card after (ESPN's 500-dark copy).</p>
<div class="pills"><button data-f="all" class="on">All</button>${sports.map((s) => `<button data-f="${s}">${esc(s.toUpperCase())}</button>`).join("")}<button data-f="changed">◐ Changed in dark only</button></div>
${grid.join("\n")}
<script>
const pills = document.querySelectorAll(".pills button");
let league = "all";
pills.forEach((b) => b.addEventListener("click", () => {
  const f = b.dataset.f;
  if (f === "changed") { b.classList.toggle("on"); document.body.classList.toggle("only-changed"); return; }
  league = f;
  pills.forEach((p) => p.dataset.f !== "changed" && p.classList.toggle("on", p.dataset.f === f));
  document.querySelectorAll(".league").forEach((s) => { s.style.display = league === "all" || s.dataset.sport === league ? "" : "none"; });
}));
const tick = () => { const n = document.querySelectorAll(".cell.bad").length; document.getElementById("bad").textContent = n ? n + " images failed to load (red)" : ""; };
setInterval(tick, 2000);
</script>
</body></html>
`;
writeFileSync(OUT, html);
console.log(`${OUT}`);
console.log(`wrong ${wrongRows.length} · missing ${gapRows.length} (fixed ${fixedGaps.length}, no source ${noSource.length}) · all ${allLogos} teams, ${changedCount} changed in dark · boards failed ${failedBoards}/${jobs.length}`);
