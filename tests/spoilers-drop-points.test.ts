import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "drop(s/ped/ping) points" is the dropped-side sibling of the already-masked "take/claim the points"
// WIN idiom. In a league recap it names a result — the favourite failed to win (drew or lost) —
// carries no digits for SCORE_RX and fired no existing keyword ("drop" alone only ever appeared as
// "drop the series"/"drop the opener"). It is the stock football headline for exactly this outcome.
test("a 'drop points' result headline never reads as a clean title", () => {
  for (const title of [
    "Arsenal drop points at Everton",
    "Liverpool drop points in the title race",
    "Spurs dropping points at home",
    "Chelsea dropped points again",
    "City drop two points",
    "Leeds drop more points in the title race",
    "United drop vital points",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// A short negative lookbehind keeps the frequent PREVIEW lead-ins visible: "afford to drop", "must
// not drop", "avoid dropping" and "without dropping" carry no result. And with no dropping verb the
// ordinary "points" senses stay visible too — a spoken-argument "points", the referee "points" to the
// spot, "points out" a mistake — so a bare "points" is never mistaken for a standings reveal.
test("a 'drop points' preview or an unrelated 'points' stays visible", () => {
  for (const title of [
    "Arsenal cannot afford to drop points",
    "Why City must not drop points",
    "Can Liverpool avoid dropping points?",
    "United desperate to avoid dropping points",
    "Chelsea cannot go on without dropping points",
    "Coach makes three points in his team talk",
    "The referee points to the spot",
    "He points out the mistake",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hid: ${title}`);
  }
});
