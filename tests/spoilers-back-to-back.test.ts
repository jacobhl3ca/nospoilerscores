import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A side that "goes back-to-back" has just won a second consecutive title — the
// repeat-champion sibling of the crown/coronation idioms the filter already catches
// ("crowned champions", "lift the trophy", "reign supreme"). The bare form carries no
// digit for SCORE_RX and slipped past every title branch, which need a take/claim/lift
// verb on an explicit title/crown/trophy object; "go back-to-back" names none, so the
// recap title was leaking the outcome.
test("a bare 'go back-to-back' repeat-title reveal never reads as a clean title", () => {
  for (const title of [
    "Real Madrid go back-to-back in La Liga",
    "Man City go back to back",
    "Chiefs go back-to-back",
    "Verstappen goes back-to-back as champion",
    "Warriors going back-to-back after Game 5",
    "United went back-to-back in the Premier League",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The idiom is anchored to the VERB form and guarded by a negative lookahead against the
// everyday schedule/tally sense: "back-to-back games / nights / road games / fixtures /
// sets / wins / defeats / clean sheets" is a two-in-a-row schedule or count, not a title,
// so it must stay untouched (a win/defeat tally, when spoilery, is caught by its own
// keyword elsewhere). "back-to-back" with no leading go/goes/went verb is likewise a
// plain schedule phrase and must not fire this branch.
test("the everyday schedule/tally 'back-to-back' senses are not over-hidden", () => {
  for (const title of [
    "Lakers face back-to-back games this week",
    "A brutal back-to-back road trip awaits",
    "Back-to-back fixtures for United in December",
    "Celtics go back-to-back nights on the road",
    "They go back-to-back games in Denver",
    "How to watch: Real Madrid vs Barcelona",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
