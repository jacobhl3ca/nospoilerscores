import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "(spoils|points|honours) ... shared" is the INVERTED (subject-first) DRAW idiom soccer
// recaps lead with when a match ends level: "Spoils shared at the Emirates", "Points were
// shared", "Honours shared after late drama". The active verb-first forms ("share the
// spoils", "share the points", "share the honours") were already keyworded, but the passive
// "<noun> shared" report — the same drawn-result reveal — carries no digit for SCORE_RX and
// matched no existing keyword, so it leaked. It sits beside those active draw idioms and
// "honours even" / "a point apiece" as the subject-first twin.
test("an inverted 'spoils/points/honours shared' draw reveal never reads as a clean title", () => {
  for (const title of [
    "Spoils shared at the Emirates | Match Highlights",
    "Points shared in a tense London derby",
    "Honours shared after late drama at Old Trafford",
    "Honours were shared as neither side could break through",
    "The points were shared in a goalless stalemate",
    "Spoils duly shared in the Manchester derby",
    "Points fairly shared between the two sides",
    "Honors shared in Texas",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The pattern is pinned to the three result nouns immediately governing "shared" (with an
// optional were/are/fairly/evenly/duly between), so the everyday "news/photos/highlights
// shared" senses and non-result mentions pass through untouched.
test("ordinary 'shared' uses are not over-hidden", () => {
  for (const title of [
    "Injury news shared by the club ahead of kickoff",
    "Match highlights shared on the official channel",
    "Photos shared from the first day of training",
    "Team news and the honours list released this week",
    "Preview shared before Saturday's fixtures",
    "Points system explained ahead of the new season",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
