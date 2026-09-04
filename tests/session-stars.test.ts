import assert from "node:assert/strict";
import test from "node:test";

import {
  sessionLaunchPatch,
  SESSION_GAP_MS,
  STARS_AUTO_HIDE_SESSION,
  type VisitState,
} from "../src/lib/sessionVisits.ts";

// Favorite stars turn themselves off on the user's third visit (Jacob 8/31).
// Everything below is about the guard rails, not the happy path: an automatic
// change to someone's UI is only acceptable if it fires once and never argues
// with a choice they made themselves.

const T0 = 1_700_000_000_000;
const LATER = (ms: number) => T0 + ms;
const base = (over: VisitState = {}): VisitState => ({ ...over });

test("a brand-new visitor is counted, and keeps their stars", () => {
  const p = sessionLaunchPatch(base(), T0);
  assert.equal(p.sessionCount, 1);
  assert.equal(p.lastSessionAt, T0);
  assert.equal(p.hideTeamStars, undefined);
});

test("stars survive visit two", () => {
  const p = sessionLaunchPatch(base({ sessionCount: 1, lastSessionAt: T0 }), LATER(SESSION_GAP_MS + 1));
  assert.equal(p.sessionCount, 2);
  assert.equal(p.hideTeamStars, undefined);
});

test("stars turn off on visit three", () => {
  const p = sessionLaunchPatch(base({ sessionCount: 2, lastSessionAt: T0 }), LATER(SESSION_GAP_MS + 1));
  assert.equal(p.sessionCount, STARS_AUTO_HIDE_SESSION);
  assert.equal(p.hideTeamStars, true);
});

test("a reload inside the same sitting is not a new visit", () => {
  const p = sessionLaunchPatch(base({ sessionCount: 2, lastSessionAt: T0 }), LATER(SESSION_GAP_MS - 1));
  assert.equal(p.sessionCount, 2, "count must not advance");
  assert.equal(p.hideTeamStars, undefined, "and stars must survive it");
  // The clock still moves, so a long sitting of refreshes never ages into a
  // second session by accident.
  assert.equal(p.lastSessionAt, LATER(SESSION_GAP_MS - 1));
});

test("someone who turned stars ON themselves is never overridden", () => {
  const p = sessionLaunchPatch(base({ sessionCount: 2, lastSessionAt: T0, hideTeamStars: false }), LATER(SESSION_GAP_MS + 1));
  assert.equal(p.hideTeamStars, undefined, "no patch — their false stands");
  assert.equal(p.sessionCount, 3);
});

test("someone who already turned stars OFF gets no redundant write", () => {
  const p = sessionLaunchPatch(base({ sessionCount: 2, lastSessionAt: T0, hideTeamStars: true }), LATER(SESSION_GAP_MS + 1));
  assert.equal(p.hideTeamStars, undefined);
});

test("it can only ever fire once — turning stars back on sticks", () => {
  // Visit 3 hid them; the user goes into Settings and turns them back on.
  const after = base({ sessionCount: STARS_AUTO_HIDE_SESSION, lastSessionAt: T0, hideTeamStars: false });
  for (const day of [1, 2, 30, 400]) {
    const p = sessionLaunchPatch(after, LATER(day * 86_400_000));
    assert.deepEqual(p, {}, `visit +${day}d must not touch anything`);
  }
});

test("counting stops for good, so this stops being a per-visit prefs write", () => {
  // The whole point of the {} above: no sessionCount, no lastSessionAt, so
  // nothing changes on disk and nothing syncs to the server ever again.
  assert.deepEqual(sessionLaunchPatch(base({ sessionCount: 9, lastSessionAt: T0 }), LATER(1e9)), {});
});

test("everyone already installed starts at visit one, not visit three", () => {
  // Nobody has a sessionCount when this ships. Existing users must not be read
  // as long-timers and stripped of their stars the moment they next open the
  // app — they get the same two visits a new user does.
  assert.equal(sessionLaunchPatch(base(), T0).sessionCount, 1);
  // Same for a half-written blob: a lastSessionAt with no count is visit one.
  const partial = sessionLaunchPatch(base({ lastSessionAt: T0 }), LATER(SESSION_GAP_MS + 1));
  assert.equal(partial.sessionCount, 1);
  assert.equal(partial.hideTeamStars, undefined);
});
