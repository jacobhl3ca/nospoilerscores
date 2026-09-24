import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// In soccer three points means a win, so a named side that "takes/claims/grabs/collects/pockets/
// scoops the points" is the outright WINNER — the win-side sibling of the "share the spoils"/"share
// the points" DRAW idioms the filter already catches. Each names the winner, carries no digit for
// SCORE_RX, and slipped past every existing keyword (the "maximum points"/"all three points" branches
// need those qualifier words; "share the points" is the draw verb; "come away with the points" needs
// the "come away with" frame), so a "… take the points" recap title was leaking.
test("a bare 'take/claim/grab the points' winner reveal never reads as a clean title", () => {
  for (const title of [
    "City take the points at the Etihad | Highlights",
    "Arsenal claim the points at home",
    "Liverpool grab the points late on",
    "United collect the points in the derby",
    "Chelsea pocket the points at Stamford Bridge",
    "Spurs scoop the points on the road",
    "Newcastle took the points off Villa",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is anchored to the literal "the points" object right after a WIN verb, so a title that
// only mentions "the points" as a noun (standings, points on offer, points difference) — with no
// take/claim/grab verb immediately before it — must stay untouched, and the draw verb "share" must
// not fire this win-side branch.
test("a plain 'the points' noun with no winning verb is not over-hidden", () => {
  for (const title of [
    "How the points table looks after the weekend",
    "Team news and the points on offer this weekend",
    "The points difference could decide the title race",
    "Full-match replay: United vs City",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
