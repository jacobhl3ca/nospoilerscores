import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "<N> points clear" standings-lead phrasing: a table-position result reported as a numeric gap
// ("City go five points clear", "Arsenal now eight points clear"). It names the leader and the margin
// — a standings spoiler — yet carries no scoreline for SCORE_RX and matched none of the win/lead
// keywords ("leads?/leaders?" fire only on those exact words). Anchored to a number (digits or
// one–ten) directly before "point(s) clear", the sibling of the "top of the table" and "extend their
// advantage" standings reveals already handled.
test("an '<N> points clear' standings-lead reveal never reads as a clean title", () => {
  for (const title of [
    "City go five points clear at the top",
    "Arsenal now eight points clear",
    "Rangers one point clear of Celtic",
    "United move seven points clear",
    "Liverpool three points clear at the summit",
    "Leaders open up a 10-point clear gap",
    "Two points clear with a game in hand",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The count anchor is deliberate: it keeps the everyday non-standings sense of "clear" visible. A bare
// "clear" would swallow "clear chance", "clear favourites", "clear the ball" and the like, which name
// no standings result. Those must still pass through untouched, and the trailing \b keeps it off
// "clearance".
test("everyday 'clear' phrasings without a points count stay visible", () => {
  for (const title of [
    "Arsenal spurn a clear chance late on",
    "Clear favourites for the title this season",
    "Keeper races out to clear the ball",
    "Verstappen has clear track ahead of the pack",
    "A clear penalty decision divides opinion",
    "Defender makes a vital clearance off the line",
    "Ten points to prove this weekend",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
