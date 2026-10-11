import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// The year-round "Tennis" column (2026-10-11, a user request: "no tennis
// anywhere after the US Open"). One opt-in column for the ATP Masters 1000s,
// the WTA 1000s and the two tour Finals, men and women together, read from
// both of ESPN's tennis feeds. The four Slam columns must not change.
//
// espn.ts imports "./types" without an extension, so it is loaded through jiti
// (see preseason-separation.test.ts). The fixture is the real ATP and WTA
// scoreboards from 2026-10-11 (Shanghai + Wuhan + the China Open women's
// final, next to five lower events), trimmed, plus every 2026 event name
// either feed listed that day.

type Loose = Record<string, unknown>;
type Match = {
  id?: string;
  date?: string;
  round?: { displayName?: string };
  status?: { period?: number; type?: { state?: string; completed?: boolean; name?: string } };
  competitors?: Loose[];
};
type Event = { id: string; date: string; name: string; major?: boolean; groupings: Array<{ grouping: { slug: string }; competitions: Match[] }> };
type GameLike = {
  id: string;
  date: string;
  state: string;
  name: string;
  rating: number | null;
  formatTag?: string | null;
  seriesNote: string | null;
  playoffLabel: string | null;
  homeTeam: { score: string };
  awayTeam: { score: string };
};
type Slate = { date: string; games: GameLike[] } | null | undefined;
type League = { sport: string; label: string; games: GameLike[]; nextGameDay?: Slate; previousGameDay?: Slate; fetchFailed?: boolean } | null;
type Cfg = { sport: string; label: string; startDate?: string; endDate?: string; excludeFromAuto?: boolean; backfillOnly?: boolean };
type TourRow = { id: string; city: string; name: RegExp; draws: string };

const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  ALL_LEAGUES: Cfg[];
  TENNIS_TOUR_EVENTS: TourRow[];
  tennisTourEvent: (e: { id?: string; name?: string }) => TourRow | null;
  isBigTennisEvent: (e: { id?: string; name?: string }, drawSlug?: string) => boolean;
  isTennisTourDay: (ymd: string) => boolean;
  isLeagueActive: (l: unknown, d: Date) => boolean;
  tennisRoundShort: (label: string) => string;
  buildTennisGames: (events: unknown[], when?: string | { from: string; to: string }, tourColumn?: boolean) => GameLike[];
  isTennisTourConfig: (l: { sport: string; label: string }) => boolean;
  sportDisplayLabel: (sport: string, d: Date) => string;
  pickAndAssignLeagues: (d: Date, count?: number, hidden?: string[]) => Cfg[];
  getSeasonOpener: (sport: string, label: string, d: Date) => { label: string } | null;
  fetchAllLeagues: (date: string, third: undefined, overrides: { first: string }, slotCount: number) => Promise<League[]>;
}>("../src/lib/espn.ts");
const etDay = await jiti.import<{
  getEtServiceDate: () => Date;
  toYmd: (d: Date) => string;
  setServiceTimeZone: (tz: string | undefined) => void;
}>("../src/lib/etDay.ts");

// The fixture's match times are real (Shanghai and Wuhan play overnight in the
// US), and a match belongs to the day it starts on in the reader's zone. Pin
// the zone so CI (UTC) buckets them the way a New York reader's board does.
etDay.setServiceTimeZone("America/New_York");

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/tennis-tour-2026-10-11.json", import.meta.url), "utf8")) as {
  atp: { events: Event[] };
  wta: { events: Event[] };
  names2026: [string, string][];
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const BOTH_FEEDS = [...FIXTURE.atp.events, ...FIXTURE.wta.events];
const DAY = "20261011";
const dayAt = (ymd: string) => new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00`);

// ── The gate ────────────────────────────────────────────────────────────────

// ESPN's 2026 names for the 15 events, read off the feed. A sponsor rename is
// caught here only when the fixture is refreshed; the monthly
// check-season-windows run compares the table to the live feed.
const EXPECTED_2026: Record<string, string> = {
  "256": "Qatar Total Energies Open",
  "25": "Dubai Duty Free Tennis Championships",
  "411": "BNP Paribas Open",
  "713": "Miami Open presented by Itau",
  "42": "Rolex Monte-Carlo Masters",
  "413": "Mutua Madrid Open",
  "414": "Internazionali BNL d'Italia",
  "421": "National Bank Open presented by Rogers",
  "718": "Cincinnati Open",
  "959": "China Open",
  "315": "Rolex Shanghai Masters",
  "381": "Dongfeng Voyah Wuhan Open",
  "13": "Rolex Paris Masters",
  "382": "WTA Finals",
  "339": "Nitto ATP Finals",
};

test("the fixture still carries ESPN's whole 2026 calendar", () => {
  assert.ok(FIXTURE.names2026.length >= 160, `only ${FIXTURE.names2026.length} names`);
  assert.equal(espn.TENNIS_TOUR_EVENTS.length, 15, "9 Masters 1000s + 10 WTA 1000s (6 shared with the men, 4 women-only) + 2 Finals");
});

test("every table row finds its 2026 event by id, and its pattern matches ESPN's name", () => {
  for (const row of espn.TENNIS_TOUR_EVENTS) {
    const hit = FIXTURE.names2026.find(([id]) => id === `${row.id}-2026`);
    assert.ok(hit, `${row.city}: no event ${row.id}-2026 on ESPN's 2026 calendar`);
    assert.equal(hit[1], EXPECTED_2026[row.id], `${row.city}: ESPN's name`);
    assert.ok(row.name.test(hit[1]), `${row.city}: ${row.name} does not match "${hit[1]}"`);
    assert.equal(espn.tennisTourEvent({ id: hit[0], name: hit[1] })?.city, row.city);
    // The fallback: an id ESPN re-issued still resolves, by the name alone.
    assert.equal(espn.tennisTourEvent({ id: "99999-2026", name: hit[1] })?.city, row.city);
  }
});

test("none of the other 151 events on ESPN's 2026 calendar passes the gate", () => {
  const big = new Set(espn.TENNIS_TOUR_EVENTS.map((r) => `${r.id}-2026`));
  const leaked: string[] = [];
  for (const [id, name] of FIXTURE.names2026) {
    if (big.has(id)) continue;
    const row = espn.tennisTourEvent({ id, name });
    if (!row) continue;
    // The one name twin: Doha's ATP 500 is "Qatar ExxonMobil Open", a separate
    // event from the WTA 1000 "Qatar Total Energies Open". The Doha row is
    // women-only, and the ATP event has no women's draw, so nothing shows.
    if (name === "Qatar ExxonMobil Open" && row.draws === "women" && !espn.isBigTennisEvent({ id, name }, "mens-singles")) continue;
    leaked.push(`${id} ${name} → ${row.city}`);
  }
  assert.deepEqual(leaked, []);
  // Spot checks for the near misses the patterns were written around.
  for (const name of [
    "Next Gen ATP Finals presented by PIF",
    "Grand Prix Open Villa de Madrid by Silverway",
    "BNP Paribas Fortis European Open",
    "Singapore Tennis Open presented by BNP Paribas",
    "American Tennis Open Miami",
    "Internazionali Femminili Di Brescia",
    "Lisboa Belem Open",
    "RoveretOpen Città della Pace",
  ]) {
    assert.equal(espn.tennisTourEvent({ id: "0-2026", name }), null, name);
  }
});

test("the tournament id is the same next year and last year", () => {
  // Read off ESPN for 2025: same ids, year suffix aside.
  assert.equal(espn.tennisTourEvent({ id: "315-2025", name: "Rolex Shanghai Masters" })?.city, "Shanghai");
  assert.equal(espn.tennisTourEvent({ id: "411-2025", name: "BNP Paribas Open" })?.city, "Indian Wells");
  // A renamed sponsor keeps its row through the id.
  assert.equal(espn.tennisTourEvent({ id: "411-2027", name: "Some Bank Open" })?.city, "Indian Wells");
});

test("the level is per draw: Dubai, Beijing and Doha count for the women only", () => {
  for (const id of ["25", "959", "256"]) {
    assert.equal(espn.isBigTennisEvent({ id: `${id}-2026` }, "womens-singles"), true, id);
    assert.equal(espn.isBigTennisEvent({ id: `${id}-2026` }, "mens-singles"), false, id);
  }
  assert.equal(espn.isBigTennisEvent({ id: "315-2026" }, "mens-singles"), true);
  assert.equal(espn.isBigTennisEvent({ id: "411-2026" }, "mens-singles"), true);
  assert.equal(espn.isBigTennisEvent({ id: "411-2026" }, "womens-singles"), true);
  assert.equal(espn.isBigTennisEvent({ id: "1079-2026", name: "Lisboa Belem Open" }), false);
});

// ── The season table ────────────────────────────────────────────────────────

test("the Tennis config sits after the four Slams and is never auto-picked", () => {
  const labels = espn.ALL_LEAGUES.filter((l) => l.sport === "tennis").map((l) => l.label);
  assert.deepEqual(labels, ["Aus Open", "French Open", "Wimbledon", "US Open", "Tennis"]);
  const tour = espn.ALL_LEAGUES.find((l) => l.sport === "tennis" && l.label === "Tennis")!;
  assert.equal(tour.excludeFromAuto, true);
  // backfillOnly would let Auto place it on a thin board, and would take it
  // out of getSeasonOpener, so an in-season gap would read "Returns Jan".
  assert.notEqual(tour.backfillOnly, true);
});

test("Auto never places the Tennis column, on any day, on a 3- or 5-column board", () => {
  for (let d = new Date(2026, 0, 1, 12); d.getFullYear() < 2028; d.setDate(d.getDate() + 1)) {
    for (const count of [3, 5]) {
      const labels = espn.pickAndAssignLeagues(new Date(d), count).map((l) => l.label);
      assert.ok(!labels.includes("Tennis"), `${d.toDateString()} (${count} columns): ${labels}`);
    }
  }
});

test("a day belongs to the Tennis column or to a Slam, never both", () => {
  for (const ymd of ["20260202", "20260310", "20260519", "20260815", DAY, "20261122", "20261130"]) {
    assert.equal(espn.isTennisTourDay(ymd), true, ymd);
  }
  // Aus Open, French Open, Wimbledon, US Open windows; then December and
  // early January, which no tennis config covers.
  for (const ymd of ["20260115", "20260201", "20260520", "20260606", "20260701", "20260824", "20260913", "20261201", "20261225", "20260105"]) {
    assert.equal(espn.isTennisTourDay(ymd), false, ymd);
  }
});

test("the tennis row reads the Slam inside a Slam window and Tennis outside it", () => {
  assert.equal(espn.sportDisplayLabel("tennis", dayAt(DAY)), "Tennis");
  assert.equal(espn.sportDisplayLabel("tennis", dayAt("20260701")), "Wimbledon");
  assert.equal(espn.sportDisplayLabel("tennis", dayAt("20260901")), "US Open");
  assert.equal(espn.sportDisplayLabel("tennis", dayAt("20260120")), "Aus Open");
  // December: no config is active, so the first one (the offseason row).
  assert.equal(espn.sportDisplayLabel("tennis", dayAt("20261215")), "Aus Open");
});

test("a gap between events is not an offseason: no 'Returns' line inside the window", () => {
  assert.equal(espn.getSeasonOpener("tennis", "Tennis", dayAt("20261022")), null);
  // December is: the column names the next thing to open, the Aus Open.
  assert.ok(espn.getSeasonOpener("tennis", "Aus Open", dayAt("20261215")));
});

// ── buildTennisGames ────────────────────────────────────────────────────────

const tournamentOf = (g: GameLike) => (g.formatTag ?? "").split(" · ")[0];

test("Oct 11: Shanghai, Wuhan and the Beijing final show; the lower events do not", () => {
  const games = espn.buildTennisGames(BOTH_FEEDS.filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i), DAY);
  const byTournament = new Map<string, number>();
  for (const g of games) byTournament.set(tournamentOf(g), (byTournament.get(tournamentOf(g)) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(byTournament), { Shanghai: 8, Beijing: 1, Wuhan: 3 });
  // Every card carries its tournament and round on the chip.
  assert.deepEqual([...new Set(games.map((g) => g.formatTag))].sort(), ["Beijing · Final", "Shanghai · R3", "Wuhan · R1"]);
  // The highlight query tag is ESPN's own event name + year, as for a Slam.
  assert.ok(games.every((g) => /^(Rolex Shanghai Masters|China Open|Dongfeng Voyah Wuhan Open) 2026$/.test(g.seriesNote ?? "")));
  // Nothing from Suzhou, Samsun, Mallorca, Rovereto or Lisbon, all of which
  // had singles matches that day in the same payloads.
  const lower = FIXTURE.wta.events.filter((e) => !espn.tennisTourEvent(e)).flatMap((e) => e.groupings.flatMap((g) => g.competitions.map((m) => m.id)));
  assert.ok(lower.length >= 8, "the fixture lost its lower-tier matches");
  assert.ok(!games.some((g) => lower.includes(g.id)));
});

test("qualifying is left out of the Tennis column", () => {
  const wuhan = FIXTURE.wta.events.find((e) => e.id === "381-2026")!;
  const quali = wuhan.groupings.flatMap((g) => g.competitions).filter((m) => /^Qualifying/.test(m.round?.displayName ?? ""));
  assert.ok(quali.length >= 4, "the fixture lost Wuhan's qualifying matches");
  const games = espn.buildTennisGames([wuhan], { from: "20261009", to: "20261019" });
  assert.ok(games.length >= 40);
  assert.ok(!games.some((g) => quali.some((m) => m.id === g.id)));
  assert.ok(!games.some((g) => /qual/i.test(g.formatTag ?? "")));
});

test("the men's draw of a women-only 1000 is dropped (Beijing, Oct 6)", () => {
  const china = FIXTURE.atp.events.find((e) => e.id === "959-2026")!;
  const mens = china.groupings.find((g) => g.grouping.slug === "mens-singles")!.competitions;
  assert.equal(mens.length, 1, "the fixture keeps the men's final");
  const games = espn.buildTennisGames([china], { from: "20261005", to: "20261012" });
  assert.ok(games.length >= 3);
  assert.ok(!games.some((g) => g.id === mens[0].id));
});

test("doubles never show", () => {
  const doubles = BOTH_FEEDS.flatMap((e) => e.groupings.filter((g) => g.grouping.slug.includes("doubles")).flatMap((g) => g.competitions.map((m) => m.id)));
  assert.ok(doubles.length >= 3);
  const games = espn.buildTennisGames(BOTH_FEEDS, { from: "20261001", to: "20261031" });
  assert.ok(!games.some((g) => doubles.includes(g.id)));
});

test("a men's tour match is best-of-3: a 2–1 finish is a decider, 2–0 is not", () => {
  const shanghai = FIXTURE.atp.events.find((e) => e.id === "315-2026")!;
  const games = espn.buildTennisGames([shanghai], { from: "20261010", to: "20261011" }).filter((g) => g.state === "post");
  const sets = (g: GameLike) => [Number(g.homeTeam.score), Number(g.awayTeam.score)].sort().join("-");
  const deciders = games.filter((g) => sets(g) === "1-2");
  const straight = games.filter((g) => sets(g) === "0-2");
  assert.ok(deciders.length > 0 && straight.length > 0, "the fixture needs both a 2–1 and a 2–0 result");
  assert.ok(deciders.every((g) => g.rating === 90), `2–1 ratings: ${deciders.map((g) => g.rating)}`);
  assert.ok(straight.every((g) => g.rating === 65), `2–0 ratings: ${straight.map((g) => g.rating)}`);
});

// A tour event re-dated onto another day, every match at 18:00Z (2 PM ET).
function redated(event: Event, ymd: string, patch: Partial<Event> = {}): Event {
  const e = clone(event);
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T18:00Z`;
  for (const g of e.groupings) for (const m of g.competitions) m.date = iso;
  return { ...e, ...patch };
}

test("a Slam day shows the Slam alone: a tour event is not let onto it", () => {
  const shanghai = FIXTURE.atp.events.find((e) => e.id === "315-2026")!;
  // Sep 1 is inside the US Open window.
  assert.deepEqual(espn.buildTennisGames([redated(shanghai, "20260901")], "20260901"), []);
  // The same matches as a Slam (major: true) show, with no chip: the Slam path.
  const asSlam = espn.buildTennisGames([redated(shanghai, "20260901", { id: "189-2026", name: "US Open", major: true })], "20260901");
  const mainDraw = shanghai.groupings[0].competitions.length;
  assert.equal(asSlam.length, mainDraw);
  assert.ok(asSlam.every((g) => !g.formatTag));
});

test("the Tennis column never shows a Slam match; a Slam column keeps its qualifying", () => {
  // Roland Garros qualifying starts May 18; the French Open window opens May 20.
  const wuhan = FIXTURE.wta.events.find((e) => e.id === "381-2026")!;
  const asSlam = redated(wuhan, "20260518", { id: "172-2026", name: "Roland Garros", major: true });
  assert.deepEqual(espn.buildTennisGames([asSlam], "20260518"), []);
  // Inside the Slam's own window nothing is dropped, as before.
  const inWindow = espn.buildTennisGames([redated(wuhan, "20260521", { id: "172-2026", name: "Roland Garros", major: true })], "20260521");
  assert.ok(inWindow.some((g) => /^Qualifying/.test(g.playoffLabel ?? "")));
});

// A range is one column's read, set by the day it is viewed from, not by the
// days the matches are on (PR #353 review: the Aus Open's last day looked a
// week ahead and put Doha cards under the "Aus Open" header).
test("a range builds one column: the asking column's, whatever days the matches are on", () => {
  const shanghai = FIXTURE.atp.events.find((e) => e.id === "315-2026")!;
  const slam = redated(shanghai, "20270131", { id: "154-2027", name: "Australian Open", major: true });
  const tour = redated(shanghai, "20270208");
  const range = { from: "20270125", to: "20270210" };
  const asSlam = espn.buildTennisGames([slam, tour], range, false);
  assert.ok(asSlam.length > 0);
  assert.ok(asSlam.every((g) => !g.formatTag), "no tour card in a Slam column's range");
  const asTour = espn.buildTennisGames([slam, tour], range, true);
  assert.ok(asTour.length > 0);
  assert.ok(asTour.every((g) => g.formatTag?.startsWith("Shanghai")), "no Slam card in the Tennis column's range");
});

test("only the year-round row is the tour config", () => {
  const rows = espn.ALL_LEAGUES.filter((l) => l.sport === "tennis");
  assert.deepEqual(rows.filter((l) => espn.isTennisTourConfig(l)).map((l) => l.label), ["Tennis"]);
  assert.equal(espn.isTennisTourConfig({ sport: "golf", label: "Tennis" }), false);
});

test("the round chip", () => {
  assert.equal(espn.tennisRoundShort("Quarterfinal"), "QF");
  assert.equal(espn.tennisRoundShort("Semifinal"), "SF");
  assert.equal(espn.tennisRoundShort("Round 3"), "R3");
  assert.equal(espn.tennisRoundShort("Final"), "Final");
  assert.equal(espn.tennisRoundShort("Round Robin"), "RR");
});

// ── The fetch: two feeds on a Tennis day, one on a Slam day ──────────────────

const realFetch = globalThis.fetch;
let requested: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
function serve(feeds: { atp?: unknown | null; wta?: unknown | null }) {
  requested = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    const feed = url.includes("/tennis/atp/scoreboard") ? "atp" : url.includes("/tennis/wta/scoreboard") ? "wta" : null;
    if (!feed) return new Response("{}", { status: 404 });
    const body = feeds[feed];
    return body === null ? new Response("{}", { status: 500 }) : json(body ?? { events: [] });
  }) as typeof fetch;
}
test.after(() => { globalThis.fetch = realFetch; });
const asked = (feed: "atp" | "wta") => requested.filter((u) => u.includes(`/tennis/${feed}/scoreboard`));
const ranged = (feed: "atp" | "wta") => asked(feed).filter((u) => /dates=\d{8}-\d{8}/.test(u));
async function column(date: string): Promise<League> {
  const [league] = await espn.fetchAllLeagues(date, undefined, { first: "tennis" }, 1);
  return league ?? null;
}

test("the Tennis column reads both feeds and shows a combined event once", async () => {
  serve({ atp: FIXTURE.atp, wta: FIXTURE.wta });
  const league = await column(DAY);
  assert.ok(league);
  assert.equal(league.label, "Tennis");
  assert.equal(league.fetchFailed, false);
  assert.ok(asked("atp").length >= 1 && asked("wta").length >= 1, requested.join("\n"));
  const tournaments = league.games.map(tournamentOf);
  assert.equal(tournaments.filter((t) => t === "Shanghai").length, 8, "ATP feed only");
  assert.equal(tournaments.filter((t) => t === "Wuhan").length, 3, "WTA feed only");
  // The China Open is on both feeds with both draws: its final shows once.
  assert.equal(tournaments.filter((t) => t === "Beijing").length, 1);
  assert.equal(new Set(league.games.map((g) => g.id)).size, league.games.length);
});

test("one feed down: the other still shows, and the column is not marked failed", async () => {
  serve({ atp: FIXTURE.atp, wta: null });
  const league = await column(DAY);
  assert.ok(league);
  assert.equal(league.fetchFailed, false);
  assert.ok(league.games.some((g) => tournamentOf(g) === "Shanghai"));
  assert.ok(!league.games.some((g) => tournamentOf(g) === "Wuhan"));
});

test("both feeds down: the column says the feed failed", async () => {
  serve({ atp: null, wta: null });
  const league = await column(DAY);
  assert.ok(league);
  assert.equal(league.fetchFailed, true);
  assert.equal(league.games.length, 0);
});

// The lookahead and the lookback only run from today on, so these anchor on
// the first Tennis-column day at or after the real service day (see
// endgame-slate.test.ts). Each scenario takes its own day: a ranged read is
// held for a few minutes per date range.
const TODAY = etDay.toYmd(etDay.getEtServiceDate());
const plusDays = (ymd: string, n: number) => {
  const d = dayAt(ymd);
  d.setDate(d.getDate() + n);
  return etDay.toYmd(d);
};
// A day with `clear` Tennis-column days on both sides, so a lookback or a
// lookahead from it never touches a Slam window.
function tourDayFrom(from: string, clear = 15): string {
  for (let i = 0; i < 800; i++) {
    const ymd = plusDays(from, i);
    let ok = true;
    for (let k = -clear; k <= clear && ok; k++) ok = espn.isTennisTourDay(plusDays(ymd, k));
    if (ok) return ymd;
  }
  throw new Error("no Tennis-column day found");
}
const pre = (m: Match): Match => ({ ...m, status: { period: 0, type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" } } });
function shanghaiOn(spec: { finished?: string; ahead?: string[] }): { events: Event[] } {
  const shanghai = FIXTURE.atp.events.find((e) => e.id === "315-2026")!;
  // Main-draw results only: the fixture's first Shanghai matches are qualifying.
  const done = shanghai.groupings[0].competitions.filter((m) => m.status?.type?.state === "post" && /^Round/.test(m.round?.displayName ?? ""));
  const at = (m: Match, ymd: string, hour: number): Match => ({ ...clone(m), date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hour}:00Z` });
  const matches: Match[] = [];
  if (spec.finished) matches.push(at(done[0], spec.finished, 16), at(done[1], spec.finished, 18));
  (spec.ahead ?? []).forEach((ymd, i) => matches.push(at(pre(done[2 + i]), ymd, 18)));
  return { events: [{ ...clone(shanghai), groupings: [{ grouping: { slug: "mens-singles" }, competitions: matches }] }] };
}

test("the last matches of a tournament ride under today's cards, and the ranged read is held", async () => {
  // Not TODAY itself: on 2026-10-11 that is DAY, whose range the tests above read.
  const day = tourDayFrom(plusDays(TODAY, 20));
  serve({ atp: shanghaiOn({ finished: day, ahead: [plusDays(day, 1), plusDays(day, 2)] }), wta: { events: [] } });
  const league = await column(day);
  assert.ok(league);
  assert.equal(league.games.length, 2);
  assert.equal(league.nextGameDay?.games.length, 2, "both upcoming matches, each on its own day");
  assert.deepEqual([ranged("atp").length, ranged("wta").length], [1, 1], "one ranged lookahead per feed");
  // A second pull (the board's 10 s live poll) re-reads the day, not the range.
  const before = requested.length;
  await column(day);
  assert.deepEqual([ranged("atp").length, ranged("wta").length], [1, 1], "no second ranged read");
  assert.equal(requested.length - before, 2, "the day's own read still goes out, once per feed");
});

test("an empty day between events shows the last matches played", async () => {
  const day = tourDayFrom(plusDays(tourDayFrom(plusDays(TODAY, 20)), 40));
  serve({ atp: shanghaiOn({ finished: plusDays(day, -3) }), wta: { events: [] } });
  const league = await column(day);
  assert.ok(league);
  assert.equal(league.games.length, 0);
  assert.ok(!league.nextGameDay);
  assert.equal(league.previousGameDay?.date, plusDays(day, -3));
  assert.equal(league.previousGameDay?.games.length, 2);
  // Not the 14 single-day reads the team-sport lookback makes.
  assert.ok(asked("atp").length <= 3, `${asked("atp").length} ATP requests`);
});

test("a Slam day reads the ATP feed alone, as before", async () => {
  const slams = espn.ALL_LEAGUES.filter((l) => l.sport === "tennis" && l.label !== "Tennis");
  let day = TODAY;
  for (let i = 0; i < 800 && !slams.some((l) => espn.isLeagueActive(l, dayAt(day))); i++) day = plusDays(day, 1);
  serve({ atp: { events: [] }, wta: { events: [] } });
  const league = await column(day);
  assert.ok(league);
  assert.notEqual(league.label, "Tennis");
  assert.ok(asked("atp").length >= 1);
  assert.equal(asked("wta").length, 0, requested.join("\n"));
});

// The boundary: the last day of a Slam window, with the Tennis column's first
// day right after it (Feb 1 → Feb 2, Sep 15 → Sep 16).
function lastSlamDayBeforeTour(from: string): string {
  for (let i = 0; i < 800; i++) {
    const ymd = plusDays(from, i);
    const slam = espn.ALL_LEAGUES.some((l) => l.sport === "tennis" && !espn.isTennisTourConfig(l) && espn.isLeagueActive(l, dayAt(ymd)));
    if (slam && espn.isTennisTourDay(plusDays(ymd, 1))) return ymd;
  }
  throw new Error("no Slam-to-Tennis boundary found");
}

test("a Slam's last day does not look ahead into the tour, and still reads the ATP feed alone", async () => {
  const day = lastSlamDayBeforeTour(TODAY);
  const ahead = shanghaiOn({ ahead: [plusDays(day, 3), plusDays(day, 4)] });
  serve({ atp: ahead, wta: ahead });
  const league = await column(day);
  assert.ok(league);
  assert.notEqual(league.label, "Tennis");
  assert.equal(league.games.length, 0);
  assert.ok(!league.nextGameDay, "no tour card under a Slam header");
  assert.equal(asked("wta").length, 0, requested.join("\n"));
});

test("the Tennis column's first day does not look back into the Slam", async () => {
  const day = plusDays(lastSlamDayBeforeTour(TODAY), 1);
  const slam = shanghaiOn({ finished: plusDays(day, -2) });
  slam.events[0] = { ...slam.events[0], id: "154-2027", name: "Australian Open", major: true };
  serve({ atp: slam, wta: { events: [] } });
  const league = await column(day);
  assert.ok(league);
  assert.equal(league.label, "Tennis");
  assert.equal(league.games.length, 0);
  assert.ok(!league.previousGameDay, "no Slam card under the Tennis header");
});

test("a ranged read that lost one feed is not held", async () => {
  const day = tourDayFrom(plusDays(tourDayFrom(plusDays(tourDayFrom(plusDays(TODAY, 20)), 40)), 40));
  serve({ atp: shanghaiOn({ finished: day, ahead: [plusDays(day, 1)] }), wta: null });
  await column(day);
  const first = ranged("atp").length;
  assert.ok(first >= 1);
  await column(day);
  assert.equal(ranged("atp").length, first * 2, "the range is read again: the WTA half was missing");
});

// ── The column subtitle ─────────────────────────────────────────────────────

test("a chip card's round never feeds the column-wide round subtitle", () => {
  const src = readFileSync(new URL("../src/components/LeagueColumn.tsx", import.meta.url), "utf8");
  assert.ok(
    /if \(sport === "tennis"\) \{[\s\S]{0,700}\(games \?\? \[\]\)\.filter\(\(g\) => !g\.formatTag\)\.map\(\(g\) => g\.playoffLabel\)/.test(src),
    "two tournaments can share a day at different rounds, so the Tennis column must not print one round for both",
  );
});
