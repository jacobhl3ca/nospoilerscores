import assert from "node:assert/strict";
import test from "node:test";

import { tabKeyTarget } from "../src/lib/tabKeys.ts";

test("ArrowRight steps forward and wraps from the last tab to the first", () => {
  assert.equal(tabKeyTarget("ArrowRight", 0, 4), 1);
  assert.equal(tabKeyTarget("ArrowRight", 3, 4), 0);
});

test("ArrowLeft steps back and wraps from the first tab to the last", () => {
  assert.equal(tabKeyTarget("ArrowLeft", 2, 4), 1);
  assert.equal(tabKeyTarget("ArrowLeft", 0, 4), 3);
});

test("Home and End go to the first and last tab", () => {
  assert.equal(tabKeyTarget("Home", 2, 4), 0);
  assert.equal(tabKeyTarget("End", 1, 4), 3);
});

test("other keys are left alone", () => {
  for (const key of ["Enter", " ", "ArrowUp", "ArrowDown", "Tab", "a"]) assert.equal(tabKeyTarget(key, 1, 4), null);
});

test("an empty list, or focus not on a tab, moves nothing", () => {
  assert.equal(tabKeyTarget("ArrowRight", 0, 0), null);
  assert.equal(tabKeyTarget("ArrowLeft", -1, 4), null);
});
