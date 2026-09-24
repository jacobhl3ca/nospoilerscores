import assert from "node:assert/strict";
import test from "node:test";

import { lockSlotsToBoard, swapBoardSlots, type SlotPref } from "../src/lib/boardSlots.ts";
import type { Sport } from "../src/lib/types.ts";

// The board HomeContent's switcher and drag handlers see: five saved slot
// prefs (undefined = Auto) and the columns actually rendered, in order.

test("a drag of two other columns leaves an Auto Best of yesterday column on Auto", () => {
  // NFL and WNBA pinned, the last column on Auto and showing Best of yesterday.
  const prefs: SlotPref[] = ["nfl", "wnba", undefined, undefined, undefined];
  const shown: Sport[] = ["nfl", "wnba", "best"];
  const next = swapBoardSlots(prefs, shown, 0, 1);
  assert.deepEqual(next, ["wnba", "nfl", undefined, undefined, undefined]);
  // Locking it would have saved thirdLeague: "best" for good.
  assert.notEqual(next[2], "best");
});

test("an all-Auto board locks the dragged columns and keeps Best of yesterday on Auto", () => {
  const next = swapBoardSlots([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "best"], 0, 1);
  assert.deepEqual(next, ["nfl", "mlb", undefined, undefined, undefined]);
});

test("a wide board with a hidden slot stays aligned: the swap skips the gap", () => {
  // Slot 2 is hidden, so slot 3 shows the second column and slot 5 the fourth.
  const prefs: SlotPref[] = [undefined, "empty", undefined, undefined, undefined];
  const shown: Sport[] = ["mlb", "nfl", "ncaaf", "best"];
  assert.deepEqual(swapBoardSlots(prefs, shown, 0, 2), ["nfl", "empty", "mlb", "ncaaf", undefined]);
  // The gap moves with a drag onto it.
  assert.deepEqual(swapBoardSlots(prefs, shown, 0, 1), ["empty", "mlb", "nfl", "ncaaf", undefined]);
});

test("dragging the Best of yesterday column itself pins it where it lands", () => {
  // The user moved that column on purpose; Auto would put a league there.
  const next = swapBoardSlots(["nfl", "wnba", undefined, undefined, undefined], ["nfl", "wnba", "best"], 2, 0);
  assert.deepEqual(next, ["best", "wnba", "nfl", undefined, undefined]);
});

test("a switcher pick on another column locks the rest but not an Auto Best of yesterday", () => {
  const locked = lockSlotsToBoard([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "best"]);
  assert.deepEqual(locked, ["mlb", "nfl", undefined, undefined, undefined]);
});

test("a Best of yesterday the user pinned stays pinned", () => {
  const locked = lockSlotsToBoard(["mlb", undefined, "best", undefined, undefined], ["mlb", "nfl", "best"]);
  assert.deepEqual(locked, ["mlb", "nfl", "best", undefined, undefined]);
  assert.deepEqual(swapBoardSlots(["mlb", undefined, "best", undefined, undefined], ["mlb", "nfl", "best"], 0, 1), ["nfl", "mlb", "best", undefined, undefined]);
});
