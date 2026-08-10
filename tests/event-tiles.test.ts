import assert from "node:assert/strict";
import test from "node:test";

import {
  chessEventState,
  buildBoxingTokens,
  boxingChannelFor,
  boxingHighlightQuery,
  indycarTrackSubtitle,
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
