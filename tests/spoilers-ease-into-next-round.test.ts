import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The advancement branch already caught "reach/through to/progress to the next round",
// and any comfortable-advance verb landed a side "into the semi-finals/quarter-finals"
// via the bare "into (the) <named round>" alternative. But "the next round" only had
// the reach/through-to/progress lead-ins, so "eases into the next round" — the staple
// tennis/cup headline for a routine win — slipped through unmasked even though its
// named-round twin ("eases into the quarter-finals") was hidden. These comfortable-advance
// verbs before "into the next round" name a side that won its tie just as plainly, so the
// mask must hold for them too.
test("a comfortable-advance reveal into the next round never reads as a clean title", () => {
  for (const title of [
    "Djokovic eases into the next round",
    "Alcaraz eased into the next round at Wimbledon",
    "Swiatek breezes into the next round",
    "Sabalenka powers into the next round",
    "Medvedev glides into the next round | Highlights",
    "Raducanu sails into the next round",
    "Sinner strolls into the next round",
    "Gauff coasts into the next round",
    "Nadal waltzes into the next round",
    "Rune saunters into the next round",
    "Federer storms into the next round",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb anchor plus the existing "next round of …" negative lookahead keep the
// non-result senses visible: a preview, the draw, or an off-field "next round of
// talks/negotiations/fixtures/games/matches" is not a result, so the mask must lift.
test("the next-round advance idioms do not swallow ordinary titles", () => {
  for (const title of [
    "Preview: what to watch in the next round of fixtures",
    "Heading into the next round of talks over TV rights",
    "The draw for the next round is on Monday",
    "Clubs learn next round opponents",
    "How the next round of games could shape the table",
    "Owners head into the next round of negotiations",
    "Look ahead to the next round of matches",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
