import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The base "lift/hoist the trophy" keyword only knew the generic word "trophy" (and "world cup"),
// so a title naming the sport-specific championship trophy by its proper name slipped through:
// "Panthers hoist the Stanley Cup", "Eagles raise the Lombardi Trophy", "McIlroy lifts the claret
// jug" all name the champion outright, carry no digits (SCORE_RX misses them) and matched no keyword.
// The handover alternative extends the lift/hoist idiom to those named trophies (Stanley Cup,
// Lombardi, Commissioner's Trophy, Larry O'Brien, claret jug, green jacket, Wanamaker), anchored to a
// possession verb so it fires only on an actual handover.
test("a named championship-trophy handover never reads as a clean title", () => {
  for (const title of [
    "Panthers hoist the Stanley Cup",
    "Golden Knights lift the Stanley Cup",
    "Oilers finally raise the Stanley Cup",
    "Chiefs hoist the Lombardi Trophy",
    "Eagles raise the Lombardi Trophy",
    "Chiefs capture the Lombardi",
    "Dodgers hoist the Commissioner's Trophy",
    "Dodgers claim the Commissioner’s Trophy",
    "Celtics lift the Larry O'Brien Trophy",
    "Celtics raise the Larry O’Brien",
    "McIlroy lifts the claret jug",
    "Lowry claims the claret jug",
    "Scheffler slips on the green jacket",
    "Rahm slipped on the green jacket",
    "Scheffler claims the green jacket",
    "Scheffler takes the Wanamaker Trophy",
    "Woods secures the Wanamaker",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The reveal is anchored to a possession verb (lift/hoist/raise/capture/claim/secure/take/win, plus
// "slip on") directly before the trophy name on purpose, so the everyday preview and feature framing
// that merely NAMES the trophy with no handover still passes through. A false positive here would drop
// a legit item from the worker's search results, not merely keep a title masked.
test("naming a trophy without a handover is not over-hidden", () => {
  for (const title of [
    "Stanley Cup Final: how to watch tonight",
    "The history of the Stanley Cup",
    "Lombardi Trophy tour comes to town",
    "The green jacket: a Masters tradition",
    "Commissioner's Trophy on display at the stadium",
    "Larry O'Brien Trophy replica unveiled",
    "How the claret jug got its name",
    "Wanamaker Trophy: the story behind it",
    // the possession verbs in ordinary, non-trophy contexts must stay clean too
    "Fans raise the roof at the arena",
    "Team to raise ticket prices next season",
    "Player slips on the wet turf",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
