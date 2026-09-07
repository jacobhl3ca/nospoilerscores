import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "goes the distance" is the outcome sibling of the scorecard-decision entry: a
// boxing/MMA bout that goes the distance reached the final bell with no stoppage,
// so a recap title saying so reveals the fight was NOT finished early — the same
// method-of-result leak the KO/TKO/submission/decision terms mask, told from the
// went-the-full-length angle. Each of these leaked before the entry was added.
test("a fight that goes the distance never reads as a clean title", () => {
  for (const title of [
    "Canelo goes the distance against Charlo",
    "Fury vs Usyk went the distance in Riyadh",
    "Going the distance: the full 12 rounds",
    "Gervonta Davis has gone the distance for the first time",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Scoped to the four completed-result forms goes/going/went/gone on purpose so the
// bare-infinitive PREVIEW form never fires: "Can X go the distance?" asks an open
// question whose answer is exactly what the mask must NOT give away. And "the
// distance" must follow immediately, so the everyday non-result uses stay clean.
test("the preview 'go the distance' and non-result uses stay clean", () => {
  for (const title of [
    "Can Fury go the distance against Usyk?",
    "Will he go the distance tonight? | Fight Preview",
    "Long-distance runner sets a new record",
    "He goes the extra distance in training",
    "Covering the full distance | Marathon Preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
