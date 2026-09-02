import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SHORT_LEAGUE_LABELS, SHORT_LABEL_MAX_CHARS } from "../src/lib/leagueLabels.ts";

// The map is keyed on the exact ALL_LEAGUES label string, and a miss is silent:
// the header just renders the full name again and wraps to two lines in a 114px
// phone column. Rename a label in espn.ts and this catches the orphaned key.
//
// espn.ts is read as TEXT rather than imported because it imports "./types"
// without a file extension, which node's ESM resolver cannot follow — the same
// reason no other test imports it. The labels are plain string literals in
// ALL_LEAGUES, so a scan is stable; the count assertion below is what keeps a
// silently-empty scan from passing every other test in this file for free.
const ESPN_SRC = readFileSync(fileURLToPath(new URL("../src/lib/espn.ts", import.meta.url)), "utf8");
const LABELS = new Set([...ESPN_SRC.matchAll(/\blabel: "([^"]+)"/g)].map((m) => m[1]));

test("the label scan actually found the league catalog", () => {
  // 48 labels as of 2026-09-02. A floor, not the exact count, so adding a league
  // doesn't fail the suite — but a scan that silently matched nothing does.
  assert.ok(
    LABELS.size >= 40,
    `only ${LABELS.size} labels scanned out of espn.ts — the ALL_LEAGUES literal shape changed and every other assertion in this file is now vacuous`,
  );
});

test("every short form is keyed to a label that still exists", () => {
  const orphans = Object.keys(SHORT_LEAGUE_LABELS).filter((k) => !LABELS.has(k));
  assert.deepEqual(
    orphans,
    [],
    `SHORT_LEAGUE_LABELS keys with no matching label in espn.ts — renamed or removed, so the header silently wraps again: ${orphans.join(", ")}`,
  );
});

test("every short form is actually shorter than the label it replaces", () => {
  for (const [full, short] of Object.entries(SHORT_LEAGUE_LABELS)) {
    assert.ok(short.length < full.length, `"${full}" → "${short}" is not shorter, so the entry buys nothing`);
  }
});

test("no short form exceeds the character proxy for the 99px budget", () => {
  for (const [full, short] of Object.entries(SHORT_LEAGUE_LABELS)) {
    assert.ok(
      short.length <= SHORT_LABEL_MAX_CHARS,
      `"${full}" → "${short}" is ${short.length} chars, over the ${SHORT_LABEL_MAX_CHARS} standing in for the 99px column budget. Measure it in the browser before raising the cap.`,
    );
  }
});

test("two leagues never collapse to the same header", () => {
  const seen = new Map<string, string>();
  for (const [full, short] of Object.entries(SHORT_LEAGUE_LABELS)) {
    const clash = seen.get(short);
    assert.equal(clash, undefined, `"${full}" and "${clash}" both shorten to "${short}" — two columns would carry the same header`);
    seen.set(short, full);
  }
});
