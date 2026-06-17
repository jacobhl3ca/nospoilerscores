"use client";

import { useEffect, useState } from "react";
import { Game } from "@/lib/types";
import { openExternal, handleExternalClick } from "@/lib/openExternal";
import { networkStreamUrl, sportStreamFallback } from "@/lib/espn";
import { getTimeZone } from "@/lib/etDay";
import { type ShareCardMeta } from "@/lib/shareCard";
import { getDateString } from "@/components/DateNav";
import { fetchGameWeather, type GameWeather } from "@/lib/weather";
import GameHighlights from "@/components/GameHighlights";

// Typical game length (hours) per sport, used to bound the rain window. Soccer
// ~2.5h, ball sports ~3.5h; default 3h. The rain-chance block only surfaces
// rain forecast to fall within [start − 1h, start + length + 1h] — an hour
// before through about an hour after the game is slotted to play.
const GAME_LENGTH_H: Record<string, number> = {
  mlb: 3.5, nfl: 3.5, ncaaf: 3.5,
  fifa: 2.5, mls: 2.5,
  tennis: 3, f1: 2.5,
};
function gameLengthHours(sport: string): number {
  return GAME_LENGTH_H[sport] ?? 3;
}

// Lightweight, SPOILER-SAFE game details popup. Shown when a score/ratings card
// is tapped. Never renders score, winner, or rating unless `showRatings` is on
// (the user has already opted into spoilers) — and even then only the rating
// badge, never the raw score line. Pre/live/final all use the same shell.
export default function GameDetailModal({
  game,
  showRatings,
  onClose,
  leagueLabel,
  onPlayHighlight,
  onPlayEmbed,
  onShowGroup,
}: {
  game: Game;
  showRatings: boolean;
  onClose: () => void;
  leagueLabel?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null) => void;
  // World Cup group games: open the all-groups overlay with this group spotlit.
  onShowGroup?: (groupName: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Local venue weather (outdoor, non-final games with a known location). Fetched
  // on open via Open-Meteo; null while loading, on failure, or for games beyond
  // the ~15-day forecast horizon — in all those cases the block simply hides.
  const [weather, setWeather] = useState<GameWeather | null>(null);
  useEffect(() => {
    setWeather(null);
    if (game.state === "post" || game.venueRoof || !game.venueLocation) return;
    let cancelled = false;
    // fetchGameWeather is cached + deduped, so if the card already prefetched
    // on hover/tap this resolves instantly.
    fetchGameWeather(game.venueLocation, game.date)
      .then((w) => { if (!cancelled) setWeather(w); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [game.id, game.venueLocation, game.venueRoof, game.date, game.state]);

  // Rain only matters around game time. Restrict the rain-chance block to the
  // window [start − 1h → start + game length + 1h] (per-sport length) and base
  // the gate + peak + bars on just those hours — so a dry evening game no
  // longer shows a scary morning spike. timeline hours are venue-local, like
  // gameHour24. Falls to null (block hidden) when no in-window hours are known.
  const rainWindow = (() => {
    if (!weather) return null;
    const lo = weather.gameHour24 - 1;
    const hi = weather.gameHour24 + gameLengthHours(game.sport) + 1;
    const hours = weather.timeline.filter((t) => t.hour24 >= lo && t.hour24 <= hi);
    if (!hours.length) return null;
    let peak = 0;
    let peakLabel = "";
    for (const t of hours) if (t.rainPct > peak) { peak = t.rainPct; peakLabel = t.label; }
    return { hours, peak, peakLabel };
  })();

  // The cup-stage line ("Group J") is tappable for World Cup group games — it
  // opens the all-groups overlay with that group outlined (see onShowGroup).
  const wcGroup =
    game.sport === "fifa" && game.stage && /^group\s+[a-l]$/i.test(game.stage.trim())
      ? game.stage.trim()
      : null;

  const isLive = game.state === "in";
  const isFinal = game.state === "post";
  const liveUrl = game.streamUrl;
  // Whether this game is on today's (ET) slate — drives the highlight-ready
  // buffer in GameHighlights (today's finals wait for the recap upload window;
  // past games show immediately).
  const isToday = (() => {
    try {
      const ymd = new Date(game.date).toLocaleDateString("en-CA", { timeZone: getTimeZone() }).replace(/-/g, "");
      return ymd === getDateString(0);
    } catch { return false; }
  })();

  // Start time / status WITHOUT score. For live we say "In progress" rather
  // than the period/clock (the clock alone is fine, but keep it minimal +
  // spoiler-free — no score ever leaks here).
  const timeLabel = (() => {
    try {
      const d = new Date(game.date);
      if (!isNaN(d.getTime())) {
        // Render in the user's chosen zone (Settings → Time zone; defaults to
        // the device zone, so this still matches their own clock out of the
        // box). The short abbreviation updates to match the chosen zone.
        return d.toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
          timeZone: getTimeZone(),
        });
      }
    } catch { /* fall through */ }
    return "";
  })();

  const statusLabel = isFinal ? "Final" : isLive ? "In progress" : "Upcoming";

  const TeamRow = ({ team }: { team: Game["homeTeam"] }) => (
    <div className="flex items-center gap-3 min-w-0">
      {team.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={team.logo} alt="" width={32} height={32} className="w-8 h-8 object-contain shrink-0" />
        : <span className="w-8 h-8 flex items-center justify-center rounded text-xs shrink-0" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>}
      <span className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>
        {team.displayName || team.shortDisplayName || team.abbreviation}
      </span>
      {/* W-L record is not a spoiler of THIS game — safe to show. */}
      {team.record ? (
        <span className="ml-auto text-xs tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>{team.record}</span>
      ) : null}
    </div>
  );

  const ratingTier = (r: number) =>
    r >= 80 ? { label: "GREAT", bg: "bg-green-600" }
    : r >= 55 ? { label: "GOOD", bg: "bg-yellow-600" }
    : r >= 30 ? { label: "MEH", bg: "bg-orange-600" }
    : { label: "SKIP", bg: "bg-red-700" };

  // A clickable broadcaster name — same resolution as the score card's network
  // chips (Jacob 6/1): Prime/ESPN/MLB deep-links when available, else the
  // network's own page, else a sport-level fallback. Opens via openExternal so
  // it deep-links into the network app on mobile.
  const networkLink = (name: string, key: string | number) => {
    const isPrime = /\b(amazon|prime)\b/i.test(name);
    const isEspn = /\b(espn|abc)\b/i.test(name);
    const espnStream =
      isEspn && game.streamUrl && /\/watch\/player\/_\/id\//.test(game.streamUrl) ? game.streamUrl : null;
    const netUrl = networkStreamUrl(name, game.id, game.sport);
    const mlbStream =
      game.sport === "mlb" && game.streamUrl && /mlb\.com\/tv\/g\d+/.test(game.streamUrl)
      && (!netUrl || netUrl.includes("mlb.com")) ? game.streamUrl : null;
    const href = (isPrime && game.primeStreamUrl) || espnStream || mlbStream || netUrl || sportStreamFallback(game.sport);
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80 transition-opacity"
        style={{ color: "var(--accent)" }}
        title={`Watch on ${name}`}
        onClick={handleExternalClick(href)}
      >
        {name}
      </a>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Matchup — names + logos, NO score/winner */}
        <div className="flex flex-col gap-1 mb-4 pr-6">
          <TeamRow team={game.awayTeam} />
          <TeamRow team={game.homeTeam} />
        </div>

        {/* Status + time */}
        <div className="text-sm mb-1" style={{ color: "var(--text)" }}>
          <span className="font-medium">{statusLabel}</span>
          {timeLabel ? <span style={{ color: "var(--text-muted)" }}> · {timeLabel}</span> : null}
        </div>

        {/* Series/playoff label (US sports) or cup stage (soccer) — both
            spoiler-free: "West Finals · Game 7", "Group H", "Round of 16". */}
        {wcGroup && onShowGroup ? (
          <button
            type="button"
            onClick={() => onShowGroup(wcGroup)}
            className="text-xs mb-1 underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer text-left"
            style={{ color: "var(--accent)" }}
            title="See this group"
          >
            {game.stage} ▸
          </button>
        ) : game.playoffLabel || game.stage ? (
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{game.playoffLabel || game.stage}</div>
        ) : null}

        {/* Venue — name · city/region · roof — with the ESPN-style gametime
            weather (icon + temp + condition) pinned to the RIGHT of the stadium
            line. A "Roof"/"Indoor" tag flags a covered field (rain won't reach
            play); open-air is the norm, so it gets no tag and the weather +
            rain timeline below stand. */}
        {game.venue || weather ? (
          <div className="flex items-start justify-between gap-3 mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="min-w-0">
              {game.venue}
              {game.venueLocation ? ` · ${game.venueLocation}` : ""}
              {game.venueRoof === "indoor" ? " · Indoor" : game.venueRoof === "roof" ? " · Roof (covered)" : ""}
            </span>
            {weather ? (
              <span className="shrink-0 whitespace-nowrap">
                {weather.icon} {weather.tempF}° · {weather.label}
                {weather.rainPct >= 30 ? ` · ${weather.rainPct}%` : ""}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Rain-chance timeline — below the venue line, full width. Shown only
            when meaningful rain (≥30%) is forecast within the game window (1h
            before → ~1h after the game's slotted play), not across the day. */}
        {rainWindow && rainWindow.peak >= 30 ? (
          <div className="text-xs mb-1 mt-1.5" style={{ color: "var(--text-muted)" }}>
            <div className="text-[10px] uppercase tracking-wide mb-0.5">
              Rain chance{rainWindow.peakLabel ? ` · peak ${rainWindow.peak}% ${rainWindow.peakLabel}` : ""}
            </div>
            <div className="flex items-end gap-[2px] h-6">
              {rainWindow.hours.map((t) => (
                <div
                  key={t.hour24}
                  title={`${t.label} · ${t.rainPct}% rain`}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.max(2, Math.round((t.rainPct / 100) * 24))}px`,
                    background: "var(--accent)",
                    opacity: 0.3 + 0.7 * (t.rainPct / 100),
                  }}
                />
              ))}
            </div>
            <div className="flex gap-[2px] mt-0.5">
              {rainWindow.hours.map((t) => (
                <div key={t.hour24} className="flex-1 text-center text-[9px] leading-none">
                  {t.label.replace(" ", "")}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Probable starting pitchers — COMMENTED OUT 6/16 (Jacob: may fold
            elements of ESPN's gamecast in here later). Data is still parsed into
            game.{home,away}Probable, so re-enabling is just uncommenting.
        {!isFinal && !isLive && (game.awayProbable || game.homeProbable) ? (
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            <div className="uppercase tracking-wide">Probables</div>
            <div>{game.awayTeam.abbreviation} · {game.awayProbable ?? "TBD"}</div>
            <div>{game.homeTeam.abbreviation} · {game.homeProbable ?? "TBD"}</div>
          </div>
        ) : null}
        */}

        {/* Broadcasts — only useful before/while the game is on. Once it's
            final the "where to watch" channels are noise, so hide them. */}
        {game.broadcasts.length > 0 && !isFinal ? (
          <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            <span className="uppercase tracking-wide">Watch: </span>
            {game.broadcasts.flatMap((b, i) => (i === 0 ? [networkLink(b, i)] : [" · ", networkLink(b, i)]))}
          </div>
        ) : null}

        {/* Competitiveness rating — ONLY when the user already revealed ratings. */}
        {showRatings && game.rating !== null && (isFinal || isLive) ? (
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${ratingTier(game.rating).bg}`}>
              {ratingTier(game.rating).label}
            </span>
          </div>
        ) : null}

        {/* Watch-live button for in-progress games with a stream link. */}
        {isLive && liveUrl ? (
          <button
            onClick={() => { openExternal(liveUrl); onClose(); }}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Watch live
          </button>
        ) : null}

        {/* Highlights — the SAME official + top-search buttons the score card
            renders (Jacob 6/1, "should just match"), playing the same resolved
            videos in the in-app player. Tapping one is an explicit choice (it
            can spoil), so it sits at the very bottom, below the rating. */}
        <GameHighlights
          game={game}
          leagueLabel={leagueLabel ?? ""}
          isToday={isToday}
          onPlayHighlight={onPlayHighlight}
          onPlayEmbed={onPlayEmbed}
          wrapMargin="mt-4"
        />
      </div>
    </div>
  );
}
