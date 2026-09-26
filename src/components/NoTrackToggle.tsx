"use client";

import { useEffect, useState } from "react";
import DocTopBar from "@/components/DocTopBar";

const KEY = "umami.disabled";
// GoatCounter's own opt-out flag: its count.js skips the beacon while this is
// "t". Set it with KEY so the toggle stops both counters, not only Umami.
const GC_KEY = "skipgc";

export function NoTrackToggle() {
  const [disabled, setDisabled] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const off = window.localStorage.getItem(KEY) === "1";
        // Opted out before GC_KEY existed: carry the choice over to GoatCounter.
        if (off) window.localStorage.setItem(GC_KEY, "t");
        setDisabled(off);
      }
      catch { setDisabled(false); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function apply(next: boolean) {
    try {
      if (next) { window.localStorage.setItem(KEY, "1"); window.localStorage.setItem(GC_KEY, "t"); }
      else { window.localStorage.removeItem(KEY); window.localStorage.removeItem(GC_KEY); }
      setDisabled(next);
    } catch {
      // The write threw (private-mode / quota / storage disabled). Don't drop
      // back to `null`: that re-renders the whole page as the indefinite
      // "Checking…" placeholder with no button, stranding the user with no way
      // to retry short of a reload. Re-read the real persisted state instead —
      // the same recovery the initial load above uses — so the toggle stays
      // interactive and reflects whatever actually stuck (a failed setItem left
      // the prior value in place, so getItem still reports the honest state).
      try { setDisabled(window.localStorage.getItem(KEY) === "1"); }
      catch { setDisabled(false); }
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route="notrack" />
      <h1 className="text-2xl font-bold">Don&rsquo;t count my visits</h1>
      <p className="mt-3" style={{ color: "var(--text-muted)" }}>
        This turns off HideScore&rsquo;s usage stats in this browser. It stays off across network and VPN changes.
      </p>
      {/* The whole page is this one toggle, so its result must be announced:
          role="status" + aria-live make assistive tech read the new state
          ("Off — this browser is not counted.") when the button is pressed and
          when the initial "Checking…" resolves. Without it the text swaps
          silently and a screen-reader user gets no confirmation the toggle took
          (WCAG 4.1.3). Same status-region pattern WorldCupBracket already uses.
          The live region wraps ONLY the status text, not the toggle button:
          per the WAI-ARIA APG a live region shouldn't contain an interactive
          control, or the region re-announces the button's own new label as part
          of every status update (press "Stop counting my visits" → the region
          would read "Off — … Start counting again"). The button keeps its own
          accessible name and stays a sibling outside the region, so the state
          confirmation is announced cleanly on its own. */}
      <section className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div role="status" aria-live="polite">
          {disabled === null ? (
            <p>Checking&hellip;</p>
          ) : disabled ? (
            <p className="font-semibold">Off &mdash; this browser is not counted.</p>
          ) : (
            <p className="font-semibold">On &mdash; this browser is currently counted.</p>
          )}
        </div>
        {disabled !== null && (disabled ? (
          <button type="button" onClick={() => apply(false)} className="mt-4 rounded-full border px-4 py-2 font-semibold" style={{ borderColor: "var(--border)" }}>Start counting again</button>
        ) : (
          <button type="button" onClick={() => apply(true)} className="mt-4 rounded-full px-4 py-2 font-semibold text-white" style={{ background: "var(--accent)" }}>Stop counting my visits</button>
        ))}
      </section>
      <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>Repeat once in each browser. Clearing this site&rsquo;s browser data resets the choice.</p>
    </main>
  );
}
