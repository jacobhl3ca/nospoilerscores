import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The "book(s)/punch(es) X place/spot/berth/ticket/passage" advancement idiom
// only accepted the team determiners (their|its|a), so an individual athlete
// going through — the way tennis, boxing, athletics, golf and swimming recaps
// phrase it, about a PERSON rather than a squad — leaked. Widening the
// determiner set with his|her closes that gap while keeping the existing
// team forms and the benign non-advancement senses exactly as they were.
test("an athlete booking his/her place through the round never reads clean", () => {
  for (const title of [
    "Djokovic books his place in the final",
    "Alcaraz books his spot in the semi-finals",
    "Coco Gauff books her place at the WTA Finals",
    "Biles books her spot in the all-around final",
    "Fury punches his ticket to a title shot",
    "Katie Ledecky books her berth in the 800m final",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The team forms this idiom already caught must stay caught — the widening
// only ADDS his|her, it does not disturb their|its|a.
test("the team advancement forms still fire", () => {
  for (const title of [
    "Croatia book their place in the final",
    "USA book a spot in the quarters",
    "Brazil booked their passage to the semis",
    "Spurs punch their ticket to the semis",
    "Duke punched its ticket to the Final Four",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// Adding his|her must NOT start over-hiding benign titles. None of these is an
// advancement reveal: "took his place" has no book/punch verb, "book your
// tickets" uses "your" (not in the set), and "his place in history" has no verb.
test("benign his/her phrasings are not over-hidden by the widening", () => {
  for (const title of [
    "He took his place on the bench",
    "Book your tickets for the final now",
    "A look at his place in history",
    "She earned her stripes in training camp",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
