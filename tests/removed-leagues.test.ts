import assert from "node:assert/strict";
import test from "node:test";

import { dropRemoved, noteRemoved, REMOVED_LEAGUES_CAP } from "../src/lib/removedLeagues.ts";
import type { Sport } from "../src/lib/types.ts";

test("noteRemoved puts the new picks first, in pick order", () => {
  assert.deepEqual(noteRemoved(["nba"], ["wnba", "mls"]), ["wnba", "mls", "nba"]);
  assert.deepEqual(noteRemoved(undefined, ["nhl"]), ["nhl"]);
});

test("noteRemoved keeps one entry per league, moved to the front", () => {
  assert.deepEqual(noteRemoved(["nba", "nhl", "mls"], ["mls"]), ["mls", "nba", "nhl"]);
  assert.deepEqual(noteRemoved([], ["nba", "nba"]), ["nba"]);
});

test("noteRemoved caps the list and drops the oldest", () => {
  const old = Array.from({ length: REMOVED_LEAGUES_CAP }, (_, i) => `old${i}` as Sport);
  const out = noteRemoved(old, ["nba"]);
  assert.equal(out.length, REMOVED_LEAGUES_CAP);
  assert.equal(out[0], "nba");
  assert.ok(!out.includes(old[REMOVED_LEAGUES_CAP - 1]));
});

test("dropRemoved takes one league out, undefined when empty", () => {
  assert.deepEqual(dropRemoved(["nba", "nhl"], "nba"), ["nhl"]);
  assert.equal(dropRemoved(["nba"], "nba"), undefined);
  assert.equal(dropRemoved(undefined, "nba"), undefined);
  assert.deepEqual(dropRemoved(["nhl"], "nba"), ["nhl"]);
});
