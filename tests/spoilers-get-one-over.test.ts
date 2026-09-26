import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get the better of" already caught one beat-a-rival idiom, but its closest twin —
// "get one over on <rival>" — named no existing token and carries no digits, so a
// derby/rivalry win recap ("Arsenal get one over on Spurs") slipped through unmasked.
// To "get one over on" an opponent is to have beaten them, so the mask must hold.
test("a get-one-over-on rivalry win never reads as a clean title", () => {
  for (const title of [
    "Arsenal get one over on Spurs",
    "Hamilton gets one over on Verstappen",
    "United got one over on City at the Etihad",
    "Nadal gets one over on Djokovic in Paris",
    "Celtics get one over on the Lakers | Highlights",
    "Ferrari getting one over on Red Bull",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The trailing "on" pins the beat-a-rival sense, and the same (?<!\bto ) lookbehind the
// revenge/avenge clauses use keeps the instructional preview framing visible: a title that
// leads with "to get one over on" is a look-ahead, not a result, so the mask must lift.
test("the get-one-over idiom does not swallow preview or unrelated titles", () => {
  for (const title of [
    "How to get one over on your fantasy rivals: preview",
    "Looking to get one over on their rivals tonight",
    "The one to watch in tonight's derby",
    "Get one more autograph at the open training session",
    "Fans get one last chance to buy tickets",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
