"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { buildShareCard, type ShareCardMeta } from "@/lib/shareCard";
import { isDemoModeActive } from "@/lib/demoMode";
import { openExternal } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
import { getYouTubeSearchUrl, getOfficialChannelName, getCompetitionName, resolveHighlightVideo } from "@/lib/youtube";

// Per-league buffer (hrs from game start) before showing the highlight button,
// and regulation period counts for the OT-extra calc below. Both are constant
// lookup tables with no per-render input, so they live at module scope rather
// than being re-allocated on every render of every game card.
// Buffers based on actual YouTube upload-timing research (April 2026).
const highlightBufferHours: Record<string, number> = {
  nba: 3.5, wnba: 3.5, ncaam: 4, ncaaw: 4, ncaaf: 5, nhl: 4.5, mlb: 5,
  nfl: 5, fifa: 3, epl: 3, mls: 3, ucl: 3, uel: 3, golf: 6, tennis: 4,
};
const regulationPeriods: Record<string, number> = { nba: 4, wnba: 4, ncaam: 2, ncaaw: 2, ncaaf: 4, nhl: 3, mlb: 9, nfl: 4, fifa: 2, epl: 2, mls: 2, ucl: 2, uel: 2, golf: 4, tennis: 3 };

// Shared highlight buttons for a finished game — the official-channel + top-
// search YouTube clips and (NHL only) the NHL.com recap / condensed videos.
// Extracted from GameCard so the score card AND the details popup render the
// exact same buttons playing the exact same resolved videos (Jacob 6/1 — the
// popup must "just match" the card). All resolution/prefetch lives here.
export default function GameHighlights({
  game,
  leagueLabel,
  isToday = false,
  onPlayHighlight,
  onPlayEmbed,
  wrapMargin = "mt-1 sm:mt-2",
}: {
  game: Game;
  leagueLabel?: string;
  isToday?: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null) => void;
  wrapMargin?: string;
}) {
  const prefetchedVideoId = useRef<string | null>(null);
  const prefetchedOfficialId = useRef<string | null>(null);
  const prefetchStarted = useRef(false);
  const [fetchingOnClick, setFetchingOnClick] = useState<"official" | "search" | null>(null);
  // "loading" while prefetch (or click-time chain) is running. "found" once
  // resolveHighlightVideo returns an id. "missing" once the full retry chain
  // has been exhausted — the button is hidden in that state so the user
  // never gets dropped onto a YouTube search page.
  type HighlightStatus = "loading" | "found" | "missing";
  const [officialStatus, setOfficialStatus] = useState<HighlightStatus>("loading");
  const [searchStatus, setSearchStatus] = useState<HighlightStatus>("loading");
  // Capture "now" once at mount so the highlights-ready gate below stays a pure
  // render — reading Date.now() during render is flagged by react-hooks/purity.
  // The buffer is multi-hour and the component remounts on every score refresh,
  // so a single read is indistinguishable in practice (matches the nowMs pattern
  // already used in LeagueColumn's "Last played" slate label).
  const [nowMs] = useState(() => Date.now());

  const isFinished = game.state === "post";

  const highlightsReady = isFinished && (() => {
    if (!isToday) return true;
    const gameStart = new Date(game.date).getTime();
    const otPeriods = Math.max(0, game.period - (regulationPeriods[game.sport] ?? 4));
    const otExtra = otPeriods * (game.sport === "mlb" ? 0.25 : 0.5); // extra innings shorter, OT ~30min each
    const bufferMs = ((highlightBufferHours[game.sport] ?? 4) + otExtra) * 60 * 60 * 1000;
    return nowMs > gameStart + bufferMs;
  })();

  // Pin the highlight query date to ET — the worker matches the YouTube
  // title's date strictly, and a UTC-shifted browser would push a late ET
  // game one day forward and 404 every labeled button. (Display time uses the
  // device's local zone; this is only the recap search key.)
  const dateStr = new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: getTimeZone() });
  // Competition token required in highlight titles for sports where the same two
  // teams meet across many competitions (World Cup only — see getCompetitionName).
  // null for every other league, so their query + behaviour are unchanged.
  const competition = getCompetitionName(game.sport);
  const highlightUrl = highlightsReady
    ? getYouTubeSearchUrl(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, competition)
    : null;

  // Matchup card for shared highlight links — built from the game so the
  // VideoModal's copy-link can render+upload the preview and hand back a
  // hidescore.com link that unfurls cleanly in iMessage. See lib/shareCard.
  const shareCard = useMemo(() => buildShareCard(game, leagueLabel), [game, leagueLabel]);

  const officialChannel = getOfficialChannelName(game.sport, leagueLabel);
  // MLB swap: the official "MLB" channel no longer posts the short game
  // recap — it now posts a long "Full Game Highlights" plus single-play
  // clips, while the normal-length "Game Highlights (M/D/YY)" recap lives on
  // the team channels (surfaced by the unscoped search). So for MLB the FIRST
  // (official-labeled) button resolves UNSCOPED to get the short recap, and
  // the SECOND button resolves the MLB channel to get the long full-game.
  // Every other league keeps channel-first for the primary button.
  const isMlb = game.sport === "mlb";
  const primaryChannel = isMlb ? undefined : (officialChannel ?? undefined);
  const secondaryChannel = isMlb ? (officialChannel ?? undefined) : undefined;
  useEffect(() => {
    if (!highlightUrl || prefetchStarted.current) return;
    prefetchStarted.current = true;
    const away = game.awayTeam.shortDisplayName;
    const home = game.homeTeam.shortDisplayName;
    const series = game.seriesNote;
    if (officialChannel) {
      (async () => {
        const officialId = await resolveHighlightVideo(away, home, dateStr, series, primaryChannel, undefined, competition);
        prefetchedOfficialId.current = officialId;
        setOfficialStatus(officialId ? "found" : "missing");
        // World Cup: show ONE official button. resolveHighlightVideo already
        // falls through from the FOX-channel lookup to the unscoped search,
        // which the worker restricts to official channels for WC — so the
        // separate "search" button only ever re-surfaces the same official
        // pool (or FIFA's alt-cast), i.e. a duplicate clip of the same game.
        // Drop it. (fifa-only; competition is null for every other league.)
        if (competition) {
          setSearchStatus("missing");
          return;
        }
        const id = await resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, [officialId], competition);
        prefetchedVideoId.current = id;
        setSearchStatus(id ? "found" : "missing");
      })();
    } else {
      // No official channel for this league — only the search button is rendered.
      setOfficialStatus("missing");
      resolveHighlightVideo(away, home, dateStr, series, undefined, undefined, competition).then((id) => {
        prefetchedVideoId.current = id;
        setSearchStatus(id ? "found" : "missing");
      });
    }
  }, [highlightUrl, game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, officialChannel, primaryChannel, secondaryChannel, competition]);

  const showYouTube = !!(isFinished && highlightUrl && (officialStatus !== "missing" || searchStatus !== "missing"));
  const showNhl = !!(isFinished && game.sport === "nhl" && (game.nhlRecapEmbed || game.nhlCondensedEmbed));
  if (!showYouTube && !showNhl) return null;

  return (
    <>
      {/* Highlights — render only buttons whose video resolved (or is still
          resolving). A button whose full retry chain returns null is hidden
          rather than falling back to a YouTube search page. */}
      {showYouTube && (
        <div className={`${wrapMargin} flex gap-1`}>
          {officialChannel && officialStatus !== "missing" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedOfficialId.current) {
                  onPlayHighlight(prefetchedOfficialId.current, highlightUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("official");
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, primaryChannel, undefined, competition);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedOfficialId.current = id;
                  setOfficialStatus("found");
                  onPlayHighlight(id, highlightUrl!, shareCard);
                } else {
                  setOfficialStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "official" ? 0.5 : undefined }}
              aria-label={`${officialChannel} highlights`}
              title={`${officialChannel} highlights`}
            >
              {fetchingOnClick === "official" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">{isDemoModeActive() ? "Watch" : game.sport.toUpperCase()}</span>
                </>
              )}
            </button>
          )}
          {searchStatus !== "missing" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedVideoId.current) {
                  onPlayHighlight(prefetchedVideoId.current, highlightUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("search");
                // Dedup against primary so the two buttons never play the same video.
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, secondaryChannel, [prefetchedOfficialId.current], competition);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedVideoId.current = id;
                  setSearchStatus("found");
                  onPlayHighlight(id, highlightUrl!, shareCard);
                } else {
                  setSearchStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "search" ? 0.5 : undefined }}
              aria-label={isMlb ? "MLB full game highlights" : "Top search result highlights"}
              title={isMlb ? "MLB full game highlights" : "Top search result highlights"}
            >
              {fetchingOnClick === "search" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              )}
            </button>
          )}
        </div>
      )}

      {/* NHL-only: full-game videos straight from NHL.com — the short recap
          (~5 min) and the longer condensed game (~10 min). Sits below the
          YouTube highlight buttons. Plays in the same in-app modal as every
          other clip (Brightcove embed); the modal's footer link still opens
          the NHL.com page. */}
      {showNhl && (
        <div className={`${showYouTube ? "mt-1" : wrapMargin} flex gap-1`}>
          {game.nhlRecapEmbed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const embed = game.nhlRecapEmbed!;
                const page = game.nhlRecapUrl || embed;
                if (onPlayEmbed) onPlayEmbed(embed, page, "NHL.com", shareCard);
                else openExternal(page);
              }}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="NHL.com recap (~5 min)"
              title="NHL.com recap (~5 min)"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium">5<span className="sm:hidden">m</span><span className="hidden sm:inline"> min</span></span>
            </button>
          )}
          {game.nhlCondensedEmbed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const embed = game.nhlCondensedEmbed!;
                const page = game.nhlCondensedUrl || embed;
                if (onPlayEmbed) onPlayEmbed(embed, page, "NHL.com", shareCard);
                else openExternal(page);
              }}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="NHL.com condensed game (~10 min)"
              title="NHL.com condensed game (~10 min)"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium">10<span className="sm:hidden">m</span><span className="hidden sm:inline"> min</span></span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
