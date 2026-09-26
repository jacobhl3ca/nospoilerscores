import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "march on" / "go marching on" is one of the most common knockout-round headline
// idioms in world football (and tennis/cup coverage): a side that "marches on" has
// won and advanced, yet the phrase carries no digits (SCORE_RX misses it) and need
// name no beat/win word, so a bare "Arsenal march on" slipped straight through.
test("a 'march on' advancement reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal march on in the FA Cup",
    "Reds march on",
    "Man City marched on",
    "Spurs go marching on",
    "Inter go marching on",
    "Bayern march on in the Champions League",
    "Djokovic marches on at Wimbledon",
    "Team USA march on",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is kept to the intransitive win idiom. The everyday time-passing
// framing ("the season/tournament/time marches on") reveals no result; the
// fan-movement sense and the Leeds chant ("Marching on Together", "fans marching
// on to the stadium") describe walking, not advancing; and "marches onto the pitch"
// is a walk-out. A false positive here would drop a legit item from the worker's
// search results, not merely mask a title, so these all stay visible.
test("time-passing, fan-movement and 'marches onto' (no result) are not over-hidden", () => {
  for (const title of [
    "As the season marches on, the title race tightens",
    "The tournament marches on",
    "Time marches on for the veteran squad",
    "Fans keep marching on to the stadium",
    "Marching on Together at Elland Road",
    "Liverpool march onto the pitch to a roar",
    "The marching band takes the field at halftime",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
