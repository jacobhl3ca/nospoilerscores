import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// A pinned league between seasons keeps its column (Jacob 10/9). Before, only
// the NBA did; an MLB pin in November showed the slot's Auto league, a league
// the user never picked. The column now says when the league returns and
// offers to close (LeagueColumn). An Auto board is unchanged: the auto-picker
// still places in-season leagues only. espn.ts is loaded through jiti (see
// preseason-separation.test.ts); every network read gets an empty scoreboard,
// so only slot resolution runs.

const jiti = createJiti(import.meta.url);
const espn = await jiti.import<{
  fetchAllLeagues: (
    date: string,
    third: undefined,
    overrides: Record<string, string | undefined>,
    slotCount: number,
    bestOpts: undefined,
    hidden?: string[],
  ) => Promise<Array<{ sport: string; label: string } | null>>;
}>("../src/lib/espn.ts");

const realFetch = globalThis.fetch;
test.before(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
});
test.after(() => { globalThis.fetch = realFetch; });

// Past dates keep the board off the today-only paths (lookahead, Best of
// yesterday).
const board = async (date: string, overrides: Record<string, string | undefined>, hidden: string[] = []) =>
  (await espn.fetchAllLeagues(date, undefined, overrides, 3, undefined, hidden)).flatMap((l) => (l ? [l] : []));

test("an MLB pin in November keeps its column", async () => {
  const shown = await board("20251115", { first: "mlb" });
  assert.equal(shown[0].sport, "mlb");
});

test("a WNBA pin after its Finals keeps its column", async () => {
  const shown = await board("20251025", { second: "wnba" });
  assert.equal(shown[1].sport, "wnba");
});

test("an NBA pin in July is unchanged", async () => {
  const shown = await board("20250715", { first: "nba" });
  assert.equal(shown[0].sport, "nba");
});

test("a hidden offseason pin still closes", async () => {
  const shown = await board("20251115", { first: "mlb", second: "nfl", third: "nhl" }, ["mlb"]);
  assert.deepEqual(shown.map((l) => l.sport), ["nfl", "nhl"]);
});

test("an all-Auto board in November has no MLB column", async () => {
  const shown = await board("20251115", {});
  assert.ok(!shown.some((l) => l.sport === "mlb"), shown.map((l) => l.sport).join(","));
});

// Several configs per sport: the pin takes the one that opens next, the same
// event the column's "Returns ~…" line names.
test("a tennis pin between Slams takes the next Slam", async () => {
  const shown = await board("20251115", { first: "tennis" });
  assert.equal(shown[0].sport, "tennis");
  assert.match(shown[0].label, /Aus Open/);
});
