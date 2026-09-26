import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "get/gain/exact/take … revenge" is the rivalry-result sibling of the beat/avenge
// family: a title saying a side gained/exacted/took revenge names the winner of a
// rematch, yet it carries no digits (SCORE_RX misses it) and needs no beat/win word,
// so a plain "City gain revenge over United" slipped straight through.
test("a 'get/gain/exact/take revenge' rematch-win reveal never reads as a clean title", () => {
  for (const title of [
    "Rams get revenge over the Niners",
    "Celtics gain revenge on the Heat",
    "Dodgers exact revenge on the Padres",
    "City gain sweet revenge over United",
    "Chiefs gained revenge for last year's loss",
    "Arsenal exacted revenge on Spurs",
    "Liverpool take revenge on City",
    "Rovers got their revenge in the derby",
    "United gain a measure of revenge",
    "Nadal exacts revenge over Djokovic",
    "Bills get some revenge against the Chiefs",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The (?<!\bto ) lookbehind drops the infinitive preview framing — "looking/out/hoping
// to <verb> revenge" reveals no result — and the "revenge" anchor leaves the bare-noun
// preview idioms ("revenge mission", "out for revenge", "seeking revenge") untouched. A
// false positive here would drop a legit item from the worker's search results, not
// merely keep a title masked.
test("infinitive/bare-noun revenge PREVIEWS (no result) are not over-hidden", () => {
  for (const title of [
    "Chiefs looking to get revenge against the Bills",
    "City out to exact revenge on United",
    "Rangers hoping to gain revenge over Celtic",
    "Spurs seeking revenge in the derby",
    "A revenge mission awaits Arsenal",
    "Revenge on their minds as United travel to City",
    "Fans want revenge after last season",
    "Preview: the revenge game everyone is talking about",
    "Nadal out for revenge at the French Open",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
