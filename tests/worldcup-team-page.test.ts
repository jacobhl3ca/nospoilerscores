import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { WORLD_CUP_TEAMS } from "../src/lib/worldCupTeams.ts";
import { WORLD_CUP_2026_LAST_MATCH } from "../src/lib/worldcup2026-last-match.ts";

// /worldcup/teams/<slug>: after the final, each team page links to the board
// of that team's last match ("Open Spain's last match, <Month D>"). The date
// comes from worldCupLastMatchYmd, the switch from worldCup2026Ended, and the
// label from formatWorldCupDay. Dates only: these tests never name a round or
// a result, and assert no team's date by value.

// worldCup2026.ts imports @/lib/etDay at runtime, so load it through jiti,
// with the tsconfig "@/" path mapped onto src/.
const jiti = createJiti(import.meta.url, { alias: { "@/": fileURLToPath(new URL("../src/", import.meta.url)) } });
const wc = (await jiti.import("../src/lib/worldCup2026.ts")) as {
  WORLD_CUP_2026_OPENER: string;
  WORLD_CUP_2026_FINAL: string;
  worldCup2026Ended: () => boolean;
  parseWorldCupDateParam: (raw: string | null | undefined) => string | null;
  worldCupLastMatchYmd: (slug: string) => string | null;
  formatWorldCupDay: (ymd: string) => string;
};

test("every team page has a last-match date inside the tournament", () => {
  for (const t of WORLD_CUP_TEAMS) {
    const ymd = wc.worldCupLastMatchYmd(t.slug);
    assert.ok(ymd, `${t.slug} has no last-match date`);
    assert.match(ymd, /^\d{8}$/);
    assert.ok(ymd >= wc.WORLD_CUP_2026_OPENER && ymd <= wc.WORLD_CUP_2026_FINAL, `${t.slug}: ${ymd}`);
  }
});

test("the last-match link's ?d= is a date the /worldcup hub accepts", () => {
  for (const t of WORLD_CUP_TEAMS) {
    const ymd = wc.worldCupLastMatchYmd(t.slug)!;
    assert.equal(wc.parseWorldCupDateParam(ymd), ymd, t.slug);
  }
});

test("the generated table has no slug the grid lacks", () => {
  const slugs = new Set(WORLD_CUP_TEAMS.map((t) => t.slug));
  for (const key of Object.keys(WORLD_CUP_2026_LAST_MATCH)) assert.ok(slugs.has(key), key);
  assert.equal(Object.keys(WORLD_CUP_2026_LAST_MATCH).length, WORLD_CUP_TEAMS.length);
});

test("worldCupLastMatchYmd: unknown slug gives null, not a link", () => {
  assert.equal(wc.worldCupLastMatchYmd("not-a-team"), null);
  assert.equal(wc.worldCupLastMatchYmd(""), null);
  assert.equal(wc.worldCupLastMatchYmd("toString"), null);
});

test("formatWorldCupDay: month and day, no year", () => {
  assert.equal(wc.formatWorldCupDay("20260611"), "June 11");
  assert.equal(wc.formatWorldCupDay("20260701"), "July 1");
  assert.equal(wc.formatWorldCupDay(wc.WORLD_CUP_2026_FINAL), "July 19");
  for (const t of WORLD_CUP_TEAMS) {
    assert.match(wc.formatWorldCupDay(wc.worldCupLastMatchYmd(t.slug)!), /^(June|July) \d{1,2}$/, t.slug);
  }
});

test("parseWorldCupDateParam: only a real match day of the tournament", () => {
  assert.equal(wc.parseWorldCupDateParam(wc.WORLD_CUP_2026_OPENER), wc.WORLD_CUP_2026_OPENER);
  assert.equal(wc.parseWorldCupDateParam(wc.WORLD_CUP_2026_FINAL), wc.WORLD_CUP_2026_FINAL);
  assert.equal(wc.parseWorldCupDateParam("20260610"), null);
  assert.equal(wc.parseWorldCupDateParam("20260720"), null);
  assert.equal(wc.parseWorldCupDateParam("20260631"), null);
  assert.equal(wc.parseWorldCupDateParam("2026-06-20"), null);
  assert.equal(wc.parseWorldCupDateParam("2026062"), null);
  assert.equal(wc.parseWorldCupDateParam(""), null);
  assert.equal(wc.parseWorldCupDateParam(null), null);
  assert.equal(wc.parseWorldCupDateParam(undefined), null);
});

// The link shows only once the tournament is over. getEtServiceDate reads the
// service-zone wall clock and counts the hour after midnight as the day
// before. Pin the zone to ET so the result does not follow the host's zone.
const { setServiceTimeZone } = (await jiti.import("../src/lib/etDay.ts")) as {
  setServiceTimeZone: (tz: string | undefined) => void;
};
function at(iso: string): boolean {
  setServiceTimeZone("America/New_York");
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
  try { return wc.worldCup2026Ended(); }
  finally { mock.timers.reset(); setServiceTimeZone(undefined); }
}

test("worldCup2026Ended: false through the final day, true from the day after", () => {
  assert.equal(at("2026-06-11T16:00:00Z"), false);
  assert.equal(at("2026-07-19T23:00:00Z"), false);
  // 00:30 ET on July 20 is still the July 19 service day.
  assert.equal(at("2026-07-20T04:30:00Z"), false);
  assert.equal(at("2026-07-20T05:30:00Z"), true);
  assert.equal(at("2026-10-15T12:00:00Z"), true);
});
