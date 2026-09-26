import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A fighter who SUCCESSFULLY DEFENDS a title/belt/crown won the title fight — the
// same result the "retain(?:s|ed)" clause already hides for "retains the belt".
// But "retain" only caught the retention phrasing; when a boxing/MMA recap tells
// the result as a defence instead ("Canelo successfully defends his title", "a
// successful title defence for Fury"), it leaked. The "successful(?:ly)?" prefix
// is what makes this safe: a defence is only ever called SUCCESSFUL after it has
// happened, so the adverb/adjective anchors it to a completed outcome.
test("a successful title defence never reads as a clean fight", () => {
  for (const title of [
    "Canelo successfully defends his title",
    "Canelo Alvarez successfully defends undisputed titles",
    "Usyk successfully defended his belts",
    "Taylor successfully defending her crown",
    "A successful title defence for Fury",
    "Makhachev makes a successful defence",
    "Successful defence caps a wild night in Vegas",
    "Inoue's successful first title defence",
    "Ngannou records a successful defense",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Upcoming-fight previews (no result revealed) and the everyday non-result senses
// of "defend"/"defence" stay visible — the bare, un-adverbed forms are ambiguous
// with a preview, so only the "successful(?:ly)?"-marked outcome is masked, and
// "defen[cs]e" cannot match "defensive"/"defender".
test("title-defence previews and everyday 'defence' senses stay visible", () => {
  for (const title of [
    "Canelo to defend his title against Crawford",
    "Canelo will defend his belt this weekend",
    "Djokovic bids to defend his crown in Paris",
    "How to watch the title defence on Saturday",
    "Preview: Fury defends WBC title this month",
    "A solid defensive display expected from the visitors",
    "The defender is back in training after injury",
    "United's defence has been superb all season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
