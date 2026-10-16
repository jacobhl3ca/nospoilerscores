// "Playoff race tags" in Settings, as a tiny store a card can subscribe to.
// preferences.ts pushes the pref here on load and save (the same path as
// setListenPrefs), so GameCard reads it without a prop. Own leaf module so
// preferences.ts does not pull in the fetch code in usePlayoffRace.ts.

let enabled = true;
const listeners = new Set<() => void>();

export function setPlayoffRacePrefs(hidePlayoffRaceTags: boolean | undefined): void {
  const next = !hidePlayoffRaceTags;
  if (next === enabled) return;
  enabled = next;
  for (const l of listeners) l();
}

export function subscribePlayoffRacePrefs(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function playoffRaceTagsOn(): boolean {
  return enabled;
}
