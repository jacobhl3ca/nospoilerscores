import assert from "node:assert/strict";
import test from "node:test";
import { delayedStartLabel } from "../src/lib/liveProgress.ts";

type G = Parameters<typeof delayedStartLabel>[0];
const g = (state: string, statusDetail: string) => ({ state, statusDetail }) as unknown as G;

test("pre-game STATUS_DELAYED reads Delayed (ESPN shape 2026-09-27, BAL @ NYY)", () => {
  assert.equal(delayedStartLabel(g("pre", "Delayed")), "Delayed");
});

test("a reason word ESPN adds is kept in proper case", () => {
  assert.equal(delayedStartLabel(g("pre", "Rain Delay")), "Rain delay");
  assert.equal(delayedStartLabel(g("pre", "HEAT DELAY")), "Heat delay");
});

test("normal upcoming, live and final games are not delayed starts", () => {
  assert.equal(delayedStartLabel(g("pre", "9/27 - 1:05 PM EDT")), null);
  assert.equal(delayedStartLabel(g("in", "Rain Delay, Top 1st")), null);
  assert.equal(delayedStartLabel(g("post", "Final")), null);
});
