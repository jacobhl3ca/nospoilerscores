import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "go/goes/went/gone <n> <unit> up" names the margin a side went AHEAD by — the
// mirror of the already-masked "come from <n> down" comeback framing. A title
// that says a team "go two goals up" or "went 3 goals up" has revealed both who
// is leading and by how much, yet the lone number never pairs with a separator
// for SCORE_RX to catch ("3 goals up" is one digit, not a scoreline) and the
// lead/win keywords did not fire on it — only a nearby result word caught it
// before.
test("a 'go <n> <unit> up' lead-margin reveal never reads as a clean title", () => {
  for (const title of [
    "Spurs go two goals up at the break",
    "City went 3 goals up inside 20 minutes",
    "Arsenal go a goal up early",
    "Djokovic goes two sets up",
    "Warriors go 12 points up in the third",
    "Kohli goes 50 runs up | Highlights",
    "Chelsea going three goals up before half time",
    "United gone two goals up at Old Trafford",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The number+unit must sit BETWEEN the "go" verb and "up": that ordering is what
// keeps benign copy visible. "go up two points" (up before the number), a bare
// "go up", the promotion sense ("go up this season"), and "go up against <foe>"
// (naming an opponent, not a lead) all reveal no result and stay unmasked.
test("benign 'go up' phrasings are not over-hidden", () => {
  for (const title of [
    "Ratings go up two points after the finale",
    "Ticket prices go up",
    "Can they go up this season? Promotion preview",
    "Chiefs go up against the Broncos on Sunday",
    "The lights go up on a new season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
