import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// A league turned off in Settings' switcher list leaves the board too (Jacob
// 9/26: "if a league is turned off like f1 i still saw it in my main leagues.
// it should switch to next top league available in switcher"). An Auto column
// skips it; a column pinned to it shows the top league not already on the
// board. espn.ts is loaded through jiti (see preseason-separation.test.ts);
// every network read gets an empty scoreboard, so only slot resolution runs.

type Cfg = { sport: string };
const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  fetchAllLeagues: (
    date: string,
    third: undefined,
    overrides: Record<string, string | undefined>,
    slotCount: number,
    topOpts: undefined,
    bestOpts: undefined,
    hidden?: string[],
  ) => Promise<Array<{ sport: string } | null>>;
  pickAndAssignLeagues: (d: Date, count?: number, hidden?: string[]) => Cfg[];
  nextUnusedLeague: (d: Date, hidden: string[], used: Set<string>) => Cfg | null;
}>("../src/lib/espn.ts");

// A past date keeps the board off the today-only paths (lookahead, Best of
// yesterday) so the stub below stays trivial. Late September: MLB, NFL,
// NCAAF, EPL and friends are all in season.
const DATE = "20250927";
const DAY = new Date("2025-09-27T12:00:00");

const realFetch = globalThis.fetch;
test.before(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
});
test.after(() => { globalThis.fetch = realFetch; });

const boardSports = async (overrides: Record<string, string | undefined>, hidden: string[], slots = 3) =>
  (await espn.fetchAllLeagues(DATE, undefined, overrides, slots, undefined, undefined, hidden))
    .flatMap((l) => (l ? [l.sport] : []));

test("Auto never places a hidden league", () => {
  const auto = espn.pickAndAssignLeagues(DAY, 5).map((l) => l.sport);
  const top = auto[0];
  const withoutTop = espn.pickAndAssignLeagues(DAY, 5, [top]).map((l) => l.sport);
  assert.ok(!withoutTop.includes(top), `${top} still on ${withoutTop}`);
  assert.equal(withoutTop.length, 5);
});

test("a column pinned to a hidden league shows the top unused league", async () => {
  const shown = await boardSports({ first: "mlb", second: "nfl", third: "f1" }, ["f1"]);
  const expected = espn.nextUnusedLeague(DAY, ["f1"], new Set(["mlb", "nfl"]));
  assert.ok(expected, "some league is free");
  assert.deepEqual(shown, ["mlb", "nfl", expected.sport]);
});

test("the pin is untouched while the league is on", async () => {
  const pinned = espn.nextUnusedLeague(DAY, [], new Set());
  assert.ok(pinned);
  const shown = await boardSports({ first: "mlb", second: "nfl", third: pinned.sport }, []);
  assert.deepEqual(shown, ["mlb", "nfl", pinned.sport]);
});

test("two hidden pins take two different leagues, in ranked order", async () => {
  const shown = await boardSports({ first: "f1", second: "mlb", third: "ufc" }, ["f1", "ufc"]);
  assert.equal(shown.length, 3);
  assert.equal(new Set(shown).size, 3, `duplicate on ${shown}`);
  const first = espn.nextUnusedLeague(DAY, ["f1", "ufc"], new Set(["mlb"]));
  const second = espn.nextUnusedLeague(DAY, ["f1", "ufc"], new Set(["mlb", first!.sport]));
  assert.deepEqual(shown, [first!.sport, "mlb", second!.sport]);
});

test("hiding an Auto column's league moves that column, not the pins", async () => {
  const auto = espn.pickAndAssignLeagues(DAY, 3).map((l) => l.sport);
  const shown = await boardSports({}, [auto[0]]);
  assert.ok(!shown.includes(auto[0]), `${auto[0]} still on ${shown}`);
});
