"use client";

import { useState, type ReactNode } from "react";
import { Game, Team } from "@/lib/types";
import { type ShareCardMeta } from "@/lib/shareCard";
import { networkStreamUrl, sportStreamFallback, espnGameUrl, displayShortName } from "@/lib/espn";
import { handleExternalClick } from "@/lib/openExternal";
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
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  // Plays a non-YouTube embed (NHL recaps via Brightcove) in the same modal.
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null) => void;
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
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color} text-white uppercase`}>
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
        alt="ESPN" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
    </a>
  );
}
*/


function formatGameProgress(game: Game): { full: string; short: string; delayed?: boolean } {
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
      if (delayed) return { full: `${base} ${reason}`, short: `${base} ${reason}`, delayed: true };
      return { full: base, short: base };
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
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : `${period - 3}OT`;
    if (clock && clock !== "0.0") return { full: `${p} - ${clock}`, short: p };
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

// Expand the short weekday ("Thu") to the full name ("Thursday") for desktop,
// where there's room (Jacob 6/9). Non-weekday labels ("Tomorrow") pass through.
const DOW_FULL: Record<string, string> = {
  Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday",
};
function expandDow(s: string): string {
  return DOW_FULL[s] ?? s;
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
        if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      } catch { /* fall through */ }
    }
    return cleaned;
  })();
  const network = game.broadcasts[0] ?? null;
  const networkHref = network
    ? ((/\b(amazon|prime)\b/i.test(network) && game.primeStreamUrl) || networkStreamUrl(network, game.id, game.sport) || sportStreamFallback(game.sport))
    : null;
  const cardClickable = !!onShowDetails;
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
        {network}
      </a>
    ) : (
      <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{network}</span>
    )
  ) : null;
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md px-2 sm:px-4 py-1 overflow-hidden transition-colors${cardClickable ? " cursor-pointer" : ""}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onClick={cardClickable ? () => onShowDetails!(game) : undefined}
      role={cardClickable ? "button" : undefined}
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
        <span className="shrink-0 inline-block w-[1.7rem]">{nextGameDate === "Tomorrow" ? "Tomo" : (nextGameDate || "").split(" ")[0]}</span>
        {localTime ? <span className="shrink-0 whitespace-nowrap">{formatTime(localTime)}</span> : null}
        <span className="ml-auto shrink-0 text-right">{networkNode}</span>
      </div>
      {/* Desktop: bold DOW only; the M/D + time flow right after as one muted run
          (same size & color as the time) — "Sat 6/13 - 8:30 PM", no big gap
          before the dash. Network pinned right (Jacob 6/9). */}
      <div className="hidden sm:flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="whitespace-nowrap">
          {expandDow((nextGameDate || "").split(" ")[0])}
          {(nextGameDate || "").includes(" ") ? ` ${(nextGameDate || "").split(" ").slice(1).join(" ")}` : ""}{localTime ? ` - ${formatTime(localTime)}` : ""}
        </span>
        {networkNode ? <span className="ml-auto whitespace-nowrap">{networkNode}</span> : null}
      </div>
      {/* Row 2: venue — "@ HOME". Series teams are fixed, so just the home side. */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>@</span>
        {home.logo ? <img src={home.logo} alt={home.abbreviation} title={home.displayName} width={16} height={16} className="w-4 h-4 object-contain shrink-0" /> : null}
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

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings, nextGameDate, pastDateLabel, isPastDate, isToday, onPlayHighlight, onPlayEmbed, leagueLabel, useAbbreviations, teamView, isDoubleheader, onSelectTeam, onShowDetails }: GameCardProps) {
  const [broadcastExpanded, setBroadcastExpanded] = useState(false);
  // Hide the rating badge while a live game is in a delay — rating returns
  // once play resumes.
  const isDelayed = game.state === "in" && /delay/i.test(game.statusDetail);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null && !isDelayed;
  // A live game whose rating is withheld because it's still in its 1st period
  // (see calculateRating's insufficient-signal gate). Surface a muted "Too
  // Early" pill where the rating badge would go so the empty slot reads as
  // intentional, not a missing/broken rating.
  const tooEarly = showRatings && game.state === "in" && game.rating === null && !isDelayed;
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
    // Bucket the game by its Eastern calendar day — the same basis the
    // scoreboard + date nav use (getDateString). Device-local bucketing broke
    // under UTC render contexts: a 9pm-ET game is past midnight UTC, so it
    // rolled into the next day and mislabeled (two "Yesterday" cards for games
    // played on different ET days).
    const etYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    // getDateString returns "YYYYMMDD" (no separators); etYmd is "YYYY-MM-DD".
    // Strip non-digits so both parse regardless of format.
    const toNum = (ymd: string) => { const s = ymd.replace(/\D/g, ""); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000; };
    const diffDays = toNum(etYmd) - toNum(getDateString(0));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  })() : null;
  const teamViewTime = teamView && isFuture ? (() => {
    const cleaned = cleanStatusDetail(game.statusDetail, true);
    if (cleaned && /\bTBD\b/i.test(cleaned)) return "TBD";
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch { /* fall through */ }
    return null;
  })() : null;
  // Doubleheader disambiguation: a finished game that shares its day with another
  // of the team's games shows its (device-local) start time, so the two FINAL
  // cards aren't visually identical. Time is not a spoiler.
  const teamViewDhTime = teamView && isFinished && isDoubleheader ? (() => {
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
          return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

  const star = (teamId: string, isFav: boolean, isTBD: boolean) =>
    !isTBD ? (
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavoriteTeam(teamId); }}
        className={`text-xs sm:text-sm leading-none transition-colors cursor-pointer ${isFav ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
        style={isFav ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
      >★</button>
    ) : null;

  const logo = (team: typeof game.awayTeam, isTBD: boolean) =>
    isTBD ? (
      <span className="w-4 h-4 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs rounded" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>
    ) : (
      <img src={team.logo} alt={team.abbreviation} title={team.displayName} width={24} height={24} className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
    );

  // Clicking the card body opens a spoiler-safe details popup. Inner
  // buttons/links that stopPropagation keep their own actions — team names
  // (schedule view), the live green status + network chip (jump to the
  // stream), highlight buttons, etc. Enabled in the per-team schedule view
  // too (Jacob 6/1) — tapping a schedule card opens its details popup; the
  // team-name button still navigates via its own stopPropagation handler.
  const cardClickable = !!onShowDetails;
  return (
    <div
      className={`rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${cardClickable ? " cursor-pointer" : ""}`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={cardClickable ? () => onShowDetails!(game) : undefined}
      role={cardClickable ? "button" : undefined}
      title={cardClickable ? "Game details" : undefined}
    >
      {/* Lookback card: "Last played · {date}" centered on the card's top row,
          normal date font/color (no ESPN link — it would spoil the score). */}
      {pastDateLabel && (
        <div className="mb-1 text-[11px] text-center whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
          {pastDateLabel}
        </div>
      )}
      {/* Playoff series state ("NY leads 1-0"). Two responsive placements (Jacob
          6/5–6/7): on WIDE columns (xl) it sits INLINE in the status-bar row's
          middle cell (same line as date/time + network — see below). On NARROW
          columns it can't fit there without truncating ("NY L…"), so it moves to
          its OWN row ABOVE the status bar — which also keeps the network in its
          top-right spot instead of getting bumped. Pre-game + ratings mode only
          (it's a spoiler); shown once (compact rows don't render it). */}
      {game.seriesStatus && isFuture && showRatings && (
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
          <div className="flex flex-wrap items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-1 gap-y-0.5 sm:gap-x-1.5" style={{ color: "var(--text-muted)" }}>
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
                  return liveUrl ? (
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={colorCls} onClick={handleExternalClick(liveUrl)}><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></a>
                  ) : (
                    <span className={staticCls}><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></span>
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
                    <span className="font-bold" style={{ color: "var(--text)" }}>{nextGameDate === "Tomorrow" ? <><span className="sm:hidden">Tomo</span><span className="hidden sm:inline">Tomorrow</span></> : <><span className="sm:hidden">{(nextGameDate || "").split(" ")[0]}</span><span className="hidden sm:inline">{expandDow((nextGameDate || "").split(" ")[0])}</span></>}</span>
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
              <span className="flex-1 flex justify-center"><RatingBadge rating={game.rating!} /></span>
            ) : tooEarly ? (
              <span className="flex-1 flex justify-center">
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-500/70 text-white uppercase whitespace-nowrap"
                  title="Too early to rate — check back after the 1st"
                >
                  Too Early
                </span>
              </span>
            ) : game.seriesStatus && isFuture && showRatings ? (
              // Series state inline ONLY on wide (xl) columns where it fits;
              // narrower columns render it as the banner above instead.
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
                      className="hover:underline transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      title={`Watch on ${name}`}
                      onClick={handleExternalClick(href)}
                    >
                      {name}
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
                  // The "+N" suffix is desktop-only: on the narrow mobile column
                  // three things (date · time · "FOX +2") couldn't share a line, so
                  // the network wrapped. Dropping just the suffix on mobile shows
                  // the bare lead network ("FOX") — keeps the full ":00" time AND
                  // fits one line at any time incl. ":30". Tapping still opens the
                  // full list, so no networks are lost (Jacob 6/10).
                  return (
                    <button
                      type="button"
                      className="text-[11px] cursor-pointer hover:underline whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                      title={`See all networks: ${game.broadcasts.join(", ")}`}
                      onClick={(e) => { e.stopPropagation(); setBroadcastExpanded((v) => !v); }}
                    >
                      {game.broadcasts[0]}<span className="hidden sm:inline"> +{game.broadcasts.length - 1}</span>
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
          on the team rows. Click × to collapse back to "+N". */}
      {broadcastExpanded && game.broadcasts.length > 1 && (
        <div
          className="absolute top-1 right-1 sm:top-2 sm:right-2 z-20 rounded-md px-1.5 py-1 max-w-[65%] shadow-md"
          style={{ background: "var(--bg)", border: "1px solid var(--border-hover)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-1.5">
            <div className="flex flex-col gap-0.5 text-[10px] sm:text-xs leading-tight">
              {game.broadcasts.map((b, i) => {
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
                    key={i}
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
        ].map(({ team, isTBD }) => (
          <div key={team.id || team.abbreviation} className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <span className="shrink-0">{logo(team, isTBD)}</span>
            <span className="team-name-container flex items-center shrink-0">
              {(() => {
                const nameNode = useAbbreviations ? (
                  <span className="text-xs sm:text-sm whitespace-nowrap leading-none" style={{ color: "var(--text)" }} title={team.displayName}>{team.abbreviation}</span>
                ) : (
                  <span className="text-sm whitespace-nowrap leading-none team-name" style={{ color: "var(--text)" }} title={team.displayName}>{displayShortName(team)}</span>
                );
                if (isTBD || !onSelectTeam || !team.id) return nameNode;
                return (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelectTeam(team); }}
                    className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
                    title={`View ${team.displayName} schedule`}
                  >
                    {nameNode}
                  </button>
                );
              })()}
            </span>
            {/* Favorite-star removed 2026-05-31 (Jacob) — favoriting still
                available via the team-schedule view. */}
            <span className="flex-1 min-w-0" />
            {!isTBD && team.record && !effectivePastDate && !isFinished ? (
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
