"use client";

import { useSyncExternalStore } from "react";
import { activeSupportLinks, supportLinksVisible } from "@/lib/supportLinks";

const noSubscribe = () => () => {};

// "Support HideScore" line for the web footers. The server snapshot is false,
// so the static export never bakes it in; the browser decides at view time and
// the native shells never show it. See lib/supportLinks.ts for the date gate.
export default function SupportLine() {
  const visible = useSyncExternalStore(noSubscribe, () => supportLinksVisible(), () => false);

  const links = activeSupportLinks();
  if (!visible || links.length === 0) return null;

  const muted = { color: "var(--text-muted)" };
  return (
    <p className="mt-1 text-xs" style={muted} data-testid="support-line">
      <span aria-hidden="true">☕</span> HideScore is free and ad-free. Support it on{" "}
      {links.map((l, i) => (
        <span key={l.id}>
          {i > 0 && " · "}
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
            style={muted}
            title={l.label}
            data-umami-event="support-click"
            data-umami-event-id={l.id}
          >
            {l.label.split(" (")[0]}
          </a>
        </span>
      ))}
    </p>
  );
}
