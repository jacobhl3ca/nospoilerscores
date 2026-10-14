import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSchedule,
  scheduleTimeLabel,
  sortScheduleGames,
  visibleScheduleRows,
  SCHEDULE_CONDENSE_LIMIT,
} from "../src/lib/scheduleDay.ts";
import type { Game, Sport, Team } from "../src/lib/types.ts";

const teamOf = (abbr: string, id = abbr): Team => {
  const t = {
    id,
    abbreviation: abbr,
    displayName: `${abbr} Team`,
    shortDisplayName: abbr,
    logo: `https://a.espncdn.com/${abbr}.png`,
    color: "000000",
    record: "10-5",
    rank: null,
  } as Partial<Team>;
  // A trap: any read of score / winner throws, so the test fails if the
  // schedule ever looks at them.
  Object.defineProperty(t, "score", { get() { throw new Error("score read"); } });
  Object.defineProperty(t, "winner", { get() { throw new Error("winner read"); } });
  return t as Team;
};

let n = 0;
const game = (sport: Sport, away: string, home: string, iso: string, extra: Partial<Game> = {}): Game => ({
  id: `g${++n}`,
  sport,
  date: iso,
  name: `${away} at ${home}`,
  shortName: `${away} @ ${home}`,
  state: "pre",
  statusDetail: "",
  clock: "",
  period: 0,
  completed: false,
  homeTeam: teamOf(home),
  awayTeam: teamOf(away),
  broadcasts: ["ESPN"],
  venue: "",
  rating: null,
  seriesNote: null,
  playoffLabel: null,
  isPreseason: false,
  ...extra,
} as unknown as Game);

const TZ = "America/New_York";

test("groups keep the given league order, drop empty and skipped leagues", () => {
  const out = buildSchedule([
    { sport: "nfl", label: "NFL", games: [game("nfl", "BUF", "LAR", "2026-10-15T00:15:00Z")] },
    { sport: "golf", label: "Golf", games: [game("golf", "A", "B", "2026-10-14T16:00:00Z")] },
    { sport: "nba", label: "NBA", games: [] },
    { sport: "nhl", label: "NHL", games: [game("nhl", "NYR", "WSH", "2026-10-14T23:00:00Z")] },
  ], { tz: TZ });
  assert.deepEqual(out.map((g) => g.sport), ["nfl", "nhl"]);
  assert.equal(out[0].rows[0].away.abbr, "BUF");
  assert.equal(out[0].rows[0].home.abbr, "LAR");
  assert.equal(out[0].rows[0].network, "ESPN");
});

test("time column: clock before, LIVE during, Final after, never a score", () => {
  const pre = game("mlb", "CLE", "TB", "2026-10-15T00:00:00Z", { statusDetail: "10/14 - 8:00 PM EDT" });
  const live = game("mlb", "NYY", "BOS", "2026-10-14T23:00:00Z", { state: "in", statusDetail: "Top 5th" });
  const delayed = game("mlb", "SEA", "HOU", "2026-10-14T22:00:00Z", { state: "in", statusDetail: "Rain Delay" });
  const fin = game("mlb", "LAD", "SD", "2026-10-14T20:00:00Z", { state: "post", statusDetail: "Final" });
  const ppd = game("mlb", "CHC", "STL", "2026-10-14T20:00:00Z", { state: "post", statusDetail: "Postponed" });
  assert.equal(scheduleTimeLabel(pre, TZ), "8:00 PM");
  assert.equal(scheduleTimeLabel(live, TZ), "LIVE");
  assert.equal(scheduleTimeLabel(delayed, TZ), "Delay");
  assert.equal(scheduleTimeLabel(fin, TZ), "Final");
  assert.equal(scheduleTimeLabel(ppd, TZ), "PPD");
  const out = buildSchedule([{ sport: "mlb", label: "MLB", games: [fin, pre, live, delayed, ppd] }], { tz: TZ });
  const text = JSON.stringify(out[0].rows.map((r) => ({ ...r, game: undefined })));
  assert.doesNotMatch(text, /\b\d{1,3}\s*[-–]\s*\d{1,3}\b/);
});

test("board order: starred first, live first (delay last), then by time, finals at the bottom", () => {
  const a = game("nhl", "VAN", "SEA", "2026-10-14T23:00:00Z");
  const b = game("nhl", "FLA", "BUF", "2026-10-14T21:00:00Z", { state: "post", statusDetail: "Final" });
  const c = game("nhl", "NYR", "WSH", "2026-10-14T22:00:00Z", { state: "in" });
  const d = game("nhl", "TOR", "MTL", "2026-10-14T22:30:00Z", { state: "in", statusDetail: "Delayed" });
  const e = game("nhl", "BOS", "DET", "2026-10-15T01:00:00Z");
  const sorted = sortScheduleGames([a, b, c, d, e], []);
  assert.deepEqual(sorted.map((g) => g.awayTeam.abbreviation), ["NYR", "TOR", "VAN", "BOS", "FLA"]);
  const starred = sortScheduleGames([a, b, c, d, e], ["DET"]);
  assert.equal(starred[0].homeTeam.abbreviation, "DET");
});

test("series note shows only when every game shares the round", () => {
  const one = buildSchedule([{ sport: "mlb", label: "MLB", games: [
    game("mlb", "CLE", "TB", "2026-10-15T00:00:00Z", { playoffLabel: "ALCS - Game 1" }),
  ] }], { tz: TZ });
  assert.equal(one[0].note, "ALCS - Game 1");
  const mixed = buildSchedule([{ sport: "mlb", label: "MLB", games: [
    game("mlb", "CLE", "TB", "2026-10-15T00:00:00Z", { playoffLabel: "ALCS - Game 1" }),
    game("mlb", "MIL", "LAD", "2026-10-15T00:00:00Z", { playoffLabel: "NLCS - Game 2" }),
  ] }], { tz: TZ });
  assert.equal(mixed[0].note, null);
});

test("5 or fewer rows show in full; 6+ show the top 3 and Show N more", () => {
  const five = [1, 2, 3, 4, 5];
  assert.deepEqual(visibleScheduleRows(five, false), { shown: five, more: 0 });
  const eight = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(visibleScheduleRows(eight, false), { shown: [1, 2, 3], more: 8 - SCHEDULE_CONDENSE_LIMIT });
  assert.deepEqual(visibleScheduleRows(eight, true), { shown: eight, more: 0 });
});

test("network names are shortened like the card chip", () => {
  const g = game("mlb", "CLE", "TB", "2026-10-15T00:00:00Z", { broadcasts: ["MLB Network"] });
  assert.equal(buildSchedule([{ sport: "mlb", label: "MLB", games: [g] }], { tz: TZ })[0].rows[0].network, "MLB");
  const none = game("mlb", "CLE", "TB", "2026-10-15T00:00:00Z", { broadcasts: [] });
  assert.equal(buildSchedule([{ sport: "mlb", label: "MLB", games: [none] }], { tz: TZ })[0].rows[0].network, null);
});
