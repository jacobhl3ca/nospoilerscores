#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
// Highlight-button fallback check.
//
// For every finished game from the past ~36h across the in-season leagues,
// simulate the exact lookup chain the UI runs (resolveHighlightVideo in
// src/lib/youtube.ts):
//   1. channel-filtered query (the labeled "official" highlight button)
//   2. channel-filtered alternate slot for leagues with official channels
//      (unscoped only when there is no official channel)
// A game only becomes an incident when it is past the same readiness buffer as
// the UI, has no prebaked clip, and every route to a visible YouTube button is
// still empty after confirmation.
//
// Exit 1 only after the same incident survives a 1h grace period. Persisted
// incident state also makes each outage alert once rather than every run.
//
// Run locally:   node scripts/check-highlight-fallbacks.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-highlight-fallbacks.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";
const LOOKBACK_HOURS = 36;
const ALERT_GRACE_MS = 60 * 60 * 1000;
const STATE_FILE = process.env.HIGHLIGHT_STATE_FILE
  || path.join(process.env.HOME || ".", "Library", "Application Support", "hidescore-highlight-fallback-state.json");

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
  ncaaw: "/basketball/womens-college-basketball/scoreboard",
  ncaaf: "/football/college-football/scoreboard",
  nhl:   "/hockey/nhl/scoreboard",
  nfl:   "/football/nfl/scoreboard",
  epl:   "/soccer/eng.1/scoreboard",
  mls:   "/soccer/usa.1/scoreboard",
  fifa:  "/soccer/fifa.world/scoreboard",
  // ⚠️ These were all shipping UNMONITORED (added here 2026-08-03). Every
  // league added to src/lib/espn.ts SPORT_PATHS since this file was last swept
  // — the UEFA cups, the four big European leagues, and the second wave below
  // — had a highlight button in the app and no check behind it, so a channel
  // rename would have gone silent. Same class of gap as the six unmonitored
  // news feeds found on 2026-07-22.
  ucl:   "/soccer/uefa.champions/scoreboard",
  uel:   "/soccer/uefa.europa/scoreboard",
  laliga:       "/soccer/esp.1/scoreboard",
  seriea:       "/soccer/ita.1/scoreboard",
  bundesliga:   "/soccer/ger.1/scoreboard",
  ligue1:       "/soccer/fra.1/scoreboard",
  ligamx:       "/soccer/mex.1/scoreboard",
  nwsl:         "/soccer/usa.nwsl/scoreboard",
  efl:          "/soccer/eng.2/scoreboard",
  libertadores: "/soccer/conmebol.libertadores/scoreboard",
  saudi:        "/soccer/ksa.1/scoreboard",
  // ⛔ Deliberately absent: euro + afcon (year-gated, off until 2027/2028 —
  // add them in their tournament year) and cricket (no trusted uploader
  // exists, so it has no highlight button to monitor; see
  // NO_HIGHLIGHT_FALLBACK in src/lib/youtube.ts).
};

// Matches OFFICIAL_CHANNELS in src/lib/youtube.ts. Keep in sync.
// A sport listed in ESPN_PATHS with NO entry here (laliga, ligue1) is checked
// on its unscoped-search path only — that's intentional, those two have no
// official channel by design.
const OFFICIAL_CHANNELS = {
  nba: "NBA", wnba: "WNBA", mlb: "MLB", nhl: "NHL", nfl: "NFL", ncaam: "March Madness",
  ncaaw: "March Madness", ncaaf: "ESPN College Football",
  fifa: "FIFA", epl: "NBC Sports", mls: "Major League Soccer",
  ucl: "CBS Sports Golazo", uel: "CBS Sports Golazo", seriea: "CBS Sports Golazo",
  bundesliga: "Bundesliga",
  ligamx: "TUDN México",
  nwsl: "National Women's Soccer League",
  efl: "EFL",
  libertadores: "CONMEBOL Libertadores",
  saudi: "الدوري السعودي للمحترفين - Saudi Pro League",
};

// Matches SECONDARY_CHANNELS in src/lib/youtube.ts for team-game leagues.
// Every entry remains strict to that exact uploader.
const SECONDARY_CHANNELS = {
  nwsl: "CBS Sports W Golazo",
};

// Mirrors GameHighlights.tsx. A same-day final does not promise highlight
// buttons until this post-start window has opened.
const HIGHLIGHT_BUFFER_HOURS = {
  nba: 3.5, wnba: 3.5, ncaam: 4, ncaaw: 4, ncaaf: 5, nhl: 4.5, mlb: 5,
  nfl: 5, fifa: 3, epl: 3, mls: 3, ucl: 3, uel: 3, golf: 6, tennis: 4,
  laliga: 3, seriea: 3, bundesliga: 3, ligue1: 3,
  ligamx: 3, nwsl: 3, efl: 3, libertadores: 3, saudi: 3,
};
const REGULATION_PERIODS = {
  nba: 4, wnba: 4, ncaam: 2, ncaaw: 4, ncaaf: 4, nhl: 3, mlb: 9,
  nfl: 4, fifa: 2, epl: 2, mls: 2, ucl: 2, uel: 2, golf: 4, tennis: 3,
  laliga: 2, seriea: 2, bundesliga: 2, ligue1: 2,
  ligamx: 2, nwsl: 2, efl: 2, libertadores: 2, saudi: 2,
};

// Matches TEAM_NAME_ALIASES in src/lib/youtube.ts. Keep in sync.
const TEAM_NAME_ALIASES = {
  "Red Bull NY": "New York Red Bulls",
  "Tempo": "Toronto Tempo",
  "Valkyries": "Golden State Valkyries",
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
// Do not send the old custom bot-like User-Agent. ESPN returns 403 to that
// identity while accepting Node's default fetch identity and normal browsers;
// the old checker silently converted every 403 into an empty scoreboard.
const tfetch = (url) =>
  fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

let scoreboardRequests = 0;
let scoreboardSuccesses = 0;
const scoreboardFailures = [];

async function fetchScoreboard(sport, date) {
  const url = `${ESPN_BASE}${ESPN_PATHS[sport]}?dates=${fmtESPN(date)}`;
  scoreboardRequests++;
  let lastFailure = "unknown failure";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tfetch(url);
      if (res.ok) {
        scoreboardSuccesses++;
        return (await res.json()).events ?? [];
      }
      lastFailure = `HTTP ${res.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      // fall through and retry
    }
    await sleep(1000);
  }
  scoreboardFailures.push({ sport, date: fmtESPN(date), error: lastFailure });
  return [];
}

function isFinished(ev) {
  return ev?.status?.type?.state === "post" && ev?.status?.type?.completed === true;
}

const etDay = (value) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function highlightsReady(ev, sport) {
  if (etDay(ev.date) !== etDay(Date.now())) return true;
  const gameStart = Date.parse(ev.date);
  if (Number.isNaN(gameStart)) return false;
  const period = Number(ev?.status?.period ?? ev?.competitions?.[0]?.status?.period ?? 0);
  const otPeriods = Math.max(0, period - (REGULATION_PERIODS[sport] ?? 4));
  const otExtra = otPeriods * (sport === "mlb" ? 0.25 : 0.5);
  const bufferHours = (HIGHLIGHT_BUFFER_HOURS[sport] ?? 4) + otExtra;
  return Date.now() > gameStart + bufferHours * 3_600_000;
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

async function fetchBakedHighlights() {
  try {
    const res = await tfetch(`${BASE}/news/highlights.json`);
    if (!res.ok) return {};
    const data = await res.json();
    return data?.games ?? {};
  } catch {
    return {};
  }
}

function loadIncidentState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveIncidentState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
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
async function resolve(away, home, dateStr, channel, gap = 0, strictChannel = !!channel) {
  const a = aliasTeam(away);
  const h = aliasTeam(home);
  const dated = `${a} vs ${h} highlights ${dateStr}`;
  if (channel) {
    const hit = await youtubeLookup(dated, channel);
    if (hit) return { videoId: hit, via: "channel+date" };
    if (strictChannel) return { videoId: null, via: "channel-exhausted" };
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
const bakedGames = await fetchBakedHighlights();
let scanned = 0;
let deferred = 0;
let baked = 0;

for (const sport of Object.keys(ESPN_PATHS)) {
  const channel = OFFICIAL_CHANNELS[sport];
  for (const d of dates) {
    const events = await fetchScoreboard(sport, d);
    for (const ev of events) {
      if (!isFinished(ev)) continue;
      if (!endedWithinLookback(ev)) continue;
      const teams = extractTeams(ev);
      if (!teams) continue;
      if (!highlightsReady(ev, sport)) {
        deferred++;
        continue;
      }
      scanned++;
      const bakedHighlight = bakedGames[`${sport}:${ev.id}`];
      if (bakedHighlight && (
        bakedHighlight.official
        || bakedHighlight.extended
        || bakedHighlight.telemundo
        || bakedHighlight.telemundoExtended
      )) {
        baked++;
        continue;
      }
      const dateStr = fmtUIDate(ev.date);

      const primaryChannel = sport === "fifa" ? null : channel;
      const secondaryChannel = sport === "mlb"
        ? null
        : sport === "fifa"
          ? "FOX Sports"
          : (SECONDARY_CHANNELS[sport] ?? channel);
      const official = primaryChannel
        ? await resolve(teams.away, teams.home, dateStr, primaryChannel, FIRST_PASS_GAP_MS)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(FIRST_PASS_GAP_MS);
      const search = await resolve(
        teams.away,
        teams.home,
        dateStr,
        secondaryChannel,
        FIRST_PASS_GAP_MS,
        !!secondaryChannel,
      );
      await sleep(FIRST_PASS_GAP_MS);

      const row = {
        sport: sport.toUpperCase(),
        date: fmtESPN(d),
        matchup: `${teams.away} @ ${teams.home}`,
        score: `${teams.awayScore}-${teams.homeScore}`,
        query: `${aliasTeam(teams.away)} vs ${aliasTeam(teams.home)} highlights ${dateStr}`,
        channel: [primaryChannel, secondaryChannel].filter(Boolean).join(" / ") || "(none)",
        officialResult: official.videoId ? `${official.videoId} (${official.via})` : "EXHAUSTED",
        searchResult: search.videoId ? `${search.videoId} (${search.via})` : "EXHAUSTED",
        // Raw inputs kept so the confirmation pass below can re-resolve.
        away: teams.away,
        home: teams.home,
        dateStr,
        primaryChannel,
        secondaryChannel,
        eventId: String(ev.id),
      };
      const anyVisibleButton = (primaryChannel ? !!official.videoId : false) || !!search.videoId;
      if (!anyVisibleButton) {
        exhausted.push(row);
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
    let official = { videoId: row.primaryChannel ? null : "n/a", via: "exhausted" };
    let search = { videoId: null, via: "exhausted" };
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(CONFIRM_RETRY_BACKOFF_MS); // let a lingering block lift
      official = row.primaryChannel
        ? await resolve(row.away, row.home, row.dateStr, row.primaryChannel, CONFIRM_GAP_MS)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(CONFIRM_GAP_MS);
      search = await resolve(
        row.away,
        row.home,
        row.dateStr,
        row.secondaryChannel,
        CONFIRM_GAP_MS,
        !!row.secondaryChannel,
      );
      const anyVisibleButton = (row.primaryChannel ? !!official.videoId : false) || !!search.videoId;
      if (anyVisibleButton) break; // recovered — stop retrying this game
    }
    // Refresh the printed results with the final attempt's outcome either way.
    row.officialResult = official.videoId ? `${official.videoId} (${official.via})` : "EXHAUSTED";
    row.searchResult = search.videoId ? `${search.videoId} (${search.via})` : "EXHAUSTED";
    const anyVisibleButton = (row.primaryChannel ? !!official.videoId : false) || !!search.videoId;
    if (!anyVisibleButton) {
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
console.log(`scanned:     ${scanned} highlight-ready finished game(s)`);
console.log(`deferred:    ${deferred} (inside the UI's upload buffer; not promised yet)`);
console.log(`prebaked:    ${baked} (visible without a live lookup)`);
console.log(`exhausted:   ${confirmedExhausted.length}   (no visible YouTube button after confirmation)`);
console.log(`recovered:   ${recovered.length}  (first pass missed, retry caught it — transient throttle, no email)`);
console.log(`alias-needed: ${aliasNeeded.length}  (official-channel filter missed — broader retry caught it)\n`);

if (scoreboardFailures.length) {
  console.log("--- INCOMPLETE: ESPN SCOREBOARD SOURCE FAILURE ---");
  console.log(`successful: ${scoreboardSuccesses}/${scoreboardRequests}`);
  scoreboardFailures.forEach((failure) => {
    console.log(`[${failure.sport.toUpperCase()} ${failure.date}] ${failure.error}`);
  });
  console.log("Source failures are not zero-game slates; refusing to report this audit clean.");
  process.exit(1);
}

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

  const now = Date.now();
  const oldState = loadIncidentState();
  const newState = {};
  const alertable = [];
  const pending = [];
  const alreadyAlerted = [];

  for (const row of confirmedExhausted) {
    const key = `${row.sport.toLowerCase()}:${row.eventId}`;
    const previous = oldState[key] ?? {};
    const incident = {
      firstSeen: Number(previous.firstSeen) || now,
      alerted: previous.alerted === true,
      lastSeen: now,
      matchup: row.matchup,
    };
    newState[key] = incident;
    if (incident.alerted) {
      alreadyAlerted.push(row);
    } else if (now - incident.firstSeen >= ALERT_GRACE_MS) {
      alertable.push(row);
      incident.alerted = true;
    } else {
      pending.push(row);
    }
  }
  saveIncidentState(newState);

  if (pending.length) {
    console.log(`--- GRACE: ${pending.length} incident(s) first seen less than 1h ago; no alert ---`);
    pending.forEach(printRow);
  }
  if (alreadyAlerted.length) {
    console.log(`--- SUPPRESSED: ${alreadyAlerted.length} incident(s) already alerted; no repeat ---`);
    alreadyAlerted.forEach(printRow);
  }
  if (alertable.length) {
    console.log("--- EXHAUSTED (no visible button after 1h grace) ---");
    console.log(`(endpoint healthy: ${probeHits}/${PROBES.length} evergreen probes resolved)\n`);
    alertable.forEach(printRow);
    console.log("Fix path: check the prebake and the official-channel lookup for these games.");
    process.exit(1);
  }

  process.exit(0);
}

saveIncidentState({});
console.log("✅ no exhausted lookups — no UI fallbacks in the audit window.");
process.exit(0);
