import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "take/took/drop/steal Game N" and "take/drop the opener|nightcap|finale" is the
// single-game sibling of "take/drop the series": in a playoff series MLB/NBA/NHL recaps
// lead with the per-game result — "Dodgers take Game 1", "Yankees drop Game 3", "Celtics
// steal Game 2 on the road", "Astros drop the opener", "Guardians take the nightcap",
// "Mets drop the finale". Taking/stealing a game is winning it and dropping it is losing
// it — a per-game winner/loser reveal — yet on its own it carries no digit for SCORE_RX
// (the "4-2" tally, not the "take game 1" phrase) and the "win"/"lose" keywords fire on
// those verbs but not on "take"/"took"/"drop"/"steal", so a bare "… take Game 1" or "…
// drop the opener" leaked ("drop the series opener" only matched through "drop the series").
test("a 'take/drop/steal a game' per-game reveal never reads as a clean title", () => {
  for (const title of [
    "Dodgers take Game 1 over the Padres | MLB Highlights",
    "Yankees drop Game 3 in Houston",
    "Celtics steal Game 2 on the road",
    "Warriors took Game 5 to lead the series",
    "Heat dropping Game 6 at home",
    "Panthers stole game 1 in overtime",
    "Reds take the opener",
    "Astros drop the opener at Minute Maid",
    "Guardians take the nightcap to split the doubleheader",
    "Mets drop the finale in Philadelphia",
    "Bruins take the series finale",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Each verb has to immediately govern the game noun, so the preview and how-to framings
// the "take the series" sibling already keeps visible stay visible: naming a game without
// a result verb, or a "take"/"drop" in its everyday sense, passes through untouched. A
// "matchday 2" fixture line never fires because the noun is "matchday", not "match", and
// "Take: Game 1" is broken by the colon between the verb and the game.
test("previews and non-result mentions of a game are not over-hidden", () => {
  for (const title of [
    "How to watch the series opener this weekend",
    "Game 1 preview: keys to the matchup",
    "Watch Game 3 live tonight",
    "Take a look at the Game 1 storylines",
    "Take: Game 1 thoughts and hot takes",
    "Season opener predictions and preview",
    "Arsenal vs Chelsea - Matchday 2 preview",
    "Drop the ball no more — new gloves reviewed",
    "The series continues Thursday in Miami | Preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
