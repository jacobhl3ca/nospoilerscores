#!/usr/bin/env node
// Lists every team the board would draw with NO logo, and checks the
// LOGO_OVERRIDES in src/lib/teamLogoOverrides.ts still load.
//
// ESPN leaves `logo` empty for some one-off opponents (D2 / NAIA schools on a
// D1 schedule, amateur clubs in early cup rounds). The card then shows an
// initials tile. For NCAA schools NCAA.com has the real logo, so this script
// looks each college gap up in NCAA.com's school index and prints the line to
// paste into LOGO_OVERRIDES. Check each new logo by eye before adding it. Re-run it when a college season opens (hockey
// early Oct, basketball early Nov) — the new D2 opponents arrive then.
//
//   node scripts/audit-team-logos.mjs              # ±14 days of every league
//   node scripts/audit-team-logos.mjs --days=30
//   node scripts/audit-team-logos.mjs --only=ncaam,ncaaw
//
// Exits 1 if an override is broken or a gap has an NCAA.com logo not yet
// listed. A gap with no source anywhere (NAIA, amateur clubs) is reported but
// stays green — the initials tile is the right answer for it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ESPN_SRC = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");
const LOGO_SRC = readFileSync(join(ROOT, "src/lib/teamLogoOverrides.ts"), "utf8");

// Same host + default agent as check-season-windows.mjs.
const API = "https://site.api.espn.com/apis/site/v2/sports";
const NCAA_INDEX = "https://www.ncaa.com/json/schools";
const ncaaComLogo = (slug) => `https://www.ncaa.com/sites/default/files/images/logos/schools/bgl/${slug}.svg`;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const DAYS = Number(arg("days") ?? 14);
const ONLY = arg("only")?.split(",");

const pathsBlock = ESPN_SRC.slice(ESPN_SRC.indexOf("const SPORT_PATHS"));
const SPORT_PATHS = Object.fromEntries(
  [...pathsBlock.slice(0, pathsBlock.indexOf("\n};")).matchAll(/^\s+(\w+): "(\/[^"]+\/scoreboard)"/gm)]
    // Individual-competitor feeds have no team logo slot.
    .filter(([, , p]) => !/^\/(golf|tennis|racing|mma)\//.test(p))
    .map(([, sport, p]) => [sport, p]),
);
// Entries are `"ncaah-132633": ncaa("maryville-mo")` or a plain URL string.
const OVERRIDES = Object.fromEntries(
  [...LOGO_SRC.matchAll(/"(\w+-\d+)": (?:ncaa\("([^"]+)"\)|"(https:[^"]+)")/g)].map(([, id, slug, url]) => [
    id,
    url ?? ncaaComLogo(slug),
  ]),
);

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dates = Array.from({ length: DAYS * 2 + 1 }, (_, i) => ymd(new Date(Date.now() + (i - DAYS) * 86400000)));

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
  }
  return null;
}

// A school NCAA.com has no art for still answers 200 — with a grey shield
// whose group id is "_GENERIC-LOGO_BGL" (Dillard, read 2026-09-26).
async function realLogo(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return res.ok && !(await res.text()).includes("_GENERIC-LOGO");
  } catch {
    return false;
  }
}

// ESPN "Fort Valley State" / "Florida Southern" / "Maryville (Mo)" vs NCAA
// "Fort Valley St." / "Fla. Southern" / "Maryville (MO)".
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ st: "state", fla: "florida", univ: "university" })[w] ?? w)
    .filter((w) => !["university", "college", "the", "of"].includes(w))
    .join(" ");

const leagues = Object.entries(SPORT_PATHS).filter(([s]) => !ONLY || ONLY.includes(s));
const gaps = new Map(); // `${sport}-${id}` -> team
const jobs = leagues.flatMap(([sport, path]) => dates.map((d) => [sport, `${API}${path}?dates=${d}`]));
for (let i = 0; i < jobs.length; i += 12) {
  const chunk = jobs.slice(i, i + 12);
  const pages = await Promise.all(chunk.map(([, url]) => getJson(url)));
  pages.forEach((data, j) => {
    const sport = chunk[j][0];
    for (const e of data?.events ?? []) {
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        const t = c.team ?? {};
        if (!t.id || String(t.id).startsWith("-") || /^TBD\b/i.test(t.displayName ?? "")) continue;
        if (t.logo) continue;
        const key = `${sport}-${t.id}`;
        const g = gaps.get(key) ?? { key, sport, name: t.displayName, location: t.location, games: new Set() };
        g.games.add(e.id);
        gaps.set(key, g);
      }
    }
  });
}

let schools = null;
const needSchools = [...gaps.values()].some((g) => g.sport.startsWith("ncaa") && !OVERRIDES[g.key]);
if (needSchools) schools = await getJson(NCAA_INDEX);

let failed = false;
const rows = [...gaps.values()].sort((a, b) => a.key.localeCompare(b.key));
console.log(`${leagues.length} leagues, ${dates[0]}–${dates.at(-1)}: ${rows.length} teams with no ESPN logo\n`);
for (const g of rows) {
  const label = `${g.key.padEnd(16)} ${g.name} (${g.games.size} game${g.games.size === 1 ? "" : "s"})`;
  if (OVERRIDES[g.key]) {
    const ok = await realLogo(OVERRIDES[g.key]);
    if (!ok) failed = true;
    console.log(`${ok ? "OK      " : "BROKEN  "} ${label}`);
    continue;
  }
  const want = norm(g.location || g.name);
  const matches = g.sport.startsWith("ncaa")
    ? (schools ?? []).filter((s) => norm(s.name) === want || norm(s.long_name) === want)
    : [];
  // "North Central" is both North Central College (IL, Cardinals) and North
  // Central University (MN, Rams) once "college"/"university" drop out, so a
  // name that fits two schools is left for a human to pick.
  if (matches.length > 1) {
    console.log(`PICK ONE ${label}: ${matches.map((s) => `${s.slug} (${s.long_name})`).join(" | ")}`);
    continue;
  }
  const match = matches[0];
  if (match && (await realLogo(ncaaComLogo(match.slug)))) {
    failed = true;
    console.log(`ADD      ${label}\n           "${g.key}": ncaa("${match.slug}"), // ${g.name}`);
  } else {
    console.log(`NO SOURCE ${label}`);
  }
}
const stale = Object.keys(OVERRIDES).filter((k) => !gaps.has(k));
if (stale.length) console.log(`\n${stale.length} listed teams have no game this window (normal off-season; keep them).`);
process.exit(failed ? 1 : 0);
