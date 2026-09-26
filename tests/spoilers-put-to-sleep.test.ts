import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "put(s) X to sleep" is the combat-slang KO reveal — a fighter knocked cold or
// choked unconscious, the most literal finish there is. It carries no digits for
// SCORE_RX and matched none of the existing combat tokens (KO/TKO/stops/decision/
// goes-the-distance), so a highlight or news title using the idiom leaked the
// result outright before this entry was added.
test("a put-to-sleep knockout never reads as a clean title", () => {
  for (const title of [
    "Khabib puts McGregor to sleep | UFC 229",
    "Ngannou put Gane to sleep in the second round",
    "Poirier putting Chandler to sleep | Full Fight",
    "Canelo puts him to sleep with a left hook",
    "Jon Jones puts the veteran champion to sleep",
    "Pereira put to sleep late in the third",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The only benign homograph is the boredom idiom — "put the fans/crowd to sleep"
// means a dull game, not a knockout. The object slot is fenced with a negative
// lookahead that refuses the audience nouns/pronouns that idiom always takes, and
// a knockout names the opponent, not the crowd, so these pass straight through.
// The bare-noun "sleep" senses (accommodation counts, the NYC tagline, sleep
// science) never sit immediately before "to sleep" and so never fire either.
test("'put to sleep' does not swallow non-knockout titles", () => {
  for (const title of [
    "Puts fans to sleep: the NFL's dullest offense",
    "This defense puts the whole crowd to sleep",
    "Puts you to sleep: five snoozer matchups this weekend",
    "The city that never sleeps hosts the Super Bowl",
    "How much sleep do NBA players get?",
    "Sleep tips for shift-working athletes",
    "UFC 310: Official Weigh-in Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
