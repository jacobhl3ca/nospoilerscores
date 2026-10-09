// Pure half of scripts/highlight-coverage.mjs (added 2026-10-09): which
// finished games in the main leagues have a highlight clip, and why the rest
// do not. The network half (ESPN scoreboards, the baked manifest, one live
// lookup per game) stays in the script, so the tests can run this offline.
//
// Nothing here is a copy of the card's rules. The channel, name, date, token
// and gate choices come from src/lib/youtube.ts, the baked-slot check is
// getChannelVerifiedBakedId (src/lib/highlights.ts) and the MLB match is
// matchMlbVideoEntry (src/lib/espn.ts). highlightPlan below only puts them in
// the same order GameHighlights.tsx does; keep the two in step.

import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const yt = await jiti.import("../../src/lib/youtube.ts");
const hl = await jiti.import("../../src/lib/highlights.ts");
const espn = await jiti.import("../../src/lib/espn.ts");

export const parseGame = espn.parseGame;
export const getHighlightSearchQuery = yt.getHighlightSearchQuery;

// The main leagues. `seasonal` leagues print "out of season" when the window
// holds no finished game, instead of a row of zeros. ncaaf asks ESPN for the
// whole FBS slate (groups=80): the default board is a curated subset, and a
// game outside it is still a card on a team's own page.
export const COVERAGE_LEAGUES = [
  { sport: "nfl", label: "NFL" },
  { sport: "nba", label: "NBA" },
  { sport: "mlb", label: "MLB" },
  { sport: "nhl", label: "NHL" },
  { sport: "mls", label: "MLS" },
  { sport: "epl", label: "EPL" },
  { sport: "ncaaf", label: "NCAAF (FBS)", query: "groups=80" },
  { sport: "wnba", label: "WNBA", seasonal: true },
  { sport: "nwsl", label: "NWSL", seasonal: true },
];

const SRC = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const block = (src, decl) => {
  const start = src.indexOf(decl);
  return start < 0 ? "" : src.slice(start, src.indexOf("\n};", start));
};

// Scoreboard paths, read out of espn.ts (as scripts/audit-highlight-gaps.mjs
// does) so this script cannot drift from the app's own boards.
export function scoreboardPaths() {
  const text = block(SRC("src/lib/espn.ts"), "const SPORT_PATHS");
  return Object.fromEntries([...text.matchAll(/^\s{2}([a-z0-9_]+):\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
}

// The card's wait after kickoff before it looks for a clip, read out of
// GameHighlights.tsx. A game still inside it is "pending", not a gap.
export function bufferHours() {
  const text = block(SRC("src/components/GameHighlights.tsx"), "const highlightBufferHours");
  return Object.fromEntries([...text.matchAll(/\b([a-z0-9_]+):\s*(\d+(?:\.\d+)?)/g)].map((m) => [m[1], Number(m[2])]));
}

// The last `days` ET calendar dates as YYYYMMDD, newest first — the same
// window the bake walks (HL_DEFAULT_DAYS in scripts/prebake-news.mjs).
export function windowDates(days, nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(nowMs - i * 86400000)).replace(/-/g, ""));
}

export function etYmd(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, "");
}

// Every finished game on one scoreboard response, parsed by the app's parser.
export function finishedGames(sport, scoreboard) {
  return (scoreboard?.events ?? [])
    .filter((e) => e?.status?.type?.state === "post")
    .map((e) => parseGame(e, sport));
}

// What GameHighlights.tsx asks for on one card: the uploader for each slot,
// the names and dates it queries with, and the title gates.
export function highlightPlan(game) {
  const sport = game.sport;
  const fixed = yt.getOfficialChannelName(sport);
  const chain = yt.getHighlightFallbackChannels(
    sport,
    fixed,
    { id: game.homeTeam.id, conferenceId: game.homeTeam.conferenceId },
    { id: game.awayTeam.id, conferenceId: game.awayTeam.conferenceId },
    game.broadcasts ?? [],
  );
  const chainIsPrimary = !fixed && yt.highlightPrimaryFromChain(sport);
  const officialChannel = chainIsPrimary ? (chain[0]?.channel ?? null) : fixed;
  const fallbacks = chainIsPrimary ? chain.slice(1) : chain;
  const isMlb = sport === "mlb";
  const isFifa = sport === "fifa";
  const primaryChannel = isFifa ? "FIFA" : (officialChannel ?? null);
  const secondaryChannel = isMlb ? null : (isFifa ? "FOX Sports" : (yt.getSecondaryChannels(sport)[0] ?? primaryChannel));
  const compTokens = yt.getCompetitionTitleTokens(sport, { preseason: game.isPreseason, playoff: game.isPlayoff, playoffLabel: game.playoffLabel });
  const tokensFor = (f) => (f?.ownTokens ? f.titleTokens : compTokens.length ? compTokens : (f?.titleTokens ?? []));
  return {
    sport,
    hlAway: yt.highlightTeamName(sport, game.awayTeam.shortDisplayName, game.awayTeam.location),
    hlHome: yt.highlightTeamName(sport, game.homeTeam.shortDisplayName, game.homeTeam.location),
    primaryChannel,
    secondaryChannel,
    fallbacks,
    primaryTokens: chainIsPrimary ? tokensFor(chain[0]) : compTokens,
    dates: yt.highlightDateStrs(new Date(game.date), "America/New_York"),
    seriesNote: game.seriesNote ?? null,
    competition: yt.getCompetitionName(sport),
    week: game.weekNumber ?? null,
    gates: yt.getHighlightMatchGates(sport),
  };
}

// The baked slots the card would show for this game, through the card's own
// trust check: the official id from the primary channel or any channel of the
// game's chain (or a FotMob-sourced uploader), the extended id from the 2nd
// slot's channel.
export function bakedSlots(plan, baked) {
  let official = null;
  for (const channel of [plan.primaryChannel, ...plan.fallbacks.map((f) => f.channel)]) {
    const id = hl.getChannelVerifiedBakedId(baked, "official", channel, plan.hlAway, plan.hlHome);
    if (id && channel) { official = { id, channel }; break; }
  }
  if (!official && baked?.src === "fotmob" && baked.officialChannel) {
    const id = hl.getChannelVerifiedBakedId(baked, "official", baked.officialChannel, plan.hlAway, plan.hlHome);
    if (id) official = { id, channel: baked.officialChannel };
  }
  const extended = hl.getChannelVerifiedBakedId(baked, "extended", plan.secondaryChannel, plan.hlAway, plan.hlHome);
  return { official, extended };
}

// MLB's row is MLB.com-native: the recap is the 1st button, the condensed
// game the 2nd. Matched exactly as the board enrich matches.
export function mlbSlots(game, entries) {
  const match = espn.matchMlbVideoEntry(game, entries ?? []);
  return {
    official: match?.recap?.playback ? { id: match.recap.playback, channel: "MLB.com" } : null,
    extended: match?.condensed?.playback ?? null,
  };
}

// The one live lookup per game: the card's first query on its primary
// channel (first date, names as given). The card would retry the UTC date and
// the fallback chain after a miss; this check stops at one call.
export function liveLookupArgs(plan) {
  if (!plan.primaryChannel) return null;
  return {
    query: getHighlightSearchQuery(plan.hlAway, plan.hlHome, plan.dates[0] ?? "", plan.seriesNote, plan.competition),
    channel: plan.primaryChannel,
    week: plan.week,
    compTokens: plan.primaryTokens,
    gates: plan.gates,
  };
}

// Offline clues for a gap. They point at where to look; the cause is settled
// against the uploader's real titles.
export function gapHints(game, plan, sameDayGames = []) {
  const hints = [];
  if (!plan.primaryChannel && !plan.fallbacks.length) hints.push("no uploader in the channel map for this game");
  const pair = (g) => [g.awayTeam.displayName, g.homeTeam.displayName].sort().join("|");
  if (sameDayGames.filter((g) => pair(g) === pair(game)).length > 1) hints.push("doubleheader / same pair twice that day");
  if (/[^\x20-\x7e]/.test(`${plan.hlAway}${plan.hlHome}`)) hints.push("accented team name");
  if (plan.dates.length > 1) hints.push(`UTC date differs (${plan.dates[1]})`);
  return hints;
}

// One row per finished game.
//   status: "official" | "extended" | "none" | "pending"
export function coverageRow({ game, plan, slots, live, nowMs = Date.now(), buffers = {}, hints = [] }) {
  const officialVia = slots.official ? (game.sport === "mlb" ? "mlb" : "baked") : live?.id ? "live" : null;
  const hasExtended = !!slots.extended;
  const ageH = (nowMs - Date.parse(game.date)) / 3600000;
  const waiting = Number.isFinite(ageH) && ageH < (buffers[game.sport] ?? 3);
  let status = officialVia ? "official" : hasExtended ? "extended" : "none";
  if (status === "none" && waiting) status = "pending";
  return {
    sport: game.sport,
    id: game.id,
    date: game.date,
    ymd: etYmd(game.date),
    matchup: `${game.awayTeam.shortDisplayName} @ ${game.homeTeam.shortDisplayName}`,
    channel: plan.primaryChannel,
    officialVia,
    officialId: slots.official?.id ?? live?.id ?? null,
    extended: hasExtended,
    live: live ? (live.id ? "found" : live.skipped ? "skipped" : "miss") : "n/a",
    status,
    hints: officialVia === "live" ? ["bake missed it; the live lookup finds it", ...hints] : hints,
  };
}

export function tally(rows) {
  const t = { games: 0, official: 0, liveOnly: 0, extended: 0, none: 0, pending: 0 };
  for (const r of rows) {
    if (r.status === "pending") { t.pending++; continue; }
    t.games++;
    if (r.officialVia) t.official++;
    if (r.officialVia === "live") t.liveOnly++;
    if (r.extended) t.extended++;
    if (r.status === "none") t.none++;
  }
  return t;
}

// Markdown table, one line per league. "official" counts the 1st button from
// the bake or (live-only column) from the card's live lookup; "extended" the
// 2nd button; "none" a finished game with neither.
export function renderTable(leagues, rowsBySport, { outOfSeason = new Set(), unreachable = new Set() } = {}) {
  const lines = [
    "| League | Games | With official clip | of which live only | With extended | With none | Pending |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const lg of leagues) {
    if (unreachable.has(lg.sport)) {
      lines.push(`| ${lg.label} | scoreboard unreachable | | | | | |`);
      continue;
    }
    if (outOfSeason.has(lg.sport)) {
      lines.push(`| ${lg.label} | out of season | | | | | |`);
      continue;
    }
    const t = tally(rowsBySport[lg.sport] ?? []);
    lines.push(`| ${lg.label} | ${t.games} | ${t.official} | ${t.liveOnly} | ${t.extended} | ${t.none} | ${t.pending} |`);
  }
  return lines.join("\n");
}

export function renderGaps(rows) {
  const gaps = rows.filter((r) => r.status === "none");
  if (!gaps.length) return "No gaps.";
  return gaps
    .sort((a, b) => a.sport.localeCompare(b.sport) || a.date.localeCompare(b.date))
    .map((r) => `- ${r.sport} ${r.ymd} ${r.matchup} (ESPN ${r.id}) live=${r.live}${r.hints.length ? ` — ${r.hints.join("; ")}` : ""}`)
    .join("\n");
}
