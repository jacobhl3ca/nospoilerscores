import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "hold on"/"held on"/"hang on"/"cling to a win" already caught the protect-the-lead-to-win
// family, but the equally common "hold/held out for <result>" phrasing named none of them, so
// the draw/point(s)/result variants leaked ("Arsenal hold out for a draw" showed as a clean
// title). A side that holds out for a result saw the game to its end with that result intact —
// the finish IS the reveal — so the mask must hold.
test("a 'hold out for <result>' recap never reads as a clean title", () => {
  for (const title of [
    "Ten-man Arsenal hold out for a draw",
    "United held out for a point",
    "Wolves holding out for a result",
    "Leeds hold out for a hard-fought draw",
    "Everton holds out for the draw at Anfield",
    "Palace held out for a nervy win",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory result object after "out for" is what keeps the everyday senses visible: a
// transfer/contract hold-out, "hold out hope", and "hold out little chance" all put a non-result
// noun in that slot (or, for "hope", break the "out for" adjacency), and a plain preview or
// listing title names no result at all.
test("the hold-out idiom does not swallow non-result or listing titles", () => {
  for (const title of [
    "Star striker holds out for a new contract",
    "Winger holds out for more money in transfer talks",
    "Fans hold out hope for a trophy this season",
    "Arsenal hold out little chance of signing him",
    "Match preview: Arsenal host Chelsea",
    "How to watch Arsenal vs Chelsea",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
