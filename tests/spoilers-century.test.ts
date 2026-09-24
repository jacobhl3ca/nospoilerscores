import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// A batsman's century is cricket's signature scoring reveal — the exact analogue
// of the already-hidden hat-trick/brace — yet it carries no digits (SCORE_RX
// misses it) and matched no cricket token, so these leaked. Two branches: the
// qualifier form "(maiden|double|triple) century" and the scoring-verb form
// (hits/smashes/blasts/notches/slams/cracks/racks up/brings up/compiles) + an
// optional article and up to two adjective words + "century".
test("a cricket century reveal never reads as a clean title", () => {
  for (const title of [
    "Kohli hits a majestic century vs Australia",
    "Root brings up his century at Lord’s",
    "Double century for Gill in Chennai",
    "Rohit compiles a patient century",
    "Smith smashes a maiden century",
    "Williamson notches another century",
    "Head blasts a rapid century",
    "Labuschagne cracks a century before lunch",
    "Warner racks up a century in the powerplay",
    "Brook brought up his century in style",
    "Triple century stuns the tourists",
    "Maiden century for the debutant",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// "score(s)"/"reaches" are deliberately left out of the verb list, and the
// trailing "(?!(?:\s+of|[- ]old))" guard keeps the common non-cricket "century"
// phrases visible.
test("benign 'century' headlines are not over-hidden", () => {
  for (const title of [
    "The greatest scores of the century",
    "Smith breaks a century-old record",
    "Match of the century preview: India vs Pakistan",
    "The shot of the century — a look back",
    "Can Kohli score a century today?",
    "A century-old rivalry renewed this weekend",
    "How to watch: full schedule for the century's biggest final",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
