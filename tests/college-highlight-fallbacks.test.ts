import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCollegeFallbackChain, type CollegeHighlightConfig } from "../src/lib/collegeHighlights.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../src/lib/collegeHighlightChannels.json", import.meta.url), "utf8"),
) as Record<string, CollegeHighlightConfig>;
const NCAAF = CONFIG.ncaaf;
const PRIMARY = "ESPN College Football";

test("home conference first, then away, then the network", () => {
  // Ohio State (Big Ten, 5) at Texas (SEC, 8) on FOX.
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]);
  assert.deepEqual(chain.map((f) => f.channel), ["SEC", "Big Ten Football", "CFB ON FOX"]);
});

test("every fallback requires a football title token", () => {
  // The ESPN channel served an "ESPN CBB" basketball cut for ETSU–North
  // Carolina; the conference channels post basketball between the same schools.
  for (const f of buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "8" }, { conferenceId: "12" }, ["CBS", "CW"])) {
    assert.ok(f.titleTokens.includes("football"), `${f.channel} has no football token`);
  }
});

test("duplicates and the primary channel drop out", () => {
  // Same conference on both sides, two FOX feeds.
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "4" }, { conferenceId: "4" }, ["FOX", "FS1"]);
  assert.deepEqual(chain.map((f) => f.channel), ["Big 12 Conference", "CFB ON FOX"]);
});

test("unknown conferences and networks give an empty chain, not a broken one", () => {
  assert.deepEqual(buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "999" }, undefined, ["ESPN+"]), []);
  assert.deepEqual(buildCollegeFallbackChain(undefined, PRIMARY, { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]), []);
});

test("volleyball finds the conference from the ESPN team id and gates on volleyball", () => {
  const NCAAVB = CONFIG.ncaavb;
  assert.equal(NCAAVB.primaryFromChain, true);
  // Nebraska (158, Big Ten) hosts Baylor (239, Big 12). ESPN's volleyball feed
  // has no conferenceId, and the app prefixes ids with the sport.
  const chain = buildCollegeFallbackChain(NCAAVB, null, { id: "ncaavb-158" }, { id: "ncaavb-239" }, []);
  assert.deepEqual(chain.map((f) => f.channel), ["Big Ten Volleyball", "Big 12 Conference"]);
  assert.ok(chain.every((f) => f.titleTokens.includes("volleyball")));
  // Two schools outside the four channel conferences: no chain, so no lookups.
  assert.deepEqual(buildCollegeFallbackChain(NCAAVB, null, { id: "ncaavb-2335" }, { id: "ncaavb-2226" }, []), []);
});
