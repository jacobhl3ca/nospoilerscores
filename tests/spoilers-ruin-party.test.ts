import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "spoil the party/homecoming/return/debut/farewell/reunion/swansong" upset-win idiom was
// already masked, but headlines swap in the exact synonym "ruin" just as freely and it named none
// of them, so "Rangers ruin Celtic's party" showed as a clean title. Ruining a milestone occasion
// is the same underdog-beats-a-favourite reveal — the losing side has been named — so the mask
// must hold. The leading verb now accepts both spoil… and ruin…, gated by the identical
// connector + occasion-noun anchor.
test("a 'ruin the <occasion>' upset-win recap never reads as a clean title", () => {
  for (const title of [
    "Rangers ruin Celtic's party",
    "Heat ruin LeBron's homecoming",
    "Wrexham ruined the party at Old Trafford",
    "Arsenal ruin Mourinho's return",
    "City ruin Rooney's farewell",
    "United ruining Ronaldo's swansong",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory connector ("the"/"their"/a possessive) plus one of the limited occasion nouns is
// what keeps everyday "ruin" senses visible: a ruined pitch, ruining a reputation, and a title
// that merely mentions a "party" or a "return leg" without the ruin/spoil verb in front of it all
// name no match result, so they must pass through untouched.
test("the ruin-occasion idiom does not swallow non-result or listing titles", () => {
  for (const title of [
    "Ruined pitch delays kickoff at Anfield",
    "Manager ruins his own reputation in press conference",
    "Match preview: derby party atmosphere builds",
    "How to watch the return leg",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
