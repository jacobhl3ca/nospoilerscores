import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "steal …"/"stole …" is the American (and general) narrow/late-win idiom, the sibling
// of "nick"/"snatch": recaps reach for it across the NBA, NFL, MLB and soccer to say who
// took the result in a tight game. The bare forms "steal it", "steal a point" and "steal
// the win" name only who came out on top yet carry no scoreline for SCORE_RX and matched
// no existing keyword, so a plain narrow-win recap written this way leaked. The pattern is
// pinned to a trailing result object, which is what makes it a result reveal.
test("a 'steal' narrow-win reveal never reads as a clean title", () => {
  for (const title of [
    "Chiefs stole it in overtime",
    "Rangers steal a point at the death",
    "Barcelona steal the win at the Camp Nou",
    "United steal all three points at Anfield",
    "Arsenal steal a late winner",
    "City stealing the lead through Haaland",
    "Celtics stole the win in Boston",
    "Spurs steal the points late on",
    "Napoli steal a late goal to level | Serie A",
    "Real Madrid stole the title on the final day",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Bare "steal(s)" is a basketball/soccer defensive stat, a bargain ("the steal of the
// draft", "steal a march") or a standout turn ("steal the show"/"steal the ball"), so —
// like "nick" — it is gated on the trailing result object. Those everyday senses must
// still pass through untouched.
test("ordinary uses of 'steal' are not over-hidden", () => {
  for (const title of [
    "Kawhi Leonard with 5 steals against the Lakers",
    "A great steal by Draymond Green",
    "How to steal the ball cleanly: defending masterclass",
    "The biggest steal of the NFL Draft",
    "Best steals in fantasy football this week",
    "He tried to steal second base",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
