import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "(?:reduc…|down)[- ]to[- ](?:nine|ten|9|10)[- ]men" catches the red-card reveal in its
// "a side is a player short" phrasing — the same match-event partial-result leak the noun
// "red card" and the verbs "sent off"/"sees red"/"marching orders" already hide, but spelled
// with no digits ("ten"/"nine") and none of the existing dismissal tokens, so it slipped past
// the whole set. The "go down to (ten|nine) men" LOSS branch deliberately EXCLUDES this shape
// (going a player down is not losing the match), which had left the dismissal itself uncaught.
test("a 'reduced/down to ten men' dismissal reveal never reads as a clean title", () => {
  for (const title of [
    "Arsenal reduced to ten men",
    "United reduced to 10 men at the break",
    "Chelsea down to ten men",
    "Spurs down to nine men",
    "City reduced to nine men after a second yellow",
    "The red card reduced United to ten men",
    "Real Madrid reduce Barca to ten men",
    "Liverpool down to 9 men",
    "reducing them to nine men",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The frame is pinned to the "reduced/down TO (nine|ten|9|10) men" verb phrase and the
// nine/ten count, so the neutral squad/rotation senses that use "ten-man" as a bare adjective —
// never the dismissal verb frame — stay visible. Over-hiding here would drop a legit preview
// from the worker's search results, not merely keep a title masked, so these must not trip it.
test("neutral 'ten-man' squad/rotation phrasings are not over-hidden", () => {
  for (const title of [
    "United name a ten-man squad for the trip",
    "Inside the Lakers' ten-man rotation",
    "How the ten-man midfield could line up",
    "Ten men to watch this weekend",
    "Team down to ten players available on the bench",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
