import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "claim/take/earn the bragging rights" (and "bragging rights go/belong to <side>") is the derby
// winner-reveal counterpart of the already-keyworded "(?:claim|take|took) the honou?rs"/"the spoils"
// cluster: a side that CLAIMS/TAKES/EARNS the bragging rights won the rivalry match, and cross-town
// derby recaps in every sport lead with exactly that wording. It carries no digits (SCORE_RX misses
// it) and matched none of the existing claim/take verbs, so those winner reveals were leaking. The
// pattern is anchored to a claim/take/earn verb immediately before the "bragging rights" object (or
// to "go/went/belong to" immediately after it), which is what makes it a settled result rather than
// a preview.
test("a 'bragging rights' derby winner reveal never reads as a clean fixture", () => {
  for (const title of [
    "Arsenal claim derby bragging rights",
    "City take the bragging rights in the Manchester derby",
    "Bragging rights go to Liverpool",
    "United earn bragging rights",
    "Merseyside derby bragging rights belong to Everton",
    "Spurs claimed the North London bragging rights",
    "Rangers take local bragging rights in the Old Firm",
    "Derby bragging rights went to City",
    "Chelsea earn the London bragging rights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the claim/take/earn verb (or the "go/belong to" tail), so previews that
// only put the bragging rights AT STAKE — with no side named as having taken them — must still pass
// through untouched. These are exactly the fixture/preview headlines the filter must not over-hide.
test("bragging-rights previews are not over-hidden", () => {
  for (const title of [
    "Bragging rights on the line as United host City",
    "Manchester derby preview: bragging rights at stake",
    "Bragging rights up for grabs in Sunday's derby",
    "Who has the bragging rights ahead of the derby?",
    "Bragging rights to be settled at the Etihad",
    "Local bragging rights the prize when rivals meet",
    "North London derby: everything to play for",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
