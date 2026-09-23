import assert from "node:assert/strict";
import test from "node:test";

import {
  chessEventState,
  buildChessEventUrl,
  buildBoxingTokens,
  boxingChannelFor,
  boxingHighlightQuery,
  indycarTrackSubtitle,
  isStaleFinishedForBoard,
  eventTitleVariants,
  eventSubtitleVariants,
  stripF1Sponsor,
  stripNascarSeriesPrefix,
  shortenIndycarTitle,
  titleCasePlace,
} from "../src/lib/eventTiles.ts";

const H = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 10, 18, 0, 0);

// ── Chess: a Lichess broadcast that never flipped out of "in" ────────────────

test("a chess broadcast still 'in' long after its window closed reads Final", () => {
  assert.equal(chessEventState("in", NOW - 30 * H, NOW), "post");
});

test("a chess round running past its scheduled end is still Live", () => {
  // 8h of slack: a classical round can itself run 7h past the window's close.
  assert.equal(chessEventState("in", NOW - 7 * H, NOW), "in");
  assert.equal(chessEventState("in", NOW + 4 * H, NOW), "in");
});

test("an unknown end time is not evidence the chess event ended", () => {
  assert.equal(chessEventState("in", null, NOW), "in");
});

test("chess states Lichess reports directly are passed through untouched", () => {
  assert.equal(chessEventState("pre", NOW - 99 * H, NOW), "pre");
  assert.equal(chessEventState("post", NOW + 99 * H, NOW), "post");
});

// ── Chess: the Lichess link (A7 — no results before the click) ──────────────

const FIXTURE_TOUR = {
  url: "https://lichess.org/broadcast/sinquefield-cup-2026/abcd1234",
  website: "https://grandchesstour.org/",
};
const ROUND_URL = "https://lichess.org/broadcast/sinquefield-cup-2026/round-3/wxyz9876";

test("an ongoing round links straight to the live boards", () => {
  assert.equal(
    buildChessEventUrl({ ...FIXTURE_TOUR, round: { url: ROUND_URL, ongoing: true } }),
    ROUND_URL,
  );
});

test("a round that has not started or already ended falls back to the tour url", () => {
  assert.equal(
    buildChessEventUrl({ ...FIXTURE_TOUR, round: { url: ROUND_URL, ongoing: false } }),
    FIXTURE_TOUR.url,
  );
});

test("no round data at all falls back to the tour url, then the organizer site", () => {
  assert.equal(buildChessEventUrl({ ...FIXTURE_TOUR, round: null }), FIXTURE_TOUR.url);
  assert.equal(
    buildChessEventUrl({ url: null, website: "https://grandchesstour.org/", round: null }),
    "https://grandchesstour.org/",
  );
});

test("an ongoing round missing its url still falls back rather than building a broken link", () => {
  assert.equal(
    buildChessEventUrl({ ...FIXTURE_TOUR, round: { url: null, ongoing: true } }),
    FIXTURE_TOUR.url,
  );
});

// ── Boxing: fighter surnames out of a boxing-data.com card title ─────────────

test("boxing tokens are the two fighters, without the card's marketing tail", () => {
  assert.deepEqual(buildBoxingTokens("Shields vs. Scott"), ["Shields", "Scott"]);
  assert.deepEqual(buildBoxingTokens("Roach vs Zepeda: The Rematch"), ["Roach", "Zepeda"]);
  assert.deepEqual(buildBoxingTokens("Taylor vs. Serrano (III)"), ["Taylor", "Serrano"]);
});

test("a boxing title with no 'vs' yields a single token, never an empty gate", () => {
  assert.deepEqual(buildBoxingTokens("Matchroom Fight Night"), ["Matchroom Fight Night"]);
  assert.deepEqual(buildBoxingTokens(""), []);
});

// ── IndyCar: the track map ESPN does not supply ─────────────────────────────

test("IndyCar races ESPN gives no venue for still name their track", () => {
  // ESPN's name is generic; the series' is not. This is why it can't be derived.
  assert.equal(
    indycarTrackSubtitle("Grand Prix of Illinois"),
    "World Wide Technology Raceway · Madison, Illinois",
  );
  assert.equal(
    indycarTrackSubtitle("Grand Prix of Alabama"),
    "Barber Motorsports Park · Birmingham, Alabama",
  );
});

test("the Indy road course and the 500 are told apart", () => {
  assert.equal(
    indycarTrackSubtitle("Grand Prix of Indianapolis (Road Course)"),
    "IMS Road Course · Indianapolis, Indiana",
  );
  assert.equal(
    indycarTrackSubtitle("Indianapolis 500"),
    "Indianapolis Motor Speedway · Indianapolis, Indiana",
  );
});

test("an unmapped race yields nothing rather than a wrong track", () => {
  assert.equal(indycarTrackSubtitle("Grand Prix of Somewhere New"), undefined);
  assert.equal(indycarTrackSubtitle(""), undefined);
});

// ── Boxing: broadcaster → the promoter channel that posts the fight ─────────

test("the promoter channel comes from the broadcasters on the card", () => {
  assert.deepEqual(boxingChannelFor(["DAZN", "DAZN Global"]), { channel: "DAZN Boxing", label: "DAZN" });
  assert.deepEqual(boxingChannelFor(["ESPN+"]), { channel: "Top Rank Boxing", label: "Top Rank" });
  assert.deepEqual(boxingChannelFor(["Prime Video"]), { channel: "Premier Boxing Champions", label: "PBC" });
});

test("DAZN and Matchroom outrank Sky when a card lists both", () => {
  // A Sky-broadcast card is almost always also a DAZN or Matchroom card, and
  // Sky's channel is the one that misses on surname-only queries.
  assert.equal(boxingChannelFor(["Sky Sports", "DAZN"])?.channel, "DAZN Boxing");
  assert.equal(boxingChannelFor(["Sky Sports Box Office"])?.channel, "Sky Sports Boxing");
});

test("an unrecognised broadcaster stays dark rather than guessing a channel", () => {
  assert.equal(boxingChannelFor(["Telemundo"]), null);
  assert.equal(boxingChannelFor([]), null);
  assert.equal(boxingChannelFor(undefined), null);
});

test("the highlight query never appends 'highlights' after 'full fight'", () => {
  // Measured against the live resolver: the extra token turned a hit into
  // "No results" on DAZN, Matchroom and Top Rank alike.
  assert.equal(boxingHighlightQuery("Shields vs. Scott"), "Shields vs Scott full fight");
  assert.equal(boxingHighlightQuery("Matchroom Fight Night"), "Matchroom Fight Night full fight");
});

// ── Which event belongs on a board day ──────────────────────────────────────

test("today's board never keeps a race that already finished", () => {
  // The live 2026-08-10 case: the undated NASCAR/IndyCar scoreboards both
  // returned Sunday's FINISHED race, so today grew a finished tile with a
  // highlight button on a day no race ran.
  assert.equal(isStaleFinishedForBoard("20260810", "20260810", "20260809", "post"), true);
  assert.equal(isStaleFinishedForBoard("20260815", "20260810", "20260809", "post"), true);
});

test("a past board keeps its finished race — that is the whole point of it", () => {
  assert.equal(isStaleFinishedForBoard("20260809", "20260810", "20260809", "post"), false);
  assert.equal(isStaleFinishedForBoard("20260801", "20260810", "20260726", "post"), false);
});

test("an upcoming or live race on today is never stale", () => {
  assert.equal(isStaleFinishedForBoard("20260810", "20260810", "20260821", "pre"), false);
  assert.equal(isStaleFinishedForBoard("20260810", "20260810", "20260810", "in"), false);
  // Same day = ran today = belongs on today.
  assert.equal(isStaleFinishedForBoard("20260810", "20260810", "20260810", "post"), false);
});

test("an unreadable date is not evidence of staleness", () => {
  // fromYmd's lesson: a NaN comparison answers "no" silently, and answering
  // "yes" here would hide the tile on every board.
  assert.equal(isStaleFinishedForBoard("20260810", "20260810", "", "post"), false);
  assert.equal(isStaleFinishedForBoard("", "20260810", "20260809", "post"), false);
});

// ── Tile text that has to fit ───────────────────────────────────────────────

test("an F1 title sheds its sponsor but never its identity", () => {
  assert.deepEqual(
    eventTitleVariants("Heineken Dutch Grand Prix", "Heineken Dutch GP", "f1"),
    ["Heineken Dutch Grand Prix", "Heineken Dutch GP", "Dutch GP"],
  );
  // The names a "drop the words before GP" regex would have wrecked. All three
  // are real 2026 rounds.
  assert.equal(stripF1Sponsor("Mexico City GP"), "Mexico City GP");
  assert.equal(stripF1Sponsor("MSC Cruises United States GP"), "United States GP");
  assert.equal(stripF1Sponsor("MSC Cruises São Paulo GP"), "São Paulo GP");
  assert.equal(stripF1Sponsor("Monaco GP"), "Monaco GP");
});

test("an unlisted F1 sponsor shortens nothing rather than guessing", () => {
  // Sponsors rotate every season; the fallback is the full, correct name.
  assert.equal(stripF1Sponsor("Fictional Bank Dutch GP"), "Fictional Bank Dutch GP");
});

test("a NASCAR title drops the series prefix the column header already carries", () => {
  assert.equal(stripNascarSeriesPrefix("NASCAR Cup Series at Iowa"), "Iowa");
  assert.equal(stripNascarSeriesPrefix("NASCAR Cup Series at Circuit of the Americas"), "Circuit of the Americas");
  assert.equal(stripNascarSeriesPrefix("NASCAR Cup Series All Star Race"), "All Star Race");
  // The four 2026 rounds ESPN does NOT prefix pass through untouched.
  assert.equal(stripNascarSeriesPrefix("Daytona 500"), "Daytona 500");
  assert.equal(stripNascarSeriesPrefix("Clash at Bowman Gray"), "Clash at Bowman Gray");
});

test("an IndyCar title puts the place first, where truncation can't eat it", () => {
  assert.equal(shortenIndycarTitle("Grand Prix of St. Petersburg"), "St. Petersburg GP");
  assert.equal(shortenIndycarTitle("Indianapolis 500"), "Indianapolis 500");
});

test("title variants are longest-first, deduplicated, and always start whole", () => {
  const v = eventTitleVariants("Monaco Grand Prix", "Monaco GP", "f1");
  assert.equal(v[0], "Monaco Grand Prix");
  assert.deepEqual(v, ["Monaco Grand Prix", "Monaco GP"]);
  // A tile with nothing to shorten still offers its full title.
  assert.deepEqual(eventTitleVariants("Sinquefield Cup"), ["Sinquefield Cup"]);
});

test("the venue line drops the country, then the city, never the track", () => {
  assert.deepEqual(
    eventSubtitleVariants("Circuit Park Zandvoort", "Zandvoort", "Netherlands"),
    [
      "Circuit Park Zandvoort · Zandvoort, Netherlands",
      "Circuit Park Zandvoort · Zandvoort",
      "Circuit Park Zandvoort",
      // Last rung before an ellipsis, reached only on the 3-column mobile board.
      "Zandvoort",
    ],
  );
});

test("ESPN's lower-cased race cities are title-cased before they're shown", () => {
  // All five live on the 2026 F1 calendar as ESPN prints them.
  assert.equal(titleCasePlace("monte carlo"), "Monte Carlo");
  assert.equal(titleCasePlace("Sao paulo"), "Sao Paulo");
  assert.equal(titleCasePlace("Abu dhabi"), "Abu Dhabi");
  // An all-caps state code and an interior lowercase particle survive.
  assert.equal(eventSubtitleVariants("Circuit of the Americas", "Austin", "TX")[0],
    "Circuit Of The Americas · Austin, TX");
});
