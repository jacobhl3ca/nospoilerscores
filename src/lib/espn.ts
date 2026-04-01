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
  { sport: "nba", label: "NBA", startDate: "10-20", endDate: "06-25" },
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-09" }, // 2 days after Final Four
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
  return {
    id: rawId ? `${sport}-${rawId}` : "",
    abbreviation: competitor.team?.abbreviation ?? "",
    displayName: competitor.team?.displayName ?? "",
    shortDisplayName: competitor.team?.shortDisplayName ?? "",
    logo: competitor.team?.logo ?? "",
    color: competitor.team?.color ?? "666666",
    score: competitor.score ?? "0",
    winner: competitor.winner ?? false,
    record: competitor.records?.[0]?.summary ?? "",
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

  if (total === 0) return 50;

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
    highlightUrl,
    recapUrl,
  };
}

export async function fetchGames(
  sport: Sport,
  date?: string
): Promise<Game[]> {
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  if (date) url.searchParams.set("dates", date);

  const res = await fetch(url.toString());

  if (!res.ok) return [];

  const data = await res.json();
  const events = data.events ?? [];
  return events.map((e: any) => parseGame(e, sport));
}

export async function fetchAllLeagues(date?: string): Promise<LeagueData[]> {
  const active = getActiveLeagues();
  return Promise.all(
    active.map(async ({ sport, label }) => {
      const games = await fetchGames(sport, date);
      return { sport, label, games };
    })
  );
}

export async function fetchNextGameDay(
  sport: Sport,
  daysToCheck = 7
): Promise<{ date: string; games: Game[] } | null> {
  for (let i = 1; i <= daysToCheck; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const games = await fetchGames(sport, dateStr);
    if (games.length > 0) return { date: dateStr, games };
  }
  return null;
}
