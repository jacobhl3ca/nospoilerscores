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
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, "8", "5", ["FOX"]);
  assert.deepEqual(chain.map((f) => f.channel), ["SEC", "Big Ten Football", "CFB ON FOX"]);
});

test("every fallback requires a football title token", () => {
  // The ESPN channel served an "ESPN CBB" basketball cut for ETSU–North
  // Carolina; the conference channels post basketball between the same schools.
  for (const f of buildCollegeFallbackChain(NCAAF, PRIMARY, "8", "12", ["CBS", "CW"])) {
    assert.ok(f.titleTokens.includes("football"), `${f.channel} has no football token`);
  }
});

test("duplicates and the primary channel drop out", () => {
  // Same conference on both sides, two FOX feeds.
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, "4", "4", ["FOX", "FS1"]);
  assert.deepEqual(chain.map((f) => f.channel), ["Big 12 Conference", "CFB ON FOX"]);
});

test("unknown conferences and networks give an empty chain, not a broken one", () => {
  assert.deepEqual(buildCollegeFallbackChain(NCAAF, PRIMARY, "999", undefined, ["ESPN+"]), []);
  assert.deepEqual(buildCollegeFallbackChain(undefined, PRIMARY, "8", "5", ["FOX"]), []);
});
