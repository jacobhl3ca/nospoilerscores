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
//   node scripts/check-season-windows.mjs --now=2027-01-03   # run as another date
//
// CAUTION on --now: it moves the script's clock, not ESPN's data. Simulating a
// date past what ESPN has published makes leagues flag for fixtures that simply
// do not exist yet. Use it to check the DATE MATH (which season got anchored),
// not to predict what a future scheduled run will report.
//
// Exits 1 if any league is flagged, so it can gate a workflow. A league ESPN
// has no fixtures for is "unverified", not flagged, and stays green — EXCEPT
// within IMMINENT_CLOSE_DAYS of the window's close, where being unable to see
// the finale is itself the failure.

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

// Golf and tennis cannot be checked this way and must not be guessed at. Their
// ESPN endpoint is the whole TOUR (/golf/pga, /tennis/atp), not the individual
// event, so the "last game near the window" is simply the next tournament on
// the calendar — every Slam and major reports as closing 40 days early. Their
// windows are four-day majors and two-week Slams that move a little each year;
// checking them needs a per-event feed we do not have.
const TOUR_SPORTS = new Set(["golf", "tennis"]);

// Slack around each edge. A window is ALLOWED to open a few days early (the
// build-up is the point) but must never close before the last game.
const EARLY_OPEN_TOLERANCE_DAYS = 7;

// How close to the season's end a league has to be before "ESPN gave us nothing"
// stops being an acceptable answer. Monthly runs mean at most one or two land in
// this band per league per year, and inside it the season is live, so a real
// alert here is real — this is not a source of recurring noise.
const IMMINENT_CLOSE_DAYS = 60;

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

// ESPN caps a ranged scoreboard request at 100 events and fills them from the
// START of the range, so a wide probe on a busy league silently becomes a probe
// of its first few days. MLB's 42-day opener probe came back as 100 events
// spanning 2026-03-03 → 03-10 — all spring training, all dropped by the
// season-type filter below, reported as "no fixtures published near the opener
// yet". The check was blind to MLB's real opener AND to its World Series edge
// while looking like it had merely found nothing.
const EVENT_CAP = 100;
const SLICE_DAYS = 7;

async function fetchRange(path, range) {
  const res = await fetch(`${API}${path}?dates=${range}`);
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return { events: (await res.json()).events ?? [] };
}

// Some endpoints serve a single date but 404 any range: college basketball
// (men's and women's) and cricket all do. They were reporting as "HTTP 404 →
// unverified" every run, which means NCAAM's window — the one holding March
// Madness and the National Championship — has never actually been checked.
// Fall back to per-day requests for those, capped in flight so the walk stays
// polite. Monthly job, three leagues; the request count is affordable.
const DAY_CONCURRENCY = 8;

async function fetchByDay(path, range) {
  const [from, to] = range.split("-");
  const at = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
  const days = [];
  for (let d = at(from), end = at(to); d <= end; d = shift(d, 1)) days.push(ymd(d));

  const events = [];
  for (let i = 0; i < days.length; i += DAY_CONCURRENCY) {
    const batch = await Promise.all(days.slice(i, i + DAY_CONCURRENCY).map((d) => fetchRange(path, d)));
    const failed = batch.find((p) => p.error);
    // A single bad day is noise; a failing endpoint fails every day. Only give
    // up if the whole batch failed, so one flaky response can't mark a league
    // unverified on its own.
    if (failed && batch.every((p) => p.error)) return failed;
    events.push(...batch.flatMap((p) => p.events ?? []));
  }
  return { events };
}

async function fetchDays(path, range, preseason = false) {
  let first = await fetchRange(path, range);
  if (first.error === "HTTP 404" && range.includes("-")) first = await fetchByDay(path, range);
  if (first.error) return first;

  let events = first.events;
  // Only pay for slicing when the cap was actually hit — most leagues never do.
  if (events.length >= EVENT_CAP) {
    const [from, to] = range.split("-");
    const at = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
    const [start, end] = [at(from), at(to)];
    const slices = [];
    for (let d = start; d <= end; d = shift(d, SLICE_DAYS)) {
      slices.push(`${ymd(d)}-${ymd(shift(d, SLICE_DAYS - 1) > end ? end : shift(d, SLICE_DAYS - 1))}`);
    }
    const parts = await Promise.all(slices.map((s) => fetchRange(path, s)));
    const failed = parts.find((p) => p.error);
    if (failed) return failed;
    const seen = new Set();
    events = parts.flatMap((p) => p.events).filter((e) => !seen.has(e.id) && seen.add(e.id));
  }

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
  if (TOUR_SPORTS.has(cfg.sport)) return { cfg, issues: [], notes: [], skipped: true };

  const year = now.getUTCFullYear();
  const wraps = cfg.startDate > cfg.endDate;
  // Anchor to the season TODAY sits in. For a wrapping window (Sep → Feb), any
  // date on or before endDate belongs to the season that opened LAST calendar
  // year. Anchoring to this year's opener instead probes the season after next,
  // whose fixtures ESPN has not published — so the check reports "unverified"
  // and exits green on exactly the January and February runs it exists for.
  // (The previous line here was `open = X > now ? open : open`, which is a
  // no-op: every wrapping league silently checked the wrong season all winter.)
  const nowMMDD = `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const openYear = wraps && nowMMDD <= cfg.endDate ? year - 1 : year;
  const open = mmddToDate(cfg.kickoffDate ?? cfg.startDate, openYear);
  const close = mmddToDate(cfg.endDate, wraps ? openYear + 1 : openYear);

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

  // "Unverifiable" is only benign while the finale is far off — ESPN publishes
  // playoff dates during the season, so an empty close probe in September says
  // nothing. Inside IMMINENT_CLOSE_DAYS the season is running and those fixtures
  // MUST exist; silence there means the window, the path, or the API is wrong,
  // and it is silence at the championship edge. Escalate to a flag so the run
  // fails and the ntfy alert fires.
  const closeIsImminent = diffDays(close, now) <= IMMINENT_CLOSE_DAYS && diffDays(close, now) >= -30;
  const closeBlind = (msg) => (closeIsImminent ? issues : notes).push(closeIsImminent ? `${msg} — and the window closes in ${diffDays(close, now)}d, so this CANNOT be left unverified` : msg);

  if (closeProbe.error) closeBlind(`close probe: ${closeProbe.error}`);
  else if (!closeProbe.days.length) closeBlind("no fixtures published near the finale yet");
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
// --now lets you run the check as if it were another date. The bug this script
// had for its first day was date-dependent (wrapping leagues anchored to the
// wrong season all winter) and invisible in August, so being able to say
// `--now=2027-01-03` is how that class of bug gets caught before January does.
const nowArg = (args.find((a) => a.startsWith("--now=")) || "").slice(6);
const now = nowArg ? new Date(`${nowArg}T12:00:00Z`) : new Date();
if (nowArg && Number.isNaN(now.getTime())) {
  console.error(`--now=${nowArg} is not a date (expected YYYY-MM-DD)`);
  process.exit(2);
}
if (nowArg) console.log(`(running as of ${nowArg})\n`);
const leagues = parseLeagues().filter((l) => {
  if (l.yearCycle) return false; // World Cup / Euro cycles: no fixtures most years
  if (only.length) return only.includes(l.sport);
  return all || POPULAR.has(l.sport);
});

let flagged = 0;
let unverified = 0;
let skipped = 0;
for (const cfg of leagues) {
  const r = await checkLeague(cfg, paths, now);
  if (!r) continue;
  const window = `${cfg.startDate}→${cfg.endDate}${cfg.kickoffDate ? ` (kickoff ${cfg.kickoffDate})` : ""}`;
  if (r.skipped) {
    skipped++;
    console.log(`- ${cfg.label.padEnd(14)} ${window}  (per-event window, tour-wide feed — not checkable here)`);
  } else if (r.issues.length) {
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
    ? `\n${flagged} league window(s) need updating.${unverified ? ` ${unverified} unverifiable — recheck when ESPN publishes.` : ""}${skipped ? ` ${skipped} skipped.` : ""}`
    : `\nAll verifiable league windows cover their fixtures.${unverified ? ` ${unverified} unverifiable — recheck when ESPN publishes.` : ""}${skipped ? ` ${skipped} skipped.` : ""}`,
);
process.exit(flagged ? 1 : 0);
