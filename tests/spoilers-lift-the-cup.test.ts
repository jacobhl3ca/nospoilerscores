import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The coronation "lift/hoist the <trophy>" clause already caught the bare-object
// forms ("lift the trophy", "hoist the World Cup"), but a real result leaked the
// moment a competition name sat between the verb and its object ("hoist the
// Champions League trophy") or the object was a plainly-named cup ("lift the
// Carabao Cup", "lift the FA Cup") — each a win-the-whole-thing headline that
// names the champion yet carries no digits for SCORE_RX and states none of
// win/triumph/clinch. Allowing up to two intervening name words before a
// world-cup/trophy/cup/silverware object closes the leak.
test("a 'lift/hoist the <cup>' coronation reveal never reads as a clean title", () => {
  for (const title of [
    "Man City lift the Carabao Cup at Wembley",
    "Chelsea lift the FA Cup",
    "Real Madrid hoist the Champions League trophy",
    "Djokovic lifts the Wimbledon trophy",
    "Arsenal lift the Premier League trophy",
    "Rangers hoist the League Cup",
    "Players lift the cup aloft after the final",
    "Liverpool lift silverware once more",
    "Messi lifts the trophy",
    "Spain hoist the World Cup",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The object stays tightly anchored: the "cup\b" boundary keeps "cupcakes"/
// "cupboard" out, and only lift/hoist immediately before a cup/trophy object
// fires — so fixture and preview cup headlines, the "lift the lid"/"lift
// spirits" idioms, weightlifting, and unrelated "lift the ban" wording all stay
// visible. (A future-tense "who will lift the cup?" preview does over-hide, the
// same accepted call the existing "who will lift the trophy?" already makes.)
test("neutral cup/trophy/lift senses are not over-hidden", () => {
  for (const title of [
    "FA Cup third round draw in full",
    "Carabao Cup semi-final: how to watch",
    "How the cup competition works",
    "Rooney lifts the lid on his time at United",
    "Referee lifts the ban ahead of the cup final",
    "The best cupcakes to bake on final day",
    "Weightlifter aims to lift a record",
    "Fan tries to lift the mood before kickoff",
    "World Cup 2026 highlights and reaction",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
