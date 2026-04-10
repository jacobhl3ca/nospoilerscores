"use client";

import { useRef, useState, useEffect } from "react";
import { GolfTournament } from "@/lib/types";

interface GolfLeaderboardProps {
  tournament: GolfTournament;
  showRatings: boolean;
}

const INITIAL_SHOW = 10;
const EXPAND_SHOW = 25;

export default function GolfLeaderboard({ tournament, showRatings }: GolfLeaderboardProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [useShortNames, setUseShortNames] = useState(false);
  const players = tournament.players;
  const visible = expanded ? players.slice(0, EXPAND_SHOW) : players.slice(0, INITIAL_SHOW);

  // Measure if full names overflow — switch to short names if needed
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      // If container is narrow (< 180px), use short names
      setUseShortNames(el.clientWidth < 180);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Group players by position for tied display
  const formatPosition = (pos: number, idx: number) => {
    if (idx > 0 && players[idx - 1]?.position === pos) {
      return "";
    }
    const isTied = idx < players.length - 1 && players[idx + 1]?.position === pos;
    if (isTied) return `T${pos}`;
    return String(pos);
  };

  const scoreColor = (score: string) => {
    if (score === "E") return "var(--text-muted)";
    if (score.startsWith("-")) return "#22c55e";
    if (score.startsWith("+")) return "#ef4444";
    return "var(--text)";
  };

  return (
    <div
      ref={containerRef}
      className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status */}
      <div className="flex items-center justify-between mb-1 sm:mb-2">
        <span className="text-xs" style={{ color: tournament.state === "in" ? "#22c55e" : "var(--text-muted)" }}>
          {tournament.statusDetail}
        </span>
        {tournament.players.length > 0 && (
          <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>
            {tournament.players.length} players
          </span>
        )}
      </div>

      {/* Leaderboard rows */}
      <div className="flex flex-col">
        {visible.map((player, idx) => {
          const posStr = formatPosition(player.position, idx);
          const displayName = useShortNames
            ? player.shortName.split(". ").pop() ?? player.shortName
            : player.shortName;
          return (
            <div
              key={`${player.name}-${idx}`}
              className="flex items-center gap-1.5 py-[3px]"
              style={{
                borderBottom: idx < visible.length - 1 ? "1px solid var(--border)" : undefined,
              }}
            >
              {/* Position */}
              <span
                className="text-[10px] sm:text-xs tabular-nums text-right flex-shrink-0"
                style={{ color: "var(--text-muted)", width: "24px" }}
              >
                {posStr}
              </span>

              {/* Flag */}
              {player.flag && (
                <img
                  src={player.flag}
                  alt=""
                  className="w-4 h-4 sm:w-5 sm:h-5 object-contain flex-shrink-0"
                />
              )}

              {/* Name — matches GameCard team name sizes */}
              <span
                className="text-xs sm:text-sm truncate flex-1 min-w-0"
                style={{ color: "var(--text)" }}
              >
                {displayName}
              </span>

              {/* Thru (only during active rounds) */}
              {tournament.state === "in" && player.thru && player.thru !== "F" && (
                <span className="text-[10px] sm:text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  {player.thru}
                </span>
              )}

              {/* Score */}
              <span
                className="text-xs sm:text-sm font-medium tabular-nums text-right flex-shrink-0"
                style={{ color: scoreColor(player.score), minWidth: "28px" }}
              >
                {player.score}
              </span>
            </div>
          );
        })}
      </div>

      {/* Expand/collapse */}
      {(players.length > INITIAL_SHOW) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-[10px] sm:text-xs mt-1.5 py-1 rounded transition-colors cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          {expanded ? "Show less" : "Show top 25"}
        </button>
      )}
    </div>
  );
}
