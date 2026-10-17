"use client";

import { useEffect, useRef } from "react";

// The main action of a score or event card, as its own button (2026-10-15 axe
// scan, nested-interactive). The card used to be a div role="button" that held
// the favourite star, network links and highlight buttons, so a screen reader
// met buttons inside a button. Now the card is a named group and this empty
// button is stretched over it (globals.css, .ns-card-hit): its click bubbles to
// the card's own onClick, so tap and keyboard behaviour are unchanged. It is the
// card's first child, so Tab still reaches the card before the controls in it.
// `labelledBy` is the card's id: the button takes the card's aria-label
// ("Bills at Rams — game details") as its name.
export default function CardHit({ labelledBy }: { labelledBy: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  // A tap on the card's text can land on a positioned wrapper above this
  // button. Focus the button anyway, as the old div[tabindex] took focus on
  // any tap, so the details sheet hands focus back to the card when it closes.
  // Taps on the card's own controls keep their focus.
  useEffect(() => {
    const button = ref.current;
    const card = button?.parentElement;
    if (!button || !card) return;
    const onClick = (e: MouseEvent) => {
      const control = (e.target as Element).closest("a[href], button, input, select, textarea, [role='button'], [tabindex]");
      if (!control || control === button || !card.contains(control)) button.focus({ preventScroll: true });
    };
    card.addEventListener("click", onClick);
    return () => card.removeEventListener("click", onClick);
  }, []);
  return <button ref={ref} type="button" className="ns-card-hit" aria-labelledby={labelledBy} />;
}
