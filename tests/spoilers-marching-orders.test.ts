import assert from "node:assert/strict";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// "marching orders" is the stock British football idiom for a sending-off —
// "given his marching orders" — a direct sibling of the already-covered
// "red card" noun, the "send off"/"sent off" verb form and "sees red"/"saw
// red". A dismissal is a match-event partial-result leak that carries no
// hyphenated scoreline for SCORE_RX and matched none of those bare stems, so
// a title framed this way leaked. The pattern is anchored to the fixed
// two-word idiom (a mandatory space-or-hyphen between the words).
test("a 'marching orders' sending-off reveal never reads as a clean title", () => {
  for (const title of [
    "Casemiro handed his marching orders vs City",
    "Keeper given his marching orders late on | Premier League Highlights",
    "Ramos shown his marching-orders at the Bernabéu",
    "Arsenal down to ten as Rice gets his marching orders",
    "Marching orders for Van Dijk after VAR check",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The joined two-word idiom keeps the bare words' everyday senses visible —
// "marching" alone (a marching band, marching on) and "orders" alone (side
// orders, court orders, orders of magnitude) reveal no match event, so they
// are not over-hidden.
test("ordinary uses of 'marching'/'orders' are not over-hidden", () => {
  for (const title of [
    "The marching band takes the field at halftime",
    "Fans keep marching on to the stadium",
    "Club takes new shirt orders ahead of the season",
    "A tactical breakdown orders of magnitude deeper than the rest",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});
