import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "force (a) Game 7 / a deciding game / a decider" is the series-EXTENDING idiom
// NBA/NHL/MLB playoff recaps lead with when the trailing side wins an elimination
// game to keep the series alive: "Celtics force Game 7", "Oilers force a deciding
// Game 7", "Heat force a decider". You can only force a further game by WINNING to
// avoid elimination, so it discloses that game's winner — the same series-reveal the
// series-CLINCH ("close out the series") and series-EQUALISER ("even the series")
// idioms beside it mask — yet the "Game 7" number is the game index, not a score, so
// SCORE_RX ignores it and, matching no existing keyword, a bare "… force Game 7" leaked.
test("a 'force Game N / decider' series-extending reveal never reads as a clean title", () => {
  for (const title of [
    "Celtics force Game 7 | NBA Highlights",
    "Lakers force a Game 7 in Denver",
    "Oilers force a deciding Game 7",
    "Heat force a decider",
    "Rangers force Game 5 on the road",
    "Knicks forced Game 7",
    "Panthers force a deciding game",
    "Suns force game seven",
    "Down 3-1, the Bruins force another Game 6",
    "Nuggets forcing Game 7",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to a leading "force" verb immediately governing a decider
// object — "game" + a number (or spelled "five"/"seven"), a "deciding game", or a bare
// "decider" — so the everyday senses of "force" ("Air Force game", "task force",
// "brute force", "show of force") pass through untouched, as do previews with no
// decider object attached.
test("ordinary uses of 'force' are not over-hidden", () => {
  for (const title of [
    "Air Force football schedule announced",
    "Air Force game preview tonight",
    "Task force to review the game postponement",
    "A show of force from the defense | Analysis",
    "How to watch the game tonight",
    "The deciding factor in tonight's clash | Preview",
    "Brute force isn't enough at this level | Column",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
