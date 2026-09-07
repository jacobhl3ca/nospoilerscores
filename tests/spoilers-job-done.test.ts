import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get the job done" is the workmanlike-win idiom recap titles reach for when the
// named side won without drama: "Napoli get the job done against Roma", "Man City
// gets the job done at the Etihad". In a match title it always means that team came
// away with the win/result, yet it carries no digits for SCORE_RX and matched no
// existing keyword, so a highlight title written this way slipped past the mask.
// The fixed "the job done" tail is what makes it a spoiler and keeps bare
// "get"/"got" safe.
test("a 'get the job done' win reveal never reads as a clean title", () => {
  for (const title of [
    "Napoli get the job done against Roma | Serie A Highlights",
    "Man City gets the job done at the Etihad",
    "Chiefs got the job done in Denver",
    "Liverpool made to work but get the job done at Anfield",
    "Getting the job done: USMNT ease past Canada",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The "get the" prefix is optional, so the bare declarative "Job done" — the
// title-style sibling recap channels lead with — is a spoiler in its own right.
// It read as a clean title before, because the pattern required the verb prefix.
test("a bare 'Job done' declaration never reads as a clean title", () => {
  for (const title of [
    "Arsenal: Job done",
    "Job done for the Gunners | Match Highlights",
    "JOB DONE ✅ | Premier League",
    "Job done and dusted at Anfield",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the fixed "job done" tail, so the everyday senses of
// "get"/"got"/"job" — which appear constantly in ordinary titles — must still pass
// through untouched. The bare form still needs the two words "job done" adjacent:
// "a job well done" has "well" between them, and "Jobe … done deal" is the name
// "Jobe", not the word "job", so neither trips the mask.
test("ordinary uses of 'get'/'job' are not over-hidden", () => {
  for (const title of [
    "How to get better at free kicks",
    "The best job in football? A day with the groundskeeper",
    "Get to know the new signing | Player interview",
    "Match preview: can Arsenal find a way through?",
    "Top 10 goals of the season compilation",
    "A job well done? Season in review",
    "Jobe Bellingham done deal | Transfer news",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
