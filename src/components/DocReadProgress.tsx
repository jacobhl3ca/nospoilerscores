"use client";

import { useEffect, useRef } from "react";

// Reading-progress line across the top of the viewport on the doc pages
// (rendered by DocTopBar), 2026-09-25. Scales one fixed 3px element with a
// transform, so a scroll never re-renders React and never moves layout. One
// update per animation frame at most. Starts at scaleX(0) from CSS, so the
// server HTML paints nothing until the reader scrolls.
export default function DocReadProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="doc-progress" aria-hidden="true" />;
}
