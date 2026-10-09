"use client";

import { useEffect, useState } from "react";
import type { Game } from "./types";
import {
  getListenPrefs,
  listenLinks,
  loadRadioTable,
  loadWhere,
  mayHaveListen,
  type ListenResult,
  type RadioTable,
  type Where,
} from "./radio";

const NONE: ListenResult = { free: [], paid: null };

// The Listen links for one game card or detail sheet. Fetches the station
// table and the visitor's location only for a game that can have them (a
// supported league, or an ESPN radio row, and not final) and only while the
// Settings toggle is on. Both loads are shared and cached in lib/radio.ts.
export function useListenLinks(game: Pick<Game, "sport" | "state" | "homeTeam" | "awayTeam" | "radio">): ListenResult {
  const prefs = getListenPrefs();
  const wanted = prefs.showListenLinks !== false && mayHaveListen(game);
  const [data, setData] = useState<{ table: RadioTable | null; where: Where } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    Promise.all([loadRadioTable(), loadWhere()])
      .then(([table, where]) => { if (!cancelled) setData({ table, where }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wanted]);
  if (!wanted || !data) return NONE;
  return listenLinks(game, data.table, data.where, prefs);
}
