"use client";

import { useEffect } from "react";

// Marks the document while the user is navigating by KEYBOARD, so a score or
// event card can show a focus ring for Tab and nothing at all for a tap.
//
// Those cards are divs with role="button" + tabIndex=0, and a div with a
// tabindex takes focus on MOUSEDOWN. `:focus-visible` on its own does not cover
// that: Safari paints its default ring on plain :focus, and Chromium actually
// MATCHES :focus-visible for a pointer click on a div — it only withholds the
// ring for natively clickable controls like <button>, which is why the app's
// real buttons (date-nav pills, view tabs, highlight buttons) have never needed
// this. Measured both ways on 9/4: after a synthetic click the card root
// reported `solid 2px` from the :focus-visible rule, not `none`.
//
// The result was a ring stuck around the card after an ordinary tap, including
// after the details sheet closed — "idk how a card can even get this blue
// highlight ... i think no highlight is better in general" (Jacob 9/4).
// Deleting the indicator outright would fail WCAG 2.4.7 for anyone tabbing the
// board, so gate it on actual keyboard navigation instead.
//
// Tab only: it is the key that MOVES focus. Arrow keys scroll, and arming the
// flag on them would put the ring back for a mouse user who nudged the page.
// Capture phase on both listeners, so a handler that stops propagation
// somewhere in the tree cannot hide the input from us.
export default function KeyboardNavFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Tab") root.dataset.kbdNav = "1"; };
    const onPointerDown = () => { delete root.dataset.kbdNav; };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      delete root.dataset.kbdNav;
    };
  }, []);
  return null;
}
