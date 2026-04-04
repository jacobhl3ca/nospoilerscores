import { Game, Sport, LeagueData, Team } from "./types";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<Sport, string> = {
  mlb: "/baseball/mlb/scoreboard",
  nba: "/basketball/nba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  nfl: "/football/nfl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
};

// Seasonal league config: show/hide based on date
// endDate: 2 days after the final game of the season
// startDate: when the sport's season starts
interface LeagueConfig {
  sport: Sport;
  label: string;
  startDate?: string; // MM-DD
  endDate?: string;   // MM-DD (hide after this date)
}

const ALL_LEAGUES: LeagueConfig[] = [
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-09" }, // 2 days after Final Four
  { sport: "nba", label: "NBA", startDate: "10-20", endDate: "06-25" },
  { sport: "mlb", label: "MLB", startDate: "03-20", endDate: "11-10" },
  { sport: "nhl", label: "NHL", startDate: "04-18", endDate: "06-25" }, // Playoffs only — day before typical start
  { sport: "nfl", label: "NFL", startDate: "09-04", endDate: "02-15" },
];

function isLeagueActive(league: LeagueConfig): boolean {
  if (!league.startDate || !league.endDate) return true;

  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Handle wrap-around seasons (e.g., NFL: Sep-Feb, NBA: Oct-Jun)
  if (league.startDate <= league.endDate) {
    return mmdd >= league.startDate && mmdd <= league.endDate;
  } else {
    return mmdd >= league.startDate || mmdd <= league.endDate;
  }
}

function getActiveLeagues(): LeagueConfig[] {
  return ALL_LEAGUES.filter(isLeagueActive);
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
// multiplier: how fast closeness drops per point of differential
// overtimeBonus: extra points for OT/extras
// scoringDivisor: normalizes scoring bonus per sport
const SPORT_RATING_CONFIG: Record<Sport, { multiplier: number; overtimeBonus: number; scoringDivisor: number }> = {
  mlb: { multiplier: 14, overtimeBonus: 15, scoringDivisor: 3 },    // 1 run = big deal, 7+ run diff = blowout
  nba: { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 40 },  // 22+ point diff = blowout
  ncaam: { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 30 }, // 18+ point diff = blowout
  nhl: { multiplier: 22, overtimeBonus: 20, scoringDivisor: 2 },    // 1 goal = close, 5+ = blowout
  nfl: { multiplier: 6, overtimeBonus: 15, scoringDivisor: 10 },    // 3 pts = close, 17+ = blowout
};

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

  // Closer games = higher rating, scaled per sport
  const closeness = Math.max(0, 100 - diff * config.multiplier);

  // Bonus for overtime/extras
  const periods = game.status?.period ?? 0;
  const regulationPeriods: Record<Sport, number> = { mlb: 9, nba: 4, ncaam: 2, nfl: 4, nhl: 3 };
  const regulation = regulationPeriods[sport] ?? 4;
  const overtimeBonus = periods > regulation ? config.overtimeBonus : 0;

  // Normalized scoring bonus per sport
  const scoringBonus = Math.min(total / config.scoringDivisor, 10);

  return Math.min(100, Math.round(closeness + overtimeBonus + scoringBonus));
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
  const active = getActiveLeagues();
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
