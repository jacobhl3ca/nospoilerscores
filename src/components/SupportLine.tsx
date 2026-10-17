"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { activeSupportLinks, supportLinksVisible, type SupportLink } from "@/lib/supportLinks";

const noSubscribe = () => () => {};

// The links to show right now: none before the live date, in the native
// shells, or on the server. Shared with the wall of fame (10/11).
export function useSupportLinks(): SupportLink[] {
  const visible = useSyncExternalStore(noSubscribe, () => supportLinksVisible(), () => false);
  return visible ? activeSupportLinks() : [];
}

// "Support HideScore" line for the web footers. The server snapshot is false,
// so the static export never bakes it in; the browser decides at view time and
// the native shells never show it. See lib/supportLinks.ts for the date gate.
// 10/15: it also carries the one footer link to /sponsors, under the same
// gate, because the doc footer's link row is full at one line (WOF, 10/14).
// `here` = the current path, so /sponsors itself leaves the link out.
export default function SupportLine({ here }: { here?: string } = {}) {
  const links = useSupportLinks();
  if (links.length === 0) return null;

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
      {here !== "/sponsors" && (
        <>
          . See the{" "}
          <Link
            href="/sponsors"
            prefetch={false}
            className="underline underline-offset-2 hover:opacity-80"
            style={muted}
            data-testid="support-line-sponsors"
          >
            sponsors
          </Link>
          .
        </>
      )}
    </p>
  );
}
