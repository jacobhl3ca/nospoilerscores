"use client";

import { useEffect, useState } from "react";
import type { Game, LeagueEventCard, Sport } from "./types";
import {
  FEED_SPORTS,
  eventListenLinks,
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

// The station table and the visitor's location, loaded only when `wanted`.
// Both loads are shared and cached in lib/radio.ts.
function useRadioData(wanted: boolean): { table: RadioTable | null; where: Where } | null {
  const [data, setData] = useState<{ table: RadioTable | null; where: Where } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    Promise.all([loadRadioTable(), loadWhere()])
      .then(([table, where]) => { if (!cancelled) setData({ table, where }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wanted]);
  return wanted ? data : null;
}

// The Listen links for one game card or detail sheet. Fetches the station
// table and the visitor's location only for a game that can have them (a
// supported league, or an ESPN radio row, and not final) and only while the
// Settings toggle is on.
export function useListenLinks(
  game: Pick<Game, "sport" | "state" | "homeTeam" | "awayTeam" | "radio"> & Partial<Pick<Game, "venue" | "seriesNote">>,
): ListenResult {
  const prefs = getListenPrefs();
  const data = useRadioData(prefs.showListenLinks !== false && mayHaveListen(game));
  if (!data) return NONE;
  return listenLinks(game, data.table, data.where, prefs);
}

// The same for an event tile's detail sheet (races, slams, majors). `sport`
// is undefined when the caller does not know it: then only an ESPN radio row
// can bring links.
export function useEventListenLinks(
  sport: Sport | undefined,
  event: Pick<LeagueEventCard, "state" | "title" | "subtitle" | "radio">,
): ListenResult {
  const prefs = getListenPrefs();
  const wanted = prefs.showListenLinks !== false && event.state !== "post"
    && ((!!sport && FEED_SPORTS.has(sport)) || !!event.radio?.length);
  const data = useRadioData(wanted);
  if (!data || !sport) return NONE;
  return eventListenLinks(sport, event, data.table, data.where, prefs);
}
