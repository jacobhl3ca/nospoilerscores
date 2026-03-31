export type Sport = "mlb" | "nba" | "ncaam" | "nfl" | "nhl";

export interface Game {
  id: string;
  sport: Sport;
  date: string; // ISO string
  name: string; // "Minnesota Twins at Kansas City Royals"
  shortName: string; // "MIN @ KC"
  state: "pre" | "in" | "post";
  statusDetail: string; // "Final", "Top 5th", "3rd Quarter", "7:10 PM ET"
  clock: string;
  period: number;
  completed: boolean;
  homeTeam: Team;
  awayTeam: Team;
  broadcasts: string[]; // ["ESPN", "TBS"]
  venue: string;
  // Game quality rating (0-100) based on score closeness
  rating: number | null;
}

export interface Team {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logo: string;
  color: string;
  score: string;
  winner: boolean;
  record: string;
}

export interface LeagueData {
  sport: Sport;
  label: string;
  games: Game[];
}
