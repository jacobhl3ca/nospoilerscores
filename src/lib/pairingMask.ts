// Finals pairings that give away an earlier result (Jacob 2026-09-27, "hide").
//
// In a single-game knockout, the fixture for the next round names who won the
// round before: the NRL Grand Final card "Roosters vs Knights" is the result of
// both preliminary finals. The NRL, AFL and CFL landing pages promise the board
// "never lists who advanced", so a card for such a round shows its round, time
// and a "Show teams" button instead of the two clubs. A tap is remembered for
// that matchup (Jacob 2026-10-02, "show permanently whichever one is ticked"):
// every later visit and every later game of the same series opens it too. The
// next round is a new matchup, so it is covered again until tapped.
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
import { isPlaceholderTeam } from "./teamLogos";

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

// --- reveal store -------------------------------------------------------------
// A tap is kept per matchup in localStorage: "mlb:2026:10-19" opens every game
// of that series, on every visit, in every tab. Safe because no masked round
// lets the same two clubs meet again later in that postseason, so a stored pair
// never opens a later round. A card with a placeholder side ("TBD @ LAD") never
// gets a matchup key: a stored "TBD vs LAD" would open the next round's
// "TBD @ LAD" card and give away that LAD went through. Those taps keep the old
// rule, the game id in sessionStorage for this visit only. When ESPN fills the
// TBD side in, the key is new and the cover comes back, which is right: the
// club that was filled in is a new result.
const SESSION_KEY = "hs:pairing-revealed";
export const PAIRING_LOCAL_KEY = "hs:pairing-revealed-v2";
const listeners = new Set<() => void>();
// Private-mode Safari can throw on web storage; keep the taps for this page.
let sessionFallback = "";
let localFallback = "";
// Set once a localStorage write throws (quota, Safari cookie blocking) while
// reads still work; from then on this page reads the in-memory copy.
let localWriteFailed = false;

const ET_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" });
// NaN for a date that does not parse; Intl would throw on it mid-render.
function etYear(iso: string | number | Date): number {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NaN : Number(ET_YEAR.format(d));
}

// "mlb:2026:10-19": sport, the ET year of the game, the two raw team ids
// sorted so a home/away swap inside a series gives the same key. Null when a
// side is a placeholder or the date does not parse.
export function pairingKey(game: Pick<Game, "sport" | "date" | "homeTeam" | "awayTeam">): string | null {
  const ids: string[] = [];
  for (const t of [game.homeTeam, game.awayTeam]) {
    const raw = t.id.startsWith(`${game.sport}-`) ? t.id.slice(game.sport.length + 1) : t.id;
    if (!raw || isPlaceholderTeam(raw, t.displayName)) return null;
    ids.push(raw);
  }
  const year = etYear(game.date);
  if (!Number.isFinite(year)) return null;
  ids.sort();
  return `${game.sport}:${year}:${ids[0]}-${ids[1]}`;
}

function readSession(): string {
  try { return window.sessionStorage.getItem(SESSION_KEY) ?? ""; } catch { return sessionFallback; }
}

function readLocal(): string {
  if (localWriteFailed) return localFallback;
  try { return window.localStorage.getItem(PAIRING_LOCAL_KEY) ?? ""; } catch { return localFallback; }
}

// One string for useSyncExternalStore, so the snapshot compares by value.
function readRevealed(): string {
  return `${readLocal()}|${readSession()}`;
}

function notify(): void {
  for (const l of listeners) l();
}

function writeLocal(next: string): void {
  localFallback = next;
  try {
    if (next) window.localStorage.setItem(PAIRING_LOCAL_KEY, next);
    else window.localStorage.removeItem(PAIRING_LOCAL_KEY);
  } catch { localWriteFailed = true; }
}

// "Show all teams" (Jacob 9/30) opens a whole column's covered cards in one
// tap: one write per store and one listener pass, so the column re-renders
// once. Keys older than last year are dropped on write, so the list stays short.
export function revealPairings(games: Pick<Game, "id" | "sport" | "date" | "homeTeam" | "awayTeam">[]): void {
  const minYear = etYear(Date.now()) - 1;
  const keys = new Set(readLocal().split(",").filter((k) => Number(k.split(":")[1]) >= minYear));
  const ids = new Set(readSession().split(",").filter(Boolean));
  let sessionChanged = false;
  for (const g of games) {
    const key = pairingKey(g);
    if (key) keys.add(key);
    else { ids.add(g.id); sessionChanged = true; }
  }
  writeLocal([...keys].join(","));
  if (sessionChanged) {
    const next = [...ids].join(",");
    sessionFallback = next;
    try { window.sessionStorage.setItem(SESSION_KEY, next); } catch { /* sessionFallback holds it */ }
  }
  notify();
}

export function revealPairing(game: Pick<Game, "id" | "sport" | "date" | "homeTeam" | "awayTeam">): void {
  revealPairings([game]);
}

// Settings "Reset all" covers every remembered matchup again and hands back
// the old list for its 15 s undo. The undo merges, so a tap made inside the
// window survives it.
export function clearRememberedPairings(): string {
  const prev = readLocal();
  writeLocal("");
  notify();
  return prev;
}

export function restoreRememberedPairings(prev: string): void {
  const keys = new Set([...readLocal().split(","), ...prev.split(",")].filter(Boolean));
  writeLocal([...keys].join(","));
  notify();
}

// A reveal in one tab opens the same matchup in every other open tab.
function onStorage(e: StorageEvent): void {
  if (e.key === null || e.key === PAIRING_LOCAL_KEY) notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function isOpen(revealed: string, game: Game): boolean {
  const [local, session] = revealed.split("|");
  const key = pairingKey(game);
  if (key && local.split(",").includes(key)) return true;
  return (session ?? "").split(",").includes(game.id);
}

// The server snapshot is "|" (nothing revealed), so the prerendered board masks
// every such card and a masked card never shows its teams, even for a frame.
// A stored reveal opens after hydration: cover to teams, never the reverse.
export function usePairingHidden(game: Game): { hidden: boolean; reveal: () => void } {
  const spoils = pairingSpoilsEarlierRound(game);
  const revealed = useSyncExternalStore(subscribe, readRevealed, () => "|");
  const reveal = useCallback(() => revealPairing(game), [game]);
  return { hidden: spoils && !isOpen(revealed, game), reveal };
}

// The games in `games` that still show a cover, for the column's "Show all
// teams" control (Jacob 9/30). Same store and server snapshot as
// usePairingHidden, so the prerendered column lists every covered card.
export function useHiddenPairingGames(games: Game[]): Game[] {
  const revealed = useSyncExternalStore(subscribe, readRevealed, () => "|");
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const g of games) {
    if (seen.has(g.id) || !pairingSpoilsEarlierRound(g) || isOpen(revealed, g)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}
