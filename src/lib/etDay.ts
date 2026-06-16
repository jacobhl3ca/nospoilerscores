// The effective IANA time zone for ALL date bucketing and time display. It
// defaults to the device's own zone (so behavior is unchanged out of the box),
// and the Settings "Time zone" picker overrides it. Stored as a module-level
// variable — NOT React state — so the non-React data layer (espn.ts) reads the
// exact same zone the UI does. loadPreferences()/savePreferences() push the
// user's choice in via setServiceTimeZone(), so it tracks the active prefs.
let overrideTz: string | undefined;

export function setServiceTimeZone(tz: string | undefined): void {
  overrideTz = tz || undefined;
}

export function getTimeZone(): string {
  if (overrideTz) return overrideTz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

// Canonical "service day" — the calendar day the app treats as "today" — in the
// effective time zone (see getTimeZone). The day does NOT roll over until 1 AM
// local, so a game that runs past midnight stays on "today" instead of jumping
// to "yesterday".
//
// SINGLE SOURCE OF TRUTH. Both the date-nav UI (getNowET in DateNav) and the
// data layer's past/future boundary (fetchLeagues' todayYmd in espn.ts) derive
// "today" from here, so they cannot disagree. They used to each compute it
// independently and drifted: the UI applied the 1 AM shift, the data layer did
// not. Between midnight and 1 AM the UI's default date was still yesterday
// while the data boundary had already advanced to the new calendar day, so the
// data layer treated the UI's "today" as PAST — it skipped the next-game
// lookahead and the column rendered "Upcoming Schedule TBD" with a stale "last
// played" subtitle even though the next game was scheduled (Jacob 6/13).
export function getEtServiceDate(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getTimeZone(),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const d = new Date(parseInt(get("year"), 10), parseInt(get("month"), 10) - 1, parseInt(get("day"), 10));
  // Before 1 AM local → still count as the previous day.
  if (parseInt(get("hour"), 10) < 1) d.setDate(d.getDate() - 1);
  return d;
}

// A local Date → YYYYMMDD using its local Y/M/D (the Date returned above is at
// local midnight of the ET service day, so its local components ARE that day).
export function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
