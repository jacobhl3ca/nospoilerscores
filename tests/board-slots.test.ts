import assert from "node:assert/strict";
import test from "node:test";

import { closeHiddenPins, closeUnseenAutoSlots, lockBoardForRemoval, lockSlotsToBoard, restoreHiddenPins, swapBoardSlots, type SlotPref } from "../src/lib/boardSlots.ts";
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

// Jacob 10/8: a column removed on a 3-column screen came back in fullscreen,
// because slots 4-5 stayed on Auto. A narrow edit now closes them.
test("an edit on a 3-column board closes the Auto slots it does not show", () => {
  const locked = lockSlotsToBoard([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "nhl"], [], 3);
  assert.deepEqual(locked, ["mlb", "nfl", "nhl", "empty", "empty"]);
});

test("an unseen slot the user pinned keeps its pin", () => {
  const locked = lockSlotsToBoard(["mlb", undefined, undefined, "nba", undefined], ["mlb", "nfl", "nhl"], [], 3);
  assert.deepEqual(locked, ["mlb", "nfl", "nhl", "nba", "empty"]);
});

test("without `visible` every Auto slot locks or stays Auto as before", () => {
  const locked = lockSlotsToBoard([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "nhl"]);
  assert.deepEqual(locked, ["mlb", "nfl", "nhl", undefined, undefined]);
});

test("a narrow drag closes the unseen Auto slots too", () => {
  const next = swapBoardSlots([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "nhl"], 0, 1, 3);
  assert.deepEqual(next, ["nfl", "mlb", "nhl", "empty", "empty"]);
});

test("a wide edit locks all five shown columns", () => {
  const locked = lockSlotsToBoard([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "nhl", "epl", "ncaaf"], [], 5);
  assert.deepEqual(locked, ["mlb", "nfl", "nhl", "epl", "ncaaf"]);
});

test("closeHiddenPins closes only pins on hidden leagues", () => {
  assert.deepEqual(
    closeHiddenPins(["f1", "mlb", undefined, "empty", "best"], ["f1", "best"]),
    ["empty", "mlb", undefined, "empty", "empty"],
  );
  assert.deepEqual(closeHiddenPins(["f1", undefined, undefined, undefined, undefined], []), ["f1", undefined, undefined, undefined, undefined]);
});

test("restoreHiddenPins puts back a closed pin the edit did not touch", () => {
  const saved: SlotPref[] = ["f1", "mlb", undefined, undefined, undefined];
  const next: SlotPref[] = ["empty", "nba", "nhl", "empty", "empty"];
  assert.deepEqual(restoreHiddenPins(next, saved), ["f1", "nba", "nhl", "empty", "empty"]);
  // The slot the edit itself set to "empty" stays empty.
  assert.deepEqual(restoreHiddenPins(next, saved, [0]), next);
});

test("restoreHiddenPins keeps a league's old closed pin closed when the edit places it again", () => {
  // Slot 3 was NHL, NHL was removed; the user now adds NHL to slot 2.
  const saved: SlotPref[] = ["mlb", "empty", "nhl", "empty", "empty"];
  const next: SlotPref[] = ["mlb", "nhl", "empty", "empty", "empty"];
  assert.deepEqual(restoreHiddenPins(next, saved, [1], "nhl"), next);
});

test("removing a shown Auto league locks its column to it, and the rest", () => {
  const locked = lockBoardForRemoval([undefined, undefined, undefined, undefined, undefined], ["mlb", "nfl", "nhl"], ["nhl"], 3);
  assert.deepEqual(locked, ["mlb", "nfl", "nhl", "empty", "empty"]);
  // Then closeHiddenPins closes it once NHL is hidden.
  assert.deepEqual(closeHiddenPins(locked!, ["nhl"]), ["mlb", "nfl", "empty", "empty", "empty"]);
});

test("removing an Auto Best of yesterday locks it to best so it closes", () => {
  const locked = lockBoardForRemoval(["mlb", undefined, undefined, undefined, undefined], ["mlb", "nfl", "best"], ["best"], 3);
  assert.deepEqual(locked, ["mlb", "nfl", "best", "empty", "empty"]);
});

test("removing a league no column shows changes no slot", () => {
  assert.equal(lockBoardForRemoval([undefined, "empty", undefined, undefined, undefined], ["mlb", "nhl"], ["nfl"], 3), null);
  // The walk skips an empty slot: slot 3 shows the second column.
  assert.deepEqual(lockBoardForRemoval([undefined, "empty", undefined, undefined, undefined], ["mlb", "nhl"], ["nhl"], 3), ["mlb", "empty", "nhl", "empty", "empty"]);
});

test("closeUnseenAutoSlots closes slots 4-5 on a shaped board once", () => {
  const shaped = { firstLeague: "mlb" as const, secondLeague: "empty" as const, thirdLeague: "empty" as const };
  assert.deepEqual(closeUnseenAutoSlots(shaped), { ...shaped, fourthLeague: "empty", fifthLeague: "empty", wideSlotsVersion: 1 });
});

test("closeUnseenAutoSlots leaves a fresh all-Auto board automatic", () => {
  assert.deepEqual(closeUnseenAutoSlots({}), { wideSlotsVersion: 1 });
});

test("closeUnseenAutoSlots leaves a stamped board alone", () => {
  const p = { firstLeague: "mlb" as const, wideSlotsVersion: 1 as const };
  assert.equal(closeUnseenAutoSlots(p), p);
});

test("closeUnseenAutoSlots leaves a board with slot 4 or 5 set alone", () => {
  const p = { firstLeague: "mlb" as const, fourthLeague: "nba" as const };
  assert.deepEqual(closeUnseenAutoSlots(p), { ...p, wideSlotsVersion: 1 });
});
