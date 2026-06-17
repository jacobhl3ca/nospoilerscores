"use client";

import { useState } from "react";
import { LeagueEventCard, FightBout } from "@/lib/types";
import { fetchFirstVideoId } from "@/lib/youtube";

// Spoiler-safe event rendering for F1 (one race tile) and UFC (a card PER
// bout). Never shows results (finishing order / fight outcome). Highlights
// surface once an event is over and play in the masked in-app player; if a
// rights-holder blocks embedding (e.g. Formula One Management), the modal
// falls back to its "Watch on YouTube" link.

// "Sat 5:00 PM" for a future day, "5:00 PM" if it's today, "Sat" if the time is
// a midnight placeholder (TBD). Mirrors how the game cards show the day for
// upcoming/lookahead games instead of a bare time.
function whenLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  if (sameDay) return midnight ? "" : time;
  return midnight ? wd : `${wd} ${time}`;
}

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

// Play button styled exactly like the game cards' highlight buttons
// (GameHighlights): bg-card-hover pill, accent play triangle + label.
function PlayBtn({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50"
      style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
      title={`${label} highlights`}
    >
      {loading ? (
        <span className="text-[10px]">Loading…</span>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          <span className="text-[10px] font-medium">{label}</span>
        </>
      )}
    </button>
  );
}

function FighterRow({ f }: { f: FightBout["red"] }) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
      {f.flag ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flag} alt={f.country ?? ""} title={f.country} width={24} height={24} className="w-4 h-4 sm:w-6 sm:h-6 object-contain shrink-0" />
      ) : (
        <span className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />
      )}
      <span className="text-xs sm:text-sm whitespace-nowrap leading-none truncate" style={{ color: "var(--text)" }} title={f.name}>{f.name}</span>
      <span className="flex-1 min-w-0" />
      {f.record && (
        <span className="text-[10px] sm:text-xs tabular-nums text-right whitespace-nowrap shrink-0 leading-none" style={{ color: "var(--text-muted)" }}>{f.record}</span>
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
  const status = isPost ? "Final" : isLive ? "Live" : whenLabel(fight.date) || fight.statusDetail;
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
      {/* Status bar — time/day left, broadcast right (matches the game cards) */}
      <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2 h-[18px]">
        <span className="text-xs sm:text-sm flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {status}
        </span>
        {broadcasts.length > 0 && (
          <span className="text-[10px] sm:text-xs truncate shrink-0" style={{ color: "var(--text-muted)" }}>{broadcasts[0]}</span>
        )}
      </div>
      <div className="flex flex-col gap-y-0.5">
        <FighterRow f={fight.red} />
        <FighterRow f={fight.blue} />
      </div>
      {fight.weightClass && (
        <div className="text-[10px] sm:text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{fight.weightClass}</div>
      )}
      {isPost && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn label="UFC" loading={loadingId === fight.id} onClick={() => onPlay(fight.id, fight.highlightQuery, "UFC")} />
        </div>
      )}
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
  const fullWhen = (() => {
    const d = new Date(event.date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  })();
  const f1Query = event.highlightQuery ?? `${event.title} highlights`;

  return (
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {/* Status bar — status left, date right (matches the game cards) */}
      <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2 h-[18px]">
        <span className="text-xs sm:text-sm font-medium flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {event.statusDetail}
        </span>
        {fullWhen && <span className="text-[10px] sm:text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{fullWhen}</span>}
      </div>
      <div className="flex items-start gap-1 sm:gap-1.5">
        <span aria-hidden className="text-base leading-none mt-0.5">🏁</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs sm:text-sm font-medium leading-snug" style={{ color: "var(--text)" }}>{event.title}</div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {event.subtitle && (
              <span className="text-[11px] truncate" style={{ color: "var(--text-muted)" }} title={event.subtitle}>{event.subtitle}</span>
            )}
            {event.broadcasts.length > 0 && (
              <span className="text-[10px] sm:text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{event.broadcasts[0]}</span>
            )}
          </div>
        </div>
      </div>
      {/* F1 highlights are blocked from embedding by Formula One Management, so
          offer BOTH the official channel and an unscoped search — lets us test
          which (if either) actually plays in the masked player. */}
      {isPost && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn label="F1" loading={loadingId === "f1-official"} onClick={() => play("f1-official", f1Query, event.officialChannel)} />
          <PlayBtn label="Search" loading={loadingId === "f1-search"} onClick={() => play("f1-search", f1Query)} />
        </div>
      )}
    </div>
  );
}
