import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "<verb> top spot / the summit / atop the table" standings-lead phrasing: a first-place result
// reported through the two synonyms the sibling "top of the table" catch misses. "Arsenal reclaim top
// spot", "City climb to the summit", "Inter sit atop the standings" each name the standings leader (the
// win that took them there) yet carry no scoreline for SCORE_RX and match none of the win/lead keywords.
// Anchored to the same movement/position verb family as the "top of the table" reveal, so the preview
// framing that merely names the position stays visible.
test("a '<verb> top spot / the summit' standings-lead reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal reclaim top spot",
    "Liverpool return to top spot",
    "United move back to top spot",
    "City climb to the summit",
    "Napoli go back to the summit",
    "Leeds storm to the summit",
    "Inter sit atop the table",
    "Rangers sit atop the standings",
    "Bayern move to top spot in the Bundesliga",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb anchor is deliberate: it keeps the forward-looking preview sense of the same phrases visible.
// "Battle for top spot", "the race for top spot" and "who will reach the summit?" name the prize without
// reporting who took it — a billing/question, not a result — and must pass through untouched. The
// everyday non-standings senses ("shot at the summit", a "summit" meeting) carry no such verb-then-
// connective before the phrase either.
test("forward-looking 'top spot' / 'summit' framing without a result verb stays visible", () => {
  for (const title of [
    "Battle for top spot this weekend",
    "The race for top spot heats up",
    "Chasing top spot before the international break",
    "Who will reach the summit this season?",
    "A shot at the summit still to come",
    "Everest summit attempt postponed by weather",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
