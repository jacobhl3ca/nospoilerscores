"use client";

import { useState } from "react";
import { Game } from "@/lib/types";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  onPlayHighlight: (url: string) => void;
}

function TeamRow({
  team,
  isFavorite,
  onToggleFavorite,
}: {
  team: { id: string; abbreviation: string; shortDisplayName: string; logo: string; record: string };
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <img
        src={team.logo}
        alt={team.abbreviation}
        width={24}
        height={24}
        className="w-6 h-6 object-contain"
      />
      <span className="flex-1 text-sm flex items-center gap-1.5" style={{ color: "var(--text)" }}>
        {team.shortDisplayName}
        {team.record && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>({team.record})</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`text-xs transition-colors ${isFavorite ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
          style={isFavorite ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          ★
        </button>
      </span>
    </div>
  );
}

function RatingBadge({ rating, onClick }: { rating: number; onClick: () => void }) {
  let color = "bg-gray-500";
  let label = "OK";
  if (rating >= 85) {
    color = "bg-green-600";
    label = "GREAT";
  } else if (rating >= 70) {
    color = "bg-yellow-600";
    label = "GOOD";
  } else if (rating >= 50) {
    color = "bg-orange-600";
    label = "MEH";
  } else {
    color = "bg-red-700";
    label = "SKIP";
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase cursor-pointer hover:opacity-80 transition-opacity`}
      title="What does this mean?"
    >
      {label}
    </button>
  );
}

function RatingExplainer({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-base mb-3" style={{ color: "var(--text)" }}>Game Ratings</h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          Ratings reflect how competitive and exciting a game was — without spoiling the outcome. Higher ratings mean a closer, more intense game worth watching.
        </p>
        <div className="flex flex-col gap-1.5 text-sm mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white w-14 text-center">GREAT</span>
            <span style={{ color: "var(--text-secondary)" }}>Must-watch — down to the wire</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600 text-white w-14 text-center">GOOD</span>
            <span style={{ color: "var(--text-secondary)" }}>Competitive and entertaining</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white w-14 text-center">MEH</span>
            <span style={{ color: "var(--text-secondary)" }}>One-sided, but watchable</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-700 text-white w-14 text-center">SKIP</span>
            <span style={{ color: "var(--text-secondary)" }}>Blowout — skip unless your team</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function getYouTubeSearchUrl(game: Game): string {
  const date = new Date(game.date);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const query = `${game.awayTeam.shortDisplayName} vs ${game.homeTeam.shortDisplayName} highlights ${dateStr}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, onPlayHighlight }: GameCardProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const showRating = (game.state === "post" || game.state === "in") && game.rating !== null;
  const isFinished = game.state === "post";

  return (
    <>
      <div
        className="rounded-lg px-4 py-3 transition-colors"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>
            {game.state === "in" ? (
              <span className="text-green-500 font-medium">● LIVE</span>
            ) : game.state === "post" ? (
              "FINAL"
            ) : (
              game.statusDetail
            )}
          </span>
          <div className="flex items-center gap-2">
            {showRating && (
              <RatingBadge rating={game.rating!} onClick={() => setShowExplainer(true)} />
            )}
            {game.broadcasts.length > 0 && (
              <span style={{ color: "var(--text-muted)" }}>{game.broadcasts[0]}</span>
            )}
          </div>
        </div>

        {/* Teams */}
        <TeamRow
          team={game.awayTeam}
          isFavorite={favoriteTeams.includes(game.awayTeam.id)}
          onToggleFavorite={() => onToggleFavoriteTeam(game.awayTeam.id)}
        />
        <TeamRow
          team={game.homeTeam}
          isFavorite={favoriteTeams.includes(game.homeTeam.id)}
          onToggleFavorite={() => onToggleFavoriteTeam(game.homeTeam.id)}
        />

        {/* Highlight links for finished games */}
        {isFinished && (
          <div className="mt-2 flex gap-1.5">
            <a
              href={getYouTubeSearchUrl(game)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: "var(--bg-card-hover)",
                color: "var(--accent)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Highlights
            </a>
            {game.highlightUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); onPlayHighlight(game.highlightUrl!); }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: "var(--bg-card-hover)",
                  color: "var(--text-muted)",
                }}
                title="Play ESPN recap"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <polygon points="10,8 16,12 10,16" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {showExplainer && <RatingExplainer onClose={() => setShowExplainer(false)} />}
    </>
  );
}
