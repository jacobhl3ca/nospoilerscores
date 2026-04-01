import { Sport } from "./types";

const STORAGE_KEY = "nss-preferences";

export type Theme = "dark" | "light" | "system";

export interface Preferences {
  favoriteLeagues: Sport[]; // ordered by priority (first = highest)
  favoriteTeams: string[]; // team IDs, ordered by priority (first = highest)
  theme: Theme;
  showRatings: boolean;
}

const defaults: Preferences = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
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
