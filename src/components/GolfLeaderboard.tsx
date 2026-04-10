"use client";

import { useState } from "react";
import { GolfTournament } from "@/lib/types";

interface GolfLeaderboardProps {
  tournament: GolfTournament;
  showRatings: boolean;
}

const INITIAL_SHOW = 10;
const EXPAND_SHOW = 25;

export default function GolfLeaderboard({ tournament, showRatings }: GolfLeaderboardProps) {
  const [expanded, setExpanded] = useState(false);
  const players = tournament.players;
  const visible = expanded ? players.slice(0, EXPAND_SHOW) : players.slice(0, INITIAL_SHOW);
  const hasMore = players.length > (expanded ? EXPAND_SHOW : INITIAL_SHOW);

  // Group players by position for tied display
  const formatPosition = (pos: number, idx: number) => {
    // Check if previous player has same position (tied)
    if (idx > 0 && players[idx - 1]?.position === pos) {
      return ""; // don't repeat "T3" for every tied player
    }
    // Check if next player has same position (mark as tie)
    const isTied = idx < players.length - 1 && players[idx + 1]?.position === pos;
    if (isTied) return `T${pos}`;
    return String(pos);
  };

  const scoreColor = (score: string) => {
    if (score === "E") return "var(--text-muted)";
    if (score.startsWith("-")) return "#22c55e"; // green
    if (score.startsWith("+")) return "#ef4444"; // red
    return "var(--text)";
  };

  return (
    <div
      className="rounded-lg px-2 sm:px-3 py-2 sm:py-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {/* Status */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] sm:text-xs" style={{ color: tournament.state === "in" ? "#22c55e" : "var(--text-muted)" }}>
          {tournament.statusDetail}
        </span>
        {tournament.players.length > 0 && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {tournament.players.length} players
          </span>
        )}
      </div>

      {/* Leaderboard rows */}
      <div className="flex flex-col">
        {visible.map((player, idx) => {
          const globalIdx = idx; // index in full players array
          const posStr = formatPosition(player.position, globalIdx);
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
                  className="w-3 h-3 sm:w-3.5 sm:h-3.5 object-contain flex-shrink-0"
                />
              )}

              {/* Name */}
              <span
                className="text-[11px] sm:text-xs truncate flex-1 min-w-0"
                style={{ color: "var(--text)" }}
              >
                {player.shortName}
              </span>

              {/* Thru (only during active rounds) */}
              {tournament.state === "in" && player.thru && player.thru !== "F" && (
                <span className="text-[9px] tabular-nums flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  {player.thru}
                </span>
              )}

              {/* Score */}
              <span
                className="text-[11px] sm:text-xs font-medium tabular-nums text-right flex-shrink-0"
                style={{ color: scoreColor(player.score), minWidth: "26px" }}
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
          {expanded ? "Show less" : `Top ${EXPAND_SHOW}`}
        </button>
      )}
    </div>
  );
}
