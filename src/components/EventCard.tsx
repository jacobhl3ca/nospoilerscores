"use client";

import { useState } from "react";
import { LeagueEventCard } from "@/lib/types";
import { fetchFirstVideoId } from "@/lib/youtube";

// Spoiler-safe single-event tile for F1 (a Grand Prix weekend) and UFC (a fight
// card) — the non-two-team analog to GolfLeaderboard. Shows WHAT + WHEN +
// WHERE-to-watch and never the result (finishing order / fight outcome). Once
// the event is over, a Highlights button plays the official recap in the same
// masked in-app player the rest of the app uses.
export default function EventCard({
  event,
  onPlayHighlight,
}: {
  event: LeagueEventCard;
  leagueLabel?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const isLive = event.state === "in";
  const isPost = event.state === "post";
  const icon = event.kind === "f1" ? "🏁" : "🥊";

  const when = (() => {
    const d = new Date(event.date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  })();

  const playHighlights = async () => {
    const q = event.highlightQuery ?? `${event.title} highlights`;
    const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    if (!onPlayHighlight) { window.open(fallback, "_blank", "noopener"); return; }
    setLoading(true);
    const id = await fetchFirstVideoId(q, event.officialChannel);
    setLoading(false);
    if (id) onPlayHighlight(id, fallback);
    else window.open(fallback, "_blank", "noopener");
  };

  return (
    <div
      className="rounded-lg px-3 py-3 sm:px-4 transition-colors relative"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Status row: state on the left, broadcast on the right */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"
          style={{ color: isLive ? "var(--live, #16a34a)" : "var(--text-muted)" }}
        >
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {event.statusDetail}
        </span>
        {event.broadcasts.length > 0 && (
          <span className="text-[10px] sm:text-[11px] truncate shrink-0" style={{ color: "var(--text-muted)" }}>
            {event.broadcasts.slice(0, 2).join(" · ")}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>
            {event.title}
          </div>
          {event.subtitle && (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }} title={event.subtitle}>
              {event.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Headline (UFC main event) + when */}
      <div className="mt-2 flex flex-col gap-0.5">
        {event.headline && (
          <div className="text-xs" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>Main event · </span>
            {event.headline}
            {event.boutCount ? <span style={{ color: "var(--text-muted)" }}> · {event.boutCount} bouts</span> : null}
          </div>
        )}
        {when && (
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{when}</div>
        )}
      </div>

      {/* Highlights — only once the event is over (spoiler-safe in the masked player) */}
      {isPost && (
        <button
          type="button"
          onClick={playHighlights}
          disabled={loading}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md cursor-pointer transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--accent)" }}
        >
          <span aria-hidden>▶</span> {loading ? "Finding…" : "Highlights"}
        </button>
      )}
    </div>
  );
}
