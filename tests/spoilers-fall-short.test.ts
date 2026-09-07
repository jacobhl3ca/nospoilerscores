import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "fall short" / "come up short" is the recap idiom for the LOSING side without a
// scoreline: "Bills fall short in Kansas City", "Warriors come up short against the
// Lakers". It names who lost — and therefore who won — every time, yet carries no
// digits for SCORE_RX and matched no existing keyword when the title stood alone
// (the sibling "fightback falls short" was only caught via the "fightback" token),
// so a plain losing-side recap written this way slipped past the mask. The mandatory
// "short" tail, pinned to "fall/fell/falls" or "come(s)/came up", is what makes it a
// result reveal.
test("a 'fall short' / 'come up short' loss reveal never reads as a clean title", () => {
  for (const title of [
    "Bills fall short in Kansas City | NFL Highlights",
    "Warriors come up short against the Lakers",
    "Spain fell short in the final",
    "United falls short despite a late push",
    "Why the Jets came up short again",
    "Arsenal come up short in the title race",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is gated on the "short" tail sitting behind "fall…"/"come up", so the
// everyday senses of "short" — which appear constantly in ordinary titles — must
// still pass through untouched.
test("ordinary uses of 'short' are not over-hidden", () => {
  for (const title of [
    "Short-handed penalty kill masterclass",
    "A short history of the rivalry",
    "The best short-corner routines in hockey",
    "Point guard's short jumper compilation",
    "How to take a short corner",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
