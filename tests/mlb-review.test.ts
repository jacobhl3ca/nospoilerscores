import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import {
  classifyMlbReviewTitle,
  normalizeReviewMonth,
  mlbReviewSeason,
  mlbTeamIdsFromKeywords,
  mlbToEspnTeamIds,
  MONTH_ORDER,
  ROUND_ORDER,
} from "../scripts/lib/recaps.mjs";
import type { MlbReview, MlbReviewTeamRec } from "../src/lib/mlbReview.ts";

// mlbReview.ts imports @/lib/youtube at runtime → load through jiti, as
// recaps.test.ts does.
const jiti = createJiti(import.meta.url);
const { mlbReviewPillDue, mlbReviewPillEnd, sortTeamsForFavorites, mlbReviewHasContent } = (await jiti.import("../src/lib/mlbReview.ts")) as {
  mlbReviewPillDue: (selectedDate: string, review: MlbReview | null | undefined, isToday: boolean) => boolean;
  mlbReviewPillEnd: (season: number) => string;
  sortTeamsForFavorites: <T extends Pick<MlbReviewTeamRec, "espnTeamIds">>(teams: T[], favs: string[]) => { favorites: T[]; others: T[] };
  mlbReviewHasContent: (review: MlbReview | null | undefined) => boolean;
};

const kind = (t: string) => classifyMlbReviewTitle(t)?.kind ?? null;

test("classifyMlbReviewTitle: the 2025 month cuts, both 2026 spellings", () => {
  assert.deepEqual(classifyMlbReviewTitle("Top 25 Plays of the Month: March/April"), { kind: "monthTop25", order: 4, label: "March/April", year: null });
  assert.deepEqual(classifyMlbReviewTitle("Top 25 Plays of the Month: March and April"), { kind: "monthTop25", order: 4, label: "March/April", year: null });
  assert.deepEqual(classifyMlbReviewTitle("Top 25 plays from August 2026"), { kind: "monthTop25", order: 8, label: "August", year: 2026 });
  assert.equal(classifyMlbReviewTitle("Top 25 Plays of the Month: September")?.order, 9);
  // Trailing space on MLB's own title; "April" alone shares the March/April row.
  assert.deepEqual(classifyMlbReviewTitle("Oddities of the Month: April "), { kind: "monthOdd", order: 4, label: "March/April", year: null });
  assert.equal(kind("Oddities of the Month: July"), "monthOdd");
  assert.equal(kind("Top 25 Plays of the Month: Smarch"), null);
});

test("classifyMlbReviewTitle: postseason and rounds", () => {
  assert.equal(kind("Top 25 plays of the postseason"), "postTop25");
  for (const [t, key] of [
    ["Top 10 Plays of the Wild Card Round", "wildcard"],
    ["Top 10 Plays of the Division Series ", "division"],
    ["Top 10 Plays of the Championship Series", "championship"],
    ["Top 10 plays of the World Series", "worldseries"],
  ] as const) {
    assert.deepEqual(classifyMlbReviewTitle(t), { kind: "roundTop10", key, label: classifyMlbReviewTitle(t)!.label, year: null }, t);
  }
  assert.equal(classifyMlbReviewTitle("Oddities of the 2025 World Series")?.key, "worldseries");
  assert.equal(classifyMlbReviewTitle("Oddities of the Wild Card Round")?.kind, "roundOdd");
  assert.equal(classifyMlbReviewTitle("Oddities of the Division Series")?.label, "Division Series");
  // Weekly round-ups and one-league cuts are not rounds.
  assert.equal(kind("Oddities of the Week: 9/23/26"), null);
  assert.equal(kind("Top 10 Plays of the Week"), null);
  assert.equal(kind("Top 10 Plays of the AL Division Series"), null);
});

test("classifyMlbReviewTitle: year-end shows keep the whole show only", () => {
  for (const t of [
    "The best Stats and Oddities of 2025",
    "Top Bat Flips of 2025",
    "The Top Finishes of 2025",
    "Top Postseason Performers of 2025",
    "Top Games of 2025",
    "Electrifying Moments of 2025",
    "Recapping the Top 100 Plays of 2025",
    "The Top Rookies of the 2025 season",
  ]) {
    assert.deepEqual(classifyMlbReviewTitle(t), { kind: "yearEnd", label: t, year: 2025 }, t);
  }
  // The countdown parts and the spoiler-titled splits.
  for (const t of [
    "Top Finishes of 2025: Dodgers capture Game 7",
    "Top Bat Flips of 2024: #25-21",
    "Top Defensive Plays of 2025: #1 - Denzel Clarke",
    "Electrifying Moments of 2025: #1",
    "Aaron Judge is the No. 2 Player Right Now",
    "Top 100 Prospects for 2026 Season",
    "2025 Top 100 Players Right Now",
  ]) {
    assert.equal(kind(t), null, t);
  }
});

test("classifyMlbReviewTitle: Stats & Oddities per team/player", () => {
  assert.deepEqual(classifyMlbReviewTitle("Stats & Oddities of 2025: Royals"), { kind: "team", label: "Royals", year: 2025 });
  assert.equal(classifyMlbReviewTitle("Stats & Oddities of 2025: Steven Kwan, José Ramírez")?.label, "Steven Kwan, José Ramírez");
  assert.equal(kind("Christian Yelich loses bat on swing"), null);
});

test("month and round ordering", () => {
  assert.equal(MONTH_ORDER["march/april"], 4);
  assert.equal(MONTH_ORDER.september, 9);
  assert.equal(normalizeReviewMonth("May")?.order, 5);
  assert.equal(normalizeReviewMonth("March & April")?.label, "March/April");
  assert.equal(normalizeReviewMonth("Neverember"), null);
  assert.deepEqual(ROUND_ORDER, ["wildcard", "division", "championship", "worldseries"]);
});

test("mlbReviewSeason: January and February belong to last season", () => {
  assert.equal(mlbReviewSeason("20261105"), 2026);
  assert.equal(mlbReviewSeason("20270115"), 2026);
  assert.equal(mlbReviewSeason("20270228"), 2026);
  assert.equal(mlbReviewSeason("20270301"), 2027);
  assert.equal(mlbReviewSeason("bad"), null);
});

test("team id helpers: keywords and the ESPN join", () => {
  assert.deepEqual(mlbTeamIdsFromKeywords([{ slug: "playerid-663728" }, { slug: "teamid-136" }, { slug: "teamid-136" }]), ["136"]);
  const map = mlbToEspnTeamIds(
    [{ id: 109, abbreviation: "AZ" }, { id: 145, abbreviation: "CWS" }, { id: 118, abbreviation: "KC" }],
    [{ id: "29", abbreviation: "ARI" }, { id: "4", abbreviation: "CHW" }, { id: "7", abbreviation: "KC" }],
  );
  assert.equal(map.get("109"), "29");
  assert.equal(map.get("145"), "4");
  assert.equal(map.get("118"), "7");
});

const rec = (slug: string) => ({ slug, pageUrl: `https://www.mlb.com/video/${slug}`, playbackUrl: `https://x.invalid/${slug}.m3u8`, sourcePolicy: "mlb.com" as const, channel: "MLB.com" as const });
const REVIEW: MlbReview = {
  fetchedAt: "2026-11-03T12:00:00Z",
  season: 2026,
  seasonOver: true,
  seasonOverSince: "20261102",
  months: [{ label: "May", order: 5, top25: rec("may"), oddities: null }],
  postseasonTop25: null,
  rounds: [],
  yearEnd: [],
  teams: [],
};

test("mlbReviewPillDue: from the World Series cut's day to Feb 14, today only", () => {
  assert.equal(mlbReviewPillEnd(2026), "20270215");
  assert.equal(mlbReviewPillDue("20261101", REVIEW, true), false);
  assert.equal(mlbReviewPillDue("20261102", REVIEW, true), true);
  assert.equal(mlbReviewPillDue("20270214", REVIEW, true), true);
  assert.equal(mlbReviewPillDue("20270215", REVIEW, true), false);
  assert.equal(mlbReviewPillDue("20261105", REVIEW, false), false);
  assert.equal(mlbReviewPillDue("20261105", { ...REVIEW, seasonOver: false, seasonOverSince: undefined }, true), false);
  assert.equal(mlbReviewPillDue("20261105", null, true), false);
  // Nothing resolved → no pill (never an empty dialog).
  assert.equal(mlbReviewHasContent({ ...REVIEW, months: [] }), false);
  assert.equal(mlbReviewPillDue("20261105", { ...REVIEW, months: [] }, true), false);
});

test("sortTeamsForFavorites: favorites first in favorite order, a player counts for his team", () => {
  const teams = [
    { subject: "Angels", espnTeamIds: ["3"] },
    { subject: "Cal Raleigh", espnTeamIds: ["12"] },
    { subject: "Royals", espnTeamIds: ["7"] },
    { subject: "Mariners", espnTeamIds: ["12"] },
  ];
  const { favorites, others } = sortTeamsForFavorites(teams, ["nfl-12", "mlb-7", "mlb-12"]);
  assert.deepEqual(favorites.map((t) => t.subject), ["Royals", "Cal Raleigh", "Mariners"]);
  assert.deepEqual(others.map((t) => t.subject), ["Angels"]);
  assert.equal(sortTeamsForFavorites(teams, []).favorites.length, 0);
});
