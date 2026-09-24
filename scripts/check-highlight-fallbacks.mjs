#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
// Highlight-button fallback check.
//
// For every finished game from the past ~36h across the in-season leagues,
// simulate the exact lookup chain the UI runs (resolveHighlightVideo in
// src/lib/youtube.ts):
//   1. channel-filtered query (the labeled "official" highlight button)
//   2. channel-filtered alternate slot (same or separately approved uploader)
// A game only becomes an incident when it is past the same readiness buffer as
// the UI and every channel-gated route to a visible YouTube button is empty.
// Prebaked IDs are accepted only after their slot marker and live oEmbed author
// both match the exact channel the UI promises.
//
// Exit 1 only after the same incident survives a 1h grace period; incomplete
// source audits exit 2 so the mini wrapper cannot mislabel infra as a real gap.
// Persisted
// incident state also makes each outage alert once rather than every run.
//
// Run locally:   node scripts/check-highlight-fallbacks.mjs
// Override base: HIDESCORE_BASE=https://staging.example.com node scripts/check-highlight-fallbacks.mjs

const BASE = process.env.HIDESCORE_BASE || "https://hidescore.com";
const LOOKBACK_HOURS = 36;
const ALERT_GRACE_MS = 60 * 60 * 1000;
const BAKED_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
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
const CONFIRM_COOLOFF_MS = Number(process.env.HIGHLIGHT_CONFIRM_COOLOFF_MS) || 60_000; // test override; production waits out the IP block
const CONFIRM_GAP_MS = 2_000;            // very gentle spacing while confirming
const CONFIRM_RETRY_BACKOFF_MS = 10_000; // extra wait between confirmation attempts
const CONFIRM_ATTEMPTS = Number(process.env.HIGHLIGHT_CONFIRM_ATTEMPTS) || 4; // re-resolve a flagged game up to N times
const SPECIAL_ONLY = process.env.HIGHLIGHT_SPECIAL_ONLY === "1"; // diagnostic run; scheduled production omits this

// Matches team-game highlight surfaces in src/lib/espn.ts. MLB is absent
// because its visible videos are MLB.com-native, not YouTube. Leagues with no
// approved uploader are absent because their UI is deliberately fail-closed.
const ESPN_PATHS = {
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
  seriea:       "/soccer/ita.1/scoreboard",
  bundesliga:   "/soccer/ger.1/scoreboard",
  // La Liga + Ligue 1 became monitorable 2026-09-19, when both were lit against
  // their US broadcaster — see OFFICIAL_CHANNELS below and the block in
  // src/lib/youtube.ts.
  laliga:       "/soccer/esp.1/scoreboard",
  ligue1:       "/soccer/fra.1/scoreboard",
  ligamx:       "/soccer/mex.1/scoreboard",
  nwsl:         "/soccer/usa.nwsl/scoreboard",
  efl:          "/soccer/eng.2/scoreboard",
  libertadores: "/soccer/conmebol.libertadores/scoreboard",
  saudi:        "/soccer/ksa.1/scoreboard",
  afcon:        "/soccer/caf.nations/scoreboard",
  // FA Cup (added 2026-09-14) — ESPN FC, gated on an "fa cup" title token.
  facup:        "/soccer/eng.fa/scoreboard",
  // ⚠️ Rugby was ANOTHER unmonitored wave (added here 2026-08-12). The three
  // rugby competitions with an approved uploader have had OFFICIAL_CHANNELS
  // entries and buffer/period rows in this file since 8/12, but no ESPN_PATHS
  // row — so this audit never fetched a single rugby fixture and their
  // highlight buttons shipped with nothing behind them. Same class of gap as
  // the UEFA-cups wave above and the six news feeds on 2026-07-22.
  // ESPN keys rugby by league PATH id, not a slug (see SPORT_PATHS in
  // src/lib/espn.ts). rugbychamp and rugbytest stay absent — they are in
  // NO_HIGHLIGHT_FALLBACK, so there is no button to monitor.
  sixnations:   "/rugby/180659/scoreboard",
  superrugby:   "/rugby/242041/scoreboard",
  rugbywc:      "/rugby/164205/scoreboard",
  nationschamp: "/rugby/17567/scoreboard",
  // CFL (added 2026-09-13): NOT an ESPN path. ESPN stopped serving the CFL
  // after 2023, so fetchScoreboard reads this one from our own worker route
  // (theScore reshaped to the ESPN scoreboard — public/_worker.js).
  cfl:          "/api/cfl",
  // Deliberately absent: MLB (MLB.com-native); EURO, NCAA
  // men's and women's hockey, women's volleyball, UFL, NCAA baseball, NCAA
  // softball, the Conference League, Copa del Rey, DFB-Pokal, and cricket (no
  // approved per-match uploader, so no YouTube button). ncaah / ufl /
  // ncaabase / ncaasoft / uecl / copadelrey / dfbpokal are in
  // NO_HIGHLIGHT_FALLBACK — see src/lib/youtube.ts. ncaavb and ncaawh (lit
  // 2026-09-23) have no fixed channel: each game resolves from its schools'
  // conference chain (collegeHighlightChannels.json), which this monitor does
  // not model, so they stay out of this table.
};

// Matches OFFICIAL_CHANNELS in src/lib/youtube.ts. Keep in sync.
const OFFICIAL_CHANNELS = {
  nba: "NBA", wnba: "WNBA", nhl: "NHL", nfl: "NFL", ncaam: "March Madness",
  ncaaw: "March Madness", ncaaf: "ESPN College Football",
  // TSN, not the CFL's own channel — see the cfl note in src/lib/youtube.ts.
  cfl: "TSN",
  // ⚠️ Two entries below had DRIFTED from src/lib/youtube.ts (found 2026-08-12).
  // `mlb: "MLB"` was missing outright, and fifa read "FIFA" while the app has
  // used "FOX Sports" since the World Cup work — FIFA's own channel posts only
  // alt-cast clips. A drifted mirror means this checker was validating a string
  // production never sends, i.e. green here proved nothing for those two.
  mlb: "MLB",
  fifa: "FOX Sports", epl: "NBC Sports", mls: "Major League Soccer",
  ucl: "CBS Sports Golazo", seriea: "CBS Sports Golazo",
  // UEL moved to CBS's second European channel (2026-09-19). UCL and Serie A
  // did NOT — they are still on the original Golazo channel until each is
  // re-probed on its own matchday.
  uel: "CBS Sports Golazo - Europe",
  bundesliga: "Bundesliga",
  // La Liga + Ligue 1, lit 2026-09-19 against their US broadcasters. Both carry
  // a REQUIRED competition title token below — ESPN FC also cuts the FA Cup,
  // the Copa del Rey and the Premier League, beIN also cuts the Coupe de France.
  laliga: "ESPN FC",
  ligue1: "beIN SPORTS USA",
  // "TUDN USA", not "TUDN México" — see the note on ligamx in
  // src/lib/youtube.ts. The México string resolved 0 videos for every fixture.
  ligamx: "TUDN USA",
  nwsl: "National Women's Soccer League",
  efl: "EFL",
  libertadores: "CONMEBOL Libertadores",
  saudi: "الدوري السعودي للمحترفين - Saudi Pro League",
  afcon: "CAF TV",
  facup: "ESPN FC",
  // Little League World Series, verified 2026-08-21: ESPN strict, 8 hits and 0
  // wrong over the 11 completed 2026 fixtures — but ONLY once the query names
  // the state/country instead of ESPN's city-based team name. extractTeams now
  // applies that rewrite (highlightTeamName above), so this probe sees what the
  // client sees.
  llws: "ESPN",
  // Rugby, verified 2026-08-12 (see the block in src/lib/youtube.ts).
  // rugbychamp and rugbytest deliberately have NO entry — they are in
  // NO_HIGHLIGHT_FALLBACK instead, because their only uploaders are fan
  // channels or one of the two clubs in the match.
  sixnations: "Guinness Men's Six Nations",
  superrugby: "Super Rugby Pacific",
  rugbywc: "World Rugby",
  nationschamp: "World Rugby",
};

// Mirrors COMPETITION_TITLE_TOKENS in src/lib/youtube.ts. Keep in sync.
// This is not optional decoration: without it the audit would resolve WITHOUT
// the `comp` gate the app sends, accept a U20 Junior World Championships video
// as a senior Nations Championship hit, and report a green button the app is
// actually hiding — a false NEGATIVE on a real gap.
const COMPETITION_TITLE_TOKENS = {
  nationschamp: ["nations championship"],
  facup: ["fa cup"],
  laliga: ["laliga", "la liga"],
  ligue1: ["ligue 1"],
};
// CFL playoffs — mirrors cflPlayoffTitleTokens in src/lib/youtube.ts (per
// event: the round from the card's playoff note). Keep in sync.
function cflPlayoffTokens(ev) {
  if (ev?.season?.type !== 3) return null;
  const l = String(ev?.competitions?.[0]?.notes?.[0]?.headline || "").toLowerCase();
  if (/grey.?cup/.test(l)) return ["grey cup"];
  if (/semi/.test(l)) return ["semi final"];
  if (/east/.test(l)) return ["east final", "eastern final"];
  if (/west/.test(l)) return ["west final", "western final"];
  return ["grey cup", "semi final", "east final", "eastern final", "west final", "western final", "playoff"];
}

// Matches SECONDARY_CHANNELS in src/lib/youtube.ts for team-game leagues.
// Every entry remains strict to that exact uploader.
const SECONDARY_CHANNELS = {
  nwsl: "CBS Sports W Golazo",
  // The channel UEL just moved off — it still holds the older ties.
  uel: "CBS Sports Golazo",
  // World Rugby posts the northern-hosted fixtures, SANZAAR's channel the
  // southern-hosted ones. See the block in src/lib/youtube.ts.
  nationschamp: "Super Rugby Pacific",
};

const TENNIS_CHANNELS = new Set([
  "Australian Open",
  "Roland-Garros",
  "Wimbledon",
  "US Open Tennis Championships",
]);

// Mirrors GameHighlights.tsx. A same-day final does not promise highlight
// buttons until this post-start window has opened.
const HIGHLIGHT_BUFFER_HOURS = {
  nba: 3.5, wnba: 3.5, ncaam: 4, ncaaw: 4, ncaaf: 5, nhl: 4.5, ncaah: 4.5, ncaawh: 4.5, ncaavb: 3,
  nfl: 5, cfl: 5, fifa: 3, epl: 3, mls: 3, ucl: 3, uel: 3, golf: 6, tennis: 4,
  seriea: 3, bundesliga: 3, laliga: 3, ligue1: 3,
  ligamx: 3, nwsl: 3, efl: 3, libertadores: 3, saudi: 3, afcon: 3, facup: 3,
  // Rugby union: 80 minutes plus stoppages, so the same 3h window soccer uses.
  sixnations: 3, superrugby: 3, rugbywc: 3, nationschamp: 3,
};
const REGULATION_PERIODS = {
  nba: 4, wnba: 4, ncaam: 2, ncaaw: 4, ncaaf: 4, nhl: 3, ncaah: 3, ncaawh: 3, ncaavb: 5,
  nfl: 4, cfl: 4, fifa: 2, epl: 2, mls: 2, ucl: 2, uel: 2, golf: 4, tennis: 3,
  seriea: 2, bundesliga: 2, laliga: 2, ligue1: 2,
  ligamx: 2, nwsl: 2, efl: 2, libertadores: 2, saudi: 2, afcon: 2, facup: 2,
  sixnations: 2, superrugby: 2, rugbywc: 2, nationschamp: 2,
};

// Matches TEAM_NAME_ALIASES in src/lib/youtube.ts. Keep in sync.
const TEAM_NAME_ALIASES = {
  "Red Bull NY": "New York Red Bulls",
  "Tempo": "Toronto Tempo",
  "Valkyries": "Golden State Valkyries",
  "Rensselaer": "RPI",
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
  // Worker-served leagues (cfl) live on BASE, not ESPN.
  const url = ESPN_PATHS[sport].startsWith("/api/")
    ? `${BASE}${ESPN_PATHS[sport]}?dates=${fmtESPN(date)}`
    : `${ESPN_BASE}${ESPN_PATHS[sport]}?dates=${fmtESPN(date)}`;
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
  const otExtra = otPeriods * 0.5;
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
  if (process.env.HIGHLIGHT_MANIFEST_FILE) {
    try {
      const data = JSON.parse(fs.readFileSync(process.env.HIGHLIGHT_MANIFEST_FILE, "utf8"));
      if (!data?.games || typeof data.games !== "object") {
        return { games: {}, failure: "local manifest has no games object" };
      }
      return { games: data.games, failure: null };
    } catch (error) {
      return { games: {}, failure: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    const res = await tfetch(`${BASE}/news/highlights.json`);
    if (!res.ok) return { games: {}, failure: `HTTP ${res.status}` };
    const data = await res.json();
    if (!data?.games || typeof data.games !== "object") {
      return { games: {}, failure: "response has no games object" };
    }
    return { games: data.games, failure: null };
  } catch (error) {
    return { games: {}, failure: error instanceof Error ? error.message : String(error) };
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

// Same file src/lib/youtube.ts and prebake-news.mjs read — see highlightTeamName
// there. This checker probes the SAME queries the client will issue, so it has to
// apply the same rewrite or it reports a league dark that actually resolves: LLWS
// under-reported here for exactly that reason until this was wired up.
const LLWS_REGION_NAMES = JSON.parse(
  fs.readFileSync(new URL("../src/lib/llwsRegions.json", import.meta.url), "utf8"),
);
// ncaaf titles use ESPN's team.location ("Western Kentucky"), not the short
// name ("Western KY") — mirrors LOCATION_NAME_SPORTS in src/lib/youtube.ts.
function highlightTeamName(sport, name, location) {
  if (sport === "ncaaf" || sport === "ncaavb") return (location && String(location).trim()) || name;
  if (sport !== "llws") return name;
  const code = String(name ?? "").trim().split(/\s+/).pop() ?? "";
  return LLWS_REGION_NAMES[code.toUpperCase()] ?? name;
}

function extractTeams(ev, sport) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const home = comp.competitors.find((c) => c.homeAway === "home");
  if (!away || !home) return null;
  return {
    away: highlightTeamName(sport, away.team.shortDisplayName ?? away.team.displayName, away.team.location),
    home: highlightTeamName(sport, home.team.shortDisplayName ?? home.team.displayName, home.team.location),
    awayScore: away.score,
    homeScore: home.score,
  };
}

async function youtubeLookup(query, channel, strict = !!channel, { raceTokens = [], compTokens = [] } = {}) {
  let url = `${BASE}/api/youtube?q=${encodeURIComponent(query)}`;
  if (channel) url += `&channel=${encodeURIComponent(channel)}`;
  if (strict && channel) url += "&strict=1";
  if (raceTokens.length) url += `&race=${encodeURIComponent(raceTokens.join("|"))}`;
  if (compTokens.length) url += `&comp=${encodeURIComponent(compTokens.join("|"))}`;
  try {
    const res = await tfetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

const oembedCache = new Map();
let oembedAttempts = 0;
let oembedSuccesses = 0;
let oembedTransportFailures = 0;
async function youtubeOembedMeta(videoId) {
  if (oembedCache.has(videoId)) return oembedCache.get(videoId);
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  oembedAttempts++;
  let receivedResponse = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tfetch(url);
      receivedResponse = true;
      if (res.ok) {
        const data = await res.json();
        const meta = { title: String(data.title ?? ""), author: String(data.author_name ?? "") };
        oembedCache.set(videoId, meta);
        oembedSuccesses++;
        return meta;
      }
    } catch { /* retry below */ }
    if (attempt < 2) await sleep(750);
  }
  if (!receivedResponse) oembedTransportFailures++;
  oembedCache.set(videoId, null);
  return null;
}

const normChannel = (value) => String(value ?? "").trim().toLowerCase();
const normalizeMatchText = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’]/g, "'")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9']+/g, " ")
  .trim();

const TITLE_TEAM_ALIASES = {
  tempo: ["tempo", "toronto tempo", "toronto"],
  valkyries: ["valkyries", "golden state valkyries", "golden state"],
  "red bull ny": ["red bull ny", "new york red bulls", "red bulls"],
  "nottm forest": ["nottm forest", "nottingham forest", "nottingham"],
  "man united": ["man united", "manchester united", "man utd"],
  "man city": ["man city", "manchester city"],
  "c palace": ["c palace", "crystal palace", "palace"],
  spurs: ["spurs", "tottenham", "tottenham hotspur"],
  nycfc: ["nycfc", "new york city fc", "new york city"],
  lafc: ["lafc", "los angeles fc", "los angeles football club"],
  psg: ["psg", "paris saint germain", "paris sg", "paris"],
  bayern: ["bayern", "bayern munich", "fc bayern", "fc bayern munchen"],
  "real madrid": ["real madrid", "madrid"],
  barcelona: ["barcelona", "barca", "fc barcelona"],
  usa: ["usa", "united states", "usmnt", "estados unidos"],
  "bosnia herz": ["bosnia herz", "bosnia herzegovina", "bosnia and herzegovina"],
  "south korea": ["south korea", "korea republic", "korea"],
  "ivory coast": ["ivory coast", "cote d ivoire"],
  turkiye: ["turkiye", "turkey"],
  "congo dr": ["congo dr", "dr congo", "democratic republic of congo"],
  czechia: ["czechia", "czech republic"],
  "cape verde": ["cape verde", "cabo verde"],
  egypt: ["egypt", "egipto"],
  france: ["france", "francia"],
  germany: ["germany", "alemania"],
  morocco: ["morocco", "marruecos"],
  netherlands: ["netherlands", "holland", "paises bajos"],
  belgium: ["belgium", "belgica"],
  switzerland: ["switzerland", "swiss", "suiza"],
  spain: ["spain", "espana"],
};

// The worker's club alias table, read straight out of public/_worker.js — the
// same reader as HL_WORKER_TEAM_VARIANTS in scripts/prebake-news.mjs, so the
// monitor, the worker and the prebake cannot disagree. Before this the monitor
// kept only the country table above and flagged nine served clips as
// bake-invalid on 2026-09-12 ("Red Bull New York", "Inter", "Wolverhampton").
// Empty when the block cannot be found, which degrades to the country table.
const WORKER_TEAM_VARIANTS = (() => {
  try {
    const src = fs.readFileSync(new URL("../public/_worker.js", import.meta.url), "utf8");
    const start = src.indexOf("const TEAM_ALIASES = {");
    const end = src.indexOf("\n        };", start);
    if (start < 0 || end < 0) return {};
    const table = new Function(`return {${src.slice(start + "const TEAM_ALIASES = {".length, end)}};`)();
    const index = {};
    for (const variants of Object.values(table)) {
      for (const v of variants) index[normalizeMatchText(v)] = variants.map(normalizeMatchText);
    }
    return index;
  } catch {
    return {};
  }
})();

function titleHasTeam(title, team) {
  const normalizedTitle = normalizeMatchText(title);
  const normalizedTeam = normalizeMatchText(team);
  const variants = new Set([
    normalizedTeam,
    normalizeMatchText(aliasTeam(team)),
    ...(TITLE_TEAM_ALIASES[normalizedTeam] ?? []).map(normalizeMatchText),
    ...(WORKER_TEAM_VARIANTS[normalizedTeam] ?? []),
  ]);
  if ([...variants].some((variant) => variant && normalizedTitle.includes(variant))) return true;
  // Name-order tolerance, same rule as hlTitleHasTeam in the prebake: ESPN
  // names Chinese tennis players family-name-first ("Zheng Qinwen") and the
  // channel titles them given-name-first. A two-word name matches when both
  // words appear as whole words anywhere in the title.
  return [...variants].some((variant) => {
    const words = String(variant ?? "").split(" ").filter(Boolean);
    if (words.length !== 2 || words.some((w) => w.length < 2)) return false;
    return words.every((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalizedTitle));
  });
}

function matchupFingerprint(away, home) {
  return [normalizeMatchText(away), normalizeMatchText(home)].sort().join("|");
}

function expectedBakedSlots(sport, bakedHighlight) {
  const primary = OFFICIAL_CHANNELS[sport];
  const secondary = sport === "fifa" ? "FOX Sports" : (SECONDARY_CHANNELS[sport] ?? primary);
  if (sport === "tennis") {
    return ["official", "extended"].map((slot) => {
      const marker = `${slot}Channel`;
      const candidate = bakedHighlight?.[marker];
      return { slot, marker, channel: TENNIS_CHANNELS.has(candidate) ? candidate : null, visible: true };
    });
  }
  return [
    { slot: "official", marker: "officialChannel", channel: primary, visible: sport !== "fifa" },
    { slot: "extended", marker: "extendedChannel", channel: secondary, visible: true },
    ...(sport === "fifa" ? [
      { slot: "telemundo", marker: "telemundoChannel", channel: "Telemundo Deportes", visible: true },
      { slot: "telemundoExtended", marker: "telemundoExtendedChannel", channel: "Telemundo Deportes", visible: true },
    ] : []),
  ];
}

async function validateBakedHighlight(sport, bakedHighlight) {
  const result = { trustedVisible: false, rejected: [], invalid: [], matchup: null };
  if (!bakedHighlight || bakedHighlight.sourcePolicy !== "official-channel") return result;
  if (!Number.isFinite(bakedHighlight.t) || Date.now() - Number(bakedHighlight.t) >= BAKED_MAX_AGE_MS) {
    result.rejected.push("missing or expired bake timestamp");
    return result;
  }
  const teams = Array.isArray(bakedHighlight.teams) ? bakedHighlight.teams : [];
  if (teams.length !== 2 || bakedHighlight.matchup !== matchupFingerprint(teams[0], teams[1])) {
    result.rejected.push("missing or inconsistent matchup provenance");
    return result;
  }
  result.matchup = bakedHighlight.matchup;
  const expected = expectedBakedSlots(sport, bakedHighlight);
  const seen = new Map();
  for (const spec of expected) {
    const videoId = bakedHighlight[spec.slot];
    if (!videoId) continue;
    const marker = bakedHighlight[spec.marker];
    if (normChannel(marker) !== normChannel(spec.channel)) {
      result.rejected.push(`${spec.slot}=${videoId}: marker ${JSON.stringify(marker ?? null)} != ${JSON.stringify(spec.channel)}`);
      continue;
    }
    const prior = seen.get(videoId);
    if (prior) {
      result.invalid.push(`${spec.slot}=${videoId}: duplicates ${prior.slot}`);
      continue;
    }
    seen.set(videoId, spec);
    const meta = await youtubeOembedMeta(videoId);
    if (!meta) {
      result.invalid.push(`${spec.slot}=${videoId}: unavailable to oEmbed`);
      continue;
    }
    if (normChannel(meta.author) !== normChannel(spec.channel)) {
      result.invalid.push(`${spec.slot}=${videoId}: uploader ${JSON.stringify(meta.author)} != ${JSON.stringify(spec.channel)}`);
      continue;
    }
    if (!titleHasTeam(meta.title, teams[0]) || !titleHasTeam(meta.title, teams[1])) {
      result.invalid.push(`${spec.slot}=${videoId}: title does not match ${teams[0]} vs ${teams[1]}`);
      continue;
    }
    if (sport === "fifa" && !/\b(world cup|copa mundial)\b/i.test(meta.title)) {
      result.invalid.push(`${spec.slot}=${videoId}: title does not identify the World Cup`);
      continue;
    }
    if (spec.visible) result.trustedVisible = true;
  }
  return result;
}

// Mirrors resolveHighlightVideo() in src/lib/youtube.ts: exactly one channel,
// strict, with no unscoped tier.
async function resolve(away, home, dateStr, channel, sport, compOverride = null) {
  const a = aliasTeam(away);
  const h = aliasTeam(home);
  const dated = `${a} vs ${h} highlights ${dateStr}`;
  if (!channel) return { videoId: null, via: "no-approved-channel" };
  const compTokens = compOverride ?? COMPETITION_TITLE_TOKENS[sport] ?? [];
  const hit = await youtubeLookup(dated, channel, true, { compTokens });
  return hit
    ? { videoId: hit, via: "strict-channel+date" }
    : { videoId: null, via: "channel-exhausted" };
}

async function resolveSpecial(query, channels, raceTokens = []) {
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const hit = await youtubeLookup(query, channel, true, { raceTokens });
    if (hit) return { videoId: hit, via: `strict:${channel}` };
    if (i < channels.length - 1) await sleep(FIRST_PASS_GAP_MS);
  }
  return { videoId: null, via: "channel-exhausted" };
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
const rejectedBaked = []; // missing/wrong marker; fixed client ignores and live-resolves
const invalidBaked = []; // channel, duplicate, or matchup proof disproved
const bakedManifest = await fetchBakedHighlights();
const bakedGames = bakedManifest.games;
const manifestFailures = bakedManifest.failure
  ? [{ source: "highlight-manifest", error: bakedManifest.failure }]
  : [];
const bakedValidationByKey = new Map();
for (const [key, bakedHighlight] of SPECIAL_ONLY ? [] : Object.entries(bakedGames)) {
  const split = key.indexOf(":");
  if (split < 1) continue;
  const sport = key.slice(0, split);
  const eventId = key.slice(split + 1);
  // Historical MLB YouTube records are inert and are removed by the new
  // prebaker. The visible MLB.com-native row has no YouTube source contract.
  if (sport === "mlb") continue;
  const validation = await validateBakedHighlight(sport, bakedHighlight);
  bakedValidationByKey.set(key, validation);
  if (validation.rejected.length) {
    rejectedBaked.push({ sport: sport.toUpperCase(), eventId, problems: validation.rejected });
  }
  if (validation.invalid.length) {
    invalidBaked.push({ sport: sport.toUpperCase(), eventId, problems: validation.invalid });
  }
}
function bindBakedToCurrentMatch(key, sport, eventId, away, home, validation) {
  if (!validation?.trustedVisible || validation.matchup === matchupFingerprint(away, home)) return;
  const problem = `manifest matchup ${JSON.stringify(validation.matchup)} != current ${away} vs ${home}`;
  validation.trustedVisible = false;
  validation.invalid.push(problem);
  const existing = invalidBaked.find((row) => row.sport === sport.toUpperCase() && row.eventId === String(eventId));
  if (existing) existing.problems.push(problem);
  else invalidBaked.push({ sport: sport.toUpperCase(), eventId: String(eventId), problems: [problem] });
  bakedValidationByKey.set(key, validation);
}
let scanned = 0;
let deferred = 0;
let baked = 0;
let specialScanned = 0;
let specialResolved = 0;
const specialSourceFailures = [];

const withinLookback = (iso) => {
  const ts = Date.parse(iso ?? "");
  if (!Number.isFinite(ts)) return false;
  const age = (Date.now() - ts) / 3_600_000;
  return age >= 0 && age <= LOOKBACK_HOURS + 8;
};

async function fetchSpecialJson(source, url) {
  let lastFailure = "unknown failure";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tfetch(url);
      if (res.ok) return await res.json();
      lastFailure = `HTTP ${res.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  specialSourceFailures.push({ source, error: lastFailure });
  return null;
}

async function checkSpecialCandidate({ sport, eventId, date, matchup, query, channels, raceTokens = [] }) {
  scanned++;
  specialScanned++;
  const result = await resolveSpecial(query, channels, raceTokens);
  await sleep(FIRST_PASS_GAP_MS);
  if (result.videoId) {
    specialResolved++;
    return;
  }
  exhausted.push({
    sport: sport.toUpperCase(),
    date,
    matchup,
    score: "",
    query,
    channel: channels.join(" / "),
    officialResult: "EXHAUSTED",
    searchResult: "n/a",
    eventId: String(eventId),
    special: { query, channels, raceTokens },
  });
}

function raceTokens(sport, name) {
  const n = String(name ?? "").trim();
  if (!n) return [];
  if (sport === "f1") {
    const match = n.match(/(\S+)\s+Grand\s+Prix/i);
    return [match?.[1] ?? n];
  }
  if (sport === "nascar") {
    const stripped = n
      .replace(/^NASCAR\s+[\w'’]+(?:\s+Auto\s+Parts)?\s+Series\s*/i, "")
      .replace(/^at\s+/i, "")
      .trim();
    return [stripped || n];
  }
  const stripped = n
    .replace(/^Grand\s+Prix\s+of\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  return [stripped || n];
}

async function scanRacingAndUfc() {
  const racing = {
    f1: { path: "/racing/f1/scoreboard", prefix: "Formula 1", channel: "FORMULA 1" },
    nascar: { path: "/racing/nascar-premier/scoreboard", prefix: "NASCAR Cup Series", channel: "NASCAR" },
    indycar: { path: "/racing/irl/scoreboard", prefix: "INDYCAR", channel: "NTT INDYCAR SERIES" },
  };
  const seen = new Set();
  for (const [sport, cfg] of Object.entries(racing)) {
    for (const date of dates) {
      const ymd = fmtESPN(date);
      const data = await fetchSpecialJson(`${sport}:${ymd}`, `${ESPN_BASE}${cfg.path}?dates=${ymd}`);
      for (const event of data?.events ?? []) {
        const key = `${sport}:${event.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const comps = event.competitions ?? [];
        const race = comps.find((comp) => String(comp?.type?.id) === "3") ?? comps[comps.length - 1];
        const state = race?.status?.type?.state ?? event?.status?.type?.state;
        const raceDate = race?.date ?? event.date;
        if (state !== "post" || !withinLookback(raceDate)) continue;
        const name = String(event.name || event.shortName || "Grand Prix");
        const cleanName = String(event.shortName || event.name || "Grand Prix").replace(/\bGP\b/i, "Grand Prix");
        const year = new Date(raceDate).getFullYear();
        const query = cleanName.toLowerCase().startsWith(cfg.prefix.toLowerCase())
          ? `${year} ${cleanName} race highlights`
          : `${cfg.prefix} ${year} ${cleanName} race highlights`;
        await checkSpecialCandidate({
          sport,
          eventId: event.id,
          date: ymd,
          matchup: name,
          query,
          channels: [cfg.channel],
          raceTokens: raceTokens(sport, name),
        });
      }
    }
  }

  const ufcSeen = new Set();
  for (const date of dates) {
    const ymd = fmtESPN(date);
    const data = await fetchSpecialJson(`ufc:${ymd}`, `${ESPN_BASE}/mma/ufc/scoreboard?dates=${ymd}`);
    for (const event of data?.events ?? []) {
      for (const bout of event.competitions ?? []) {
        const key = `ufc:${bout.id}`;
        if (ufcSeen.has(key)) continue;
        ufcSeen.add(key);
        const boutDate = bout.date ?? event.date;
        if (bout?.status?.type?.state !== "post" || !withinLookback(boutDate)) continue;
        const fighters = (bout.competitors ?? []).map((competitor) => competitor?.athlete?.displayName).filter(Boolean);
        if (fighters.length < 2) continue;
        const query = `${fighters[0]} vs ${fighters[1]} highlights`;
        await checkSpecialCandidate({
          sport: "ufc",
          eventId: bout.id,
          date: ymd,
          matchup: `${fighters[0]} vs ${fighters[1]}`,
          query,
          channels: ["UFC on Paramount+", "UFC", "ESPN MMA"],
        });
      }
    }
  }
}

async function scanCuratedEvents() {
  for (const cfg of [
    { sport: "poker", file: "poker-events.json" },
    { sport: "boxing", file: "boxing-events.json" },
  ]) {
    const data = await fetchSpecialJson(cfg.sport, `${BASE}/${cfg.file}`);
    for (const event of data?.events ?? []) {
      const end = event.endTime
        ? Date.parse(event.endTime)
        : Date.parse(`${event.endDate}T12:00:00Z`) + 12 * 3_600_000;
      if (!Number.isFinite(end) || end > Date.now() || !withinLookback(new Date(end).toISOString())) continue;
      if (!event.highlightQuery || !event.officialChannel) continue;
      await checkSpecialCandidate({
        sport: cfg.sport,
        eventId: event.id,
        date: event.endDate.replace(/-/g, ""),
        matchup: event.title,
        query: event.highlightQuery,
        channels: [event.officialChannel],
      });
    }
  }
}

// Chess plays the ORGANIZER'S ROUND BROADCAST rather than a highlight reel —
// the sport publishes none anywhere (see CHESS_ORGANIZER_CHANNELS in
// src/lib/espn.ts). Only an event whose name maps to a verified organizer can
// resolve at all, so only those are worth arming; everything else is dark by
// design and an "EXHAUSTED" row for it would be noise, not a regression.
const CHESS_ORGANIZERS = [
  { rx: /\b(GCT|Sinquefield|Cairns|Saint Louis|St\.? Louis|American Cup|Champions Showdown)\b/i, channel: "Saint Louis Chess Club" },
  { rx: /\bFIDE\b/i, channel: "FIDE chess" },
];
// Mirrors buildChessTokens in src/lib/espn.ts.
function chessTokens(name) {
  const base = String(name || "")
    .split("|")[0]
    .replace(/^GCT:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? [base] : [];
}

async function scanChess() {
  const data = await fetchSpecialJson("chess", `${BASE}/api/chess`);
  for (const event of data?.events ?? []) {
    if (event.state !== "post") continue;
    // Date off endsAt, not startsAt: a chess tournament runs for a week or
    // more, so keying the lookback on its START would skip every event whose
    // final round was actually yesterday — the ones worth checking.
    const finished = event.endsAt ?? event.startsAt;
    const iso = finished ? new Date(finished).toISOString() : null;
    if (!iso || !withinLookback(iso)) continue;
    const organizer = CHESS_ORGANIZERS.find((o) => o.rx.test(event.name));
    if (!organizer) continue;
    const [name] = String(event.name).split("|").map((s) => s.trim());
    await checkSpecialCandidate({
      sport: "chess",
      eventId: event.id,
      date: iso.slice(0, 10).replace(/-/g, ""),
      matchup: name || event.name,
      query: `${name || event.name}${event.round ? ` ${event.round}` : ""}`,
      channels: [organizer.channel],
      raceTokens: chessTokens(event.name),
    });
  }
}

async function scanEsports() {
  const seen = new Set();
  for (const date of dates) {
    const ymd = fmtESPN(date);
    const data = await fetchSpecialJson(`esports:${ymd}`, `${BASE}/api/esports?date=${ymd}`);
    for (const game of data?.games ?? []) {
      if (seen.has(game.id) || game.state !== "post" || !withinLookback(game.date)) continue;
      seen.add(game.id);
      // LEC is currently the only league with an approved spoiler-safe cut.
      if (String(game.league).toUpperCase() !== "LEC") continue;
      const away = game.away?.acronym || game.away?.name;
      const home = game.home?.acronym || game.home?.name;
      if (!away || !home) continue;
      const series = game.bestOf > 1 ? ` Bo${game.bestOf}` : "";
      const query = `${away} vs ${home} highlights ${fmtUIDate(game.date)}${series}`;
      await checkSpecialCandidate({
        sport: "esports",
        eventId: game.id,
        date: ymd,
        matchup: `${away} vs ${home}`,
        query,
        channels: ["LEC"],
      });
    }
  }
}

async function scanGolf() {
  const majors = [
    { label: "Masters", start: "04-09", channels: ["Golf Channel", "ESPN", "The Masters"] },
    { label: "PGA Champ", start: "05-14", channels: ["Golf Channel", "ESPN", "PGA Championships"] },
    { label: "US Open", start: "06-18", channels: ["Golf Channel", "United States Golf Association (USGA)"] },
    { label: "The Open", start: "07-16", channels: ["Golf Channel", "Sky Sports Golf", "The R&A"] },
  ];
  for (const date of dates) {
    const ymd = fmtESPN(date);
    const selected = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00Z`);
    const major = majors.find((candidate) => {
      const start = new Date(`${ymd.slice(0, 4)}-${candidate.start}T12:00:00Z`);
      const offset = Math.round((selected.getTime() - start.getTime()) / 86_400_000);
      return offset >= 0 && offset <= 3;
    });
    if (!major) continue;
    const data = await fetchSpecialJson(`golf:${ymd}`, `${ESPN_BASE}/golf/leaderboard?dates=${ymd}`);
    const event = data?.events?.[0];
    const competition = event?.competitions?.[0];
    if (!event || !competition) continue;
    const start = new Date(`${ymd.slice(0, 4)}-${major.start}T12:00:00Z`);
    const round = Math.round((selected.getTime() - start.getTime()) / 86_400_000) + 1;
    const todayYmd = fmtESPN(new Date());
    if (ymd === todayYmd && event?.status?.type?.state !== "post" && competition?.status?.type?.state !== "post") continue;
    const query = `${major.label} ${ymd.slice(0, 4)} Round ${round} highlights`;
    await checkSpecialCandidate({
      sport: "golf",
      eventId: `${ymd}-r${round}`,
      date: ymd,
      matchup: `${major.label} Round ${round}`,
      query,
      channels: major.channels,
    });
  }
}

async function scanTennis() {
  const channelFor = (name) => {
    if (/wimbledon/i.test(name)) return "Wimbledon";
    if (/roland|french open/i.test(name)) return "Roland-Garros";
    if (/us open/i.test(name)) return "US Open Tennis Championships";
    if (/australian open|aus open/i.test(name)) return "Australian Open";
    return null;
  };
  const seen = new Set();
  for (const date of dates) {
    const ymd = fmtESPN(date);
    const data = await fetchSpecialJson(`tennis:${ymd}`, `${ESPN_BASE}/tennis/atp/scoreboard?dates=${ymd}`);
    for (const event of data?.events ?? []) {
      if (!event?.major) continue;
      const channel = channelFor(event.name ?? "");
      if (!channel) continue;
      for (const grouping of event.groupings ?? []) {
        const slug = String(grouping?.grouping?.slug ?? "").toLowerCase();
        if (!slug.includes("singles") || slug.includes("doubles")) continue;
        for (const match of grouping.competitions ?? []) {
          if (seen.has(match.id) || match?.status?.type?.state !== "post") continue;
          seen.add(match.id);
          const matchDate = match.date ?? event.date;
          if (!withinLookback(matchDate)) continue;
          const comps = match.competitors ?? [];
          const home = comps.find((c) => c.homeAway === "home") ?? comps[0];
          const away = comps.find((c) => c.homeAway === "away") ?? comps[1];
          const homeName = home?.athlete?.displayName ?? home?.athlete?.shortName;
          const awayName = away?.athlete?.displayName ?? away?.athlete?.shortName;
          if (!homeName || !awayName) continue;
          scanned++;
          specialScanned++;
          const validation = bakedValidationByKey.get(`tennis:${match.id}`);
          bindBakedToCurrentMatch(`tennis:${match.id}`, "tennis", match.id, awayName, homeName, validation);
          if (validation?.trustedVisible) {
            baked++;
            continue;
          }
          const year = String(matchDate).slice(0, 4);
          const query = `${awayName} vs ${homeName} highlights ${fmtUIDate(matchDate)} ${event.name} ${year}`;
          const result = await resolveSpecial(query, [channel]);
          await sleep(FIRST_PASS_GAP_MS);
          if (result.videoId) {
            specialResolved++;
            continue;
          }
          exhausted.push({
            sport: "TENNIS", date: ymd, matchup: `${awayName} vs ${homeName}`, score: "", query,
            channel, officialResult: "EXHAUSTED", searchResult: "n/a", eventId: String(match.id),
            special: { query, channels: [channel], raceTokens: [] },
          });
        }
      }
    }
  }
}

for (const sport of SPECIAL_ONLY ? [] : Object.keys(ESPN_PATHS)) {
  const channel = OFFICIAL_CHANNELS[sport];
  for (const d of dates) {
    const events = await fetchScoreboard(sport, d);
    for (const ev of events) {
      if (!isFinished(ev)) continue;
      if (!endedWithinLookback(ev)) continue;
      const teams = extractTeams(ev, sport);
      if (!teams) continue;
      if (!highlightsReady(ev, sport)) {
        deferred++;
        continue;
      }
      scanned++;
      const bakedValidation = bakedValidationByKey.get(`${sport}:${ev.id}`)
        ?? { trustedVisible: false, rejected: [], invalid: [], matchup: null };
      bindBakedToCurrentMatch(`${sport}:${ev.id}`, sport, ev.id, teams.away, teams.home, bakedValidation);
      if (bakedValidation.trustedVisible) {
        baked++;
        continue;
      }
      const dateStr = fmtUIDate(ev.date);

      const primaryChannel = sport === "fifa" ? null : channel;
      const secondaryChannel = sport === "fifa"
          ? "FOX Sports"
          : (SECONDARY_CHANNELS[sport] ?? channel);
      const compOverride = sport === "cfl" ? cflPlayoffTokens(ev) : null;
      const official = primaryChannel
        ? await resolve(teams.away, teams.home, dateStr, primaryChannel, sport, compOverride)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(FIRST_PASS_GAP_MS);
      const search = await resolve(
        teams.away,
        teams.home,
        dateStr,
        secondaryChannel,
        sport,
        compOverride,
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
        // sportKey is the lowercase key (`sport` above is uppercased for the
        // printed table); the confirmation pass needs it to look the
        // competition title tokens back up.
        sportKey: sport,
        away: teams.away,
        home: teams.home,
        dateStr,
        primaryChannel,
        secondaryChannel,
        eventId: String(ev.id),
        compOverride,
      };
      const anyVisibleButton = (primaryChannel ? !!official.videoId : false) || !!search.videoId;
      if (!anyVisibleButton) {
        exhausted.push(row);
      }
    }
  }
}

// Non-team highlight surfaces use different source shapes and resolver rules.
// Keep them in this same persistent incident pipeline so "all clear" means
// every shipped family was actually armed, not just scoreboard game cards.
await scanRacingAndUfc();
await scanCuratedEvents();
await scanChess();
await scanEsports();
await scanGolf();
await scanTennis();

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
    if (row.special) {
      let result = { videoId: null, via: "channel-exhausted" };
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(CONFIRM_RETRY_BACKOFF_MS);
        result = await resolveSpecial(row.special.query, row.special.channels, row.special.raceTokens);
        if (result.videoId) break;
      }
      row.officialResult = result.videoId ? `${result.videoId} (${result.via})` : "EXHAUSTED";
      if (result.videoId) recovered.push(row);
      else confirmedExhausted.push(row);
      continue;
    }
    let official = { videoId: row.primaryChannel ? null : "n/a", via: "exhausted" };
    let search = { videoId: null, via: "exhausted" };
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(CONFIRM_RETRY_BACKOFF_MS); // let a lingering block lift
      official = row.primaryChannel
        ? await resolve(row.away, row.home, row.dateStr, row.primaryChannel, row.sportKey, row.compOverride ?? null)
        : { videoId: "n/a", via: "no-official-channel" };
      await sleep(CONFIRM_GAP_MS);
      search = await resolve(
        row.away,
        row.home,
        row.dateStr,
        row.secondaryChannel,
        row.sportKey,
        row.compOverride ?? null,
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
  console.log(`[${r.sport} ${r.date}] ${r.matchup}${r.score ? ` (${r.score})` : ""}`);
  console.log(`  query:    ${r.query}`);
  console.log(`  channel:  ${r.channel}`);
  console.log(`  official: ${r.officialResult}`);
  console.log(`  search:   ${r.searchResult}`);
  console.log("");
};

const oembedSourceFailures = oembedAttempts > 0 && oembedSuccesses === 0 && oembedTransportFailures === oembedAttempts
  ? [{ source: "youtube-oembed", error: `all ${oembedAttempts} requests failed before an HTTP response` }]
  : [];

console.log(`hidescore highlight fallback check`);
console.log(`base:        ${BASE}`);
console.log(`window:      past ${LOOKBACK_HOURS}h (≈${dates.length} ET days)`);
console.log(`leagues:     ${Object.keys(ESPN_PATHS).join(", ")}`);
console.log("families:    team games, tennis, golf, racing, UFC, poker, boxing, chess, esports");
console.log(`scanned:     ${scanned} highlight-ready finished game(s)`);
console.log(`special:     ${specialScanned} non-team/special candidate(s), ${specialResolved} live strict hit(s)`);
console.log(`deferred:    ${deferred} (inside the UI's upload buffer; not promised yet)`);
console.log(`prebaked:    ${baked} (visible without a live lookup)`);
console.log(`bake-reject: ${rejectedBaked.length}   (legacy/wrong marker; ignored and live-resolved)`);
console.log(`bake-invalid:${invalidBaked.length}   (channel/duplicate/matchup proof disproved)`);
console.log(`oembed:      ${oembedSuccesses}/${oembedAttempts} successful metadata check(s)`);
console.log(`exhausted:   ${confirmedExhausted.length}   (no visible YouTube button after confirmation)`);
console.log(`recovered:   ${recovered.length}  (first pass missed, retry caught it — transient throttle, no email)`);
console.log("");

if (scoreboardFailures.length || specialSourceFailures.length || manifestFailures.length || oembedSourceFailures.length) {
  console.log("--- INCOMPLETE: HIGHLIGHT SOURCE FAILURE ---");
  console.log(`successful: ${scoreboardSuccesses}/${scoreboardRequests}`);
  scoreboardFailures.forEach((failure) => {
    console.log(`[${failure.sport.toUpperCase()} ${failure.date}] ${failure.error}`);
  });
  specialSourceFailures.forEach((failure) => {
    console.log(`[${failure.source}] ${failure.error}`);
  });
  manifestFailures.forEach((failure) => {
    console.log(`[${failure.source}] ${failure.error}`);
  });
  oembedSourceFailures.forEach((failure) => {
    console.log(`[${failure.source}] ${failure.error}`);
  });
  console.log("Source failures are not zero-game slates; refusing to report this audit clean.");
  process.exit(2);
}

if (rejectedBaked.length) {
  console.log("--- REJECTED PREBAKES (warning; client ignores these slots) ---");
  rejectedBaked.forEach((row) => {
    console.log(`[${row.sport} ${row.eventId}]`);
    row.problems.forEach((problem) => console.log(`  ${problem}`));
  });
  console.log("");
}

if (invalidBaked.length) {
  console.log("--- INVALID PREBAKES (claimed channel does not match YouTube) ---");
  invalidBaked.forEach((row) => {
    console.log(`[${row.sport} ${row.eventId}]`);
    row.problems.forEach((problem) => console.log(`  ${problem}`));
  });
  console.log("A persistent invalid bake becomes alertable after the same 1h grace as a missing button.\n");
}

if (recovered.length) {
  console.log("--- RECOVERED ON RETRY (transient throttle, no email) ---");
  recovered.forEach(printRow);
}

if (confirmedExhausted.length || invalidBaked.length) {
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
  let probeHits = PROBES.length;
  if (confirmedExhausted.length) {
    probeHits = 0;
    for (const q of PROBES) {
      if (await youtubeLookup(q)) probeHits++;
      await sleep(200);
    }
  }
  const confirmedWithHealthyEndpoint = probeHits > 0 ? confirmedExhausted : [];
  if (confirmedExhausted.length && probeHits === 0) {
    console.log("--- SKIP: /api/youtube unreachable from this runner ---");
    console.log(`All ${PROBES.length} evergreen probes returned empty, so the ${confirmedExhausted.length}`);
    console.log("exhausted game(s) above reflect a blocked endpoint, not hidden highlight");
    console.log("buttons. Not treating those games as incidents.");
  }

  const now = Date.now();
  const oldState = loadIncidentState();
  const newState = {};
  const alertable = [];
  const pending = [];
  const alreadyAlerted = [];

  const activeIncidents = [
    ...confirmedWithHealthyEndpoint.map((row) => ({ kind: "missing", key: `${row.sport.toLowerCase()}:${row.eventId}`, row })),
    ...invalidBaked.map((row) => {
      const signature = createHash("sha256").update(row.problems.join("\n")).digest("hex").slice(0, 12);
      return { kind: "bake", key: `bake:${row.sport.toLowerCase()}:${row.eventId}:${signature}`, row };
    }),
  ];
  for (const current of activeIncidents) {
    const { key, row } = current;
    const previous = oldState[key] ?? {};
    const incident = {
      firstSeen: Number(previous.firstSeen) || now,
      alerted: previous.alerted === true,
      lastSeen: now,
      detail: current.kind === "bake" ? row.problems.join("; ") : row.matchup,
    };
    newState[key] = incident;
    if (incident.alerted) {
      alreadyAlerted.push(current);
    } else if (now - incident.firstSeen >= ALERT_GRACE_MS) {
      alertable.push(current);
      incident.alerted = true;
    } else {
      pending.push(current);
    }
  }
  saveIncidentState(newState);

  const printIncident = (incident) => {
    if (incident.kind === "missing") {
      printRow(incident.row);
      return;
    }
    console.log(`[${incident.row.sport} ${incident.row.eventId}] invalid prebake`);
    incident.row.problems.forEach((problem) => console.log(`  ${problem}`));
    console.log("");
  };

  if (pending.length) {
    console.log(`--- GRACE: ${pending.length} incident(s) first seen less than 1h ago; no alert ---`);
    pending.forEach(printIncident);
  }
  if (alreadyAlerted.length) {
    console.log(`--- SUPPRESSED: ${alreadyAlerted.length} incident(s) already alerted; no repeat ---`);
    alreadyAlerted.forEach(printIncident);
  }
  if (alertable.length) {
    console.log("--- ACTIONABLE HIGHLIGHT INCIDENTS (persisted past 1h grace) ---");
    if (confirmedWithHealthyEndpoint.length) console.log(`(endpoint healthy: ${probeHits}/${PROBES.length} evergreen probes resolved)\n`);
    alertable.forEach(printIncident);
    console.log("Fix path: check the prebake and the official-channel lookup for these games.");
    process.exit(1);
  }

  process.exit(0);
}

saveIncidentState({});
console.log("✅ no exhausted lookups or invalid channel-marked prebakes in the audit window.");
process.exit(0);
