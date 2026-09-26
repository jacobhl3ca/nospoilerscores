import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The lead-taking goal reveal: a striking or heading verb that puts a side "ahead" / "in front" / "into
// the lead". It names a scoreline change — who scored, who is now up — as plainly as "go-ahead goal" does,
// but the scoreless spellings ("Haaland fires City ahead") carry no digits for SCORE_RX and used none of
// the existing win/lead keywords, so they leaked. Byte-identical token in the worker (public/_worker.js),
// so the client un-mask call and the server pre-skip agree.
test("a lead-taking goal reveal never reads as a clean title", () => {
  for (const title of [
    "Haaland fires City ahead",
    "Saka puts Arsenal ahead",
    "Kane heads United in front",
    "Rashford slots United ahead",
    "Palmer curls Chelsea in front",
    "Son taps Spurs ahead",
    "Odegaard heads Arsenal ahead early",
    "Foden volleys City in front",
    "Late header puts Newcastle ahead",
    "Bruno rifles United into a 2-1 lead",
    "Isak nods Newcastle in front",
    "Watkins tucks Villa ahead",
    "Mbappe steers PSG in front",
    "Kane lashes Bayern into the lead",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The two negative lookaheads keep the "ahead of" / "in front of" idioms visible — a preview, a standings
// note, a crowd, or a chance in front of goal reveals no result, so none of these should be masked by this
// alternative.
test("the 'ahead of' / 'in front of' idioms stay visible", () => {
  for (const title of [
    "United look ahead to the derby",
    "Arsenal ahead of schedule in rebuild",
    "City go ahead of United in the table race",
    "Preview: what lies ahead for Spurs",
    "Team news ahead of kickoff",
    "Ten Hag sends message ahead of clash",
    "Arteta puts squad depth ahead of transfers",
    "Fans head to Wembley in front of a sellout",
    "Rooney heads in front of the media",
    "What to look out for in front of goal",
    "Spurs push ahead with stadium plans",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hid: ${title}`);
  }
});
