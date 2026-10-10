import assert from "node:assert/strict";
import test from "node:test";

import type { Game, Sport } from "../src/lib/types.ts";
import {
  isRatedFinishedGame,
  isTopGamesFile,
  pickTopGames,
  rankTopGames,
  spanStartYmd,
  TOP_GAMES_COUNT,
  TOP_GAMES_MAX_PER_LEAGUE,
  type TopGamesFile,
} from "../src/lib/topGames.ts";

function game(sport: Sport, id: string, rating: number | null, date: string, extra: Partial<Game> = {}): Game {
  return {
    id,
    sport,
    date,
    name: `${id} away at ${id} home`,
    shortName: `${id}A @ ${id}H`,
    state: "post",
    completed: true,
    isPreseason: false,
    rating,
    ...extra,
  } as unknown as Game;
}

test("span windows end on yesterday: rolling week and month, calendar year", () => {
  assert.equal(spanStartYmd("yesterday", "20261009"), "20261009");
  assert.equal(spanStartYmd("week", "20261009"), "20261003");
  assert.equal(spanStartYmd("month", "20261009"), "20260910");
  assert.equal(spanStartYmd("year", "20261009"), "20260101");
  // Across a month and a year boundary.
  assert.equal(spanStartYmd("week", "20260102"), "20251227");
  assert.equal(spanStartYmd("year", "20260102"), "20260101");
});

test("only finished, rated, non-exhibition games are eligible", () => {
  assert.equal(isRatedFinishedGame(game("nfl", "1", 80, "2026-10-05T00:00:00Z")), true);
  assert.equal(isRatedFinishedGame(game("nfl", "2", null, "2026-10-05T00:00:00Z")), false);
  assert.equal(isRatedFinishedGame(game("nfl", "3", 80, "2026-10-05T00:00:00Z", { completed: false })), false);
  assert.equal(isRatedFinishedGame(game("nfl", "4", 80, "2026-10-05T00:00:00Z", { state: "in" } as Partial<Game>)), false);
  assert.equal(isRatedFinishedGame(game("nba", "5", 99, "2026-10-05T00:00:00Z", { isPreseason: true })), false);
});

test("rating first, ties go to the more recent game, duplicates count once", () => {
  const ranked = rankTopGames([
    game("nfl", "old", 90, "2026-10-01T00:00:00Z"),
    game("nfl", "new", 90, "2026-10-08T00:00:00Z"),
    game("nfl", "top", 97, "2026-09-20T00:00:00Z"),
    game("nfl", "top", 97, "2026-09-20T00:00:00Z"),
    game("nfl", "low", 40, "2026-10-08T00:00:00Z"),
  ]);
  assert.deepEqual(ranked.map((g) => g.id), ["top", "new", "old", "low"]);
});

const file = (leagues: TopGamesFile["leagues"]): TopGamesFile => ({
  v: 1, span: "week", from: "20261003", to: "20261009", generatedAt: "2026-10-10T12:00:00Z", leagues,
});

test("pickTopGames: the user's leagues only, top 5, at most 3 from one league", () => {
  const f = file({
    nhl: [95, 94, 93, 92, 91].map((r, i) => game("nhl", `h${i}`, r, "2026-10-08T00:00:00Z")),
    nfl: [90, 50].map((r, i) => game("nfl", `f${i}`, r, "2026-10-06T00:00:00Z")),
    epl: [99].map((r, i) => game("epl", `e${i}`, r, "2026-10-04T00:00:00Z")),
  });
  const mine = pickTopGames(f, ["nhl", "nfl"]);
  assert.equal(mine.length, TOP_GAMES_COUNT);
  assert.equal(mine.filter((g) => g.sport === "nhl").length, TOP_GAMES_MAX_PER_LEAGUE);
  assert.ok(!mine.some((g) => g.sport === "epl"), "a league outside the user's switcher leaked in");
  // All leagues: EPL's 99 leads.
  assert.equal(pickTopGames(f, null)[0].id, "e0");
  // One league: no per-league cap.
  assert.deepEqual(pickTopGames(f, ["nhl"]).map((g) => g.id), ["h0", "h1", "h2", "h3", "h4"]);
});

test("isTopGamesFile rejects junk", () => {
  assert.equal(isTopGamesFile(null), false);
  assert.equal(isTopGamesFile({ v: 1, span: "decade", leagues: {} }), false);
  assert.equal(isTopGamesFile({ v: 2, span: "week", leagues: {} }), false);
  assert.equal(isTopGamesFile(file({})), true);
});

test("among games rated 100, the bigger uncapped headroom leads, then the newer game", () => {
  const ranked = rankTopGames([
    game("nhl", "plain", 100, "2026-10-09T00:00:00Z"),
    game("nhl", "wild", 100, "2026-09-01T00:00:00Z", { ratingExcess: 22.5 }),
    game("nhl", "close", 100, "2026-10-01T00:00:00Z", { ratingExcess: 4 }),
  ]);
  assert.deepEqual(ranked.map((g) => g.id), ["wild", "close", "plain"]);
});
