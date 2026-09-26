import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "end/halt <possessive> reign" dethroning phrasing: a recap that reports a champion being
// beaten as their "reign" being ENDED, rather than the "dethrone" verb the filter already catches.
// It names a completed result (the loss that ended a title reign) yet carries no scoreline for
// SCORE_RX and needs no beat/upset word, so a title written this way leaked. The verb clause takes
// up to two filler words before a POSSESSIVE (their/its/his/her or a "<name>'s" genitive) and one
// optional word before "reign".
test("an 'end <possessive> reign' dethroning reveal never reads as a clean title", () => {
  for (const title of [
    "Nadal ends Federer's reign",
    "City end United's reign as champions",
    "Bayern end Dortmund's title reign",
    "Leicester finally end City's reign",
    "Spain end Germany's reign of dominance",
    "Rookie ends his reign at the top",
    "Underdogs end the champion's reign",
    "New champions halt their reign at the summit",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The possessive anchor is deliberate: it keeps the everyday preview framing visible — a bare
// "end … reign" would swallow the "reigning champions" / "can anyone end the reign?" billings that
// name no result. Those must still pass through untouched.
test("reign previews and 'end the reign?' billings stay visible", () => {
  for (const title of [
    "Reigning champions Argentina begin World Cup defense",
    "Reigning champion Djokovic faces a qualifier",
    "Djokovic's reign under threat ahead of the final",
    "Can anyone end the reign of the champions this year?",
    "Who will end the reign? Season preview",
    "End of an era: the reign that defined a decade",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
