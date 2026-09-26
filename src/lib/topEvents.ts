// "ESPN front page" — the cross-league column that mirrors the games espn.com
// is featuring right now (Jacob 9/26: "espn frontpage league to show what
// games are highlighted there"). It began 9/4 as "Top events", a column that
// ranked games itself and used ESPN's strip as one signal; that was switched
// off 9/5. Now it shows ESPN's picks only, in ESPN's own order.
//
// Pure, so the node unit runner can load it:
//   parseEspnHeader — reads ESPN's homepage scores strip
//     (site.web.api.espn.com/apis/v2/scoreboard/header) into a per-sport list
//     of the event ids ESPN is featuring, in the order the strip shows them.
//   orderByEspnHeader — keeps the real Game objects (the same ones the league
//     columns render) that ESPN features, in that order. It never reads a
//     score or a margin, so 🙈 mode stays honest.
//
// No value imports from espn.ts on purpose: preferences.ts imports "./types"
// extensionless, which `node --experimental-strip-types` cannot resolve, so
// anything that pulls the data layer in is untestable. Type-only imports are
// erased and fine.
import type { Game, Sport } from "./types";

// Master switch for the whole column. Off 9/5 → back on 9/26 as the ESPN
// mirror. Off = the pill leaves every switcher and the slot dropdowns, a
// saved "top" slot resolves to Auto, and nothing fetches ESPN's strip.
export const TOP_EVENTS_ENABLED = true;

export const ESPN_FRONT_PAGE_LABEL = "ESPN front page";

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
  "usa.ncaa.w.1": "ncaawsoc",
  "usa.ncaa.m.1": "ncaamsoc",
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
  "uefa.nations": "nations",
};

// Two-team game-card sports. Kept as a list rather than derived from the map
// above because Best of yesterday reads it too, and it pools leagues ESPN
// never features on its homepage (Liga MX, Saudi PL).
export const TOP_EVENTS_GAME_SPORTS: readonly Sport[] = [
  "nfl", "ncaaf", "ufl", "mlb", "nba", "wnba", "ncaam", "ncaaw", "ncaavb", "nhl", "llws", "ncaabase", "ncaasoft",
  "epl", "ucl", "uel", "laliga", "seriea", "bundesliga", "ligue1", "mls",
  "ligamx", "nwsl", "efl", "libertadores", "saudi", "fifa", "euro", "afcon",
  "uecl", "facup", "copadelrey", "dfbpokal", "nations",
  "ncaawsoc", "ncaamsoc",
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

// The leagues to pull for the column: the ones ESPN is featuring, in strip
// order, capped so the column can't fan out into a dozen scoreboard requests.
export function espnFrontPageSports(
  features: EspnHeaderFeature[],
  maxSources = TOP_EVENTS_MAX_SOURCES,
): Sport[] {
  const out: Sport[] = [];
  for (const f of features) if (!out.includes(f.sport)) out.push(f.sport);
  return out.slice(0, maxSources);
}

// The games ESPN features, in the strip's order: its first league first, and
// inside a league the order ESPN lists them. Anything ESPN is not featuring
// is dropped. Ids are only unique within a sport, so the key carries both.
export function orderByEspnHeader(games: Game[], features: EspnHeaderFeature[]): Game[] {
  const rank = new Map<string, number>();
  for (const f of features) {
    for (const id of f.eventIds) {
      const key = `${f.sport}:${id}`;
      if (!rank.has(key)) rank.set(key, rank.size);
    }
  }
  const seen = new Set<string>();
  const picked: { game: Game; at: number }[] = [];
  for (const game of games) {
    const key = `${game.sport}:${game.id}`;
    const at = rank.get(key);
    if (at === undefined || seen.has(key)) continue;
    seen.add(key);
    picked.push({ game, at });
  }
  return picked.sort((a, b) => a.at - b.at).map((p) => p.game);
}
