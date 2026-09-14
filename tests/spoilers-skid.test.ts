import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "snap/end/halt/break the skid" is the North-American losing-streak-broken
// idiom — the "skid" synonym of the already-hidden "snap … losing streak" and
// the "…drought" clause. A team that snaps its skid has just WON to end a
// losing run, an outright result reveal, yet "skid" names no existing keyword
// and (spelled out) carries no hyphenated score for SCORE_RX. Anchored to the
// same end/snap/halt/break verb family + up-to-three-word gap the drought
// clause uses, with the object pinned to "skid".
test("a 'snap the skid' win reveal never reads as a clean title", () => {
  for (const title of [
    "Heat snap the skid | NBA Highlights",
    "Knicks snap four-game skid",
    "Oilers end their skid with overtime win",
    "Jets finally break the skid",
    "Lakers halt the skid at five",
    "Rangers ended a lengthy skid",
    "Suns snap their eight-game road skid",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the "skid" object behind an end/snap/halt/break
// verb, so the literal-skid and decline senses — which never take that verb
// frame — stay visible.
test("literal-skid and decline senses are not over-hidden", () => {
  for (const title of [
    "Verstappen's car skids into the wall",
    "The skid marks told the story of the crash",
    "Report: the skids may be put under the manager",
    "A team on the skids after boardroom row",
    "Extended highlights: matchweek 5",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
