import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// getSeasonOpener decides whether an offseason column states its opening day as
// fact ("Season starts Oct 20") or hedges it ("~Oct 20"). The rule, per
// LeagueConfig.verifiedFor, is that ONE year was checked against a real source:
// "Only a kickoffDate inside its verifiedFor year is a confirmed opening day."
//
// The predicate used to read `verifiedFor < kickoffYear`, which also treated
// every year BEFORE the checked one as confirmed. A window verified for 2027
// therefore stated 2026's opener as fact — the tennis US Open told everyone it
// kicked off Saturday, Aug 29 through August 2026, with no "~", while ESPN had
// Day 1 on Sunday, Aug 30. Verifying a season in ADVANCE is the normal way to
// use this field, so the bug re-arms itself every time someone does.
//
// espn.ts is read as TEXT rather than imported, for the same reason every other
// test here does it: espn.ts imports "./types" with no file extension, which
// node's ESM resolver cannot follow. The expression is plain JS, so it is pulled
// out and EVALUATED — these assertions run the real source, not a copy of it.
const ESPN_SRC = readFileSync(fileURLToPath(new URL("../src/lib/espn.ts", import.meta.url)), "utf8");

const APPROX = /^\s*approximate:\s*(.+),\s*$/m.exec(ESPN_SRC);

test("the approximate: predicate is still where this file thinks it is", () => {
  assert.ok(
    APPROX,
    "no `approximate: <expr>,` line found in espn.ts — getSeasonOpener was reshaped and every assertion below is now vacuous",
  );
});

const EXPR = APPROX![1];
const isApproximate = new Function(
  "config",
  "kickoff",
  `"use strict"; return (${EXPR});`,
) as (config: { kickoffDate?: string; verifiedFor?: number }, kickoff: { getFullYear(): number }) => boolean;

const year = (y: number) => ({ getFullYear: () => y });

test("an opener inside its verified year is stated as fact", () => {
  assert.equal(
    isApproximate({ kickoffDate: "08-29", verifiedFor: 2027 }, year(2027)),
    false,
    "the one year someone actually checked should NOT be hedged — that is the whole point of verifiedFor",
  );
});

test("an opener in a year BEFORE the verified one is hedged", () => {
  // The regression this file exists for. `<` returns false here and the UI
  // prints a date nobody checked as though it were confirmed.
  assert.equal(
    isApproximate({ kickoffDate: "08-29", verifiedFor: 2027 }, year(2026)),
    true,
    "a window verified for 2027 says nothing about 2026 — an earlier year is just as unchecked as a later one and must keep its ~",
  );
});

test("an opener in a year AFTER the verified one is hedged", () => {
  assert.equal(
    isApproximate({ kickoffDate: "08-29", verifiedFor: 2027 }, year(2028)),
    true,
    "past the verified year kickoffDate is another season's date recurring",
  );
});

test("a league with no kickoffDate is always hedged", () => {
  assert.equal(
    isApproximate({ verifiedFor: 2026 }, year(2026)),
    true,
    "with no kickoffDate the opener falls back to startDate, which opens days before the first real fixture by design",
  );
  assert.equal(
    isApproximate({}, year(2026)),
    true,
    "an unset verifiedFor must never read as confirmed",
  );
});

// The predicate being right is only half of it — it has to be right about the
// rows actually shipped. Scanning ALL_LEAGUES keeps this honest if the table
// changes.
const ROWS = [...ESPN_SRC.matchAll(/^\s*\{\s*sport:\s*"[^"]+",.*\},\s*$/gm)].map(
  (m) => new Function(`"use strict"; return (${m[0].trim().replace(/,$/, "")});`)() as {
    sport: string;
    label: string;
    kickoffDate?: string;
    verifiedFor?: number;
  },
);

test("the ALL_LEAGUES scan actually found the league catalog", () => {
  // 50 rows as of 2026-09-08. A floor, not the exact count, so adding a league
  // doesn't fail the suite — but a scan that silently matched nothing does.
  assert.ok(
    ROWS.length >= 40,
    `only ${ROWS.length} league rows scanned out of espn.ts — the ALL_LEAGUES literal shape changed`,
  );
});

test("every league verified for a FUTURE season still hedges the seasons before it", () => {
  // Not a date-drift check — this is the class of row the old `<` got wrong, and
  // it is populated whenever someone re-verifies a season ahead of time.
  const ahead = ROWS.filter((r) => r.kickoffDate && r.verifiedFor && r.verifiedFor > 2026);
  for (const r of ahead) {
    assert.equal(
      isApproximate(r, year(r.verifiedFor! - 1)),
      true,
      `${r.sport}/${r.label} is verified for ${r.verifiedFor} but would state its ${r.verifiedFor! - 1} opener (${r.kickoffDate}) as fact`,
    );
    assert.equal(
      isApproximate(r, year(r.verifiedFor!)),
      false,
      `${r.sport}/${r.label} should state its ${r.verifiedFor} opener as fact — that is the year that was checked`,
    );
  }
});
