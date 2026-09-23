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

// WEEK TOKEN — hand copy of parseWeekFromTitle in public/_worker.js (and
// hlParseWeekFromTitle in scripts/prebake-news.mjs), kept in sync by hand.
// This live check is NFL-only today and NFL never spells a week out, so the
// digit path is all that fires in practice — but a title-parsing regex that
// silently disagrees with the two copies that DO see spelled weeks (CFL: TSN
// spells weeks 1–5 "WEEK ONE" … "WEEK FIVE") is exactly the kind of drift
// that produced the 2026-09-22 CFL bug in the first place, so all three stay
// byte-for-byte the same shape.
const WEEK_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const WEEK_TOKEN_RE = new RegExp(
  `\\bw(?:ee)?k\\.?\\s*(\\d{1,2}|${WEEK_WORDS.join("|")})(?:[\\s-]one)?\\b`,
  "i",
);
function parseWeekFromTitle(title) {
  const m = String(title ?? "").match(WEEK_TOKEN_RE);
  if (!m) return null;
  const whole = m[0].toLowerCase();
  const w = m[1].toLowerCase();
  const base = /^\d+$/.test(w) ? parseInt(w, 10) : WEEK_WORDS.indexOf(w);
  if (base < 0 || Number.isNaN(base)) return null;
  return base === 20 && /twenty[\s-]one\b/.test(whole) ? 21 : base;
}

// ── 1. The gate exists end to end ────────────────────────────────────────────
// Each leg is a separate file, and a break in ANY one of them silently reverts
// the whole thing to the pre-fix behaviour (a wrong-week recap, which looks
// completely normal on the card — no error, no empty row, just the wrong game).
const worker = readFileSync("public/_worker.js", "utf8");
check("worker reads the week param", /url\.searchParams\.get\("week"\)/.test(worker));
check(
  "worker hard-skips a disagreeing week token",
  /if \(queryWeek\) \{[\s\S]{0,400}?titleWeek !== null && titleWeek !== queryWeek\) continue;/.test(worker),
);
// 2026-09-22: CFL's own 2024/2025 no-week re-uploads need the OPPOSITE of the
// NFL/NCAAF pass-through above — a no-week title has to be a hard reject, but
// only for the channels in WEEK_TOKEN_REQUIRED_CHANNELS (TSN), never NFL/NCAAF.
check(
  "worker rejects a no-week title only for CFL, not for the NFL/NCAAF pass-through",
  /WEEK_TOKEN_REQUIRED_CHANNELS = new Set\(\["tsn"\]\)/.test(worker) &&
    /titleWeek === null && WEEK_TOKEN_REQUIRED_CHANNELS\.has\(preferChannelLower\)\) continue;/.test(worker),
);
// The week regex has to read TSN's spelled-out CFL weeks (1–5 are "WEEK ONE"
// … "WEEK FIVE") or a title with a real, disagreeing week token reads as "no
// token" and slips through the wrong-week gate above untouched (measured live
// 2026-09-22: 3/3 wrong for wk6 OTT@EDM, wk8 CGY@WPG, wk8 HAM@MTL).
check(
  "worker's week token reads spelled-out numbers too",
  /function parseWeekFromTitle\(title\) \{/.test(worker) && /"eleven", "twelve"/.test(worker),
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
check("prebake evicts a carried wrong-week id", /hlVideoMatchesWeek\(prevOfficial, week, cflWeekRequired\)/.test(bake));
// 2026-09-22: the carried-entry check has to flip to a hard reject on a
// missing week token for CFL only (TSN's own no-week uploads are a different,
// older season's format), and its own week-token regex has to read TSN's
// spelled-out weeks 1–5, same as the worker's copy above.
check(
  "prebake requires a week token for CFL only, not NFL/NCAAF",
  /const cflWeekRequired = lg\.sport === "cfl";/.test(bake) &&
    /async function hlVideoMatchesWeek\(id, week, requireWeek = false\)/.test(bake),
);
check(
  "prebake's week token reads spelled-out numbers too",
  /function hlParseWeekFromTitle\(title\) \{/.test(bake) && /"eleven", "twelve"/.test(bake),
);
// 2026-09-22: CFL's own revalidation window has to be wider than the default
// 7 days, or a game that ages out before a matcher fix lands (like the age
// gate here, #84) never gets its carried id re-checked against the new rule.
check(
  "prebake widens the CFL revalidation window past the default 7 days",
  /const HL_CFL_DAYS = 30;/.test(bake) && /lg\.sport === "cfl" \? cflDates : dates/.test(bake),
);

// ── 1b. The PRESEASON leg — the same channel, no week, no "highlights" ────────
// The NFL titles its exhibitions "Detroit Lions vs Indianapolis Colts | 2026
// Preseason Week 3": no date, no "highlights", and a Week 1–3 numbering that
// collides with the regular season's (so Game.weekNumber is deliberately null
// for them). Every preseason card was dark for exactly that reason on 2026-09-06
// — the correct clip sat at rank 1 of the results page and the worker's
// highlight-keyword filter dropped it. The contract: a preseason card sends
// `comp=preseason|hall of fame`; the worker accepts the bare title ONLY under
// that token and ONLY from the strict NFL channel; the same token keeps a
// regular-season meeting of the same pair off the exhibition's card.
check(
  "worker accepts the NFL's bare preseason title only under the preseason token",
  /const isStrictBareNflPreseason =[\s\S]{0,400}?preferChannelLower === "nfl"[\s\S]{0,200}?compTokens\.includes\("preseason"\)[\s\S]{0,120}?\\bpreseason\//.test(worker),
);
check("…and counts it as a highlight", /isChessRoundBroadcast \|\|\n\s*isStrictBareNflPreseason;/.test(worker));
check("youtube exposes the preseason tokens", /NFL_PRESEASON_TITLE_TOKENS = \["preseason", "hall of fame"\]/.test(youtube));
check(
  "getCompetitionTitleTokens gates on the preseason flag for the NFL only",
  /if \(sport === "nfl" && opts\?\.preseason\) return NFL_PRESEASON_TITLE_TOKENS;/.test(youtube),
);
// The options bag grows (playoff, playoffLabel joined preseason), and each of
// these three patterns went red on a change that did not touch the gate at all
// -- measured 2026-09-20, all three were false alarms. They are anchored on the
// load-bearing token only, with the rest left open on purpose. Do NOT tighten
// them back to an exact-argument match: a gate that cries wolf gets deleted.
check(
  "GameHighlights derives the tokens from Game.isPreseason",
  /getCompetitionTitleTokens\(game\.sport, \{ preseason: game\.isPreseason[,}]/.test(gh),
);
check("GameHighlights carries nss_comp on the modal fallback", /nss_comp=\$\{encodeURIComponent\(compTokens\.join\("\|"\)\)\}/.test(gh));
check(
  "every GameHighlights resolve passes the tokens",
  gh.match(/resolveHighlightVideo\(/g)?.length ===
    gh.match(/resolveHighlightVideo\([^;]*?weekNumber, compTokens(?:\.length \? compTokens : [\w.]+)?\)/gs)?.length,
);
check("VideoModal re-applies the competition gate on its retry", /compFallbackParam\(fallbackUrl\)/.test(vm));
check("…and appends it to the retry URL", /\$\{raceParam\}\$\{weekParam\}\$\{compParam\}/.test(vm));
check("prebake mirrors the tokens", /HL_NFL_PRESEASON_TOKENS = \["preseason", "hall of fame"\]/.test(bake));
check(
  "prebake sends them for a type-1 NFL event only",
  /const preseason = lg\.sport === "nfl" && event\.season\?\.type === 1;/.test(bake) &&
    /const compTokens = preseason \? HL_NFL_PRESEASON_TOKENS : \([^;]*HL_COMPETITION_TOKENS\[lg\.sport\] \?\? null\);/.test(bake),
);

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
    const titleWeek = parseWeekFromTitle(title);
    check(
      `live: ${away}@${home} resolves to Week ${week}`,
      titleWeek !== null && titleWeek === week,
      title,
    );
  }
}

// ── 3. Live probe, preseason — the slate that was dark ───────────────────────
// Aug 29 2026 is Preseason Week 3 (ESPN numbers it week 4: the Hall of Fame
// weekend is its week 1). Lions@Colts and Bears@Titans both had an NFL-channel
// cut at rank 1 and no button. The card's exact request is replayed: the dated
// "highlights" query, strict NFL, NO week, comp=preseason|hall of fame — and the
// answer must be a title that says preseason, from the NFL.
if (LIVE) {
  const YMD = "20260829";
  const get = async (url) => {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? res.json() : null;
  };
  const board = await get(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${YMD}&seasontype=1`,
  );
  const events = (board?.events ?? []).filter((e) => e?.status?.type?.state === "post");
  check("live: ESPN returned the preseason slate", events.length > 0, `${events.length} finished games`);
  for (const event of events) {
    const comps = event.competitions?.[0]?.competitors ?? [];
    const away = comps.find((c) => c.homeAway === "away")?.team?.shortDisplayName;
    const home = comps.find((c) => c.homeAway === "home")?.team?.shortDisplayName;
    if (!away || !home || event.season?.type !== 1) continue;
    const dateStr = new Date(event.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
    await new Promise((r) => setTimeout(r, 2500));
    const q = `${away} vs ${home} highlights ${dateStr}`;
    const hit = await get(
      `${API_BASE}/api/youtube?q=${encodeURIComponent(q)}&channel=NFL&strict=1&comp=${encodeURIComponent("preseason|hall of fame")}`,
    );
    if (!hit?.videoId) {
      check(`live: ${away}@${home} preseason resolves`, false, "no result (button would hide)");
      continue;
    }
    const meta = await get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${hit.videoId}&format=json`,
    );
    const title = meta?.title ?? "";
    check(
      `live: ${away}@${home} resolves to an NFL preseason cut`,
      meta?.author_name === "NFL" && /\b(preseason|hall of fame)\b/i.test(title),
      `${meta?.author_name ?? "?"} — ${title}`,
    );
  }
}

console.log(bad ? `\n${bad} FAILED` : "\nall good");
process.exit(bad ? 1 : 0);
