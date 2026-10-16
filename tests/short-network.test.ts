import assert from "node:assert/strict";
import test from "node:test";

import { NETWORK_SHORT as MAP, shortNetwork } from "../src/lib/networkShort.ts";

// shortNetwork() renders the compact network chip on a GameCard — the one line
// telling someone where to actually watch — and the Schedule tab's network
// column. It ends in a chain of suffix strips, and a strip is indiscriminate:
// `.replace(/\+$/, "")` was added for "Apple TV+" → "Apple TV" and also turned
// "ESPN+" into "ESPN", which points at the wrong product entirely.
// NETWORK_SHORT now carries an identity entry to exempt it, and that is the
// kind of thing a later cleanup deletes as redundant, so it gets a test.
// (Lifted out of GameCard.tsx into lib/networkShort.ts on 10/14, so the test
// imports the shipped code directly instead of scanning the TSX source.)

test("the map and the function are the real ones", () => {
  assert.ok(Object.keys(MAP).length >= 4, `NETWORK_SHORT scanned as ${JSON.stringify(MAP)} — the literal shape changed`);
  assert.equal(shortNetwork("FOX"), "FOX", "a name with no rule should pass straight through; the extracted body is not running");
});

test("ESPN+ keeps its plus", () => {
  // ESPN is on the television. ESPN+ is a separate subscription in a different
  // app. Collapsing them tells someone they can watch on a channel they cannot.
  assert.equal(
    shortNetwork("ESPN+"),
    "ESPN+",
    "the trailing-+ strip is eating ESPN+ again — the chip now names the wrong product",
  );
});

test("the trailing-plus strip still does the job it was added for", () => {
  assert.equal(shortNetwork("Apple TV+"), "Apple TV", "exempting ESPN+ must not disable the strip generally");
});

test("ESPN's own naming for the full tier still reads as ESPN", () => {
  // Jacob 6/23: "ESPN Unlmtd" wrapped to a second line and grew the card —
  // "just call it ESPN". That is the tier that includes the linear channel, so
  // unlike ESPN+ the collapse is accurate as well as narrower.
  assert.equal(shortNetwork("ESPN Unlmtd"), "ESPN");
  assert.equal(shortNetwork("ESPN Unlimited"), "ESPN");
});

test("the other suffix strips are untouched", () => {
  assert.equal(shortNetwork("MLB Network"), "MLB");
  assert.equal(shortNetwork("Prime Video"), "Prime");
  assert.equal(shortNetwork("NBC Sports Bay Area"), "NBCS Bay Area");
  assert.equal(shortNetwork("Space City Home Network"), "Space City");
});

test("every chip stays inside the width the card was built for", () => {
  // "NBCS Bay Area" (13) is the widest thing that already ships, so an entry
  // longer than that is a card-height regression waiting to happen.
  for (const [full, short] of Object.entries(MAP)) {
    assert.ok(short.length <= 13, `NETWORK_SHORT["${full}"] = "${short}" is ${short.length} chars — wider than anything the card renders today`);
  }
});
