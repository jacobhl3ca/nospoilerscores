"use client";

import { useEffect, useState } from "react";

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
    } catch { setDisabled(null); }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <h1 className="text-2xl font-bold">Don&rsquo;t count my visits</h1>
      <p className="mt-3" style={{ color: "var(--text-muted)" }}>
        This turns off HideScore&rsquo;s self-hosted traffic measurement in this browser. It stays off across network and VPN changes.
      </p>
      <section className="mt-6 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
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
