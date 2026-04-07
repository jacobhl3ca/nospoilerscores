import { Sport } from "./types";

const STORAGE_KEY = "nss-preferences";

// Compact encoding for share URLs: mlb→m, nba→n, ncaam→c, nhl→h, nfl→f, golf→g, tennis→t, fifa→w
const SPORT_TO_SHORT: Record<Sport, string> = { mlb: "m", nba: "n", ncaam: "c", nhl: "h", nfl: "f", golf: "g", tennis: "t", fifa: "w", epl: "e" };
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

// Encode: ["mlb-1","nba-15"] → "m1.n15"
export function encodeFavorites(teams: string[], leagues: Sport[]): URLSearchParams {
  const params = new URLSearchParams();
  if (teams.length > 0) params.set("f", teams.map(encodeTeamId).join("."));
  if (leagues.length > 0) params.set("l", leagues.map((s) => SPORT_TO_SHORT[s] ?? s).join("."));
  return params;
}

// Decode: "m1.n15" → ["mlb-1","nba-15"]
export function decodeFavorites(params: URLSearchParams): { teams?: string[]; leagues?: Sport[] } {
  const result: { teams?: string[]; leagues?: Sport[] } = {};
  const f = params.get("f");
  const l = params.get("l");
  if (f) result.teams = f.split(".").map(decodeTeamId).filter(Boolean);
  if (l) result.leagues = l.split(".").map((s) => SHORT_TO_SPORT[s]).filter(Boolean) as Sport[];
  return result;
}

export type Theme = "dark" | "light" | "system";

export interface Preferences {
  favoriteLeagues: Sport[]; // ordered by priority (first = highest)
  favoriteTeams: string[]; // team IDs, ordered by priority (first = highest)
  theme: Theme;
  showRatings: boolean;
  skipExplainer: boolean;
}

const defaults: Preferences = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: false,
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
