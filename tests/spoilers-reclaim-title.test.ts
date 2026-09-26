import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "reclaim the title/crown/trophy" is the regain-the-crown sibling of the already-keyworded
// "claim the title" coronation reveal — a side that RECLAIMS silverware won it back, an
// achieved champion just like one that claims it. The base "claim" alternative could never
// reach it: the outcome group's leading \b won't let the match start inside "reclaim" (the
// "e"→"c" seam is no word boundary), so "reclaims the crown" slipped through untouched. The
// optional "(?:re)?" prefix closes that gap. Object-anchored exactly like its "claim …
// silverware" sibling: it fires ONLY before an unambiguous title/crown/trophy object, so the
// everyday non-result senses of "reclaim" ("reclaim your data", "land reclamation") stay clear.
test("a 'reclaim the title/crown' champion reveal never reads as a clean title", () => {
  for (const title of [
    "City reclaim the title",
    "Joshua reclaims the crown",
    "Alonso reclaimed the championship in style",
    "Liverpool reclaiming the trophy after a decade",
    "Rangers reclaim the silverware at Hampden",
    "Verstappen reclaims the crown | Season Review",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The prefix rides on the same object anchor, so the ordinary non-result senses of "reclaim"
// — which carry no silverware object — must still pass through untouched.
test("ordinary uses of 'reclaim' are not over-hidden", () => {
  for (const title of [
    "Reclaim your data: a privacy how-to",
    "Land reclamation project reshapes the waterfront",
    "How to reclaim your mornings after a hectic week",
    "The club looks to reclaim its youth academy space",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
