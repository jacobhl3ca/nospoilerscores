import assert from "node:assert/strict";
import test from "node:test";

import { marginCloseness, FOOTBALL_CLOSENESS } from "../src/lib/marginCloseness.ts";

// Football scores in chunks of 3, 6, 7 and 8, so a per-point penalty is the
// wrong shape for it: a 7-0 game rated 65 and badged MEH (Jacob 9/4). These
// pin the curve's SHAPE — the flat stretch inside one score, the cliff on the
// way out of it — not just the numbers.

// The rating badge cuts (RatingBadge in GameCard.tsx). Closeness is the bulk of
// the rating, so the tier a margin lands in is what these are really about.
const GREAT = 85;
const GOOD = 70;
const MEH = 50;

const football = (margin: number) => marginCloseness(margin, 5, FOOTBALL_CLOSENESS);

test("one score is GOOD or better — the whole point of the change", () => {
  for (const margin of [1, 2, 3, 4, 6, 7, 8]) {
    assert.ok(football(margin) >= GOOD, `${margin} points read ${football(margin)}, under GOOD`);
  }
  // 7-0 specifically: the card that started this. It was 65 on the straight
  // line, which is what the third assertion documents.
  assert.equal(Math.round(football(7)), 75);
  assert.equal(Math.round(marginCloseness(7, 5)), 65);
});

test("a field goal apart is still GREAT, and a tie is 100", () => {
  assert.equal(football(0), 100);
  assert.ok(football(3) >= GREAT);
  // Just past a field goal drops out of GREAT — 4+ points means a FG won't do it.
  assert.ok(football(4) < GREAT);
});

test("two scores is MEH at best, three scores is SKIP", () => {
  assert.ok(football(10) < GOOD, "a two-score game is not GOOD");
  assert.ok(football(14) < MEH, "two touchdowns down is SKIP");
  assert.ok(football(16) < MEH);
  assert.ok(football(24) < MEH);
});

test("the stretch inside one score is a PLATEAU — it costs less per point than either side of it", () => {
  const perPoint = (from: number, to: number) => (football(from) - football(to)) / (to - from);
  const runUp = perPoint(0, 3);        // tied → a field goal apart
  const plateau = perPoint(3, 8);      // inside one score
  const cliff = perPoint(8, 16);       // out of one score, into two
  assert.ok(plateau < runUp, `the plateau (${plateau}/pt) should be cheaper than the run-up (${runUp}/pt)`);
  assert.ok(cliff > plateau * 1.5, `the cliff (${cliff}/pt) should cost far more than the plateau (${plateau}/pt)`);
  // And it flattens again once the game is gone.
  assert.ok(perPoint(24, 32) < cliff);
});

test("blowouts flatten out — 31 down and 38 down watch the same", () => {
  assert.equal(football(32), 0);
  assert.equal(football(38), 0);
  assert.equal(football(70), 0);
});

test("the curve never rises as the margin grows", () => {
  let prev = Infinity;
  for (let m = 0; m <= 60; m += 0.5) {
    const c = football(m);
    assert.ok(c <= prev, `closeness rose at margin ${m}`);
    assert.ok(c >= 0 && c <= 100, `closeness out of range at margin ${m}`);
    prev = c;
  }
});

test("fractional margins interpolate — the running-margin factor averages periods", () => {
  assert.ok(football(5.5) > football(6));
  assert.ok(football(5.5) < football(5));
  assert.equal(Math.round(football(5.5) * 10) / 10, 78.5);
});

test("every other sport keeps the straight line it was calibrated on", () => {
  assert.equal(marginCloseness(5, 4.5), 77.5);   // NBA
  assert.equal(marginCloseness(2, 14), 72);      // MLB
  assert.equal(marginCloseness(1, 22), 78);      // soccer
  assert.equal(marginCloseness(0, 18), 100);     // NHL, tied
});

test("a straight-line blowout floors at 0 instead of going negative", () => {
  assert.equal(marginCloseness(40, 4.5), 0);
  assert.equal(marginCloseness(9, 22), 0);
});

test("a negative margin reads the same as its mirror — sign is direction, not closeness", () => {
  assert.equal(football(-7), football(7));
  assert.equal(marginCloseness(-5, 4.5), marginCloseness(5, 4.5));
});
