// "Top events" — the cross-league column (Jacob 9/4: "top events special pill").
//
// Two halves live here, both pure so the node unit runner can load them:
//   1. parseEspnHeader — reads ESPN's homepage "Top Events" strip payload
//      (site.web.api.espn.com/apis/v2/scoreboard/header) into a per-sport list
//      of the event ids ESPN itself is featuring right now. That strip is
//      ESPN's editorial answer to "what matters today", so it is the anchor
//      signal: we double-check our own pick against what espn.com is leading
//      with instead of inventing importance from scratch.
//   2. rankTopEvents — scores real Game objects (the same ones the league
//      columns render) and keeps the best N. Everything it reads is visible
//      on a spoiler-free card already: who is playing, whether it is live,
//      playoff/ranked/national-TV flags, the user's stars. It never reads a
//      score, a margin, or the ratings engine, so 🙈 mode stays honest — in
//      ratings mode the column's normal best-games sort still applies on top.
//
// No value imports from espn.ts on purpose: preferences.ts imports "./types"
// extensionless, which `node --experimental-strip-types` cannot resolve, so
// anything that pulls the data layer in is untestable. Type-only imports are
// erased and fine.
import type { Game, Sport } from "./types";

// Master switch for the whole column. OFF since 2026-09-05 (Jacob: "top events
// take down for now") — the pill leaves every switcher, the slot dropdowns and
// Settings, a saved "top" slot resolves to Auto, and nothing fetches ESPN's
// strip. The ranking below and its tests stay so flipping this back on is a
// one-line change.
export const TOP_EVENTS_ENABLED = false;

export type TopEventsMode = "auto" | "manual";
export type TopEventsCount = 5 | 8 | 12;
export const TOP_EVENTS_DEFAULT_COUNT: TopEventsCount = 8;
// One league can't flood the column: MLB has 15 games a night and would
// otherwise crowd out a single UCL match. Favorites are exempt from the cap.
export const TOP_EVENTS_MAX_PER_LEAGUE = 3;
// How many leagues we are willing to fetch for the column beyond what the
// board already has. Each is one ESPN scoreboard request.
export const TOP_EVENTS_MAX_SOURCES = 8;

// ESPN homepage strip league slugs → our sport keys. Only sports whose events
// are two-team GAMES we render as cards. Event-tile sports (golf, racing, UFC,
// boxing, chess, poker) and tennis (tournament-level header entries, not
// matches) are not part of the column yet.
export const HEADER_SLUG_TO_SPORT: Record<string, Sport> = {
  "college-football": "ncaaf",
  nfl: "nfl",
  ufl: "ufl",
  mlb: "mlb",
  llb: "llws",
  "college-baseball": "ncaabase",
  "college-softball": "ncaasoft",
  nba: "nba",
  wnba: "wnba",
  "mens-college-basketball": "ncaam",
  "womens-college-basketball": "ncaaw",
  "womens-college-volleyball": "ncaavb",
  nhl: "nhl",
  "eng.1": "epl",
  "eng.2": "efl",
  "usa.1": "mls",
  "usa.nwsl": "nwsl",
  "uefa.champions": "ucl",
  "uefa.europa": "uel",
  "esp.1": "laliga",
  "ita.1": "seriea",
  "ger.1": "bundesliga",
  "fra.1": "ligue1",
  "mex.1": "ligamx",
  "conmebol.libertadores": "libertadores",
  "fifa.world": "fifa",
  "uefa.euro": "euro",
  "caf.nations": "afcon",
  "ksa.1": "saudi",
  "uefa.europa.conf": "uecl",
  "eng.fa": "facup",
  "esp.copa_del_rey": "copadelrey",
  "ger.dfb_pokal": "dfbpokal",
};

// Sports the column can draw from at all (two-team game cards). Kept as a
// list rather than derived from the map above so a manual pool can include a
// league ESPN never features on its homepage (Liga MX, Saudi PL).
export const TOP_EVENTS_GAME_SPORTS: readonly Sport[] = [
  "nfl", "ncaaf", "ufl", "mlb", "nba", "wnba", "ncaam", "ncaaw", "ncaavb", "nhl", "llws", "ncaabase", "ncaasoft",
  "epl", "ucl", "uel", "laliga", "seriea", "bundesliga", "ligue1", "mls",
  "ligamx", "nwsl", "efl", "libertadores", "saudi", "fifa", "euro", "afcon",
  "uecl", "facup", "copadelrey", "dfbpokal",
];
const GAME_SPORT_SET = new Set<Sport>(TOP_EVENTS_GAME_SPORTS);
export function isTopEventsGameSport(sport: Sport): boolean {
  return GAME_SPORT_SET.has(sport);
}

export interface EspnHeaderFeature {
  sport: Sport;
  // Event ids in ESPN's own order within the league (first = most prominent).
  eventIds: string[];
  // Position of the league's SPORT on the strip: 0 = what espn.com leads with.
  sportOrder: number;
}

// Tolerant reader for the header payload. Unknown leagues and malformed
// entries are skipped, never thrown — the column must degrade to "no ESPN
// signal" rather than fail when Disney reshapes the response.
export function parseEspnHeader(payload: unknown): EspnHeaderFeature[] {
  const out: EspnHeaderFeature[] = [];
  const sports = (payload as { sports?: unknown[] } | null)?.sports;
  if (!Array.isArray(sports)) return out;
  const seen = new Set<Sport>();
  sports.forEach((s, sportOrder) => {
    const leagues = (s as { leagues?: unknown[] })?.leagues;
    if (!Array.isArray(leagues)) return;
    for (const lg of leagues) {
      const slug = (lg as { slug?: unknown })?.slug;
      if (typeof slug !== "string") continue;
      const sport = HEADER_SLUG_TO_SPORT[slug];
      if (!sport) continue;
      const events = (lg as { events?: unknown[] })?.events;
      const eventIds: string[] = [];
      for (const e of Array.isArray(events) ? events : []) {
        const id = (e as { id?: unknown })?.id;
        if (typeof id === "string" || typeof id === "number") eventIds.push(String(id));
      }
      if (!eventIds.length) continue;
      if (seen.has(sport)) {
        // Two header leagues can map to one sport (ATP/WTA would, if tennis
        // were included). Merge rather than duplicate.
        const prev = out.find((f) => f.sport === sport)!;
        prev.eventIds.push(...eventIds.filter((id) => !prev.eventIds.includes(id)));
        continue;
      }
      seen.add(sport);
      out.push({ sport, eventIds, sportOrder });
    }
  });
  return out;
}

export interface TopEventsContext {
  favoriteTeams: string[]; // "sport-teamId", as stored in prefs
  features: EspnHeaderFeature[];
  nowMs: number;
  count: number;
  maxPerLeague?: number;
}

export interface TopEventScore {
  score: number;
  reasons: string[];
}

// The national-window networks. A game on one of these was picked for a
// national audience by the league's TV partners — a second editorial signal
// next to ESPN's strip, and one that exists for tomorrow's slate too.
const NATIONAL_TV = /^(espn2?|espnu|espn\+|abc|fox|fs1|nbc|cbs|tnt|tbs|trutv|peacock|prime video|amazon prime video|amazon|apple tv\+?|netflix|paramount\+|cbs sports network|nfl network|nba tv|mlb network|nhl network|usa network)$/i;

const HOUR_MS = 3_600_000;
const POLL_RANKED_SPORTS = new Set<Sport>(["ncaaf", "ncaam", "ncaaw", "ncaavb"]);

export function scoreGame(game: Game, ctx: TopEventsContext): TopEventScore {
  let score = 0;
  const reasons: string[] = [];
  const favs = ctx.favoriteTeams;
  const homeFav = favs.includes(`${game.sport}-${game.homeTeam.id}`);
  const awayFav = favs.includes(`${game.sport}-${game.awayTeam.id}`);
  if (homeFav || awayFav) {
    score += 100;
    reasons.push("your team");
  }

  const feature = ctx.features.find((f) => f.sport === game.sport);
  const featuredIdx = feature ? feature.eventIds.indexOf(game.id) : -1;
  if (feature && featuredIdx >= 0) {
    // On espn.com right now. The strip is ordered, so earlier = bigger, and
    // the sport espn.com leads with outranks the fourth sport across.
    score += 40 + Math.max(0, 6 - featuredIdx) * 2 + Math.max(0, 3 - feature.sportOrder) * 4;
    reasons.push("on ESPN's homepage");
  }

  if (game.state === "in") {
    score += /delay/i.test(game.statusDetail) ? 15 : 30;
    reasons.push("live");
  } else if (game.state === "pre") {
    const startMs = new Date(game.date).getTime();
    const hoursAway = Number.isNaN(startMs) ? Infinity : (startMs - ctx.nowMs) / HOUR_MS;
    if (hoursAway >= -0.5 && hoursAway <= 3) {
      score += 15;
      reasons.push("starting soon");
    } else if (hoursAway > 3 && hoursAway <= 12) {
      score += 5;
    }
  }

  if (game.isPlayoff) {
    score += 25;
    reasons.push(game.playoffLabel ? game.playoffLabel.toLowerCase() : "postseason");
  }

  // Team.rank is the AP-poll rank for the college sports (top 25, most teams
  // unranked) but the STANDINGS position everywhere else — a number every
  // team has, so "≤ 25" would fire on every pro game. College: ranked
  // matchup. Pros: both sides in the top four of the table.
  const homeRank = game.homeTeam.rank ?? null;
  const awayRank = game.awayTeam.rank ?? null;
  if (POLL_RANKED_SPORTS.has(game.sport)) {
    const rankedHome = homeRank != null && homeRank <= 25;
    const rankedAway = awayRank != null && awayRank <= 25;
    if (rankedHome && rankedAway) {
      score += 20;
      reasons.push("ranked matchup");
    } else if (rankedHome || rankedAway) {
      score += 8;
      reasons.push("ranked team");
    }
  } else if (homeRank != null && awayRank != null && homeRank <= 4 && awayRank <= 4) {
    score += 12;
    reasons.push("top of the table");
  }

  if (game.broadcasts.some((b) => NATIONAL_TV.test(b.trim()))) {
    score += 10;
    reasons.push("national TV");
  }

  if (game.seriesNote) {
    score += 5;
    reasons.push(game.seriesNote.toLowerCase());
  }

  return { score, reasons };
}

function startMs(game: Game): number {
  const t = new Date(game.date).getTime();
  return Number.isNaN(t) ? 8.64e15 : t;
}

// Keep the best `ctx.count` games across every sport handed in, at most
// `maxPerLeague` per sport unless one of the user's teams is playing. Ties
// break live-first, then earlier start, then id (stable across re-renders).
// The cap is a diversity preference, not a ceiling: on a Thursday with 15 MLB
// games and nothing else, a column asked for 12 games fills to 12 from MLB
// once every other league's three are in, instead of stopping at 3.
export function rankTopEvents(games: Game[], ctx: TopEventsContext): Game[] {
  const maxPerLeague = ctx.maxPerLeague ?? TOP_EVENTS_MAX_PER_LEAGUE;
  const scored = games.map((game) => ({ game, ...scoreGame(game, ctx) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLive = a.game.state === "in" ? 0 : 1;
    const bLive = b.game.state === "in" ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    const dt = startMs(a.game) - startMs(b.game);
    if (dt !== 0) return dt;
    return a.game.id < b.game.id ? -1 : a.game.id > b.game.id ? 1 : 0;
  });
  const perLeague = new Map<Sport, number>();
  const seen = new Set<string>();
  const picked: Game[] = [];
  for (const { game, reasons } of scored) {
    if (picked.length >= ctx.count) break;
    if (seen.has(game.id)) continue;
    const isFav = reasons.includes("your team");
    const used = perLeague.get(game.sport) ?? 0;
    if (!isFav && used >= maxPerLeague) continue;
    seen.add(game.id);
    // Your team's game rides on top of the league's three, not instead of one.
    if (!isFav) perLeague.set(game.sport, used + 1);
    picked.push(game);
  }
  // Fill pass: still short → best remaining games, cap ignored, same order.
  for (const { game } of scored) {
    if (picked.length >= ctx.count) break;
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    picked.push(game);
  }
  return picked;
}

// Which leagues to pull for the column. Auto = whatever espn.com is featuring
// plus the leagues of the user's starred teams; manual = the user's own list.
// Both are trimmed to game-card sports and capped so the column can't fan out
// into a dozen scoreboard requests.
export function topEventsSourceSports(
  mode: TopEventsMode,
  manualLeagues: Sport[] | undefined,
  features: EspnHeaderFeature[],
  favoriteTeams: string[],
  maxSources = TOP_EVENTS_MAX_SOURCES,
): Sport[] {
  const ordered: Sport[] = [];
  const add = (s: Sport) => {
    if (isTopEventsGameSport(s) && !ordered.includes(s)) ordered.push(s);
  };
  if (mode === "manual") {
    for (const s of manualLeagues ?? []) add(s);
    return ordered.slice(0, maxSources);
  }
  // Favorites first so the cap can never drop the user's own team.
  for (const id of favoriteTeams) {
    const dash = id.indexOf("-");
    if (dash > 0) add(id.slice(0, dash) as Sport);
  }
  for (const f of [...features].sort((a, b) => a.sportOrder - b.sportOrder)) add(f.sport);
  return ordered.slice(0, maxSources);
}
