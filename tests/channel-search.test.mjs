import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_SEARCH_HANDLES, channelSearchHandle, channelSearchMinSec, pickChannelSearchCards, titleDateYmd, titleHasCompToken, NOT_FIRST_TEAM_RX,
} from "../scripts/lib/channel-search.mjs";

const DAY = 86400e3;
const GAME = Date.parse("2026-09-19T23:30Z");
const NOW = GAME + 5 * DAY;
const teams = (a, b) => (title) => title.toLowerCase().includes(a) && title.toLowerCase().includes(b);

test("this week's cut wins over the older meetings the global search ranked first", () => {
  // The @MLS search page for "Orlando New England", 2026-09-25, in page order.
  const cards = [
    { videoId: "_1OfuMhi-rE", title: "New England Revolution vs. Orlando City | Full Match Highlights | Twin Braces in New England!", durationSec: 600, publishedMs: NOW - 5 * DAY },
    { videoId: "mZKCYuOShPI", title: "Orlando City vs. New England Revolution | Full Match Highlights | Martín Ojeda Hat Trick!", durationSec: 600, publishedMs: NOW - 365 * DAY },
    { videoId: "VNLUMQg3MCI", title: "Highlights: Orlando City vs. New England Revolution | September 27, 2017", durationSec: 300, publishedMs: NOW - 8 * 365 * DAY },
  ];
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("orlando", "new england"), gameMs: GAME });
  assert.deepEqual(picks.map((c) => c.videoId), ["_1OfuMhi-rE"]);
});

test("other fixtures, women's and youth sides, short clips and excluded ids drop out", () => {
  const cards = [
    { videoId: "a", title: "Chicago Fire FC vs. New England Revolution | Full Match Highlights", durationSec: 600, publishedMs: NOW - 2 * DAY },
    { videoId: "b", title: "Albion Women 3-1 Birmingham City Women | Highlights", durationSec: 300, publishedMs: NOW - 2 * DAY },
    { videoId: "c", title: "West Brom U21 v Birmingham U21 | Highlights", durationSec: 300, publishedMs: NOW - 2 * DAY },
    { videoId: "d", title: "West Brom v Birmingham | Goal", durationSec: 25, publishedMs: NOW - 2 * DAY },
    { videoId: "e", title: "West Brom v Birmingham | Highlights", durationSec: 300, publishedMs: NOW - 2 * DAY },
    { videoId: "f", title: "West Brom v Birmingham | Extended Highlights", durationSec: 700, publishedMs: NOW - 2 * DAY },
  ];
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("brom", "birmingham"), gameMs: GAME, exclude: ["e"] });
  assert.deepEqual(picks.map((c) => c.videoId), ["f"]);
  assert.ok(NOT_FIRST_TEAM_RX.test("Norwich City Women v Bolton Wanderers Women"));
  assert.ok(!NOT_FIRST_TEAM_RX.test("Bolton Wanderers v Norwich City | Highlights"));
});

test("a card whose age did not parse is kept, after every dated card", () => {
  const cards = [
    { videoId: "undated", title: "Leverkusen - Leipzig | Highlights", durationSec: 180, publishedMs: null },
    { videoId: "dated", title: "Leverkusen - Leipzig | Highlights | MD 4", durationSec: 180, publishedMs: NOW - 4 * DAY },
  ];
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("leverkusen", "leipzig"), gameMs: GAME });
  assert.deepEqual(picks.map((c) => c.videoId), ["dated", "undated"]);
});

test("the competition token is required when one is given", () => {
  const cbs = "Cardiff City vs. Charlton Athletic: Extended Highlights | EFL Championship | CBS Sports";
  assert.equal(titleHasCompToken(cbs, ["efl championship"]), true);
  assert.equal(titleHasCompToken("Manchester City vs. Norwich City: Extended Highlights | Carabao Cup", ["efl championship"]), false);
  assert.equal(titleHasCompToken("anything", []), true);
  const picks = pickChannelSearchCards(
    [{ videoId: "cup", title: "Norwich City vs. Bolton: Extended Highlights | Carabao Cup", durationSec: 600, publishedMs: NOW - DAY }],
    { titleHasTeams: teams("norwich", "bolton"), compOk: (t) => titleHasCompToken(t, ["efl championship"]), gameMs: GAME },
  );
  assert.deepEqual(picks, []);
});

test("only listed channels have a search page", () => {
  assert.equal(channelSearchHandle("Major League Soccer"), "MLS");
  assert.equal(channelSearchHandle("Portsmouth FC"), "OfficialPompey");
  assert.equal(channelSearchHandle("ESPN FC"), null);
  assert.equal(channelSearchHandle(null), null);
  for (const handle of Object.values(CHANNEL_SEARCH_HANDLES)) assert.match(handle, /^[A-Za-z0-9_.-]+$/);
});

test("AHA: each night of a series gets its own cut, and a 59 s recap counts", () => {
  // The @atlantichockeyamerica search page for "Ohio State Penn State",
  // 2026-09-26, in page order. The 9/25 cut sits first for both nights.
  const now = Date.parse("2026-09-26T18:00Z");
  const cards = [
    { videoId: "tJMVNYbn0Ks", title: "Ohio State 2, Penn State 1 - Sept. 25, 2026", durationSec: 161, publishedMs: now - 19 * 3600e3 },
    { videoId: "52d7bwEdWl4", title: "Ohio State 2, Penn State 1 OT - Sept. 24, 2026", durationSec: 92, publishedMs: now - 22 * 3600e3 },
    { videoId: "G5w5xc6YQW0", title: "9.20.22 Syracuse Season Preview", durationSec: 116, publishedMs: now - 4 * 365 * DAY },
  ];
  const opts = { titleHasTeams: teams("ohio state", "penn state"), minSec: channelSearchMinSec("Atlantic Hockey America") };
  assert.deepEqual(pickChannelSearchCards(cards, { ...opts, gameMs: Date.parse("2026-09-24T23:00Z") }).map((c) => c.videoId), ["52d7bwEdWl4"]);
  assert.deepEqual(pickChannelSearchCards(cards, { ...opts, gameMs: Date.parse("2026-09-25T23:00Z") }).map((c) => c.videoId), ["tJMVNYbn0Ks"]);
  const cuse = [{ videoId: "VrJ0_8gHZs0", title: "Syracuse 3, Stonehill 0 - Sept. 25, 2026", durationSec: 59, publishedMs: now - 19 * 3600e3 }];
  assert.equal(pickChannelSearchCards(cuse, { titleHasTeams: teams("syracuse", "stonehill"), gameMs: Date.parse("2026-09-25T23:00Z"), minSec: 45 }).length, 1);
  assert.equal(pickChannelSearchCards(cuse, { titleHasTeams: teams("syracuse", "stonehill"), gameMs: Date.parse("2026-09-25T23:00Z") }).length, 0);
  assert.equal(channelSearchHandle("Atlantic Hockey America"), "atlantichockeyamerica");
});

test("a title's own date: long, short and West Coast night forms", () => {
  assert.equal(titleDateYmd("Ohio State 2, Penn State 1 OT - Sept. 24, 2026"), "20260924");
  assert.equal(titleDateYmd("Highlights: Orlando City vs. New England Revolution | September 27, 2017"), "20170927");
  assert.equal(titleDateYmd("3.10.23 AHA Semifinals Game 1: Holy Cross vs. RIT Highlights"), "20230310");
  assert.equal(titleDateYmd("West Brom v Birmingham | Highlights"), "");
  // 10:30 pm PT on 9/24 is 9/25 in ET; a title naming 9/24 still fits.
  const late = [{ videoId: "w", title: "LA Galaxy vs. Seattle | September 24, 2026", durationSec: 300, publishedMs: null }];
  assert.equal(pickChannelSearchCards(late, { titleHasTeams: teams("galaxy", "seattle"), gameMs: Date.parse("2026-09-25T05:30Z") }).length, 1);
});
