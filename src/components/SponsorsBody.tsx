"use client";

import { useState, useSyncExternalStore } from "react";
import FeedbackBox from "@/components/FeedbackBox";
import { PATRONS, SPONSORS } from "@/lib/sponsors";
import { SUPPORT_LINKS, isNativePlatform, supportLiveOn } from "@/lib/supportLinks";

// The body of /sponsors (2026-10-15). Same date gate as the footer's support
// line (lib/supportLinks.ts), checked in the browser at view time, so the page
// opens on Dec 15 without a deploy. Before that it reads "Opens Dec 15." only.
// The native shells never show anything paid (App Store 3.1.1), and nothing in
// them links here.
// `liveAtBuild` is the server snapshot: the static export bakes the full body
// only when it was built on or after the live date, and the browser re-checks.

type Gate = "soon" | "live" | "native";

const noSubscribe = () => () => {};
const clientGate = (): Gate => (isNativePlatform() ? "native" : supportLiveOn() ? "live" : "soon");

export default function SponsorsBody({ liveAtBuild }: { liveAtBuild: boolean }) {
  const gate = useSyncExternalStore(noSubscribe, clientGate, () => (liveAtBuild ? "live" : "soon"));
  const [signal, setSignal] = useState(0);

  const muted = { color: "var(--text-muted)" };

  if (gate === "soon") {
    return (
      <section data-testid="sponsors-gate">
        <p>Opens Dec 15.</p>
      </section>
    );
  }
  if (gate === "native") {
    return (
      <section data-testid="sponsors-native">
        <p>HideScore is free.</p>
      </section>
    );
  }

  const patreon = SUPPORT_LINKS.find((l) => l.id === "patreon" && l.href !== "");

  return (
    <div data-testid="sponsors-body">
      <p className="mb-6">HideScore is free. Sponsors keep it that way.</p>

      <h2 className="text-lg font-semibold mt-6 mb-3">Sponsors</h2>
      {SPONSORS.length === 0 ? (
        <p style={muted}>No sponsors yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="sponsors-list">
          {SPONSORS.map((s) => (
            <li key={s.name} className="flex items-center gap-3">
              {s.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo} alt="" width={40} height={40} className="h-10 w-10 rounded object-contain" />
              )}
              <span className="min-w-0">
                <a
                  href={s.url}
                  target="_blank"
                  rel="sponsored noopener"
                  className="font-semibold underline underline-offset-2 hover:opacity-80"
                  data-umami-event="sponsor-click"
                >
                  {s.name}
                </a>{" "}
                <span className="kind-pill inline-flex rounded px-1.5 text-xs font-medium align-middle">Sponsor</span>
                <span className="block text-sm" style={muted}>{s.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-semibold mt-8 mb-3">Patrons</h2>
      {PATRONS.length === 0 ? (
        <p style={muted}>Be the first patron.</p>
      ) : (
        <p data-testid="patrons-list">{PATRONS.join(" · ")}</p>
      )}
      {patreon && (
        <p className="text-sm mt-2" style={muted}>
          Join on{" "}
          <a
            href={patreon.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
            style={muted}
            data-umami-event="support-click"
            data-umami-event-id="patreon"
            data-testid="sponsors-patreon"
          >
            Patreon
          </a>
          .
        </p>
      )}

      <h2 className="text-lg font-semibold mt-8 mb-3">Become a sponsor</h2>
      <button
        type="button"
        onClick={() => setSignal((n) => n + 1)}
        className="rounded-lg px-3.5 py-1.5 text-sm font-semibold cursor-pointer hover:opacity-90"
        style={{ background: "var(--accent)", color: "#fff" }}
        data-umami-event="sponsor-ask"
      >
        Become a sponsor
      </button>
      {/* h-0: same reason as the wall's box (WallOfFameRequests). */}
      <div className="h-0">
        <FeedbackBox openSignal={signal} prefill="Sponsor: " hideTrigger />
      </div>
    </div>
  );
}
