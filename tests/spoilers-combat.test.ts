import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The words a fight card is actually titled with. Each of these leaked through
// before 2026-08-10 — the filter only knew "TKO", "submission" and the spelled-
// out "knocked out", none of which is how the UFC or DAZN channels write it.
test("a fight result never reads as a clean title", () => {
  for (const title of [
    "Jon Jones def. Stipe Miocic | UFC 309 Highlights",
    "Islam Makhachev stops Volkanovski in Round 1",
    "Alex Pereira KOs Jiri Prochazka",
    "Topuria KO'd Holloway | Full Fight Highlights",
    "Usyk retains undisputed crown",
    "Merab finishes O'Malley at UFC 306",
    "Ngannou starched Gane in 60 seconds",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The combat words are broad on purpose, but they must not swallow the ordinary
// house-style titles the mask is supposed to lift for.
test("the combat words do not swallow ordinary highlight titles", () => {
  for (const title of [
    "Mets vs Braves | Game Highlights",
    "UFC 309: Jones vs Miocic | Official Weigh-in",
    "Full Fight Preview | UFC 310",
    "Bears Press Conference: Week 15",
    "Heineken Dutch Grand Prix | Race Highlights",
    "PGA Championship Round 2 Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// A box-score-style title names two teams and two scores with nothing but a
// space (comma optional) between them — no hyphen anywhere for SCORE_RX to
// catch, and no outcome keyword either.
test("a comma or space scoreline never reads as a clean title", () => {
  for (const title of [
    "GAME RECAP: Grizzlies 110, Lakers 105",
    "GAME RECAP: Grizzlies 110 Lakers 105",
    "Lakers 105 Grizzlies 110 final",
    "Chelsea 2-1 Arsenal",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// A bare number after a comma is not a second team name, so these must stay clean.
test("a date or listicle number does not read as a scoreline", () => {
  for (const title of ["Week 2, 2026 Highlights", "Top 10 plays, Sept 10"]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// SPOILER_RX's /i flag used to make the team/score/team/score alternative treat [A-Z] as any
// letter, so ordinary listicle and schedule titles read as a scoreline. Now that alternative is
// its own case-sensitive regex with a listicle-word guard — these must all stay clean.
test("a listicle or schedule title never reads as a scoreline", () => {
  for (const title of [
    "Top 10 Plays of Week 2",
    "Top 5 Moments from Week 12",
    "Top 5 Dunks from Game 2",
    "Top 3 Storylines Heading Into Round 2",
    "Ranking the Top 5 QBs After Week 6",
    "Best of Week 1 Top 10 Catches",
    "49ers Top 10 Plays of the Season Through Week 8",
    "Top 10 Plays Of Week 2",
    "Top 5 Dunks From Game 2",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// The Cloudflare worker carries its own copy of these patterns because it masks
// titles before the page ever loads. A copy that drifts is a copy that leaks on
// exactly one of the two paths, silently — so pin them together.
test("the worker's copy of the patterns is byte-identical", () => {
  const grab = (path: string, rx: RegExp) => {
    const m = fs.readFileSync(new URL(path, import.meta.url), "utf8").match(rx);
    return m?.[1] ?? null;
  };
  const SPOILER_SRC = /const SPOILER_RX = (\/\\b\(walk[\s\S]*?\/i);/;
  const TEAM_SCORE_SRC = /const TEAM_SCORE_RX =\s*\n?\s*(\/\\b\(\[A-Z\][\s\S]*?\\b\/);/;
  const LISTICLE_WORDS_SRC = /const TEAM_SCORE_LISTICLE_WORDS = new Set\(\[([\s\S]*?)\]\);/;

  const libSpoiler = grab("../src/lib/spoilers.ts", SPOILER_SRC);
  const workerSpoiler = grab("../public/_worker.js", SPOILER_SRC);
  assert.ok(libSpoiler, "could not find SPOILER_RX in src/lib/spoilers.ts");
  assert.ok(workerSpoiler, "could not find SPOILER_RX in public/_worker.js");
  assert.equal(workerSpoiler, libSpoiler);

  const libTeamScore = grab("../src/lib/spoilers.ts", TEAM_SCORE_SRC);
  const workerTeamScore = grab("../public/_worker.js", TEAM_SCORE_SRC);
  assert.ok(libTeamScore, "could not find TEAM_SCORE_RX in src/lib/spoilers.ts");
  assert.ok(workerTeamScore, "could not find TEAM_SCORE_RX in public/_worker.js");
  assert.equal(workerTeamScore, libTeamScore);

  const libWords = grab("../src/lib/spoilers.ts", LISTICLE_WORDS_SRC);
  const workerWords = grab("../public/_worker.js", LISTICLE_WORDS_SRC);
  assert.ok(libWords, "could not find TEAM_SCORE_LISTICLE_WORDS in src/lib/spoilers.ts");
  assert.ok(workerWords, "could not find TEAM_SCORE_LISTICLE_WORDS in public/_worker.js");
  assert.equal(workerWords.replace(/\s/g, ""), libWords.replace(/\s/g, ""));
});
