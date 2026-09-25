"use client";

import { useEffect, useState } from "react";
import DocTopBar from "@/components/DocTopBar";

const KEY = "umami.disabled";

export function NoTrackToggle() {
  const [disabled, setDisabled] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setDisabled(window.localStorage.getItem(KEY) === "1"); }
      catch { setDisabled(false); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function apply(next: boolean) {
    try {
      if (next) window.localStorage.setItem(KEY, "1");
      else window.localStorage.removeItem(KEY);
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
        This turns off HideScore&rsquo;s self-hosted traffic measurement in this browser. It stays off across network and VPN changes.
      </p>
      {/* The whole page is this one toggle, so its result must be announced:
          role="status" + aria-live make assistive tech read the new state
          ("Off — this browser is not counted.") when the button is pressed and
          when the initial "Checking…" resolves. Without it the text swaps
          silently and a screen-reader user gets no confirmation the toggle took
          (WCAG 4.1.3). Same status-region pattern WorldCupBracket already uses. */}
      <section role="status" aria-live="polite" className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        {disabled === null ? <p>Checking&hellip;</p> : disabled ? (
          <><p className="font-semibold">Off &mdash; this browser is not counted.</p><button type="button" onClick={() => apply(false)} className="mt-4 rounded-full border px-4 py-2 font-semibold" style={{ borderColor: "var(--border)" }}>Start counting again</button></>
        ) : (
          <><p className="font-semibold">On &mdash; this browser is currently counted.</p><button type="button" onClick={() => apply(true)} className="mt-4 rounded-full px-4 py-2 font-semibold text-white" style={{ background: "var(--accent)" }}>Stop counting my visits</button></>
        )}
      </section>
      <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>Repeat once in each browser. Clearing this site&rsquo;s browser data resets the choice.</p>
    </main>
  );
}
