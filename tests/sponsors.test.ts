import assert from "node:assert/strict";
import test from "node:test";
import { PATRONS, SPONSORS, type Sponsor } from "../src/lib/sponsors.ts";
import { SUPPORT_LIVE_FROM, supportLiveOn } from "../src/lib/supportLinks.ts";

// /sponsors (2026-10-15). The list is public and hand-filled from Patreon and
// email, so these pin the shape: https links only, no emails. The build-time
// gate (sitemap, footer link, robots) flips on SUPPORT_LIVE_FROM in ET.

function checkSponsor(s: Sponsor) {
  assert.ok(s.name.trim() !== "", "sponsor name");
  assert.ok(s.blurb.trim() !== "", `${s.name}: blurb`);
  assert.equal(new URL(s.url).protocol, "https:", `${s.name}: url`);
  if (s.logo && !s.logo.startsWith("/")) assert.equal(new URL(s.logo).protocol, "https:", `${s.name}: logo`);
  assert.ok(!s.blurb.includes("@"), `${s.name}: no email in the blurb`);
}

test("every sponsor has a name, a blurb and https links", () => {
  for (const s of SPONSORS) checkSponsor(s);
});

test("the shape check rejects an http link", () => {
  assert.throws(() => checkSponsor({ name: "X", url: "http://x.com", blurb: "Y" }));
});

test("patrons are names or initials, never an email", () => {
  for (const p of PATRONS) {
    assert.ok(p.trim() !== "", "empty patron");
    assert.ok(!p.includes("@"), p);
  }
  assert.equal(new Set(PATRONS).size, PATRONS.length, "duplicate patron");
});

test("build-time gate: closed on 2026-12-14 late evening ET", () => {
  assert.equal(SUPPORT_LIVE_FROM, "2026-12-15");
  assert.equal(supportLiveOn(new Date("2026-12-15T04:30:00Z")), false);
  assert.equal(supportLiveOn(new Date("2026-10-15T12:00:00Z")), false);
});

test("build-time gate: open from just after midnight ET on 2026-12-15", () => {
  assert.equal(supportLiveOn(new Date("2026-12-15T05:01:00Z")), true);
  assert.equal(supportLiveOn(new Date("2027-01-10T12:00:00Z")), true);
});
