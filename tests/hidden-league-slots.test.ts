import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// A league turned off in Settings' switcher list leaves the board too (Jacob
// 9/26: "if a league is turned off like f1 i still saw it in my main
// leagues"). An Auto column skips it; a column pinned to it closes, and no
// other league takes it (Jacob 10/8, replacing the 9/26 "switch to next top
// league" rule). espn.ts is loaded through jiti (see preseason-separation.test.ts);
// every network read gets an empty scoreboard, so only slot resolution runs.

type Cfg = { sport: string };
const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  fetchAllLeagues: (
    date: string,
    third: undefined,
    overrides: Record<string, string | undefined>,
    slotCount: number,
    bestOpts: undefined,
    hidden?: string[],
  ) => Promise<Array<{ sport: string } | null>>;
  pickAndAssignLeagues: (d: Date, count?: number, hidden?: string[]) => Array<Cfg & { label: string }>;
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
  (await espn.fetchAllLeagues(DATE, undefined, overrides, slots, undefined, hidden))
    .flatMap((l) => (l ? [l.sport] : []));

test("Auto never places a hidden league", () => {
  const auto = espn.pickAndAssignLeagues(DAY, 5).map((l) => l.sport);
  const top = auto[0];
  const withoutTop = espn.pickAndAssignLeagues(DAY, 5, [top]).map((l) => l.sport);
  assert.ok(!withoutTop.includes(top), `${top} still on ${withoutTop}`);
  assert.equal(withoutTop.length, 5);
});

test("a column pinned to a hidden league closes", async () => {
  const shown = await boardSports({ first: "mlb", second: "nfl", third: "f1" }, ["f1"]);
  assert.deepEqual(shown, ["mlb", "nfl"]);
});

test("the pin is untouched while the league is on", async () => {
  const shown = await boardSports({ first: "mlb", second: "nfl", third: "ncaaf" }, []);
  assert.deepEqual(shown, ["mlb", "nfl", "ncaaf"]);
});

test("two hidden pins close two columns; the shown pin stays", async () => {
  const shown = await boardSports({ first: "f1", second: "mlb", third: "ufc" }, ["f1", "ufc"]);
  assert.deepEqual(shown, ["mlb"]);
});

// The client reads a hidden pin as closed on every date (closeHiddenPins), so
// a past board must not give it the slot's Auto league.
test("a hidden Best of yesterday pin closes on a past board too", async () => {
  const shown = await boardSports({ first: "mlb", second: "best", third: "nfl" }, ["best"]);
  assert.deepEqual(shown, ["mlb", "nfl"]);
});

test("a hidden ESPN front page pin closes too", async () => {
  const shown = await boardSports({ first: "mlb", second: "nfl", third: "top" }, ["top"]);
  assert.deepEqual(shown, ["mlb", "nfl"]);
});

test("hiding an Auto column's league moves that column, not the pins", async () => {
  const auto = espn.pickAndAssignLeagues(DAY, 3).map((l) => l.sport);
  const shown = await boardSports({}, [auto[0]]);
  assert.ok(!shown.includes(auto[0]), `${auto[0]} still on ${shown}`);
});

// Past days read the day's ESPN front page snapshot (Jacob 9/29), so the pin
// holds there; tomorrow and later have no front page yet and take Auto.
test("an ESPN front page pin holds on a past board and takes Auto on a future one", async () => {
  const past = await boardSports({ first: "mlb", second: "nfl", third: "top" }, []);
  assert.deepEqual(past, ["mlb", "nfl", "top"]);
  const d = new Date(Date.now() + 2 * 86_400_000);
  const future = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const shown = (await espn.fetchAllLeagues(future, undefined, { first: "mlb", second: "nfl", third: "top" }, 3, undefined, []))
    .flatMap((l) => (l ? [l.sport] : []));
  assert.ok(!shown.includes("top"), `top on a future board: ${shown}`);
});

// NBA Preseason is opt-in (2026-10-09): backfillOnly, and in October every slot
// is already taken, so Auto never opens it on a 3- or 5-column board.
test("Auto never places NBA Preseason in October", () => {
  const day = new Date("2026-10-09T12:00:00");
  for (const count of [3, 5]) {
    const labels = espn.pickAndAssignLeagues(day, count).map((l) => l.label);
    assert.equal(labels.length, count, `only ${labels} on a ${count}-slot board`);
    assert.ok(!labels.includes("NBA Preseason"), `${count} slots: ${labels}`);
  }
});
