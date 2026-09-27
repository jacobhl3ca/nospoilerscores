import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "too hot to handle" is the newest member of the superiority family that already
// carries "prove too strong/good/much" and the verb-less "too good/strong for":
// a side the opposition simply could not contain is the winning/superior side
// every time. It was added to BOTH clauses — the verb-anchored "prove too …" form
// and the verb-less "too … for" form — so recap titles across soccer, the NFL and
// tennis stop leaking who came out on top ("Chiefs prove too hot to handle",
// "City too hot to handle for United"). It carries no digits, so SCORE_RX misses
// it, and no existing keyword caught it.
test("a 'too hot to handle' superiority reveal never reads as a clean title", () => {
  for (const title of [
    "Chiefs prove too hot to handle for the Raiders",
    "City prove too hot to handle in the derby",
    "Haaland proved too hot to handle for the Leeds defence",
    "Barca too hot to handle for Sevilla",
    "Alcaraz simply too hot to handle for Zverev",
    "United proving too hot to handle at Old Trafford",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Both gates match its good/strong siblings and no more: the bare idiom needs the
// "prove" verb, and the verb-less form needs the trailing "for". So a stray
// "too hot to handle" on its own — the reality-TV show, a look-ahead, hype about a
// player — passes through untouched, exactly like "too good to be true"/"too good
// to miss" do for its siblings.
test("a bare 'too hot to handle' with no result frame is not over-hidden", () => {
  for (const title of [
    "New Netflix series Too Hot to Handle drops this week",
    "Is the striker too hot to handle this season?",
    "The transfer market is too hot to handle right now",
    "Too hot to handle: the summer transfer market heats up",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
