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
  // Before 1 AM local → still count as the previous day. % 24 guards the "24"
  // some ICU builds emit for midnight (same guard as etSlateYmd); without it a
  // "24" hour skips the rollback and drifts the service day vs. the date nav
  // between midnight and 1 AM — the exact disagreement this file prevents.
  if (parseInt(get("hour"), 10) % 24 < 1) d.setDate(d.getDate() - 1);
  return d;
}

// A local Date → YYYYMMDD using its local Y/M/D (the Date returned above is at
// local midnight of the ET service day, so its local components ARE that day).
export function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// YYYYMMDD → the next calendar day's YYYYMMDD. UTC math so it never trips on a
// DST transition in the local zone.
export function nextYmd(ymd: string): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// The "slate day" a fixture belongs to: its kickoff bucketed to a YYYYMMDD in
// the effective time zone, using the SAME 1 AM rollover as getEtServiceDate.
// A game kicking off before 1 AM local counts as the PREVIOUS day's slate — so
// a western-US World Cup night match starting 9 PM PT (= 12 AM ET) shows under
// last night, not today, matching where "today/yesterday" put the boundary.
// ESPN buckets such a game under its raw calendar day, so the data layer has to
// re-bucket with this to agree with the date nav (see fetchGames' soccer path).
export function etSlateYmd(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getTimeZone(),
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const d = new Date(parseInt(get("year"), 10), parseInt(get("month"), 10) - 1, parseInt(get("day"), 10));
  // % 24 guards the "24" some ICU builds emit for midnight; < 1 → previous day.
  if (parseInt(get("hour"), 10) % 24 < 1) d.setDate(d.getDate() - 1);
  return toYmd(d);
}
