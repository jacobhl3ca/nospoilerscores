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

import { useCallback, useSyncExternalStore } from "react";
import type { Game, Sport } from "@/lib/types";

// Rounds that are safe to show, per league. Anything else in that league's
// finals masks. Labels come from parseGame (NRL_FINALS_WEEKS, the AFL note
// abbreviations) and the /api/cfl worker (theScore's game_description).
const LADDER_SEEDED_ROUND: Partial<Record<Sport, RegExp>> = {
  nrl: /^finals week 1$/i,
  afl: /^(wildcard round|qualifying final)$/i,
  cfl: /\bsemi-?final\b/i,
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

export function revealPairing(gameId: string): void {
  const ids = new Set(readRevealed().split(",").filter(Boolean));
  ids.add(gameId);
  const next = [...ids].join(",");
  memoryFallback = next;
  try { window.sessionStorage.setItem(KEY, next); } catch { /* memoryFallback holds it */ }
  for (const l of listeners) l();
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
