import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { eventListenLinks, listenLinks, mayHaveListen, parseRadioBroadcasts, type RadioSource, type RadioTable } from "../src/lib/radio.ts";
import type { Sport } from "../src/lib/types.ts";

// Listen links (lib/radio.ts): order, the market/country geo filter, the
// paid fallback and the final-game hide. A fixed table, not the real one, so
// a station change in public/radio-stations.json never breaks these.

const src = (name: string, over: Partial<RadioSource> = {}): RadioSource => ({
  name,
  url: `https://www.audacy.com/stations/${name.toLowerCase().replace(/\W+/g, "")}`,
  lang: "en",
  access: { cost: "free", geo: "none", vpnOk: "unknown" },
  checked: "2026-10-08",
  ...over,
});

const WFAN = src("WFAN", { access: { cost: "free", geo: "market", dma: [501], vpnOk: "unknown" } });
const WEPN = src("ESPN Deportes NY", { lang: "es", access: { cost: "free", geo: "market", dma: [501], vpnOk: "unknown" } });
const WEEI = src("WEEI", { access: { cost: "free", geo: "market", dma: [506], vpnOk: "unknown" } });
const ESPN_RADIO = src("ESPN Radio", { url: "https://www.iheart.com/live/espn-radio-7903/" });
const BBC = src("BBC Radio 5 Live", { url: "https://www.bbc.co.uk/sounds/play/live:bbc_radio_five_live", access: { cost: "free", geo: "country", countries: ["GB"], signIn: true, vpnOk: "unknown" } });
const SXM = src("SiriusXM", { url: "https://www.siriusxm.com/sports/mlb", access: { cost: "paid", geo: "none", signIn: true } });

const TABLE: RadioTable = {
  teams: { "mlb:21": [WFAN, WEPN], "mlb:2": [WEEI], "epl:359": [BBC] },
  national: { ERADM: ESPN_RADIO },
  leagues: { mlb: { paid: [SXM] } },
};

const team = (id: string) => ({ id, abbreviation: id, displayName: id, shortDisplayName: id, logo: "", color: "", score: "", winner: false, record: "" });
// Team ids arrive as "<sport>-<espnId>" (espn.ts parseTeam), as on the board.
type Over = { sport?: Sport; state?: "pre" | "in" | "post"; radio?: string[] };
const game = (home: string, away: string, over: Over = {}) => {
  const sport: Sport = over.sport ?? "mlb";
  return { state: "in" as const, ...over, sport, homeTeam: team(`${sport}-${home}`), awayTeam: team(`${sport}-${away}`) };
};

const NYC = { country: "US", region: "NY", metro: 501 };
const BOSTON = { country: "US", region: "MA", metro: 506 };
const names = (r: ReturnType<typeof listenLinks>) => r.free.map((l) => l.name);

test("order: home flagship, away flagship, national, then non-English last", () => {
  const r = listenLinks(game("21", "2", { radio: ["ERADM"] }), TABLE, null, {});
  assert.deepEqual(names(r), ["WFAN", "WEEI", "ESPN Radio", "ESPN Deportes NY"]);
  assert.deepEqual(r.free[3].tags, ["ES", "local only"]);
});

test("geo: NYC metro 501 shows WFAN with no tag, Boston hides it", () => {
  const nyc = listenLinks(game("21", "99"), TABLE, NYC, {});
  assert.deepEqual(names(nyc), ["WFAN", "ESPN Deportes NY"]);
  assert.deepEqual(nyc.free[0].tags, []);
  const bos = listenLinks(game("21", "99"), TABLE, BOSTON, {});
  assert.deepEqual(names(bos), []);
});

test("geo: listenAnywhere shows a local-only link outside its market, tagged", () => {
  const r = listenLinks(game("21", "99"), TABLE, BOSTON, { listenAnywhere: true });
  assert.equal(r.free[0].name, "WFAN");
  assert.deepEqual(r.free[0].tags, ["local only"]);
});

test("geo: unknown location fails open with a local-only tag", () => {
  const r = listenLinks(game("21", "99"), TABLE, null, {});
  assert.equal(r.free[0].name, "WFAN");
  assert.deepEqual(r.free[0].tags, ["local only"]);
  const noMetro = listenLinks(game("21", "99"), TABLE, { country: "US" }, {});
  assert.equal(noMetro.free[0].name, "WFAN");
});

test("geo: a market link hides outside the US", () => {
  assert.deepEqual(names(listenLinks(game("21", "99"), TABLE, { country: "GB" }, {})), []);
});

test("geo: a UK-only feed shows in GB, hides in the US, tags UK only when unknown", () => {
  const epl = (where: Parameters<typeof listenLinks>[2]) =>
    listenLinks(game("359", "1", { sport: "epl" }), TABLE, where, {});
  assert.deepEqual(epl({ country: "GB" }).free[0].tags, ["sign-in"]);
  assert.deepEqual(names(epl(NYC)), []);
  assert.deepEqual(epl(null).free[0].tags, ["UK only", "sign-in"]);
});

test("paid shows only when no free link survives", () => {
  const bos = listenLinks(game("21", "99"), TABLE, BOSTON, {});
  assert.equal(bos.paid?.name, "SiriusXM");
  assert.deepEqual(bos.paid?.tags, ["sign-in", "Paid"]);
  const nyc = listenLinks(game("21", "99"), TABLE, NYC, {});
  assert.equal(nyc.paid, null);
  // A league with no paid row stays empty.
  assert.equal(listenLinks(game("1", "2", { sport: "nba" }), TABLE, NYC, {}).paid, null);
});

test("a final game gets nothing, and the Settings toggle turns it off", () => {
  assert.deepEqual(listenLinks(game("21", "2", { state: "post" }), TABLE, NYC, {}), { free: [], paid: null });
  assert.deepEqual(listenLinks(game("21", "2"), TABLE, NYC, { showListenLinks: false }), { free: [], paid: null });
  assert.deepEqual(listenLinks(game("21", "2"), null, NYC, {}), { free: [], paid: null });
});

test("ERADM maps to ESPN Radio", () => {
  const r = listenLinks(game("98", "99", { radio: ["ERADM"] }), TABLE, NYC, {});
  assert.deepEqual(names(r), ["ESPN Radio"]);
  assert.equal(r.free[0].url, "https://www.iheart.com/live/espn-radio-7903/");
});

test("geoBroadcasts: only the type-5 Radio rows, from a real ESPN payload", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/espn-geobroadcasts-mlb-2026-10-08.json", import.meta.url), "utf8"));
  assert.deepEqual(parseRadioBroadcasts(fx.geoBroadcasts), ["ERADM"]);
  assert.deepEqual(parseRadioBroadcasts([{ type: { id: "1", shortName: "TV" }, media: { shortName: "FS1" } }]), []);
  assert.deepEqual(parseRadioBroadcasts(undefined), []);
});

test("a copy hidden by geo never blocks a later copy of the same URL that passes", () => {
  const open = { ...WFAN, access: { cost: "free" as const, geo: "none" as const } };
  const t: RadioTable = { ...TABLE, teams: { "mlb:21": [WFAN], "mlb:2": [open] } };
  assert.deepEqual(names(listenLinks(game("21", "2"), t, BOSTON, {})), ["WFAN"]);
});

// Phase 4: event tiles (races, slams). Rows keyed "<sport>:<text>" match when
// the title or venue contains the text; the series feed follows.
const MRN = src("MRN", { url: "https://www.mrn.com/live" });
const PRN = src("PRN", { url: "https://www.goprn.com/live" });
const INDY = src("IndyCar Radio", { url: "https://tunein.com/radio/indycar-s1/" });
const SXM_NASCAR = src("SiriusXM NASCAR", { url: "https://www.siriusxm.com/sports/nascar", access: { cost: "paid", geo: "none", signIn: true } });
const EVENTS: RadioTable = {
  ...TABLE,
  leagues: { ...TABLE.leagues, nascar: { paid: [SXM_NASCAR] }, indycar: { free: [INDY] } },
  events: { "nascar:talladega": [MRN], "nascar:charlotte": [PRN] },
};
const race = (title: string, subtitle?: string, state: "pre" | "in" | "post" = "pre") => ({ title, subtitle, state, radio: [] as string[] });

test("events: a track row matches the title or the venue, case-insensitive", () => {
  assert.deepEqual(names(eventListenLinks("nascar", race("YellaWood 500", "Talladega Superspeedway"), EVENTS, NYC, {})), ["MRN"]);
  assert.deepEqual(names(eventListenLinks("nascar", race("Bank of America ROVAL 400", "Charlotte Motor Speedway"), EVENTS, NYC, {})), ["PRN"]);
});

test("events: no track row = the paid line; a series feed covers every race", () => {
  const r = eventListenLinks("nascar", race("Cook Out 400", "Martinsville Speedway"), EVENTS, NYC, {});
  assert.deepEqual(names(r), []);
  assert.equal(r.paid?.name, "SiriusXM NASCAR");
  assert.deepEqual(names(eventListenLinks("indycar", race("Grand Prix of Long Beach"), EVENTS, NYC, {})), ["IndyCar Radio"]);
});

test("events: a finished race, the toggle off or no table gets nothing", () => {
  const none = { free: [], paid: null };
  assert.deepEqual(eventListenLinks("nascar", race("YellaWood 500", "Talladega", "post"), EVENTS, NYC, {}), none);
  assert.deepEqual(eventListenLinks("nascar", race("YellaWood 500", "Talladega"), EVENTS, NYC, { showListenLinks: false }), none);
  assert.deepEqual(eventListenLinks("nascar", race("YellaWood 500", "Talladega"), null, NYC, {}), none);
});

test("events: a track row in one sport never matches another sport", () => {
  assert.deepEqual(names(eventListenLinks("indycar", race("Talladega test"), EVENTS, NYC, {})), ["IndyCar Radio"]);
});

test("mayHaveListen: phase 2-3 team leagues load the table, a final never does", () => {
  for (const sport of ["wnba", "mls", "nwsl", "cfl", "ufl", "ligamx", "ncaaf", "ncaam", "ncaaw"] as Sport[]) {
    assert.equal(mayHaveListen({ sport, state: "pre" }), true, sport);
    assert.equal(mayHaveListen({ sport, state: "post" }), false, sport);
  }
  assert.equal(mayHaveListen({ sport: "chess", state: "pre" }), false);
});

test("events: a tennis match picks up its slam's row from seriesNote", () => {
  const BBC5 = src("BBC Radio 5 Live", { url: "https://tunein.com/radio/BBC-Radio-5-Live-909-s24943/" });
  const t: RadioTable = { ...TABLE, events: { "tennis:wimbledon": [BBC5] } };
  const m = (note: string) => ({ ...game("1", "2", { sport: "tennis" }), seriesNote: note, venue: "" });
  assert.deepEqual(names(listenLinks(m("Wimbledon 2026"), t, null, {})), ["BBC Radio 5 Live"]);
  assert.deepEqual(names(listenLinks(m("US Open 2026"), t, null, {})), []);
});
