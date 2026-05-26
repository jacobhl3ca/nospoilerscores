#!/usr/bin/env node
// Highlight-button fallback check.
//
// For every finished game from the past ~36h across the in-season leagues,
// simulate the exact lookup chain the UI runs (resolveHighlightVideo in
// src/lib/youtube.ts):
//   1. channel-filtered query  (the labeled "official" highlight button)
//   2. unfiltered query
//   3. unfiltered query without the date suffix
// If both the official AND the search chains end empty for any game, the UI
// would hide one or both highlight buttons — that's the inconsistency Jacob
// wants to know about while the card is still live on the site.
//
// Exit 1 (so GitHub Actions emails the repo owner) when any chain misses;
// the per-game report prints to stdout so the email body shows what to fix.
//
// Run locally:   node scripts/check-highlight-fallbacks.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-highlight-fallbacks.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";
const LOOKBACK_HOURS = 36;

// Matches src/lib/espn.ts SPORT_PATHS for the team-sport leagues currently
// in season. NFL / NCAAM / FIFA / golf / tennis can be added year-round —
// scoreboards for inactive leagues just return zero events.
const ESPN_PATHS = {
  mlb:   "/baseball/mlb/scoreboard",
  nba:   "/basketball/nba/scoreboard",
  wnba:  "/basketball/wnba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  nhl:   "/hockey/nhl/scoreboard",
  nfl:   "/football/nfl/scoreboard",
  epl:   "/soccer/eng.1/scoreboard",
  mls:   "/soccer/usa.1/scoreboard",
  fifa:  "/soccer/fifa.world/scoreboard",
};

// Matches OFFICIAL_CHANNELS in src/lib/youtube.ts. Keep in sync.
const OFFICIAL_CHANNELS = {
  nba: "NBA", wnba: "WNBA", mlb: "MLB", nhl: "NHL", nfl: "NFL", ncaam: "March Madness",
  fifa: "FIFA", epl: "NBC Sports", mls: "Major League Soccer",
};

// Matches TEAM_NAME_ALIASES in src/lib/youtube.ts. Keep in sync.
const TEAM_NAME_ALIASES = {
  "Red Bull NY": "New York Red Bulls",
};
const aliasTeam = (n) => TEAM_NAME_ALIASES[n] ?? n;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

const fmtESPN = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

// Matches GameCard.tsx — `toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" })`
const fmtUIDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York",
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchScoreboard(sport, date) {
  const url = `${ESPN_BASE}${ESPN_PATHS[sport]}?dates=${fmtESPN(date)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()).events ?? [];
    } catch {
      // fall through and retry
    }
    await sleep(1000);
  }
  return [];
}

function isFinished(ev) {
  return ev?.status?.type?.state === "post" && ev?.status?.type?.completed === true;
}

function endedWithinLookback(ev) {
  const finishedAt = ev?.status?.type?.detail ? Date.parse(ev.date) : Date.parse(ev.date);
  if (Number.isNaN(finishedAt)) return false;
  // Use game start as a proxy for finish time — most sports run 2-4h. Add a
  // generous tail (+8h) so any game that started within `LOOKBACK_HOURS` plus
  // a long stretch of play counts as "recently live."
  const ageH = (Date.now() - finishedAt) / 3_600_000;
  return ageH >= 0 && ageH <= LOOKBACK_HOURS + 8;
}

function extractTeams(ev) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const home = comp.competitors.find((c) => c.homeAway === "home");
  if (!away || !home) return null;
  return {
    away: away.team.shortDisplayName ?? away.team.displayName,
    home: home.team.shortDisplayName ?? home.team.displayName,
    awayScore: away.score,
    homeScore: home.score,
  };
}

async function youtubeLookup(query, channel) {
  let url = `${BASE}/api/youtube?q=${encodeURIComponent(query)}`;
  if (channel) url += `&channel=${encodeURIComponent(channel)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

// Mirrors resolveHighlightVideo() in src/lib/youtube.ts.
async function resolve(away, home, dateStr, channel) {
  const a = aliasTeam(away);
  const h = aliasTeam(home);
  const dated = `${a} vs ${h} highlights ${dateStr}`;
  if (channel) {
    const hit = await youtubeLookup(dated, channel);
    if (hit) return { videoId: hit, via: "channel+date" };
  }
  const unscoped = await youtubeLookup(dated);
  if (unscoped) return { videoId: unscoped, via: "no-channel+date" };
  const undated = `${a} vs ${h} highlights`;
  const fallback = await youtubeLookup(undated);
  if (fallback) return { videoId: fallback, via: "no-channel+no-date" };
  return { videoId: null, via: "exhausted" };
}

// Walk the past 3 calendar days in ET — enough to cover the LOOKBACK_HOURS
// window across midnight UTC.
const today = new Date();
const dates = [0, 1, 2].map((daysAgo) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d;
});

const exhausted = []; // chain returned null — UI hides the button → email
const aliasNeeded = []; // channel step missed but later retry caught it → log only
let scanned = 0;

for (const sport of Object.keys(ESPN_PATHS)) {
  const channel = OFFICIAL_CHANNELS[sport];
  for (const d of dates) {
    const events = await fetchScoreboard(sport, d);
    for (const ev of events) {
      if (!isFinished(ev)) continue;
      if (!endedWithinLookback(ev)) continue;
      const teams = extractTeams(ev);
      if (!teams) continue;
      scanned++;
      const dateStr = fmtUIDate(ev.date);

      const official = channel
        ? await resolve(teams.away, teams.home, dateStr, channel)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(40);
      const search = await resolve(teams.away, teams.home, dateStr, undefined);
      await sleep(40);

      const row = {
        sport: sport.toUpperCase(),
        date: fmtESPN(d),
        matchup: `${teams.away} @ ${teams.home}`,
        score: `${teams.awayScore}-${teams.homeScore}`,
        query: `${aliasTeam(teams.away)} vs ${aliasTeam(teams.home)} highlights ${dateStr}`,
        channel: channel ?? "(none)",
        officialResult: official.videoId ? `${official.videoId} (${official.via})` : "EXHAUSTED",
        searchResult: search.videoId ? `${search.videoId} (${search.via})` : "EXHAUSTED",
      };
      const officialExhausted = channel && !official.videoId;
      const searchExhausted = !search.videoId;
      if (officialExhausted || searchExhausted) {
        exhausted.push(row);
      } else if (channel && official.via !== "channel+date") {
        // Channel-scoped lookup missed; the broader retry caught it.
        // The button still plays a video so users see no fallback,
        // but the labeled "official" button isn't returning an official-
        // channel video — likely a TEAM_NAME_ALIASES gap.
        aliasNeeded.push(row);
      }
    }
  }
}

const printRow = (r) => {
  console.log(`[${r.sport} ${r.date}] ${r.matchup} (${r.score})`);
  console.log(`  query:    ${r.query}`);
  console.log(`  channel:  ${r.channel}`);
  console.log(`  official: ${r.officialResult}`);
  console.log(`  search:   ${r.searchResult}`);
  console.log("");
};

console.log(`hidescore highlight fallback check`);
console.log(`base:        ${BASE}`);
console.log(`window:      past ${LOOKBACK_HOURS}h (≈${dates.length} ET days)`);
console.log(`leagues:     ${Object.keys(ESPN_PATHS).join(", ")}`);
console.log(`scanned:     ${scanned} finished game(s)`);
console.log(`exhausted:   ${exhausted.length}   (chain returns null — button is hidden)`);
console.log(`alias-needed: ${aliasNeeded.length}  (official-channel filter missed — broader retry caught it)\n`);

if (aliasNeeded.length) {
  console.log("--- ALIAS NEEDED (warning only, no email) ---");
  aliasNeeded.forEach(printRow);
}

if (exhausted.length) {
  console.log("--- EXHAUSTED (UI hides the button) ---");
  exhausted.forEach(printRow);
  console.log("Fix path: add a TEAM_NAME_ALIASES entry in src/lib/youtube.ts and mirror it in this script,");
  console.log("or extend the chain in resolveHighlightVideo() with an additional retry.");
  process.exit(1);
}

console.log("✅ no exhausted lookups — no UI fallbacks in the audit window.");
process.exit(0);
