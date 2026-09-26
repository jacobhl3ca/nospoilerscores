import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "come away with a point" is the stock away-team draw idiom (one point = a
// draw), "come away with the points" names an away win, and "come away with
// nothing" / "come away empty-handed" names an away loss — each reveals the
// result outright yet carries no digit (SCORE_RX misses it) and, on the bare
// idiom, matched no existing keyword before.
test("a 'come away with ...' result reveal never reads as a clean title", () => {
  for (const title of [
    "Palace come away with a point from the Emirates",
    "Spurs came away with a point at Anfield",
    "Brighton come away with just a point",
    "Fulham came away with only a point",
    "Villa come away with a single point",
    "City come away with the points",
    "Everton came away with nothing",
    "Leeds come away empty-handed",
    "Wolves came away empty handed at the Etihad",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The "(?!to prove|to make)" lookahead and the leading word boundary keep the
// preview phrase "a point to prove/make" and the unrelated "welcome away"
// visible, along with copy that merely mentions coming away with something else.
test("'a point to prove' and other non-result 'come away' copy are not over-hidden", () => {
  for (const title of [
    "Palace have a point to prove this weekend",
    "Rovers come away with a point to prove",
    "United come away with a point to make",
    "Welcome away days: a fan travel guide",
    "The players came away with valuable experience",
    "Fans come away with signed shirts",
    "Preview: who comes away happy tonight?",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
