"use client";

import { useState } from "react";
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
function whenLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Show times in the effective time zone (the Settings "Time zone" override,
  // or the device's own zone by default) — same as every game card. Without
  // this, an F1/UFC tile showed kickoff times in the device's zone even when
  // the user had picked another, disagreeing with the cards beside it.
  const tz = getTimeZone();
  const ymd = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const sameDay = ymd(d) === ymd(new Date());
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
  const play = async (id: string, query: string, channel?: string) => {
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
    const videoId = await fetchFirstVideoId(query, channel);
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
      onClick={onClick}
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

function FighterRow({ f }: { f: FightBout["red"] }) {
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
      {/* Match the game cards' team name exactly (GameCard): text-sm + the
          .team-name class, so fighter names sit at the same size as every other
          card's teams AND scale up in single-column large-card mode
          (.ns-cards-lg .team-name). Before this they rendered a notch smaller
          (text-xs) and stayed fixed while neighbouring team names grew — the
          mismatch that kept UFC hidden from the switcher. */}
      <span className="text-sm leading-none team-name truncate min-w-0" style={{ color: "var(--text)" }} title={f.name}>{f.name}</span>
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
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
      {/* Status bar — mirrors the game cards' meta row exactly so a UFC card is
          the SAME HEIGHT as an MLB card: status/time left (text-[11px]),
          broadcast right, and a CENTER slot (like the rated cards' rating badge)
          for the bout tag. Main/Co-Main lives here instead of its own row;
          non-headline bouts show their weight class in the same slot — so no
          bout ever adds an extra row. */}
      <div className="flex items-center gap-2 mb-1 sm:mb-2 min-h-[18px] text-[11px]">
        <span className="shrink-0 whitespace-nowrap flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {status}
        </span>
        {(label || fight.weightClass) && (
          <span className="flex-1 flex justify-center min-w-0">
            {label ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
                {label}
              </span>
            ) : (
              <span className="truncate" style={{ color: "var(--text-muted)" }}>{fight.weightClass}</span>
            )}
          </span>
        )}
        {broadcasts.length > 0 && (
          <span className="shrink-0 ml-auto truncate" style={{ color: "var(--text-muted)" }}>{broadcasts[0]}</span>
        )}
      </div>
      <div className="flex flex-col gap-y-0.5">
        <FighterRow f={fight.red} />
        <FighterRow f={fight.blue} />
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
            label={i === 0 ? "Main" : i === 1 ? "Co-Main" : undefined}
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
    const tz = getTimeZone();
    // Drop the time for a midnight (TBD) placeholder date, matching whenLabel
    // above and the game cards: an upcoming race whose session time ESPN hasn't
    // set yet arrives as 00:00, and rendering it as "12:00 AM" reads as a real
    // (wrong) start time. Detect it in the SAME zone the time is shown in (tz);
    // "24:00" guards the value some ICU builds emit for midnight (same guard as
    // whenLabel / weather.ts / etDay.ts / DateNav.ts). Real times still show.
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    const midnight = hm === "00:00" || hm === "24:00";
    const opts: Intl.DateTimeFormatOptions = midnight
      ? { weekday: "short", month: "short", day: "numeric", timeZone: tz }
      : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz };
    return d.toLocaleString("en-US", opts);
  })();
  const f1Query = event.highlightQuery ?? `${event.title} highlights`;

  return (
    <div className="rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
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
