import assert from "node:assert/strict";
import test from "node:test";

import { activeSupportLinks, supportLinksVisible, SUPPORT_LINKS } from "../src/lib/supportLinks.ts";

// The support line stays hidden until Tue Dec 15 2026 (ET) and never shows in
// the native apps.

test("hidden on 2026-12-14 (late evening ET)", () => {
  assert.equal(supportLinksVisible(new Date("2026-12-15T04:30:00Z"), false), false);
});

test("shown on 2026-12-15 (just after midnight ET)", () => {
  assert.equal(supportLinksVisible(new Date("2026-12-15T05:01:00Z"), false), true);
});

test("hidden when native, even after the live date", () => {
  assert.equal(supportLinksVisible(new Date("2027-01-10T12:00:00Z"), true), false);
});

test("a link with an empty href is skipped", () => {
  const links = activeSupportLinks([
    { id: "kofi", label: "Ko-fi (one-time)", href: "https://ko-fi.com/jacobhl" },
    { id: "patreon", label: "Patreon ($3/mo)", href: "" },
  ]);
  assert.deepEqual(links.map((l) => l.id), ["kofi"]);
  assert.ok(activeSupportLinks(SUPPORT_LINKS).every((l) => l.href !== ""));
});
