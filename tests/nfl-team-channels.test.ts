import assert from "node:assert/strict";
import test from "node:test";

import {
  NFL_TEAM_CHANNELS,
  nflTeamChannelChain,
  isNflTeamChannel,
} from "../src/lib/nflTeamChannels.ts";

test("every NFL club has a channel and the handle that proves it", () => {
  assert.equal(Object.keys(NFL_TEAM_CHANNELS).length, 32);
  for (const [abbr, row] of Object.entries(NFL_TEAM_CHANNELS)) {
    assert.ok(row.channel, `${abbr} has no channel`);
    assert.ok(row.handle, `${abbr} has no handle — check-nfl-team-channels.mjs needs it`);
  }
});

test("the club chain is home first, then away", () => {
  assert.deepEqual(nflTeamChannelChain("CLE", "CHI"), ["Chicago Bears", "Cleveland Browns"]);
  // Lower case in, because the caller passes ESPN's abbreviation straight
  // through. ⚠️ Washington is WSH on ESPN, not the WAS other feeds use.
  assert.deepEqual(nflTeamChannelChain("wsh", "nyg"), ["New York Giants", "Washington Commanders"]);
});

test("an unknown abbreviation drops out of the chain instead of breaking it", () => {
  assert.deepEqual(nflTeamChannelChain("XXX", "KC"), ["Kansas City Chiefs"]);
  assert.deepEqual(nflTeamChannelChain(null, undefined), []);
  assert.deepEqual(nflTeamChannelChain("XXX", "YYY"), []);
});

test("the names that trapped the first build are not in the table", () => {
  // Six obvious slugs are EMPTY SQUATTED channels whose title is the slug, and
  // two more are other sports entirely. Any of them here means the table was
  // regenerated from team names instead of read off the channels' feeds.
  const values = Object.values(NFL_TEAM_CHANNELS).map((t) => t.channel);
  for (const trap of [
    "clevelandbrowns", "denverbroncos", "greenbaypackers",
    "indianapoliscolts", "minnesotavikings", "NewEnglandPatriots",
    "St. Louis Cardinals", "埼玉西武ライオンズ",
  ]) {
    assert.ok(!values.includes(trap), `${trap} is a known-bad channel string`);
  }
  // The Raiders really did drop the city from their channel title.
  assert.equal(NFL_TEAM_CHANNELS.LV.channel, "Raiders");
});

test("a club channel is distinguishable from the league's own", () => {
  // Kept for the masking rule the route would need if it is ever reopened: a
  // club names the stat line in its player-reel titles ("… From 2-TD Game vs.
  // Bills"), while the league's house recap format carries nothing.
  assert.equal(isNflTeamChannel("Chicago Bears"), true);
  assert.equal(isNflTeamChannel("Raiders"), true);
  assert.equal(isNflTeamChannel("NFL"), false);
  assert.equal(isNflTeamChannel(null), false);
  assert.equal(isNflTeamChannel(""), false);
});
