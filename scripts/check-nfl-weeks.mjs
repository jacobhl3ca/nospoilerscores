// Regression check for the gridiron (NFL / NCAAF) highlight WEEK gate.
//
//   node scripts/check-nfl-weeks.mjs           # offline: worker + plumbing assertions
//   node scripts/check-nfl-weeks.mjs --live    # + resolve a real completed NFL slate
//
// Why this exists. Every other league's highlight lookup is pinned by a DATE:
// MLB titles carry "(6/26/26)", NBA/NHL carry "May 22, 2026", and the worker
// hard-skips any title whose date token disagrees with the query. The NFL
// channel carries no date at all — its house format is
//
//     "New York Giants vs Washington Commanders Game Highlights | NFL 2025 Season Week 1"
//
// so for two teams that meet TWICE in a season both uploads are identical to
// the date gate (no token to compare) and to the year gate (same year). The
// earlier upload then wins channelTeamsYearId purely by ranking first in
// YouTube's results. Measured against the live worker 2026-08-10 over the
// eight-game Dec 14 2025 slate: 7/8 correct, and Commanders@Giants served the
// WEEK 1 recap of the same fixture.
//
// The week is the only discriminator an NFL title actually carries, so it is
// the gate — passed as /api/youtube?week=N, hard-skipping a title whose week
// token disagrees while leaving a title with NO week token untouched (the
// postseason cuts are titled "Divisional Round", never "Week N").
//
// Sibling of scripts/check-indycar-tracks.mjs (the race gate, same shape).

import { readFileSync } from "node:fs";

const LIVE = process.argv.includes("--live");
// Point the live probe at a local `wrangler pages dev` instance to verify a
// worker change BEFORE it ships: HS_API_BASE=http://localhost:8799 node … --live
const API_BASE = process.env.HS_API_BASE || "https://hidescore.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// ── 1. The gate exists end to end ────────────────────────────────────────────
// Each leg is a separate file, and a break in ANY one of them silently reverts
// the whole thing to the pre-fix behaviour (a wrong-week recap, which looks
// completely normal on the card — no error, no empty row, just the wrong game).
const worker = readFileSync("public/_worker.js", "utf8");
check("worker reads the week param", /url\.searchParams\.get\("week"\)/.test(worker));
check(
  "worker hard-skips a disagreeing week token",
  /if \(queryWeek\) \{[\s\S]{0,400}?parseInt\(weekTok\[1\], 10\) !== queryWeek\) continue;/.test(worker),
);

const espn = readFileSync("src/lib/espn.ts", "utf8");
check("espn exposes gridironWeekNumber", /function gridironWeekNumber\(/.test(espn));
check("espn sends week only for the regular season", /event\.season\?\.type !== 2/.test(espn));
check("parseGame populates Game.weekNumber", /weekNumber: gridironWeekNumber\(sport, event\)/.test(espn));

const youtube = readFileSync("src/lib/youtube.ts", "utf8");
check("fetchFirstVideoId forwards week", /url \+= `&week=\$\{weekNumber\}`/.test(youtube));
// ⚠️ Anchored on the parameter alone, NOT on it being the last one. The
// original regex required `weekNumber?: number | null,` to be immediately
// followed by the closing `): Promise<string | null> {`, so adding the later
// `compTokens?: string[]` param turned this into a FAIL while the week was
// still being taken and forwarded perfectly (2026-09-04). A signature check
// that breaks when an unrelated argument is appended reports noise.
check("resolveHighlightVideo takes weekNumber", /weekNumber\?: number \| null,/.test(youtube));

const gh = readFileSync("src/components/GameHighlights.tsx", "utf8");
check("GameHighlights carries nss_week on the modal fallback", /nss_week=\$\{weekNumber\}/.test(gh));
// Same trap as above: this counted only call sites where `weekNumber` was the
// FINAL argument, so appending compTokens to all five made it read 5 !== 0 and
// fail (2026-09-04) even though every site passes the week. Match weekNumber
// anywhere in the argument list instead — that is the property being asserted.
check(
  "every GameHighlights resolve passes the week",
  // Match weekNumber whether it's the last argument (`…, weekNumber)`) or now
  // followed by the trailing compTokens arg (`…, weekNumber, compTokens)`) —
  // the same signature shift the resolveHighlightVideo check above accounts
  // for. Pinning `weekNumber\)` assumed week was last and matched zero of the
  // real call sites once compTokens landed.
  gh.match(/resolveHighlightVideo\(/g)?.length ===
    gh.match(/resolveHighlightVideo\([^;]*?\bweekNumber\b[^;]*?\)/gs)?.length,
  `${gh.match(/resolveHighlightVideo\(/g)?.length ?? 0} call sites`,
);

const vm = readFileSync("src/components/VideoModal.tsx", "utf8");
check("VideoModal re-applies the week on its embed-failure retry", /weekFallbackParam\(fallbackUrl\)/.test(vm));
check("…and appends it to the retry URL", /\$\{raceParam\}\$\{weekParam\}/.test(vm));

const bake = readFileSync("scripts/prebake-news.mjs", "utf8");
check("prebake sends the week", /if \(week\) url \+= `&week=\$\{week\}`/.test(bake));
check("prebake evicts a carried wrong-week id", /hlVideoMatchesWeek\(prevOfficial, week\)/.test(bake));

// ── 2. Live probe — a real slate, end to end through the deployed worker ─────
// Dec 14 2025 is the measured regression slate: Commanders@Giants is a Week 15
// game whose Week 1 twin outranks it. Any date works; this one is the one that
// caught the bug, so it stays the fixture.
if (LIVE) {
  const YMD = "20251214";
  const get = async (url) => {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? res.json() : null;
  };
  const board = await get(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${YMD}`,
  );
  const events = (board?.events ?? []).filter((e) => e?.status?.type?.state === "post");
  check("live: ESPN returned the slate", events.length > 0, `${events.length} finished games`);

  for (const event of events) {
    const comps = event.competitions?.[0]?.competitors ?? [];
    const away = comps.find((c) => c.homeAway === "away")?.team?.shortDisplayName;
    const home = comps.find((c) => c.homeAway === "home")?.team?.shortDisplayName;
    const week = event.season?.type === 2 ? event.week?.number : null;
    if (!away || !home || !week) continue;
    const dateStr = new Date(event.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
    // Sequential with a pause: the worker scrapes YouTube's results page, and a
    // burst of a full slate rate-limits into empty responses that look exactly
    // like "no recap exists" (same reason EventCard's UFC chain is sequential).
    await new Promise((r) => setTimeout(r, 2500));
    const q = `${away} vs ${home} highlights ${dateStr}`;
    const hit = await get(
      `${API_BASE}/api/youtube?q=${encodeURIComponent(q)}&channel=NFL&strict=1&week=${week}`,
    );
    if (!hit?.videoId) {
      // A dark slot is the app's preferred failure (the button hides). It is not
      // a wrong answer, so it is reported but does not fail the run.
      console.log(`note  ${away}@${home} wk${week} — no result (button would hide)`);
      continue;
    }
    const meta = await get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${hit.videoId}&format=json`,
    );
    const title = meta?.title ?? "";
    const tok = title.match(/\bw(?:ee)?k\.?\s*(\d{1,2})\b/i);
    check(
      `live: ${away}@${home} resolves to Week ${week}`,
      !!tok && parseInt(tok[1], 10) === week,
      title,
    );
  }
}

console.log(bad ? `\n${bad} FAILED` : "\nall good");
process.exit(bad ? 1 : 0);
