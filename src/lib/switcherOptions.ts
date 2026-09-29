import type { Sport } from "./types";

// The column switcher dropdown lists what is playing: in-season leagues and
// upcoming ones (with their date tail). Offseason rows moved to the "Add
// more…" modal behind its "Show offseason leagues" toggle (Jacob 9/29), so the
// short list is all live choices. The column's own league stays even when it
// is offseason, so the current pick is always visible in the list.
export function inSeasonSwitcherOptions<T extends { sport: Sport; offseason?: boolean }>(
  options: readonly T[],
  selected: Sport | undefined,
): T[] {
  return options.filter((o) => !o.offseason || o.sport === selected);
}
