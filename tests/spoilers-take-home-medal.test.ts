import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// At an Olympics/Worlds/championship, "takes/brings home (the) gold/silver/bronze" names the podium
// result outright — the win-side sibling of the existing "(claim/take/secure/grab/…) the gold/silver/
// bronze" clause. That clause only caught the medal word DIRECTLY after the verb ("takes gold",
// "claims the silver"); the everyday "take/bring home the medal" framing puts "home" between the verb
// and the medal, so it slipped through. It carries no digit (SCORE_RX misses it) and no other keyword
// fires, so a "… takes home gold" recap title was leaking the result.
test("a 'take/bring home the medal' podium result never reads as a clean title", () => {
  for (const title of [
    "Team USA takes home gold in Paris",
    "Canada takes home the gold",
    "Ledecky brings home gold",
    "Great Britain bring home silver",
    "He took home bronze at the Worlds",
    "Biles brings home the gold medal",
    "Norway take home the gold medals",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The clause is anchored to "home <the?> gold/silver/bronze" with the same guards the sibling medal
// clause uses: the "(?!coast)" lookahead keeps the Australian place name out, "medal(s)" is the only
// suffix allowed (so "the silverware"/"the trophy"/"the bacon" after "home" stay visible), and a
// bare "Silver"/"Gold" surname or venue with no preceding "take/bring home" never fires.
test("a non-medal use of gold/silver/home is not over-hidden", () => {
  for (const title of [
    "How to watch on the Gold Coast",
    "Adam Silver addresses the media",
    "Silverstone preview: British GP",
    "Golden State head home for Game 5",
    "Bring home the bacon: preview",
    "How to take home the trophy this year",
    "They bring home the silverware talk",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
