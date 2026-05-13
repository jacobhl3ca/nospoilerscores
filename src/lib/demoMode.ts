import type { LeagueData, Game, Team } from "./types";

export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1";
}

const LEAGUE_LABELS = ["Sports A", "Sports B", "Sports C"];

const PALETTE = ["E45858", "5887E4", "58E490", "E4A058", "A058E4", "58D4E4", "E458C4", "8AE458"];

function placeholderLogo(letter: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#${color}"/><text x="12" y="16.5" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="13" fill="#ffffff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function applyDemoMode(leagues: LeagueData[]): LeagueData[] {
  return leagues.map((league, leagueIdx) => {
    const slot = String.fromCharCode(65 + leagueIdx);
    const teamNum = new Map<string, number>();
    const transformTeam = (team: Team): Team => {
      const key = team.id || team.abbreviation || team.displayName || "?";
      let n = teamNum.get(key);
      if (n == null) {
        n = teamNum.size + 1;
        teamNum.set(key, n);
      }
      const color = PALETTE[(n - 1) % PALETTE.length];
      const label = `Team ${slot}${n}`;
      return {
        ...team,
        displayName: label,
        shortDisplayName: label,
        abbreviation: `${slot}${n}`,
        logo: placeholderLogo(slot, color),
        color,
      };
    };
    const transformGame = (game: Game): Game => {
      const homeTeam = transformTeam(game.homeTeam);
      const awayTeam = transformTeam(game.awayTeam);
      return {
        ...game,
        homeTeam,
        awayTeam,
        name: `${awayTeam.displayName} at ${homeTeam.displayName}`,
        shortName: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
        broadcasts: game.broadcasts.length ? ["Stream"] : [],
        playoffLabel: game.playoffLabel ? "Playoffs" : null,
        seriesStatus: null,
        venue: "",
      };
    };
    return {
      ...league,
      label: LEAGUE_LABELS[leagueIdx] ?? `Sports ${slot}`,
      games: league.games.map(transformGame),
      nextGameDay: league.nextGameDay
        ? { date: league.nextGameDay.date, games: league.nextGameDay.games.map(transformGame) }
        : null,
      golfTournament: null,
    };
  });
}
