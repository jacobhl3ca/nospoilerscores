"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// News toolbar behaviour (Jacob 10/8 r4: at ~575px the pills wrapped to two
// rows and the sticky chrome took the screen).

// Scrolled down more than this, the pill row slides up; any scroll up, or
// being this close to the page top, brings it back.
const HIDE_AFTER_PX = 24;

// Hide-on-scroll state for the sticky pill row. `reveal` brings it back (a
// keyboard user tabbing into the hidden row).
export function useHideOnScroll(enabled: boolean): { hidden: boolean; reveal: () => void } {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let last = window.scrollY;
    let down = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const d = y - last;
      last = y;
      if (y <= HIDE_AFTER_PX || d < 0) {
        down = 0;
        setHidden(false);
      } else if (d > 0) {
        down += d;
        if (down > HIDE_AFTER_PX) setHidden(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      setHidden(false);
    };
  }, [enabled]);
  const reveal = useCallback(() => setHidden(false), []);
  return { hidden, reveal };
}

// One-row fit: `compact` (icon-only pills) turns on when the row with labels
// is wider than the space it has, and off again once that full width fits.
// `scrollerRef` = the overflow-x box, `rowRef` = its w-max content. `pillsKey`
// changes when the set of pills changes, which forces a fresh measure.
// `reserve` = px kept free beside the row (the Reddit bar's label).
export function useToolbarFit(pillsKey: string, reserve = 0) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const fullWidth = useRef(0);
  const [compact, setCompact] = useState(false);

  const check = useCallback(() => {
    const scroller = scrollerRef.current;
    const row = rowRef.current;
    if (!scroller || !row) return;
    const cs = getComputedStyle(scroller);
    const room = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - reserve;
    setCompact((was) => {
      if (!was) {
        fullWidth.current = row.offsetWidth;
        return fullWidth.current > room + 0.5;
      }
      return !(fullWidth.current > 0 && fullWidth.current <= room + 0.5);
    });
  }, [reserve]);

  // A new pill set: render it with labels first so check() measures it.
  // Layout effects run before paint, so the labelled pass never shows.
  const [measuredKey, setMeasuredKey] = useState(pillsKey);
  if (measuredKey !== pillsKey) {
    setMeasuredKey(pillsKey);
    setCompact(false);
  }
  useLayoutEffect(check);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [check, pillsKey]);

  return { scrollerRef, rowRef, compact };
}
