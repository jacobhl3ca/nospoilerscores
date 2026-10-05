import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { startTimeLabel, cleanStatusDetail } from "../src/lib/gameTime.ts";
import { etSlateYmd, setServiceTimeZone } from "../src/lib/etDay.ts";

// ESPN's status clock is US Eastern ("10/6 - 8:00 PM EDT"); the cards used to
// print it as is, so a picked zone changed nothing (Jacob 10/4). These pin the
// helper every card now goes through: the clock follows the zone, and an
// Eastern reader sees exactly ESPN's clock.

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

// Tue Oct 6 2026, 8:00 PM EDT.
const DATE = "2026-10-07T00:00:00Z";
const fmt = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
const game = (statusDetail: string, date = DATE) => ({ statusDetail, date });

test("a status-text clock follows every zone; an Eastern reader keeps ESPN's clock", () => {
  for (const tz of ZONES) {
    const want = fmt(DATE, tz);
    for (const status of ["10/6 - 8:00 PM EDT", "8:00 PM ET", "8:00 PM", "Scheduled", "", "Postponed"]) {
      assert.equal(startTimeLabel(game(status), tz), want, `${tz} × ${JSON.stringify(status)}`);
    }
  }
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "America/New_York"), "8:00 PM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "America/Chicago"), "7:00 PM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "America/Phoenix"), "5:00 PM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "America/Los_Angeles"), "5:00 PM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "Asia/Kolkata"), "5:30 AM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "Asia/Tokyo"), "9:00 AM");
});

test("winter EST clock: 1:00 PM EST", () => {
  const d = "2026-12-06T18:00:00Z";
  assert.equal(startTimeLabel(game("12/6 - 1:00 PM EST", d), "America/New_York"), "1:00 PM");
  assert.equal(startTimeLabel(game("1:00 PM EST", d), "America/Denver"), "11:00 AM");
  assert.equal(startTimeLabel(game("1:00 PM EST", d), "Australia/Sydney"), "5:00 AM");
});

test("TBD, Followed by, Starts, invalid date", () => {
  for (const tz of ZONES) {
    assert.equal(startTimeLabel(game("TBD"), tz), "TBD");
    assert.equal(startTimeLabel(game("10/6 - TBD"), tz), "TBD");
    assert.equal(startTimeLabel(game("TBD", "2026-10-06T04:00:00Z"), tz), "TBD", "midnight-ET placeholder stays TBD");
    assert.equal(startTimeLabel(game("Followed by"), tz), "Followed by");
    // "Starts M/D" is a multi-day event's first day: game.date is the clock.
    assert.equal(startTimeLabel(game("Starts 5/5 7:00 PM"), tz), fmt(DATE, tz));
    assert.equal(startTimeLabel(game("Starts 5/3"), tz), fmt(DATE, tz));
  }
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT", "not a date"), "Asia/Tokyo"), "8:00 PM");
  assert.equal(startTimeLabel(game("Scheduled", "not a date"), "Asia/Tokyo"), "Scheduled");
  assert.equal(startTimeLabel(game("", "not a date"), "Asia/Tokyo"), "");
});

test("tennis 'Not before' keeps its words and swaps the clock", () => {
  const d = "2026-09-08T19:00:00Z"; // 3:00 PM EDT
  assert.equal(startTimeLabel(game("Not before 3:00 PM", d), "America/New_York"), "Not before 3:00 PM");
  assert.equal(startTimeLabel(game("Not before 3:00 PM ET", d), "America/Los_Angeles"), "Not before 12:00 PM");
  assert.equal(startTimeLabel(game("Not before 3:00 PM", d), "Europe/London"), "Not before 8:00 PM");
  // The tournament-day fallback date (midnight) disagrees with the clock: the
  // text wins, read as Eastern.
  assert.equal(startTimeLabel(game("Not before 3:00 PM", "2026-09-08T04:00:00Z"), "Asia/Tokyo"), "Not before 4:00 AM");
});

test("a clock in another zone's letters uses game.date", () => {
  const d = "2026-10-07T01:00:00Z"; // 8:00 PM CDT
  assert.equal(startTimeLabel(game("8:00 PM CT", d), "America/New_York"), "9:00 PM");
  assert.equal(startTimeLabel(game("8:00 PM PDT", d), "America/Chicago"), "8:00 PM");
});

test("text clock and game.date disagree → the text wins (read as Eastern)", () => {
  // ESPN moved the game to 8:00 PM; date still says 7:00 PM.
  const stale = "2026-10-06T23:00:00Z";
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT", stale), "America/New_York"), "8:00 PM");
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT", stale), "America/Los_Angeles"), "5:00 PM");
  // Under a minute apart counts as agreement: game.date wins.
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT", "2026-10-07T00:00:30Z"), "America/New_York"), "8:00 PM");
});

test("US fall-back Sun Nov 1 2026: 1:00 PM EST", () => {
  const d = "2026-11-01T18:00:00Z";
  assert.equal(startTimeLabel(game("11/1 - 1:00 PM EST", d), "America/New_York"), "1:00 PM");
  assert.equal(startTimeLabel(game("11/1 - 1:00 PM EST", d), "America/Los_Angeles"), "10:00 AM");
  assert.equal(startTimeLabel(game("11/1 - 1:00 PM EST", d), "Europe/London"), "6:00 PM");
  // Same clock, stale date: the parse must land on the EST side too.
  assert.equal(startTimeLabel(game("11/1 - 1:00 PM EST", "2026-11-01T12:00:00Z"), "Europe/London"), "6:00 PM");
});

test("EU change Oct 25 2026: London is 4 h ahead of ET that week, 5 h before", () => {
  assert.equal(startTimeLabel(game("10/24 - 1:00 PM EDT", "2026-10-24T17:00:00Z"), "Europe/London"), "6:00 PM");
  assert.equal(startTimeLabel(game("10/25 - 1:00 PM EDT", "2026-10-25T17:00:00Z"), "Europe/London"), "5:00 PM");
  assert.equal(startTimeLabel(game("10/25 - 1:00 PM EDT", "2026-10-25T12:00:00Z"), "Europe/London"), "5:00 PM");
});

test("8 PM ET is next morning in Tokyo, on the next day's slate", () => {
  assert.equal(startTimeLabel(game("10/6 - 8:00 PM EDT"), "Asia/Tokyo"), "9:00 AM");
  setServiceTimeZone("Asia/Tokyo");
  try {
    assert.equal(etSlateYmd(DATE), "20261007");
  } finally {
    setServiceTimeZone(undefined);
  }
  setServiceTimeZone("America/New_York");
  try {
    assert.equal(etSlateYmd(DATE), "20261006");
  } finally {
    setServiceTimeZone(undefined);
  }
});

test("12:30 AM ET stays on the previous night's slate (1 AM rule)", () => {
  const d = "2026-10-05T04:30:00Z";
  assert.equal(startTimeLabel(game("10/5 - 12:30 AM EDT", d), "America/New_York"), "12:30 AM");
  assert.equal(startTimeLabel(game("10/5 - 12:30 AM EDT", d), "America/Los_Angeles"), "9:30 PM");
  setServiceTimeZone("America/New_York");
  try {
    assert.equal(etSlateYmd(d), "20261004");
  } finally {
    setServiceTimeZone(undefined);
  }
  // With a stale date, the parse uses the text's own 10/5, not the wrong day.
  assert.equal(startTimeLabel(game("10/5 - 12:30 AM EDT", "2026-10-05T04:00:00Z"), "America/New_York"), "12:30 AM");
});

test("New Year wrap: 1/1 text on a Dec 31 Eastern date", () => {
  // Stale date 12/31 11 PM EST; text says 1/1 12:30 AM EST.
  assert.equal(startTimeLabel(game("1/1 - 12:30 AM EST", "2027-01-01T04:00:00Z"), "America/New_York"), "12:30 AM");
  assert.equal(startTimeLabel(game("1/1 - 12:30 AM EST", "2027-01-01T04:00:00Z"), "UTC"), "5:30 AM");
});

test("cleanStatusDetail strips the zone and, on request, the M/D", () => {
  assert.equal(cleanStatusDetail("10/6 - 8:00 PM EDT", true), "8:00 PM");
  assert.equal(cleanStatusDetail("10/6 - 8:00 PM EDT", false), "10/6 - 8:00 PM");
});

// Every captured ESPN pre game: its status clock is game.date in New York. If
// ESPN ever stops sending Eastern, this is where it shows.
type Node = Record<string, unknown>;
function* preGames(node: unknown): Generator<{ date: string; detail: string }> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* preGames(n);
    return;
  }
  const o = node as Node;
  const type = (o.status as Node | undefined)?.type as Node | undefined;
  if (typeof o.date === "string" && type?.state === "pre" && typeof type.shortDetail === "string") {
    yield { date: o.date, detail: type.shortDetail };
  }
  for (const v of Object.values(o)) yield* preGames(v);
}

test("fixture guard: each pre game's status clock = game.date in New York", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  let checked = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const json = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    for (const g of preGames(json)) {
      const clock = g.detail.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (!clock || /TBD/i.test(g.detail)) continue;
      checked += 1;
      assert.equal(fmt(g.date, "America/New_York"), clock[1].replace(/\s+/, " "), `${f}: ${g.detail} vs ${g.date}`);
      assert.equal(startTimeLabel({ date: g.date, statusDetail: g.detail }, "America/New_York"), clock[1].replace(/\s+/, " "));
    }
  }
  assert.ok(checked > 0, "no fixture pre game with a clock");
});
