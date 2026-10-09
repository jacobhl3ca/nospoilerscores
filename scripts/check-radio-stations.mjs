#!/usr/bin/env node
// Audits public/radio-stations.json — the Listen links (src/lib/radio.ts) —
// against the stations themselves and against ESPN's current team lists.
//
//   npm run radio:check            (writes ~/hidescore-radio-sources.html too)
//   npm run radio:check -- --no-page
//
// Exits 1 when a URL stops answering 200, when it redirects to a bare home
// page (the "station moved" signature: the old player slug now lands on the
// network's front page), when a row points at a denylisted host (a league or
// team-news site with a score bar), or when a row's `checked` date is older
// than 180 days. ESPN teams with no free row are a coverage REPORT, not a
// failure: some flagships really have no public stream page.
//
// Same reading rule as check-nfl-team-channels.mjs: the checker reads the
// shipped data file and the shipped denylist (src/lib/radio.ts), never a copy.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RADIO_HOST_DENYLIST, RADIO_SPORTS, deniedRadioHost } from "../src/lib/radio.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "public", "radio-stations.json");
const PAGE = join(homedir(), "hidescore-radio-sources.html");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAX_AGE_DAYS = 180;
const ESPN_PATH = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const table = JSON.parse(readFileSync(DATA, "utf8"));

// Every row with where it lives, for the report and the page.
const rows = [];
for (const [key, list] of Object.entries(table.teams ?? {})) for (const s of list) rows.push({ where: key, ...s });
for (const [key, s] of Object.entries(table.national ?? {})) rows.push({ where: `national:${key}`, ...s });
for (const [sport, l] of Object.entries(table.leagues ?? {})) {
  for (const s of l.free ?? []) rows.push({ where: `league:${sport}`, ...s });
  for (const s of l.paid ?? []) rows.push({ where: `league:${sport} (paid)`, ...s });
}
for (const [key, list] of Object.entries(table.events ?? {})) for (const s of list) rows.push({ where: `event:${key}`, ...s });

// Audacy's station pages are a JavaScript shell that answers 200 for ANY slug,
// so a moved station never 404s. Its own page API does know: a real slug
// returns contentObj with the station title, a dead one does not.
async function probeAudacy(url) {
  const path = new URL(url).pathname.replace(/\/$/, "");
  try {
    const res = await fetch(`https://api.audacy.com/experience/v1/page?path=${encodeURIComponent(path)}`, {
      headers: { "user-agent": UA, "aud-correlation-id": "hidescore-radio-check", "aud-uuid": "7c1f2a4e-1b2c-4d5e-8f90-123456789abc" },
      signal: AbortSignal.timeout(20000),
    });
    const title = res.ok ? (await res.json().catch(() => null))?.contentObj?.title : null;
    return title ? { status: 200, final: url, title } : { status: 404, final: url, title: "", error: "Audacy API has no station at this slug" };
  } catch (e) {
    return { status: 0, final: url, title: "", error: String(e?.cause?.code ?? e?.name ?? e) };
  }
}

async function probe(url) {
  if (/^https:\/\/(www\.)?audacy\.com\/stations\//.test(url)) return probeAudacy(url);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const html = res.ok ? await res.text() : "";
    const title = (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").trim().slice(0, 90);
    return { status: res.status, final: res.url, title };
  } catch (e) {
    return { status: 0, final: url, title: "", error: String(e?.cause?.code ?? e?.name ?? e) };
  }
}

const isHomePage = (from, to) => {
  try {
    const a = new URL(from);
    const b = new URL(to);
    return a.pathname.length > 1 && (b.pathname === "/" || b.pathname === "");
  } catch {
    return false;
  }
};

const problems = [];
const results = new Map();
const today = Date.now();
for (const url of [...new Set(rows.map((r) => r.url))]) {
  const r = await probe(url);
  results.set(url, r);
  const tag = r.status === 200 && !isHomePage(url, r.final) ? "ok  " : "FAIL";
  console.log(`  ${tag} ${String(r.status).padEnd(3)} ${url}${r.final !== url ? ` → ${r.final}` : ""}`);
  await sleep(250);
}
for (const row of rows) {
  const r = results.get(row.url);
  if (!/^https:\/\//.test(row.url)) problems.push(`${row.where} ${row.name}: not https (${row.url})`);
  const denied = deniedRadioHost(row.url);
  if (denied) problems.push(`${row.where} ${row.name}: denylisted host ${denied}`);
  if (r.status !== 200) problems.push(`${row.where} ${row.name}: HTTP ${r.status || r.error} ${row.url}`);
  else if (isHomePage(row.url, r.final)) problems.push(`${row.where} ${row.name}: redirects to a home page (${r.final})`);
  const age = (today - Date.parse(row.checked)) / 86400000;
  if (!Number.isFinite(age) || age > MAX_AGE_DAYS) problems.push(`${row.where} ${row.name}: checked ${row.checked} is over ${MAX_AGE_DAYS} days old`);
}

// Coverage: ESPN's team list per league vs rows with at least one free feed.
const coverage = [];
for (const sport of RADIO_SPORTS) {
  const path = ESPN_PATH[sport];
  if (!path) continue;
  const teams = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=60`)
    .then((r) => r.json())
    .then((d) => (d.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team))
    .catch(() => []);
  const none = teams.filter((t) => !(table.teams?.[`${sport}:${t.id}`] ?? []).some((s) => s.access?.cost === "free"));
  coverage.push({ sport, total: teams.length, none: none.map((t) => t.abbreviation) });
}
console.log("\nCoverage (teams with no free row):");
for (const c of coverage) console.log(`  ${c.sport.padEnd(4)} ${c.total - c.none.length}/${c.total}${c.none.length ? `  missing: ${c.none.join(", ")}` : ""}`);

if (!process.argv.includes("--no-page")) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const body = rows
    .map((row) => {
      const a = row.access ?? {};
      const r = results.get(row.url) ?? {};
      const geo = a.geo === "market" ? `market ${(a.dma ?? []).join("/")}` : a.geo === "country" ? `country ${(a.countries ?? []).join("/")}` : "none";
      const ok = r.status === 200 && !isHomePage(row.url, r.final);
      return `<tr${ok ? "" : ' class="bad"'}><td>${esc(row.where)}</td><td><a href="${esc(row.url)}">${esc(row.name)}</a></td><td>${esc(row.lang)}</td><td>${esc(geo)}</td><td>${a.signIn ? "yes" : ""}</td><td>${esc(a.vpnOk)}</td><td>${esc(a.cost)}</td><td>${esc(row.checked)}</td><td>${ok ? "200" : esc(r.status || r.error)}</td><td>${esc(row.note)}</td></tr>`;
    })
    .join("\n");
  const cov = coverage.map((c) => `<li>${c.sport.toUpperCase()}: ${c.total - c.none.length}/${c.total}${c.none.length ? ` (no row: ${esc(c.none.join(", "))})` : ""}</li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>HideScore radio sources</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}tr.bad{background:#fdd}th{background:#eee;position:sticky;top:0}</style>
<h1>HideScore radio sources</h1><p>Built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by npm run radio:check. ${rows.length} rows, ${problems.length} problem(s). Red = the URL did not answer 200.</p>
<ul>${cov}</ul>
<table><tr><th>Where</th><th>Station</th><th>Lang</th><th>Geo</th><th>Sign-in</th><th>VPN</th><th>Cost</th><th>Checked</th><th>HTTP</th><th>Note</th></tr>
${body}</table>`;
  writeFileSync(PAGE, html);
  console.log(`\nReview page: ${PAGE}`);
}

console.log(`\n${rows.length} rows checked; denylist has ${RADIO_HOST_DENYLIST.length} hosts.`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n` + problems.map((p) => `    - ${p}`).join("\n"));
  process.exit(1);
}
console.log("✓ Every Listen link answers, none is on the denylist, none is stale.");
