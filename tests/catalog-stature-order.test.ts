import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// Settings catalog order inside each group (Jacob 9/30): CATALOG_TAIL first,
// then in-season before offseason, then the fixed CATALOG_STATURE order. The
// sort below is the same comparator SettingsPanel's groupedLeagueOptions uses.

const jiti = createJiti(import.meta.url);
const { catalogSortRank, sportGroup } = await jiti.import<{
  catalogSortRank: (sport: string, offseason: boolean) => number;
  sportGroup: (sport: string) => string;
}>("../src/lib/espn.ts");

type Row = { sport: string; offseason?: boolean };
const sortRows = (rows: Row[]) =>
  [...rows].sort((a, b) => catalogSortRank(a.sport, !!a.offseason) - catalogSortRank(b.sport, !!b.offseason));
const inSeason = (sports: string[]) => sports.map((sport) => ({ sport }));
const before = (order: string[], a: string, b: string) =>
  assert.ok(order.indexOf(a) < order.indexOf(b), `${a} should sort before ${b}: ${order.join(", ")}`);

test("US leagues, all in season, sort by stature (pro before college)", () => {
  // Fed in season-calendar order, which is what the list showed before 9/30.
  const order = sortRows(inSeason(["ncaavb", "ncaaf", "wnba", "cfl", "nhl", "mlb", "nba", "nfl"])).map((r) => r.sport);
  assert.deepEqual(order, ["nfl", "nba", "mlb", "nhl", "wnba", "cfl", "ncaaf", "ncaavb"]);
});

test("an in-season tail event still sorts after an offseason major", () => {
  const order = sortRows([{ sport: "llws" }, { sport: "nba", offseason: true }]).map((r) => r.sport);
  assert.deepEqual(order, ["nba", "llws"]);
});

test("soccer: leagues, continental, national teams, cups, college", () => {
  const sports = [
    "ncaamsoc", "dfbpokal", "libertadores", "ucl", "mls", "facup", "epl", "fifa", "ncaawsoc", "bundesliga",
  ];
  const order = sortRows(inSeason(sports)).map((r) => r.sport);
  assert.ok(sports.every((s) => sportGroup(s) === "soccer"));
  before(order, "mls", "ucl");
  before(order, "libertadores", "dfbpokal");
  before(order, "epl", "bundesliga");
  assert.equal(order[order.length - 1], "ncaawsoc");
  assert.equal(order[order.length - 2], "ncaamsoc");
});

test("racing, combat & more: F1 first, cricket then mind sports then the rugby tail", () => {
  const sports = ["sixnations", "chess", "cricketintl", "ufc", "nascar", "f1", "cricket", "afl"];
  const order = sortRows(inSeason(sports)).map((r) => r.sport);
  assert.equal(order[0], "f1");
  before(order, "cricketintl", "sixnations");
  before(order, "cricketintl", "chess");
  before(order, "chess", "sixnations");
});

test("an unknown sport lands last in its group without throwing", () => {
  const order = sortRows(inSeason(["curling", "esports", "f1"])).map((r) => r.sport);
  assert.equal(order[order.length - 1], "curling");
  assert.ok(catalogSortRank("curling", false) < catalogSortRank("nfl", true), "season still beats stature");
});
