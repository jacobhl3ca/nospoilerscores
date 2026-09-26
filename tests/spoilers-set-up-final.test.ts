import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The knockout-advancement family already masked "reach/through to/into the final",
// "book their place in the final" and "progress to the next round". But recap
// headlines just as often report the SAME advancement with a forward-looking verb —
// the winner "sets up" the next tie: "Alcaraz sets up final with Sinner", "City set
// up semi-final clash with United". That names a completed result (you only set up
// the next round by winning this one) yet carries no scoreline for SCORE_RX and
// matched none of the beat/advance keywords, so a title written this way leaked.
//
// The match is anchored to a knockout-round noun (final / semi / quarter / last-16)
// or a matchup noun (showdown / clash / rematch / tie / decider) FOLLOWED BY an
// opponent connector ("with"/"against"/"vs"/"versus") ON PURPOSE — that connector is
// the completed-fixture tell that separates it from the preview/hype phrasings which
// carry no opponent ("sets up a grandstand final-day showdown", "sets up a date with
// destiny", "a win would set up a mouthwatering final").
test("a 'sets up (semi)final clash with X' advancement reveal never reads as a clean title", () => {
  for (const title of [
    "Alcaraz sets up final with Sinner",
    "Djokovic sets up semi-final clash with Zverev",
    "City set up FA Cup final showdown with United",
    "Chelsea set up semifinal meeting with Barcelona",
    "Nadal sets up quarter-final tie with Federer",
    "Team sets up a last-16 clash with Real Madrid",
    "Swiatek sets up final against Gauff",
    "India set up a semi-final clash vs Australia",
    "Verstappen setting up title showdown with Norris",
    "Leafs set up rematch with Bruins",
    "USA set up grand final with Australia",
    "Raducanu sets up quarters clash with Swiatek",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The match needs both a round/matchup noun AND the opponent connector, so the
// forward-looking preview and the ordinary "set up" senses stay visible: a hype
// headline with no opponent, "set FOR" (a different verb), an assist ("sets up the
// winner" — its own scoring words are caught elsewhere), and the everyday
// arrange-a-meeting sense ("sets up a meeting with the media") must all pass through.
test("previews and ordinary 'set up' uses are not over-hidden", () => {
  for (const title of [
    "Djokovic and Alcaraz set for final showdown",
    "Sunday's play sets up a final-day showdown",
    "Sunday sets up a mouthwatering final",
    "Who will set up the final?",
    "This sets up a date with destiny",
    "Coach sets up a meeting with the media",
    "Manager sets up a meeting with the board",
    "Team sets up training session with youngsters",
    "Star sets up shop with new club",
    "How to watch the final",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
