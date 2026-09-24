import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "wire-to-wire" is the lead-from-start-to-finish idiom horse racing coined (the
// "wire" is the finish line) and golf, motorsport and the NBA all reuse: a side
// that goes wire-to-wire led the entire way, so the phrase names the winner
// outright — "Scheffler goes wire-to-wire at Augusta", "Verstappen wire-to-wire
// at Suzuka", "Thunder lead wire-to-wire" — yet it carries no digit (SCORE_RX
// misses it) and, on its own, matched no existing keyword; only a nearby
// win/lead word caught it before.
test("a 'wire-to-wire' lead-throughout reveal never reads as a clean title", () => {
  for (const title of [
    "Scheffler goes wire-to-wire at Augusta",
    "Verstappen wire-to-wire at Suzuka | Highlights",
    "Thunder lead wire-to-wire against the Lakers",
    "A wire to wire run at the Kentucky Derby",
    "Rahm cruises wire-to-wire for the win",
    "Norris wire-to-wire from pole",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The token is the two-word "wire TO wire" collocation, so the close-finish
// idiom "down to the wire" — which reveals a tense finish but no winner — stays
// visible, along with any non-result copy that merely mentions a wire.
test("'down to the wire' and other bare-wire copy are not over-hidden", () => {
  for (const title of [
    "It's going down to the wire at the Emirates",
    "Title race could go down to the wire",
    "How the finish-line wire got its name",
    "Preview: a nervy run-in awaits",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
