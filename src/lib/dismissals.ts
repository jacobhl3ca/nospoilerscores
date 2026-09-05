// Cross-device merge rules for the "I dismissed that" preferences.
//
// The account copy of prefs is last-write-wins on the whole blob, and the
// launch reconcile runs 1-3 s after first paint. A banner dismissed in that
// window (the kickoff banner is the first thing on screen, and ✕ is one tap)
// was written locally, pushed, and then OVERWRITTEN when the in-flight pull
// returned the server's older list — so the banner came straight back
// (Jacob 9/4: "UCL kicks off popup got weirdly ... after I already got first
// time"). Two of 68 dismissing sessions in the last 40 days dismissed the same
// banner twice. A dismissal is a fact that only ever accumulates, so the
// merge for these keys is a union, never a pick.
//
// Pure + import-free so `node --experimental-strip-types` can test it.

export const KICKOFF_DISMISSALS_CAP = 12;

export function mergeDismissedKeys(
  local: string[] | undefined,
  remote: string[] | undefined,
  cap = KICKOFF_DISMISSALS_CAP,
): string[] | undefined {
  if (!local?.length && !remote?.length) return undefined;
  const merged: string[] = [];
  for (const key of [...(remote ?? []), ...(local ?? [])]) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged.slice(-cap);
}

// A snooze is a date; whichever device snoozed for longer wins.
export function mergeSnoozedUntil(local: string | undefined, remote: string | undefined): string | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return local > remote ? local : remote;
}

// YYYYMMDD arithmetic without a Date round-trip through local time.
export function addDaysYmd(ymd: string, days: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}
