// Finals pairings that give away an earlier result (Jacob 2026-09-27, "hide").
//
// In a single-game knockout, the fixture for the next round names who won the
// round before: the NRL Grand Final card "Roosters vs Knights" is the result of
// both preliminary finals. The NRL, AFL and CFL landing pages promise the board
// "never lists who advanced", so a card for such a round shows its round, time
// and a "Show teams" button instead of the two clubs. The tap counts for this
// visit only (sessionStorage), the same rule as the MLB bracket's "Show series
// results": coming back after the next round never shows a pairing unasked.
//
// Only the rounds whose pairing depends on an earlier finals game are masked.
// The first week of each league's finals is seeded straight off the ladder
// (NRL Finals Week 1; AFL Wildcard Round and Qualifying Finals; CFL division
// semi-finals), so those cards stay as they are. An unknown round masks: a
// needless tap costs less than a spoiler.
//
// The US leagues joined on 2026-09-29 (Jacob, "hide"): a series is no different.
// ESPN listed the Division Series as "TBD @ LAD" during the Wild Card round and
// fills each winner in the moment a series ends, so an ALDS/NLDS card names who
// won the Wild Card round. MLB shows its Wild Card round, the NBA and NHL their
// first round, the NFL its Wild Card weekend; every later round masks. The NBA
// first round still follows the play-in (the 7 and 8 seeds), a known gap; the
// play-in's own "8th Seed Game" masks.

import { useCallback, useSyncExternalStore } from "react";
import type { Game, Sport } from "@/lib/types";

// Rounds that are safe to show, per league. Anything else in that league's
// finals masks. Labels come from parseGame (NRL_FINALS_WEEKS, the AFL note
// abbreviations, ESPN's notes headline for the US leagues) and the /api/cfl
// worker (theScore's game_description). US headlines read 2026-09-29:
// "NLWC - Game 3 If Necessary", "East 1st Round - Game 2", "NFC Wild Card
// Playoffs", "NBA Play-In - East - 7th Place vs 8th Place". The NBA and NHL
// Finals carry no note at all, so they mask as an unknown round.
const LADDER_SEEDED_ROUND: Partial<Record<Sport, RegExp>> = {
  nrl: /^finals week 1$/i,
  afl: /^(wildcard round|qualifying final)$/i,
  cfl: /\bsemi-?final\b/i,
  mlb: /^(?:AL|NL)WC\b|\bwild ?card\b/i,
  nba: /\b(?:1st|first) round\b|\bplace vs\b/i,
  nhl: /\b(?:1st|first) round\b/i,
  // The Pro Bowl is filed as postseason too; it is AFC v NFC, not a pairing.
  nfl: /\bwild ?card\b|\bpro bowl\b/i,
};

export function pairingSpoilsEarlierRound(game: Pick<Game, "sport" | "isPlayoff" | "playoffLabel">): boolean {
  const seeded = LADDER_SEEDED_ROUND[game.sport];
  if (!seeded || !game.isPlayoff) return false;
  return !seeded.test(game.playoffLabel ?? "");
}

// --- per-visit reveal store -------------------------------------------------
const KEY = "hs:pairing-revealed";
const listeners = new Set<() => void>();
// Private-mode Safari can throw on sessionStorage; keep the tap for this page.
let memoryFallback = "";

function readRevealed(): string {
  try { return window.sessionStorage.getItem(KEY) ?? ""; } catch { return memoryFallback; }
}

// "Show all teams" (Jacob 9/30) opens a whole column's covered cards in one
// tap: one storage write and one listener pass, so the column re-renders once.
export function revealPairings(gameIds: string[]): void {
  const ids = new Set(readRevealed().split(",").filter(Boolean));
  for (const id of gameIds) ids.add(id);
  const next = [...ids].join(",");
  memoryFallback = next;
  try { window.sessionStorage.setItem(KEY, next); } catch { /* memoryFallback holds it */ }
  for (const l of listeners) l();
}

export function revealPairing(gameId: string): void {
  revealPairings([gameId]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// The server snapshot is "" (nothing revealed), so the prerendered board masks
// every such card and a masked card never shows its teams, even for a frame.
export function usePairingHidden(game: Game): { hidden: boolean; reveal: () => void } {
  const spoils = pairingSpoilsEarlierRound(game);
  const revealed = useSyncExternalStore(subscribe, readRevealed, () => "");
  const reveal = useCallback(() => revealPairing(game.id), [game.id]);
  return { hidden: spoils && !revealed.split(",").includes(game.id), reveal };
}

// The ids of the games in `games` that still show a cover, for the column's
// "Show all teams" control (Jacob 9/30). Same store and server snapshot as
// usePairingHidden, so the prerendered column lists every covered card.
export function useHiddenPairingIds(games: Game[]): string[] {
  const revealed = useSyncExternalStore(subscribe, readRevealed, () => "");
  const open = new Set(revealed.split(","));
  const ids = new Set<string>();
  for (const g of games) if (pairingSpoilsEarlierRound(g) && !open.has(g.id)) ids.add(g.id);
  return [...ids];
}
