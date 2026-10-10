import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import * as top from "../src/lib/topGames.ts";
import { bakeTopGames } from "../scripts/lib/top-games-bake.mjs";

// A fake ESPN: day → sport → games. Ratings only, never a score.
const g = (sport, id, rating, ymd, extra = {}) => ({
  id, sport, date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T23:00:00Z`,
  name: `${id} at ${id}`, shortName: id, state: "post", completed: true, isPreseason: false, rating, ...extra,
});

function fakeDeps(board, { noClip = new Set(), calls = [] } = {}) {
  return {
    top,
    sportsForDay: () => ["nfl", "nhl"],
    fetchDay: async (sport, ymd) => { calls.push(`${sport}:${ymd}`); return board[ymd]?.[sport] ?? []; },
    hasClip: (game) => !noClip.has(game.id),
  };
}

async function run(opts) {
  const dir = opts.dir ?? await mkdtemp(join(tmpdir(), "top-games-"));
  await bakeTopGames({ log: () => {}, outDir: dir, statePath: join(dir, "state.json"), ...opts });
  const read = async (span) => JSON.parse(await readFile(join(dir, `top-games-${span}.json`), "utf8"));
  return { dir, read };
}

test("the bake writes every span from the day archive, best rating first", async () => {
  const board = {
    "20261009": { nhl: [g("nhl", "a", 70, "20261009"), g("nhl", "pre", 99, "20261009", { isPreseason: true })] },
    "20261005": { nfl: [g("nfl", "b", 95, "20261005"), g("nfl", "pp", 99, "20261005", { completed: false })] },
    "20260920": { nfl: [g("nfl", "c", 98, "20260920")] },
    "20260301": { nhl: [g("nhl", "d", 100, "20260301")] },
  };
  const { read } = await run({ deps: fakeDeps(board), yesterday: "20261009", backfill: 400, now: new Date("2026-10-10T14:00:00Z") });
  const y = await read("yesterday");
  assert.deepEqual(Object.keys(y.leagues), ["nhl"]);
  assert.deepEqual(y.leagues.nhl.map((x) => x.id), ["a"], "an exhibition got in");
  const w = await read("week");
  assert.equal(w.from, "20261003");
  assert.deepEqual(top.pickTopGames(w, null).map((x) => x.id), ["b", "a"], "a postponed game or an old one got in");
  const m = await read("month");
  assert.deepEqual(top.pickTopGames(m, null).map((x) => x.id), ["c", "b", "a"]);
  const yr = await read("year");
  assert.deepEqual(top.pickTopGames(yr, null).map((x) => x.id), ["d", "c", "b", "a"]);
  assert.equal(yr.days.total, 282);
  assert.equal(yr.days.covered, 282);
});

test("a recent game with no clip stays out; an old one with unknown clip stays in", async () => {
  const board = {
    "20261008": { nfl: [g("nfl", "noclip", 99, "20261008"), g("nfl", "clip", 60, "20261008")] },
    "20260401": { nfl: [g("nfl", "old", 90, "20260401")] },
  };
  const { read } = await run({ deps: fakeDeps(board, { noClip: new Set(["noclip", "old"]) }), yesterday: "20261009", backfill: 400 });
  const ids = top.pickTopGames(await read("year"), null).map((x) => x.id);
  assert.deepEqual(ids, ["old", "clip"]);
});

test("later runs only re-read the last two days and backfill what is missing", async () => {
  const calls = [];
  const deps = fakeDeps({}, { calls });
  const t0 = new Date("2026-10-10T14:00:00Z");
  const { dir } = await run({ deps, yesterday: "20261009", backfill: 3, now: t0 });
  assert.deepEqual(calls.filter((c) => c.startsWith("nfl:")), ["nfl:20261009", "nfl:20261008", "nfl:20261007", "nfl:20261006", "nfl:20261005"]);
  calls.length = 0;
  // 30 min later: the last two days are fresh, so only the next 3 missing days.
  await run({ dir, deps, yesterday: "20261009", backfill: 3, now: new Date(t0.getTime() + 30 * 60_000) });
  assert.deepEqual(calls.filter((c) => c.startsWith("nfl:")), ["nfl:20261004", "nfl:20261003", "nfl:20261002"]);
});

test("the span files never carry a score field the bake added", async () => {
  const board = { "20261009": { nfl: [g("nfl", "a", 70, "20261009")] } };
  const { read } = await run({ deps: fakeDeps(board), yesterday: "20261009", backfill: 0 });
  const y = await read("yesterday");
  assert.deepEqual(Object.keys(y).sort(), ["days", "from", "generatedAt", "leagues", "span", "to", "v"]);
});
