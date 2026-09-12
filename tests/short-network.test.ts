import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// shortNetwork() renders the compact network chip on a GameCard — the one line
// telling someone where to actually watch. It ends in a chain of suffix strips,
// and a strip is indiscriminate: `.replace(/\+$/, "")` was added for
// "Apple TV+" → "Apple TV" and also turned "ESPN+" into "ESPN", which points at
// the wrong product entirely. NETWORK_SHORT now carries an identity entry to
// exempt it, and that is the kind of thing a later cleanup deletes as
// redundant, so it gets a test.
//
// GameCard.tsx is a TSX component that cannot be imported here, so the literal
// and the function body are lifted out of the source and EVALUATED — these
// assertions run the shipped code, not a copy of it.
const SRC = readFileSync(fileURLToPath(new URL("../src/components/GameCard.tsx", import.meta.url)), "utf8");

function block(header: string): string {
  const at = SRC.indexOf(header);
  if (at < 0) throw new Error(`GameCard.tsx no longer contains \`${header}\` — this file is testing nothing`);
  const open = SRC.indexOf("{", at);
  const close = SRC.indexOf("\n};", open) >= 0 && SRC.indexOf("\n};", open) < SRC.indexOf("\n}", open) + 1
    ? SRC.indexOf("\n};", open)
    : SRC.indexOf("\n}", open);
  return SRC.slice(open, close + 2);
}

const MAP = new Function(`"use strict"; return (${block("const NETWORK_SHORT")});`)() as Record<string, string>;
const BODY = block("function shortNetwork");
const shortNetwork = new Function(
  "NETWORK_SHORT",
  "name",
  `"use strict"; ${BODY.slice(1, -1)}`,
).bind(null, MAP) as (name: string) => string;

test("the source scan found a real map and a real function body", () => {
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
