import assert from "node:assert/strict";
import test from "node:test";

import { buildPost, checkPost, matchup, ratingWord } from "../scripts/top-games-post.mjs";

// Scores 31 and 28 sit in each game; none may reach the post.
const team = (name, score) => ({ shortDisplayName: name, displayName: name, abbreviation: name.slice(0, 3), score });
const g = (id, away, home, rating, iso) => ({
  id, sport: "nfl", date: iso, state: "post", completed: true, isPreseason: false, rating,
  awayTeam: team(away, "31"), homeTeam: team(home, "28"),
});
const GAMES = [
  g("1", "Packers", "Buccaneers", 100, "2026-10-04T17:00:00Z"),
  g("2", "76ers", "Celtics", 93, "2026-10-03T23:00:00Z"),
  g("3", "Rams", "Eagles", 71, "2026-10-05T00:20:00Z"),
];

test("a post lists Away at Home with the rating word, never a score or a winner", () => {
  const post = buildPost(GAMES, { span: "week", league: "NFL" });
  assert.equal(post.title, "3 NFL games worth watching this week");
  assert.match(post.text, /^1\. Packers at Buccaneers · .* · Great$/m);
  assert.deepEqual(checkPost(post), []);
  assert.ok([...post.short].length <= 300, "the short text is over Bluesky's 300");
  assert.doesNotMatch(post.text, /31|28/);
  assert.doesNotMatch(`${post.text}${post.short}`, /spoiler[- ]free scores|scores without spoilers/i);
});

test("checkPost catches a result word, a score pair, a game's own score and the banned phrase", () => {
  const base = buildPost(GAMES, { span: "week" });
  const bad = (extra) => checkPost({ ...base, text: `${base.text}\n${extra}` });
  assert.ok(bad("Packers beat the Buccaneers").length);
  assert.ok(bad("what a 31-28 finish").length);
  assert.ok(bad("a 31 point night").length);
  assert.ok(bad("spoiler-free scores for every game").length);
  // A team name with digits is a name, not a score.
  assert.deepEqual(checkPost(base), []);
});

test("rating words match the card badges", () => {
  assert.deepEqual([100, 85, 84, 70, 69, 50, 49].map(ratingWord), ["Great", "Great", "Good", "Good", "Meh", "Meh", "Skip"]);
  assert.equal(matchup(GAMES[1]), "76ers at Celtics");
});
