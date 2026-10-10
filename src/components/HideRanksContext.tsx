"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { PREFS_STORAGE_KEY } from "@/lib/preferences";

// Settings' "Show team ranks and seeds" (Jacob 9/30): when off, the "#8" chip
// next to a team name and the seed number in a bracket or playoff table are
// not drawn. HomeContent provides the live pref, so every card and modal on
// the board follows a toggle at once. Null (no provider — the standalone
// playoff pages) falls back to the saved prefs blob, so a reader who hid
// seeds does not meet them again on /mlb-playoff-bracket.
export const HideRanksContext = createContext<boolean | null>(null);

function subscribeStored(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    return !!(raw && JSON.parse(raw)?.hideRanks);
  } catch {
    return false;
  }
}

export function useHideRanks(): boolean {
  const provided = useContext(HideRanksContext);
  const stored = useSyncExternalStore(subscribeStored, readStored, () => false);
  return provided ?? stored;
}
