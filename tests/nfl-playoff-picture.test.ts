import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildNflPicture, wildCardPairings, type NflStandingsPayload } from "../src/lib/nflPlayoffPicture.ts";

// The live ESPN payload (level=3) after Week 4 of 2026, saved 2026-10-07. ESPN's
// own playoffSeed is in it, so the seeds this module computes can be checked
// against ESPN's.
const LIVE = JSON.parse(
  fs.readFileSync(new URL("./fixtures/espn-nfl-standings-level3-2026-10-07.json", import.meta.url), "utf8"),
) as NflStandingsPayload;

test("7 seeds per conference, matching ESPN's playoffSeed", () => {
  const p = buildNflPicture(LIVE);
  assert.equal(p.season, 2026);
  assert.deepEqual(p.conferences.map((c) => c.key), ["AFC", "NFC"]);
  for (const c of p.conferences) {
    assert.equal(c.seeds.length, 7);
    assert.equal(c.divisions.length, 4);
    for (const t of c.seeds) assert.equal(t.seed, t.espnSeed, `${c.key} ${t.abbrev}`);
    assert.equal(c.seeds.length + c.hunt.length + c.out.length, 16);
  }
});

test("division winners take seeds 1-4 even with a worse record than a wild card", () => {
  // NFC after Week 4: Carolina leads the South at 2-2 and is seed 4, ahead of
  // 3-1 Chicago and Seattle, who are wild cards.
  const nfc = buildNflPicture(LIVE).conferences[1];
  assert.equal(nfc.seeds[3].abbrev, "CAR");
  assert.ok(nfc.seeds.slice(0, 4).every((t) => t.divisionLeader));
  assert.ok(nfc.seeds.slice(4).every((t) => !t.divisionLeader));
  assert.ok(nfc.seeds[4].pct > nfc.seeds[3].pct);
});

test("wild card pairings are 2v7, 3v6, 4v5 with the higher seed at home", () => {
  const afc = buildNflPicture(LIVE).conferences[0];
  const pairs = wildCardPairings(afc).map((m) => [m.home?.seed, m.away?.seed]);
  assert.deepEqual(pairs, [[2, 7], [3, 6], [4, 5]]);
});

test("games back is measured from the division leader", () => {
  const afc = buildNflPicture(LIVE).conferences[0];
  const west = afc.divisions.find((d) => d.name === "AFC West")!;
  assert.equal(west.teams[0].gamesBack, "-");
  assert.ok(west.teams.slice(1).every((t) => t.gamesBack !== "-"));
});

test("a clincher letter maps to a status, and e moves a club out of the hunt", () => {
  const data = JSON.parse(JSON.stringify(LIVE)) as NflStandingsPayload;
  const east = data.children![0].children![0];
  const entries = east.standings!.entries!;
  const last = entries.find((e) => e.team?.abbreviation === "MIA")!;
  last.stats!.push({ name: "clincher", displayValue: "e" });
  const first = entries.find((e) => e.team?.abbreviation === "BUF")!;
  first.stats!.push({ name: "clincher", displayValue: "y" });
  const afc = buildNflPicture(data).conferences[0];
  assert.ok(afc.out.some((t) => t.abbrev === "MIA"));
  assert.ok(!afc.hunt.some((t) => t.abbrev === "MIA"));
  assert.equal(afc.seeds.find((t) => t.abbrev === "BUF")?.clinch, "division");
});

test("no points for or against reach the model", () => {
  const p = buildNflPicture(LIVE);
  const keys = new Set(p.conferences.flatMap((c) => c.divisions.flatMap((d) => d.teams.flatMap((t) => Object.keys(t)))));
  for (const k of keys) assert.ok(!/point|differential/i.test(k), k);
});
