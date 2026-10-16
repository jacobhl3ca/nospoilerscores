import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// Champions Cup window + European cup knockouts, 2026-10-14 (a "League request:
// Investec Champions Cup" from the feedback form). The column was in the app
// but opened on 12-05, so round 1 (Oct 16–18) was hidden and Settings, which
// hides offseason rows, never listed it. Real ESPN events in
// fixtures/epcr-2026-knockouts.json: the 2025-26 knockouts of both cups plus a
// 2026-27 pool game (Sale Sharks v Glasgow Warriors, 2026-10-17).
const jiti = createJiti(import.meta.url);
type Game = { sport: string; date: string; isPlayoff: boolean; playoffLabel?: string | null; stage?: string | null };
type League = { sport: string; label: string; startDate?: string; endDate?: string; championshipDate?: string; verifiedFor?: number; excludeFromAuto?: boolean };
const espn = await jiti.import<{
  ALL_LEAGUES: League[];
  isLeagueActive: (league: League, viewDate: Date) => boolean;
  isLeagueUpcoming: (league: League, viewDate: Date) => boolean;
  parseGame: (event: unknown, sport: string) => Game;
}>("../src/lib/espn.ts");
const { pairingSpoilsEarlierRound, pairingRoundLabel } = await jiti.import<{
  pairingSpoilsEarlierRound: (g: Game) => boolean;
  pairingRoundLabel: (g: Game) => string;
}>("../src/lib/pairingMask.ts");
const { epcrKnockoutRound } = await jiti.import<{
  epcrKnockoutRound: (sport: "rugbychamp" | "challengecup", iso: string) => string | null;
}>("../src/lib/playoffDates.ts");

const events: ({ _cup: string; date: string; name: string })[] = JSON.parse(
  readFileSync(new URL("./fixtures/epcr-2026-knockouts.json", import.meta.url), "utf8"),
);
const cup = espn.ALL_LEAGUES.find((l) => l.sport === "rugbychamp")!;

test("the Champions Cup window holds round 1, December, January and the final", () => {
  assert.equal(cup.startDate, "10-16");
  assert.equal(cup.championshipDate, "05-22");
  assert.equal(cup.verifiedFor, 2026);
  assert.equal(cup.excludeFromAuto, true);
  for (const d of [new Date(2026, 9, 16), new Date(2026, 9, 17), new Date(2026, 9, 18), new Date(2026, 11, 11), new Date(2027, 0, 16), new Date(2027, 4, 22)]) {
    assert.ok(espn.isLeagueActive(cup, d), d.toDateString());
  }
  assert.ok(!espn.isLeagueActive(cup, new Date(2027, 6, 1)), "off in July");
});

test("on 2026-10-14 the catalog lists the cup as upcoming, not offseason", () => {
  const oct14 = new Date(2026, 9, 14, 12);
  assert.equal(espn.isLeagueActive(cup, oct14), false);
  assert.equal(espn.isLeagueUpcoming(cup, oct14), true);
  // The old 12-05 row read offseason that day, which is what hid it.
  const old = { ...cup, startDate: "12-05" };
  assert.equal(espn.isLeagueUpcoming(old, oct14), false);
});

test("knockout rounds come off the date table, for both cups", () => {
  assert.equal(epcrKnockoutRound("rugbychamp", "2026-04-04T16:30Z"), "Round of 16");
  assert.equal(epcrKnockoutRound("rugbychamp", "2026-04-11T14:00Z"), "Quarterfinal");
  assert.equal(epcrKnockoutRound("challengecup", "2026-05-03T11:30Z"), "Semifinal");
  assert.equal(epcrKnockoutRound("challengecup", "2026-05-22T19:00Z"), "Final");
  assert.equal(epcrKnockoutRound("rugbychamp", "2027-05-22T14:00Z"), "Final");
  // Pool rounds never fall in a knockout week.
  for (const iso of ["2026-10-16T19:00Z", "2026-12-12T15:00Z", "2027-01-17T13:00Z"]) {
    assert.equal(epcrKnockoutRound("rugbychamp", iso), null, iso);
  }
});

test("the 2026 knockouts: R16 shows, QF / SF / Final are covered", () => {
  const want: Record<string, [string | null, boolean]> = {
    "2026-04-04T16:30Z": ["Round of 16", false],
    "2026-04-04T19:00Z": ["Round of 16", false],
    "2026-04-11T14:00Z": ["Quarterfinal", true],
    "2026-05-02T14:00Z": ["Semifinal", true],
    "2026-05-22T19:00Z": ["Final", true],
    "2026-05-23T13:45Z": ["Final", true],
    "2026-10-17T12:00Z": [null, false],
  };
  assert.equal(events.length, Object.keys(want).length);
  for (const e of events) {
    const g = espn.parseGame(e, e._cup);
    const [label, masks] = want[e.date];
    assert.equal(g.isPlayoff, label != null, `${e.name} isPlayoff`);
    assert.equal(g.playoffLabel ?? null, label, `${e.name} label`);
    assert.equal(pairingSpoilsEarlierRound(g), masks, `${e.name} mask`);
    if (masks) assert.equal(pairingRoundLabel(g), label);
  }
});
