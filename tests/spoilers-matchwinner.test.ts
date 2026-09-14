import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "matchwinner" / "gamewinner" (and "matchwinning" / "gamewinning") are the CLOSED-compound spelling of
// the winning-goal reveal that fan-channel highlight titles write without a separator — "MATCHWINNER!
// Saka strikes late", "Tatum's gamewinner". The hyphenated and spaced forms ("match-winner", "match
// winner", "match-winning") were already caught, because the bare "winners?"/"winning" tokens sit behind
// the word boundary the hyphen/space supplies; the one-word spelling has no boundary before "winn…", so
// \bwinners? could not fire inside it and the compound leaked with no scoreline for SCORE_RX to catch.
test("a closed-compound 'matchwinner' / 'gamewinner' reveal never reads as a clean title", () => {
  for (const title of [
    "MATCHWINNER! Bukayo Saka strikes late for Arsenal",
    "Saka the matchwinner for Arsenal",
    "The Premier League's matchwinners this week",
    "Saka's matchwinning goal at the Emirates",
    "Tatum with the gamewinner",
    "Curry's gamewinning three at the buzzer",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The hyphenated and spaced spellings were, and stay, caught — the token is byte-identical in the
// worker (public/_worker.js), so the client un-mask call and the server pre-skip agree.
test("hyphenated and spaced 'match-winner' spellings stay caught", () => {
  for (const title of [
    "Saka the match-winner for Arsenal",
    "Saka the match winner for Arsenal",
    "Saka's match-winning goal",
    "Tatum with the game-winner",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The new "(?:match|game)[- ]?winn…" alternative is pinned to the "winn" stem, so the neutral "match"/
// "game" words it sits beside — matchday, game plan, matchup, gameweek — reach no "winn" and stay
// visible. (Bare "winner"/"winning" are matched elsewhere by design and are not what this token adds,
// so titles built around those words are deliberately left out of this control set.)
test("neutral 'match'/'game' words near no 'winn' stem are not over-hidden", () => {
  for (const title of [
    "Matchday 5 fixtures announced",
    "Game plan breakdown: how they set up",
    "The matchup to watch this weekend",
    "Gameweek 3 preview and team news",
    "Pre-game show starts at 7",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
