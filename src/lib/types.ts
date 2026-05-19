export type Sport = "mlb" | "nba" | "ncaam" | "nfl" | "nhl" | "golf" | "tennis" | "fifa" | "epl" | "mls";

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
  // Whether this is a playoff/postseason/tournament game
  isPlayoff: boolean;
  // Full playoff round label (e.g. "Sweet 16", "ALWC - Game 2", "Conference Finals")
  playoffLabel: string | null;
  // ESPN playoff-series summary (e.g. "BOS leads series 3-1", "Series tied 2-2").
  // Only set when competition.series.type === "playoff".
  seriesStatus: string | null;
  // Highlight/recap links
  highlightUrl: string | null; // ESPN video clip URL
  recapUrl: string | null; // ESPN gamecast URL
  // NHL.com condensed-game + recap videos (finished NHL games only). Sourced
  // from the NHL API via the /api/nhl-videos worker proxy. Each has a *Url
  // (the nhl.com page — modal "Open on NHL.com" fallback) and a *Embed
  // (Brightcove iframe src — played inside the in-app VideoModal).
  nhlRecapUrl?: string | null;
  nhlRecapEmbed?: string | null;
  nhlCondensedUrl?: string | null;
  nhlCondensedEmbed?: string | null;
  // Direct stream URL for live games (e.g., MLB.tv deep link)
  streamUrl: string | null;
  // Per-game Prime Video deep link (amazon.com/gp/video/detail/{ASIN}) when
  // this matchup appears on Prime's scraped sports hub. Null when there's
  // no Prime ASIN for the matchup — the Prime chip then falls back to the
  // sport-specific Prime landing page.
  primeStreamUrl: string | null;
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

export interface GolfPlayer {
  position: number;
  name: string;
  shortName: string;
  score: string;       // e.g. "-5", "E", "+2"
  flag: string;        // country flag image URL
  flagCountry: string; // country name for tooltip
  rounds: string[];    // per-round scores e.g. ["67", "70"]
  thru: string;        // "F", "12", "" (not started)
}

export interface GolfTournament {
  name: string;
  state: "pre" | "in" | "post";
  statusDetail: string;  // "Round 1", "Final", etc.
  players: GolfPlayer[];
  broadcasts: string[];  // ["ESPN", "CBS"]
  rating: number | null; // leaderboard competitiveness (0-100)
  currentRound: number;  // number of completed rounds (0–4)
  // State of the *current* round per ESPN competition.status. "in" = players
  // on course; "post" = today's round wrapped (even if the tournament itself
  // still has rounds to play); "pre" = round hasn't started. Authoritative
  // round-level live signal — more reliable than scraping player thru.
  roundStatus: "pre" | "in" | "post";
  startDate?: string;    // tournament startDate "MM-DD" from league config
  eventDate?: string;    // ESPN event.date ISO — first tee off of current day
  // Streamer destination for the live-link wrapper. Points at where the
   // user can actually watch (PGA Tour Live / Peacock / Paramount+ / etc.) —
   // never at the ESPN leaderboard, which would reveal scores.
  streamUrl?: string;
}

export interface LeagueData {
  sport: Sport;
  label: string;
  games: Game[];
  nextGameDay?: { date: string; games: Game[] } | null;
  golfTournament?: GolfTournament | null;
}
