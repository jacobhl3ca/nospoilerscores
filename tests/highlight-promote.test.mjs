import test from "node:test";
import assert from "node:assert/strict";
import { promoteLoneExtended } from "../scripts/lib/recaps.mjs";

// A lone 2nd-slot video on the SAME channel as slot 1 is the league's normal
// cut that a flaky slot-1 lookup missed (nfl:401872948, 9/25). The bake moves
// it up so the card never shows a lone "Alt" button.

test("same channel, slot 1 empty → promoted to official", () => {
  const out = promoteLoneExtended({ official: null, officialChannel: "NFL", extended: "sbXZBAUOkDw", primaryChannel: "NFL", secondaryChannel: "nfl" });
  assert.deepEqual(out, { official: "sbXZBAUOkDw", officialChannel: "NFL", extended: null, promoted: true });
});

test("different channel → not promoted (next bake would discard it)", () => {
  const input = { official: null, officialChannel: "NWSL", extended: "abc", primaryChannel: "NWSL", secondaryChannel: "CBS Sports W Golazo" };
  const out = promoteLoneExtended(input);
  assert.equal(out.promoted, false);
  assert.equal(out.official, null);
  assert.equal(out.extended, "abc");
});

test("official present → no change", () => {
  const input = { official: "one", officialChannel: "NFL", extended: "two", primaryChannel: "NFL", secondaryChannel: "NFL" };
  const { primaryChannel: _p, secondaryChannel: _s, ...slots } = input;
  assert.deepEqual(promoteLoneExtended(input), { ...slots, promoted: false });
});

test("nothing in either slot → no change", () => {
  const out = promoteLoneExtended({ official: null, officialChannel: "NFL", extended: null, primaryChannel: "NFL", secondaryChannel: "NFL" });
  assert.equal(out.promoted, false);
  assert.equal(out.official, null);
});
