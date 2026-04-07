export type Sport = "mlb" | "nba" | "ncaam" | "nfl" | "nhl" | "golf" | "tennis" | "fifa";

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
  // Series info (e.g. "Game 2") for playoff games — used in YouTube search
  seriesNote: string | null;
  // Highlight/recap links
  highlightUrl: string | null; // ESPN video clip URL
  recapUrl: string | null; // ESPN gamecast URL
  // Direct stream URL for live games (e.g., MLB.tv deep link)
  streamUrl: string | null;
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
  nextGameDay?: { date: string; games: Game[] } | null;
}
