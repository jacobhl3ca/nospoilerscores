"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Floating controls on every doc page (rendered by DocTopBar), 2026-10-09.
// Jacob 9/28 on /contact (iPhone): the only way back to the board was the top
// "Open HideScore" button, so a reader at the end of a long page had to scroll
// all the way up. Two fixed controls at the bottom:
// - a ✕ pill, bottom centre: the same link as the top button;
// - a round arrow, bottom right: down near the top (scrolls to the end), up
//   further down (scrolls back to the top). Left out when the page is not
//   taller than 1.5 screens, where there is nothing to jump over. 10/15
//   (Jacob): a thin line arrow, the feedback form's send arrow at stroke 2,
//   replaced the solid ▲ / ▼ glyphs.
// Both sit inside the safe area and are hidden in print (globals.css). The
// doc page carries extra bottom padding so they never cover its last line.
const TOP_ZONE = 200;
const MIN_PAGE_SCREENS = 1.5;

type Dir = "down" | "up";

export default function DocFloatingControls({ route, href }: { route: string; href: string }) {
  // null = no arrow: on the server, and on a page too short to need one.
  const [dir, setDir] = useState<Dir | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const tall = document.documentElement.scrollHeight > window.innerHeight * MIN_PAGE_SCREENS;
      setDir(!tall ? null : window.scrollY < TOP_ZONE ? "down" : "up");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Client-rendered sections (team schedules, the feedback form) change
    // the page height after the first paint.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const jump = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = dir === "down" ? document.documentElement.scrollHeight : 0;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      <Link
        href={href}
        aria-label="Close and open HideScore"
        className="doc-float doc-float-close"
        data-umami-event={`doc-x-${route}`}
      >
        <span aria-hidden="true">✕</span>
      </Link>
      {dir ? (
        <button
          type="button"
          onClick={jump}
          aria-label={dir === "down" ? "Scroll to bottom" : "Scroll to top"}
          className="doc-float doc-float-arrow"
          data-dir={dir}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {dir === "down" ? (
              <>
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </>
            ) : (
              <>
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </>
            )}
          </svg>
        </button>
      ) : null}
    </>
  );
}
