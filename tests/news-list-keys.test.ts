import assert from "node:assert/strict";
import test from "node:test";

import { routeNewsListKey, type NewsListKeyContext } from "../src/lib/modalArrowKeys.ts";

// The News list's keys (Jacob 10/7): H Headlines, M Media, E Hide seen, ? the
// Keys card — each the same tap its chip takes, and only while nothing else
// owns the keyboard.

const ctx = (over: Partial<NewsListKeyContext> = {}): NewsListKeyContext => ({
  key: "h", chord: false, repeat: false, inTextEntry: false, active: true, ...over,
});

test("H, M, E and ? map to their chips, either case", () => {
  assert.equal(routeNewsListKey(ctx({ key: "h" })), "headlines");
  assert.equal(routeNewsListKey(ctx({ key: "H" })), "headlines");
  assert.equal(routeNewsListKey(ctx({ key: "m" })), "media");
  assert.equal(routeNewsListKey(ctx({ key: "M" })), "media");
  assert.equal(routeNewsListKey(ctx({ key: "e" })), "hide-seen");
  assert.equal(routeNewsListKey(ctx({ key: "E" })), "hide-seen");
  assert.equal(routeNewsListKey(ctx({ key: "?" })), "keys");
});

test("off the News view, or under a modal / panel / popover: nothing", () => {
  for (const key of ["h", "m", "e", "?"]) assert.equal(routeNewsListKey(ctx({ key, active: false })), null, key);
});

test("typing in the filter box, a chord, or a held key: nothing", () => {
  for (const key of ["h", "m", "e", "?"]) {
    assert.equal(routeNewsListKey(ctx({ key, inTextEntry: true })), null, `${key} typing`);
    assert.equal(routeNewsListKey(ctx({ key, chord: true })), null, `${key} chord`);
    assert.equal(routeNewsListKey(ctx({ key, repeat: true })), null, `${key} repeat`);
  }
});

test("every other key stays the page's", () => {
  for (const key of ["j", "k", "ArrowDown", " ", "Enter", "Escape", "f", "1"]) {
    assert.equal(routeNewsListKey(ctx({ key })), null, key);
  }
});
