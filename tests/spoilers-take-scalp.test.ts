import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get the better of" and "get one over on" already caught two beat-a-rival idioms, but their
// closest twin — a side that "claims/takes a scalp" — names no existing token and carries no
// digits, so an upset-win recap ("Wrexham claim a famous scalp") slipped through unmasked. To
// take a scalp is to have beaten a bigger name, so the mask must hold.
test("a take-a-scalp upset win never reads as a clean title", () => {
  for (const title of [
    "Wrexham claim a famous scalp against Arsenal",
    "Alcaraz takes the scalp of Djokovic in Paris",
    "Minnows grab a huge cup scalp",
    "Underdogs took another top-flight scalp",
    "Rovers claim the scalp of the champions | Highlights",
    "City land a huge cup scalp",
    "Non-league side earn a shock scalp",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb anchor (claim/take/took/grab/land/earn) and the noun-only tail "scalps?\b" pin the
// beat-a-rival sense: the ticket-resale senses use the -ing/-er forms ("scalping", "scalper"),
// which the noun-only tail can never reach, and a bare "scalp" mention with no take/claim verb
// stays visible.
test("the scalp idiom does not swallow ticket-resale or unrelated titles", () => {
  for (const title of [
    "Fans furious over ticket scalping at the final",
    "Police arrest ticket scalpers outside the stadium",
    "A scalper is reselling seats online",
    "How to watch tonight's derby live",
    "Barber offers players a fresh scalp massage",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
