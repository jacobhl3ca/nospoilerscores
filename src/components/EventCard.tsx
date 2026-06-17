"use client";

import { useState } from "react";
import { LeagueEventCard, FightBout } from "@/lib/types";
import { fetchFirstVideoId } from "@/lib/youtube";

// Spoiler-safe event rendering for F1 (one race tile) and UFC (a card PER
// bout). Never shows results (finishing order / fight outcome). Highlights
// surface once an event is over and play in the masked in-app player; if a
// rights-holder blocks embedding (e.g. Formula One Management), the modal
// falls back to its "Watch on YouTube" link.

function useHighlightPlayer(onPlayHighlight?: (videoId: string, fallbackUrl: string) => void) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const play = async (id: string, query: string, channel?: string) => {
    const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    if (!onPlayHighlight) { window.open(fallback, "_blank", "noopener"); return; }
    setLoadingId(id);
    const videoId = await fetchFirstVideoId(query, channel);
    setLoadingId(null);
    if (videoId) onPlayHighlight(videoId, fallback);
    else window.open(fallback, "_blank", "noopener");
  };
  return { loadingId, play };
}

function FighterRow({ f }: { f: FightBout["red"] }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {f.flag ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flag} alt={f.country ?? ""} title={f.country} width={20} height={20} className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm object-cover shrink-0" />
      ) : (
        <span className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
      )}
      <span className="text-xs sm:text-sm truncate" style={{ color: "var(--text)" }} title={f.name}>{f.name}</span>
      <span className="flex-1 min-w-0" />
      {f.record && (
        <span className="text-[10px] sm:text-xs tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{f.record}</span>
      )}
    </div>
  );
}

function FightCard({
  fight, label, broadcasts, loadingId, onPlay,
}: {
  fight: FightBout;
  label?: string;
  broadcasts: string[];
  loadingId: string | null;
  onPlay: (id: string, query: string, channel?: string) => void;
}) {
  const isLive = fight.state === "in";
  const isPost = fight.state === "post";
  return (
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {label && (
        <div className="mb-1 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
            {label}
          </span>
        </div>
      )}
      {/* Status bar — time/status left, broadcast right (matches GameCard) */}
      <div className="flex items-center justify-between gap-2 mb-1.5 h-[18px]">
        <span className="text-[10px] sm:text-[11px] font-medium flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {fight.statusDetail}
        </span>
        {broadcasts.length > 0 && (
          <span className="text-[10px] sm:text-[11px] truncate shrink-0" style={{ color: "var(--text-muted)" }}>{broadcasts[0]}</span>
        )}
      </div>
      <div className="flex flex-col gap-y-0.5">
        <FighterRow f={fight.red} />
        <FighterRow f={fight.blue} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="text-[10px] sm:text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{fight.weightClass}</span>
        {isPost && (
          <button
            type="button"
            onClick={() => onPlay(fight.id, fight.highlightQuery, "UFC")}
            disabled={loadingId === fight.id}
            className="text-[11px] sm:text-xs font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ color: "var(--accent)" }}
          >
            <span aria-hidden>▶</span> {loadingId === fight.id ? "Finding…" : "Highlights"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function EventCard({
  event,
  onPlayHighlight,
}: {
  event: LeagueEventCard;
  leagueLabel?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
}) {
  const { loadingId, play } = useHighlightPlayer(onPlayHighlight);

  // ── UFC: one card per bout, main event first ──
  if (event.kind === "ufc" && event.fights?.length) {
    return (
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {event.fights.map((f, i) => (
          <FightCard
            key={f.id}
            fight={f}
            label={i === 0 ? "Main Event" : i === 1 ? "Co-Main Event" : undefined}
            broadcasts={event.broadcasts}
            loadingId={loadingId}
            onPlay={play}
          />
        ))}
      </div>
    );
  }

  // ── F1: single race tile ──
  const isLive = event.state === "in";
  const isPost = event.state === "post";
  const when = (() => {
    const d = new Date(event.date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  })();

  return (
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {/* Status bar — status left, date right (matches the other cards' layout) */}
      <div className="flex items-center justify-between gap-2 mb-1.5 h-[18px]">
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {event.statusDetail}
        </span>
        {when && <span className="text-[10px] sm:text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{when}</span>}
      </div>
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none mt-0.5">🏁</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs sm:text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>{event.title}</div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {event.subtitle && (
              <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }} title={event.subtitle}>{event.subtitle}</span>
            )}
            {event.broadcasts.length > 0 && (
              <span className="text-[10px] sm:text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{event.broadcasts[0]}</span>
            )}
          </div>
        </div>
      </div>
      {isPost && (
        <button
          type="button"
          onClick={() => play("f1", event.highlightQuery ?? `${event.title} highlights`, event.officialChannel)}
          disabled={loadingId === "f1"}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md cursor-pointer transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", color: "var(--accent)" }}
        >
          <span aria-hidden>▶</span> {loadingId === "f1" ? "Finding…" : "Highlights"}
        </button>
      )}
    </div>
  );
}
