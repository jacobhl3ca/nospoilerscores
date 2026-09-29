import assert from "node:assert/strict";
import test from "node:test";

import { inSeasonSwitcherOptions } from "../src/lib/switcherOptions.ts";
import type { Sport } from "../src/lib/types.ts";

const options: { sport: Sport; label: string; offseason?: boolean; upcomingLabel?: string }[] = [
  { sport: "mlb", label: "MLB" },
  { sport: "nba", label: "NBA", offseason: true },
  { sport: "epl", label: "Prem", upcomingLabel: "8/21" },
];

test("the dropdown drops offseason rows", () => {
  assert.deepEqual(inSeasonSwitcherOptions(options, "mlb").map((o) => o.sport), ["mlb", "epl"]);
  assert.deepEqual(inSeasonSwitcherOptions(options, undefined).map((o) => o.sport), ["mlb", "epl"]);
});

test("the column's own offseason league stays, in its place", () => {
  assert.deepEqual(inSeasonSwitcherOptions(options, "nba").map((o) => o.sport), ["mlb", "nba", "epl"]);
});
