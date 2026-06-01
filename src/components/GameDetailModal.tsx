"use client";

import { useEffect } from "react";
import { Game } from "@/lib/types";
import { openExternal } from "@/lib/openExternal";

// Lightweight, SPOILER-SAFE game details popup. Shown when a score/ratings card
// is tapped. Never renders score, winner, or rating unless `showRatings` is on
// (the user has already opted into spoilers) — and even then only the rating
// badge, never the raw score line. Pre/live/final all use the same shell.
export default function GameDetailModal({
  game,
  showRatings,
  onClose,
}: {
  game: Game;
  showRatings: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isLive = game.state === "in";
  const isFinal = game.state === "post";
  const liveUrl = game.streamUrl;

  // Start time / status WITHOUT score. For live we say "In progress" rather
  // than the period/clock (the clock alone is fine, but keep it minimal +
  // spoiler-free — no score ever leaks here).
  const timeLabel = (() => {
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        });
      }
    } catch { /* fall through */ }
    return "";
  })();

  const statusLabel = isFinal ? "Final" : isLive ? "In progress" : "Upcoming";

  const TeamRow = ({ team }: { team: Game["homeTeam"] }) => (
    <div className="flex items-center gap-3 min-w-0">
      {team.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={team.logo} alt="" width={32} height={32} className="w-8 h-8 object-contain shrink-0" />
        : <span className="w-8 h-8 flex items-center justify-center rounded text-xs shrink-0" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>}
      <span className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>
        {team.displayName || team.shortDisplayName || team.abbreviation}
      </span>
      {/* W-L record is not a spoiler of THIS game — safe to show. */}
      {team.record ? (
        <span className="ml-auto text-xs tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{team.record}</span>
      ) : null}
    </div>
  );

  const ratingTier = (r: number) =>
    r >= 80 ? { label: "GREAT", bg: "bg-green-600" }
    : r >= 55 ? { label: "GOOD", bg: "bg-yellow-600" }
    : r >= 30 ? { label: "MEH", bg: "bg-orange-600" }
    : { label: "SKIP", bg: "bg-red-700" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Matchup — names + logos, NO score/winner */}
        <div className="flex flex-col gap-2 mb-4 pr-6">
          <TeamRow team={game.awayTeam} />
          <span className="text-[11px] uppercase tracking-wide pl-11" style={{ color: "var(--text-muted)" }}>at</span>
          <TeamRow team={game.homeTeam} />
        </div>

        {/* Status + time */}
        <div className="text-sm mb-1" style={{ color: "var(--text)" }}>
          <span className="font-medium">{statusLabel}</span>
          {timeLabel ? <span style={{ color: "var(--text-muted)" }}> · {timeLabel}</span> : null}
        </div>

        {/* Series / playoff label — already non-spoiler text (e.g. "West Finals · Game 7") */}
        {game.playoffLabel ? (
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{game.playoffLabel}</div>
        ) : null}

        {/* Venue */}
        {game.venue ? (
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{game.venue}</div>
        ) : null}

        {/* Broadcasts */}
        {game.broadcasts.length > 0 ? (
          <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            <span className="uppercase tracking-wide">Watch: </span>{game.broadcasts.join(" · ")}
          </div>
        ) : null}

        {/* Competitiveness rating — ONLY when the user already revealed ratings. */}
        {showRatings && game.rating !== null && (isFinal || isLive) ? (
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${ratingTier(game.rating).bg}`}>
              {ratingTier(game.rating).label}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>game rating</span>
          </div>
        ) : null}

        {/* Watch-live button for in-progress games with a stream link. */}
        {isLive && liveUrl ? (
          <button
            onClick={() => { openExternal(liveUrl); onClose(); }}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Watch live
          </button>
        ) : null}
      </div>
    </div>
  );
}
