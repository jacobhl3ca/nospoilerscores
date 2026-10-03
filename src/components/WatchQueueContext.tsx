"use client";

import { createContext, useContext } from "react";
import type { Game } from "@/lib/types";

// Lets every GameCard on the board read and flip its "Later" state without
// threading two more props through LeagueColumn's eight card call sites.
// Null (no provider — team pages, previews) means no pill.
export interface WatchQueueApi {
  isQueued: (game: Game) => boolean;
  toggle: (game: Game) => void;
}

export const WatchQueueContext = createContext<WatchQueueApi | null>(null);

export function useWatchQueue(): WatchQueueApi | null {
  return useContext(WatchQueueContext);
}
