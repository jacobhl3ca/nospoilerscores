import type { Sport } from "./types";

// The Add more… sheet's "Previously removed" group (Jacob 10/8): the leagues
// taken out of the switcher, newest first. Its own file so the unit test can
// load it without the rest of preferences.ts.
export const REMOVED_LEAGUES_CAP = 20;

// Record a removal: the picked leagues first, then the older entries, one per
// league, capped.
export function noteRemoved(list: Sport[] | undefined, sports: Sport[]): Sport[] {
  const out: Sport[] = [];
  for (const s of [...sports, ...(list ?? [])]) {
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, REMOVED_LEAGUES_CAP);
}

// The league is back in the list: drop it. undefined when nothing is left, so
// the saved prefs carry no empty array.
export function dropRemoved(list: Sport[] | undefined, sport: Sport): Sport[] | undefined {
  const out = (list ?? []).filter((s) => s !== sport);
  return out.length ? out : undefined;
}
