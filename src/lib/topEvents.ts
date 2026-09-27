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
//   parseEspnFrontPageFeed — reads the homepage BODY under the strip
//     (onefeed.fan.api.espn.com …/oneFeed/frontpage): the big game blocks
//     and the league scoreboard modules, top to bottom.
//   orderByEspnHeader — keeps the real Game objects (the same ones the league
//     columns render) that ESPN features: the body's games first, then the
//     rest of the strip. It never reads a score or a margin, so 🙈 mode stays
//     honest.
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

// The event ids espn.com's homepage body puts on show, top to bottom (Jacob
// 9/26: "ur not taking highlighted posts into consideration" — the big
// Texas A&M–LSU block above the College Football Scoreboard). Two shapes
// carry a game: a game block (`data.event`, the hero and later recap blocks)
// and a scoreboard module (`SportingEvent` inlines, in the module's order).
// Story modules carry no game and are skipped. Tolerant like parseEspnHeader:
// a reshaped feed means no body signal, never a throw.
export function parseEspnFrontPageFeed(payload: unknown): string[] {
  const out: string[] = [];
  const push = (id: unknown) => {
    if (typeof id !== "string" && typeof id !== "number") return;
    const s = String(id);
    if (s && !out.includes(s)) out.push(s);
  };
  const feed = (payload as { feed?: unknown[] } | null)?.feed;
  if (!Array.isArray(feed)) return out;
  for (const item of feed) {
    const data = (item as { data?: { event?: { id?: unknown }; now?: unknown[] } } | null)?.data;
    if (!data) continue;
    push(data.event?.id);
    for (const mod of Array.isArray(data.now) ? data.now : []) {
      const inlines = (mod as { inlines?: unknown[] } | null)?.inlines;
      for (const inl of Array.isArray(inlines) ? inlines : []) {
        const e = inl as { type?: unknown; eventId?: unknown } | null;
        if (e?.type === "SportingEvent") push(e.eventId);
      }
    }
  }
  return out;
}

// The games ESPN features. First the ones the homepage body puts on show, in
// its order; then the rest of the strip in the strip's order (its first
// league first, and inside a league the order ESPN lists them). Anything the
// strip does not carry is dropped. Ids are only unique within a sport, so the
// key carries both, and a body id takes its sport from the strip.
export function orderByEspnHeader(
  games: Game[],
  features: EspnHeaderFeature[],
  featured: string[] = [],
): Game[] {
  const rank = new Map<string, number>();
  const put = (key: string) => {
    if (!rank.has(key)) rank.set(key, rank.size);
  };
  const stripSport = new Map<string, Sport>();
  for (const f of features) for (const id of f.eventIds) if (!stripSport.has(id)) stripSport.set(id, f.sport);
  for (const id of featured) {
    const sport = stripSport.get(id);
    if (sport) put(`${sport}:${id}`);
  }
  for (const f of features) for (const id of f.eventIds) put(`${f.sport}:${id}`);
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

// The `${sport}:${id}` keys of the body games (parseEspnFrontPageFeed) the
// strip carries — the ones orderByEspnHeader puts first. A body id takes its
// sport from the strip, the same way orderByEspnHeader matches it.
export function espnFeaturedKeys(features: EspnHeaderFeature[], featured: string[]): string[] {
  const stripSport = new Map<string, Sport>();
  for (const f of features) for (const id of f.eventIds) if (!stripSport.has(id)) stripSport.set(id, f.sport);
  const out: string[] = [];
  for (const id of featured) {
    const sport = stripSport.get(id);
    if (sport && !out.includes(`${sport}:${id}`)) out.push(`${sport}:${id}`);
  }
  return out;
}

// espn.com's own layout, read off the rendered strip on 9/26: one block per
// league, and inside a league its live games first, then the rest in ESPN's
// order (the feed lists a league's finals before its live games; the page
// lifts the live ones). Games arrive in orderByEspnHeader's order, so the
// block of the league ESPN's homepage body features first leads the column,
// and inside a block the body's own games (featuredKeys) keep the top, in the
// body's order, ahead of the live ones: the hero game is always the first
// card. This only regroups. It reads state, never a score.
export interface EspnFrontPageGroup {
  sport: Sport;
  games: Game[];
}
export function groupEspnFrontPage(games: Game[], featuredKeys: readonly string[] = []): EspnFrontPageGroup[] {
  const featured = new Set(featuredKeys);
  const groups: EspnFrontPageGroup[] = [];
  for (const game of games) {
    const group = groups.find((g) => g.sport === game.sport);
    if (group) group.games.push(game);
    else groups.push({ sport: game.sport, games: [game] });
  }
  return groups.map(({ sport, games: list }) => {
    const isFeatured = (g: Game) => featured.has(`${g.sport}:${g.id}`);
    const rest = list.filter((g) => !isFeatured(g));
    return {
      sport,
      games: [
        ...list.filter(isFeatured),
        ...rest.filter((g) => g.state === "in"),
        ...rest.filter((g) => g.state !== "in"),
      ],
    };
  });
}
