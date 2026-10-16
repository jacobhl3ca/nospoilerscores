// The day News is "safe" for (Jacob 10/10). An ESPN front page label's News button asks
// "are you sure" only while it is still early: before the Settings cutoff hour
// (smartCutoffHour, the "yesterday → today" switch) AND nothing today has
// shown he is already past spoilers. Any of these marks the day:
//   - News open more than 5 s,
//   - a highlight played,
//   - he pressed "Open News" in the confirm.
// One localStorage key, the service day as YYYYMMDD (getDateString(0)), so the
// record lapses on its own at the next day's rollover. No imports: the unit
// test runs this file under plain node.

export const NEWS_OK_DAY_KEY = "nss-news-ok-day";

export function readNewsOkDay(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(NEWS_OK_DAY_KEY);
  } catch {
    return null;
  }
}

export function markNewsOkDay(today: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(NEWS_OK_DAY_KEY, today);
  } catch {
    // Private mode / storage full: the confirm just asks again.
  }
}

// Pure. `hour` = the current hour in the user's zone (getETHour), `today` =
// getDateString(0), `okDay` = readNewsOkDay().
export function newsNeedsConfirm(hour: number, cutoffHour: number, okDay: string | null, today: string): boolean {
  return hour < cutoffHour && okDay !== today;
}
