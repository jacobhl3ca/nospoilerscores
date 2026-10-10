"use client";

import { useEffect, useRef } from "react";
import { isChord, isTypingTarget, routeNewsListKey, type NewsListKeyAction } from "./modalArrowKeys";

// The News list's keys (Jacob 10/7): H Headlines, M Media, E Hide seen, ? the
// Keys card. routeNewsListKey (modalArrowKeys.ts) decides; this only listens.
//
// `active` is the host's half of the gate: the News view is up and none of
// its own overlays (post modal, Settings, a game, the filter popover) is
// open. The DOM half catches any other modal dialog or open menu, so a key
// meant for it never flips a chip behind it.
export function useNewsListKeys(active: boolean, run: (action: NewsListKeyAction) => void) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const covered = !!document.querySelector('[aria-modal="true"], [role="menu"]');
      const action = routeNewsListKey({
        key: e.key,
        chord: isChord(e),
        repeat: e.repeat,
        inTextEntry: isTypingTarget(e.target as HTMLElement | null),
        active: !covered,
      });
      if (!action) return;
      e.preventDefault();
      runRef.current(action);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
