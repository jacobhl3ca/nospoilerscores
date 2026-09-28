import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_FEED_IDS, CHANNEL_SEARCH_HANDLES, channelFeedId, channelSearchHandle, channelSearchMinSec, channelSearchNeedsEmbed, channelSearchTitleTokens, feedCoversGame, isWomensSport, parseChannelFeed,
  pickChannelSearchCards, titleDateYmd, titleHasCompToken, NOT_FIRST_TEAM_RX,
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

test("ECAC: a women's cut is kept for a women's game, each night by its own date", () => {
  // The ECAC Hockey feed, 2026-09-26. The same pair plays Friday and Saturday.
  const now = Date.parse("2026-09-26T20:00Z");
  const cards = [
    { videoId: "sat", title: "RIT at Clarkson | NCAA Women's Ice Hockey | Highlights - September 26, 2026 | #ECACHockey", durationSec: null, publishedMs: now },
    { videoId: "_3ClIbxGMG0", title: "RIT at Clarkson | NCAA Women's Ice Hockey | Highlights - September 25, 2026 | #ECACHockey", durationSec: null, publishedMs: now - 13 * 3600e3 },
    { videoId: "men", title: "RIT at Clarkson | NCAA Men's Ice Hockey | Highlights - September 25, 2026 | #ECACHockey", durationSec: null, publishedMs: now - 13 * 3600e3 },
  ];
  const opts = {
    titleHasTeams: teams("rit", "clarkson"),
    compOk: (t) => titleHasCompToken(t, ["women"]),
    gameMs: Date.parse("2026-09-25T22:00Z"),
    womensGame: isWomensSport("ncaawh"),
  };
  assert.deepEqual(pickChannelSearchCards(cards, opts).map((c) => c.videoId), ["_3ClIbxGMG0"]);
  // Without the flag the club-channel filter would refuse the right cut.
  assert.deepEqual(pickChannelSearchCards(cards, { ...opts, womensGame: false }), []);
  assert.equal(isWomensSport("efl"), false);
  assert.equal(channelSearchHandle("ECAC Hockey"), "ECACHockeyLeague");
});

test("the uploads feed parses to cards: Shorts dropped, entities decoded, newest first", () => {
  const entry = (id, title, published, path = "watch?v=") => `<entry>
  <id>yt:video:${id}</id>
  <yt:videoId>${id}</yt:videoId>
  <title>${title}</title>
  <link rel="alternate" href="https://www.youtube.com/${path}${id}"/>
  <published>${published}</published>
  <media:group><media:title>${title}</media:title></media:group>
 </entry>`;
  const xml = `<?xml version="1.0"?><feed>
 <title>Atlantic Hockey America</title>
 ${entry("VqQcZU28c9k", "Delaware 2, Holy Cross 2 OT (Del. wins shootout) - Sept. 25, 2026", "2026-09-26T16:08:00+00:00")}
 ${entry("aPH96oP7tOE", "The AHA Show Trailer: Sept. 24, 2026", "2026-09-24T23:56:00+00:00", "shorts/")}
 ${entry("Ic6Nc38QpEI", "&quot;All of our buildings&quot; &amp; more", "2026-09-24T20:26:00+00:00")}
</feed>`;
  const feed = parseChannelFeed(xml);
  const { cards } = feed;
  assert.deepEqual(cards.map((c) => c.videoId), ["VqQcZU28c9k", "Ic6Nc38QpEI"]);
  // The oldest upload counts the Short too: the feed covers everything since.
  assert.equal(feed.oldestMs, Date.parse("2026-09-24T20:26:00Z"));
  assert.equal(feedCoversGame(feed, Date.parse("2026-09-26T19:00Z")), true);
  assert.equal(feedCoversGame(feed, Date.parse("2026-09-24T19:00Z")), false);
  assert.equal(feedCoversGame(null, Date.parse("2026-09-26T19:00Z")), false);
  assert.equal(feedCoversGame(parseChannelFeed(""), Date.parse("2026-09-26T19:00Z")), false);
  assert.equal(cards[0].publishedMs, Date.parse("2026-09-26T16:08:00Z"));
  assert.equal(cards[0].durationSec, null);
  assert.equal(cards[1].title, '"All of our buildings" & more');
  assert.deepEqual(parseChannelFeed(""), { cards: [], oldestMs: null });
  // A feed card has no length: the pre-filter lets it through, the bake's
  // watch-page read decides.
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("delaware", "holy cross"), gameMs: Date.parse("2026-09-25T22:00Z") });
  assert.deepEqual(picks.map((c) => c.videoId), ["VqQcZU28c9k"]);
});

test("every searchable channel has a feed id, and the ids are channel ids", () => {
  for (const channel of Object.keys(CHANNEL_SEARCH_HANDLES)) assert.ok(channelFeedId(channel), channel);
  for (const id of Object.values(CHANNEL_FEED_IDS)) assert.match(id, /^UC[A-Za-z0-9_-]{22}$/);
  assert.equal(new Set(Object.values(CHANNEL_FEED_IDS)).size, Object.keys(CHANNEL_FEED_IDS).length);
  assert.equal(channelFeedId("ESPN FC"), null);
});

test("NFL: the game cut wins over the preview and the ending clip, and embeds are not required", () => {
  // The @NFL search page for "Jets Lions", 2026-09-27 ~11 pm ET, in page order.
  const game = Date.parse("2026-09-27T17:00Z");
  const now = game + 13 * 3600e3;
  const cards = [
    { videoId: "GSZ0Bax9eeA", title: "Jets VS Lions down to the wire ending!", durationSec: 976, publishedMs: now - 6 * 3600e3 },
    { videoId: "qahjjvrG2kI", title: "New York Jets vs Detroit Lions Game Preview | 2026 Week 3", durationSec: 706, publishedMs: now - 1.5 * DAY },
    { videoId: "xsJzYyK4mGE", title: "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 3", durationSec: 1064, publishedMs: now - 7 * 3600e3 },
    { videoId: "wk2", title: "New York Jets vs. Detroit Lions Game Highlights | NFL 2026 Season Week 2", durationSec: 1000, publishedMs: now - 6 * 3600e3 },
  ];
  const tokens = channelSearchTitleTokens("NFL");
  assert.deepEqual(tokens, ["game highlights"]);
  const weekOk = (title) => !/week 2\b/i.test(title);
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("jets", "lions"), compOk: (t) => titleHasCompToken(t, tokens) && weekOk(t), gameMs: game });
  assert.deepEqual(picks.map((c) => c.videoId), ["xsJzYyK4mGE"]);
  assert.equal(channelSearchHandle("NFL"), "NFL");
  assert.equal(channelSearchNeedsEmbed("NFL"), false);
  assert.equal(channelSearchNeedsEmbed("Major League Soccer"), true);
  assert.deepEqual(channelSearchTitleTokens("Major League Soccer"), []);
});

test("MAC: this game's dated cut, not the 2019 meeting", () => {
  // The @GetSomeMACtion search page for "Buffalo Robert Morris", 2026-09-27.
  const game = Date.parse("2026-09-26T19:30Z");
  const now = game + DAY;
  const cards = [
    { videoId: "NnwzIwJdfBQ", title: "Condensed Game: Buffalo vs. Robert Morris | 9.26.26", durationSec: 489, publishedMs: now - DAY },
    { videoId: "wPGqhAcWYjM", title: "Buffalo Highlights vs. Robert Morris | 9.26.26", durationSec: 296, publishedMs: now - DAY },
    { videoId: "old", title: "Buffalo Highlights vs. Robert Morris | 9.28.19", durationSec: 300, publishedMs: now - 7 * 365 * DAY },
  ];
  const picks = pickChannelSearchCards(cards, { titleHasTeams: teams("buffalo", "robert morris"), gameMs: game });
  assert.deepEqual(picks.map((c) => c.videoId), ["NnwzIwJdfBQ", "wPGqhAcWYjM"]);
  assert.equal(channelSearchHandle("Get Some MACtion"), "GetSomeMACtion");
});
