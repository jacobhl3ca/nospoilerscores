// Finals pairings that name an earlier round's winners stay behind a
// "Show teams" tap (src/lib/pairingMask.ts). Real ESPN events from
// tests/fixtures; the NRL Grand Final is the prelim fixture moved to week 4,
// the way ESPN files it (event 604845, read 2026-09-27).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
type G = { sport: string; isPlayoff: boolean; playoffLabel: string | null };
const espn = await jiti.import<{
  parseGame: (event: unknown, sport: string) => G;
  aflFinalsLabel: (headline: string) => string;
}>("../src/lib/espn.ts");
const { pairingSpoilsEarlierRound } = await jiti.import<{
  pairingSpoilsEarlierRound: (g: G) => boolean;
}>("../src/lib/pairingMask.ts");

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const nrlWeek = (week: number) => {
  const ev = fixture("nrl-prelim-final-event.json");
  ev.week = { number: week };
  return espn.parseGame(ev, "nrl");
};

test("NRL: finals week 1 shows its teams, every later round masks", () => {
  assert.equal(pairingSpoilsEarlierRound(nrlWeek(1)), false);
  for (const [week, label] of [[2, "Semi-Final"], [3, "Preliminary Final"], [4, "Grand Final"]] as const) {
    const g = nrlWeek(week);
    assert.equal(g.playoffLabel, label);
    assert.equal(pairingSpoilsEarlierRound(g), true, label);
  }
});

test("NRL regular season never masks", () => {
  assert.equal(pairingSpoilsEarlierRound(espn.parseGame(fixture("nrl-round27-event.json"), "nrl")), false);
});

test("AFL finals labels keep the round and drop the team names", () => {
  assert.equal(espn.aflFinalsLabel("GF - Dockers vs Lions"), "Grand Final");
  assert.equal(espn.aflFinalsLabel("QF2 - Swans vs Lions"), "Qualifying Final");
  assert.equal(espn.aflFinalsLabel("EF2 - Crows vs Bulldogs"), "Elimination Final");
  assert.equal(espn.aflFinalsLabel("SF2 - Lions vs Crows"), "Semi-Final");
  assert.equal(espn.aflFinalsLabel("PF1 - Hawks vs Lions"), "Preliminary Final");
  assert.equal(espn.aflFinalsLabel("Hawks vs Lions"), "Finals", "an unknown shape never passes team names through");
  const gf = espn.parseGame(fixture("afl-grand-final-event.json"), "afl");
  assert.equal(gf.playoffLabel, "Grand Final");
  assert.equal(pairingSpoilsEarlierRound(gf), true);
});

test("AFL: wildcard and qualifying finals are ladder-seeded, elimination finals on mask", () => {
  const g = (playoffLabel: string) => ({ sport: "afl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("Wildcard Round")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Qualifying Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Elimination Final")), true);
  assert.equal(pairingSpoilsEarlierRound(g("Finals")), true, "unknown round masks");
});

test("CFL: division semi-finals show, division finals and the Grey Cup mask", () => {
  const g = (playoffLabel: string | null) => ({ sport: "cfl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("Eastern Semi-Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Western Semi-Final")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Eastern Final")), true);
  assert.equal(pairingSpoilsEarlierRound(g("112th Grey Cup")), true);
  assert.equal(pairingSpoilsEarlierRound(g(null)), true, "a playoff game with no title masks");
  assert.equal(pairingSpoilsEarlierRound({ sport: "cfl", isPlayoff: false, playoffLabel: null }), false);
});

// US leagues (2026-09-29): every label below is a real ESPN notes headline.
test("MLB: the Wild Card round shows, the Division Series on masks", () => {
  const g = (playoffLabel: string | null) => ({ sport: "mlb", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("ALWC - Game 1")), false);
  assert.equal(pairingSpoilsEarlierRound(g("NLWC - Game 3 If Necessary")), false);
  assert.equal(pairingSpoilsEarlierRound(g("NLDS - Game 1")), true);
  assert.equal(pairingSpoilsEarlierRound(g("ALCS - Game 2")), true);
  assert.equal(pairingSpoilsEarlierRound(g("World Series - Game 2")), true);
  assert.equal(pairingSpoilsEarlierRound(g(null)), true, "a postseason game with no note masks");
  assert.equal(pairingSpoilsEarlierRound({ sport: "mlb", isPlayoff: false, playoffLabel: null }), false);
});

test("MLB: an NLDS event shaped like ESPN's Oct 3 listing parses as a masked playoff game", () => {
  const ev = {
    id: "401900001", date: "2026-10-03T04:00Z", name: "TBD at Los Angeles Dodgers", shortName: "TBD @ LAD",
    season: { year: 2026, type: 3 },
    status: { period: 0, type: { name: "STATUS_SCHEDULED", state: "pre", completed: false } },
    competitions: [{
      notes: [{ type: "event", headline: "NLDS - Game 1" }],
      broadcasts: [],
      competitors: [
        { homeAway: "home", score: "0", team: { id: "19", abbreviation: "LAD", displayName: "Los Angeles Dodgers", shortDisplayName: "Dodgers" } },
        { homeAway: "away", score: "0", team: { id: "-1", abbreviation: "TBD", displayName: "TBD", shortDisplayName: "TBD" } },
      ],
    }],
  };
  const g = espn.parseGame(ev, "mlb");
  assert.equal(g.isPlayoff, true);
  assert.equal(pairingSpoilsEarlierRound(g), true);
});

test("NBA: play-in seed games and the first round show, the 8th Seed Game and later rounds mask", () => {
  const g = (playoffLabel: string | null) => ({ sport: "nba", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("NBA Play-In - East - 7th Place vs 8th Place")), false);
  assert.equal(pairingSpoilsEarlierRound(g("NBA Play-In - West - 9th Place vs 10th Place")), false);
  assert.equal(pairingSpoilsEarlierRound(g("NBA Play-In - East - 8th Seed Game")), true);
  assert.equal(pairingSpoilsEarlierRound(g("East 1st Round - Game 1")), false);
  assert.equal(pairingSpoilsEarlierRound(g("West 2nd Round - Game 2")), true);
  assert.equal(pairingSpoilsEarlierRound(g("West Finals - Game 2")), true);
  assert.equal(pairingSpoilsEarlierRound(g(null)), true, "the NBA Finals carry no note");
});

test("NHL: the first round shows, every later round masks", () => {
  const g = (playoffLabel: string | null) => ({ sport: "nhl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("East 1st Round - Game 2")), false);
  assert.equal(pairingSpoilsEarlierRound(g("West 2nd Round - Game 2")), true);
  assert.equal(pairingSpoilsEarlierRound(g("East Final - Game 1")), true);
  assert.equal(pairingSpoilsEarlierRound(g(null)), true, "the Stanley Cup Final carries no note");
});

test("NFL: Wild Card weekend and the Pro Bowl show, the Divisional round on masks", () => {
  const g = (playoffLabel: string | null) => ({ sport: "nfl", isPlayoff: true, playoffLabel });
  assert.equal(pairingSpoilsEarlierRound(g("NFC Wild Card Playoffs")), false);
  assert.equal(pairingSpoilsEarlierRound(g("Pro Bowl")), false);
  assert.equal(pairingSpoilsEarlierRound(g("AFC Divisional Playoffs")), true);
  assert.equal(pairingSpoilsEarlierRound(g("NFC Championship")), true);
  assert.equal(pairingSpoilsEarlierRound(g("Super Bowl LX")), true);
});

test("leagues with no entry are untouched", () => {
  assert.equal(pairingSpoilsEarlierRound({ sport: "wnba", isPlayoff: true, playoffLabel: null }), false);
  assert.equal(pairingSpoilsEarlierRound({ sport: "ncaam", isPlayoff: true, playoffLabel: "NCAA Men's Basketball Championship - Final Four" }), false);
});

// "Show all teams" (Jacob 9/30): one tap reveals a whole column. Since 10/2 a
// tap is kept per matchup in localStorage; a TBD side keeps the per-visit
// game id in sessionStorage.
type PG = { id: string; sport: string; date: string; homeTeam: { id: string; displayName: string }; awayTeam: { id: string; displayName: string } };
const team = (sport: string, raw: string, displayName = `Team ${raw}`) => ({ id: `${sport}-${raw}`, displayName });
const pg = (id: string, home: string, away: string, date = "2026-10-04T00:08Z", sport = "mlb"): PG =>
  ({ id, sport, date, homeTeam: team(sport, home, home === "-1" ? "TBD" : undefined), awayTeam: team(sport, away, away === "-1" ? "TBD" : undefined) });
type Mask = {
  pairingKey: (g: PG) => string | null;
  revealPairings: (gs: PG[]) => void;
  revealPairing: (g: PG) => void;
  clearRememberedPairings: () => string;
  restoreRememberedPairings: (prev: string) => void;
  PAIRING_LOCAL_KEY: string;
};
const mask = await jiti.import<Mask>("../src/lib/pairingMask.ts");

function fakeStorage(local: Map<string, string>, session: Map<string, string>) {
  const writes = { local: 0, session: 0 };
  const api = (m: Map<string, string>, which: "local" | "session") => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { writes[which]++; m.set(k, v); },
    removeItem: (k: string) => { writes[which]++; m.delete(k); },
  });
  (globalThis as { window?: unknown }).window = { localStorage: api(local, "local"), sessionStorage: api(session, "session") };
  return writes;
}
const clearStorage = () => { delete (globalThis as { window?: unknown }).window; };

test("pairingKey: sport, ET year, sorted raw ids; a home/away swap gives one key", () => {
  const a = mask.pairingKey(pg("g1", "30", "10"));
  assert.equal(a, "mlb:2026:10-30");
  assert.equal(mask.pairingKey(pg("g2", "10", "30")), a);
  // 00:30 UTC on Jan 1 is still Dec 31 in New York.
  assert.equal(mask.pairingKey(pg("g3", "10", "30", "2027-01-01T00:30Z")), "mlb:2026:10-30");
  assert.notEqual(mask.pairingKey(pg("g4", "10", "30", "2026-10-04T00:08Z", "nhl")), a);
});

test("pairingKey: a placeholder side gets no key", () => {
  assert.equal(mask.pairingKey(pg("g1", "19", "-1")), null);
  assert.equal(mask.pairingKey({ ...pg("g1", "19", "5"), awayTeam: { id: "mlb-5", displayName: "TBD Away" } }), null);
  assert.equal(mask.pairingKey({ ...pg("g1", "19", "5"), awayTeam: { id: "", displayName: "Somebody" } }), null);
});

test("pairingKey: a date that does not parse gives no key and does not throw", () => {
  assert.equal(mask.pairingKey(pg("g1", "19", "5", "")), null);
  assert.equal(mask.pairingKey(pg("g1", "19", "5", "not a date")), null);
});

test("a reveal opens every game of that matchup and no other", () => {
  const local = new Map<string, string>(), session = new Map<string, string>();
  fakeStorage(local, session);
  try {
    mask.revealPairing(pg("g1", "30", "10"));
    const keys = (local.get(mask.PAIRING_LOCAL_KEY) ?? "").split(",");
    assert.ok(keys.includes(mask.pairingKey(pg("g2", "10", "30"))!), "game 2 of the series, teams swapped, is open");
    assert.ok(!keys.includes(mask.pairingKey(pg("g9", "10", "147"))!), "a different pair stays covered");
    assert.equal(session.get("hs:pairing-revealed"), undefined, "a full pair never writes the per-visit store");
  } finally { clearStorage(); }
});

test("a TBD card keeps the per-visit game id, never a stored matchup", () => {
  const local = new Map<string, string>(), session = new Map<string, string>([["hs:pairing-revealed", "a"]]);
  fakeStorage(local, session);
  try {
    mask.revealPairing(pg("tbd1", "19", "-1"));
    assert.equal(local.get(mask.PAIRING_LOCAL_KEY) ?? "", "");
    assert.deepEqual(session.get("hs:pairing-revealed")!.split(",").sort(), ["a", "tbd1"]);
  } finally { clearStorage(); }
});

test("revealPairings writes each store once and keeps earlier taps", () => {
  const local = new Map<string, string>([["hs:pairing-revealed-v2", "mlb:2026:1-2"]]);
  const session = new Map<string, string>([["hs:pairing-revealed", "a"]]);
  const writes = fakeStorage(local, session);
  try {
    mask.revealPairings([pg("b", "3", "4"), pg("c", "5", "6"), pg("d", "19", "-1"), pg("e", "-1", "-2"), pg("b", "3", "4")]);
    assert.deepEqual(writes, { local: 1, session: 1 });
    assert.deepEqual(local.get(mask.PAIRING_LOCAL_KEY)!.split(",").sort(), ["mlb:2026:1-2", "mlb:2026:3-4", "mlb:2026:5-6"]);
    assert.deepEqual(session.get("hs:pairing-revealed")!.split(",").sort(), ["a", "d", "e"]);
  } finally { clearStorage(); }
});

test("keys older than last year are pruned on write", () => {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
  const old = `mlb:${year - 2}:1-2`, last = `nhl:${year - 1}:3-4`;
  const local = new Map<string, string>([["hs:pairing-revealed-v2", `${old},${last}`]]);
  fakeStorage(local, new Map());
  try {
    mask.revealPairing(pg("g", "5", "6", `${year}-10-04T16:00Z`));
    assert.deepEqual(local.get(mask.PAIRING_LOCAL_KEY)!.split(",").sort(), [last, `mlb:${year}:5-6`].sort());
  } finally { clearStorage(); }
});

test("Reset all clears the stored matchups and the undo puts them back", () => {
  const local = new Map<string, string>([["hs:pairing-revealed-v2", "mlb:2026:1-2"]]);
  fakeStorage(local, new Map());
  try {
    const prev = mask.clearRememberedPairings();
    assert.equal(prev, "mlb:2026:1-2");
    assert.equal(local.has(mask.PAIRING_LOCAL_KEY), false);
    mask.revealPairing(pg("g", "3", "4"));
    mask.restoreRememberedPairings(prev);
    assert.deepEqual(local.get(mask.PAIRING_LOCAL_KEY)!.split(",").sort(), ["mlb:2026:1-2", "mlb:2026:3-4"], "a tap inside the undo window survives the undo");
  } finally { clearStorage(); }
});

// The cover and the full card share one rating gate (src/lib/ratingGate.ts).
test("shouldShowRating: live or final with a rating and ratings on, never in a delay", async () => {
  const { shouldShowRating } = await jiti.import<{
    shouldShowRating: (g: { state: string; statusDetail: string; rating: number | null }, on: boolean) => boolean;
  }>("../src/lib/ratingGate.ts");
  const rows: [string, string, number | null, boolean, boolean][] = [
    ["pre", "7:08 PM ET", 80, true, false],
    ["in", "Top 5th", 80, true, true],
    ["in", "Rain Delay", 80, true, false],
    ["in", "Delayed", 80, true, false],
    ["post", "Final", 80, true, true],
    ["post", "Final", null, true, false],
    ["post", "Final", 80, false, false],
    ["in", "Top 5th", 80, false, false],
  ];
  for (const [state, statusDetail, rating, on, want] of rows) {
    assert.equal(shouldShowRating({ state, statusDetail, rating }, on), want, `${state} / ${statusDetail} / ${rating} / ratings ${on}`);
  }
});
