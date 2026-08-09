#!/usr/bin/env node
// Audits every ALL_LEAGUES season window in src/lib/espn.ts against ESPN's own
// fixture list, and reports windows that open before the first game or close
// before the last one.
//
// This exists because the failure is SILENT. A stale endDate doesn't throw and
// doesn't 404 — the league column simply vanishes, and it vanishes at the worst
// possible moment, because the end of a window is where the championship is.
// Two live examples found the day this was written: the NFL window closed five
// days before Super Bowl LXI, and the NCAAF window closed before the playoff
// semifinals, hiding the National Championship entirely.
//
//   node scripts/check-season-windows.mjs            # popular leagues (default)
//   node scripts/check-season-windows.mjs --all      # every league with a window
//   node scripts/check-season-windows.mjs --only=nfl,epl
//
// Exits 1 if any league is flagged, so it can gate a workflow.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "src/lib/espn.ts"), "utf8");

// ESPN blocks a "Mozilla/5.0" UA on this host with a 403 but serves the default
// curl/undici agent fine, so DON'T add a browser User-Agent here.
const API = "https://site.api.espn.com/apis/site/v2/sports";

// Leagues worth paging a human about. The long tail (opt-in second-wave
// competitions) is checked only with --all: they are swap-menu only, so a wrong
// window costs far less, and several have no ESPN fixtures published yet.
const POPULAR = new Set(["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaam", "epl", "ucl", "mls", "wnba"]);

// Slack around each edge. A window is ALLOWED to open a few days early (the
// build-up is the point) but must never close before the last game.
const EARLY_OPEN_TOLERANCE_DAYS = 7;

function parseLeaguePaths() {
  const paths = {};
  for (const m of SRC.matchAll(/^\s{2}(\w+):\s*"(\/[^"]+\/scoreboard)"/gm)) paths[m[1]] = m[2];
  return paths;
}

function parseLeagues() {
  const start = SRC.indexOf("export const ALL_LEAGUES");
  const end = SRC.indexOf("\nconst MAX_LEAGUES", start);
  const body = SRC.slice(start, end);
  const out = [];
  for (const m of body.matchAll(/\{\s*sport:\s*"(\w+)",\s*label:\s*"([^"]+)"([^}]*)\}/g)) {
    const rest = m[3];
    const field = (k) => (rest.match(new RegExp(`${k}:\\s*"([^"]+)"`)) || [])[1];
    out.push({
      sport: m[1],
      label: m[2],
      startDate: field("startDate"),
      endDate: field("endDate"),
      kickoffDate: field("kickoffDate"),
      yearCycle: /yearCycle:/.test(rest),
      excludeFromAuto: /excludeFromAuto:\s*true/.test(rest),
      backfillOnly: /backfillOnly:\s*true/.test(rest),
    });
  }
  return out;
}

async function fetchDays(path, range, preseason = false) {
  const res = await fetch(`${API}${path}?dates=${range}`);
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  const events = data.events ?? [];
  // seasontype 1 is preseason. A regular-season window measured against
  // preseason games looks like it starts weeks early; a PRESEASON window
  // (the NFL Preseason backfill entry) measured against regular-season games
  // looks like it ends a month early. So each asks for its own game type.
  const wanted = events.filter((e) => ((e.season?.type ?? 2) === 1) === preseason);
  return { days: [...new Set(wanted.map((e) => e.date.slice(0, 10)))].sort() };
}

const mmddToDate = (mmdd, year) => new Date(`${year}-${mmdd}T12:00:00Z`);
const shift = (d, days) => new Date(d.getTime() + days * 86400000);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const diffDays = (a, b) => Math.round((a - b) / 86400000);

async function checkLeague(cfg, paths, now) {
  const path = paths[cfg.sport];
  if (!path || !cfg.startDate || !cfg.endDate) return null;

  const year = now.getUTCFullYear();
  const wraps = cfg.startDate > cfg.endDate;
  // Anchor to the season that is current or next: the opener in this calendar
  // year (or last year's, if we're past it in a wrapping window).
  let open = mmddToDate(cfg.kickoffDate ?? cfg.startDate, year);
  if (open > now && wraps) open = mmddToDate(cfg.kickoffDate ?? cfg.startDate, year - 1) > now ? open : open;
  const close = mmddToDate(cfg.endDate, wraps ? open.getUTCFullYear() + 1 : open.getUTCFullYear());

  // Probe a window around each edge rather than the whole season — ESPN caps
  // how much a single ranged request will return.
  const preseason = /preseason/i.test(cfg.label);
  const [openProbe, closeProbe] = await Promise.all([
    fetchDays(path, `${ymd(shift(open, -21))}-${ymd(shift(open, 21))}`, preseason),
    fetchDays(path, `${ymd(shift(close, -30))}-${ymd(shift(close, 45))}`, preseason),
  ]);

  const issues = [];
  const notes = [];

  if (openProbe.error) notes.push(`open probe: ${openProbe.error}`);
  else if (!openProbe.days.length) notes.push("no fixtures published near the opener yet");
  else {
    const first = new Date(`${openProbe.days[0]}T12:00:00Z`);
    const gap = diffDays(first, open);
    // backfillOnly entries (NFL Preseason) open early ON PURPOSE — their job is
    // to fill an otherwise-empty third slot through a thin stretch of the
    // calendar, not to have a game every day. Only their closing edge matters.
    if (gap > EARLY_OPEN_TOLERANCE_DAYS && !cfg.backfillOnly) {
      issues.push(`opens ${gap}d before the first game (first game ${openProbe.days[0]})`);
    }
  }

  if (closeProbe.error) notes.push(`close probe: ${closeProbe.error}`);
  else if (!closeProbe.days.length) notes.push("no fixtures published near the finale yet");
  else {
    const last = new Date(`${closeProbe.days.at(-1)}T12:00:00Z`);
    const over = diffDays(last, close);
    if (over > 0) {
      issues.push(`CLOSES ${over}d BEFORE THE LAST GAME (last game ${closeProbe.days.at(-1)}) — that game would be hidden`);
    }
  }

  return { cfg, issues, notes };
}

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const all = args.includes("--all");

const paths = parseLeaguePaths();
const now = new Date();
const leagues = parseLeagues().filter((l) => {
  if (l.yearCycle) return false; // World Cup / Euro cycles: no fixtures most years
  if (only.length) return only.includes(l.sport);
  return all || POPULAR.has(l.sport);
});

let flagged = 0;
let unverified = 0;
for (const cfg of leagues) {
  const r = await checkLeague(cfg, paths, now);
  if (!r) continue;
  const window = `${cfg.startDate}→${cfg.endDate}${cfg.kickoffDate ? ` (kickoff ${cfg.kickoffDate})` : ""}`;
  if (r.issues.length) {
    flagged++;
    console.log(`✗ ${cfg.label.padEnd(14)} ${window}`);
    for (const i of r.issues) console.log(`    ${i}`);
  } else if (r.notes.length) {
    // Unverifiable is NOT the same as correct — a schedule ESPN has not
    // published yet has to read as "recheck later", or a silent gap becomes a
    // green check.
    unverified++;
    console.log(`? ${cfg.label.padEnd(14)} ${window}  (${r.notes.join("; ")})`);
  } else {
    console.log(`✓ ${cfg.label.padEnd(14)} ${window}`);
  }
}

console.log(
  flagged
    ? `\n${flagged} league window(s) need updating.${unverified ? ` ${unverified} unverifiable — recheck when ESPN publishes.` : ""}`
    : `\nAll verifiable league windows cover their fixtures.${unverified ? ` ${unverified} unverifiable — recheck when ESPN publishes.` : ""}`,
);
process.exit(flagged ? 1 : 0);
