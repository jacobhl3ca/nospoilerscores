import assert from "node:assert/strict";
import test from "node:test";

import { newsNeedsConfirm } from "../src/lib/newsOkDay.ts";

// The league pill's News confirm (Jacob 10/10): ask only while it is early
// and nothing today has marked News as safe.
const TODAY = "20261010";
const YESTERDAY = "20261009";

test("before the cutoff with no record, News asks first", () => {
  assert.equal(newsNeedsConfirm(9, 13, null, TODAY), true);
});

test("at or after the cutoff hour, News opens straight away", () => {
  assert.equal(newsNeedsConfirm(13, 13, null, TODAY), false);
  assert.equal(newsNeedsConfirm(15, 13, null, TODAY), false);
});

test("a record for today skips the confirm", () => {
  assert.equal(newsNeedsConfirm(9, 13, TODAY, TODAY), false);
});

test("a record from yesterday does not count today", () => {
  assert.equal(newsNeedsConfirm(9, 13, YESTERDAY, TODAY), true);
});

test("a midnight cutoff never asks", () => {
  assert.equal(newsNeedsConfirm(0, 0, null, TODAY), false);
});
