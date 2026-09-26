import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "send X packing" is a stock cup-tie / knockout headline for a side being
// beaten out of a tournament — the same eliminated-result reveal as its
// "bow…out" / "crash…out" / "dump…out" / "knock…out" siblings. It carries no
// digits (SCORE_RX misses it) and no other keyword covers the phrasing. The
// earlier branch only matched the ADJACENT past-participle form "sent packing",
// so the far commoner active/present forms — which put the object BETWEEN the
// verb and "packing" ("send Chelsea packing", "sent Barcelona packing") — all
// leaked. The widened branch spans that object.
test("a 'send X packing' knockout reveal never reads as a clean title", () => {
  for (const title of [
    "Spurs send Chelsea packing",
    "Rangers send Celtic packing from the cup",
    "Arsenal sends Porto packing",
    "Bayern sent Barcelona packing",
    "Underdogs send the holders packing",
    "Germany sent packing",
    "Italy sent packing on penalties",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory trailing "packing" (and the finite send/sends/sent verb —
// "sending" is deliberately excluded as preview/ongoing copy) keeps the branch
// clear of the literal luggage sense and of unrelated "send…"/"packing" titles.
test("benign 'send' / 'packing' titles are not over-hidden by the packing branch", () => {
  for (const title of [
    "Movers and packers guide",
    "Send us your questions",
    "Packing tips for away fans",
    "Best packing list for away days",
    "Sending the fans home: stadium guide",
    "Extended highlights: matchweek 5",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
