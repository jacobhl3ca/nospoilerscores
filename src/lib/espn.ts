import { Game, Sport, LeagueData, Team, GolfTournament, GolfPlayer } from "./types";

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
  epl: "/soccer/eng.1/scoreboard",
  mls: "/soccer/usa.1/scoreboard",
};

// Seasonal league config: show/hide based on date
// endDate: day after championship — league hides the day after its final game
// startDate: when the sport's season starts
export interface LeagueConfig {
  sport: Sport;
  label: string;
  startDate?: string;       // MM-DD
  endDate?: string;         // MM-DD (last day league is shown)
  championshipDate?: string; // MM-DD — day the championship game is played
  firstPref?: boolean;      // Tier 1: always gets a slot when active (bumps lower leagues)
}

export const ALL_LEAGUES: LeagueConfig[] = [
  // ── Major team sports ──
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-06", championshipDate: "04-06" },
  { sport: "nba", label: "NBA", startDate: "10-20", endDate: "06-19", championshipDate: "06-19" },
  { sport: "mlb", label: "MLB", startDate: "03-20", endDate: "11-01", championshipDate: "11-01" },
  { sport: "nhl", label: "NHL", startDate: "04-07", endDate: "06-19", championshipDate: "06-19" },
  { sport: "nfl", label: "NFL", startDate: "09-04", endDate: "02-09", championshipDate: "02-09" },
  // ── Golf majors ──
  { sport: "golf", label: "Masters", startDate: "04-09", endDate: "04-13", championshipDate: "04-13", firstPref: true },
  { sport: "golf", label: "PGA Champ", startDate: "05-14", endDate: "05-18", championshipDate: "05-18" },
  { sport: "golf", label: "US Open", startDate: "06-18", endDate: "06-22", championshipDate: "06-22", firstPref: true },
  { sport: "golf", label: "The Open", startDate: "07-16", endDate: "07-20", championshipDate: "07-20" },
  // ── Tennis Grand Slams ──
  { sport: "tennis", label: "Aus Open", startDate: "01-12", endDate: "01-26", championshipDate: "01-26" },
  { sport: "tennis", label: "French Open", startDate: "05-24", endDate: "06-08", championshipDate: "06-08" },
  { sport: "tennis", label: "Wimbledon", startDate: "06-29", endDate: "07-13", championshipDate: "07-13", firstPref: true },
  { sport: "tennis", label: "US Open", startDate: "08-25", endDate: "09-14", championshipDate: "09-14", firstPref: true },
  // ── FIFA World Cup 2026 (US/Canada/Mexico — one-time) ──
  { sport: "fifa", label: "World Cup", startDate: "06-11", endDate: "07-19", championshipDate: "07-19", firstPref: true },
  // ── Premier League (Aug–May) ──
  { sport: "epl", label: "Prem", startDate: "08-16", endDate: "05-25", championshipDate: "05-25" },
  // ── MLS (Feb–Dec, MLS Cup early Dec) ──
  { sport: "mls", label: "MLS", startDate: "02-21", endDate: "12-07", championshipDate: "12-07" },
];

// ═══════════════════════════════════════════════════════════════
// FULL YEAR SCHEDULE — Max 3 leagues
// First preference (always shown): World Cup, Masters, Wimbledon, US Open (golf+tennis), March Madness
// Regular priority: NBA > MLB > NFL > PGA/Open/FrOpen/AusOpen > NCAAM > NHL > EPL
// Empty leagues render with a "next game" message; EPL only appears when fewer than 3 higher-priority leagues are active.
// ═══════════════════════════════════════════════════════════════
// Jan 12-26:       + Aus Open                   → [NFL, NBA, NCAAM]         ← Aus Open below NCAAM
// Feb 10 – Mar 16: NFL ends                     → [NBA, NCAAM] (2)
// Mar 17 – Apr 6:  NCAAM → March Madness (1st!) → [NCAAM, NBA, MLB]
// Apr 7-8:         NCAAM out, NHL in            → [NBA, MLB, NCAAM]
// Apr 9-13:        + Masters (1st pref!)         → [Masters, NBA, MLB]      ← NCAAM+NHL bumped
// Apr 14 – May 13:                              → [NBA, MLB, NCAAM]
// May 14-18:       + PGA Champ                  → [NBA, MLB, NCAAM]         ← PGA below NCAAM
// May 19-23:                                    → [NBA, MLB, NCAAM]
// May 24 – Jun 8:  + French Open               → [NBA, MLB, NCAAM]         ← French Open below NCAAM
// Jun 9-10:                                     → [NBA, MLB, NCAAM]
// Jun 11-17:       + World Cup (1st pref!)       → [World Cup, NBA, MLB]    ← NCAAM+NHL bumped
// Jun 18-19:       + US Open Golf (1st pref!)    → [World Cup, US Open, NBA] ← 2 first-prefs
// Jun 20-22:       NBA+NHL end                   → [World Cup, US Open, MLB]
// Jun 23-28:       US Open Golf ends             → [World Cup, MLB] (2)
// Jun 29 – Jul 13: + Wimbledon (1st pref!)       → [World Cup, Wimbledon, MLB]
// Jul 14-15:       Wimbledon out                 → [World Cup, MLB] (2)
// Jul 16-19:       + The Open                    → [World Cup, MLB] (2)      ← The Open below MLB
// Jul 20:          World Cup ends                → [MLB] (1)
// Jul 21 – Aug 15:                               → [MLB] (1)
// Aug 16-24:       + EPL                         → [MLB, EPL] (2)
// Aug 25 – Sep 3:  + US Open Tennis (1st pref!)  → [US Open, MLB, EPL]
// Sep 4-14:        + NFL                         → [US Open, MLB, NFL]       ← EPL bumped
// Sep 15 – Oct 19:                               → [MLB, NFL] (2)
// Oct 20-31:       + NBA                         → [MLB, NFL, NBA]
// Nov 1:           + NCAAM, MLB ends next day    → [MLB, NFL, NBA]           ← NCAAM below NBA
// Nov 2 – Feb 9:                                 → [NFL, NBA, NCAAM]
// ═══════════════════════════════════════════════════════════════

function toMMDD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isLeagueActive(league: LeagueConfig, viewDate: Date): boolean {
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

const MAX_LEAGUES = 3;

// March Madness date range (NCAAM tournament — gets first preference)
const MARCH_MADNESS_START = "03-17";
const MARCH_MADNESS_END = "04-06";

// Unified priority — lower = higher priority
// firstPref leagues (World Cup, Masters, US Open Golf, Wimbledon, US Open Tennis) always get a slot
// Other leagues ranked: NBA > MLB > NFL > tennis > golf > NCAAM > NHL > EPL
// March Madness gets firstPref treatment so NCAAM still shows during the tournament.
const LEAGUE_PRIORITY: Record<string, number> = {
  nba: 1,
  mlb: 2,
  nfl: 3,
  tennis: 4, // non-firstPref: French Open, Aus Open
  golf: 5,   // non-firstPref: PGA Champ, The Open (under tennis)
  ncaam: 6,  // March Madness gets firstPref bump
  nhl: 7,
  epl: 8,    // under NHL
  mls: 9,    // under EPL
};

function isMarchMadness(viewDate: Date): boolean {
  const mmdd = toMMDD(viewDate);
  return mmdd >= MARCH_MADNESS_START && mmdd <= MARCH_MADNESS_END;
}

// Returns ALL active league candidates ordered: firstPref first, then rest by priority.
// Caller can take the first N and use the remainder as backfill when selected leagues are empty.
export function getActiveLeagueCandidates(viewDate?: Date): {
  firstPref: LeagueConfig[];
  rest: LeagueConfig[];
} {
  const d = viewDate ?? new Date();
  const active = ALL_LEAGUES.filter((l) => isLeagueActive(l, d));
  const madness = isMarchMadness(d);
  const firstPref = active.filter((l) => l.firstPref || (l.sport === "ncaam" && madness));
  const rest = active
    .filter((l) => !l.firstPref && !(l.sport === "ncaam" && madness))
    .sort((a, b) => (LEAGUE_PRIORITY[a.sport] ?? 99) - (LEAGUE_PRIORITY[b.sport] ?? 99));
  return { firstPref, rest };
}

function getActiveLeagues(viewDate?: Date): LeagueConfig[] {
  const d = viewDate ?? new Date();
  const { firstPref, rest } = getActiveLeagueCandidates(d);
  const firstPrefCount = Math.min(firstPref.length, MAX_LEAGUES);
  const restCount = Math.min(rest.length, MAX_LEAGUES - firstPrefCount);
  const selected = [...firstPref.slice(0, firstPrefCount), ...rest.slice(0, restCount)];

  // Sort for display: longest-active leftmost, newest rightmost
  // On championship day, force leftmost
  return selected.sort((a, b) => daysSinceSeasonStart(b, d) - daysSinceSeasonStart(a, d));
}

function parseTeam(competitor: any, sport: Sport): Team {
  const rawId = competitor.team?.id ?? "";
  let record = competitor.records?.[0]?.summary ?? "";
  // MLB spring training and NHL records include a 3rd segment (ties / OTL) — strip to W-L
  if ((sport === "mlb" || sport === "nhl") && record.split("-").length === 3) {
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
  mlb:    { multiplier: 14,  overtimeBonus: 15, scoringDivisor: 3,   regulationPeriods: 9 },
  nba:    { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 40,  regulationPeriods: 4 },
  ncaam:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 30,  regulationPeriods: 2 },
  nhl:    { multiplier: 18,  overtimeBonus: 20, scoringDivisor: 1.5, regulationPeriods: 3 },
  nfl:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4 },
  fifa:   { multiplier: 22,  overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  epl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  mls:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  golf:   { multiplier: 1,   overtimeBonus: 10, scoringDivisor: 1,   regulationPeriods: 4 },
  tennis: { multiplier: 25,  overtimeBonus: 15, scoringDivisor: 5,   regulationPeriods: 4 },
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

  // --- Factor 1: Final margin closeness (45%) ---
  const finalCloseness = Math.max(0, 100 - diff * config.multiplier);

  // --- Factor 2: Running margin throughout game (35%) ---
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

  // --- Factor 3: Close entering final period (20%) ---
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

  // Comeback bonus: reward games where a big deficit was erased late
  // The bigger the deficit overcome and the closer the final, the bigger the bonus
  let comebackBonus = 0;
  if (fpMargin !== null && fpMargin > diff) {
    const deficitErased = fpMargin - diff;
    comebackBonus = Math.min(deficitErased * config.multiplier * 0.4, 30);
  }

  // Low-scoring penalty for soccer: a 0-0 draw isn't exciting regardless of "closeness"
  let lowScoringPenalty = 0;
  if ((sport === "epl" || sport === "mls" || sport === "fifa") && total < 2) {
    lowScoringPenalty = (2 - total) * 25; // 0 goals: -50, 1 goal: -25
  }

  return Math.max(0, Math.min(100, Math.round(baseScore + overtimeBonus + scoringBonus + comebackBonus - lowScoringPenalty)));
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

  // Extract series game number and playoff round from notes
  let seriesNote: string | null = null;
  let playoffLabel: string | null = null;
  let isPlayoff = false;
  for (const note of competition?.notes ?? []) {
    const headline = note?.headline ?? "";
    const headlineLower = headline.toLowerCase();
    const match = headlineLower.match(/Game \d+/i);
    if (match) {
      seriesNote = match[0];
    }
    // Detect playoff/postseason/tournament games from notes
    if (/playoff|postseason|wild.?card|divisional|conference|championship|finals|round|semi.?final|quarter.?final|elimination|play-in|tournament|march madness|ncaa|sweet.?16|elite.?8|final.?four|stanley.?cup|world.?series|super.?bowl|nlds|nlcs|alds|alcs|alwc|nlwc/i.test(headlineLower)) {
      isPlayoff = true;
      if (!playoffLabel) playoffLabel = headline;
    }
  }
  // Also check season type from the API if available
  if (event.season?.type === 3 || event.season?.type === 4) {
    isPlayoff = true; // type 3 = postseason, type 4 = off-season/all-star but sometimes playoff
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
    isPlayoff,
    playoffLabel,
    highlightUrl,
    recapUrl,
    streamUrl: null, // populated after fetch for supported sports
    primeStreamUrl: null, // populated from /prime-asins.json when matchup matches
  };
}

// Lazily load the Prime Video ASIN map scraped by the nightly GH Action.
// Cached module-wide so multiple fetchGames() calls share one request.
let primeAsinsPromise: Promise<Record<string, string>> | null = null;
export function loadPrimeAsins(): Promise<Record<string, string>> {
  if (!primeAsinsPromise) {
    primeAsinsPromise = fetch("/prime-asins.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.matchups ?? {}) as Record<string, string>)
      .catch(() => ({} as Record<string, string>));
  }
  return primeAsinsPromise;
}

function buildPrimeDeepLink(
  game: Game,
  asinMap: Record<string, string>
): string | null {
  const key = `${game.awayTeam.shortDisplayName} vs. ${game.homeTeam.shortDisplayName}`.toLowerCase();
  const asin = asinMap[key];
  // primevideo.com/detail/{id} accepts both traditional ASINs (B0XXXXXXXX)
  // and the longer GTI ids that Prime uses for newer live events. amazon.com
  // rejects the GTI format, so we standardize on primevideo.com.
  return asin ? `https://www.primevideo.com/detail/${asin}` : null;
}

function hasPrimeBroadcast(game: Game): boolean {
  return game.broadcasts.some((b) => /\b(amazon|prime)\b/i.test(b));
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

// ESPN gamecast / match URL for a game. Prefers the API-provided recapUrl,
// falls back to the sport-specific /game/_/gameId/ or /match/_/gameId/ path.
export function espnGameUrl(game: Game): string {
  if (game.recapUrl) return game.recapUrl;
  switch (game.sport) {
    case "mlb": return `https://www.espn.com/mlb/game/_/gameId/${game.id}`;
    case "nba": return `https://www.espn.com/nba/game/_/gameId/${game.id}`;
    case "ncaam": return `https://www.espn.com/mens-college-basketball/game/_/gameId/${game.id}`;
    case "nfl": return `https://www.espn.com/nfl/game/_/gameId/${game.id}`;
    case "nhl": return `https://www.espn.com/nhl/game/_/gameId/${game.id}`;
    case "epl":
    case "mls":
    case "fifa":
      return `https://www.espn.com/soccer/match/_/gameId/${game.id}`;
    case "golf": return `https://www.espn.com/golf/leaderboard`;
    case "tennis": return `https://www.espn.com/tennis/scoreboard`;
  }
}

// Per-sport streamer landing — last-resort destination so the live link
// always lands on a place to *watch*, never on a score-revealing gamecast.
export function sportStreamFallback(sport: Sport): string {
  switch (sport) {
    case "nba": return "https://www.nba.com/watch";
    case "ncaam": return "https://www.espn.com/watch/";
    case "nfl": return "https://www.nfl.com/plus/";
    case "nhl": return "https://www.nhl.com/tv";
    case "mlb": return "https://www.mlb.com/tv";
    case "mls": return "https://tv.apple.com/us/sports/mls";
    case "epl": return "https://www.peacocktv.com/";
    case "fifa": return "https://www.foxsports.com/live";
    case "tennis": return "https://www.tennischannel.com/";
    case "golf": return "https://www.pgatour.com/live";
  }
}

// Map a single broadcast/network name to its streaming destination.
// Returns null if unknown so caller can try the next broadcast or fall back.
// Sport is optional but lets us route multi-sport streamers (e.g., Amazon
// Prime carries NFL TNF, NBA, MLB Yankees) to the right Prime sport page.
export function networkStreamUrl(broadcast: string, gameId: string, sport?: Sport): string | null {
  const b = broadcast.toLowerCase().trim();
  if (!b) return null;
  // ESPN family — deep link to specific game stream
  if (b.includes("espn") || b === "abc") return `https://www.espn.com/watch/player/_/id/${gameId}`;
  // FOX family
  if (b === "fox" || b === "fs1" || b === "fs2" || b === "fox deportes") return "https://www.foxsports.com/live";
  // WBD → Max
  if (b === "tnt" || b === "tbs" || b === "trutv" || b === "max") return "https://play.max.com/live";
  // NBCU → Peacock (incl. Golf Channel which streams there)
  if (b === "nbc" || b === "usa" || b === "peacock" || b === "nbc sports" || b === "golf channel") return "https://www.peacocktv.com/";
  // CBS / Paramount+
  if (b === "cbs" || b === "cbssn" || b === "paramount+" || b === "paramount plus") return "https://www.paramountplus.com/live-tv/";
  // Amazon Prime Video — fall back to the Prime sports hub. Sport-specific
  // paths (/sports/nfl etc.) return 404, so we use the generic hub. Per-game
  // deep links are handled upstream via the scraped ASIN map.
  if (b === "amazon prime" || b === "prime video" || b === "amazon") {
    return "https://www.primevideo.com/sports";
  }
  // Apple TV+ (MLS Season Pass primarily)
  if (b === "apple tv+" || b === "apple tv") return "https://tv.apple.com/us/sports/mls";
  // YouTube TV / NFL Sunday Ticket
  if (b === "youtube tv" || b === "nfl sunday ticket" || b === "youtube") return "https://tv.youtube.com/";
  // League-specific networks
  if (b === "nfl network" || b === "nfl+") return "https://www.nfl.com/plus/";
  if (b === "nba tv") return "https://www.nba.com/watch";
  if (b === "nhl network") return "https://www.nhl.com/tv";
  if (b === "mlb.tv" || b === "mlb network") return "https://www.mlb.com/tv";
  if (b === "tennis channel") return "https://www.tennischannel.com/";
  // Masters-only streamer — already added during golf broadcast enrichment
  if (b === "masters.com") return "https://www.masters.com/en_US/watch/index.html";
  return null;
}

// Build stream link for a game. Prefers a known broadcast → streamer mapping,
// falling back to the per-sport streamer landing so the result is never null.
function buildStreamUrl(game: Game): string {
  for (const broadcast of game.broadcasts) {
    const url = networkStreamUrl(broadcast, game.id, game.sport);
    if (url) return url;
  }
  return sportStreamFallback(game.sport);
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

// NHL public API: fetch the league's own game IDs keyed by "away@home".
// ESPN's gameId diverges from NHL's, so this lets us deep-link into
// nhl.com/tv for the specific game when the broadcast isn't ESPN (ESPN
// games already get a deep link via espn.com/watch).
async function fetchNHLGameIds(date?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    let apiDate: string;
    if (date && date.length === 8) {
      apiDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    } else {
      const now = new Date();
      apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    const res = await fetchWithRetry(`https://api-web.nhle.com/v1/score/${apiDate}`, 1, 5000);
    if (!res.ok) return map;
    const data = await res.json();
    for (const game of data.games ?? []) {
      const gameId = String(game.id);
      const homeAbbrev = game.homeTeam?.abbrev ?? "";
      const awayAbbrev = game.awayTeam?.abbrev ?? "";
      if (homeAbbrev && awayAbbrev) {
        map.set(`${awayAbbrev}@${homeAbbrev}`, gameId);
      }
    }
  } catch {
    // Non-critical — falls back to generic NHL landing
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

// Map ESPN country codes (from flag URLs) to display names
const COUNTRY_NAMES: Record<string, string> = {
  usa: "United States", can: "Canada", mex: "Mexico",
  gbr: "Great Britain", eng: "England", sco: "Scotland", wal: "Wales",
  irl: "Ireland", nir: "Northern Ireland",
  esp: "Spain", fra: "France", ger: "Germany", ita: "Italy",
  swe: "Sweden", nor: "Norway", den: "Denmark", fin: "Finland",
  aus: "Australia", nzl: "New Zealand",
  jpn: "Japan", kor: "South Korea", chn: "China", tha: "Thailand",
  ind: "India", phi: "Philippines", twn: "Chinese Taipei",
  zaf: "South Africa", arg: "Argentina", bra: "Brazil", col: "Colombia",
  chl: "Chile", ven: "Venezuela", per: "Peru",
  aut: "Austria", bel: "Belgium", ned: "Netherlands", por: "Portugal",
  pol: "Poland", sui: "Switzerland", cze: "Czech Republic",
};

function countryNameFromFlagUrl(url: string): string {
  const match = url.match(/\/countries\/\d+\/(\w+)\.\w+$/);
  if (!match) return "";
  const code = match[1].toLowerCase();
  return COUNTRY_NAMES[code] ?? code.toUpperCase();
}

async function fetchGolfTournament(date?: string): Promise<GolfTournament | null> {
  const url = new URL(BASE_URL + SPORT_PATHS.golf);
  if (date) url.searchParams.set("dates", date);

  let res: Response;
  try {
    res = await fetchWithRetry(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  const event = data.events?.[0];
  if (!event) return null;

  const competition = event.competitions?.[0];
  if (!competition) return null;

  const state = (event.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  // Round-level state: competition.status tracks the *current* round's
  // state ("in" while players are on course, "post" once play for the round
  // is complete, even though the tournament itself may still have rounds
  // left). This is the signal the card uses to decide whether to show the
  // green live indicator and whether to hide the recap highlights.
  const roundStatus = (competition.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  const competitors = competition.competitors ?? [];

  // Determine current round from linescores
  const currentRound = competitors.length > 0
    ? (competitors[0].linescores ?? []).filter((r: any) => r.value !== null && r.value !== undefined).length
    : 0;

  let statusDetail = "Upcoming";
  if (state === "post") {
    statusDetail = "Final";
  } else if (state === "in") {
    // Check if any player is mid-round (has holes played in current round but round not complete)
    const anyMidRound = competitors.some((c: any) => {
      const rounds = c.linescores ?? [];
      const nextRound = rounds[currentRound]; // 0-indexed: currentRound is the in-progress one
      if (!nextRound) return false;
      const holes = nextRound.linescores ?? [];
      return holes.length > 0 && holes.length < 18;
    });
    if (anyMidRound) {
      statusDetail = `Round ${currentRound + 1}`;
    } else if (currentRound > 0) {
      statusDetail = `After Round ${currentRound}`;
    } else {
      statusDetail = "Round 1";
    }
  }

  const players: GolfPlayer[] = competitors.map((c: any) => {
    const athlete = c.athlete ?? {};
    const linescores: any[] = c.linescores ?? [];

    // Completed rounds
    const rounds = linescores
      .filter((r: any) => r.value !== null && r.value !== undefined)
      .map((r: any) => String(Math.round(r.value)));

    // Thru: check if currently mid-round
    let thru = "";
    const inProgressRound = linescores[rounds.length]; // next round after completed ones
    if (inProgressRound) {
      const holes = (inProgressRound.linescores ?? []).filter((h: any) => h.value !== null && h.value !== undefined);
      if (holes.length > 0 && holes.length < 18) {
        thru = String(holes.length);
      } else if (holes.length === 18) {
        thru = "F";
      }
    }
    if (!thru && rounds.length > 0) {
      thru = "F";
    }

    const flagUrl = athlete.flag?.href ?? "";
    const flagCountry = athlete.flag?.alt ?? countryNameFromFlagUrl(flagUrl);

    return {
      position: c.order ?? 0,
      name: athlete.displayName ?? "",
      shortName: athlete.shortName ?? "",
      score: c.score ?? "E",
      flag: flagUrl,
      flagCountry,
      rounds,
      thru,
    };
  });

  // Gather broadcasts
  const broadcasts: string[] = [];
  for (const b of competition?.broadcasts ?? []) {
    for (const name of b.names ?? []) {
      if (!broadcasts.includes(name)) broadcasts.push(name);
    }
  }

  // Masters broadcast enrichment — ESPN's scoreboard only lists the rights holder
  // for the current window. The actual coverage is split across networks/streamers.
  // 2026 Masters: Thu/Fri ESPN + Amazon Prime, Sat/Sun CBS + Paramount+
  // (Masters.com / Masters app stream all four days)
  if (/masters/i.test(event.name ?? "")) {
    const dayDate = date
      ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
      : new Date();
    const dow = dayDate.getDay(); // 0=Sun..6=Sat
    const add = (n: string) => { if (!broadcasts.includes(n)) broadcasts.push(n); };
    if (dow === 4 || dow === 5) {
      // Thursday/Friday — Rounds 1-2
      add("ESPN");
      add("Amazon Prime");
    } else if (dow === 6 || dow === 0) {
      // Saturday/Sunday — Rounds 3-4
      add("CBS");
      add("Paramount+");
    }
    add("Masters.com");
  }

  // Calculate leaderboard competitiveness rating
  // Based on how tight the top of the leaderboard is
  let rating: number | null = null;
  if (state !== "pre" && players.length >= 5) {
    // Parse numeric scores for top players
    const parseScore = (s: string): number => {
      if (s === "E") return 0;
      return parseInt(s, 10) || 0;
    };
    const topScores = players.slice(0, 10).map(p => parseScore(p.score));
    const leader = topScores[0];
    // Spread between 1st and 5th
    const top5spread = Math.abs((topScores[4] ?? leader) - leader);
    // Spread between 1st and 10th
    const top10spread = Math.abs((topScores[9] ?? leader) - leader);
    // Number of players within 2 strokes of lead
    const within2 = topScores.filter(s => Math.abs(s - leader) <= 2).length;

    // Tight leaderboard = high rating
    // 0 spread = 100, each stroke of spread reduces by ~12
    const spreadScore = Math.max(0, 100 - top5spread * 12);
    // Depth bonus: more players bunched = more exciting
    const depthBonus = Math.min(15, within2 * 2);
    // Top 10 tightness (secondary factor)
    const top10Score = Math.max(0, 50 - top10spread * 5);

    rating = Math.min(100, Math.round(spreadScore * 0.6 + top10Score * 0.2 + depthBonus));
  }

  // Look up the tournament's start date (MM-DD) from the league config so the
  // client can do date-aware round labeling (yesterday=R1, today=R2, etc).
  const tournamentLabel = ALL_LEAGUES.find(
    (l) => l.sport === "golf" && new RegExp(l.label, "i").test(event.name ?? "")
  );

  // Drop tournament if the viewed date falls outside its 4-day window.
  // ESPN's scoreboard will happily return the nearest tournament even when
  // querying a date after the final round, which leaks a wrapped event into
  // e.g. tomorrow's view. Rounds run startDate..startDate+3.
  if (date && tournamentLabel?.startDate) {
    const selYear = parseInt(date.slice(0, 4), 10);
    const selMonth = parseInt(date.slice(4, 6), 10);
    const selDay = parseInt(date.slice(6, 8), 10);
    const [startMo, startDay] = tournamentLabel.startDate.split("-").map((s) => parseInt(s, 10));
    if (Number.isFinite(startMo) && Number.isFinite(startDay)) {
      const selDateObj = new Date(selYear, selMonth - 1, selDay);
      const startDateObj = new Date(selYear, startMo - 1, startDay);
      const dayIndex = Math.round(
        (selDateObj.getTime() - startDateObj.getTime()) / (24 * 3600 * 1000)
      );
      if (dayIndex < 0 || dayIndex > 3) return null;
    }
  }

  // Live-link destination — pick the first known broadcast's streamer, or
  // fall back to PGA Tour Live. Never link to the ESPN leaderboard, which
  // would defeat the no-spoiler experience by exposing live scores.
  let streamUrl: string | undefined;
  for (const broadcast of broadcasts) {
    const url = networkStreamUrl(broadcast, event.id ?? "");
    if (url) { streamUrl = url; break; }
  }
  if (!streamUrl) streamUrl = sportStreamFallback("golf");

  return {
    name: event.name ?? "",
    state,
    statusDetail,
    players,
    broadcasts,
    rating,
    currentRound,
    roundStatus,
    startDate: tournamentLabel?.startDate,
    eventDate: event.date ?? competition.date ?? undefined,
    streamUrl,
  };
}

export async function fetchGames(
  sport: Sport,
  date?: string
): Promise<Game[]> {
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  if (date) url.searchParams.set("dates", date);

  // For MLB, fetch game PKs in parallel with ESPN data
  const mlbPksPromise = sport === "mlb" ? fetchMLBGamePks(date) : null;
  // Same pattern for NHL — fetch NHL's own game IDs so we can deep-link
  // non-ESPN broadcasts into nhl.com/tv/{id} instead of the generic landing.
  const nhlIdsPromise = sport === "nhl" ? fetchNHLGameIds(date) : null;
  // Prime ASIN map lookup runs for every sport since Prime carries NFL TNF,
  // NBA, MLB, and some soccer. The map is cached across fetchGames() calls.
  const primeAsinsPromise = loadPrimeAsins();

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
        game.streamUrl = `https://www.mlb.com/tv/g${gamePk}`;
      }
    }
  }

  // Set fallback stream URLs from broadcast info
  for (const game of games) {
    if (!game.streamUrl) {
      game.streamUrl = buildStreamUrl(game);
    }
  }

  // Deepen the NHL landing URL (https://www.nhl.com/tv) to a per-game path
  // when we can resolve NHL's own game ID. ESPN-broadcast NHL games keep
  // their espn.com/watch deep link — only the generic NHL fallback is
  // replaced, so we never clobber a closer streamer URL.
  if (sport === "nhl" && nhlIdsPromise) {
    const nhlIds = await nhlIdsPromise;
    for (const game of games) {
      if (game.streamUrl !== "https://www.nhl.com/tv") continue;
      const nhlId = nhlIds.get(`${game.awayTeam.abbreviation}@${game.homeTeam.abbreviation}`);
      if (nhlId) game.streamUrl = `https://www.nhl.com/tv/${nhlId}`;
    }
  }

  // Prime Video deep link: when we have an ASIN for the matchup, store it
  // on the game so the Prime chip always routes there. Also upgrade the
  // main streamUrl if Prime was the winning broadcast (i.e., streamUrl is
  // currently a generic Prime sports page).
  const asinMap = await primeAsinsPromise;
  for (const game of games) {
    if (!hasPrimeBroadcast(game)) continue;
    const url = buildPrimeDeepLink(game, asinMap);
    if (!url) continue;
    game.primeStreamUrl = url;
    if (game.streamUrl && /primevideo\.com\/sports/.test(game.streamUrl)) {
      game.streamUrl = url;
    }
  }

  return games;
}

export async function fetchAllLeagues(date?: string, thirdLeagueSport?: Sport): Promise<LeagueData[]> {
  // Parse viewed date so league visibility matches the day being viewed, not today
  const viewDate = date
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
    : new Date();

  const { firstPref, rest } = getActiveLeagueCandidates(viewDate);

  // Fetch data for ALL candidates in parallel — needed so we can backfill
  // empty non-firstPref slots with lower-priority leagues that have games today.
  const fetchLeague = async ({ sport, label }: LeagueConfig): Promise<LeagueData | null> => {
    if (sport === "golf") {
      const golfTournament = await fetchGolfTournament(date);
      if (!golfTournament) return null;
      return { sport, label, games: [], golfTournament };
    }
    const games = await fetchGames(sport, date);
    let nextGameDay: { date: string; games: Game[] } | null = null;
    if (games.length === 0) {
      nextGameDay = await fetchNextGameDay(sport, 7, date);
    }
    return { sport, label, games, nextGameDay };
  };

  // If user chose a 3rd league, we also need to fetch it (may not be in firstPref or rest)
  const allCandidates = [...firstPref, ...rest];
  const thirdLeagueConfig = thirdLeagueSport
    ? ALL_LEAGUES.find((l) => l.sport === thirdLeagueSport && isLeagueActive(l, viewDate))
    : null;
  // Add to candidates if not already present
  const extraFetch = thirdLeagueConfig && !allCandidates.some(c => c.sport === thirdLeagueConfig.sport && c.label === thirdLeagueConfig.label)
    ? [thirdLeagueConfig]
    : [];

  const [firstPrefResults, restResults, extraResults] = await Promise.all([
    Promise.all(firstPref.map(fetchLeague)),
    Promise.all(rest.map(fetchLeague)),
    Promise.all(extraFetch.map(fetchLeague)),
  ]);

  // First-pref leagues always shown (when data loaded); cap at MAX_LEAGUES
  const selectedFirstPref = firstPrefResults
    .filter((r): r is LeagueData => r !== null)
    .slice(0, MAX_LEAGUES);

  // Fill remaining slots from rest in strict priority order.
  // Empty leagues are OK — they render with a "next game" message.
  // restResults preserves the priority order from getActiveLeagueCandidates.
  const remaining = MAX_LEAGUES - selectedFirstPref.length;

  // If user chose a 3rd league, reserve the last slot for it
  // Skip if the chosen sport is already in firstPref (would duplicate)
  const alreadyInFirstPref = selectedFirstPref.some(l => l.sport === thirdLeagueSport);
  if (thirdLeagueSport && remaining > 0 && !alreadyInFirstPref) {
    // Fill slots 1..(remaining-1) from auto rest, then slot 3 = user choice
    const autoRest = restResults
      .filter((r): r is LeagueData => r !== null)
      .filter(r => r.sport !== thirdLeagueSport);
    const autoSlots = autoRest.slice(0, remaining - 1);

    // Find the user's chosen league from rest results or extra fetch
    const userLeague = restResults
      .filter((r): r is LeagueData => r !== null)
      .find(r => r.sport === thirdLeagueSport)
      ?? extraResults.filter((r): r is LeagueData => r !== null)[0]
      ?? null;

    // Sort only auto slots (positions 1-2) — user's choice always goes last (position 3)
    const autoSelected = [...selectedFirstPref, ...autoSlots].sort(
      (a, b) =>
        daysSinceSeasonStart(
          ALL_LEAGUES.find((l) => l.sport === b.sport && l.label === b.label)!,
          viewDate
        ) -
        daysSinceSeasonStart(
          ALL_LEAGUES.find((l) => l.sport === a.sport && l.label === a.label)!,
          viewDate
        )
    );
    if (userLeague) autoSelected.push(userLeague);
    return autoSelected;
  }

  const selectedRest = restResults
    .filter((r): r is LeagueData => r !== null)
    .slice(0, remaining);

  const selected = [...selectedFirstPref, ...selectedRest];

  // Display order: longest-active leftmost, newest rightmost
  return selected.sort(
    (a, b) =>
      daysSinceSeasonStart(
        ALL_LEAGUES.find((l) => l.sport === b.sport && l.label === b.label)!,
        viewDate
      ) -
      daysSinceSeasonStart(
        ALL_LEAGUES.find((l) => l.sport === a.sport && l.label === a.label)!,
        viewDate
      )
  );
}

// Fetch a team's full season schedule from ESPN. team.id on our Game model is
// `${sport}-${rawId}` — caller passes the raw ESPN team id here.
// Returns games parsed via the shared parser, sorted oldest → newest.
// Pulls requested season(s); for current season defaults to current year.
export async function fetchTeamSchedule(
  sport: Sport,
  espnTeamId: string,
  seasons?: number[]
): Promise<Game[]> {
  const years = seasons && seasons.length > 0 ? seasons : [new Date().getFullYear()];
  const asinMap = await loadPrimeAsins();
  const all: Game[] = [];
  const seen = new Set<string>();
  await Promise.all(
    years.map(async (year) => {
      const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
      const url = new URL(
        `${BASE_URL}${sportPath}/teams/${espnTeamId}/schedule`
      );
      url.searchParams.set("season", String(year));
      let res: Response;
      try {
        res = await fetchWithRetry(url.toString());
      } catch {
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const events = data.events ?? data.team?.events ?? [];
      for (const e of events) {
        // Team-schedule events nest status inside competitions[0] and omit
        // the flat competitor.team.logo that scoreboard returns. Reshape to
        // match the scoreboard shape so the shared parseGame works.
        const comp = (e.competitions ?? [])[0] ?? {};
        if (!e.status || !e.status.type) e.status = comp.status ?? {};
        for (const c of comp.competitors ?? []) {
          const t = c.team;
          if (t && !t.logo && Array.isArray(t.logos)) {
            const primary = t.logos.find((l: { rel?: string[] }) => l.rel?.includes("default")) ?? t.logos[0];
            if (primary?.href) t.logo = primary.href;
          }
        }
        const statusName = e.status?.type?.name ?? "";
        if (statusName.includes("POSTPONED") || statusName.includes("CANCELED") || statusName.includes("SUSPENDED")) continue;
        const seasonType = e.season?.type ?? 0;
        if (seasonType === 1) continue;
        if (!e.id || seen.has(e.id)) continue;
        seen.add(e.id);
        const game = parseGame(e, sport);
        game.streamUrl = buildStreamUrl(game);
        if (hasPrimeBroadcast(game)) {
          const primeUrl = buildPrimeDeepLink(game, asinMap);
          if (primeUrl) {
            game.primeStreamUrl = primeUrl;
            if (game.streamUrl && /primevideo\.com\/sports/.test(game.streamUrl)) {
              game.streamUrl = primeUrl;
            }
          }
        }
        all.push(game);
      }
    })
  );
  all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return all;
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
