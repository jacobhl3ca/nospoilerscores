import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// The endgame slate (Jacob 9/11–9/12): once a league has at most ENDGAME_MAX
// scheduled games left in the next 7 days, fetchLeague surfaces every one of
// them under today's cards, each on its own day — the two Slam finals under
// the semis, the NFL divisional round, a World Series. Above that count the
// column keeps its today-only slate so a normal Premier League week never
// stacks (the 6/19 World Cup call).
//
// espn.ts imports "./types" without an extension, so it is loaded through
// jiti (see preseason-separation.test.ts). Every network read goes through
// `fetch`, which is stubbed below with real ESPN scoreboard shapes captured
// on 2026-09-12 and re-dated relative to the viewed day.

type Loose = Record<string, unknown>;
type Ev = {
  id: string;
  date: string;
  status?: { type?: Loose };
  competitions: Array<{
    id?: string;
    date?: string;
    status?: { type?: Loose };
    competitors?: Array<{ id?: string; team?: Loose }>;
  }>;
};
type Match = { id?: string; date?: string; status?: { type?: { state?: string; completed?: boolean; name?: string } } };
type TennisParts = {
  wrapper: Loose;
  groupingMeta: Record<string, Loose>;
  mensSemis: Match[];
  womensSemis: Match[];
  mensQF: Match[];
  womensQF: Match[];
  mensFinal: Match;
  womensFinal: Match;
  doublesFinal: Match;
};
type GameLike = { id: string; date: string; state: string; homeTeam: { abbreviation: string }; awayTeam: { abbreviation: string } };
type Slate = { date: string; games: GameLike[] } | null | undefined;
type League = { sport: string; games: GameLike[]; nextGameDay?: Slate; previousGameDay?: Slate; fetchFailed?: boolean } | null;

const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  fetchAllLeagues: (date: string, third: undefined, overrides: { first: string }, slotCount: number) => Promise<League[]>;
  buildTennisGames: (events: unknown[], when?: string | { from: string; to: string }) => GameLike[];
  ALL_LEAGUES: Array<{ sport: string; label: string; hidden?: boolean }>;
  isLeagueActive: (l: unknown, d: Date) => boolean;
  ENDGAME_MAX: number;
  ENDGAME_WINDOW_DAYS: number;
}>("../src/lib/espn.ts");
const etDay = await jiti.import<{ getEtServiceDate: () => Date; toYmd: (d: Date) => string }>("../src/lib/etDay.ts");

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
const TENNIS = read<TennisParts>("endgame-tennis.json");
const TEAMS = read<{ nfl: Ev[]; epl: Ev[]; nba: Ev[] }>("endgame-teams.json");

// ── Dates ───────────────────────────────────────────────────────────────────
// The lookahead only runs on today/future tabs, so every scenario is anchored
// on a day >= the real service day. The league also has to be inside its own
// window for the column to resolve at all, so walk forward to the first such
// day (today during the US Open; the Australian Open in December).
const TODAY = etDay.toYmd(etDay.getEtServiceDate());
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ymdToDate = (ymd: string) => new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00`);
const plusDays = (ymd: string, n: number) => {
  const d = ymdToDate(ymd);
  d.setDate(d.getDate() + n);
  return etDay.toYmd(d);
};
// 18:00Z = 2 PM ET: the same calendar day in UTC (CI) and in New York.
const isoOn = (ymd: string, hourUtc = 18) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${String(hourUtc).padStart(2, "0")}:00Z`;
const dayOfIso = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

function activeDay(sport: string, from: string, step: 1 | -1, extra?: (d: Date) => boolean): string {
  const configs = espn.ALL_LEAGUES.filter((l) => l.sport === sport && !l.hidden);
  for (let i = 0; i < 800; i++) {
    const ymd = plusDays(from, i * step);
    const d = ymdToDate(ymd);
    if (configs.some((c) => espn.isLeagueActive(c, d)) && (!extra || extra(d))) return ymd;
  }
  throw new Error(`no active day for ${sport}`);
}

// ── fetch stub ──────────────────────────────────────────────────────────────
// A tiny ESPN: team-sport scoreboards honour `?dates=A` and `?dates=A-B` by
// filtering the declared events on their date; the tennis scoreboard returns
// the whole tournament whatever the dates say (as the real one does). Every
// other URL — standings, prime-asins, airings — 404s, which the code treats
// as "no enrichment".
const realFetch = globalThis.fetch;
let requested: string[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function serve(opts: { teams?: { path: string; events: Ev[] }; tennis?: unknown }) {
  requested = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    const u = new URL(url);
    if (!u.pathname.includes("/scoreboard")) return new Response("{}", { status: 404 });
    if (u.pathname.includes("/tennis/")) return json(opts.tennis ?? { events: [] });
    if (!opts.teams || !u.pathname.includes(opts.teams.path)) return new Response("{}", { status: 404 });
    const dates = u.searchParams.get("dates") ?? "";
    const [from, to = from] = dates.split("-");
    // Since 2026-09-16 the real team-sport scoreboards answer any A-B range
    // with HTTP 400 (tennis still takes one) — mirror that so a lookahead or
    // lookback that quietly went back to a range fails here, not in production.
    if (to !== from) return new Response('{"code":400}', { status: 400 });
    const events = opts.teams.events.filter((e) => {
      const d = dayOfIso(e.date);
      return d >= from && d <= to;
    });
    return json({ events });
  }) as typeof fetch;
}
const rangedRequests = () => requested.filter((u) => /dates=\d{8}-\d{8}/.test(u)).filter((u) => {
  const m = u.match(/dates=(\d{8})-(\d{8})/)!;
  return plusDays(m[1], 1) !== m[2]; // the soccer 2-day reconcile window is not a lookahead
});
test.after(() => { globalThis.fetch = realFetch; });

async function column(sport: string, date: string): Promise<League> {
  const [league] = await espn.fetchAllLeagues(date, undefined, { first: sport }, 1);
  return league ?? null;
}

// ── Tennis fixtures ─────────────────────────────────────────────────────────
type TennisSpec = { semis?: string; finals?: [string, string]; doubles?: string; qf?: [string, string] };
function tennisPayload(spec: TennisSpec) {
  const on = (m: Match, ymd: string, hourUtc?: number) => ({ ...clone(m), date: isoOn(ymd, hourUtc) });
  const mens: Match[] = [];
  const womens: Match[] = [];
  const doubles: Match[] = [];
  if (spec.qf) {
    // The captured quarterfinals are finished; the scenario needs them ahead.
    const pre = (m: Match): Match => ({ ...m, status: { type: { ...(m.status?.type ?? {}), state: "pre", completed: false, name: "STATUS_SCHEDULED" } } });
    TENNIS.mensQF.forEach((m, i) => mens.push(on(pre(m), spec.qf![i < 2 ? 0 : 1], 16 + i)));
    TENNIS.womensQF.forEach((m, i) => womens.push(on(pre(m), spec.qf![i < 2 ? 0 : 1], 16 + i)));
  }
  if (spec.semis) {
    TENNIS.mensSemis.forEach((m, i) => mens.push(on(m, spec.semis!, 17 + i)));
    TENNIS.womensSemis.forEach((m, i) => womens.push(on(m, spec.semis!, 15 + i)));
  }
  if (spec.finals) {
    womens.push(on(TENNIS.womensFinal, spec.finals[0], 20));
    mens.push(on(TENNIS.mensFinal, spec.finals[1], 18));
  }
  if (spec.doubles) doubles.push(on(TENNIS.doublesFinal, spec.doubles, 16));
  const grouping = (slug: string, competitions: Match[]) => ({ grouping: TENNIS.groupingMeta[slug], competitions });
  return {
    events: [{
      ...TENNIS.wrapper,
      groupings: [grouping("mens-singles", mens), grouping("womens-singles", womens), grouping("mens-doubles", doubles)],
    }],
  };
}
const MENS_FINAL = TENNIS.mensFinal.id!;
const WOMENS_FINAL = TENNIS.womensFinal.id!;

test("the fixtures still carry the shapes this file relies on", () => {
  assert.equal(TENNIS.mensSemis.length, 2);
  assert.equal(TENNIS.mensQF.length, 4);
  assert.equal(TENNIS.mensFinal.status?.type?.state, "pre");
  assert.equal(TENNIS.mensSemis[0].status?.type?.state, "post");
  assert.ok(TEAMS.nfl.length >= 6 && TEAMS.epl.length >= 10 && TEAMS.nba.length >= 3);
  assert.equal(espn.ENDGAME_MAX, 5);
  assert.equal(espn.ENDGAME_WINDOW_DAYS, 7);
});

// ── THE BUG: Slam finals were invisible under the semis ─────────────────────

test("tennis: the two singles finals ride under today's finished semis, on their own days", async () => {
  const day = activeDay("tennis", TODAY, 1);
  const [sat, sun] = [plusDays(day, 1), plusDays(day, 2)];
  serve({ tennis: tennisPayload({ semis: day, finals: [sat, sun], doubles: sat }) });
  const league = await column("tennis", day);
  assert.ok(league, "tennis column did not resolve");
  assert.equal(league.games.length, 4, "today's semis");
  assert.ok(league.games.every((g) => g.state === "post"));
  assert.equal(league.nextGameDay?.date, sat);
  assert.deepEqual(league.nextGameDay?.games.map((g) => g.id), [WOMENS_FINAL, MENS_FINAL], "chronological, doubles excluded");
  assert.deepEqual(league.nextGameDay?.games.map((g) => dayOfIso(g.date)), [sat, sun]);
  assert.equal(rangedRequests().length, 1, "exactly one ranged lookahead request");
});

test("tennis: an empty day before the finals shows BOTH finals, not just the first day", async () => {
  const day = activeDay("tennis", TODAY, 1);
  const [sat, sun] = [plusDays(day, 1), plusDays(day, 2)];
  serve({ tennis: tennisPayload({ semis: plusDays(day, -1), finals: [sat, sun] }) });
  const league = await column("tennis", day);
  assert.ok(league);
  assert.equal(league.games.length, 0);
  assert.equal(league.nextGameDay?.date, sat);
  assert.deepEqual(league.nextGameDay?.games.map((g) => g.id), [WOMENS_FINAL, MENS_FINAL]);
});

test("tennis: eight quarterfinals ahead is above the cap — a day with games shows only that day", async () => {
  const day = activeDay("tennis", TODAY, 1);
  serve({ tennis: tennisPayload({ semis: day, qf: [plusDays(day, 1), plusDays(day, 2)] }) });
  const league = await column("tennis", day);
  assert.ok(league);
  assert.equal(league.games.length, 4);
  assert.ok(!league.nextGameDay, "no stacking above ENDGAME_MAX");
});

test("tennis: eight quarterfinals ahead of an empty day keeps the old next-day-only lookahead", async () => {
  const day = activeDay("tennis", TODAY, 1);
  serve({ tennis: tennisPayload({ qf: [plusDays(day, 1), plusDays(day, 2)] }) });
  const league = await column("tennis", day);
  assert.ok(league);
  assert.equal(league.games.length, 0);
  assert.equal(league.nextGameDay?.date, plusDays(day, 1));
  assert.equal(league.nextGameDay?.games.length, 4, "the first day only");
});

test("tennis: the past tab never surfaces the finals", async () => {
  const day = activeDay("tennis", plusDays(TODAY, -1), -1);
  serve({ tennis: tennisPayload({ semis: day, finals: [plusDays(day, 1), plusDays(day, 2)] }) });
  const league = await column("tennis", day);
  assert.ok(league);
  assert.equal(league.games.length, 4);
  assert.ok(!league.nextGameDay);
});

// ── buildTennisGames: range mode vs the untouched single-day mode ───────────

test("buildTennisGames: a range returns every singles match inside it, a day only that day", () => {
  const d0 = "20260911";
  const [d1, d2, d3] = ["20260912", "20260913", "20260914"];
  const events = tennisPayload({ semis: d0, finals: [d1, d2], doubles: d1 }).events;
  const women = { ...clone(TENNIS.womensFinal), date: isoOn(d3, 18), id: "late" };
  (events[0].groupings[1].competitions as Match[]).push(women);
  // Draw order, not chronological — the lookahead sorts, the parser only filters.
  const ids = (gs: GameLike[]) => gs.map((g) => g.id).sort();
  assert.deepEqual(ids(espn.buildTennisGames(events, { from: d1, to: d3 })), [MENS_FINAL, WOMENS_FINAL, "late"].sort());
  assert.deepEqual(ids(espn.buildTennisGames(events, { from: d1, to: d2 })), [MENS_FINAL, WOMENS_FINAL].sort());
  assert.deepEqual(espn.buildTennisGames(events, d0).map((g) => g.state), ["post", "post", "post", "post"]);
  assert.deepEqual(espn.buildTennisGames(events, d1).map((g) => g.id), [WOMENS_FINAL], "single day, doubles skipped");
  assert.deepEqual(espn.buildTennisGames(events, "20260101"), []);
});

// ── Team sports ─────────────────────────────────────────────────────────────

function teamEvents(list: Ev[], plan: Array<[ymd: string, hourUtc?: number]>, state: "pre" | "post" = "pre"): Ev[] {
  return plan.map(([ymd, hour], i) => {
    const e = clone(list[i % list.length]);
    if (i >= list.length) { e.id = `${e.id}${i}`; e.competitions[0].id = e.id; }
    e.date = isoOn(ymd, hour);
    e.competitions[0].date = e.date;
    if (state === "pre") {
      const pre = { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail: "Scheduled", shortDetail: "Scheduled" };
      e.status = { type: pre };
      e.competitions[0].status = { type: { ...pre } };
    }
    return e;
  });
}

test("NFL: four divisional games ahead all show under today's cards", async () => {
  const day = activeDay("nfl", TODAY, 1);
  const [d1, d2] = [plusDays(day, 1), plusDays(day, 2)];
  const events = teamEvents(TEAMS.nfl, [[day, 17], [day, 21], [d1, 20], [d1, 23], [d2, 17], [d2, 21]]);
  serve({ teams: { path: "/football/nfl/", events } });
  const league = await column("nfl", day);
  assert.ok(league);
  assert.equal(league.games.length, 2, "today's two games stay today's");
  assert.equal(league.nextGameDay?.date, d1);
  assert.deepEqual(league.nextGameDay?.games.map((g) => dayOfIso(g.date)), [d1, d1, d2, d2]);
  assert.deepEqual(league.nextGameDay?.games.map((g) => g.id), events.slice(2).map((e) => e.id));
  assert.equal(rangedRequests().length, 0, "team-sport ranges 400 since 2026-09-16 — the lookahead fans out per day");
});

test("NFL: six wild-card games ahead is above the cap — nothing stacks", async () => {
  const day = activeDay("nfl", TODAY, 1);
  const [d1, d2] = [plusDays(day, 1), plusDays(day, 2)];
  const events = teamEvents(TEAMS.nfl, [[day, 17], [d1, 17], [d1, 20], [d1, 23], [d2, 17], [d2, 20], [d2, 23]]);
  serve({ teams: { path: "/football/nfl/", events } });
  const league = await column("nfl", day);
  assert.ok(league);
  assert.equal(league.games.length, 1);
  assert.ok(!league.nextGameDay);
});

test("EPL: a normal ten-fixture week never stacks under today's games", async () => {
  const day = activeDay("epl", TODAY, 1);
  const plan: Array<[string, number]> = [[day, 14], [day, 16]];
  for (let i = 0; i < 8; i++) plan.push([plusDays(day, 1 + Math.floor(i / 3)), 14 + (i % 3) * 2]);
  const events = teamEvents(TEAMS.epl, plan);
  serve({ teams: { path: "/soccer/eng.1/", events } });
  const league = await column("epl", day);
  assert.ok(league);
  assert.equal(league.games.length, 2);
  assert.ok(!league.nextGameDay, "ten fixtures in the window is a regular week");
});

test("NBA in June: the one-series playoff rule still wins over the endgame count", async () => {
  const day = activeDay("nba", TODAY, 1, (d) => d.getMonth() === 5);
  const [d1, d2, d3, d4] = [1, 2, 3, 4].map((n) => plusDays(day, n));
  // Series A (the real SA–NY Finals) and series B (the same events re-teamed),
  // interleaved: A on d1/d3, B on d2/d4. Four games would fit the endgame cap;
  // the series rule must still return only the most imminent pair.
  const a = teamEvents(TEAMS.nba, [[d1, 18], [d3, 18]]);
  const b = teamEvents(TEAMS.nba, [[d2, 18], [d4, 18]]).map((e, i) => {
    e.id = `9${e.id}`;
    e.competitions[0].id = e.id;
    const teams = [{ id: "11", abbreviation: "IND", displayName: "Indiana Pacers", shortDisplayName: "Pacers", name: "Pacers", location: "Indiana" },
      { id: "25", abbreviation: "OKC", displayName: "Oklahoma City Thunder", shortDisplayName: "Thunder", name: "Thunder", location: "Oklahoma City" }];
    (e.competitions[0].competitors ?? []).forEach((c, j) => { c.id = teams[(i + j) % 2].id; c.team = { ...(c.team ?? {}), ...teams[(i + j) % 2] }; });
    return e;
  });
  serve({ teams: { path: "/basketball/nba/", events: [...a, ...b] } });
  const league = await column("nba", day);
  assert.ok(league);
  assert.equal(league.games.length, 0);
  assert.equal(league.nextGameDay?.date, d1);
  assert.deepEqual(league.nextGameDay?.games.map((g) => dayOfIso(g.date)), [d1, d3], "one series, not the interleaved four");
  assert.ok(league.nextGameDay?.games.every((g) => ["SA", "NY"].includes(g.homeTeam.abbreviation)));
});
