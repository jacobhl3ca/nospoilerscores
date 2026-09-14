import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// Individual-sport title reveals name the champion outright, but the tight
// "(?:re)?claim… (?:the )?(?:title|crown…)" adjacency only fired when the
// object sat immediately after the verb. Headlines almost always drop the
// competition name in between — "claims the Wimbledon title", "secures the
// Premier League title", "claims the world title" — which broke the adjacency,
// and none of these carry digits for SCORE_RX. A winning verb (claim / take /
// secure / capture / land / bag / pocket / scoop / lift / hoist) followed
// within a few words by "title"/"crown" now catches them.
test("a coronation verb + a named title/crown never reads as a clean title", () => {
  for (const title of [
    "Alcaraz claims the Wimbledon title",
    "Djokovic claims Wimbledon title",
    "Swiatek claims the French Open title",
    "Sinner takes the ATP Finals crown",
    "Man City secures the Premier League title",
    "Verstappen claims the world title",
    "Fury bags the heavyweight title",
    "Nadal reclaims the world title",
    "She lifts the Wimbledon crown",
    "Rookie lands his first title",
    "Secures back-to-back titles",
    "Scoops the Women's title in style",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Pinned to a winning VERB in front of the object, and it reuses the same
// non-result "title …" exclusion the "storm to the title" idiom carries, so
// the everyday preview/build-up senses of "title" and "crown" — where nobody
// has won anything yet — stay visible.
test("preview and build-up 'title'/'crown' wording is not over-hidden", () => {
  for (const title of [
    "Title contenders to watch this season",
    "How the title race is shaping up",
    "The title picture ahead of the finale",
    "Preview: the race for the title",
    "Chasing the title dream",
    "A huge title clash this weekend",
    "The world title fight is set",
    "Every title contender ranked",
    "Their title hopes are alive",
    "Title defence preview",
    "The title run-in explained",
    "Sizing up the title favourites",
    "The crown jewel of the schedule",
    // "the title of X" is the metaphorical naming sense, not a trophy — the
    // "of" guard keeps "lay claim to the title of best ever" visible.
    "He lays claim to the title of best ever",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
