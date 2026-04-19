"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Game, Team } from "@/lib/types";
import { networkStreamUrl, sportStreamFallback, espnGameUrl } from "@/lib/espn";
import { openExternal, handleExternalClick } from "@/lib/openExternal";
import { getYouTubeSearchUrl, getHighlightSearchQuery, fetchFirstVideoId, getOfficialChannelName, getHighlightDateTokens } from "@/lib/youtube";

interface GameCardProps {
  game: Game;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  nextGameDate?: string;
  isPastDate?: boolean;
  isToday?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
  leagueLabel?: string;
  useAbbreviations?: boolean;
  // When true, render the game's own date on the top-left regardless of state,
  // and treat finished games like past-date cards (hide records, show highlights).
  // Used by the per-team schedule view.
  teamView?: boolean;
  // When set, clicking a team name opens that team's schedule view in the column.
  onSelectTeam?: (team: Team) => void;
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


function formatGameProgress(game: Game): { full: string; short: string } {
  const { sport, statusDetail, clock, period } = game;
  if (sport === "mlb") {
    const m = statusDetail.match(/^(Top|Bot|Mid|End)\s+(\d+)/i);
    if (m) {
      const half = m[1].toLowerCase();
      const inn = m[2];
      const arrow = (half === "top" || half === "mid") ? "▲" : "▼";
      const full = `${arrow}${inn}`;
      return { full, short: full }; // already compact
    }
    return { full: statusDetail, short: statusDetail.slice(0, 3) };
  }
  if (sport === "ncaam") {
    // NCAAM uses halves, not quarters
    const h = period <= 2 ? `H${period}` : period === 3 ? "OT" : `${period - 2}OT`;
    if (clock && clock !== "0.0") return { full: `${h} ${clock}`, short: h };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: h, short: h };
  }
  if (sport === "nba") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} ${clock}`, short: q };
    if (statusDetail.toLowerCase().includes("half")) return { full: "Half", short: "HT" };
    return { full: q, short: q };
  }
  if (sport === "nhl") {
    const p = period <= 3 ? `P${period}` : period === 4 ? "OT" : `${period - 3}OT`;
    if (clock && clock !== "0.0") return { full: `${p} ${clock}`, short: p };
    return { full: p, short: p };
  }
  if (sport === "nfl") {
    const q = period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
    if (clock && clock !== "0.0") return { full: `${q} ${clock}`, short: q };
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

export default function GameCard({ game, favoriteTeams, onToggleFavoriteTeam, showRatings, nextGameDate, isPastDate, isToday, onPlayHighlight, leagueLabel, useAbbreviations, teamView, onSelectTeam }: GameCardProps) {
  const prefetchStarted = useRef(false);
  // undefined = still fetching, null = no valid same-date video, string = ready videoId
  const [officialVideoId, setOfficialVideoId] = useState<string | null | undefined>(undefined);
  const [searchVideoId, setSearchVideoId] = useState<string | null | undefined>(undefined);
  const [broadcastExpanded, setBroadcastExpanded] = useState(false);
  const showRating = showRatings && (game.state === "post" || game.state === "in") && game.rating !== null;
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
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dDay.getTime() - today.getTime()) / (24 * 3600 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })() : null;
  const teamViewTime = teamView && isFuture ? (() => {
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch { /* fall through */ }
    return null;
  })() : null;
  const localTime = isFuture ? (() => {
    const cleaned = cleanStatusDetail(game.statusDetail, true);
    // ESPN returns "Scheduled" with no time for some leagues (EPL, MLS) — derive from game.date
    if (!cleaned || cleaned.toLowerCase() === "scheduled") {
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

  // Per-league buffer (hrs from game start) before showing highlight button
  // Based on actual YouTube upload timing research (April 2026)
  const highlightBufferHours: Record<string, number> = {
    nba: 3.5,  // ~2.5hr game + highlights up in 30-60min
    ncaam: 4,  // ~2hr game + highlights up in 1-3hrs (varies by matchup prominence)
    nhl: 4.5,  // ~2.5hr game + highlights up in 1-3hrs (Sportsnet/NHL)
    mlb: 5,    // ~3hr game + highlights up in ~2hrs (verified Dodgers-Jays 4/6/26)
    nfl: 5,    // ~3.5hr game + highlights up in 1-2hrs
    fifa: 3,   // ~2hr match + highlights up quickly
    epl: 3,    // ~2hr match + highlights up quickly
    mls: 3,    // ~2hr match + highlights up quickly
    golf: 6,   // ~5hr round + recap upload delay
    tennis: 4, // ~2-3hr match + highlights up in 1-2hrs
  };
  const regulationPeriods: Record<string, number> = { nba: 4, ncaam: 2, nhl: 3, mlb: 9, nfl: 4, fifa: 2, epl: 2, mls: 2, golf: 4, tennis: 3 };
  const highlightsReady = isFinished && (() => {
    if (!isToday) return true;
    const gameStart = new Date(game.date).getTime();
    const otPeriods = Math.max(0, game.period - (regulationPeriods[game.sport] ?? 4));
    const otExtra = otPeriods * (game.sport === "mlb" ? 0.25 : 0.5); // extra innings shorter, OT ~30min each
    const bufferMs = ((highlightBufferHours[game.sport] ?? 4) + otExtra) * 60 * 60 * 1000;
    return Date.now() > gameStart + bufferMs;
  })();

  const dateStr = new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dateTokens = useMemo(() => getHighlightDateTokens(game.date), [game.date]);
  const highlightUrl = highlightsReady
    ? getYouTubeSearchUrl(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, game.date)
    : null;

  // Pre-fetch YouTube video IDs in background (official channel + top search).
  // fetchFirstVideoId returns null if the YT title doesn't prove the video is
  // for this game's date — we hide the button in that case rather than fall
  // through to a YouTube search tab (which would surface wrong-date results).
  const officialChannel = getOfficialChannelName(game.sport, leagueLabel);
  useEffect(() => {
    if (!highlightUrl || prefetchStarted.current) return;
    prefetchStarted.current = true;
    const query = getHighlightSearchQuery(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, game.date);
    fetchFirstVideoId(query, undefined, dateTokens).then((id) => setSearchVideoId(id));
    if (officialChannel) {
      fetchFirstVideoId(query, officialChannel, dateTokens).then((id) => setOfficialVideoId(id));
    } else {
      setOfficialVideoId(null);
    }
  }, [highlightUrl, game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.date, officialChannel, game.seriesNote, dateTokens]);

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

  // Live games: clicking the card body (anywhere except inner buttons/links
  // that stopPropagation — team names, star, broadcast chip, Q1 link) opens
  // the stream. Same UUID-aware URL as the Q1 / ABC chip use.
  const cardClickable = isLive && !!liveUrl;
  return (
    <div
      className={`rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${cardClickable ? " cursor-pointer" : ""}`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={cardClickable ? () => openExternal(liveUrl!) : undefined}
      role={cardClickable ? "link" : undefined}
      title={cardClickable ? "Watch live" : undefined}
    >
      {/* Status bar: hide entirely when there's nothing useful to show */}
      {(() => {
        const hasStatusText = isLive || isFuture || nextGameDate || teamView || (!isFinished);
        const hasRating = showRating;
        const hasBroadcast = !isFinished && game.broadcasts.length > 0;
        const showFinal = isFinished && !isPastDate && !teamView;
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
          <div className="grid items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-2 sm:gap-x-3" style={{ color: "var(--text-muted)", gridTemplateColumns: "1fr auto 1fr" }}>
            <span>
              {teamView ? (
                <span className="text-[11px] whitespace-nowrap">
                  {withEspn(
                    <>
                      <span className="font-bold" style={{ color: "var(--text)" }}>{teamViewDateLabel}</span>
                      {isFuture && teamViewTime ? <span style={{ color: "var(--text-muted)" }}> · {teamViewTime}</span> : null}
                      {isFinished && !hasRating ? <span style={{ color: "var(--text-muted)" }}> · FINAL</span> : null}
                    </>
                  )}
                </span>
              ) : isLive && gameProgress ? (
                liveUrl ? (
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-green-500 font-medium hover:text-green-400 transition-colors" onClick={handleExternalClick(liveUrl)}><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></a>
                ) : (
                  <span className="text-green-500 font-medium"><span className="hidden sm:inline">{gameProgress.full}</span><span className="sm:hidden">{gameProgress.short}</span></span>
                )
              ) : showFinal && !hasRating ? (
                "FINAL"
              ) : nextGameDate ? (
                withEspn(
                  <span className="text-[11px] whitespace-nowrap">
                    <span className="font-bold underline underline-offset-2" style={{ color: "var(--text)" }}>
                      <span className="hidden sm:inline">{nextGameDate}</span>
                      <span className="sm:hidden">{nextGameDate === "Tomorrow" ? "Tomo" : nextGameDate}</span>
                    </span>
                    {localTime ? ` - ${localTime}` : ""}
                  </span>
                )
              ) : isFuture ? (
                withEspn(
                  <span className="text-[11px] whitespace-nowrap">{localTime || cleanStatusDetail(game.statusDetail, false)}</span>
                )
              ) : null}
            </span>
            <span>
              {hasRating && <RatingBadge rating={game.rating!} />}
            </span>
            <span className="truncate text-right">
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
                  const href =
                    (isPrime && game.primeStreamUrl) ||
                    espnStream ||
                    networkStreamUrl(name, game.id, game.sport) ||
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
                  return (
                    <span className="text-[10px] sm:text-xs">
                      {networkLink(game.broadcasts[0], 0)}
                      <button
                        type="button"
                        className="ml-1 cursor-pointer hover:underline"
                        style={{ color: "var(--text-muted)" }}
                        title={game.broadcasts.slice(1).join(", ")}
                        onClick={(e) => { e.stopPropagation(); setBroadcastExpanded((v) => !v); }}
                      >
                        +{game.broadcasts.length - 1}
                      </button>
                    </span>
                  );
                }
                return (
                  <span className="text-[10px] sm:text-xs">
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
                const href =
                  (isPrime && game.primeStreamUrl) ||
                  espnStream ||
                  networkStreamUrl(b, game.id, game.sport) ||
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
                  <span className="text-sm whitespace-nowrap leading-none team-name" style={{ color: "var(--text)" }} title={team.displayName}>{team.shortDisplayName}</span>
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
            <span className="shrink-0 flex items-center">
              {star(team.id, favoriteTeams.includes(team.id), isTBD)}
            </span>
            <span className="flex-1 min-w-0" />
            {!isTBD && team.record && !effectivePastDate && !isFinished ? (
              <span className="text-[10px] sm:text-xs tabular-nums text-right whitespace-nowrap shrink-0 leading-none flex items-center" style={{ color: "var(--text-muted)" }}>{team.record}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Highlights — only render each button if we have a validated same-date
          video (or we are still fetching). Never open a YouTube search tab:
          that surfaces wrong-date uploads. */}
      {isFinished && highlightUrl && (officialVideoId !== null || searchVideoId !== null) && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          {officialChannel && officialVideoId !== null && (
            <button
              onClick={() => {
                if (!onPlayHighlight || typeof officialVideoId !== "string") return;
                onPlayHighlight(officialVideoId, highlightUrl);
              }}
              disabled={officialVideoId === undefined}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: officialVideoId === undefined ? 0.5 : undefined }}
              title={`${officialChannel} highlights`}
            >
              {officialVideoId === undefined ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">{game.sport.toUpperCase()}</span>
                </>
              )}
            </button>
          )}
          {searchVideoId !== null && (
            <button
              onClick={() => {
                if (!onPlayHighlight || typeof searchVideoId !== "string") return;
                onPlayHighlight(searchVideoId, highlightUrl);
              }}
              disabled={searchVideoId === undefined}
              className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: searchVideoId === undefined ? 0.5 : undefined }}
              title="Top search result highlights"
            >
              {searchVideoId === undefined ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
