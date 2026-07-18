"use client";

import { useState, useRef, useEffect } from "react";
import { LeagueEventCard, FightBout } from "@/lib/types";
import { fetchFirstVideoId } from "@/lib/youtube";
import { getTimeZone } from "@/lib/etDay";
import { openExternal } from "@/lib/openExternal";

// Spoiler-safe event rendering for F1 (one race tile) and UFC (a card PER
// bout). Never shows results (finishing order / fight outcome). Highlights
// surface once an event is over and play in the masked in-app player; if a
// rights-holder blocks embedding (e.g. Formula One Management), the modal
// falls back to its "Watch on YouTube" link.

// "Sat 5:00 PM" for a future day, "5:00 PM" if it's today, "Sat" if the time is
// a midnight placeholder (TBD). Mirrors how the game cards show the day for
// upcoming/lookahead games instead of a bare time.
// `refYmd` (YYYYMMDD, the board's viewed date) decides what "today" means: the
// game cards drop the day prefix for games on the VIEWED slate, so an F1/UFC
// tile must too — navigating to Sunday should show the Sunday race as just
// "9:00AM", not "Sun 9:00AM". Falls back to the real today when absent.
function whenLabel(iso?: string, refYmd?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Show times in the effective time zone (the Settings "Time zone" override,
  // or the device's own zone by default) — same as every game card. Without
  // this, an F1/UFC tile showed kickoff times in the device's zone even when
  // the user had picked another, disagreeing with the cards beside it.
  const tz = getTimeZone();
  const ymd = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, "");
  const sameDay = ymd(d) === (refYmd || ymd(new Date()));
  // Detect the midnight (TBD) placeholder in the SAME zone the time is shown in
  // (tz), not the device's own zone. Reading d.getHours()/getMinutes() uses the
  // device zone, so a Settings "Time zone" override desyncs it from the
  // displayed time — a real kickoff could be mistaken for a placeholder (or
  // vice-versa). "24:00" guards the value some ICU builds emit for midnight
  // (same guard as weather.ts / etDay.ts / DateNav.ts).
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const midnight = hm === "00:00" || hm === "24:00";
  // Strip the space before AM/PM so it reads "8:00PM" like the game cards'
  // formatTime (GameCard's "1:10PM"), not "8:00 PM".
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/(\d)\s+([AP]M)\b/i, "$1$2");
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  if (sameDay) return midnight ? "" : time;
  return midnight ? wd : `${wd} ${time}`;
}

function useHighlightPlayer(onPlayHighlight?: (videoId: string, fallbackUrl: string) => void) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // strict → the worker oembed-verifies the result's uploader equals `channel`
  // (drops title-only reuploads from random channels). Used by F1, whose
  // official FORMULA 1 channel is the only acceptable in-app source; when
  // nothing strict matches, the openExternal fallback below sends the user to
  // a YouTube search OUTSIDE the app instead of playing an unvetted upload in
  // the masked player.
  const play = async (id: string, query: string, channel?: string, strict?: boolean) => {
    const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    // Route the YouTube-search fallback through openExternal (not raw
    // window.open) so it behaves like every other external YouTube open in the
    // app: on the website it's byte-identical (openExternal does the same
    // window.open there), but inside the Capacitor native wrapper it hands the
    // /results URL off to the YouTube app via the youtube:// scheme (falling
    // back to the in-app browser) instead of shelling out to mobile Safari and
    // missing the handoff — matching GameHighlights' openExternal fallbacks.
    if (!onPlayHighlight) { openExternal(fallback); return; }
    setLoadingId(id);
    const videoId = await fetchFirstVideoId(query, channel, undefined, undefined, strict);
    setLoadingId(null);
    if (videoId) onPlayHighlight(videoId, fallback);
    else openExternal(fallback);
  };
  return { loadingId, play };
}

// Play button styled exactly like the game cards' highlight buttons
// (GameHighlights): bg-card-hover pill, accent play triangle + label.
function PlayBtn({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      // stopPropagation: the F1 tile body is clickable (opens the ESPN race
      // page), so the play button must not ALSO trigger the card's click —
      // same pattern as every nested button in GameCard.
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50"
      style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
      title={`${label} highlights`}
      // Pin the accessible name to the button's purpose so a screen reader
      // hears "UFC highlights" / "Search highlights" — otherwise the name fell
      // back to the bare visible text ("Search" alone is ambiguous) while
      // loading swapped it to "Loading…", losing what the button does. aria-busy
      // conveys the in-flight fetch that the visible "Loading…" shows sighted
      // users. Matches the title+aria-label pairing every other button here uses.
      aria-label={`${label} highlights`}
      aria-busy={loading}
    >
      {loading ? (
        <span className="text-[10px]">Loading…</span>
      ) : (
        <>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          <span className="text-[10px] font-medium">{label}</span>
        </>
      )}
    </button>
  );
}

function FighterRow({ f, compact }: { f: FightBout["red"]; compact: boolean }) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
      {f.flag ? (
        // onError hides a 404'd/blocked remote flag so it degrades to the empty
        // slot instead of the browser's broken-image glyph — matches the onError
        // guards on every other remote flag/logo in the app (GameCard,
        // GolfLeaderboard, WorldCupGroupsModal/Bracket, NewsColumn, …).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flag} alt={f.country ?? ""} title={f.country} loading="lazy" decoding="async" width={24} height={24} className="w-4 h-4 sm:w-6 sm:h-6 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <span className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />
      )}
      {/* Mirror the game cards' team-name classes exactly: abbreviated team
          names render text-xs sm:text-sm, full names text-sm (GameCard). Fighter
          names can't abbreviate, so compact mirrors only the SIZE — including
          the sm: step, so on a desktop board whose game columns abbreviate at
          14px the fighter names are 14px too, not a mismatched 12px. The full
          branch keeps .team-name so single-column large mode scales it to 1rem
          alongside the team names (abbreviations don't carry it in GameCard
          either). */}
      <span className={`${compact ? "text-xs sm:text-sm" : "text-sm team-name"} leading-none truncate min-w-0`} style={{ color: "var(--text)" }} title={f.name}>{f.name}</span>
      <span className="flex-1 min-w-0" />
      {f.record && (
        <span className="text-[10px] sm:text-xs tabular-nums text-right whitespace-nowrap shrink-0 leading-none" style={{ color: "var(--text-muted)" }}>{f.record}</span>
      )}
    </div>
  );
}

function FightCard({
  fight, label, broadcasts, loadingId, onPlay, compact, metaCompact, selectedDate,
}: {
  fight: FightBout;
  label?: string;
  broadcasts: string[];
  loadingId: string | null;
  onPlay: (id: string, query: string, channel?: string) => void;
  compact: boolean;
  metaCompact: boolean;
  selectedDate?: string;
}) {
  const isLive = fight.state === "in";
  const isPost = fight.state === "post";
  const status = isPost ? "Final" : isLive ? "Live" : whenLabel(fight.date, selectedDate) || fight.statusDetail;
  return (
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
      {/* Status bar — mirrors the game cards' meta row exactly so a UFC card is
          the SAME HEIGHT as an MLB card: status/time left, broadcast right, and a
          CENTER slot (like the rated cards' rating badge) for the bout tag.
          Main/Co-Main lives here instead of its own row; non-headline bouts show
          their weight class in the same slot — so no bout ever adds an extra row.
          The game-meta-row class + text-xs give it the game cards' meta font
          (12px, and the .ns-board-tight rules drop it to 10px on the tight
          3-column mobile board exactly when MLB's meta row drops). Below ~190px
          the row can't hold time + Co-Main pill + "Paramount+" at full size
          without overlapping, so metaCompact keeps just time + the Main/Co-Main
          tag — the repeated-per-card broadcast and the weight class fall away. */}
      <div className="game-meta-row flex items-center gap-2 mb-1 sm:mb-2 min-h-[18px] text-xs">
        <span className="shrink-0 whitespace-nowrap flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {status}
        </span>
        {(label || (!metaCompact && fight.weightClass)) && (
          <span className="flex-1 flex justify-center min-w-0">
            {label ? (
              <span className="inline-flex items-center rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
                {label}
              </span>
            ) : (
              <span className="truncate" style={{ color: "var(--text-muted)" }}>{fight.weightClass}</span>
            )}
          </span>
        )}
        {!metaCompact && broadcasts.length > 0 && (
          <span className="shrink-0 ml-auto truncate" style={{ color: "var(--text-muted)" }}>{broadcasts[0]}</span>
        )}
      </div>
      <div className="flex flex-col gap-y-0.5">
        <FighterRow f={fight.red} compact={compact} />
        <FighterRow f={fight.blue} compact={compact} />
      </div>
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
  namesCompact,
  selectedDate,
}: {
  event: LeagueEventCard;
  leagueLabel?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
  // The board-level "game columns are showing abbreviated team names" signal
  // (HomeContent folds it from every game column's live useAbbreviations state).
  namesCompact?: boolean;
  // The board's viewed date (YYYYMMDD) — whenLabel drops the day prefix for an
  // event ON this date, matching how game cards show a bare time for the
  // viewed slate.
  selectedDate?: string;
}) {
  const { loadingId, play } = useHighlightPlayer(onPlayHighlight);

  // Fighter-name size follows namesCompact — the game columns' REAL
  // abbreviate/full flip. That flip depends on the day's longest team name (and
  // the board's gap/rank CSS), so a width threshold here can only ever guess it:
  // the shipped 155px guess was measured on one day's slate and drifted the
  // very next day (MLB still abbreviated at 157px columns while fighter names
  // had already expanded — "UFC bigger"). The width fallback below survives
  // only for a board with no game columns to report (UFC-only), where there's
  // nothing to match anyway. metaCompact stays width-driven on purpose: what
  // the meta row can hold (time + Co-Main pill + "Paramount+" needs ~190px at
  // full size before they collide) is a property of THIS card's strings, not of
  // the neighbours' team names.
  const rootRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setColWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = namesCompact ?? (colWidth > 0 && colWidth < 155);
  // colWidth 0 = not yet measured — start compact so the first paint can't
  // flash the overlapping full row. 210px is what the widest full row actually
  // needs at the meta font: "8:00PM" + the Co-Main pill (or "Lightweight") +
  // "Paramount+" + gaps ≈ 195px — below that the pill overflowed its center
  // slot into the time and weight classes truncated to fragments ("Ligh…").
  const metaCompact = colWidth < 210;

  // ── UFC: one card per bout, main event first ──
  if (event.kind === "ufc" && event.fights?.length) {
    return (
      <div ref={rootRef} className="flex flex-col gap-1.5 sm:gap-2">
        {event.fights.map((f, i) => (
          <FightCard
            key={f.id}
            fight={f}
            label={i === 0 ? "Main" : i === 1 ? "Co-Main" : undefined}
            broadcasts={event.broadcasts}
            loadingId={loadingId}
            onPlay={play}
            compact={compact}
            metaCompact={metaCompact}
            selectedDate={selectedDate}
          />
        ))}
      </div>
    );
  }

  // ── F1: single race tile ──
  const isLive = event.state === "in";
  const isPost = event.state === "post";
  // Status text mirrors FightCard/the game cards exactly: "Final" / "Live" /
  // whenLabel ("Sat 9:00AM" for another day, bare "9:00AM" when the race is on
  // the viewed date — selectedDate — same rule as the game cards' time).
  const status = isPost ? "Final" : isLive ? "Live" : whenLabel(event.date, selectedDate) || event.statusDetail;
  const f1Query = event.highlightQuery ?? `${event.title} highlights`;
  // Clicking the tile body opens the ESPN race page — the game cards' "click
  // for more details" affordance (there's no F1 GameDetailModal; ESPN's race
  // hub IS the detail view, results-gated behind its own page so no spoiler
  // leaks onto ours). PlayBtn stopPropagations so highlights don't also fire this.
  const clickable = !!event.eventUrl;
  const openDetails = () => { if (event.eventUrl) openExternal(event.eventUrl); };

  return (
    <div ref={rootRef} className={`rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${clickable ? " cursor-pointer" : ""}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={clickable ? openDetails : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(); } } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${event.title} — race details on ESPN` : undefined}
      title={clickable ? "Race details on ESPN" : undefined}>
      {/* Meta row — game-meta-row like FightCard/GameCard, so an F1 tile is the
          SAME height as an MLB card: status/time left, broadcast right (dropped
          when the column is too narrow, same metaCompact rule as UFC). An
          upcoming time renders at text-[11px] muted — the exact classes
          GameCard's future-time span uses — while Final/Live keep the row's
          text-xs like GameCard's FINAL/clock. */}
      <div className="game-meta-row flex items-center gap-2 mb-1 sm:mb-2 min-h-[18px] text-xs">
        <span className="shrink-0 whitespace-nowrap flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {isPost || isLive ? status : <span className="text-[11px] whitespace-nowrap">{status}</span>}
        </span>
        {!metaCompact && event.broadcasts.length > 0 && (
          <span className="shrink-0 ml-auto truncate" style={{ color: "var(--text-muted)" }}>{event.broadcasts[0]}</span>
        )}
      </div>
      {/* Body — the game cards' EXACT two-row team skeleton (logo slot + name,
          gap-y-0.5, leading-none, truncate), with 🏁 in the away-logo slot and
          the circuit in the home row, so the tile's height and fonts track an
          MLB card 1:1 at every breakpoint. */}
      <div className="flex flex-col gap-y-0.5">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <span aria-hidden className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 flex items-center justify-center text-sm sm:text-base leading-none">🏁</span>
          <span className={`${compact ? "text-xs sm:text-sm" : "text-sm team-name"} leading-none truncate min-w-0`} style={{ color: "var(--text)" }} title={event.title}>{event.title}</span>
        </div>
        {event.subtitle && (
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <span className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />
            <span className="text-[10px] sm:text-xs leading-none truncate min-w-0" style={{ color: "var(--text-muted)" }} title={event.subtitle}>{event.subtitle}</span>
          </div>
        )}
      </div>
      {/* One official-channel button, like UFC's — the unscoped "Search" test
          button is gone. strict=true hard-gates the in-app result to the real
          FORMULA 1 channel (oembed-verified uploader); FOM blocks embedding on
          most of its uploads, so when nothing strict/playable matches, the
          fallback opens a YouTube search externally rather than playing some
          random reupload in the masked player. */}
      {isPost && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn label="F1" loading={loadingId === "f1-official"} onClick={() => play("f1-official", f1Query, event.officialChannel, true)} />
        </div>
      )}
    </div>
  );
}
