import assert from "node:assert/strict";
import test from "node:test";

import { checkIsDue, pageIsBusy, parseBuildId, shouldReload } from "../src/lib/buildCheck.ts";

// 9/27: a phone tab loaded before #203 kept the old RedZone header for hours.
// A resume now reloads once when a newer build is live.

test("reloads when the live build differs from the running one", () => {
  assert.equal(shouldReload("aaa", "bbb", null), true);
});

test("no reload when the builds match, or either id is missing/dev", () => {
  assert.equal(shouldReload("aaa", "aaa", null), false);
  assert.equal(shouldReload("", "bbb", null), false);
  assert.equal(shouldReload("dev", "bbb", null), false);
  assert.equal(shouldReload("aaa", null, null), false);
});

test("reloads only once per live id (stale edge HTML cannot loop)", () => {
  assert.equal(shouldReload("aaa", "bbb", "bbb"), false);
  // A later deploy is a new id, so it gets its own single reload.
  assert.equal(shouldReload("aaa", "ccc", "bbb"), true);
});

test("check runs at most once per gap", () => {
  const gap = 10 * 60 * 1000;
  assert.equal(checkIsDue(1_000_000, null, gap), true);
  assert.equal(checkIsDue(1_000_000, 1_000_000 - gap + 1, gap), false);
  assert.equal(checkIsDue(1_000_000, 1_000_000 - gap, gap), true);
  assert.equal(checkIsDue(1_000_000, 2_000_000, gap), true, "clock moved back");
  assert.equal(checkIsDue(1_000_000, Number.NaN, gap), true);
});

test("parseBuildId accepts only a real id", () => {
  assert.equal(parseBuildId({ id: " abc123 " }), "abc123");
  assert.equal(parseBuildId({ id: "dev" }), null);
  assert.equal(parseBuildId({ id: "" }), null);
  assert.equal(parseBuildId({ id: 5 }), null);
  assert.equal(parseBuildId(null), null);
  assert.equal(parseBuildId("abc"), null);
});

function fakeDoc(opts: { modal?: boolean; active?: { tagName: string; isContentEditable?: boolean } | null }) {
  return {
    querySelector: (sel: string) => (opts.modal && sel === '[aria-modal="true"]' ? ({} as Element) : null),
    activeElement: (opts.active ?? null) as Element | null,
  } as Pick<Document, "querySelector" | "activeElement">;
}

test("busy while a modal is open or a text field has focus", () => {
  assert.equal(pageIsBusy(fakeDoc({})), false);
  assert.equal(pageIsBusy(fakeDoc({ active: { tagName: "BODY" } })), false);
  assert.equal(pageIsBusy(fakeDoc({ active: { tagName: "BUTTON" } })), false);
  assert.equal(pageIsBusy(fakeDoc({ modal: true })), true);
  assert.equal(pageIsBusy(fakeDoc({ active: { tagName: "TEXTAREA" } })), true);
  assert.equal(pageIsBusy(fakeDoc({ active: { tagName: "INPUT" } })), true);
  assert.equal(pageIsBusy(fakeDoc({ active: { tagName: "DIV", isContentEditable: true } })), true);
});
