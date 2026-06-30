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

// Pacing. youtube.com soft-blocks the Worker's datacenter IP when /api/youtube
// is scraped in a tight burst — it serves a renderer-less page that the endpoint
// reports as 404 "No results", which this audit would then misread as a hidden
// highlight button. Crucially the Worker IP is SHARED with real users, so a
// burst doesn't just produce false alerts, it briefly breaks highlights on the
// live site too. A single lookup never trips it (a real page only fires one per
// card), so the audit trickles its lookups out slowly enough to stay invisible
// next to normal traffic, and treats any miss as suspect until it survives a
// slow, post-cooloff confirmation pass. Actions minutes are free on this public
// repo, so we trade runtime (a few minutes) for never tripping the block.
// Tuned up from 200ms/30s after heavy World Cup days still tripped it 6/19.
const FIRST_PASS_GAP_MS = 1_200;         // between lookups during the initial scan
const CONFIRM_COOLOFF_MS = 60_000;       // wait out the IP block before confirming
const CONFIRM_GAP_MS = 2_000;            // very gentle spacing while confirming
const CONFIRM_RETRY_BACKOFF_MS = 10_000; // extra wait between confirmation attempts
const CONFIRM_ATTEMPTS = 4;              // re-resolve a flagged game up to N times

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

// Per-request timeout. This check runs from the Mac mini's residential IP
// (GitHub Actions runner IPs get Cloudflare bot-challenged, which hung every
// /api/youtube fetch and falsely flagged all games — see issue #7). The
// timeout still bounds any transient stall so a run can't drag on for an hour.
const FETCH_TIMEOUT_MS = 8000;
const UA = "nospoilerscores-staleness-check/1.0 (+https://hidescore.com)";
const tfetch = (url) =>
  fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": UA } });

async function fetchScoreboard(sport, date) {
  const url = `${ESPN_BASE}${ESPN_PATHS[sport]}?dates=${fmtESPN(date)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tfetch(url);
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
    const res = await tfetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

// Mirrors resolveHighlightVideo() in src/lib/youtube.ts. `gap` spaces out the
// chained fallback lookups so a single game's cascade can't burst the endpoint.
async function resolve(away, home, dateStr, channel, gap = 0) {
  const a = aliasTeam(away);
  const h = aliasTeam(home);
  const dated = `${a} vs ${h} highlights ${dateStr}`;
  if (channel) {
    const hit = await youtubeLookup(dated, channel);
    if (hit) return { videoId: hit, via: "channel+date" };
    if (gap) await sleep(gap);
  }
  const unscoped = await youtubeLookup(dated);
  if (unscoped) return { videoId: unscoped, via: "no-channel+date" };
  if (gap) await sleep(gap);
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
        ? await resolve(teams.away, teams.home, dateStr, channel, FIRST_PASS_GAP_MS)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(FIRST_PASS_GAP_MS);
      const search = await resolve(teams.away, teams.home, dateStr, undefined, FIRST_PASS_GAP_MS);
      await sleep(FIRST_PASS_GAP_MS);

      const row = {
        sport: sport.toUpperCase(),
        date: fmtESPN(d),
        matchup: `${teams.away} @ ${teams.home}`,
        score: `${teams.awayScore}-${teams.homeScore}`,
        query: `${aliasTeam(teams.away)} vs ${aliasTeam(teams.home)} highlights ${dateStr}`,
        channel: channel ?? "(none)",
        officialResult: official.videoId ? `${official.videoId} (${official.via})` : "EXHAUSTED",
        searchResult: search.videoId ? `${search.videoId} (${search.via})` : "EXHAUSTED",
        // Raw inputs kept so the confirmation pass below can re-resolve.
        away: teams.away,
        home: teams.home,
        dateStr,
        channelKey: channel,
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

// Confirmation pass. The /api/youtube endpoint throttles under load, so a
// single scheduled run can null out lookups that resolve fine moments later
// (the classic tell: several standard-named teams all "missing" the channel
// filter in the same run). Re-resolve each exhausted game once after a short
// cool-off and only keep the ones that are STILL empty — those are the real
// hidden-button cases worth emailing about. Games that come back are logged
// as recovered (no email).
const confirmedExhausted = [];
const recovered = [];
if (exhausted.length) {
  // The fast first pass can soft-block the Worker IP, so most games flagged
  // above are false positives. Wait out the block, then re-resolve each one
  // slowly and up to a few times: a genuinely button-less game stays empty on
  // every attempt, while a throttle-induced miss comes back once the block
  // lifts. Only the games still empty after all that get emailed.
  await sleep(CONFIRM_COOLOFF_MS);
  for (const row of exhausted) {
    let official = { videoId: row.channelKey ? null : "n/a", via: "exhausted" };
    let search = { videoId: null, via: "exhausted" };
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(CONFIRM_RETRY_BACKOFF_MS); // let a lingering block lift
      official = row.channelKey
        ? await resolve(row.away, row.home, row.dateStr, row.channelKey, CONFIRM_GAP_MS)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(CONFIRM_GAP_MS);
      search = await resolve(row.away, row.home, row.dateStr, undefined, CONFIRM_GAP_MS);
      const officialOk = row.channelKey ? !!official.videoId : true;
      if (officialOk && search.videoId) break; // recovered — stop retrying this game
    }
    // Refresh the printed results with the final attempt's outcome either way.
    row.officialResult = official.videoId ? `${official.videoId} (${official.via})` : "EXHAUSTED";
    row.searchResult = search.videoId ? `${search.videoId} (${search.via})` : "EXHAUSTED";
    const officialStillEmpty = row.channelKey && !official.videoId;
    const searchStillEmpty = !search.videoId;
    if (officialStillEmpty || searchStillEmpty) {
      confirmedExhausted.push(row);
    } else {
      recovered.push(row);
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
console.log(`exhausted:   ${confirmedExhausted.length}   (still empty after a confirmation retry — button is hidden)`);
console.log(`recovered:   ${recovered.length}  (first pass missed, retry caught it — transient throttle, no email)`);
console.log(`alias-needed: ${aliasNeeded.length}  (official-channel filter missed — broader retry caught it)\n`);

if (aliasNeeded.length) {
  console.log("--- ALIAS NEEDED (warning only, no email) ---");
  aliasNeeded.forEach(printRow);
}

if (recovered.length) {
  console.log("--- RECOVERED ON RETRY (transient throttle, no email) ---");
  recovered.forEach(printRow);
}

if (confirmedExhausted.length) {
  // Endpoint health gate. If the /api/youtube endpoint is unreachable from
  // wherever this runs, EVERY lookup fails and masquerades as dozens of broken
  // buttons. Before alerting, probe with evergreen queries that must resolve if
  // YouTube search works at all. If even those come back empty, the endpoint is
  // blocked/down — an infra issue, not a real regression — so skip (exit 0).
  const PROBES = [
    "Lakers vs Celtics highlights",
    "Yankees vs Red Sox highlights",
    "Real Madrid vs Barcelona highlights",
  ];
  let probeHits = 0;
  for (const q of PROBES) {
    if (await youtubeLookup(q)) probeHits++;
    await sleep(200);
  }
  if (probeHits === 0) {
    console.log("--- SKIP: /api/youtube unreachable from this runner ---");
    console.log(`All ${PROBES.length} evergreen probes returned empty, so the ${confirmedExhausted.length}`);
    console.log("exhausted game(s) above reflect a blocked endpoint, not hidden highlight");
    console.log("buttons. Not alerting.");
    process.exit(0);
  }

  console.log("--- EXHAUSTED (UI hides the button) ---");
  console.log(`(endpoint healthy: ${probeHits}/${PROBES.length} evergreen probes resolved)\n`);
  confirmedExhausted.forEach(printRow);
  console.log("Fix path: add a TEAM_NAME_ALIASES entry in src/lib/youtube.ts and mirror it in this script,");
  console.log("or extend the chain in resolveHighlightVideo() with an additional retry.");
  process.exit(1);
}

console.log("✅ no exhausted lookups — no UI fallbacks in the audit window.");
process.exit(0);
