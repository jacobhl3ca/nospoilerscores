"use client";

import { useState } from "react";
import FeedbackBox from "@/components/FeedbackBox";
import RequestedBuildsList from "@/components/RequestedBuildsList";
import { useSupportLinks } from "@/components/SupportLine";
import { requestedBuildClaim } from "@/lib/requestedBuilds";

// The parts of /wall-of-fame that open the feedback form (2026-10-11): the
// "Suggest something" button (form with the kind pills) and each "This was me"
// link (form seeded with the row, no pills). One hidden-trigger FeedbackBox
// serves both. From Dec 15 the Ko-fi and Patreon links sit beside the button,
// through the same date gate as the footer's support line.
export default function WallOfFameRequests() {
  const [signal, setSignal] = useState(0);
  const [prefill, setPrefill] = useState("");
  const [kinds, setKinds] = useState(true);
  const support = useSupportLinks();

  const open = (text: string, withKinds: boolean) => {
    setPrefill(text);
    setKinds(withKinds);
    setSignal((n) => n + 1);
  };

  const muted = { color: "var(--text-muted)" };
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => open("", true)}
          className="rounded-lg px-3.5 py-1.5 text-sm font-semibold cursor-pointer hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event="wall-suggest"
        >
          Suggest something
        </button>
        {support.map((l) => (
          <a
            key={l.id}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-2 hover:opacity-80"
            style={muted}
            title={l.label}
            data-umami-event="support-click"
            data-umami-event-id={l.id}
            data-testid="wall-support-link"
          >
            {l.label.split(" (")[0]}
          </a>
        ))}
      </div>

      <h2 id="built" className="text-lg font-semibold mt-6 mb-4">Built from your requests</h2>
      <RequestedBuildsList onClaim={(r) => open(requestedBuildClaim(r), false)} />
      <p className="text-sm mt-4" style={muted}>
        Want your initials added or removed? Say so in a note.
      </p>

      {/* h-0: the box's own wrapper is an inline-flex with only a fixed modal
          in it, which would still add a line of height while the form is open. */}
      <div className="h-0">
        <FeedbackBox openSignal={signal} prefill={prefill} kinds={kinds} hideTrigger />
      </div>
    </>
  );
}
