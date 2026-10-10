"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Game } from "./types";
import { BASE_URL } from "./espn";
import { fetchNflPicture } from "./nflPlayoffPicture";
import { playoffRaceTagsOn, subscribePlayoffRacePrefs } from "./playoffRacePrefs";
import { isPlayoffRaceWeek, pickPlayoffRaceGames, playoffRaceGamesFromScoreboard } from "./nflPlayoffRace";

// The client side of the Playoff race tag (rules in lib/nflPlayoffRace): the
// Settings switch, and one shared fetch of the standings plus that week's NFL
// scoreboard. Every card of the week reads the same pick set.

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, { at: number; picks: Promise<Set<string>> }>();

async function loadPicks(week: number): Promise<Set<string>> {
  const picture = await fetchNflPicture();
  if (!picture?.season) return new Set();
  const url = `${BASE_URL}/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${picture.season}`;
  const r = await fetch(url);
  if (!r.ok) return new Set();
  return pickPlayoffRaceGames(playoffRaceGamesFromScoreboard(await r.json(), week), picture, week);
}

function picksForWeek(week: number): Promise<Set<string>> {
  const hit = cache.get(week);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.picks;
  const picks = loadPicks(week).catch(() => new Set<string>());
  cache.set(week, { at: Date.now(), picks });
  return picks;
}

/**
 * True when this card carries the Playoff race tag. `recordsShown` is the
 * card's own record gate (NFL records on, pre-game or live, not a past date).
 */
export function usePlayoffRaceTag(game: Pick<Game, "id" | "sport" | "state" | "weekNumber">, recordsShown: boolean): boolean {
  const on = useSyncExternalStore(subscribePlayoffRacePrefs, playoffRaceTagsOn, () => true);
  const week = game.weekNumber;
  const wanted = on && recordsShown && game.sport === "nfl" && game.state !== "post" && isPlayoffRaceWeek(week);
  const [picked, setPicked] = useState<{ week: number; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    picksForWeek(week).then((ids) => { if (!cancelled) setPicked({ week, ids }); });
    return () => { cancelled = true; };
  }, [wanted, week]);
  return wanted && picked?.week === week && picked.ids.has(game.id);
}
