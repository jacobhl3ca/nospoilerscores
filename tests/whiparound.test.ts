import assert from "node:assert/strict";
import test from "node:test";

import {
  getWhiparoundShow,
  isAirDay,
  parseEtTime,
  whiparoundStartsLater,
  whiparoundSubtitle,
  WHIPAROUND_SHOWS,
} from "../src/lib/whiparound.ts";
import type { EtClock } from "../src/lib/whiparound.ts";
import type { Game } from "../src/lib/types.ts";

const TZ = "America/New_York";

// Only the four fields the subtitle reads (`date`, `state`, plus the id/sport
// that make the object a Game at all) matter here; the cast keeps the fixture
// from having to restate thirty unrelated columns of the ESPN payload.
function game(iso: string, state: Game["state"] = "pre"): Game {
  return { id: `${iso}-${state}`, date: iso, state } as Game;
}

function clock(y: number, mo: number, d: number, h: number, m: number): EtClock {
  return { y, mo, d, h, m };
}

const redzone = getWhiparoundShow("nfl")!;
const goalRush = getWhiparoundShow("epl")!;
const golazo = getWhiparoundShow("ucl")!;
const frenzy = getWhiparoundShow("nhl")!;
const crunchtime = getWhiparoundShow("nba")!;

// A normal NFL Sunday slate: 1:00 PM and 4:25 PM ET kickoffs inside the RedZone
// window, plus an 8:20 PM ET night game that falls outside it. September is EDT
// (UTC-4).
const sundaySlate = [
  game("2026-09-20T17:00:00Z"),
  game("2026-09-20T17:00:00Z"),
  game("2026-09-20T17:00:00Z"),
  game("2026-09-20T20:25:00Z"),
  game("2026-09-20T20:25:00Z"),
  game("2026-09-21T00:20:00Z"),
];

const sundaySlateLive = sundaySlate.map((g) =>
  g.date.endsWith("00:20:00Z") ? g : game(g.date, "in"),
);

// ── RedZone: the scheduled / LIVE / gone lifecycle ───────────────────────────

test("Sunday before kickoff shows the scheduled time and does not link", () => {
  const r = whiparoundSubtitle(redzone, "20260920", sundaySlate, clock(2026, 9, 20, 12, 30), TZ);
  assert.ok(r);
  assert.deepEqual(r.tiers, ["RedZone · 1:00 PM ET", "RedZone · 1:00 PM", "RedZone"]);
  assert.equal(r.href, undefined);
  assert.notEqual(r.live, true);
});

test("Sunday inside the window with live games goes green and links out", () => {
  const r = whiparoundSubtitle(redzone, "20260920", sundaySlateLive, clock(2026, 9, 20, 14, 0), TZ);
  assert.ok(r);
  assert.deepEqual(r.tiers, [
    "● RedZone · LIVE",
    "● RedZone live",
    "● RedZone",
  ]);
  assert.equal(r.href, "https://www.nfl.com/redzone");
  assert.equal(r.live, true);
});

test("Sunday inside the window with nothing in progress stays on the scheduled text", () => {
  const r = whiparoundSubtitle(redzone, "20260920", sundaySlate, clock(2026, 9, 20, 14, 0), TZ);
  assert.ok(r);
  assert.equal(r.tiers[0], "RedZone · 1:00 PM ET");
  assert.equal(r.live, undefined);
});

test("Sunday after the show ends hides the subtitle", () => {
  // 9:00 PM ET is 480 minutes past the 1:00 PM start, past the 420-minute run.
  const r = whiparoundSubtitle(redzone, "20260920", sundaySlateLive, clock(2026, 9, 20, 21, 0), TZ);
  assert.equal(r, null);
});

test("a past day never shows a scheduled time", () => {
  const r = whiparoundSubtitle(redzone, "20260913", sundaySlate, clock(2026, 9, 20, 12, 0), TZ);
  assert.equal(r, null);
});

test("a future Sunday shows the scheduled time", () => {
  const future = sundaySlate.map((g) => game(g.date.replace("2026-09-20", "2026-09-27").replace("2026-09-21", "2026-09-28")));
  const r = whiparoundSubtitle(redzone, "20260927", future, clock(2026, 9, 20, 12, 0), TZ);
  assert.ok(r);
  assert.equal(r.tiers[0], "RedZone · 1:00 PM ET");
});

// ── Day, season and slate gates ──────────────────────────────────────────────

test("a Monday is not a RedZone day", () => {
  const r = whiparoundSubtitle(redzone, "20260921", sundaySlate, clock(2026, 9, 21, 12, 0), TZ);
  assert.equal(r, null);
});

test("a January playoff Sunday is outside the RedZone season", () => {
  // Week 18 is Jan 10 2027; Jan 17 is wild-card weekend.
  const slate = [game("2027-01-17T18:00:00Z"), game("2027-01-17T21:30:00Z")];
  const r = whiparoundSubtitle(redzone, "20270117", slate, clock(2027, 1, 17, 12, 0), TZ);
  assert.equal(r, null);
});

test("Goal Rush hides on a Saturday with a single 10 AM match", () => {
  const r = whiparoundSubtitle(goalRush, "20260919", [game("2026-09-19T14:00:00Z")], clock(2026, 9, 19, 9, 0), TZ);
  assert.equal(r, null);
});

test("Goal Rush shows on a Saturday with a full 10 AM block", () => {
  const slate = Array.from({ length: 5 }, () => game("2026-09-19T14:00:00Z"));
  const r = whiparoundSubtitle(goalRush, "20260919", slate, clock(2026, 9, 19, 9, 0), TZ);
  assert.ok(r);
  assert.equal(r.tiers[0], "Goal Rush · 10:00 AM ET");
});

test("a late kickoff outside the window does not count toward the slate gate", () => {
  // Three matches, but all at 12:30 PM ET — past the 10:00-12:00 Goal Rush run.
  const slate = Array.from({ length: 3 }, () => game("2026-09-19T16:30:00Z"));
  const r = whiparoundSubtitle(goalRush, "20260919", slate, clock(2026, 9, 19, 9, 0), TZ);
  assert.equal(r, null);
});

test("Frozen Frenzy is one listed night and nothing else", () => {
  const slate = Array.from({ length: 16 }, () => game("2026-10-13T22:00:00Z"));
  const on = whiparoundSubtitle(frenzy, "20261013", slate, clock(2026, 10, 13, 12, 0), TZ);
  assert.ok(on);
  assert.equal(on.tiers[0], "Frozen Frenzy · 6:00 PM ET");
  assert.equal(on.tiers[2], "Frenzy");

  const off = whiparoundSubtitle(
    frenzy,
    "20261014",
    slate.map((g) => game(g.date.replace("10-13", "10-14"))),
    clock(2026, 10, 14, 12, 0),
    TZ,
  );
  assert.equal(off, null);
});

test("CrunchTime is silent in April 2026, so the NBA playoff countdown still wins", () => {
  // The column falls through to the "Playoffs start Apr 18" countdown whenever
  // this returns null. April 2026 is before the 2026-27 CrunchTime season.
  const slate = Array.from({ length: 8 }, () => game("2026-04-07T23:30:00Z"));
  const r = whiparoundSubtitle(crunchtime, "20260406", slate, clock(2026, 4, 6, 12, 0), TZ);
  assert.equal(r, null);
});

test("Golazo falls back to a short tier for a narrow column", () => {
  const slate = Array.from({ length: 4 }, () => game("2026-09-22T19:00:00Z"));
  const r = whiparoundSubtitle(golazo, "20260922", slate, clock(2026, 9, 22, 12, 0), TZ);
  assert.ok(r);
  assert.deepEqual(r.tiers, [
    "Golazo Show · 3:00 PM ET",
    "Golazo · 3:00 PM",
    "Golazo",
  ]);
});

// ── The dev preview flag and the header tick ─────────────────────────────────

test("the force flag turns the subtitle green without moving the clock", () => {
  const r = whiparoundSubtitle(redzone, "20260920", sundaySlate, clock(2026, 9, 20, 11, 0), TZ, true);
  assert.ok(r);
  assert.equal(r.live, true);
  assert.equal(r.href, "https://www.nfl.com/redzone");
});

test("the force flag does not override the day gate", () => {
  const r = whiparoundSubtitle(redzone, "20260921", sundaySlate, clock(2026, 9, 21, 11, 0), TZ, true);
  assert.equal(r, null);
});

test("the 60s tick runs only while today's start is still ahead", () => {
  assert.equal(whiparoundStartsLater(redzone, "20260920", clock(2026, 9, 20, 12, 30)), true);
  assert.equal(whiparoundStartsLater(redzone, "20260920", clock(2026, 9, 20, 13, 0)), false);
  assert.equal(whiparoundStartsLater(redzone, "20260921", clock(2026, 9, 21, 7, 0)), false);
  assert.equal(whiparoundStartsLater(redzone, "20260927", clock(2026, 9, 20, 7, 0)), false);
});

// ── Config sanity ────────────────────────────────────────────────────────────

test("every show is configured with an air day, a season and a real link", () => {
  for (const show of WHIPAROUND_SHOWS) {
    assert.ok(show.days?.length || show.dates?.length, `${show.name} has no air day`);
    assert.ok(show.seasonStart <= show.seasonEnd, `${show.name} season is inverted`);
    assert.match(show.href, /^https:\/\//, `${show.name} link is not https`);
    assert.ok(show.durationMin > 0 && show.durationMin < 24 * 60, `${show.name} duration`);
    assert.ok(parseEtTime(show.startET), `${show.name} start time is unparseable`);
    // The season and the air days have to agree, or the show is configured to
    // never air at all. Walk the first two weeks of the season and require at
    // least one real air day in there.
    const start = new Date(`${show.seasonStart}T12:00:00`);
    const airDays = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
      const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
      return isAirDay(show, ymd);
    }).filter(Boolean).length;
    assert.ok(airDays > 0, `${show.name} never airs inside its own season`);
  }
});

test("a one-off show lists only dates that fall inside its season", () => {
  for (const show of WHIPAROUND_SHOWS) {
    for (const date of show.dates ?? []) {
      assert.ok(date >= show.seasonStart && date <= show.seasonEnd, `${show.name} ${date}`);
      assert.equal(isAirDay(show, date.replace(/-/g, "")), true, `${show.name} ${date}`);
    }
  }
});

test("RedZone's own season start is not itself an air day", () => {
  // Guards the assertion above from going vacuous again: 2026-09-10 is a
  // Thursday, so isAirDay must say no even though it opens the season.
  assert.equal(isAirDay(getWhiparoundShow("nfl")!, "20260910"), false);
});

test("a kickoff after midnight counts against the night it belongs to", () => {
  // 8:20 PM ET Sunday and 12:20 AM ET Monday are the same NFL night. The slate
  // gate must file both under Sunday, the way the board's own day bucketing
  // does, and must keep both outside the 1:00-8:00 PM RedZone window.
  const lateNight = [
    ...Array.from({ length: 2 }, () => game("2026-09-20T17:00:00Z")),
    game("2026-09-21T04:20:00Z"),
  ];
  const r = whiparoundSubtitle(redzone, "20260920", lateNight, clock(2026, 9, 20, 12, 30), TZ);
  assert.ok(r, "two 1 PM kickoffs still clear the slate gate");
  assert.equal(r.tiers[0], "RedZone \u00B7 1:00 PM ET");

  // Drop to one in-window kickoff and the late game must not make up the gap.
  const thin = [game("2026-09-20T17:00:00Z"), game("2026-09-21T04:20:00Z")];
  assert.equal(whiparoundSubtitle(redzone, "20260920", thin, clock(2026, 9, 20, 12, 30), TZ), null);
});

test("one sport holds at most one show", () => {
  const sports = WHIPAROUND_SHOWS.map((s) => s.sport);
  assert.equal(new Set(sports).size, sports.length);
});

test("MLB keeps Big Inning and takes no whip-around entry", () => {
  assert.equal(getWhiparoundShow("mlb"), null);
});

test("CrunchTime counts the 7:00 PM tip-offs it cuts back to", () => {
  // A real Monday slate: 7:00, 7:30, 8:00, 8:30, 9:00 and 10:00 PM ET tip-offs.
  // Only three start after the 8:30 show time, so counting from the show's own
  // start would make a normal Monday look too thin.
  const monday = [
    game("2026-10-26T23:00:00Z"),
    game("2026-10-26T23:00:00Z"),
    game("2026-10-26T23:30:00Z"),
    game("2026-10-27T00:00:00Z"),
  ];
  const r = whiparoundSubtitle(crunchtime, "20261026", monday, clock(2026, 10, 26, 18, 0), TZ);
  assert.ok(r);
  assert.equal(r.tiers[0], "CrunchTime · 8:30 PM ET");

  // An afternoon-only slate still fails the gate.
  const afternoon = Array.from({ length: 4 }, () => game("2026-10-26T18:00:00Z"));
  assert.equal(whiparoundSubtitle(crunchtime, "20261026", afternoon, clock(2026, 10, 26, 12, 0), TZ), null);
});

test("Frozen Frenzy clears its gate on the real all-32-teams slate", () => {
  const frenzyNight = [
    game("2026-10-13T22:00:00Z"),
    game("2026-10-13T23:15:00Z"),
    game("2026-10-14T00:30:00Z"),
    game("2026-10-14T03:00:00Z"),
  ];
  const r = whiparoundSubtitle(frenzy, "20261013", frenzyNight, clock(2026, 10, 13, 12, 0), TZ);
  assert.ok(r);
  assert.equal(r.tiers[0], "Frozen Frenzy · 6:00 PM ET");
});
