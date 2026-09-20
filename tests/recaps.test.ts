import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  RECAP_SERIES,
  parseLengthText,
  isoDurationToSec,
  parseRelativeTime,
  parseYtVideoRenderers,
  parseWatchPageLengthSeconds,
  parseWatchPagePublishMs,
  dailyCoversDate,
  titleDateToYmd,
  weekdayCoversDate,
  weeklyWindowFromPublished,
  nflWeekWindow,
  matchSeriesTitle,
  pickNewest,
  stripRecapRecord,
  fillHeading,
  pickShorterClub,
  eplSeasonYear,
} from "../scripts/lib/recaps.mjs";
import { createJiti } from "jiti";
import type { RecapRecord } from "../src/lib/recaps.ts";

// recaps.ts imports @/lib/youtube (getApiBase) at runtime, so load it through
// jiti like calendar-link does — the alias does not resolve under bare node.
const jiti = createJiti(import.meta.url);
const {
  RECAP_EXPECTED_CHANNELS,
  selectRecaps,
  recapCoversDay,
  formatRecapDuration,
  clubNickname,
} = (await jiti.import("../src/lib/recaps.ts")) as {
  RECAP_EXPECTED_CHANNELS: Record<string, Record<string, string>>;
  selectRecaps: (all: Record<string, RecapRecord[]> | null | undefined, sport: string, ymd: string) => RecapRecord[];
  recapCoversDay: (rec: RecapRecord, ymd: string) => boolean;
  formatRecapDuration: (sec: number | null | undefined) => string;
  clubNickname: (channel: string | null | undefined) => string;
};

type Series = {
  key: string; enabled: boolean; source: string; cadence: string; channelName?: string;
  titleRx?: RegExp; slugRx?: RegExp; weekdayGroup?: number; heading: string; label: string;
};
const series = (sport: string, key: string): Series => {
  const s = (RECAP_SERIES as Record<string, Series[]>)[sport].find((x) => x.key === key);
  assert.ok(s, `${sport}/${key} missing from RECAP_SERIES`);
  return s!;
};
const cand = (title: string, channel: string, extra: Record<string, unknown> = {}) =>
  ({ videoId: "abcdefghijk", title, channel, ...extra });

// ── Series regexes: table C positives, per-game negatives ────────────────────

test("NFL Top 15 matches both title orders and requires the season token", () => {
  const s = series("nfl", "top15");
  const a = matchSeriesTitle(s, cand("Top 15 Plays From Week 1 | 2025 NFL Season", "NFL"), { seasonYear: 2025 });
  assert.equal(a?.week, 1);
  assert.equal(a?.season, 2025);
  const b = matchSeriesTitle(s, cand("Top 15 Plays of Week 16 | 2025 NFL Season", "NFL"), { seasonYear: 2025 });
  assert.equal(b?.week, 16);
  // Last season's Week 1 is in the same results as this season's.
  assert.equal(matchSeriesTitle(s, cand("Top 15 Plays From Week 1 | 2025 NFL Season", "NFL"), { seasonYear: 2026 }), null);
  // No season token at all → not this series (postseason / compilation cuts).
  assert.equal(matchSeriesTitle(s, cand("TOP 15 Plays of Wild Card Weekend", "NFL"), { seasonYear: 2026 }), null);
  assert.equal(matchSeriesTitle(s, cand("TOP 15 GAMES of the 2025 Season!", "NFL"), { seasonYear: 2025 }), null);
  // Wrong uploader.
  assert.equal(matchSeriesTitle(s, cand("Top 15 Plays From Week 1 | 2026 NFL Season", "Some Fan"), { seasonYear: 2026 }), null);
});

test("NFL 2026 title order (season before week) parses", () => {
  const s = series("nfl", "bestsunday");
  const m = matchSeriesTitle(s, cand("Best Plays From Sunday! | 2026 NFL Season Week 1", "NFL"), { seasonYear: 2026 });
  assert.equal(m?.week, 1);
  assert.equal(m?.season, 2026);
  const top15 = matchSeriesTitle(series("nfl", "top15"), cand("Top 15 Plays From Week 2 | 2026 NFL Season", "NFL"), { seasonYear: 2026 });
  assert.equal(top15?.week, 2);
});

test("NFL every-touchdown and full top-plays series", () => {
  assert.equal(matchSeriesTitle(series("nfl", "everytd"), cand("Every Touchdown From Week 1 | 2026 NFL Season", "NFL"), { seasonYear: 2026 })?.week, 1);
  assert.equal(matchSeriesTitle(series("nfl", "topplays"), cand("Top Plays of Week 12 | 2026 NFL Season", "NFL"), { seasonYear: 2026 })?.week, 12);
});

test("per-game and off-series NFL titles never match", () => {
  const negatives = [
    "Detroit Lions vs Indianapolis Colts | 2026 Preseason Week 3",
    "New Orleans Saints vs. Detroit Lions Game Highlights | NFL 2026 Season Week 1",
    "2026 Week 1: Lions vs. Saints | Highlights 🎥",
    "Top 100 Plays of the 2025 Season",
  ];
  for (const s of RECAP_SERIES.nfl) {
    for (const t of negatives) {
      assert.equal(matchSeriesTitle(s, cand(t, "NFL"), { seasonYear: 2026 }), null, `${s.key} matched "${t}"`);
    }
  }
});

test("NBA Top 10 carries the games' date from the title", () => {
  const s = series("nba", "top10");
  const m = matchSeriesTitle(s, cand("NBA's Top 10 Plays of the Night | October 23, 2026", "NBA"));
  assert.equal(m?.titleDate, "20261023");
  assert.equal(matchSeriesTitle(s, cand("NBA's Top 5 Plays Of The Night | Nov 3, 2026", "NBA"))?.titleDate, "20261103");
  assert.equal(matchSeriesTitle(s, cand("Lakers vs Celtics Full Game Highlights | October 23, 2026", "NBA")), null);
  assert.equal(matchSeriesTitle(s, cand("NBA's Top 10 Plays of the Night", "NBA")), null);
});

test("EPL and MLS every-goal series parse the matchweek / matchday", () => {
  assert.equal(matchSeriesTitle(series("epl", "everygoal"), cand("EVERY Weekend Goal | Matchweek 4", "Premier League"))?.week, 4);
  // NBC: the season stamp is required and must be the running season.
  assert.equal(matchSeriesTitle(series("epl", "everygoalnbc"), cand("Every Premier League goal from Matchweek 4 (2026-27) | Premier League | NBC Sports", "NBC Sports"), { seasonYear: 2026 })?.week, 4);
  assert.equal(matchSeriesTitle(series("epl", "everygoalnbc"), cand("Every Premier League goal from Matchweek 38 (2025-26) | Premier League | NBC Sports", "NBC Sports"), { seasonYear: 2026 }), null);
  assert.equal(matchSeriesTitle(series("epl", "everygoalnbc"), cand("Every Premier League goal from Matchweek 7 | NBC Sports", "NBC Sports"), { seasonYear: 2026 }), null);
  assert.equal(eplSeasonYear(new Date("2026-09-14T16:00:00Z")), 2026);
  assert.equal(eplSeasonYear(new Date("2027-02-14T16:00:00Z")), 2026);
  assert.equal(eplSeasonYear(new Date("2027-08-14T16:00:00Z")), 2027);
  assert.equal(matchSeriesTitle(series("mls", "everygoal"), cand("Every Goal From Matchday 25", "Major League Soccer"))?.week, 25);
  assert.equal(matchSeriesTitle(series("mls", "everygoal"), cand("Watch Every Goal from Matchday 25!", "Major League Soccer"))?.week, 25);
  assert.equal(matchSeriesTitle(series("mls", "everygoal"), cand("Every Goal From Matchday 24! Luis Suárez, Cavan Sullivan, and more!", "Major League Soccer"))?.week, 24);
  assert.equal(matchSeriesTitle(series("epl", "everygoalnbc"), cand("Every Premier League goal from Matchweek 3 (2026-27) | Premier League | NBC Sports", "NBC Sports"), { seasonYear: 2026 })?.week, 3);
  assert.equal(matchSeriesTitle(series("mls", "everygoal"), cand("Inter Miami vs LAFC | Highlights", "Major League Soccer")), null);
  assert.equal(matchSeriesTitle(series("epl", "everygoal"), cand("Bedard's BEAUTY of a goal | NHL Week 21", "Premier League")), null);
});

test("MLB slugs name the weekday; per-game MLB slugs never match", () => {
  const fast = series("mlb", "fastcast");
  const real = series("mlb", "realfast");
  assert.equal("fastcast-saturday-s-best-in-15-minutes-x6640".match(fast.slugRx!)?.[fast.weekdayGroup!], "saturday");
  assert.equal("real-fast-sunday-s-best-in-60-seconds-x3817".match(real.slugRx!)?.[real.weekdayGroup!], "sunday");
  for (const slug of ["blue-jays-hit-back-to-back-to-back-homers-x1234", "condensed-game-nym-phi-7-16-26", "fastcast-top-10-plays-of-the-week"]) {
    assert.equal(slug.match(fast.slugRx!), null, slug);
    assert.equal(slug.match(real.slugRx!), null, slug);
  }
  assert.equal(matchSeriesTitle(series("mlb", "morninglineup"), cand("Morning Lineup: Judge's 3-HR night | MLB Daily Recap", "MLB"))?.videoId, "abcdefghijk");
  assert.equal(matchSeriesTitle(series("mlb", "morninglineup"), cand("Blue Jays hit back-to-back-to-back homers", "MLB")), null);
});

test("every enabled series has a client-side expected channel, and they agree", () => {
  for (const [sport, list] of Object.entries(RECAP_SERIES as Record<string, Series[]>)) {
    for (const s of list) {
      const expected = RECAP_EXPECTED_CHANNELS[sport]?.[s.key];
      assert.ok(expected, `${sport}/${s.key} missing from RECAP_EXPECTED_CHANNELS`);
      assert.equal(expected, s.source === "mlbcom" ? "MLB.com" : s.channelName, `${sport}/${s.key} channel drift`);
    }
  }
});

// ── Results-page parser on a saved fixture ───────────────────────────────────

test("parseYtVideoRenderers reads id, title, owner, length and age from a saved @NFL search page", () => {
  const html = readFileSync(new URL("./fixtures/yt-nfl-search.html", import.meta.url), "utf8");
  const rows = parseYtVideoRenderers(html);
  assert.equal(rows.length, 8);
  const first = rows[0];
  assert.equal(first.videoId, "AGzdTAjWr7U");
  assert.equal(first.title, "Best Plays From Sunday! | 2026 NFL Season Week 1");
  assert.equal(first.channel, "NFL");
  assert.equal(first.lengthText, "30:02");
  assert.equal(first.durationSec, 1802);
  assert.equal(first.publishedTimeText, "13 hours ago");
  const wk1 = rows.find((r) => r.videoId === "XUpaSUiyy5I");
  assert.equal(wk1?.title, "Top 15 Plays From Week 1 | 2025 NFL Season");
  assert.equal(wk1?.durationSec, 481);
  // Season gate on the same page: 2026 picks the Sunday cut, 2025 picks Week 16.
  const top15 = series("nfl", "top15");
  assert.equal(pickNewest(rows.map((r) => matchSeriesTitle(top15, r, { seasonYear: 2026 }))), null);
  assert.equal(pickNewest(rows.map((r) => matchSeriesTitle(top15, r, { seasonYear: 2025 })))?.week, 16);
  assert.equal(pickNewest(rows.map((r) => matchSeriesTitle(series("nfl", "bestsunday"), r, { seasonYear: 2026 })))?.videoId, "AGzdTAjWr7U");
});

test("length, ISO duration, relative time and watch-page seconds parse", () => {
  assert.equal(parseLengthText("8:01"), 481);
  assert.equal(parseLengthText("1:02:03"), 3723);
  assert.equal(parseLengthText("0:59"), 59);
  assert.equal(parseLengthText("live"), null);
  assert.equal(isoDurationToSec("PT10M32S"), 632);
  assert.equal(isoDurationToSec("PT1H"), 3600);
  assert.equal(isoDurationToSec("PT58.5S"), 59);
  assert.equal(isoDurationToSec("P0Y0M0DT0H15M0S"), 900); // mlb.com's shape
  assert.equal(isoDurationToSec("P0Y0M0DT0H1M2S"), 62);
  assert.equal(isoDurationToSec("nope"), null);
  const now = Date.UTC(2026, 8, 14, 12, 0, 0);
  assert.equal(parseRelativeTime("2 days ago", now), now - 2 * 86400e3);
  assert.equal(parseRelativeTime("Streamed 3 hours ago", now), now - 3 * 3600e3);
  assert.equal(parseRelativeTime("", now), null);
  assert.equal(parseWatchPageLengthSeconds('{"videoDetails":{"lengthSeconds":"596","title":"x"}}'), 596);
  assert.equal(parseWatchPageLengthSeconds("<html></html>"), null);
  assert.equal(parseWatchPagePublishMs('"publishDate":"2026-03-27T04:30:00-07:00","uploadDate":"2026-03-27T04:30:00-07:00"'), Date.parse("2026-03-27T04:30:00-07:00"));
  assert.equal(parseWatchPagePublishMs("<html></html>"), null);
});

// ── Window / coversDate math ─────────────────────────────────────────────────

test("a daily cut posted before 2 pm ET covers the previous day; after, the same day", () => {
  assert.equal(dailyCoversDate("2026-09-14T13:30:00Z"), "20260913"); // 9:30 am ET Mon
  assert.equal(dailyCoversDate("2026-09-14T17:59:00Z"), "20260913"); // 1:59 pm ET
  assert.equal(dailyCoversDate("2026-09-14T18:00:00Z"), "20260914"); // 2:00 pm ET
  assert.equal(dailyCoversDate("2026-09-15T03:30:00Z"), "20260914"); // 11:30 pm ET Mon
  assert.equal(dailyCoversDate("garbage"), "");
});

test("NBA title date → YYYYMMDD", () => {
  assert.equal(titleDateToYmd("October 23, 2026"), "20261023");
  assert.equal(titleDateToYmd("Nov 3, 2026"), "20261103");
  assert.equal(titleDateToYmd("Sept. 14, 2026"), "20260914");
  assert.equal(titleDateToYmd("2026-10-23"), "");
});

test("MLB weekday slug → the most recent ET day with that weekday", () => {
  // 2026-09-14 is a Monday.
  assert.equal(weekdayCoversDate("saturday", "20260914"), "20260912");
  assert.equal(weekdayCoversDate("sunday", "20260914"), "20260913");
  assert.equal(weekdayCoversDate("monday", "20260914"), "20260914");
  assert.equal(weekdayCoversDate("tuesday", "20260914"), "20260908");
  assert.equal(weekdayCoversDate("funday", "20260914"), "");
});

test("EPL / MLS weekly window is the six days before the post plus the day itself", () => {
  assert.deepEqual(weeklyWindowFromPublished("20260913"), { windowStart: "20260907", windowEnd: "20260913" });
  assert.equal(weeklyWindowFromPublished("2026-09-13"), null);
});

test("NFL week window reaches past next week's Sunday and skips only that day", () => {
  const wk1 = [
    { date: "2026-09-10T00:20Z" }, // Wed 9/9 8:20 pm ET
    { date: "2026-09-13T17:00Z" },
    { date: "2026-09-15T00:15Z" }, // Mon 9/14 8:15 pm ET
  ];
  // Thu 9/17, a two-game Sun 9/20, Mon 9/21.
  const wk2 = [{ date: "2026-09-18T00:15Z" }, { date: "2026-09-20T17:00Z" }, { date: "2026-09-20T20:25Z" }, { date: "2026-09-22T00:15Z" }];
  // Thu 9/24, a two-game Sun 9/27.
  const wk3 = [{ date: "2026-09-25T00:15Z" }, { date: "2026-09-27T17:00Z" }, { date: "2026-09-27T20:25Z" }];
  // Out to the day before week 3's slate, minus week 2's Sunday: Mon 9/21 is
  // covered (week 2's cut is not posted yet), Sun 9/20 is not.
  assert.deepEqual(nflWeekWindow(wk1, wk2, wk3), { windowStart: "20260909", windowEnd: "20260926", skipDays: ["20260920"] });
  // Nothing after next week known → stop the day before next week's slate, and
  // that boundary already excludes the Sunday, so no skipDays is written.
  assert.deepEqual(nflWeekWindow(wk1, wk2, []), { windowStart: "20260909", windowEnd: "20260919" });
  // No next week at all (the regular season's last week) → the week's own end.
  assert.deepEqual(nflWeekWindow(wk1, [], []), { windowStart: "20260909", windowEnd: "20260914" });
  assert.equal(nflWeekWindow([], wk2, wk3), null);
  // The busiest day wins, not the first: a Friday special and a Saturday pair
  // ahead of the Sunday must not be read as the slate.
  const flexed = [{ date: "2026-09-19T00:15Z" }, { date: "2026-09-20T17:00Z" }, { date: "2026-09-20T17:00Z" }];
  assert.equal(nflWeekWindow(wk1, flexed, [])?.windowEnd, "20260919");
});

test("recapCoversDay holds a weekly record out of its skipDays", () => {
  const rec = {
    sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly" as const,
    coversWeek: 1, windowStart: "20260909", windowEnd: "20260926", skipDays: ["20260920"],
    videoId: "a", pageUrl: "https://www.youtube.com/watch?v=a", channel: "NFL",
  };
  assert.equal(recapCoversDay(rec, "20260919"), true);  // Saturday
  assert.equal(recapCoversDay(rec, "20260920"), false); // the live football Sunday
  assert.equal(recapCoversDay(rec, "20260921"), true);  // Monday, before week 2's cut posts
  assert.equal(recapCoversDay(rec, "20260927"), false); // past the window
  assert.equal(recapCoversDay({ ...rec, skipDays: undefined }, "20260920"), true);
});

test("pickNewest ranks by publish day, then week, then title date — never page order", () => {
  const D = 86400e3;
  const byWeek = pickNewest([
    { videoId: "a", week: 14, publishedMs: 9 },
    { videoId: "b", week: 16, publishedMs: 1 },
    null,
    { videoId: "c", week: 15, publishedMs: 5 },
  ]);
  assert.equal(byWeek?.videoId, "b");
  // Across seasons the week number lies: 2025's Matchday 31 is older than
  // 2026's Matchday 25 (the first live run got this wrong).
  const crossSeason = pickNewest([
    { videoId: "md31", week: 31, publishedMs: 100 * D },
    { videoId: "md25", week: 25, publishedMs: 465 * D },
    { videoId: "md24", week: 24, publishedMs: 463 * D },
  ]);
  assert.equal(crossSeason?.videoId, "md25");
  // An unknown publish time never outranks a known one, whatever the week says.
  assert.equal(pickNewest([{ videoId: "x", week: 3, publishedMs: null }, { videoId: "y", week: 4, publishedMs: 5 * D }])?.videoId, "y");
  assert.equal(pickNewest([{ videoId: "mw38", week: 38, publishedMs: null }, { videoId: "mw3", week: 3, publishedMs: 7 * D }])?.videoId, "mw3");
  assert.equal(pickNewest([{ videoId: "a", week: 3, publishedMs: null }, { videoId: "b", week: 4, publishedMs: null }])?.videoId, "b");
  const byDate = pickNewest([
    { videoId: "a", week: null, titleDate: "20261022", publishedMs: 9 },
    { videoId: "b", week: null, titleDate: "20261023", publishedMs: 1 },
  ]);
  assert.equal(byDate?.videoId, "b");
  const byAge = pickNewest([
    { videoId: "a", week: null, titleDate: "", publishedMs: 1 },
    { videoId: "b", week: null, titleDate: "", publishedMs: 9 },
  ]);
  assert.equal(byAge?.videoId, "b");
  assert.equal(pickNewest([]), null);
});

test("stripRecapRecord drops title / thumbnail / headline; fillHeading substitutes the week", () => {
  const rec = stripRecapRecord({
    sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly",
    videoId: "XUpaSUiyy5I", pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL",
    headline: "WALK-OFF WEEKEND in Cleveland", title: "spoiler", imageUrl: "https://i.ytimg.com/x.jpg", thumbnail: "x",
    durationSec: 481, t: 1, sourcePolicy: "official-channel", poster: null,
  });
  assert.equal("headline" in rec, false);
  assert.equal("title" in rec, false);
  assert.equal("imageUrl" in rec, false);
  assert.equal("thumbnail" in rec, false);
  assert.equal("poster" in rec, false);
  assert.equal((rec as Record<string, unknown>).videoId, "XUpaSUiyy5I");
  assert.equal(fillHeading("Week {n}", 1), "Week 1");
  assert.equal(fillHeading("Best of the day", null), "Best of the day");
});

// ── Client selection ─────────────────────────────────────────────────────────

const base = (over: Partial<RecapRecord>): RecapRecord => ({
  sport: "nfl", key: "top15", heading: "Week 1", label: "Top 15 plays", cadence: "weekly",
  coversWeek: 1, windowStart: "20260909", windowEnd: "20260916", videoId: "XUpaSUiyy5I",
  pageUrl: "https://www.youtube.com/watch?v=XUpaSUiyy5I", channel: "NFL", durationSec: 481, t: 1,
  sourcePolicy: "official-channel", ...over,
});

test("selectRecaps keeps uploader-verified records that cover the day, shortest first", () => {
  const all = {
    nfl: [
      base({ key: "everytd", label: "Every touchdown", durationSec: 960 }),
      base({}),
      base({ key: "topplays", durationSec: 2820, channel: "Some Fan" }),   // wrong uploader
      base({ key: "top15", coversWeek: 2, windowStart: "20260917", windowEnd: "20260923" }), // next week
      base({ key: "everytd", videoId: undefined }),                        // nothing to play
    ],
    mlb: [
      { sport: "mlb", key: "fastcast", heading: "Best of the day", label: "Best of the day", cadence: "daily", coversDate: "20260913", playbackUrl: "https://x/y.m3u8", pageUrl: "https://www.mlb.com/video/fastcast-sunday", channel: "MLB.com", durationSec: 700 } as RecapRecord,
      { sport: "mlb", key: "realfast", heading: "Best of the day", label: "60 seconds", cadence: "daily", coversDate: "20260913", playbackUrl: "https://x/z.m3u8", pageUrl: "https://www.mlb.com/video/real-fast-sunday", channel: "MLB.com", durationSec: 60 } as RecapRecord,
      { sport: "mlb", key: "realfast", heading: "Best of the day", label: "60 seconds", cadence: "daily", coversDate: "20260912", playbackUrl: "https://x/w.m3u8", pageUrl: "https://www.mlb.com/video/real-fast-saturday", channel: "MLB.com", durationSec: 60 } as RecapRecord,
    ],
  };
  assert.deepEqual(selectRecaps(all, "nfl", "20260913").map((r) => `${r.key}:${r.durationSec}`), ["top15:481", "everytd:960"]);
  assert.deepEqual(selectRecaps(all, "nfl", "20260916").map((r) => r.key), ["top15", "everytd"]);
  assert.deepEqual(selectRecaps(all, "nfl", "20260917").map((r) => r.coversWeek), [2]);
  assert.deepEqual(selectRecaps(all, "nfl", "20260908").map((r) => r.key), []);
  assert.deepEqual(selectRecaps(all, "mlb", "20260913").map((r) => r.key), ["realfast", "fastcast"]);
  assert.deepEqual(selectRecaps(all, "mlb", "20260912").map((r) => r.key), ["realfast"]);
  assert.deepEqual(selectRecaps(all, "nba", "20260913"), []);
  // Overlapping weekly windows from two uploaders: only the latest week shows.
  const epl = {
    epl: [
      base({ sport: "epl", key: "everygoal", heading: "Every goal, Matchweek 4", coversWeek: 4, windowStart: "20260907", windowEnd: "20260913", channel: "Premier League", durationSec: 201 }),
      base({ sport: "epl", key: "everygoalnbc", heading: "Every goal, Matchweek 3", coversWeek: 3, windowStart: "20260901", windowEnd: "20260907", channel: "NBC Sports", durationSec: 723 }),
    ],
  };
  assert.deepEqual(selectRecaps(epl, "epl", "20260907").map((r) => r.key), ["everygoal"]);
  assert.deepEqual(selectRecaps(epl, "epl", "20260905").map((r) => r.key), ["everygoalnbc"]);
  assert.deepEqual(selectRecaps(null, "nfl", "20260913"), []);
  assert.equal(recapCoversDay(base({}), "2026-09-13"), false);
});

test("duration reads as whole minutes (seconds under a minute), blank when unknown", () => {
  assert.equal(formatRecapDuration(481), "8m");
  assert.equal(formatRecapDuration(990), "17m");
  assert.equal(formatRecapDuration(60), "1m");
  assert.equal(formatRecapDuration(59), "59s");
  assert.equal(formatRecapDuration(null), "");
  assert.equal(formatRecapDuration(0), "");
});

// ── NFL club short cut (plan section 5) ──────────────────────────────────────

test("club button label is the channel's last word", () => {
  assert.equal(clubNickname("Detroit Lions"), "Lions");
  assert.equal(clubNickname("Raiders"), "Raiders");
  assert.equal(clubNickname("Tampa Bay Buccaneers"), "Buccaneers");
  assert.equal(clubNickname(null), "");
});

test("the shorter club package wins; unknown durations lose; a tie keeps the first (home) club", () => {
  assert.equal(pickShorterClub([
    { videoId: "home", channel: "New Orleans Saints", durationSec: 990 },
    { videoId: "away", channel: "Detroit Lions", durationSec: 596 },
  ])?.videoId, "away");
  assert.equal(pickShorterClub([
    { videoId: "home", channel: "New Orleans Saints", durationSec: null },
    { videoId: "away", channel: "Detroit Lions", durationSec: 596 },
  ])?.videoId, "away");
  assert.equal(pickShorterClub([
    { videoId: "home", channel: "A", durationSec: 600 },
    { videoId: "away", channel: "B", durationSec: 600 },
  ])?.videoId, "home");
  assert.equal(pickShorterClub([{ videoId: "only", channel: "A", durationSec: null }])?.videoId, "only");
  assert.equal(pickShorterClub([]), null);
});

test("parseEmbedPlayable reads the /embed/ shell's verdict (escaped or plain JSON)", async () => {
  const { parseEmbedPlayable } = await import("../scripts/lib/recaps.mjs");
  assert.equal(parseEmbedPlayable('x\\"previewPlayabilityStatus\\":{\\"status\\":\\"OK\\",\\"playableInEmbed\\":true,\\"contextParams\\":\\"Q\\"'), true);
  assert.equal(parseEmbedPlayable('"previewPlayabilityStatus":{"status":"OK","playableInEmbed":false'), false);
  assert.equal(parseEmbedPlayable('\\"previewPlayabilityStatus\\":{\\"status\\":\\"UNPLAYABLE\\",\\"reason\\":\\"Video unavailable\\"'), false);
  assert.equal(parseEmbedPlayable("<html>nothing</html>"), null);
});
