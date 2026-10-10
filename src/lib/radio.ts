// "Listen" links: free live radio for a game, from our own verified station
// table (public/radio-stations.json, built and re-checked by
// scripts/check-radio-stations.mjs). ESPN gives no team radio at all — its
// geoBroadcasts carry only national ESPN Radio rows (media "ERADM") on a few
// MLB postseason and college football games — so the team flagships are ours.
//
// Import-light on purpose (types only, `.ts` paths) so the unit tests load it
// straight under node --experimental-strip-types, like nflTeamChannels.ts.
//
// Every link goes to a station or network PLAYER page, never a team or league
// site: those carry a live score bar. The checker enforces a host denylist.
//
// Geo: most NFL and MLB flagship streams play only inside the home market.
// /api/where (public/_worker.js) returns the visitor's Cloudflare country and
// metro code, and a market-locked link shows only inside its DMA list. A VPN
// moves that location too, which is the point. Settings → "Show local-only
// radio links everywhere" lifts the filter. When the location is unknown the
// links still show, tagged "local only": fail open, never hide everything.
import type { Game, LeagueEventCard, Sport } from "./types";

export type RadioAccess = {
  cost: "free" | "paid";
  geo: "none" | "market" | "country";
  // US Nielsen DMA codes (Cloudflare request.cf.metroCode) for geo "market".
  dma?: number[];
  // ISO country codes for geo "country", e.g. ["GB"].
  countries?: string[];
  signIn?: boolean;
  vpnOk?: boolean | "unknown";
};

export type RadioSource = {
  name: string;
  url: string;
  lang: string;
  access: RadioAccess;
  // YYYY-MM-DD the URL was last verified.
  checked: string;
  note?: string;
};

export type RadioTable = {
  // "<sport>:<espnTeamId>" → flagship feeds, English first.
  teams: Record<string, RadioSource[]>;
  // ESPN geoBroadcasts media shortName ("ERADM") → its feed.
  national: Record<string, RadioSource>;
  leagues: Record<string, { free?: RadioSource[]; paid?: RadioSource[] }>;
  // "<sport>:<text>" → radio for one event (a race track, a slam). The text
  // is lowercase and matches when the event title or venue contains it, so
  // "nascar:talladega" covers every Talladega race. See eventListenLinks.
  events?: Record<string, RadioSource[]>;
  // "<sport>:<espnTeamId>" → why that team has no free row (only spoiler
  // pages, no stream at all). The unit test holds every team in a shipped
  // league to a row OR a reason here.
  missing?: Record<string, string>;
};

export type Where = { country?: string; region?: string; metro?: number } | null;

export type ListenPrefs = { showListenLinks?: boolean; listenAnywhere?: boolean };

export type ListenLink = {
  name: string;
  url: string;
  // Short chips after the name: "ES", "local only", "UK only", "sign-in", "Paid".
  tags: string[];
};

export type ListenResult = { free: ListenLink[]; paid: ListenLink | null };

// Leagues with team rows in the table. A card outside these and FEED_SPORTS
// (and with no ESPN radio row) never fetches the table at all. Add a league
// here in the same change that adds its rows; tests/radio-stations.test.ts
// holds the two together. College leagues list only the conferences done so
// far (the test's TEAMS counts say which).
export const RADIO_SPORTS: ReadonlySet<Sport> = new Set<Sport>([
  "nfl", "mlb", "nba", "nhl",
  "wnba", "mls", "nwsl", "cfl", "ufl", "ligamx",
  "ncaaf", "ncaam", "ncaaw",
]);

// Sports with no team rows, only a series-wide feed (leagues.<sport>.free)
// or per-event rows (events). Same test holds this list to the table.
export const FEED_SPORTS: ReadonlySet<Sport> = new Set<Sport>([
  "nascar", "indycar", "f1",
  "tennis", "golf",
  "epl", "efl", "facup", "ucl",
  "cricket", "cricketintl", "nrl", "afl",
]);

// venue and seriesNote let an event row match a game too: a tennis match
// carries "Wimbledon 2026" in seriesNote (espn.ts parseTennisMatch).
type ListenGame = Pick<Game, "sport" | "state" | "homeTeam" | "awayTeam">
  & { radio?: string[]; venue?: string; seriesNote?: string | null };

const COUNTRY_LABEL: Record<string, string> = { GB: "UK", US: "US", CA: "Canada", AU: "Australia" };

// null = hide the link here; otherwise the geo tag to show ("" = none).
function geoTag(access: RadioAccess, where: Where, anywhere: boolean): string | null {
  if (access.geo === "market") {
    const dma = access.dma ?? [];
    if (where && where.metro != null && dma.includes(where.metro)) return "";
    if (anywhere) return "local only";
    // Known to be outside: a non-US visitor, or a US metro not on the list.
    if (where && where.country && where.country !== "US") return null;
    if (where && where.metro != null) return null;
    return "local only";
  }
  if (access.geo === "country") {
    const countries = access.countries ?? [];
    if (where?.country && countries.includes(where.country)) return "";
    const label = `${countries.map((c) => COUNTRY_LABEL[c] ?? c).join("/")} only`;
    if (anywhere || !where?.country) return label;
    return null;
  }
  return "";
}

function toLink(src: RadioSource, where: Where, anywhere: boolean): ListenLink | null {
  const geo = geoTag(src.access, where, anywhere);
  if (geo === null) return null;
  const tags: string[] = [];
  if (src.lang && src.lang !== "en") tags.push(src.lang.toUpperCase());
  if (geo) tags.push(geo);
  if (src.access.signIn) tags.push("sign-in");
  if (src.access.cost === "paid") tags.push("Paid");
  return { name: src.name, url: src.url, tags };
}

// Order: home flagship, away flagship, event rows (a slam), national (ESPN
// Radio), league feeds,
// then every non-English feed last in the same order. Paid only when no free
// link survives the geo filter. A finished game gets nothing: there is no
// live audio left, and a station page is no use after the fact.
export function listenLinks(
  game: ListenGame,
  table: RadioTable | null,
  where: Where,
  prefs: ListenPrefs,
): ListenResult {
  const none: ListenResult = { free: [], paid: null };
  if (!table || game.state === "post" || prefs.showListenLinks === false) return none;
  const anywhere = prefs.listenAnywhere === true;
  // Game team ids are "<sport>-<espnId>" (espn.ts parseTeam); the table keys
  // on the bare ESPN id.
  const teamRows = (id: string | undefined) => {
    const raw = id?.startsWith(`${game.sport}-`) ? id.slice(game.sport.length + 1) : id;
    return raw ? table.teams[`${game.sport}:${raw}`] ?? [] : [];
  };
  const own = matchEventRows(table, game.sport, `${game.venue ?? ""} ${game.seriesNote ?? ""}`);
  return pickLinks([...teamRows(game.homeTeam?.id), ...teamRows(game.awayTeam?.id), ...own], game.sport, game.radio, table, where, anywhere);
}

// Event rows whose text appears in the event's title or venue.
function matchEventRows(table: RadioTable, sport: Sport, text: string): RadioSource[] {
  const hay = text.toLowerCase();
  const prefix = `${sport}:`;
  return Object.entries(table.events ?? {})
    .filter(([k]) => k.startsWith(prefix) && k.length > prefix.length && hay.includes(k.slice(prefix.length)))
    .flatMap(([, list]) => list);
}

// The Listen links for an event tile (a race, a slam, a major): rows for this
// event first, then national ESPN Radio, then the series feed. Same geo, paid
// and finished rules as a game.
export function eventListenLinks(
  sport: Sport,
  event: Pick<LeagueEventCard, "state" | "title" | "subtitle" | "radio">,
  table: RadioTable | null,
  where: Where,
  prefs: ListenPrefs,
): ListenResult {
  if (!table || event.state === "post" || prefs.showListenLinks === false) return { free: [], paid: null };
  const own = matchEventRows(table, sport, `${event.title} ${event.subtitle ?? ""}`);
  return pickLinks(own, sport, event.radio, table, where, prefs.listenAnywhere === true);
}

function pickLinks(
  first: RadioSource[],
  sport: Sport,
  radio: string[] | undefined,
  table: RadioTable,
  where: Where,
  anywhere: boolean,
): ListenResult {
  const national = (radio ?? []).map((k) => table.national[k]).filter((s): s is RadioSource => !!s);
  const league = table.leagues[sport];
  const all = [...first, ...national, ...(league?.free ?? [])].filter((s) => s.access.cost === "free");
  const ordered = [...all.filter((s) => s.lang === "en"), ...all.filter((s) => s.lang !== "en")];
  const seen = new Set<string>();
  const free: ListenLink[] = [];
  for (const src of ordered) {
    if (seen.has(src.url)) continue;
    const link = toLink(src, where, anywhere);
    // Marked seen only once shown, so a copy hidden by geo never blocks one
    // that passes.
    if (link) { seen.add(src.url); free.push(link); }
  }
  if (free.length) return { free, paid: null };
  const paidSrc = league?.paid?.[0];
  return { free, paid: paidSrc ? toLink(paidSrc, null, true) : null };
}

// Whether a card should bother loading the table at all.
export function mayHaveListen(game: Pick<ListenGame, "sport" | "state" | "radio">): boolean {
  return game.state !== "post" && (RADIO_SPORTS.has(game.sport) || FEED_SPORTS.has(game.sport) || !!game.radio?.length);
}

// ESPN geoBroadcasts → the radio media short names ("ERADM"). Only type 5
// (Radio) rows count; TV rows live in competition.broadcasts already.
export type GeoBroadcast = { type?: { id?: string | number; shortName?: string }; media?: { shortName?: string } };
export function parseRadioBroadcasts(rows: GeoBroadcast[] | undefined): string[] {
  const out: string[] = [];
  for (const g of rows ?? []) {
    const isRadio = String(g?.type?.id ?? "") === "5" || g?.type?.shortName === "Radio";
    const name = g?.media?.shortName;
    if (isRadio && name && !out.includes(name)) out.push(name);
  }
  return out;
}

// --- Prefs, pushed in by loadPreferences()/savePreferences() (same pattern as
// setTvChannelLinks) so a card reads them without prop drilling.
let listenPrefs: ListenPrefs = {};
export function setListenPrefs(showListenLinks: boolean | undefined, listenAnywhere: boolean | undefined): void {
  listenPrefs = { showListenLinks: showListenLinks ?? true, listenAnywhere: listenAnywhere ?? false };
}
export function getListenPrefs(): ListenPrefs {
  return listenPrefs;
}

// --- Loaders. The table is lazy (never in the bundle) and cached in memory
// plus localStorage for a day; the location once per session.
function apiBase(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol;
  return proto === "capacitor:" || proto === "file:" ? "https://hidescore.com" : "";
}

const TABLE_KEY = "hs-radio-stations-v1";
const TABLE_TTL_MS = 24 * 60 * 60 * 1000;
let tablePromise: Promise<RadioTable | null> | null = null;

function readCachedTable(): { at: number; data: RadioTable } | null {
  try {
    const raw = localStorage.getItem(TABLE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.data?.teams ? parsed : null;
  } catch {
    return null;
  }
}

export function loadRadioTable(): Promise<RadioTable | null> {
  if (!tablePromise) {
    tablePromise = (async () => {
      const cached = readCachedTable();
      if (cached && Date.now() - cached.at < TABLE_TTL_MS) return cached.data;
      try {
        const res = await fetch(`${apiBase()}/radio-stations.json`);
        const data = res.ok ? ((await res.json()) as RadioTable) : null;
        if (data?.teams) {
          try { localStorage.setItem(TABLE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
          return data;
        }
      } catch { /* offline: fall through to a stale copy */ }
      // A miss clears the promise so a later card retries (see loadEspnAirings).
      tablePromise = null;
      return cached?.data ?? null;
    })();
  }
  return tablePromise;
}

const WHERE_KEY = "hs-where-v1";
let wherePromise: Promise<Where> | null = null;
export function loadWhere(): Promise<Where> {
  if (!wherePromise) {
    wherePromise = (async () => {
      try {
        const raw = sessionStorage.getItem(WHERE_KEY);
        if (raw) return JSON.parse(raw) as Where;
      } catch { /* storage blocked */ }
      try {
        const res = await fetch(`${apiBase()}/api/where`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (data && typeof data === "object") {
          const where: Where = {
            country: typeof data.country === "string" ? data.country : undefined,
            region: typeof data.region === "string" ? data.region : undefined,
            metro: Number.isFinite(Number(data.metro)) && data.metro !== null ? Number(data.metro) : undefined,
          };
          try { sessionStorage.setItem(WHERE_KEY, JSON.stringify(where)); } catch { /* storage blocked */ }
          return where;
        }
      } catch { /* unknown location: fail open */ }
      wherePromise = null;
      return null;
    })();
  }
  return wherePromise;
}

// Hosts a Listen link may never point at: league and team-news sites carry a
// live score bar or a scoreboard on the landing page. Matched on the host and
// every parent domain. scripts/check-radio-stations.mjs and
// tests/radio-stations.test.ts both read this list.
export const RADIO_HOST_DENYLIST: readonly string[] = [
  "espn.com", "espn.go.com", "espndeportes.com",
  "nfl.com", "mlb.com", "nba.com", "wnba.com", "nhl.com", "mlssoccer.com", "ncaa.com",
  "cbssports.com", "foxsports.com", "nbcsports.com", "yahoo.com", "thescore.com",
  "bleacherreport.com", "si.com", "theathletic.com", "nytimes.com", "google.com",
  "sportsnet.ca", "tsn.ca", "rds.ca", "tvasports.ca",
  // Phase 2-4 leagues and events: league, tour and tournament sites all lead
  // with scores, results, standings or a leaderboard.
  "cfl.ca", "theufl.com", "nwslsoccer.com", "ligamx.net", "tudn.com", "mediotiempo.com", "record.com.mx",
  "premierleague.com", "efl.com", "uefa.com", "skysports.com",
  "formula1.com", "nascar.com", "indycar.com", "pgatour.com", "atptour.com", "wtatennis.com",
  "wimbledon.com", "usopen.org", "ausopen.com", "rolandgarros.com", "masters.com", "theopen.com",
  "espncricinfo.com", "cricbuzz.com", "afl.com.au", "nrl.com", "sidearmsports.com",
];

export function deniedRadioHost(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "bad URL";
  }
  return RADIO_HOST_DENYLIST.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}
