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

// Golf and tennis can't be checked the same way as a league: their ESPN endpoint
// is the whole TOUR (/golf/pga, /tennis/atp), so "the last game near the window"
// is just the next tournament on the calendar and every major reports as closing
// 40 days early. That got them skipped entirely — which left the four golf majors
// and four Slams, the windows that MOVE a few days every single year, as the only
// leagues here with no guard at all.
//
// They are checkable after all: each event in the tour feed carries its own
// `name`, `date` and `endDate`, so matching on the name gives the real span of
// that one tournament. These are ESPN's exact names — verified against the feed,
// not guessed, and they do not match our labels ("Masters" is "Masters
// Tournament", the French Open is "Roland Garros"). A name that stops matching
// reads as unverified, never as a pass.
const TOUR_SPORTS = new Set(["golf", "tennis"]);
const TOUR_EVENT_NAMES = {
  "golf:Masters": "Masters Tournament",
  "golf:PGA Champ": "PGA Championship",
  "golf:US Open": "U.S. Open",
  "golf:The Open": "The Open",
  "tennis:Aus Open": "Australian Open",
  "tennis:French Open": "Roland Garros",
  "tennis:Wimbledon": "Wimbledon",
  "tennis:US Open": "US Open",
};

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
    const num = (k) => {
      const v = (rest.match(new RegExp(`${k}:\\s*(\\d+)`)) || [])[1];
      return v ? Number(v) : undefined;
    };
    out.push({
      sport: m[1],
      label: m[2],
      startDate: field("startDate"),
      endDate: field("endDate"),
      kickoffDate: field("kickoffDate"),
      scheduleReleaseDate: field("scheduleReleaseDate"),
      verifiedFor: num("verifiedFor"),
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
// The UEFA Conference League (uefa.europa.conf) rejects a range with a 400
// rather than a 404 (read 2026-09-26), which left it "unverifiable" on every
// run — so a 400 takes the same per-day walk.
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
  if ((first.error === "HTTP 404" || first.error === "HTTP 400") && range.includes("-")) first = await fetchByDay(path, range);
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

const dayOf = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

// ESPN's tour envelope is padded. The 2026 Australian Open reports endDate
// 2026-02-02, but the per-day feed only carries it through Feb 1 — the day of
// the final. Taking the envelope literally flagged a window that was correct as
// closing a day early, which is the expensive kind of false positive: it trains
// you to ignore the alert. Walk the per-day feed inward from each edge to find
// the days the tournament is actually played.
async function trueEdge(path, name, from, dir, maxSteps = 5) {
  for (let i = 0; i < maxSteps; i++) {
    const d = shift(from, i * dir);
    const r = await fetchRange(path, ymd(d));
    if (!r.error && (r.events ?? []).some((e) => e.name === name)) return d;
  }
  return null;
}

async function checkTourEvent(cfg, path, now) {
  const name = TOUR_EVENT_NAMES[`${cfg.sport}:${cfg.label}`];
  if (!name) return { cfg, issues: [], notes: [], skipped: true };

  const wraps = cfg.startDate > cfg.endDate;
  const windowFor = (y) => [mmddToDate(cfg.startDate, y), mmddToDate(cfg.endDate, wraps ? y + 1 : y)];
  const issues = [];
  const notes = [];

  // Check this year's running and next year's, and judge the LATEST one ESPN
  // has published. Next year is the one that matters — but it is only in the
  // feed for part of the year, and this year's running still catches a window
  // that is grossly wrong.
  const year = now.getUTCFullYear();
  const found = [];
  for (const y of [year, year + 1]) {
    const [from, to] = windowFor(y);
    const r = await fetchRange(path, `${ymd(shift(from, -30))}-${ymd(shift(to, 30))}`);
    if (r.error) {
      notes.push(`${y} probe: ${r.error}`);
      continue;
    }
    const ev = (r.events ?? []).find((e) => e.name === name);
    if (ev?.date && ev?.endDate) found.push({ y, start: dayOf(ev.date), end: dayOf(ev.endDate) });
  }

  if (!found.length) {
    notes.push(`ESPN has no "${name}" scheduled near this window yet`);
    return { cfg, issues, notes };
  }

  const { y, start: envStart, end: envEnd } = found.at(-1);
  const [winOpen, winClose] = windowFor(y);
  const [start, end] = await Promise.all([
    trueEdge(path, name, envStart, +1).then((d) => d ?? envStart),
    trueEdge(path, name, envEnd, -1).then((d) => d ?? envEnd),
  ]);
  const late = diffDays(end, winClose);
  if (late > 0) {
    issues.push(`CLOSES ${late}d BEFORE ${name} ENDS (${y} runs ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}) — the final would be hidden`);
  }
  const early = diffDays(start, winOpen);
  if (early > EARLY_OPEN_TOLERANCE_DAYS) {
    issues.push(`opens ${early}d before ${name} starts (${y} starts ${start.toISOString().slice(0, 10)})`);
  }
  if (!issues.length && y === year) {
    // Passing against a running that has already happened is worth having, but
    // it is not the same as confirming the window the app will actually use next.
    notes.push(`checked against the ${y} running; ${y + 1} not published yet`);
  }
  return { cfg, issues, notes };
}

async function checkLeague(cfg, paths, now) {
  const path = paths[cfg.sport];
  if (!path || !cfg.startDate || !cfg.endDate) return null;
  if (TOUR_SPORTS.has(cfg.sport)) return checkTourEvent(cfg, path, now);

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

  // The fixture probes below only prove the OPENER and the LAST GAME sit inside
  // the window. They say nothing about championshipDate, or about a league that
  // moved its finale by a week — the class of bug the 2026-08-09 hand audit
  // found. `verifiedFor` is the human half of that loop: the opener year someone
  // actually sat down and checked. Once a league has published the schedule for
  // a season nobody has verified, the config is due for a look, and saying so is
  // the only way that ever surfaces. Gated on scheduleReleaseDate so it can only
  // fire for the six leagues whose release date we actually know.
  let stale = null;
  if (cfg.scheduleReleaseDate && cfg.verifiedFor) {
    // Which season did the most recent release announce? A release that falls
    // BEFORE the league's own startDate in the calendar announces that same
    // year's season (NBA drops Aug 14 for an Oct 20 opener). One that falls
    // after it announces the next (MLB dropped Jul 16 2026 for March 2027).
    const releaseYear = mmddToDate(cfg.scheduleReleaseDate, year) > now ? year - 1 : year;
    const announced = cfg.scheduleReleaseDate < cfg.startDate ? releaseYear : releaseYear + 1;
    if (cfg.verifiedFor < announced) {
      stale = `the ${announced} schedule dropped ${cfg.scheduleReleaseDate}, but this window was last verified for ${cfg.verifiedFor} — recheck the opener and the championship, then bump verifiedFor`;
    }
  }

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

  return { cfg, issues, notes, stale };
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
let stale = 0;
let unverified = 0;
let skipped = 0;
for (const cfg of leagues) {
  const r = await checkLeague(cfg, paths, now);
  if (!r) continue;
  const window = `${cfg.startDate}→${cfg.endDate}${cfg.kickoffDate ? ` (kickoff ${cfg.kickoffDate})` : ""}`;
  // One header line per league, marked with the worst thing found, then the
  // detail indented under it. A stale verifiedFor counts even when the fixture
  // probes are clean — the probes and the human re-verification catch different
  // bugs, so one passing does not excuse the other.
  const detail = [];
  let marker;
  if (r.skipped) {
    skipped++;
    marker = "-";
    detail.push("per-event window, tour-wide feed — not checkable here");
  } else if (r.issues.length) {
    flagged++;
    marker = "✗";
    detail.push(...r.issues);
  } else if (r.notes.length) {
    // Unverifiable is NOT the same as correct — a schedule ESPN has not
    // published yet has to read as "recheck later", or a silent gap becomes a
    // green check.
    unverified++;
    marker = "?";
    detail.push(...r.notes);
  } else {
    marker = "✓";
  }
  if (r.stale) {
    stale++;
    if (marker === "✓" || marker === "?") marker = "!";
    detail.push(r.stale);
  }
  console.log(`${marker} ${cfg.label.padEnd(14)} ${window}`);
  for (const d of detail) console.log(`    ${d}`);
}

const tail = `${stale ? ` ${stale} awaiting re-verification after a schedule release.` : ""}${unverified ? ` ${unverified} unverifiable — recheck when ESPN publishes.` : ""}${skipped ? ` ${skipped} skipped.` : ""}`;
console.log(
  flagged
    ? `\n${flagged} league window(s) need updating.${tail}`
    : `\nAll verifiable league windows cover their fixtures.${tail}`,
);
process.exit(flagged || stale ? 1 : 0);
