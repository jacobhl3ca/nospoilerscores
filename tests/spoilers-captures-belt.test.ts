import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// In boxing and MMA the championship literally IS the belt, so a headline where
// the belt changes hands reveals who won the title fight — the same result the
// "reclaim the crown"/"lift the trophy" clauses already hide for other sports.
// "belt" carries no digit for SCORE_RX and named no existing keyword, and while
// the generic "wins"/"retain" tokens already caught "wins/retains the belt", the
// belt-specific verbs (captures, unifies, claims, rips, snatches …) leaked. Only
// inflected forms are listed, so a bare-infinitive preview stays visible, and the
// belt object must sit within two words of the verb so the everyday senses of
// "belt" (seatbelt, conveyor belt, green belt) do not over-hide.
test("a combat-sports belt changing hands never reads as a clean title", () => {
  for (const title of [
    "Usyk captures the heavyweight belt",
    "Fury unifies the belt in Riyadh",
    "Inoue captures the undisputed belt",
    "Makhachev claims the lightweight belt",
    "Taylor rips the belt from Serrano",
    "Alvarez reclaims his belt",
    "Jones lifts the belt at UFC 300",
    "Ngannou snatches the belt",
    "Joshua wrests the belt back",
    "Canelo unified the belts",
    "Adesanya reclaimed the middleweight belt",
    "Stripped of the belt after weigh-in miss",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Bare-infinitive previews (no result revealed) and the everyday non-title senses
// of "belt" stay visible — the same conservative guards the "<strike> home" and
// title/crown clauses use.
test("belt previews and everyday 'belt' senses stay visible", () => {
  for (const title of [
    "Can Jones capture the belt at heavyweight?",
    "Usyk aims to unify the belt this year",
    "Preview: who will claim the vacant belt?",
    "Fury eyes the belt in title showdown",
    "The belt is on the line this weekend",
    "How to watch the heavyweight belt fight",
    "Conveyor belt of chances expected tonight",
    "Seatbelt reminder before the drive to the arena",
    "Green belt planning row near the stadium",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
