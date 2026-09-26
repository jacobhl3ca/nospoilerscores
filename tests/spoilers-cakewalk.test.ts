import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "cakewalk" is the noun twin of the existing "blow[- ]?outs?" entry and of the "romp\w*" verb — the
// everyday recap label for a one-sided, no-contest win ("a cakewalk for City", "the final proved a
// cakewalk"). Standing alone (not "cakewalk win"/"cakewalk victory", which "win"/"victory" already
// catch) it carries no digit for SCORE_RX and fired no other keyword, so a "… cakewalk" title leaked
// the lopsided result. Anchored like its "blow[- ]?outs?"/"shut[- ]?outs?" siblings, the optional
// "[- ]?" covers the closed/hyphen/spaced spellings and "s?" the plural.
test("a 'cakewalk' one-sided-win label never reads as a clean title", () => {
  for (const title of [
    "It was a cakewalk for City",
    "The final proved a cakewalk",
    "A cakewalk in the derby",
    "Rovers cakewalk to glory",
    "Cake walk for the Lakers",
    "A cake-walk at the Bernabeu",
    "Two more cakewalks this week",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause only fires on the whole "cake[- ]?walk" compound, so a stray "cake" or "walk" on its own
// stays visible — a bare "cake", a "walk" that is not "walk-off", and the mid-word "boardwalk" never
// trip it. (A preview like "won't be a cakewalk" does match, an over-hide the filter deliberately
// accepts, so it is not asserted here.)
test("a stray 'cake' or 'walk' is not over-hidden", () => {
  for (const title of [
    "Bakery unveils a giant cake for supporters",
    "Pre-match walk to the ground",
    "How to watch: preview and predictions",
    "Fans on the boardwalk before kickoff",
    "The half-time cake competition returns",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
