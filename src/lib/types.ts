export type Sport = "mlb" | "nba" | "wnba" | "ncaam" | "ncaaw" | "ncaaf" | "nfl" | "nhl" | "golf" | "tennis" | "fifa" | "epl" | "mls" | "ucl" | "uel" | "f1" | "ufc";

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
  // MLB.com official per-game videos (finished MLB games only), sourced from
  // StatsAPI via the /api/mlb-videos worker proxy. These play directly through
  // the app's HLS video modal.
  mlbRecapUrl?: string | null;
  mlbRecapPlaybackUrl?: string | null;
  mlbRecapPoster?: string | null;
  mlbCondensedUrl?: string | null;
  mlbCondensedPlaybackUrl?: string | null;
  mlbCondensedPoster?: string | null;
  // Direct stream URL for live games (e.g., MLB.tv deep link)
  streamUrl: string | null;
  // Per-game Prime Video deep link (amazon.com/gp/video/detail/{ASIN}) when
  // this matchup appears on Prime's scraped sports hub. Null when there's
  // no Prime ASIN for the matchup — the Prime chip then falls back to the
  // sport-specific Prime landing page.
  primeStreamUrl: string | null;
  // MLB no-hit alert: abbreviation of the team currently throwing a no-hitter
  // (i.e., the opposing batting team has 0 hits) once the pitcher has carried
  // it through 5 full innings — the threshold MLB.com uses for its in-app
  // No-Hit Alert. Only set for live MLB games and cleared once a hit drops or
  // the game finishes. The card itself decides whether to surface it (only
  // shown when the ratings/spoiler toggle is on, never on highlights).
  noHitterPitchingTeam?: string | null;
  // Strict subset of the no-hit case: opposing team has also had zero runners
  // reach base (runs + leftOnBase = 0). Catches walks / HBP / errors /
  // fielder's choice without needing the heavier boxscore hydrate. Always
  // implies noHitterPitchingTeam is set.
  isPerfectGame?: boolean;
  // MLB cycle watch: a live batter is one hit type away from the cycle — has a
  // single/double/triple/home run in three of the four categories and needs the
  // fourth. Set only for live MLB games (4th inning or later), sourced from the
  // boxscore, and cleared once the bid completes or breaks. Surfaced as a
  // spoiler-safe "Cycle watch" badge; the card only shows it when the ratings/
  // spoiler toggle is on (it reveals a hot bat, not the score). `needs` is the
  // missing hit type ("single" | "double" | "triple" | "home run").
  cycleWatch?: { team: string; player: string; needs: string } | null;
  // Soccer penalty shootout: a knockout match level after extra time, decided
  // (or being decided) by spot kicks. Set for live shootouts and just-finished
  // ones (STATUS_*_PEN / a per-competitor shootoutScore). Surfaced as a spoiler-
  // safe "Penalty shootout" badge — gated behind the ratings/spoiler toggle; it
  // reveals only that it went to penalties, never the winner.
  penaltyShootout?: boolean;
  // Tennis deciding set: a live Grand Slam singles match level on sets and into
  // the final set (1-1 in set 3 for best-of-3 women's draws; 2-2 in set 5 for
  // best-of-5 men's draws). The win-or-go-home stretch. Spoiler-safe "Deciding
  // set" badge, ratings-toggle gated — reveals only that the sets are level.
  decidingSet?: boolean;
  // Venue location ("Minneapolis, Minnesota" / "Santa Clara, California"), read
  // from competition.venue next to the fullName. Omitted when ESPN has no/junk
  // address data.
  venueLocation?: string;
  // Roof status: "indoor" = enclosed dome, "roof" = roof/canopy covers the
  // field (rain can't reach play), null/undefined = open-air.
  venueRoof?: "indoor" | "roof" | null;
  // MLB probable starting pitchers, pre-game only. Pre-formatted as
  // "Z. Wheeler (5-1, 2.22)" (name + ESPN's record string). Null for non-MLB.
  homeProbable?: string | null;
  awayProbable?: string | null;
  // Cup-competition stage/round, spoiler-free: "Group H", "Round of 16",
  // "Final". Derived from competition.altGameNote + event.season.slug — NEVER
  // the notes array, which leaks results ("PSG win 4-3 on penalties"). Null for
  // league play (the US-sports playoff label lives in `playoffLabel`).
  stage?: string | null;
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
  // Current overall ("total league") standings rank, 1 = best in the league.
  // Single-table leagues (EPL/UCL/UEL) use ESPN's table position; conference/
  // division leagues (NBA/MLB/NHL/MLS) get a computed overall rank by sorting
  // every team on the sport's primary metric (points or win%). Null when unknown
  // or N/A (the World Cup uses the static FIFA ranking instead). Hydrated from
  // the standings endpoint after the scoreboard fetch.
  rank?: number | null;
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

// A single non-two-team "event" tile — the spoiler-safe analog to a golf
// tournament, used for F1 (a Grand Prix weekend) and UFC (a fight card).
// Results (finishing order / fight outcomes) are deliberately omitted; the
// card shows WHAT + WHEN + WHERE-to-watch, plus highlights once it's over.
// One fighter in a bout. `flag` is a country-flag image URL (ESPN). Result is
// deliberately omitted — the card never reveals who won.
export interface Fighter {
  name: string;
  shortName: string;
  record: string;   // "11-3-0"
  flag?: string;    // country flag image URL
  country?: string; // flag alt (tooltip)
}

// A single bout on a UFC card. Rendered as its own GameCard-style card; the
// outcome is hidden (spoiler-safe), highlights surface once it's over.
export interface FightBout {
  id: string;
  weightClass: string;       // "Flyweight", "Women's Bantamweight"
  state: "pre" | "in" | "post";
  statusDetail: string;      // time / "Live" / "Final"
  date: string;
  red: Fighter;
  blue: Fighter;
  highlightQuery: string;    // "Kape vs. Horiguchi UFC highlights"
}

export interface LeagueEventCard {
  kind: "f1" | "ufc";
  title: string;            // "Spanish Grand Prix" / "UFC Fight Night: Kape vs. Horiguchi"
  subtitle?: string;        // circuit + city (F1) / venue city (UFC)
  headline?: string;        // UFC main event "Kape vs. Horiguchi"; F1 leaves null
  state: "pre" | "in" | "post";
  statusDetail: string;     // "Race" / "Fight Night" / "Live" / "Final"
  date: string;             // ISO of the headline session (race / main card)
  broadcasts: string[];
  boutCount?: number;       // UFC: total fights on the card
  // UFC only: every bout on the card, main event first → prelims. Each renders
  // as its own card. ESPN has no fight-quality score, so order = card order.
  fights?: FightBout[];
  highlightQuery?: string;  // YouTube search query for post-event highlights
  officialChannel?: string; // preferred YouTube channel for the highlight
  eventUrl?: string;        // ESPN event page (external fallback)
}

export interface LeagueData {
  sport: Sport;
  label: string;
  games: Game[];
  nextGameDay?: { date: string; games: Game[] } | null;
  // The most recent PAST game day, surfaced only on a past tab (e.g. Yesterday)
  // when the viewed date itself has no games — so an empty column shows the last
  // game played (with its highlights) instead of a bare "No games". Null when
  // the league has no recent finished games (e.g. the World Cup before kickoff).
  previousGameDay?: { date: string; games: Game[] } | null;
  golfTournament?: GolfTournament | null;
  // Single-event tile for F1 / UFC (mutually exclusive with games/golf).
  eventCard?: LeagueEventCard | null;
  // True when the games fetch failed (network/non-OK/non-JSON) rather than
  // ESPN returning a genuinely empty schedule. Lets the column show an
  // "unavailable" message instead of falling back to the next game day.
  fetchFailed?: boolean;
}
