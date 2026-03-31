import { Game, Sport, LeagueData, Team } from "./types";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<Sport, string> = {
  mlb: "/baseball/mlb/scoreboard",
  nba: "/basketball/nba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  nfl: "/football/nfl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
};

const LEAGUES: { sport: Sport; label: string }[] = [
  { sport: "mlb", label: "MLB" },
  { sport: "nba", label: "NBA" },
  { sport: "ncaam", label: "NCAAM" },
];

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

  // Closer games = higher rating
  // A tie game = 100, blowout = lower
  const closeness = Math.max(0, 100 - diff * 10);

  // Bonus for overtime/extras
  const sport = game._sport as Sport;
  const periods = game.status?.period ?? 0;
  const regulationPeriods: Record<Sport, number> = { mlb: 9, nba: 4, ncaam: 2, nfl: 4, nhl: 3 };
  const regulation = regulationPeriods[sport] ?? 4;
  const overtimeBonus = periods > regulation ? 15 : 0;

  // Bonus for higher scoring (more exciting)
  const scoringBonus = Math.min(total / 5, 10);

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
  return Promise.all(
    LEAGUES.map(async ({ sport, label }) => {
      const games = await fetchGames(sport, date);
      return { sport, label, games };
    })
  );
}

export async function fetchNextGameDate(
  sport: Sport,
  daysToCheck = 7
): Promise<string | null> {
  for (let i = 1; i <= daysToCheck; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const games = await fetchGames(sport, dateStr);
    if (games.length > 0) return dateStr;
  }
  return null;
}
