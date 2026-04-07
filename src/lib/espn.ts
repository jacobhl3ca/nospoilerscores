import { Game, Sport, LeagueData, Team } from "./types";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<Sport, string> = {
  mlb: "/baseball/mlb/scoreboard",
  nba: "/basketball/nba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  nfl: "/football/nfl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
  golf: "/golf/pga/scoreboard",
  tennis: "/tennis/atp/scoreboard",
  fifa: "/soccer/fifa.world/scoreboard",
};

// Seasonal league config: show/hide based on date
// endDate: day after championship — league hides the day after its final game
// startDate: when the sport's season starts
interface LeagueConfig {
  sport: Sport;
  label: string;
  startDate?: string;       // MM-DD
  endDate?: string;         // MM-DD (last day league is shown)
  championshipDate?: string; // MM-DD — day the championship game is played
}

const ALL_LEAGUES: LeagueConfig[] = [
  // ── Major team sports ──
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-06", championshipDate: "04-06" },
  { sport: "nba", label: "NBA", startDate: "10-20", endDate: "06-19", championshipDate: "06-19" },
  { sport: "mlb", label: "MLB", startDate: "03-20", endDate: "11-01", championshipDate: "11-01" },
  { sport: "nhl", label: "NHL", startDate: "04-07", endDate: "06-19", championshipDate: "06-19" },
  { sport: "nfl", label: "NFL", startDate: "09-04", endDate: "02-09", championshipDate: "02-09" },
  // ── Golf majors (leaderboard — needs custom UI) ──
  { sport: "golf", label: "Masters", startDate: "04-09", endDate: "04-13", championshipDate: "04-13" },
  { sport: "golf", label: "PGA Champ", startDate: "05-14", endDate: "05-18", championshipDate: "05-18" },
  { sport: "golf", label: "US Open", startDate: "06-18", endDate: "06-22", championshipDate: "06-22" },
  { sport: "golf", label: "The Open", startDate: "07-16", endDate: "07-20", championshipDate: "07-20" },
  // ── Tennis Grand Slams ──
  { sport: "tennis", label: "French Open", startDate: "05-24", endDate: "06-08", championshipDate: "06-08" },
  { sport: "tennis", label: "Wimbledon", startDate: "06-29", endDate: "07-13", championshipDate: "07-13" },
  { sport: "tennis", label: "US Open", startDate: "08-25", endDate: "09-14", championshipDate: "09-14" },
  // ── FIFA World Cup 2026 (US/Canada/Mexico — one-time) ──
  { sport: "fifa", label: "World Cup", startDate: "06-11", endDate: "07-19", championshipDate: "07-19" },
];

// ═══════════════════════════════════════════════════════════════
// FULL YEAR SCHEDULE — Apr 7 2026 → Apr 6 2027
// New leagues always enter rightmost. Championship day = leftmost.
// ═══════════════════════════════════════════════════════════════
// Apr 7-8:        NCAAM out, NHL in           → [NBA, MLB, NHL]
// Apr 9-13:       + Masters                   → [NBA, MLB, NHL, Masters]
// Apr 14 – May 13:                            → [NBA, MLB, NHL]
// May 14-18:      + PGA Championship          → [NBA, MLB, NHL, PGA Champ]
// May 19-23:                                  → [NBA, MLB, NHL]
// May 24 – Jun 8: + French Open              → [NBA, MLB, NHL, French Open]
// Jun 9-10:                                   → [NBA, MLB, NHL]
// Jun 11-17:      + World Cup                 → [NBA, MLB, NHL, World Cup]
// Jun 18-19:      + US Open Golf              → [NBA, MLB, NHL, World Cup, US Open]
// Jun 20-22:      NBA+NHL end                 → [MLB, World Cup, US Open]
// Jun 23-28:      US Open Golf ends           → [MLB, World Cup]
// Jun 29 – Jul 12: + Wimbledon               → [MLB, World Cup, Wimbledon]
// Jul 13-15:      Wimbledon out               → [MLB, World Cup]
// Jul 16-19:      + The Open (golf)           → [MLB, World Cup, The Open]
// Jul 20:         World Cup + Open end        → [MLB]
// Jul 21 – Aug 24:                            → [MLB]
// Aug 25 – Sep 3: + US Open Tennis            → [MLB, US Open]
// Sep 4-14:       + NFL                       → [MLB, US Open, NFL]
// Sep 15 – Oct 19:                            → [MLB, NFL]
// Oct 20-31:      + NBA                       → [MLB, NFL, NBA]
// Nov 1:          + NCAAM, MLB ends next day  → [MLB, NFL, NBA, NCAAM]
// Nov 2 – Feb 9:                              → [NFL, NBA, NCAAM]
// Feb 10 – Mar 19: NFL ends                   → [NBA, NCAAM]
// Mar 20 – Apr 6:  + MLB                      → [NBA, NCAAM, MLB]
// Apr 6:          NCAAM championship day      → [NCAAM, NBA, MLB]
// ═══════════════════════════════════════════════════════════════

function toMMDD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isLeagueActive(league: LeagueConfig, viewDate: Date): boolean {
  if (!league.startDate || !league.endDate) return true;
  const mmdd = toMMDD(viewDate);

  if (league.startDate <= league.endDate) {
    return mmdd >= league.startDate && mmdd <= league.endDate;
  } else {
    return mmdd >= league.startDate || mmdd <= league.endDate;
  }
}

// Days since this league's current season started — newest leagues sort rightmost.
// On championship day, the league gets max priority (leftmost).
function daysSinceSeasonStart(league: LeagueConfig, viewDate: Date): number {
  if (!league.startDate) return 365;
  const mmdd = toMMDD(viewDate);
  // Championship day — force leftmost
  if (league.championshipDate && mmdd === league.championshipDate) return 999;
  const year = viewDate.getFullYear();
  const [m, d] = league.startDate.split("-").map(Number);
  let start = new Date(year, m - 1, d);
  // For wrap-around or if start hasn't happened yet this year, use last year
  if (start > viewDate) start = new Date(year - 1, m - 1, d);
  return Math.floor((viewDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getActiveLeagues(viewDate?: Date): LeagueConfig[] {
  const d = viewDate ?? new Date();
  const active = ALL_LEAGUES.filter((l) => isLeagueActive(l, d));
  // Sort descending: longest-active leftmost, newest rightmost
  return active.sort((a, b) => daysSinceSeasonStart(b, d) - daysSinceSeasonStart(a, d));
}

function parseTeam(competitor: any, sport: Sport): Team {
  const rawId = competitor.team?.id ?? "";
  let record = competitor.records?.[0]?.summary ?? "";
  // MLB spring training records include ties (e.g. "7-9-2") — strip to W-L
  if (sport === "mlb" && record.split("-").length === 3) {
    const parts = record.split("-");
    record = `${parts[0]}-${parts[1]}`;
  }
  return {
    id: rawId ? `${sport}-${rawId}` : "",
    abbreviation: competitor.team?.abbreviation ?? "",
    displayName: competitor.team?.displayName ?? "",
    shortDisplayName: competitor.team?.shortDisplayName ?? "",
    logo: competitor.team?.logo ?? "",
    color: competitor.team?.color ?? "666666",
    score: competitor.score ?? "0",
    winner: competitor.winner ?? false,
    record,
  };
}

// Per-sport rating calibration
const SPORT_RATING_CONFIG: Record<Sport, {
  multiplier: number;       // how fast closeness drops per point of final differential
  overtimeBonus: number;    // extra points for OT/extras
  scoringDivisor: number;   // normalizes scoring bonus per sport
  regulationPeriods: number; // normal period count (innings for MLB)
}> = {
  mlb:    { multiplier: 14,  overtimeBonus: 15, scoringDivisor: 3,  regulationPeriods: 9 },
  nba:    { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 40, regulationPeriods: 4 },
  ncaam:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 30, regulationPeriods: 2 },
  nhl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 2,  regulationPeriods: 3 },
  nfl:    { multiplier: 6,   overtimeBonus: 15, scoringDivisor: 10, regulationPeriods: 4 },
  fifa:   { multiplier: 30,  overtimeBonus: 25, scoringDivisor: 1,  regulationPeriods: 2 },
  golf:   { multiplier: 1,   overtimeBonus: 10, scoringDivisor: 1,  regulationPeriods: 4 },
  tennis: { multiplier: 8,   overtimeBonus: 15, scoringDivisor: 5,  regulationPeriods: 3 },
};

// Calculate running margin from linescores: average absolute margin across all periods
// Returns null if linescore data is insufficient
function calcRunningMargin(competitors: any[]): number | null {
  const ls0: any[] = competitors[0].linescores ?? [];
  const ls1: any[] = competitors[1].linescores ?? [];
  const periods = Math.min(ls0.length, ls1.length);
  if (periods < 2) return null; // need at least 2 periods for this to be meaningful

  let cum0 = 0;
  let cum1 = 0;
  let totalMargin = 0;
  for (let i = 0; i < periods; i++) {
    cum0 += ls0[i]?.value ?? 0;
    cum1 += ls1[i]?.value ?? 0;
    totalMargin += Math.abs(cum0 - cum1);
  }
  return totalMargin / periods;
}

// Was the game close entering the final period?
function calcFinalPeriodMargin(competitors: any[]): number | null {
  const ls0: any[] = competitors[0].linescores ?? [];
  const ls1: any[] = competitors[1].linescores ?? [];
  const periods = Math.min(ls0.length, ls1.length);
  if (periods < 2) return null;

  // Sum scores through second-to-last period
  let cum0 = 0;
  let cum1 = 0;
  for (let i = 0; i < periods - 1; i++) {
    cum0 += ls0[i]?.value ?? 0;
    cum1 += ls1[i]?.value ?? 0;
  }
  return Math.abs(cum0 - cum1);
}

function calculateRating(game: any): number | null {
  const competition = game.competitions?.[0];
  if (!competition) return null;

  const state = game.status?.type?.state;
  if (state === "pre") return null;

  const competitors = competition.competitors;
  if (!competitors || competitors.length < 2) return null;

  const score1 = parseInt(competitors[0].score ?? "0", 10);
  const score2 = parseInt(competitors[1].score ?? "0", 10);
  const diff = Math.abs(score1 - score2);
  const total = score1 + score2;

  const sport = game._sport as Sport;
  const config = SPORT_RATING_CONFIG[sport] ?? SPORT_RATING_CONFIG.nba;

  // --- Factor 1: Final margin closeness (35%) ---
  const finalCloseness = Math.max(0, 100 - diff * config.multiplier);

  // --- Factor 2: Running margin throughout game (30%) ---
  // Average margin across all periods — rewards games that were close throughout
  // even if the final margin is large
  const runningMargin = calcRunningMargin(competitors);
  let runningCloseness: number;
  if (runningMargin !== null) {
    // Use same multiplier — a running average margin of 5 in NBA means it was tight
    runningCloseness = Math.max(0, 100 - runningMargin * config.multiplier);
  } else {
    // No linescore data (live game early on) — fall back to final margin
    runningCloseness = finalCloseness;
  }

  // --- Factor 3: Close entering final period (15%) ---
  // Games within striking distance at end are more watchable
  const fpMargin = calcFinalPeriodMargin(competitors);
  let finalPeriodCloseness: number;
  if (fpMargin !== null) {
    finalPeriodCloseness = Math.max(0, 100 - fpMargin * config.multiplier);
  } else {
    finalPeriodCloseness = finalCloseness;
  }

  // Base score: weighted blend of three closeness factors
  // Weights sum to 1.0 so a perfectly close game = 100 before bonuses
  const baseScore =
    finalCloseness * 0.45 +
    runningCloseness * 0.35 +
    finalPeriodCloseness * 0.20;

  // Additive bonuses (on top, not weighted in) — these reward extras, never penalize
  const periods = game.status?.period ?? 0;
  const overtimeBonus = periods > config.regulationPeriods ? config.overtimeBonus : 0;
  const scoringBonus = Math.min(total / config.scoringDivisor, 10);

  return Math.min(100, Math.round(baseScore + overtimeBonus + scoringBonus));
}

function parseGame(event: any, sport: Sport): Game {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];

  const home = competitors.find((c: any) => c.homeAway === "home");
  const away = competitors.find((c: any) => c.homeAway === "away");

  // Gather broadcasts
  const broadcasts: string[] = [];
  for (const b of competition?.broadcasts ?? []) {
    for (const name of b.names ?? []) {
      if (!broadcasts.includes(name)) broadcasts.push(name);
    }
  }

  // Tag sport for rating calculation
  event._sport = sport;

  // Extract highlight video URL from headlines
  let highlightUrl: string | null = null;
  for (const headline of competition?.headlines ?? []) {
    for (const video of headline?.video ?? []) {
      const webHref = video?.links?.web?.href;
      if (webHref) {
        highlightUrl = webHref;
        break;
      }
    }
    if (highlightUrl) break;
  }

  // Extract series game number from notes (e.g. "ALWC - Game 2" → "Game 2")
  let seriesNote: string | null = null;
  for (const note of competition?.notes ?? []) {
    const headline = note?.headline ?? "";
    const match = headline.match(/Game \d+/i);
    if (match) {
      seriesNote = match[0];
      break;
    }
  }

  // Extract gamecast/recap URL from event links
  let recapUrl: string | null = null;
  for (const link of event.links ?? []) {
    if (link.rel?.includes("summary") || link.rel?.includes("event")) {
      recapUrl = link.href;
      break;
    }
  }

  return {
    id: event.id,
    sport,
    date: event.date,
    name: event.name ?? "",
    shortName: event.shortName ?? "",
    state: event.status?.type?.state ?? "pre",
    statusDetail: event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "",
    clock: event.status?.displayClock ?? "",
    period: event.status?.period ?? 0,
    completed: event.status?.type?.completed ?? false,
    homeTeam: parseTeam(home ?? {}, sport),
    awayTeam: parseTeam(away ?? {}, sport),
    broadcasts,
    venue: competition?.venue?.fullName ?? "",
    rating: calculateRating(event),
    seriesNote,
    highlightUrl,
    recapUrl,
    streamUrl: null, // populated after fetch for supported sports
  };
}

async function fetchWithRetry(url: string, retries = 1, timeoutMs = 10000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || attempt === retries) return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt === retries) throw e;
    }
  }
  throw new Error("Fetch failed");
}

// Build stream deep link for a game based on broadcast + sport
function buildStreamUrl(game: Game): string | null {
  const broadcast = game.broadcasts[0]?.toLowerCase() ?? "";
  const gameId = game.id;

  // ESPN family — deep link to specific game stream
  if (broadcast.includes("espn") || broadcast === "abc") {
    return `https://www.espn.com/watch/player/_/id/${gameId}`;
  }
  // FOX family — deep link includes event ID in some cases, but no public pattern; use live page
  if (broadcast === "fox" || broadcast === "fs1" || broadcast === "fs2") {
    return "https://www.foxsports.com/live";
  }
  // TNT/TBS/TruTV → Max live TV
  if (broadcast === "tnt" || broadcast === "tbs" || broadcast === "trutv") {
    return "https://www.max.com/live-tv";
  }
  // NBC/Peacock
  if (broadcast === "nbc" || broadcast === "usa" || broadcast === "peacock") {
    return "https://www.peacocktv.com/";
  }
  // Sport-specific streaming services (handled by enrichment functions below)
  // NBA TV, MLB.tv, NHL Network — these get deep links via sport-specific APIs
  if (broadcast === "nba tv") return "https://www.nba.com/watch/";
  if (broadcast === "nhl network") return "https://www.nhl.com/tv";
  // MLB.tv / MLB Network — fallback if enrichment didn't set streamUrl
  if (broadcast === "mlb.tv" || broadcast === "mlb network") return "https://www.mlb.com/tv";

  return null;
}

// MLB Stats API: fetch gamePk values for a date, keyed by home team abbreviation
async function fetchMLBGamePks(date?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // Convert YYYYMMDD to YYYY-MM-DD
    let apiDate: string;
    if (date && date.length === 8) {
      apiDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    } else {
      const now = new Date();
      apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    const res = await fetchWithRetry(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${apiDate}&hydrate=team`, 1, 5000);
    if (!res.ok) return map;
    const data = await res.json();
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const gamePk = String(game.gamePk);
        const homeAbbrev = game.teams?.home?.team?.abbreviation ?? "";
        const awayAbbrev = game.teams?.away?.team?.abbreviation ?? "";
        // Key by "away@home" to handle doubleheaders
        if (homeAbbrev && awayAbbrev) {
          map.set(`${awayAbbrev}@${homeAbbrev}`, gamePk);
        }
      }
    }
  } catch {
    // Non-critical — games just won't have deep links
  }
  return map;
}

// MLB team abbreviation mapping: ESPN → MLB Stats API
// Most match, but a few differ
const ESPN_TO_MLB_ABBREV: Record<string, string> = {
  ARI: "AZ",
  CHW: "CWS",
};

function espnToMlbAbbrev(espnAbbrev: string): string {
  return ESPN_TO_MLB_ABBREV[espnAbbrev] || espnAbbrev;
}

export async function fetchGames(
  sport: Sport,
  date?: string
): Promise<Game[]> {
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  if (date) url.searchParams.set("dates", date);

  // For MLB, fetch game PKs in parallel with ESPN data
  const mlbPksPromise = sport === "mlb" ? fetchMLBGamePks(date) : null;

  let res: Response;
  try {
    res = await fetchWithRetry(url.toString());
  } catch {
    return [];
  }

  if (!res.ok) return [];

  const data = await res.json();
  const events = data.events ?? [];
  const games: Game[] = events
    .filter((e: any) => {
      // Filter out postponed/canceled/suspended games
      const statusName = e.status?.type?.name ?? "";
      if (statusName.includes("POSTPONED") || statusName.includes("CANCELED") || statusName.includes("SUSPENDED")) return false;
      // Filter out preseason/spring training — bad highlights, ties in records, low-quality games
      const seasonType = e.season?.type ?? 0;
      if (seasonType === 1) return false;
      return true;
    })
    .map((e: any) => parseGame(e, sport));

  // Enrich MLB games with direct MLB.tv stream links
  if (sport === "mlb" && mlbPksPromise) {
    const mlbPks = await mlbPksPromise;
    for (const game of games) {
      const awayAbbrev = espnToMlbAbbrev(game.awayTeam.abbreviation);
      const homeAbbrev = espnToMlbAbbrev(game.homeTeam.abbreviation);
      const gamePk = mlbPks.get(`${awayAbbrev}@${homeAbbrev}`);
      if (gamePk) {
        game.streamUrl = `https://www.mlb.com/gameday/${gamePk}`;
      }
    }
  }

  // Set fallback stream URLs from broadcast info
  for (const game of games) {
    if (!game.streamUrl) {
      game.streamUrl = buildStreamUrl(game);
    }
  }

  return games;
}

export async function fetchAllLeagues(date?: string): Promise<LeagueData[]> {
  // Parse viewed date so league visibility matches the day being viewed, not today
  const viewDate = date
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
    : new Date();
  const active = getActiveLeagues(viewDate);
  const results = await Promise.all(
    active.map(async ({ sport, label }) => {
      const games = await fetchGames(sport, date);
      // Pre-fetch next game day for empty leagues so the UI doesn't need a second round trip
      let nextGameDay: { date: string; games: Game[] } | null = null;
      if (games.length === 0) {
        nextGameDay = await fetchNextGameDay(sport, 7, date);
      }
      return { sport, label, games, nextGameDay };
    })
  );
  return results;
}

export async function fetchNextGameDay(
  sport: Sport,
  daysToCheck = 7,
  fromDate?: string // YYYYMMDD — search from this date instead of today
): Promise<{ date: string; games: Game[] } | null> {
  const base = fromDate
    ? new Date(`${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T12:00:00`)
    : new Date();

  // Fetch all days in parallel for speed
  const dates = Array.from({ length: daysToCheck }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  });

  const results = await Promise.all(
    dates.map(async (dateStr) => {
      const games = await fetchGames(sport, dateStr);
      const futureGames = games.filter((g) => g.state === "pre" || g.state === "in");
      return { date: dateStr, games: futureGames };
    })
  );

  return results.find((r) => r.games.length > 0) ?? null;
}
