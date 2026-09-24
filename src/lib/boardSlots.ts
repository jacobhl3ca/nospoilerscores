import type { Sport } from "./types";

// One board column's saved choice: a league, "empty" (hidden), or undefined
// (Auto).
export type SlotPref = Sport | "empty" | undefined;

// Each slot's pref with every Auto slot locked to the league it shows now, so
// a change to one column does not let the auto-picker reshuffle the others.
// `displayed` is the rendered columns in board order: a pinned slot's column IS
// its pref and an "empty" slot renders nothing, so the walk skips empties to
// stay aligned.
//
// An Auto slot showing Best of yesterday stays Auto: pinning it would carry
// the column past days it has nothing for, and Auto already brings it back
// tomorrow (fetchAllLeagues' bestAuto). `move` lists the slots the user is
// moving on purpose; those lock like any other column.
export function lockSlotsToBoard(prefs: SlotPref[], displayed: Sport[], move: number[] = []): SlotPref[] {
  let queueIdx = 0;
  return prefs.map((pref, i) => {
    if (pref === "empty") return "empty";
    const shown = displayed[queueIdx++];
    if (pref === undefined && shown === "best" && !move.includes(i)) return undefined;
    return pref ?? shown;
  });
}

// Drag-to-swap: dropping column A onto column B trades their positions (not
// splice/insertion — that shuffles the middle column too). Every Auto column
// is locked to what it shows first so the swap sticks; empty slots swap as
// "empty" so the gap moves with the drag.
export function swapBoardSlots(prefs: SlotPref[], displayed: Sport[], fromIdx: number, toIdx: number): SlotPref[] {
  const next = lockSlotsToBoard(prefs, displayed, [fromIdx, toIdx]);
  [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
  return next;
}
