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
//
// `visible` is how many columns the board shows now (3, or 5 on a wide
// screen). An Auto slot past it is not on screen, so it closes ("empty")
// rather than staying Auto: otherwise a fullscreen window later fills it with
// a league the user never picked (Jacob 10/8). The + button reopens it.
export function lockSlotsToBoard(prefs: SlotPref[], displayed: Sport[], move: number[] = [], visible = prefs.length): SlotPref[] {
  let queueIdx = 0;
  return prefs.map((pref, i) => {
    if (pref === "empty") return "empty";
    if (i >= visible) return pref ?? "empty";
    const shown = displayed[queueIdx++];
    if (pref === undefined && shown === "best" && !move.includes(i)) return undefined;
    return pref ?? shown;
  });
}

// Drag-to-swap: dropping column A onto column B trades their positions (not
// splice/insertion — that shuffles the middle column too). Every Auto column
// is locked to what it shows first so the swap sticks; empty slots swap as
// "empty" so the gap moves with the drag.
export function swapBoardSlots(prefs: SlotPref[], displayed: Sport[], fromIdx: number, toIdx: number, visible = prefs.length): SlotPref[] {
  const next = lockSlotsToBoard(prefs, displayed, [fromIdx, toIdx], visible);
  [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
  return next;
}

// A column pinned to a league the user turned off in the switcher list closes
// (Jacob 10/8): fetchAllLeagues renders nothing for it, so every caller that
// walks the slots beside the rendered columns reads it as "empty" too.
export function closeHiddenPins(slots: SlotPref[], hidden: readonly Sport[]): SlotPref[] {
  return slots.map((pref) => (pref !== undefined && pref !== "empty" && hidden.includes(pref) ? "empty" : pref));
}

// Five slot prefs, in board order, as the prefs patch that saves them.
export function slotPrefsPatch(slots: SlotPref[]) {
  return {
    firstLeague: slots[0],
    secondLeague: slots[1],
    thirdLeague: slots[2],
    fourthLeague: slots[3],
    fifthLeague: slots[4],
  };
}

type SlotPrefs = {
  firstLeague?: Sport | "empty";
  secondLeague?: Sport | "empty";
  thirdLeague?: Sport | "empty";
  fourthLeague?: Sport | "empty";
  fifthLeague?: Sport | "empty";
  wideSlotsVersion?: 1;
};

// One-time repair for boards saved before lockSlotsToBoard took `visible`: a
// column edit on a 3-column screen locked slots 1-3 and left 4-5 on Auto, so
// fullscreen filled them with leagues the user never picked (Jacob 10/8). A
// board the user shaped (any of slots 1-3 set) with 4-5 both still Auto gets
// 4-5 closed; a fresh all-Auto board stays automatic. Stamps the marker either
// way. Cost: a deliberate Auto on 4-5 closes once; the + button reopens it.
export function closeUnseenAutoSlots<T extends SlotPrefs>(prefs: T): T {
  if (prefs.wideSlotsVersion === 1) return prefs;
  const shaped = [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague].some((s) => s !== undefined);
  const wideAuto = prefs.fourthLeague === undefined && prefs.fifthLeague === undefined;
  return shaped && wideAuto
    ? { ...prefs, fourthLeague: "empty", fifthLeague: "empty", wideSlotsVersion: 1 }
    : { ...prefs, wideSlotsVersion: 1 };
}

// A league leaving the switcher list while a column shows it (Jacob 10/8):
// every column locked to what it shows, the one(s) showing it included (an
// Auto Best of yesterday too, via `move`), so the removed league's column
// becomes a pin that closes (see closeHiddenPins) rather than an Auto column
// that takes the next league. Turning the league back on reopens
// it. null when no shown column holds one of `sports`.
export function lockBoardForRemoval(prefs: SlotPref[], displayed: Sport[], sports: readonly Sport[], visible: number): SlotPref[] | null {
  const move: number[] = [];
  let queueIdx = 0;
  prefs.slice(0, visible).forEach((pref, i) => {
    if (pref === "empty") return;
    const shown = displayed[queueIdx++];
    if (shown && sports.includes(shown)) move.push(i);
  });
  return move.length ? lockSlotsToBoard(prefs, displayed, move, visible) : null;
}

// After an edit computed from closeHiddenPins' view of the slots: put back
// each closed pin the edit did not touch, so turning that league back on
// still reopens its column. `skip` = the slots the edit set or moved itself.
// `placed` = the league the edit pins (and so turns back on): its old closed
// pins stay closed, or they would reopen as duplicate columns.
export function restoreHiddenPins(next: SlotPref[], saved: SlotPref[], skip: readonly number[] = [], placed?: SlotPref): SlotPref[] {
  return next.map((pref, i) => {
    const pin = saved[i];
    const restore = pref === "empty" && pin !== undefined && pin !== "empty" && pin !== placed && !skip.includes(i);
    return restore ? pin : pref;
  });
}
