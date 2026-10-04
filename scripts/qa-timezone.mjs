// Live check for the start-time path (src/lib/gameTime.ts). Read-only.
//
//   node scripts/qa-timezone.mjs            # table of mismatches
//   node scripts/qa-timezone.mjs --json     # every row, for the QA page
//
// ESPN's status text carries an Eastern clock ("10/6 - 8:00 PM EDT") next to
// the game's real start (`date`). The cards now print `date` in the reader's
// zone and keep ESPN's clock only when the two disagree. This pulls every
// ESPN-scoreboard league the app loads for the next 7 days and prints each
// pre game whose Eastern clock from `date` is not the status-text clock — the
// cases where the card falls back to the parsed text.

import { readFileSync } from "node:fs";

const JSON_OUT = process.argv.includes("--json");
const BASE = "https://site.web.api.espn.com/apis/site/v2/sports";
const DAYS = 7;

const src = readFileSync(new URL("../src/lib/espn.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf("const SPORT_PATHS"), src.indexOf("};", src.indexOf("const SPORT_PATHS")));
const paths = [...block.matchAll(/^\s+"?([\w-]+)"?:\s*"(\/[^"]+\/scoreboard)"/gm)].map((m) => ({ sport: m[1], path: m[2] }));
const workerOnly = new Set((src.match(/WORKER_SCOREBOARD_SPORTS = new Set<Sport>\(\[([^\]]*)\]/)?.[1] ?? "").match(/[\w-]+/g) ?? []);
const leagues = paths.filter((p) => !workerOnly.has(p.sport));

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
// One request per day: ESPN answers 400 to a dates=A-B range on most leagues.
const days = Array.from({ length: DAYS }, (_, i) => ymd(new Date(Date.now() + i * 86_400_000)));
const range = `${days[0]}-${days[DAYS - 1]}`;

const etClock = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const etMd = (iso) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric" }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === "month").value}/${p.find((x) => x.type === "day").value}`;
};

function* preGames(node, name = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* preGames(n, name);
    return;
  }
  const label = node.shortName || node.name || name;
  const type = node.status?.type;
  if (typeof node.date === "string" && type?.state === "pre" && typeof type.shortDetail === "string") {
    const comp = node.competitors?.map((c) => c.athlete?.shortName || c.team?.abbreviation).filter(Boolean).join(" v ");
    yield { name: comp || label, date: node.date, detail: type.shortDetail };
  }
  for (const [k, v] of Object.entries(node)) if (k !== "status") yield* preGames(v, label);
}

async function pull({ sport, path }) {
  try {
    const events = [];
    const errors = [];
    for (const day of days) {
      const res = await fetch(`${BASE}${path}?dates=${day}&limit=500`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { errors.push(`${day} HTTP ${res.status}`); continue; }
      events.push(...((await res.json()).events ?? []));
    }
    if (errors.length === days.length) return { sport, error: errors[0], rows: [] };
    const seen = new Set();
    const rows = [];
    for (const g of preGames(events)) {
      const key = `${g.name}|${g.date}|${g.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const clock = g.detail.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
      if (!clock || /TBD/i.test(g.detail)) {
        rows.push({ sport, ...g, kind: "no-clock" });
        continue;
      }
      const textClock = `${+clock[1]}:${clock[2]} ${clock[3].toUpperCase()}`;
      const dateClock = etClock(g.date);
      const md = g.detail.match(/^(\d{1,2}\/\d{1,2})\s*-/)?.[1];
      const sameDay = !md || md === etMd(g.date);
      const ok = textClock === dateClock && sameDay;
      rows.push({ sport, ...g, kind: ok ? "match" : "mismatch", textClock, dateClock, dateMd: etMd(g.date) });
    }
    return { sport, rows };
  } catch (e) {
    return { sport, error: String(e?.message ?? e), rows: [] };
  }
}

const results = [];
for (let i = 0; i < leagues.length; i += 8) {
  results.push(...(await Promise.all(leagues.slice(i, i + 8).map(pull))));
}

const all = results.flatMap((r) => r.rows);
const mismatches = all.filter((r) => r.kind === "mismatch");
const summary = {
  range,
  leagues: leagues.length,
  leaguesWithGames: results.filter((r) => r.rows.length).length,
  errors: results.filter((r) => r.error).map((r) => `${r.sport}: ${r.error}`),
  preGames: all.length,
  withClock: all.filter((r) => r.kind !== "no-clock").length,
  matches: all.filter((r) => r.kind === "match").length,
  mismatches: mismatches.length,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, perLeague: results.map((r) => ({ sport: r.sport, error: r.error, pre: r.rows.length, clock: r.rows.filter((x) => x.kind !== "no-clock").length, mismatch: r.rows.filter((x) => x.kind === "mismatch").length })), mismatches }, null, 2));
} else {
  console.log(summary);
  for (const m of mismatches) console.log(`${m.sport}\t${m.name}\t${m.detail}\tdate=${m.date} (ET ${m.dateMd} ${m.dateClock})`);
}
