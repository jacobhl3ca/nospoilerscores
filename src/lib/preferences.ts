import { Sport } from "./types";

const STORAGE_KEY = "nss-preferences";

// Compact encoding for share URLs: mlb→m, nba→n, wnba→wn, ncaam→c, nhl→h, nfl→f, golf→g, tennis→t, fifa→w
// The decoder regex (`[a-z]+`) and SHORT_TO_SPORT lookup handle multi-char codes,
// so wnba doesn't need a single char — keeps fifa→w stable for existing share URLs.
const SPORT_TO_SHORT: Record<Sport, string> = { mlb: "m", nba: "n", wnba: "wn", ncaam: "c", nhl: "h", nfl: "f", golf: "g", tennis: "t", fifa: "w", epl: "e", mls: "s" };
const SHORT_TO_SPORT: Record<string, Sport> = Object.fromEntries(
  Object.entries(SPORT_TO_SHORT).map(([k, v]) => [v, k as Sport])
) as Record<string, Sport>;

// Encode team ID "mlb-1" → "m1", decode "m1" → "mlb-1"
function encodeTeamId(id: string): string {
  const dash = id.indexOf("-");
  if (dash === -1) return id;
  const sport = id.slice(0, dash) as Sport;
  return (SPORT_TO_SHORT[sport] ?? sport) + id.slice(dash + 1);
}

function decodeTeamId(short: string): string {
  const match = short.match(/^([a-z]+)(\d+)$/);
  if (!match) return short;
  const sport = SHORT_TO_SPORT[match[1]];
  return sport ? `${sport}-${match[2]}` : short;
}

export type Theme = "dark" | "light" | "system";
export type DefaultDateMode = "smart" | "today" | "yesterday";
export type DefaultLandingView = "remember" | "scores" | "news";
// auto = current behavior (off in morning, last state after noon ET).
// off / on = explicit override.
export type DefaultRatings = "auto" | "off" | "on";

// Compact single-char codes for the four enum prefs so share URLs stay short.
const THEME_TO_SHORT: Record<Theme, string> = { system: "s", light: "l", dark: "d" };
const SHORT_TO_THEME: Record<string, Theme> = { s: "system", l: "light", d: "dark" };
const DATE_MODE_TO_SHORT: Record<DefaultDateMode, string> = { smart: "s", today: "t", yesterday: "y" };
const SHORT_TO_DATE_MODE: Record<string, DefaultDateMode> = { s: "smart", t: "today", y: "yesterday" };
const LANDING_TO_SHORT: Record<DefaultLandingView, string> = { remember: "r", scores: "s", news: "n" };
const SHORT_TO_LANDING: Record<string, DefaultLandingView> = { r: "remember", s: "scores", n: "news" };
const RATINGS_TO_SHORT: Record<DefaultRatings, string> = { auto: "a", off: "f", on: "o" };
const SHORT_TO_RATINGS: Record<string, DefaultRatings> = { a: "auto", f: "off", o: "on" };

// Encode: ["mlb-1","nba-15"] → "m1.n15"
// slotLeagues encodes per-slot overrides as `s1.s2.s3`, with "_" for unset slots.
// e.g. ["nba", undefined, "mlb"] → "n._.m"
// Optional snapshot fields (theme/dateMode/landingView/ratings/newsThirdLeague)
// are appended only when set, keeping the URL short for partial snapshots.
export function encodeFavorites(
  teams: string[],
  leagues: Sport[],
  thirdLeague?: Sport | "empty",
  slotLeagues?: (Sport | "empty" | undefined)[],
  extras?: {
    theme?: Theme;
    defaultDateMode?: DefaultDateMode;
    defaultLandingView?: DefaultLandingView;
    defaultRatings?: DefaultRatings;
    newsThirdLeague?: Sport;
  },
): URLSearchParams {
  const params = new URLSearchParams();
  if (teams.length > 0) params.set("f", teams.map(encodeTeamId).join("."));
  if (leagues.length > 0) params.set("l", leagues.map((s) => SPORT_TO_SHORT[s] ?? s).join("."));
  if (thirdLeague) params.set("t", thirdLeague === "empty" ? "0" : (SPORT_TO_SHORT[thirdLeague] ?? thirdLeague));
  // "empty" slot encoded as "0" so it round-trips through SHORT_TO_SPORT (which
  // would otherwise drop it back to undefined and lose the explicit hide).
  if (slotLeagues && slotLeagues.some(Boolean)) {
    params.set("s", slotLeagues.map((s) => (!s ? "_" : s === "empty" ? "0" : (SPORT_TO_SHORT[s] ?? s))).join("."));
  }
  if (extras?.theme) params.set("th", THEME_TO_SHORT[extras.theme]);
  if (extras?.defaultDateMode) params.set("dd", DATE_MODE_TO_SHORT[extras.defaultDateMode]);
  if (extras?.defaultLandingView) params.set("dv", LANDING_TO_SHORT[extras.defaultLandingView]);
  if (extras?.defaultRatings) params.set("dr", RATINGS_TO_SHORT[extras.defaultRatings]);
  if (extras?.newsThirdLeague) params.set("n", SPORT_TO_SHORT[extras.newsThirdLeague] ?? extras.newsThirdLeague);
  return params;
}

// Decode: "m1.n15" → ["mlb-1","nba-15"]
export function decodeFavorites(params: URLSearchParams): {
  teams?: string[];
  leagues?: Sport[];
  thirdLeague?: Sport | "empty";
  slotLeagues?: (Sport | "empty" | undefined)[];
  theme?: Theme;
  defaultDateMode?: DefaultDateMode;
  defaultLandingView?: DefaultLandingView;
  defaultRatings?: DefaultRatings;
  newsThirdLeague?: Sport;
} {
  const result: {
    teams?: string[];
    leagues?: Sport[];
    thirdLeague?: Sport | "empty";
    slotLeagues?: (Sport | "empty" | undefined)[];
    theme?: Theme;
    defaultDateMode?: DefaultDateMode;
    defaultLandingView?: DefaultLandingView;
    defaultRatings?: DefaultRatings;
    newsThirdLeague?: Sport;
  } = {};
  const f = params.get("f");
  const l = params.get("l");
  const t = params.get("t");
  const s = params.get("s");
  if (f) result.teams = f.split(".").map(decodeTeamId).filter(Boolean);
  if (l) result.leagues = l.split(".").map((s) => SHORT_TO_SPORT[s]).filter(Boolean) as Sport[];
  if (t) result.thirdLeague = t === "0" ? "empty" : SHORT_TO_SPORT[t];
  if (s) result.slotLeagues = s.split(".").map((tok) => (tok === "_" ? undefined : tok === "0" ? "empty" : SHORT_TO_SPORT[tok]));
  const th = params.get("th");
  const dd = params.get("dd");
  const dv = params.get("dv");
  const dr = params.get("dr");
  const n = params.get("n");
  if (th && SHORT_TO_THEME[th]) result.theme = SHORT_TO_THEME[th];
  if (dd && SHORT_TO_DATE_MODE[dd]) result.defaultDateMode = SHORT_TO_DATE_MODE[dd];
  if (dv && SHORT_TO_LANDING[dv]) result.defaultLandingView = SHORT_TO_LANDING[dv];
  if (dr && SHORT_TO_RATINGS[dr]) result.defaultRatings = SHORT_TO_RATINGS[dr];
  if (n && SHORT_TO_SPORT[n]) result.newsThirdLeague = SHORT_TO_SPORT[n];
  return result;
}

export interface Preferences {
  favoriteLeagues: Sport[]; // ordered by priority (first = highest)
  favoriteTeams: string[]; // team IDs, ordered by priority (first = highest)
  theme: Theme;
  showRatings: boolean;
  skipExplainer: boolean;
  skipNewsExplainer: boolean;
  showNews: boolean; // persist last view across refreshes
  // "empty" hides the slot (no league rendered for that column).
  thirdLeague?: Sport | "empty"; // user-chosen 3rd league slot override
  firstLeague?: Sport | "empty"; // user-chosen 1st league slot override
  secondLeague?: Sport | "empty"; // user-chosen 2nd league slot override
  newsThirdLeague?: Sport; // user-chosen league for news col 3 (undefined = top headlines)
  // Default date on launch: smart (yesterday before 1 PM ET, today after),
  // always today, or always yesterday.
  defaultDateMode?: DefaultDateMode;
  // Landing view on launch: remember last (default), always scores, always news.
  defaultLandingView?: DefaultLandingView;
  // Ratings on launch: auto (smart morning reset), always off, always on.
  defaultRatings?: DefaultRatings;
}

const defaults: Preferences = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: false,
  skipNewsExplainer: false,
  showNews: false,
  defaultDateMode: "smart",
  defaultLandingView: "remember",
  defaultRatings: "auto",
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function savePreferences(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
