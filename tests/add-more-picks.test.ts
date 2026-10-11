import assert from "node:assert/strict";
import test from "node:test";

import { mergeAddMorePicks, planAddMorePicks } from "../src/lib/addMorePicks.ts";
import type { Sport } from "../src/lib/types.ts";

const listedIn = (...sports: Sport[]) => (s: Sport) => sports.includes(s);

test("a pick already in the list changes nothing", () => {
  assert.deepEqual(mergeAddMorePicks(["nba", "nhl"], {}, listedIn("nba", "nhl")), {});
});

test("picks outside the list go into shownLeagues, in tap order, after the old entries", () => {
  assert.deepEqual(
    mergeAddMorePicks(["uel", "nba", "seriea"], { shownLeagues: ["mls"] }, listedIn("nba")),
    { shownLeagues: ["mls", "uel", "seriea"] },
  );
});

test("a pick already in shownLeagues is not added twice", () => {
  assert.deepEqual(mergeAddMorePicks(["mls", "uel"], { shownLeagues: ["mls"] }, listedIn()), { shownLeagues: ["mls", "uel"] });
  assert.deepEqual(mergeAddMorePicks(["uel", "uel"], {}, listedIn()), { shownLeagues: ["uel"] });
});

test("every pick is un-hidden, un-struck and leaves the removed group", () => {
  assert.deepEqual(
    mergeAddMorePicks(
      ["nba", "nhl"],
      { hiddenLeagues: ["nba", "mlb"], catalogHiddenLeagues: ["nhl"], removedLeagues: ["nhl", "nba", "epl"] },
      listedIn("nba", "nhl"),
    ),
    { hiddenLeagues: ["mlb"], catalogHiddenLeagues: undefined, removedLeagues: ["epl"] },
  );
});

test("lists with no pick in them stay out of the patch", () => {
  const patch = mergeAddMorePicks(["nba"], { hiddenLeagues: ["mlb"], removedLeagues: ["epl"] }, listedIn("nba"));
  assert.deepEqual(patch, {});
  assert.equal("hiddenLeagues" in patch, false);
});

const offIn = (...sports: Sport[]) => (s: Sport) => sports.includes(s);
const nbaOnly = (s: Sport) => s === "nba";

test("plan: the column takes the first pick it can show; other offseason picks wait", () => {
  assert.deepEqual(planAddMorePicks(["seriea", "nba", "ufl"], offIn("nba", "ufl"), nbaOnly), { now: ["seriea"], later: ["nba", "ufl"] });
  assert.deepEqual(planAddMorePicks(["ufl", "seriea", "bundesliga"], offIn("ufl"), nbaOnly), { now: ["seriea", "bundesliga"], later: ["ufl"] });
});

test("plan: an offseason pick the column can show goes to the column", () => {
  assert.deepEqual(planAddMorePicks(["nba", "seriea", "ufl"], offIn("nba", "ufl"), nbaOnly), { now: ["nba", "seriea"], later: ["ufl"] });
  assert.deepEqual(planAddMorePicks(["ufl", "nba"], offIn("nba", "ufl"), () => true), { now: ["ufl"], later: ["nba"] });
});

test("plan: no pick the column can show, nothing shows now", () => {
  assert.deepEqual(planAddMorePicks(["ufl", "ufl"], offIn("ufl"), nbaOnly), { now: [], later: ["ufl"] });
  assert.deepEqual(planAddMorePicks([], offIn(), nbaOnly), { now: [], later: [] });
});
