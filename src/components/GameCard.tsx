"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Game, Team } from "@/lib/types";
import { type ShareCardMeta } from "@/lib/shareCard";
import { networkStreamUrl, sportStreamFallback, espnGameUrl, displayShortName } from "@/lib/espn";
import { getTimeZone, etSlateYmd } from "@/lib/etDay";
import { fifaRank } from "@/lib/fifaRankings";
import { handleExternalClick } from "@/lib/openExternal";
import { prefetchGameWeather, fetchGameWeather, type GameWeather } from "@/lib/weather";
import GameHighlights from "@/components/GameHighlights";
import { getDateString } from "@/components/DateNav";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  nextGameDate?: string;
  // Lookback cards (empty past tab → last game played): a date label rendered on
  // the card's top-left like a normal card date, e.g. "Last played · Mon 6/8" —
  // so it reads as part of the card, not floating text above it.
  pastDateLabel?: string;
  isPastDate?: boolean;
  isToday?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null, alternates?: { label: string; videoId: string }[]) => void;
  // Plays a non-YouTube embed (NHL recaps via Brightcove) in the same modal.
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  leagueLabel?: string;
  useAbbreviations?: boolean;
  // When true, render the game's own date on the top-left regardless of state,
  // and treat finished games like past-date cards (hide records, show highlights).
  // Used by the per-team schedule view.
  teamView?: boolean;
  // True when this finished game shares its (Eastern) calendar day with another
  // of the team's games — a doubleheader. The schedule card then shows the
  // start time so the two otherwise-identical FINAL cards are distinguishable.
  isDoubleheader?: boolean;
  // When set, clicking a team name opens that team's schedule view in the column.
  onSelectTeam?: (team: Team) => void;
  // Clicking the card body opens a spoiler-safe details popup. (Live games still
  // jump straight to the stream from the green status / network chip.)
  onShowDetails?: (game: Game) => void;
  // Favorite-star next to each team name (restored 6/11, off by default so the
  // team-schedule view keeps its own header star as the only one there). The
  // column suppresses it for single-matchup Finals views where the favorite
  // sort can't reorder anything.
  showStars?: boolean;
}

function RatingBadge({ rating }: { rating: number }) {
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
    // Screen readers otherwise announce a bare "MEH"/"SKIP" mid-card with no hint
    // it's the game's worth-watching rating. role="img" + a spoken aria-label give
    // the badge a self-describing name; the visible all-caps text is unchanged.
    // Title case in the label ("Meh"/"Skip") stops some engines spelling the short
    // all-caps words out letter-by-letter — except "OK", which is an initialism
    // and stays "OK" so it isn't mangled to "Ok".
    <span
      role="img"
      aria-label={`Worth-watching rating: ${label === "OK" ? "OK" : label.charAt(0) + label.slice(1).toLowerCase()}`}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase`}
    >
      {label}
    </span>
  );
}

/* --- ESPN link (commented out — revisit: fit small into card without adding row) ---
function EspnLink({ href, title }: { href: string; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="opacity-40 hover:opacity-70 transition-opacity flex-shrink-0"
      title={title || "View on ESPN"}>
      <img src="https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/espn.png&w=40&h=40"
        alt="ESPN" loading="lazy" decoding="async" width={20} height={20} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
    </a>
  );
}
*/


// "5" → "5th", "1" → "1st", etc. — for spelling out the inning to screen readers.
function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th");
  return `${n}${suffix}`;
}

// `label`, when present, is a spoken form for screen readers (applied as an
// aria-label on the live-status element). Only MLB sets it: the ▲/▼ inning
// glyphs read as a meaningless "up-pointing triangle 5" otherwise.
function formatGameProgress(game: Game): { full: string; short: string; delayed?: boolean; label?: string } {
  const { sport, statusDetail, clock, period } = game;
  if (sport === "mlb") {
    // Delayed games arrive as "Rain Delay, Top 1st" / "Heat Delay, ..." —
    // render the inning the same compact way as live cards and append the
    // reason word (Rain/Heat/...) in proper case; the renderer recolors yellow.
    const delayMatch = statusDetail.match(/(\w+)\s+delay/i);
    const delayed = !!delayMatch || /delay/i.test(statusDetail);
    const reason = delayMatch
      ? delayMatch[1][0].toUpperCase() + delayMatch[1].slice(1).toLowerCase()
      : delayed ? "Delay" : "";
    const m = statusDetail.match(/(Top|Bot|Bottom|Mid|End)\s+(\d+)/i);
    if (m) {
      const half = m[1].toLowerCase();
      const inn = m[2];
      const arrow = (half === "top" || half === "mid") ? "▲" : "▼";
      const base = `${arrow}${inn}`;
      // Spoken inning for screen readers — "▲5" alone is meaningless read aloud.
      const halfWord = half === "top" ? "Top" : half === "mid" ? "Middle" : half === "end" ? "End" : "Bottom";
      const label = `${halfWord} of the ${ordinal(parseInt(inn, 10))} inning`;
      if (delayed) return { full: `${base} ${reason}`, short: `${base} ${reason}`, delayed: true, label: `${label}, ${reason}` };
      return { full: base, short: base, label };
    }
    if (delayed) return { full: reason, short: reason, delayed: true };
    return { full: statusDetail, short: statusDetail.slice(0, 3) };
  }
  if (sport === "ncaam") {
    // NCAAM uses halves, not quarters
    const h = period <= 2 ? `H${period}` : period === 3 ? "OT" : `${period - 2}OT`;
    if (clock && clock !== "0.0") return { full: `${h} - ${clock}`, short: h };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: h, short: h };
  }
  if (sport === "nba" || sport === "wnba") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} - ${clock}`, short: q };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: q, short: q };
  }
  if (sport === "nhl") {
    // Regulation is P1–P3, then a single overtime (period 4). In the REGULAR
    // season a still-tied game goes to a SHOOTOUT (period 5) — not a 2nd OT.
    // Multiple overtimes only exist in the playoffs (periods 5, 6, … = 2OT,
    // 3OT, …), which in turn never have a shootout. So period 5 is ambiguous by
    // number alone; disambiguate with isPlayoff. Without this a regular-season
    // shootout rendered "2OT", a period that can't occur outside the playoffs.
    const shootout = period >= 5 && !game.isPlayoff;
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : shootout ? "SO" : `${period - 3}OT`;
    // A shootout has no running clock, so skip the "- 0:00" tail and just show "SO".
    if (!shootout && clock && clock !== "0.0") return { full: `${p} - ${clock}`, short: p };
    return { full: p, short: p };
  }
  if (sport === "nfl") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} - ${clock}`, short: q };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: q, short: q };
  }
  return { full: statusDetail, short: statusDetail.slice(0, 3) };
}

function cleanStatusDetail(detail: string, stripDate: boolean): string {
  let cleaned = detail.replace(/\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT)\s*$/i, "");
  if (stripDate) cleaned = cleaned.replace(/^\d{1,2}\/\d{1,2}\s*-\s*/, "");
  return cleaned.trim();
}

// "BOS leads series 3-1" → "BOS leads 3-1"; "Series tied 2-2" → "Tied 2-2"
function formatSeriesStatus(s: string): string {
  const stripped = s.replace(/\bseries\s+/gi, "").trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// Compact network label for the inline status-bar chip (Jacob 6/10): the rating
// badge centers on the card, so the network sits small and short beside it.
// "MLB.TV" → "MLB", "MLB Network" → "MLB", "Prime Video" → "Prime", "Apple TV+"
// → "Apple TV". Codes already short (FOX/FS1/ESPN/TBS/ABC/TNT) pass through. The
// full name stays in the link title/aria, so nothing is lost.
// Explicit shortenings the generic suffix-stripping below can't derive — a long
// network name wraps to a second line and grows the card (Jacob 6/23: "ESPN
// Unlmtd" sat on its own line — "just call it ESPN"). The full name still shows
// in the "+N" expanded list and the "Watch on …" tooltips.
const NETWORK_SHORT: Record<string, string> = {
  "ESPN Unlmtd": "ESPN",
  "ESPN Unlimited": "ESPN",
  "Marquee Sports Net": "Marquee",
  "Space City Home Network": "Space City",
};
function shortNetwork(name: string): string {
  if (NETWORK_SHORT[name]) return NETWORK_SHORT[name];
  // "NBC Sports Bay Area" / "NBC Sports California" / "NBC Sports Phil" → "NBCS …"
  const nbcs = name.match(/^NBC Sports (.+)$/i);
  if (nbcs) return `NBCS ${nbcs[1]}`;
  return name
    .replace(/\.tv$/i, "")
    .replace(/\s*Sports Network$/i, "")
    .replace(/\s*Network$/i, "")
    .replace(/\s*Video$/i, "")
    .replace(/\+$/, "")
    .trim() || name;
}

// Compact upcoming-game row for the games AFTER the first in an NBA/NHL playoff
// series (the first renders as a full GameCard). The two teams are fixed for the
// series, so each row just needs the VENUE — "@ HOME · date · time" with the
// broadcast network pinned right (Jacob 6/4). No series state here: it shows
// Display tip-off time tight: drop the space before the meridiem ("8:30 PM" →
// "8:30PM") and KEEP the full ":00" on on-the-hour times ("7:00 PM" stays
// "7:00PM", not "7PM"). The no-space form reads as one unit and also buys a few
// px back on the narrow mobile columns so the lead card stops clipping the PM
// (Jacob 6/9).
function formatTime(t: string | null | undefined): string {
  return (t ?? "").replace(/(\d)\s+([AP]M)\b/i, "$1$2");
}

// Keep upcoming-card weekday labels compact at every breakpoint. The row also
// carries date/time plus a pinned-right network, and full names like "Thursday"
// can force the network onto a second line in single-column cards.
function displayDow(s: string): string {
  return s;
}

// once, on the full lead card, instead of repeating down every row.
export function CompactUpcomingCard({
  game,
  nextGameDate,
  onShowDetails,
}: {
  game: Game;
  nextGameDate?: string;
  onShowDetails?: (game: Game) => void;
}) {
  const home = game.homeTeam;
  // Local tip-off time — mirrors GameCard's pre-game localTime derivation:
  // prefer ESPN's status text, else fall back to the game's own date.
  const localTime = (() => {
    const cleaned = cleanStatusDetail(game.statusDetail, true);
    if (cleaned && /\bTBD\b/i.test(cleaned)) return "TBD";
    if (!cleaned || cleaned.toLowerCase() === "scheduled" || !/\d{1,2}:\d{2}/.test(cleaned) || /^starts\s/i.test(cleaned)) {
      try {
        const d = new Date(game.date);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });
      } catch { /* fall through */ }
    }
    return cleaned;
  })();
  const network = game.broadcasts[0] ?? null;
  const networkHref = network
    ? ((/\b(amazon|prime)\b/i.test(network) && game.primeStreamUrl) || networkStreamUrl(network, game.id, game.sport) || sportStreamFallback(game.sport))
    : null;
  const cardClickable = !!onShowDetails;
  // Name the clickable card after the matchup so screen readers announce which
  // game opens (e.g. "Yankees at Red Sox — game details") instead of reading
  // the whole card's concatenated text — including nested control labels — as
  // the button name. Mirrors the GameDetailModal dialog name it opens. Team
  // names carry no score, so this stays spoiler-safe; falls back to the generic
  // label if either name is missing.
  const cardAwayName = game.awayTeam.displayName || game.awayTeam.shortDisplayName || game.awayTeam.abbreviation;
  const cardHomeName = game.homeTeam.displayName || game.homeTeam.shortDisplayName || game.homeTeam.abbreviation;
  const cardLabel = cardAwayName && cardHomeName ? `${cardAwayName} at ${cardHomeName} — game details` : "Game details";
  // Position-agnostic network link (the row wrappers below place it). Same
  // text-[11px] as the date/time so they sit level (Jacob 6/9 — the time looked
  // high next to a smaller network).
  const networkNode = network ? (
    networkHref ? (
      <a
        href={networkHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] hover:underline whitespace-nowrap"
        style={{ color: "var(--text-muted)" }}
        title={`Watch on ${network}`}
        onClick={handleExternalClick(networkHref)}
      >
        {shortNetwork(network)}
      </a>
    ) : (
      <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{shortNetwork(network)}</span>
    )
  ) : null;
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md px-2 sm:px-4 py-1 overflow-hidden transition-colors${cardClickable ? " cursor-pointer" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onPointerEnter={cardClickable ? () => prefetchGameWeather(game) : undefined}
      onPointerDown={cardClickable ? () => prefetchGameWeather(game) : undefined}
      onClick={cardClickable ? () => onShowDetails!(game) : undefined}
      onKeyDown={cardClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShowDetails!(game); } } : undefined}
      role={cardClickable ? "button" : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      aria-label={cardClickable ? cardLabel : undefined}
      title={cardClickable ? "Game details" : undefined}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      {/* Mobile: date · time · network as a 3-col grid (1fr auto 1fr) so the TIME
          is perfectly centered in the card and lines up across every row, no
          matter the DOW width (Jacob 6/9). Date bold (DOW only on mobile), time
          shortened, network right. */}
      <div className="flex sm:hidden items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {/* DOW in a fixed-width box so the time starts at the same x on every row
            (the 3-letter abbreviations vary just enough — "Fri" vs "Sat" — to
            knock the times out of alignment otherwise). A constant small gap sits
            after the box. Non-lead rows: the DOW is the same muted grey as the
            date + time next to it (not bold, not dark) — only the lead card's DOW
            is emphasized. Network pinned right (Jacob 6/9). */}
        <span className="shrink-0 inline-block min-w-[1.7rem]">{nextGameDate === "Tomorrow" ? "Tomo" : (nextGameDate || "").split(" ")[0]}</span>
        {localTime ? <span className="shrink-0 whitespace-nowrap">{formatTime(localTime)}</span> : null}
        <span className="ml-auto shrink-0 text-right">{networkNode}</span>
      </div>
      {/* Desktop: bold DOW only; the M/D + time flow right after as one muted run
          (same size & color as the time) — "Sat 6/13 - 8:30 PM", no big gap
          before the dash. Network pinned right (Jacob 6/9). */}
      <div className="hidden sm:flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="whitespace-nowrap">
          {displayDow((nextGameDate || "").split(" ")[0])}
          {(nextGameDate || "").includes(" ") ? ` ${(nextGameDate || "").split(" ").slice(1).join(" ")}` : ""}{localTime ? ` - ${formatTime(localTime)}` : ""}
        </span>
        {networkNode ? <span className="ml-auto whitespace-nowrap">{networkNode}</span> : null}
      </div>
      {/* Row 2: venue — "@ HOME". Series teams are fixed, so just the home side. */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>@</span>
        {/* Decorative: the team name renders right beside this logo, so an alt
            of the abbreviation made screen readers announce the team twice
            ("MIA MIA Heat"). Empty alt matches GameDetailModal's TeamRow logo;
            title stays for the sighted-hover tooltip. */}
        {home.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={home.logo} alt="" title={home.displayName} loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : null}
        {/* Full team name when there's room (desktop, like the lead card above);
            abbreviation on the narrow mobile column. Normal weight to match the
            lead card + every other card's team name — font-medium made the venue
            team read heavier than the (un-bold) date above it (Jacob 6/9). */}
        <span className="text-xs sm:text-sm min-w-0 truncate" style={{ color: "var(--text)" }} title={home.displayName}>
          <span className="hidden sm:inline">{displayShortName(home)}</span>
          <span className="sm:hidden">{home.abbreviation}</span>
        </span>
      </div>
    </div>
  );
}

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings, nextGameDate, pastDateLabel, isPastDate, isToday, onPlayHighlight, onPlayEmbed, leagueLabel, useAbbreviations, teamView, isDoubleheader, onSelectTeam, onShowDetails, showStars }: GameCardProps) {
  const [broadcastExpanded, setBroadcastExpanded] = useState(false);
  // Any click outside the expanded-networks overlay collapses it (Jacob 6/11) —
  // before this, overlays only closed via the tiny ✕ and piled up across cards.
  // Capture phase so other handlers' stopPropagation (e.g. another card's "+N"
  // chip) can't keep a stale overlay open.
  const broadcastOverlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!broadcastExpanded) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (broadcastOverlayRef.current?.contains(e.target as Node)) return;
      setBroadcastExpanded(false);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    return () => document.removeEventListener("pointerdown", closeOnOutside, true);
  }, [broadcastExpanded]);

  // Live outdoor games: pull current venue conditions so a small weather emoji
  // (🌧️) can sit beside the live status when it's actively precipitating —
  // reuses the same cached/deduped Open-Meteo fetch the detail modal uses, so
  // it's one shared request per venue. Skips finished/upcoming, covered, and
  // unlocated games (no fetch). Only the wet states render (see below).
  const [cardWeather, setCardWeather] = useState<GameWeather | null>(null);
  useEffect(() => {
    if (game.state !== "in" || game.venueRoof || !game.venueLocation) return;
    let cancelled = false;
    fetchGameWeather(game.venueLocation, game.date)
      .then((w) => { if (!cancelled) setCardWeather(w); })
      .catch(() => {});
    // Clear in cleanup (before the next run) rather than synchronously at the
    // top of the effect body — same reset semantics without a synchronous
    // setState in the effect, which triggers a cascading render (react-hooks lint).
    return () => { cancelled = true; setCardWeather(null); };
  }, [game.id, game.state, game.venueRoof, game.venueLocation, game.date]);
  // Hide the rating badge while a live game is in a delay — rating returns
  // once play resumes.
  const isDelayed = game.state === "in" && /delay/i.test(game.statusDetail);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null && !isDelayed;
  const isFinished = game.state === "post";
  const isFuture = game.state === "pre";
  const isLive = game.state === "in";
  const liveUrl = game.streamUrl;
  // Team-view treats finished games like past-date cards (hide records, show highlights).
  const effectivePastDate = isPastDate || (teamView && isFinished);
  const espnUrl = espnGameUrl(game);
  const teamViewDateLabel = teamView ? (() => {
    const d = new Date(game.date);
    if (isNaN(d.getTime())) return "";
    // Bucket the game to its ET slate day the SAME way getDateString(0) derives
    // "today" — via etSlateYmd's 1 AM rollover (getEtServiceDate) — so both sides
    // of the diff use one day boundary. A raw ET calendar day (the old code) has
    // no rollover, so a game kicking off between midnight and 1 AM ET (a ~9pm-PT
    // West-Coast game) landed on the LATER day here while the board + date nav
    // filed it under yesterday's slate — mislabeling it "Today" (Jacob 7/8).
    // etSlateYmd also keeps the effective-zone bucketing that fixed the old
    // UTC-day mislabel. Matches TeamView.gameIsToday's identical bucketing.
    const toNum = (ymd: string) => { const s = ymd.replace(/\D/g, ""); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000; };
    const diffDays = toNum(etSlateYmd(game.date)) - toNum(getDateString(0));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: getTimeZone() });
  })() : null;
  const teamViewTime = teamView && isFuture ? (() => {
    const cleaned = cleanStatusDetail(game.statusDetail, true);
    if (cleaned && /\bTBD\b/i.test(cleaned)) return "TBD";
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });
    } catch { /* fall through */ }
    return null;
  })() : null;
  // Doubleheader disambiguation: a finished game that shares its day with another
  // of the team's games shows its (device-local) start time, so the two FINAL
  // cards aren't visually identical. Time is not a spoiler.
  const teamViewDhTime = teamView && isFinished && isDoubleheader ? (() => {
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });
    } catch { /* fall through */ }
    return null;
  })() : null;
  const localTime = isFuture ? (() => {
    const cleaned = cleanStatusDetail(game.statusDetail, true);
    // Playoff "If Necessary" games come back with date = midnight ET and
    // statusDetail "TBD" / "M/D - TBD". Falling through to game.date would
    // render "12:00 AM" — short-circuit to TBD so the user sees ESPN's label.
    if (cleaned && /\bTBD\b/i.test(cleaned)) return "TBD";
    // ESPN sometimes omits a time (EPL/MLS "Scheduled"), returns a date-only string
    // like "Starts 5/3", or prefixes the time with "Starts M/D" (e.g. "Starts 5/5 7:00 PM").
    // In any of those cases derive the local tip-off from game.date.
    if (!cleaned || cleaned.toLowerCase() === "scheduled" || !/\d{1,2}:\d{2}/.test(cleaned) || /^starts\s/i.test(cleaned)) {
      try {
        const d = new Date(game.date);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });
        }
      } catch { /* fall through */ }
    }
    return cleaned;
  })() : null;
  // Play-in placeholders arrive with slashed names like "Clippers/Trail Blazers"
  // (shortDisplayName) and "LAC/POR" (abbreviation). Treat those as TBD too.
  const isPlaceholderName = (s?: string) => !!s && s.includes("/");
  const awayTBD =
    game.awayTeam.shortDisplayName === "TBD" ||
    !game.awayTeam.abbreviation ||
    isPlaceholderName(game.awayTeam.shortDisplayName) ||
    isPlaceholderName(game.awayTeam.abbreviation);
  const homeTBD =
    game.homeTeam.shortDisplayName === "TBD" ||
    !game.homeTeam.abbreviation ||
    isPlaceholderName(game.homeTeam.shortDisplayName) ||
    isPlaceholderName(game.homeTeam.abbreviation);
  const gameProgress = isLive ? formatGameProgress(game) : null;

  // Both team rows render this identical ★, so a bare "Add to favorites" name
  // gave a screen reader two indistinguishable buttons per card — no way to tell
  // which team each one favorites. Fold the team name into the accessible name
  // (and the hover title) so each star reads "Add Boston Celtics to favorites",
  // matching the team-specific naming the schedule button beside it already uses.
  const star = (teamId: string, teamName: string, isFav: boolean, isTBD: boolean) =>
    !isTBD ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavoriteTeam(teamId); }}
        className={`text-xs sm:text-sm leading-none transition-colors cursor-pointer ${isFav ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
        style={isFav ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
        title={isFav ? `Remove ${teamName} from favorites` : `Add ${teamName} to favorites`}
        aria-label={isFav ? `Remove ${teamName} from favorites` : `Add ${teamName} to favorites`}
        aria-pressed={isFav}
      >★</button>
    ) : null;

  const logo = (team: typeof game.awayTeam, isTBD: boolean) =>
    isTBD ? (
      <span className="w-4 h-4 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs rounded" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>
    ) : (
      // Decorative: the team name renders beside this logo (see the row at the
      // logo() call site), so alt="" avoids a duplicate screen-reader read of
      // the team; title stays for the sighted-hover tooltip.
      // onError hides a 404'd/blocked ESPN logo so it degrades to the team name
      // beside it rather than the browser's broken-image glyph (matches the
      // remote-image guards in NewsColumn/AlignedVideoStrip/VideoModal).
      // eslint-disable-next-line @next/next/no-img-element
      <img src={team.logo} alt="" title={team.displayName} loading="lazy" decoding="async" width={24} height={24} className="w-4 h-4 sm:w-6 sm:h-6 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
    );

  // Clicking the card body opens a spoiler-safe details popup. Inner
  // buttons/links that stopPropagation keep their own actions — team names
  // (schedule view), the live green status + network chip (jump to the
  // stream), highlight buttons, etc. Enabled in the per-team schedule view
  // too (Jacob 6/1) — tapping a schedule card opens its details popup; the
  // team-name button still navigates via its own stopPropagation handler.
  const cardClickable = !!onShowDetails;
  // Concise, spoiler-safe accessible name for the clickable card, matching the
  // GameDetailModal dialog it opens ("Yankees at Red Sox — game details") — so
  // screen readers announce the matchup instead of the card's whole run of
  // concatenated text (which otherwise absorbs nested control labels like "Add
  // to favorites"). Team names carry no score; falls back if a name is missing.
  const cardAwayName = game.awayTeam.displayName || game.awayTeam.shortDisplayName || game.awayTeam.abbreviation;
  const cardHomeName = game.homeTeam.displayName || game.homeTeam.shortDisplayName || game.homeTeam.abbreviation;
  const cardLabel = cardAwayName && cardHomeName ? `${cardAwayName} at ${cardHomeName} — game details` : "Game details";
  return (
    <div
      className={`rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${cardClickable ? " cursor-pointer" : ""}`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onPointerEnter={cardClickable ? () => prefetchGameWeather(game) : undefined}
      onPointerDown={cardClickable ? () => prefetchGameWeather(game) : undefined}
      onClick={cardClickable ? () => onShowDetails!(game) : undefined}
      onKeyDown={cardClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShowDetails!(game); } } : undefined}
      role={cardClickable ? "button" : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      aria-label={cardClickable ? cardLabel : undefined}
      title={cardClickable ? "Game details" : undefined}
    >
      {/* Lookback card: "Last played · {date}" centered on the card's top row,
          normal date font/color (no ESPN link — it would spoil the score). */}
      {pastDateLabel && (
        <div className="mb-1 text-[11px] text-center whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
          {pastDateLabel}
        </div>
      )}
      {/* Playoff series state ("NY leads 1-0") — DAY-OF-GAME ONLY (Jacob 6/12):
          a lookahead card ("Tomorrow - 8:30PM" on today's board, nextGameDate
          set) already carries another day's game info, so the series line stays
          off until the game is actually today. On game day: WIDE columns (xl)
          render it INLINE in the status-bar row's middle cell (same line as
          time + network — see below); NARROW columns can't fit that without
          truncating ("NY L…"), so it moves to its OWN row ABOVE the status bar —
          which also keeps the network in its top-right spot instead of getting
          bumped (Jacob 6/5–6/7). Pre-game + ratings mode only (it's a spoiler);
          shown once (compact rows don't render it). */}
      {game.seriesStatus && isFuture && showRatings && isToday && !nextGameDate && (
        <div className="xl:hidden mb-1 text-[11px] text-center italic" style={{ color: "var(--text-muted)" }}>
          {formatSeriesStatus(game.seriesStatus)}
        </div>
      )}

      {/* MLB No-Hit / Perfect Game Alert — live MLB game, opposing batters
          have no hits past the 5th inning. Mirrors the MLB.com Gameday alert.
          Gated on the ratings/spoiler toggle (the alert reveals an in-progress
          score dynamic) and never shown on finished games. */}
      {isLive && showRatings && game.sport === "mlb" && game.noHitterPitchingTeam && (
        <div className="mb-1 flex justify-center">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${game.isPerfectGame ? "text-rose-500" : "text-amber-500"}`}
            style={{ background: game.isPerfectGame ? "rgba(244, 63, 94, 0.12)" : "rgba(245, 158, 11, 0.12)" }}
            title={game.isPerfectGame
              ? `${game.noHitterPitchingTeam}: no batter has reached base`
              : `${game.noHitterPitchingTeam} has not allowed a hit`}
          >
            <span aria-hidden>⚾</span>
            {game.isPerfectGame ? "Perfect Game" : "No-Hitter"}
          </span>
        </div>
      )}

      {/* MLB Cycle Watch — a live batter is one hit type away from the cycle.
          Like the No-Hit Alert: gated behind the ratings/spoiler toggle (it
          reveals a hot bat, not the score) and never shown on finished games.
          The batter + the hit they still need ride in the tooltip. */}
      {isLive && showRatings && game.sport === "mlb" && game.cycleWatch && (
        <div className="mb-1 flex justify-center">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-500"
            style={{ background: "rgba(14, 165, 233, 0.12)" }}
            title={`${game.cycleWatch.player} needs a ${game.cycleWatch.needs} for the cycle`}
          >
            <span aria-hidden>💎</span>
            Cycle Watch
          </span>
        </div>
      )}

      {/* Penalty Shootout badge removed 2026-06-30 (Jacob): knowing a match went to
          a shootout reveals it was level after extra time — a result spoiler, even
          gated behind the ratings toggle. */}

      {/* Tennis Deciding Set — live Grand Slam match level on sets, into the
          final set. Gated behind the ratings/spoiler toggle; reveals only that
          the sets are level, never who's ahead within the set. */}
      {isLive && showRatings && game.decidingSet && (
        <div className="mb-1 flex justify-center">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-500"
            style={{ background: "rgba(139, 92, 246, 0.12)" }}
            title="Match level on sets — into the deciding set"
          >
            <span aria-hidden>🎾</span>
            Deciding Set
          </span>
        </div>
      )}

      {/* Status bar: hide entirely when there's nothing useful to show */}
      {(() => {
        const hasStatusText = isLive || isFuture || nextGameDate || teamView || (!isFinished);
        // In ratings mode the schedule shows each finished game's rating
        // (GREAT/GOOD/MEH/SKIP) so you can see which past games were worth
        // watching; in Scores mode showRating is false → cards show FINAL.
        const hasRating = showRating;
        const hasBroadcast = !isFinished && game.broadcasts.length > 0;
        const showFinal = isFinished && !isPastDate && !teamView;
        // Series state now renders as a top banner above the card (see above),
        // not in the status bar's middle cell, so it's gone from showBar here.
        const showBar = hasStatusText || hasRating || hasBroadcast || showFinal || teamView;
        if (!showBar) return null;
        // Small ESPN link wrapper for upcoming-time / date labels.
        const withEspn = (node: ReactNode) => (
          <a
            href={espnUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: "inherit" }}
            title="View on ESPN"
            onClick={handleExternalClick(espnUrl)}
          >
            {node}
          </a>
        );
        return (
          <div className="game-meta-row relative flex flex-wrap items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-1 gap-y-0.5 sm:gap-x-1.5" style={{ color: "var(--text-muted)" }}>
            {/* Date/time never shrinks or clips (shrink-0) so the time always
                shows in full — including the ":00". When it + a wide network
                ("Sun 12:00PM" + "FS1 +2") can't share one line on a narrow mobile
                column, flex-wrap drops the network to its own line (still pinned
                right via ml-auto) instead of clipping the time (Jacob 6/9). */}
            <span className="shrink-0 whitespace-nowrap">
              {teamView ? (
                <span className="text-[11px] whitespace-nowrap">
                  {(() => {
                    const content = (
                      <>
                        <span className="font-bold" style={{ color: "var(--text)" }}>{teamViewDateLabel}</span>
                        {isFuture && teamViewTime ? <span style={{ color: "var(--text-muted)" }}> · {formatTime(teamViewTime)}</span> : null}
                        {teamViewDhTime ? <span style={{ color: "var(--text-muted)" }}> · {formatTime(teamViewDhTime)}</span> : null}
                        {isFinished && !hasRating ? <span style={{ color: "var(--text-muted)" }}> · FINAL</span> : null}
                      </>
                    );
                    // Finished-game ESPN link would spoil the score — render
                    // plain text; only link for pre/live dates.
                    return isFinished ? content : withEspn(content);
                  })()}
                </span>
              ) : isLive && gameProgress ? (
                (() => {
                  // Animated underline only when an actual game clock is shown
                  // (Q4 - 02:05) and the game isn't delayed. Quarter-only labels
                  // ("Q4", "Half", "▲5") get no underline because there's no
                  // time to tick down.
                  const hasClock = !gameProgress.delayed && /\d:\d/.test(gameProgress.full);
                  const tickCls = hasClock ? " live-clock" : "";
                  const colorCls = gameProgress.delayed
                    ? "text-yellow-500 font-medium hover:text-yellow-400 transition-colors"
                    : `text-green-500 font-medium hover:text-green-400 transition-colors${tickCls}`;
                  const staticCls = gameProgress.delayed ? "text-yellow-500 font-medium" : `text-green-500 font-medium${tickCls}`;
                  // A live game in active precipitation shows its current
                  // condition emoji right after the clock (🌧️). Spoiler-free
                  // and only when wet, so it never clutters a clear-sky card.
                  const wx = cardWeather?.rainingNow ? (
                    <span className="ml-1" title={`${cardWeather.nowLabel} at the venue`}>{cardWeather.nowIcon}</span>
                  ) : null;
                  return liveUrl ? (
                    <><a href={liveUrl} target="_blank" rel="noopener noreferrer" aria-label={gameProgress.label || undefined} className={colorCls} onClick={handleExternalClick(liveUrl)}><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></a>{wx}</>
                  ) : (
                    <><span className={staticCls} aria-label={gameProgress.label || undefined}><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></span>{wx}</>
                  );
                })()
              ) : showFinal && !hasRating ? (
                "FINAL"
              ) : nextGameDate ? (
                withEspn(
                  // ONE link (date + time underline together on hover, like
                  // before). DOW bold + dark; M/D + time muted (same size/color).
                  // Desktop: "Thu 6/11 - 7:00 PM"; mobile drops the M/D and
                  // shortens the time ("Thu 7 PM") (Jacob 6/9).
                  <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    <span className="font-bold" style={{ color: "var(--text)" }}>{nextGameDate === "Tomorrow" ? <><span className="sm:hidden">Tomo</span><span className="hidden sm:inline">Tomorrow</span></> : <><span className="sm:hidden">{(nextGameDate || "").split(" ")[0]}</span><span className="hidden sm:inline">{displayDow((nextGameDate || "").split(" ")[0])}</span></>}</span>
                    <span className="hidden sm:inline">{(nextGameDate || "").includes(" ") ? ` ${(nextGameDate || "").split(" ").slice(1).join(" ")}` : ""}{localTime ? ` - ${formatTime(localTime)}` : ""}</span>
                    <span className="sm:hidden">{localTime ? ` ${formatTime(localTime)}` : ""}</span>
                  </span>
                )
              ) : isFuture ? (
                // Normal today/future card with no date label — just the time
                // (left), full ":00" on desktop, shortened on mobile.
                withEspn(
                  <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    <span className="sm:hidden">{formatTime(localTime || cleanStatusDetail(game.statusDetail, false))}</span>
                    <span className="hidden sm:inline">{formatTime(localTime || cleanStatusDetail(game.statusDetail, false))}</span>
                  </span>
                )
              ) : null}
            </span>
            {/* Middle cell is rendered ONLY when it has breakpoint-visible content,
                so an empty middle never eats a flex gap (which was clipping the
                lead card's date to "T.." on mobile). The series variant is
                xl-only, so its wrapper is hidden below xl and the network's
                ml-auto pins it right (Jacob 6/9). */}
            {hasRating ? (
              // In-flow centered badge (NOT absolute): an absolute-centered badge
              // floats on top of the row, so a wide network listing ("FAN Unlmtd
              // +3") that reaches the card center gets the badge overlaid on it
              // (Jacob 6/15). Keeping it in flow makes it take real space, so a
              // wide network instead wraps to its own line (flex-wrap + ml-auto)
              // — no overlap. flex-1 still centers it in the slack; no min-w-0 so
              // the nowrap badge can't shrink-to-zero and overflow its cell.
              <span className="flex-1 flex justify-center"><RatingBadge rating={game.rating!} /></span>
            ) : game.seriesStatus && isFuture && showRatings && isToday && !nextGameDate ? (
              // Series state inline ONLY on wide (xl) columns where it fits
              // next to the bare time; narrower columns render it as the banner
              // above instead. Day-of-game only, same gate as the banner (6/12).
              <span className="min-w-0 flex-1 hidden xl:flex justify-center">
                <span
                  className="text-[11px] italic whitespace-nowrap truncate pr-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatSeriesStatus(game.seriesStatus!)}
                </span>
              </span>
            ) : null}
            <span className="shrink-0 ml-auto text-right">
              {hasBroadcast && (() => {
                const networkLink = (name: string, key: string | number) => {
                  const isPrime = /\b(amazon|prime)\b/i.test(name);
                  const isEspn = /\b(espn|abc)\b/i.test(name);
                  // ESPN chip should reuse game.streamUrl when it's already
                  // been upgraded to the airing UUID — networkStreamUrl()
                  // can only synthesize /watch/player/_/id/{numericId}.
                  const espnStream =
                    isEspn && game.streamUrl && /\/watch\/player\/_\/id\//.test(game.streamUrl)
                      ? game.streamUrl
                      : null;
                  const netUrl = networkStreamUrl(name, game.id, game.sport);
                  // MLB.tv gamePk deep link — reuse ONLY when this chip's own
                  // network is itself on mlb.com (MLB.TV / MLB Network / RSNs)
                  // or has no dedicated page. A national net (NBC, FOX, …) on an
                  // MLB game resolves to ITS own site, so route there, not MLB.tv.
                  const mlbStream =
                    game.sport === "mlb" && game.streamUrl && /mlb\.com\/tv\/g\d+/.test(game.streamUrl)
                    && (!netUrl || netUrl.includes("mlb.com"))
                      ? game.streamUrl
                      : null;
                  const href =
                    (isPrime && game.primeStreamUrl) ||
                    espnStream ||
                    mlbStream ||
                    netUrl ||
                    sportStreamFallback(game.sport);
                  return (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline transition-colors whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                      title={`Watch on ${name}`}
                      onClick={handleExternalClick(href)}
                    >
                      {shortNetwork(name)}
                    </a>
                  );
                };
                if (game.broadcasts.length > 1) {
                  // When the overlay is open, hide the inline row so it
                  // doesn't bleed through behind the expanded list.
                  if (broadcastExpanded) return null;
                  // The WHOLE "FOX +2" chip opens the network dropdown — the bare
                  // "+2" was too small a tap target, so taps landed on the FOX
                  // link and went straight to FOX instead of showing the list
                  // (Jacob 6/9). Pick the specific network from the expanded list.
                  return (
                    <button
                      type="button"
                      className="text-[11px] cursor-pointer hover:underline whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                      title={`See all networks: ${game.broadcasts.join(", ")}`}
                      // The "+N" is hidden on mobile (sm:inline), so the visible
                      // label is just the lead network — announce the popup and
                      // its open/closed state to screen readers, matching the
                      // aria-haspopup="dialog"/aria-expanded pattern every other
                      // popover toggle in the app uses (LeagueColumn's league-
                      // switch, NewsColumn's swap, HomeContent's filter). "dialog"
                      // (not the bare "true", which announces a menu that isn't
                      // there) matches the role="dialog" overlay it opens below.
                      aria-haspopup="dialog"
                      aria-expanded={broadcastExpanded}
                      onClick={(e) => { e.stopPropagation(); setBroadcastExpanded((v) => !v); }}
                    >
                      {shortNetwork(game.broadcasts[0])}<span className="hidden sm:inline"> +{game.broadcasts.length - 1}</span>
                    </button>
                  );
                }
                return (
                  <span className="text-[11px]">
                    {networkLink(game.broadcasts[0], 0)}
                  </span>
                );
              })()}
            </span>
          </div>
        );
      })()}

      {/* Expanded-networks overlay — anchored top-right, covers the records column
          on the team rows. Click × — or anywhere outside — to collapse back to "+N". */}
      {broadcastExpanded && game.broadcasts.length > 1 && (
        <div
          ref={broadcastOverlayRef}
          // The toggle above declares aria-haspopup="dialog" + aria-expanded, so
          // give the popover it opens a matching role + accessible name —
          // otherwise it surfaces to assistive tech as an anonymous, role-less
          // region. Same role="dialog" + aria-label pattern the rest of the app's
          // popovers use (LeagueColumn/NewsColumn league swap, the calendar).
          role="dialog"
          aria-label="Where to watch"
          className="absolute top-1 right-1 sm:top-2 sm:right-2 z-20 rounded-md px-1.5 py-1 max-w-[65%] shadow-md"
          style={{ background: "var(--bg)", border: "1px solid var(--border-hover)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-1.5">
            <div className="flex flex-col gap-0.5 text-[10px] sm:text-xs leading-tight">
              {game.broadcasts.map((b) => {
                const isPrime = /\b(amazon|prime)\b/i.test(b);
                const isEspn = /\b(espn|abc)\b/i.test(b);
                const espnStream =
                  isEspn && game.streamUrl && /\/watch\/player\/_\/id\//.test(game.streamUrl)
                    ? game.streamUrl
                    : null;
                const netUrl = networkStreamUrl(b, game.id, game.sport);
                // Reuse the MLB.tv gamePk deep link only when this chip's own
                // network is on mlb.com (MLB.TV / MLB Network / RSNs) or has no
                // page; a national net (NBC/FOX/…) routes to its own site.
                const mlbStream =
                  game.sport === "mlb" && game.streamUrl && /mlb\.com\/tv\/g\d+/.test(game.streamUrl)
                  && (!netUrl || netUrl.includes("mlb.com"))
                    ? game.streamUrl
                    : null;
                const href =
                  (isPrime && game.primeStreamUrl) ||
                  espnStream ||
                  mlbStream ||
                  netUrl ||
                  sportStreamFallback(game.sport);
                return (
                  <a
                    key={b}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline whitespace-nowrap"
                    style={{ color: "var(--text-muted)" }}
                    title={`Watch on ${b}`}
                    onClick={handleExternalClick(href)}
                  >
                    {b}
                  </a>
                );
              })}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setBroadcastExpanded(false); }}
              className="text-[11px] leading-none cursor-pointer shrink-0"
              style={{ color: "var(--text-muted)" }}
              title="Hide networks"
              aria-label="Hide networks"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Teams */}
      <div className="flex flex-col gap-y-0.5">
        {[
          { team: game.awayTeam, isTBD: awayTBD },
          { team: game.homeTeam, isTBD: homeTBD },
        ].map(({ team, isTBD }, idx) => (
          // Key by row slot (idx), not team identity: a "TBD vs TBD" playoff/World
          // Cup placeholder leaves BOTH teams with an empty id AND empty
          // abbreviation (see espn.ts — id/abbreviation fall back to ""), so
          // `team.id || team.abbreviation` collides to "" on both rows and trips
          // React's duplicate-key warning. The list is a fixed [away, home] pair,
          // so the index is the stable, unique identity here.
          <div key={idx} className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <span className="shrink-0">{logo(team, isTBD)}</span>
            {/* items-baseline (not center) keeps the World Cup #N seated on the
                same baseline as the name; the rank lives INSIDE this container so
                the whole name+rank unit centers against the flag as one piece
                (the container height is the name's, since the rank is smaller). */}
            <span className="team-name-container flex items-baseline gap-1 sm:gap-1.5 min-w-0">
              {(() => {
                const nameNode = useAbbreviations ? (
                  <span className="text-xs sm:text-sm whitespace-nowrap leading-none" style={{ color: "var(--text)" }} title={team.displayName}>{team.abbreviation}</span>
                ) : (
                  <span className="text-sm leading-none team-name truncate min-w-0" style={{ color: "var(--text)" }} title={team.displayName}>{displayShortName(team)}</span>
                );
                if (isTBD || !onSelectTeam || !team.id) return nameNode;
                return (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelectTeam(team); }}
                    className="cursor-pointer hover:underline decoration-dotted underline-offset-2 min-w-0"
                    title={`View ${team.displayName} schedule`}
                  >
                    {nameNode}
                  </button>
                );
              })()}
              {/* Ranking chip (#N) next to the name. World Cup uses the static
                  FIFA world ranking — a fixed pre-tournament fact, spoiler-safe
                  in every stage (its live group standing would NOT be). Every
                  other league uses its current overall standings rank, gated
                  exactly like the W-L record (upcoming/live only, hidden on
                  finished/past cards) so it leaks no more than the record does. */}
              {(() => {
                if (isTBD) return null;
                let rank: number | null = null;
                let title = "";
                if (game.sport === "fifa") {
                  rank = fifaRank(team.displayName);
                  // Guard the interpolation: fifaRank returns null for a team
                  // not in the snapshot table, and the render only bails on
                  // rank == null below — building the title unconditionally
                  // would bake a literal "#null" into it if that guard ever
                  // moved. Set it only when we actually have a rank.
                  if (rank != null) title = `FIFA world ranking: #${rank}`;
                } else if (team.rank != null && !effectivePastDate && !isFinished) {
                  rank = team.rank;
                  title = `${leagueLabel || "League"} standing: #${rank}`;
                }
                if (rank == null) return null;
                return (
                  <span className="team-rank text-[10px] sm:text-xs tabular-nums shrink-0 leading-none" style={{ color: "var(--text-muted)", opacity: 0.7 }} title={title}>#{rank}</span>
                );
              })()}
            </span>
            {/* Favorite-star: removed 2026-05-31, restored behind the Settings
                toggle 2026-06-11 (Jacob) — favoriting also lives in the
                team-schedule view + the Settings team picker. */}
            {showStars ? star(team.id, team.displayName, favoriteTeams.includes(team.id), isTBD) : null}
            <span className="flex-1 min-w-0" />
            {!isTBD && team.record && !effectivePastDate && !isFinished && !isFuture ? (
              <span className="text-[10px] sm:text-xs tabular-nums text-right whitespace-nowrap shrink-0 leading-none flex items-center" style={{ color: "var(--text-muted)" }}>{team.record}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Highlight buttons (official + top-search YouTube, plus NHL.com recap)
          live in the shared GameHighlights component so the score card and the
          details popup render identical buttons playing identical videos. */}
      <GameHighlights
        game={game}
        leagueLabel={leagueLabel}
        isToday={isToday}
        onPlayHighlight={onPlayHighlight}
        onPlayEmbed={onPlayEmbed}
      />
    </div>
  );
}
