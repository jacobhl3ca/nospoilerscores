"use client";

import { useEffect, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { openExternal, handleExternalClick } from "@/lib/openExternal";
import { networkStreamUrl, sportStreamFallback } from "@/lib/espn";
import { getTimeZone, etSlateYmd } from "@/lib/etDay";
import { type ShareCardMeta } from "@/lib/shareCard";
import { getDateString } from "@/components/DateNav";
import { fetchGameWeather, type GameWeather } from "@/lib/weather";
import GameHighlights from "@/components/GameHighlights";
import CalendarButtons from "@/components/CalendarButtons";
import { buildCalendarEvent } from "@/lib/calendarLink";

// Typical game length (hours) per sport, used to bound the rain window. Soccer
// ~2.5h, ball sports ~3.5h; default 3h. The rain-chance block only surfaces
// rain forecast to fall within [start − 1h, start + length + 1h] — an hour
// before through about an hour after the game is slotted to play.
const GAME_LENGTH_H: Record<string, number> = {
  mlb: 3.5, nfl: 3.5, ncaaf: 3.5, cfl: 3.5,
  fifa: 2.5, mls: 2.5,
  tennis: 3, f1: 2.5,
};
function gameLengthHours(sport: string): number {
  return GAME_LENGTH_H[sport] ?? 3;
}

// Matchup row — logo + name, no score/winner. Stateless
// and dependent only on its props, so it lives at module scope rather than
// inside the component body (declaring a component during render remounts it
// every render and resets any state).
function TeamRow({ team }: { team: Game["homeTeam"] }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {team.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={team.logo} alt="" width={32} height={32} loading="lazy" decoding="async" className="w-8 h-8 object-contain shrink-0" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
        : <span className="w-8 h-8 flex items-center justify-center rounded text-xs shrink-0" style={{ background: "var(--bg-card-hover)", color: "var(--text-muted)" }}>?</span>}
      <span className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>
        {team.displayName || team.shortDisplayName || team.abbreviation}
      </span>
    </div>
  );
}

// Lightweight, SPOILER-SAFE game details popup. Shown when a score/ratings card
// is tapped. Never renders score, winner, or rating unless `showRatings` is on
// (the user has already opted into spoilers) — and even then only the rating
// badge, never the raw score line. W-L records are not rendered at all — they
// were removed 2026-09-05 (see preferences.ts). Pre/live/final use one shell.
export default function GameDetailModal({
  game,
  showRatings,
  onClose,
  leagueLabel,
  onPlayHighlight,
  onPlayEmbed,
  onShowGroup,
  reminderLinkTemplate,
}: {
  game: Game;
  showRatings: boolean;
  onClose: () => void;
  leagueLabel?: string;
  // Settings → Reminder link. Blank = no "Remind me" button (CalendarButtons).
  reminderLinkTemplate?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  // World Cup group games: open the all-groups overlay with this group spotlit.
  onShowGroup?: (groupName: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management (WCAG 2.4.3): move focus into the dialog on open so
  // keyboard / screen-reader users land inside the overlay instead of being
  // stranded on the page behind it, and restore focus to the element that
  // opened it on close. Focusing the dialog CONTAINER (tabIndex=-1) rather than
  // a control keeps mouse users from seeing a focus ring while still handing the
  // dialog + its aria-label to assistive tech; the first Tab then reaches the
  // close button. The modal mounts fresh per open (parent renders it behind a
  // `detailGame &&` guard), so this fires on every open/close — same lifecycle
  // as the Escape + scroll-lock effects. Empty deps: capture the opener once.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    // Trap Tab within the dialog (WCAG 2.4.3). aria-modal="true" only tells
    // assistive tech the page behind is inert — it does NOT stop a sighted
    // keyboard user from Tabbing straight out of the overlay into the content
    // behind it. Wrap focus at the first/last focusable control so Tab and
    // Shift+Tab cycle inside the modal until Escape or Close dismisses it,
    // matching the focus-in / restore this effect already does. Focusables are
    // queried live on each keypress so async content (highlights, video embed)
    // that mounts after open is included, and offsetParent filters out any
    // hidden control so focus never lands on a display:none element.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  // Lock body scroll while the modal is open (same technique as VideoModal /
  // SettingsPanel). Plain overflow:hidden doesn't reliably stop iOS WebKit from
  // scrolling the feed behind the dialog; pinning the body at its current offset
  // with position:fixed + negative top does, and restoring it on close returns
  // you exactly where you were. The modal root is position:fixed, so pinning the
  // body underneath doesn't move the dialog.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Local venue weather (outdoor, non-final games with a known location). Fetched
  // on open via Open-Meteo; null while loading, on failure, or for games beyond
  // the ~15-day forecast horizon — in all those cases the block simply hides.
  const [weather, setWeather] = useState<GameWeather | null>(null);
  useEffect(() => {
    if (game.state === "post" || game.venueRoof || !game.venueLocation) return;
    let cancelled = false;
    // fetchGameWeather is cached + deduped, so if the card already prefetched
    // on hover/tap this resolves instantly.
    fetchGameWeather(game.venueLocation, game.date)
      .then((w) => { if (!cancelled) setWeather(w); })
      .catch(() => {});
    // Clear in cleanup (before the next run / on close) rather than at the top
    // of the effect body — same reset semantics without a synchronous setState
    // in the effect, which triggers a cascading render (react-hooks lint).
    return () => { cancelled = true; setWeather(null); };
  }, [game.id, game.venueLocation, game.venueRoof, game.date, game.state]);

  // Rain only matters around game time. Restrict the rain-chance block to the
  // window [start − 1h → start + game length + 1h] (per-sport length) and base
  // the gate + peak + bars on just those hours — so a dry evening game no
  // longer shows a scary morning spike. timeline hours are venue-local, like
  // gameHour24. Falls to null (block hidden) when no in-window hours are known.
  const rainWindow = (() => {
    if (!weather) return null;
    const playStart = weather.gameHour24;
    const playEnd = weather.gameHour24 + gameLengthHours(game.sport);
    const hours = weather.timeline.filter((t) => t.hour24 >= playStart - 1 && t.hour24 <= playEnd + 1);
    if (!hours.length) return null;
    let peak = 0;
    let peakLabel = "";
    for (const t of hours) if (t.rainPct > peak) { peak = t.rainPct; peakLabel = t.label; }
    // playStart/playEnd let the timeline highlight the hours during the match
    // (vs the ±1h buffer) so it's clear whether rain actually overlaps play.
    return { hours, peak, peakLabel, playStart, playEnd };
  })();

  // The cup-stage line ("Group J") is tappable for World Cup group games — it
  // opens the all-groups overlay with that group outlined (see onShowGroup).
  const wcGroup =
    game.sport === "fifa" && game.stage && /^group\s+[a-l]$/i.test(game.stage.trim())
      ? game.stage.trim()
      : null;

  const isLive = game.state === "in";
  const isFinal = game.state === "post";
  // Mirror the score card, which suppresses the rating badge while a live game
  // is in a weather/heat delay (game.rating stays non-null through the delay —
  // the card hides it by choice, see GameCard's isDelayed guard). Without the
  // same gate the modal would show a GREAT/GOOD/MEH/SKIP badge for a delayed
  // game the card is deliberately hiding it on, so the SAME game read two
  // different ways card↔modal — the mismatch the rating block already warns to
  // "keep in sync". The rating returns once play resumes.
  const isDelayed = isLive && /delay/i.test(game.statusDetail);
  const liveUrl = game.streamUrl;
  // Whether this game is on today's (ET) slate — drives the highlight-ready
  // buffer in GameHighlights (today's finals wait for the recap upload window;
  // past games show immediately).
  // Bucket the game to its ET slate day the SAME way getDateString(0) derives
  // "today" (getEtServiceDate's 1 AM rollover), so a game kicking off between
  // midnight and 1 AM stays on the same day both sides call it. A raw calendar
  // day here would drift from the service day in that window and make the modal
  // disagree with the card on isToday (GameHighlights must "just match" the card).
  const isToday = etSlateYmd(game.date) === getDateString(0);

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

  // "Add to calendar" / "Remind me" — pre-game only, and null when there is no
  // honest event to make (TBD team, bad date, tennis day-only fallback).
  const calendarEvent = buildCalendarEvent(game, leagueLabel);

  // Name the dialog after the matchup so screen readers announce which game's
  // details opened (e.g. "Yankees at Red Sox — game details") instead of a
  // generic "Game details" on every card. Mirrors VideoModal's content-specific
  // dialog name. Team names carry no score, so this stays spoiler-safe; falls
  // back to the generic label if either name is missing.
  const awayName = game.awayTeam.displayName || game.awayTeam.shortDisplayName || game.awayTeam.abbreviation;
  const homeName = game.homeTeam.displayName || game.homeTeam.shortDisplayName || game.homeTeam.abbreviation;
  const dialogLabel = awayName && homeName ? `${awayName} at ${homeName} — game details` : "Game details";

  // Thresholds MUST match the score-card badge (GameCard/GolfLeaderboard
  // RatingBadge: 85/70/50) — this modal renders the identical label+color for
  // the same game.rating, so a mismatch made the SAME game read e.g. "GOOD" on
  // the card yet "GREAT" here (a rating of 82). Keep these three in sync.
  const ratingTier = (r: number) =>
    r >= 85 ? { label: "GREAT", bg: "bg-green-600" }
    : r >= 70 ? { label: "GOOD", bg: "bg-yellow-600" }
    : r >= 50 ? { label: "MEH", bg: "bg-orange-600" }
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
        ref={dialogRef}
        // tabIndex=-1 makes the container programmatically focusable (see the
        // focus-management effect) without adding it to the tab order; outline
        // none suppresses the ring since it's focused only to seat assistive tech.
        tabIndex={-1}
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Matchup — names + logos, NO score/winner and no W-L record. */}
        <div className="flex flex-col gap-1 mb-4 pr-6">
          <TeamRow team={game.awayTeam} />
          <TeamRow team={game.homeTeam} />
        </div>

        {/* Status + time */}
        <div className="text-sm mb-1" style={{ color: "var(--text)" }}>
          <span className="font-medium">{statusLabel}</span>
          {/* Wrap the start time in a semantic <time> so the machine-readable
              ISO (game.date) is exposed to assistive tech / crawlers while the
              visible, zone-formatted text stays unchanged. Mirrors VideoModal's
              <time dateTime> treatment of the article timestamp. */}
          {timeLabel ? <span style={{ color: "var(--text-muted)" }}> · <time dateTime={game.date}>{timeLabel}</time></span> : null}
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
            {game.stage}
          </button>
        ) : game.playoffLabel || game.stage || game.isPreseason ? (
          // The modal's round line. isPreseason is last because a game can only
          // be one of these — an exhibition has no playoff round and no cup
          // stage — but the two real labels stay ahead of it so a future data
          // shape that set both never hides the more specific one.
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{game.playoffLabel || game.stage || "Preseason"}</div>
        ) : null}

        {/* Venue — name · city/region — with the ESPN-style gametime weather
            (icon + temp + BOLD condition, so intensity reads at a glance) pinned
            to the RIGHT of the stadium line. Covered venues (roof/indoor) carry
            no weather at all — they're hidden in the fetch effect — so there's
            nothing to caveat; only open-air games surface weather. */}
        {game.venue || weather ? (
          <div className="flex items-start justify-between gap-3 mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="min-w-0" style={{ color: "var(--text-secondary)" }}>
              {game.venue}
              {game.venueLocation ? ` · ${game.venueLocation}` : ""}
            </span>
            {weather ? (
              // Live game → show the venue's CURRENT conditions (real-time
              // emoji), so a mid-game drizzle reads even when the first-pitch
              // forecast was dry. Pre-game → the gametime forecast.
              // The condition emoji is decorative here: the spelled-out label
              // ({nowLabel}/{label}) sits right beside it, so left exposed a
              // screen reader reads the glyph's raw Unicode name ("sun behind
              // small cloud") on top of "Partly cloudy". aria-hidden drops the
              // redundant glyph so only the temp + label speak — the intended
              // treatment the GameCard live-weather emoji's comment already
              // names as the reason this line differs from its own (that emoji
              // stands alone with no adjacent label, so it gets role="img"). No
              // visual change: aria-hidden on an inline span doesn't affect layout.
              <span className="shrink-0 whitespace-nowrap">
                {game.state === "in" ? (
                  <><span aria-hidden="true">{weather.nowIcon}</span> {weather.nowTempF}° · <span className="font-semibold">{weather.nowLabel}{weather.rainingNow ? " now" : ""}</span></>
                ) : (
                  <><span aria-hidden="true">{weather.icon}</span> {weather.tempF}° · <span className="font-semibold">{weather.label}</span></>
                )}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Rain-chance timeline — below the venue line, full width. Shown only
            when meaningful rain (≥30%) is forecast within the game window (1h
            before → ~1h after the game's slotted play), not across the day. */}
        {rainWindow && rainWindow.peak >= 30 ? (
          <div className="text-xs mb-1 mt-1.5" style={{ color: "var(--text-muted)" }}>
            {/* Impact line: exposure (only open-air games reach here) + the
                peak chance. Intensity is the BOLD condition on the venue line
                above (Drizzle < Rain < Showers < Thunderstorm). */}
            <div className="text-[10px] uppercase tracking-wide mb-0.5">
              Open air · peak {rainWindow.peak}% rain{rainWindow.peakLabel ? ` at ${rainWindow.peakLabel}` : ""}
            </div>
            {/* The bars encode each hour's rain chance by height/opacity alone —
                the per-bar `title` only surfaces on mouse hover, so screen-reader
                and touch users got nothing. role="img" + a spelled-out aria-label
                exposes the full hourly breakdown as a single accessible figure. */}
            <div
              className="flex items-end gap-[2px] h-6"
              role="img"
              aria-label={`Rain chance by hour: ${rainWindow.hours.map((t) => `${t.label} ${t.rainPct}%`).join(", ")}`}
            >
              {rainWindow.hours.map((t) => (
                <div
                  key={t.hour24}
                  aria-hidden="true"
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
            <div className="flex gap-[2px] mt-0.5" aria-hidden="true">
              {rainWindow.hours.map((t) => {
                const duringPlay = t.hour24 >= rainWindow.playStart && t.hour24 <= rainWindow.playEnd;
                return (
                  <div
                    key={t.hour24}
                    className="flex-1 text-center text-[9px] leading-none"
                    style={duringPlay ? { color: "var(--accent)", fontWeight: 600 } : undefined}
                  >
                    {t.label.replace(" ", "")}
                  </div>
                );
              })}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.7 }} aria-hidden="true">
              Highlighted hours are during the game.
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

        {/* Add to calendar / Remind me — upcoming games only. Sits where
            "Watch live" sits for a live game; the two never show together. */}
        {!isFinal && !isLive ? (
          <CalendarButtons event={calendarEvent} reminderTemplate={reminderLinkTemplate} onClose={onClose} />
        ) : null}

        {/* Competitiveness rating — ONLY when the user already revealed ratings. */}
        {showRatings && game.rating !== null && (isFinal || isLive) && !isDelayed ? (
          <div className="flex items-center gap-2 mt-3">
            {/* Screen readers otherwise announce a bare "MEH"/"SKIP" here with no
                hint it's the game's worth-watching rating — the same role="img" +
                spoken aria-label the score-card badge (GameCard/GolfLeaderboard
                RatingBadge) already carries; this modal was the lone outlier.
                Title-case the label in the spoken name so engines don't spell the
                short all-caps word out letter-by-letter. Unlike the card, this
                modal's ratingTier never yields the "OK" initialism (GREAT/GOOD/
                MEH/SKIP only), so no OK guard is needed. Visible text unchanged. */}
            <span
              role="img"
              aria-label={`Worth-watching rating: ${ratingTier(game.rating).label.charAt(0) + ratingTier(game.rating).label.slice(1).toLowerCase()}`}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${ratingTier(game.rating).bg}`}
            >
              {ratingTier(game.rating).label}
            </span>
          </div>
        ) : null}

        {/* Watch-live button for in-progress games with a stream link. */}
        {isLive && liveUrl ? (
          <button
            type="button"
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
