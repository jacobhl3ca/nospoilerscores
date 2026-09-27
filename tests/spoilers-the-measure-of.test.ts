import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "have/get the measure of" is the direct sibling of the existing "get the better
// of" clause: "X have/get the measure of Y" names the side that had Y beaten and
// controlled — a staple dominance idiom across soccer, cricket and tennis. It
// reuses the get/got/getting verbs "get the better of" already carries and adds
// the have/has/had/having forms the completed-result phrasing usually takes. It
// carries no digits, so SCORE_RX misses it, and no existing keyword caught it.
test("a 'have/get the measure of' dominance reveal never reads as a clean title", () => {
  for (const title of [
    "Australia have the measure of England",
    "City get the measure of United",
    "Verstappen had the measure of the field",
    "Liverpool have the measure of Arsenal at Anfield",
    "Djokovic has the measure of Alcaraz",
    "United having the measure of Chelsea throughout",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory "the measure of" tail plus a leading verb keeps it safe. The
// assessment sense "take the measure of" (sizing up an opponent) is deliberately
// left out, forms with no leading verb never fire, and "the" is required after the
// verb — so "a fair measure of" / "have a full measure of" pass through untouched.
test("an assessment or verb-less 'measure of' is not over-hidden", () => {
  for (const title of [
    "How to take the measure of your rivals before kickoff",
    "This is the measure of the team right now",
    "A fair measure of the challenge ahead",
    "Coaches must have a full measure of fitness data",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
