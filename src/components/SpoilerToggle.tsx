"use client";

interface SpoilerToggleProps {
  spoilerFree: boolean;
  onToggle: () => void;
}

export default function SpoilerToggle({ spoilerFree, onToggle }: SpoilerToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
        spoilerFree
          ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
          : "bg-white/5 text-gray-400 border border-white/10 hover:text-white"
      }`}
    >
      <span className="text-base">{spoilerFree ? "🙈" : "👀"}</span>
      {spoilerFree ? "Spoiler-Free" : "Scores Visible"}
    </button>
  );
}
