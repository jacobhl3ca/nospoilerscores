// League-wide recap series + the pure helpers behind bakeLeagueRecaps() in
// scripts/prebake-news.mjs. Kept out of the prebake so tests/recaps.test.ts can
// import them without running the bake (the prebake executes on import).
//
// A "recap" here is the recurring LEAGUE-WIDE cut, not a per-game highlight:
// NFL "Top 15 Plays From Week N", MLB FastCast / Real Fast, NBA "Top 10 Plays
// of the Night", EPL / MLS "Every goal". The card that renders them
// (src/components/LeagueRecapCard.tsx) sits on top of each league column on
// past-date boards. Every regex here is gated on the uploader too — the bake
// confirms the oEmbed author before it writes an id — because the same title
// shape shows up on fan re-uploads.
//
// ⚠️ Titles spoil ("WALK-OFF WEEKEND in Cleveland…"). Nothing that flows out of
// here into recaps.json carries a title or a thumbnail; the record is a label,
// an id and a window. See stripRecapRecord().

export const RECAP_OUT_NAME = "recaps";
export const RECAP_TTL_DAYS = 21;

// Per sport, in the order the buttons should be tried. `heading` is what the
// card prints on the left; `label` is the button's title/aria-label. `{n}` is
// the week / matchweek / matchday from the title.
//
// `searchQuery` feeds the channel-scoped results page
// (youtube.com/@<handle>/search?query=) — the RSS feed (10 newest uploads) is
// only a cheap first pass because the league-wide cut is buried under per-game
// uploads within hours on the NFL / MLB / MLS channels.
const NFL_WEEK_RX = /\bWeek (\d{1,2})\b/i;
const NFL_SEASON_RX = /\b(\d{4}) NFL Season\b/i;

export const RECAP_SERIES = {
  // The NFL titles the week and the season in either order ("Top 15 Plays From
  // Week 1 | 2025 NFL Season", "Best Plays From Sunday! | 2026 NFL Season Week
  // 1"), so the week and season are pulled by their own regexes rather than by
  // position. ⚠️ Last season's Week 1 sits in the same results: every NFL
  // series REQUIRES the season token and the bake compares it to ESPN's season
  // year. A postseason cut ("TOP 15 Plays of Wild Card Weekend") has no week
  // and is left out on purpose.
  nfl: [
    {
      key: "top15", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n} top plays", label: "Top 15 plays",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Top 15 Plays (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Top 15 Plays From Week",
    },
    {
      key: "everytd", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n} top plays", label: "Every touchdown",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Every Touchdown (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Every Touchdown From Week",
    },
    {
      key: "topplays", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n} top plays", label: "Top plays, full",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Top Plays (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Top Plays From Week",
    },
    // New for 2026: the Sunday-slate cut, up Monday morning — a day and a half
    // before the Top 15, so it is what the Monday /yesterday board shows.
    {
      key: "bestsunday", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n} top plays", label: "Sunday's best plays",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Best Plays From Sunday!?\s*\|/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Best Plays From Sunday",
    },
  ],
  mlb: [
    {
      key: "fastcast", enabled: true, source: "mlbcom", cadence: "daily",
      heading: "Best of the day", label: "Best of the day",
      topicUrl: "https://www.mlb.com/video/topic/fastcast",
      slugRx: /^fastcast-(\w+?)-s-best-in-15-minutes/i, weekdayGroup: 1,
    },
    {
      key: "realfast", enabled: true, source: "mlbcom", cadence: "daily",
      heading: "Best of the day", label: "60 seconds",
      topicUrl: "https://www.mlb.com/video/topic/real-fast",
      slugRx: /^real-fast-(\w+?)-s-best-in-60-seconds/i, weekdayGroup: 1,
    },
    // YouTube stand-in for a day mlb.com has no cut for. Only written when no
    // mlb.com record covers the same date (see bakeLeagueRecaps).
    {
      key: "morninglineup", enabled: true, source: "youtube", cadence: "daily", fallbackOnly: true,
      heading: "Best of the day", label: "Daily recap",
      channelId: "UCoLrcjPV5PbUrUyXq5mjc_A", channelName: "MLB", handle: "MLB",
      titleRx: /Morning Lineup.*MLB Daily Recap/i,
      searchQuery: "Morning Lineup MLB Daily Recap",
    },
  ],
  nba: [
    {
      key: "top10", enabled: true, source: "youtube", cadence: "daily",
      heading: "Top 10 plays of the night", label: "Top 10 plays of the night",
      channelId: "UCWJ2lWNubArHWmf3FIHbfcQ", channelName: "NBA", handle: "NBA",
      // The date in the title is the games' date.
      titleRx: /^NBA'?s Top (?:5|10) Plays [Oo]f [Tt]he Night \| (\w+ \d{1,2}, \d{4})$/i,
      dateGroup: 1,
      searchQuery: "Top 10 Plays of the Night",
    },
  ],
  epl: [
    {
      key: "everygoal", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Every goal, Matchweek {n}", label: "Every goal, 4 minutes",
      channelId: "UCG5qGWdu8nIRZqJ_GgDwQ-w", channelName: "Premier League", handle: "premierleague",
      titleRx: /^EVERY Weekend Goal \| Matchweek (\d{1,2})/i, weekGroup: 1,
      searchQuery: "EVERY Weekend Goal Matchweek",
    },
    {
      key: "everygoalnbc", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Every goal, Matchweek {n}", label: "Every goal, full",
      channelId: "UCqZQlzSHbVJrwrn5XvzrzcA", channelName: "NBC Sports", handle: "NBCSports",
      // NBC stamps the season "(2026-27)"; required, and checked against the
      // season that is running (see eplSeasonYear) so last season's Matchweek
      // 38 can never outrank this season's Matchweek 3.
      titleRx: /Every Premier League goal from Matchweek (\d{1,2})/i, weekGroup: 1,
      seasonRx: /\((\d{4})-\d{2,4}\)/, seasonRequired: true,
      searchQuery: "Every Premier League goal from Matchweek",
    },
  ],
  mls: [
    {
      key: "everygoal", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Every goal, Matchday {n}", label: "Every goal",
      channelId: "UCSZbXT5TLLW_i-5W8FZpFsg", channelName: "Major League Soccer", handle: "MLS",
      // Unanchored: MLS varies the lead-in ("Watch Every Goal from Matchday 25!").
      titleRx: /\bEvery Goal From Matchday (\d{1,2})\b/i, weekGroup: 1,
      searchQuery: "Every Goal From Matchday",
    },
  ],
  // No branded nightly series found in the 2026 offseason. Revisit in October.
  nhl: [
    {
      key: "topplays", enabled: false, source: "youtube", cadence: "daily",
      heading: "Top plays of the night", label: "Top plays of the night",
      channelId: "UCqFMzb-4AUf6WAIbl132QKA", channelName: "NHL", handle: "NHL",
      titleRx: /^Top (?:5|10) Plays (?:of|from) the Night/i,
      searchQuery: "Top Plays of the Night",
    },
  ],
  // ESPN College Football has no all-in-one weekly cut; B/R's "Best of Week N"
  // is third-party.
  ncaaf: [],
};

// ── Text parsing ─────────────────────────────────────────────────────────────

// "8:01" → 481, "1:02:03" → 3723. null for anything else.
export function parseLengthText(text) {
  const parts = String(text ?? "").trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
}

// ISO 8601 duration ("PT10M32S", mlb.com's "P0Y0M0DT0H15M0S") → seconds. null
// when unparseable. Years / months are ignored (no video runs that long).
export function isoDurationToSec(iso) {
  const m = String(iso ?? "").match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m || m.slice(1).every((g) => g === undefined)) return null;
  const [, , d, h, min, s] = m.slice(1).map((g) => (g === undefined ? 0 : parseFloat(g)));
  return Math.round(d * 86400 + h * 3600 + min * 60 + s);
}

// YouTube's "2 days ago" / "3 weeks ago" / "1 hour ago" / "Streamed 4 days ago"
// → an approximate publish timestamp (ms). null when it does not parse.
export function parseRelativeTime(text, nowMs = Date.now()) {
  const m = String(text ?? "").match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = { second: 1000, minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 }[m[2].toLowerCase()];
  return nowMs - n * unit;
}

// A YouTube results / channel-search page → the videoRenderer blocks. Same
// split the worker uses (public/_worker.js, the /api/youtube route), plus the
// two fields the recap lookout needs that nothing parsed before: the length
// badge and the relative publish time.
export function parseYtVideoRenderers(html) {
  const out = [];
  const seen = new Set();
  for (const block of String(html ?? "").split('"videoRenderer":{').slice(1)) {
    const idMatch = block.match(/^"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);
    const titleMatch = block.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"\}/);
    const channelMatch = block.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
    // The accessibility label sits between the key and simpleText:
    // "lengthText":{"accessibility":{"accessibilityData":{"label":"5 minutes, 9 seconds"}},"simpleText":"5:09"}
    const lengthMatch = block.match(/"lengthText":\{[\s\S]{0,300}?"simpleText":"([\d:]+)"/);
    const publishedMatch = block.match(/"publishedTimeText":\{"simpleText":"((?:[^"\\]|\\.)*)"/);
    const unescape = (s) => {
      try { return JSON.parse(`"${s}"`); } catch { return s; }
    };
    out.push({
      videoId: idMatch[1],
      title: titleMatch ? unescape(titleMatch[1]) : "",
      channel: channelMatch ? unescape(channelMatch[1]) : "",
      lengthText: lengthMatch ? lengthMatch[1] : null,
      durationSec: lengthMatch ? parseLengthText(lengthMatch[1]) : null,
      publishedTimeText: publishedMatch ? unescape(publishedMatch[1]) : null,
    });
  }
  return out;
}

// "lengthSeconds":"596" from a watch page's ytInitialPlayerResponse.
export function parseWatchPageLengthSeconds(html) {
  const m = String(html ?? "").match(/"lengthSeconds":"(\d+)"/);
  return m ? parseInt(m[1], 10) : null;
}

// "publishDate":"2026-03-27T04:30:00-07:00" (microformat) → ms. The results
// page sometimes omits a card's age; the watch page never does.
export function parseWatchPagePublishMs(html) {
  const m = String(html ?? "").match(/"(?:publishDate|uploadDate)":"([^"]+)"/);
  if (!m) return null;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : null;
}

// ── Dates (all YYYYMMDD, ET) ─────────────────────────────────────────────────

const ET = "America/New_York";

export function etYmd(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, "");
}

export function etHour(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return NaN;
  return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "2-digit", hour12: false }).format(d), 10) % 24;
}

// YYYYMMDD ± days. Noon UTC so DST never shifts the calendar day.
export function shiftYmd(ymd, days) {
  const m = String(ymd ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// 0 = Sunday … 6 = Saturday, for a YYYYMMDD.
export function ymdWeekday(ymd) {
  const m = String(ymd ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return NaN;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay();
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// A daily cut that names no date covers the previous ET day when it posted
// before 14:00 ET (the morning-after roundup), else the day it posted.
export function dailyCoversDate(publishedIso) {
  const day = etYmd(publishedIso);
  if (!day) return "";
  const hour = etHour(publishedIso);
  return hour < 14 ? shiftYmd(day, -1) : day;
}

// "Oct 23, 2026" (the NBA title date) → "20261023".
export function titleDateToYmd(text) {
  const m = String(text ?? "").match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return "";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const idx = months.indexOf(m[1].slice(0, 3).toLowerCase());
  if (idx < 0) return "";
  return `${m[3]}${String(idx + 1).padStart(2, "0")}${m[2].padStart(2, "0")}`;
}

// MLB's slug names the WEEKDAY ("fastcast-saturday-s-best-in-15-minutes-x6640"),
// never the date → the most recent ET day ≤ today with that weekday.
export function weekdayCoversDate(weekday, todayYmd) {
  const target = WEEKDAYS.indexOf(String(weekday ?? "").toLowerCase());
  if (target < 0 || !/^\d{8}$/.test(String(todayYmd))) return "";
  const back = (ymdWeekday(todayYmd) - target + 7) % 7;
  return shiftYmd(todayYmd, -back);
}

// EPL / MLS post the week's "every goal" on the closing Sunday: the cut covers
// the six days before it and the day itself.
export function weeklyWindowFromPublished(publishedYmd) {
  if (!/^\d{8}$/.test(String(publishedYmd))) return null;
  return { windowStart: shiftYmd(publishedYmd, -6), windowEnd: publishedYmd };
}

// NFL: first to last ET game day of the week per the ESPN scoreboard, extended
// to the day before the next week's first game so the card follows the
// "Last played" slate through the Tue/Wed the cut actually posts on.
export function nflWeekWindow(weekEvents, nextWeekEvents) {
  const days = (weekEvents ?? []).map((e) => etYmd(e?.date)).filter(Boolean).sort();
  if (!days.length) return null;
  const nextDays = (nextWeekEvents ?? []).map((e) => etYmd(e?.date)).filter(Boolean).sort();
  const windowEnd = nextDays.length ? shiftYmd(nextDays[0], -1) : days[days.length - 1];
  return { windowStart: days[0], windowEnd: windowEnd < days[days.length - 1] ? days[days.length - 1] : windowEnd };
}

// ── Candidate pick ───────────────────────────────────────────────────────────

// The European season that is running on an ET date: it starts in August, so
// July onward is the year itself, before that the year before. "(2026-27)" on
// a title → 2026.
export function eplSeasonYear(input = new Date()) {
  const ymd = etYmd(input);
  if (!ymd) return null;
  const y = parseInt(ymd.slice(0, 4), 10);
  const m = parseInt(ymd.slice(4, 6), 10);
  return m >= 7 ? y : y - 1;
}

// Apply a series' title regex + uploader gate to one candidate. Returns the
// parsed facts or null. `seasonYear` is ESPN's current season year; a series
// with a season token in its title must match it (last season's Week 1 is in
// the same results).
export function matchSeriesTitle(series, candidate, { seasonYear } = {}) {
  if (!candidate?.videoId || !candidate.title) return null;
  if (series.channelName && candidate.channel && candidate.channel.toLowerCase() !== series.channelName.toLowerCase()) return null;
  const m = candidate.title.match(series.titleRx);
  if (!m) return null;
  const weekM = series.weekRx ? candidate.title.match(series.weekRx) : null;
  const week = weekM ? parseInt(weekM[1], 10) : series.weekGroup ? parseInt(m[series.weekGroup], 10) : null;
  if ((series.weekRx || series.weekGroup) && !Number.isFinite(week)) return null;
  const seasonM = series.seasonRx ? candidate.title.match(series.seasonRx) : null;
  const season = seasonM ? parseInt(seasonM[1], 10) : series.seasonGroup && m[series.seasonGroup] ? parseInt(m[series.seasonGroup], 10) : null;
  // A title whose season token disagrees is last season's cut. A title with
  // no season token is rejected when the series requires one; without a
  // known seasonYear (ESPN down) a required token is still required.
  if (series.seasonRequired && !season) return null;
  if (season && seasonYear && season !== seasonYear) return null;
  const titleDate = series.dateGroup ? titleDateToYmd(m[series.dateGroup]) : "";
  if (series.dateGroup && !titleDate) return null;
  return { videoId: candidate.videoId, week, season, titleDate, durationSec: candidate.durationSec ?? null, publishedMs: candidate.publishedMs ?? null };
}

// Newest first. Publish DAY leads (exact from RSS, approximate from the
// results page's "2 days ago"), because a week number alone spans seasons —
// the first live run ranked 2025's "Matchday 31" over 2026's "Matchday 25" and
// last season's EPL "Matchweek 38" over this season's "Matchweek 3". Within
// the same day: highest week, then latest title date. YouTube's "sort by date"
// param is ignored without cookies, so page order is never trusted.
export function pickNewest(matches) {
  const list = (matches ?? []).filter(Boolean);
  if (!list.length) return null;
  const day = (m) => (Number.isFinite(m.publishedMs) ? Math.floor(m.publishedMs / 86400e3) : null);
  return [...list].sort((a, b) => {
    const da = day(a);
    const db = day(b);
    // A candidate with no readable age never outranks one with an age: the
    // results page occasionally omits publishedTimeText on one card, and
    // "unknown age, Matchweek 38" is last season, not newer than "7 days ago,
    // Matchweek 3" (the third live run).
    if (da === null && db !== null) return 1;
    if (da !== null && db === null) return -1;
    if (da !== null && db !== null && da !== db) return db - da;
    if ((b.week ?? -1) !== (a.week ?? -1)) return (b.week ?? -1) - (a.week ?? -1);
    if ((b.titleDate ?? "") !== (a.titleDate ?? "")) return (b.titleDate ?? "") > (a.titleDate ?? "") ? 1 : -1;
    return (b.publishedMs ?? 0) - (a.publishedMs ?? 0);
  })[0];
}

// ── Record shape ─────────────────────────────────────────────────────────────

// The only keys that may reach recaps.json. Titles, headlines, thumbnails and
// channel headlines are dropped here whatever the fetch helpers returned.
const RECORD_KEYS = [
  "sport", "key", "heading", "label", "cadence", "coversDate", "coversWeek",
  "windowStart", "windowEnd", "videoId", "playbackUrl", "poster", "pageUrl",
  "channel", "durationSec", "published", "t", "sourcePolicy",
];

export function stripRecapRecord(rec) {
  const out = {};
  for (const k of RECORD_KEYS) {
    if (rec?.[k] !== undefined && rec[k] !== null && rec[k] !== "") out[k] = rec[k];
  }
  return out;
}

export function fillHeading(template, n) {
  return String(template ?? "").replace("{n}", n == null ? "" : String(n)).replace(/\s+/g, " ").trim();
}

// Is `ymd` inside this record's coverage?
export function recapCoversDay(rec, ymd) {
  if (!rec || !/^\d{8}$/.test(String(ymd))) return false;
  if (rec.cadence === "weekly") return !!rec.windowStart && !!rec.windowEnd && rec.windowStart <= ymd && ymd <= rec.windowEnd;
  return rec.coversDate === ymd;
}

// ── NFL club short cut (section 5 of the plan) ───────────────────────────────

// Two clubs can each post a package for the same game; keep the shorter one.
// Unknown durations lose to known ones; a tie keeps the first (home) club.
export function pickShorterClub(candidates) {
  const list = (candidates ?? []).filter((c) => c?.videoId);
  if (!list.length) return null;
  return list.reduce((best, c) => {
    if (!best) return c;
    const a = Number.isFinite(best.durationSec) ? best.durationSec : Infinity;
    const b = Number.isFinite(c.durationSec) ? c.durationSec : Infinity;
    return b < a ? c : best;
  }, null);
}
