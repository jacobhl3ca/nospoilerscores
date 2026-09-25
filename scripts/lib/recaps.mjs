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

// 20260924 → "9-24-26-top-5-plays-of-the-day" (no leading zeros).
export function top5SlugForDate(ymd) {
  const m = String(ymd ?? "").match(/^\d{2}(\d{2})(\d{2})(\d{2})$/);
  if (!m) return "";
  return `${+m[2]}-${+m[3]}-${m[1]}-top-5-plays-of-the-day`;
}

// The round-ups only: "Oddities of the Week: 9/23/26", "Oddities of the Month:
// September", "Oddities of the Wild Card round", "Oddities of the 2025 World
// Series". Single clips ("Christian Yelich loses bat on swing") and the
// winter "Stats & Oddities of 2025: Rays" series do not start this way.
export const ODDITIES_ROUNDUP_RX = /^Oddities of the\b/i;

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
      heading: "Week {n}", label: "Top 15 plays",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Top 15 Plays (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Top 15 Plays From Week",
    },
    {
      key: "everytd", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n}", label: "Every touchdown",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Every Touchdown (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Every Touchdown From Week",
    },
    {
      key: "topplays", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n}", label: "Top plays, full",
      channelId: "UCDVYQ4Zhbm3S2dlz7P1GBDg", channelName: "NFL", handle: "NFL",
      titleRx: /^Top Plays (?:From|of) Week \d{1,2}\b/i,
      weekRx: NFL_WEEK_RX, seasonRx: NFL_SEASON_RX, seasonRequired: true,
      searchQuery: "Top Plays From Week",
    },
    // New for 2026: the Sunday-slate cut, up Monday morning — a day and a half
    // before the Top 15, so it is what the Monday /yesterday board shows.
    {
      key: "bestsunday", enabled: true, source: "youtube", cadence: "weekly",
      heading: "Week {n}", label: "Sunday's best plays",
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
    // "Top 5 Plays of the Day", 60s, up about 2–3 am ET the next morning. It
    // runs every game day through the World Series (2025 Film Room archive).
    // No topic page lists it, but its slug is the games' date, so each recent
    // day is fetched by name. `extra`: never stands in for FastCast, so it does
    // not hold back the Morning Lineup fallback.
    {
      key: "top5", enabled: true, source: "mlbcom", cadence: "daily", extra: true,
      heading: "Best of the day", label: "Top 5 plays of the day",
      slugForDate: top5SlugForDate,
    },
    // MLB's oddity round-ups: "Oddities of the Week: 9/23/26" (Wednesdays),
    // "… of the Month", and in October one per playoff round. Listed by the
    // Film Room `oddities` tag, which also holds the single clips — the title
    // regex keeps the round-ups only. A round-up covers no single day, so it
    // sits on the board of the ET day it was posted, which only shows it once
    // that day is over (selectRecaps' premature gate).
    {
      key: "oddities", enabled: true, source: "mlbcom", cadence: "daily", extra: true,
      heading: "Best of the day", label: "Oddities",
      filmRoomTag: "oddities", filmRoomTitleRx: ODDITIES_ROUNDUP_RX,
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
// YouTube also serves the short form ("5d ago", "11d ago", "2w ago", "8mo
// ago", "1y ago", "Streamed 8mo ago") — measured on the mini's search pages
// 2026-09-25, where it was the ONLY form served, so the long-form-only regex
// read every card's age as null. "mo" is months, a bare "m" is minutes.
const RELATIVE_UNIT_MS = {
  s: 1000, m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, mo: 30 * 86400e3, y: 365 * 86400e3,
};
export function parseRelativeTime(text, nowMs = Date.now()) {
  const str = String(text ?? "");
  const long = str.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (long) {
    const unit = { second: "s", minute: "m", hour: "h", day: "d", week: "w", month: "mo", year: "y" }[long[2].toLowerCase()];
    return nowMs - parseInt(long[1], 10) * RELATIVE_UNIT_MS[unit];
  }
  const short = str.match(/(?<![a-z0-9])(\d+)\s*(mo|s|m|h|d|w|y)\s+ago\b/i);
  if (!short) return null;
  return nowMs - parseInt(short[1], 10) * RELATIVE_UNIT_MS[short[2].toLowerCase()];
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
//
// YouTube serves SOME clients a watch page that carries neither microformat
// key, and which variant you get is intermittent — the same id read minutes
// apart, same UA, flips. Measured on the mini 2026-09-20 over a 10-video
// sweep: 0 pages carried uploadDate, 10 carried "dateText". A null here reads
// as a PASS in uploadFitsGameDate, so without the fallback the age gate kept
// 93 wrong-season videos and logged nothing.
//
// ⛔ Do NOT read "publishedTimeText" off a WATCH page — it belongs to a
// RECOMMENDED video ("25 minutes ago" sitting beside a February upload). It is
// this video's own age only inside a videoRenderer on a SEARCH page, which is
// where parseYtVideoRenderers already reads it.
const WATCH_DATE_TEXT_PREFIX = /^(?:Premiered|Streamed live on|Started streaming on)\s+/i;
export function parseWatchPagePublishMs(html) {
  const str = String(html ?? "");
  const m = str.match(/"(?:publishDate|uploadDate)":"([^"]+)"/);
  if (m) {
    const ms = Date.parse(m[1]);
    if (Number.isFinite(ms)) return ms;
  }
  const d = str.match(/"dateText":\{"simpleText":"((?:[^"\\]|\\.)*)"/);
  if (!d) return null;
  let text = d[1];
  try { text = JSON.parse(`"${d[1]}"`); } catch { /* keep the raw capture */ }
  const ms = Date.parse(text.replace(WATCH_DATE_TEXT_PREFIX, "").trim());
  return Number.isFinite(ms) ? ms : null;
}

// Upload-date window for a game highlight. A recap posts AFTER the final
// whistle, never before it, and a league that re-cuts a game does so within a
// fortnight. Two days of slack on the early side absorbs the gap between the
// game's ET calendar date and the uploader's own timezone; fourteen on the
// late side lets a delayed or re-uploaded cut through.
// This is the only signal that separates two meetings of the same fixture in
// different seasons: ESPN FC / CBS / MLS / Serie A recap titles carry no date
// and no year, so the team, competition and week checks all pass for last
// season's clip.
// An unknown upload time (a failed fetch) reads as a PASS — a network blip
// must never drop a good highlight.
export const HL_UPLOAD_WINDOW_EARLY_MS = 2 * 24 * 60 * 60 * 1000;
export const HL_UPLOAD_WINDOW_LATE_MS = 14 * 24 * 60 * 60 * 1000;
export function uploadFitsGameDate(publishedMs, gameMs) {
  if (!Number.isFinite(publishedMs) || !Number.isFinite(gameMs)) return true;
  return publishedMs >= gameMs - HL_UPLOAD_WINDOW_EARLY_MS
    && publishedMs <= gameMs + HL_UPLOAD_WINDOW_LATE_MS;
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

// The ET day a week's main slate falls on — the Sunday. Counting games is the
// discriminator, not the calendar: Thursday and Monday night carry one game
// each while the Sunday carries a dozen, and a flexed or international kickoff
// moves the date without moving the slate. Earliest day wins a tie (the Map
// keeps the sorted insertion order).
function mainSlateDay(events) {
  const counts = new Map();
  for (const d of (events ?? []).map((e) => etYmd(e?.date)).filter(Boolean).sort()) {
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let main = "";
  for (const [d, n] of counts) if (!main || n > counts.get(main)) main = d;
  return main;
}

// NFL: the completed week's cut belongs on EVERY board except the next
// football Sunday (Jacob 9/20 — "if its football sunday dont need the weeks
// highlights left, but every other day of week that previous weeks
// highlights"). So the window runs from the week's first ET game day out to
// the day before the slate AFTER next, and names next week's Sunday as the one
// day it skips. Two consequences worth keeping straight:
//
//   • The reach past next week's Sunday is what closes the Monday gap. Week N+1
//     is played by then but its cut does not post until Monday night at the
//     earliest, so without the overshoot Monday shows nothing at all. Once the
//     newer cut does land, selectRecaps' latest-week rule takes every
//     overlapping day off this record — the overshoot is a floor, not a claim.
//   • skipDays is one day, not "every Sunday". A past Sunday still shows the
//     cut for the week it belongs to, which is exactly what Jacob asked for
//     when he said yesterday's board keeps the card.
//
// No next week on the scoreboard (the regular season's last week) → the window
// ends on the week's own last game day, as before.
export function nflWeekWindow(weekEvents, nextWeekEvents, weekAfterEvents) {
  const days = (weekEvents ?? []).map((e) => etYmd(e?.date)).filter(Boolean).sort();
  if (!days.length) return null;
  const last = days[days.length - 1];
  const nextMain = mainSlateDay(nextWeekEvents);
  const afterMain = mainSlateDay(weekAfterEvents);
  const horizon = afterMain ? shiftYmd(afterMain, -1) : nextMain ? shiftYmd(nextMain, -1) : last;
  const windowEnd = horizon < last ? last : horizon;
  const win = { windowStart: days[0], windowEnd };
  if (nextMain && nextMain >= win.windowStart && nextMain <= windowEnd) win.skipDays = [nextMain];
  return win;
}

// Does YouTube's /embed/<id> shell say the video plays embedded? The NFL blocks
// embeds per VIDEO, not per channel: measured 2026-09-20 with scripts/check-
// embeddable.mjs, "Top 15 plays" and "Every touchdown" PLAY from hidescore.com
// while "Sunday's best" returns error 150 — and this field agreed on all three.
// true / false, or null when the shell carries no verdict (treated as blocked).
export function parseEmbedPlayable(html) {
  const m = String(html ?? "").match(/previewPlayabilityStatus\\?":\{\\?"status\\?":\\?"([A-Z_]+)\\?"(?:,\\?"playableInEmbed\\?":(true|false))?/);
  if (!m) return null;
  return m[1] === "OK" && m[2] === "true";
}

// Does the clip play on youtube.com itself, from where this runs (the mini, US)?
// The watch page's own playabilityStatus. Separate from the embed verdict: a
// LALIGA EA SPORTS cut is OK here yet refuses every embed, while a TUDN Liga MX
// cut is UNPLAYABLE here too ("Video unavailable", no US in availableCountries,
// checked 2026-09-25). true / false, or null when the page carries no verdict
// (a google.com/sorry bounce).
export function parseWatchPagePlayable(html) {
  const m = String(html ?? "").match(/"playabilityStatus":\{"status":"([A-Z_]+)"/);
  if (!m) return null;
  return m[1] === "OK";
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
  "channel", "durationSec", "published", "t", "sourcePolicy", "embeddable", "skipDays",
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
  if (rec.cadence === "weekly") {
    return !!rec.windowStart && !!rec.windowEnd && rec.windowStart <= ymd && ymd <= rec.windowEnd
      && !(rec.skipDays ?? []).includes(ymd);
  }
  return rec.coversDate === ymd;
}

// ── Lone 2nd-slot promotion ──────────────────────────────────────────────────

// For most leagues both highlight slots run the same query on the same channel,
// so a flaky lookup can miss slot 1 and hit slot 2 in one run. The card then
// shows a lone "Alt" button holding the league's normal cut. Move that video up.
// Only when both slots share a channel: the next bake keeps a carried official
// only if its channel is the primary one (or a fallback), so a promoted id from
// a different channel would be thrown away and re-resolved on every run.
export function promoteLoneExtended({ official, officialChannel, extended, primaryChannel, secondaryChannel }) {
  const same = !!primaryChannel && !!secondaryChannel && primaryChannel.toLowerCase() === secondaryChannel.toLowerCase();
  if (official || !extended || !same) return { official, officialChannel, extended, promoted: false };
  return { official: extended, officialChannel: primaryChannel, extended: null, promoted: true };
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
