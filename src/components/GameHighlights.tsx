"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { buildShareCard, type ShareCardMeta } from "@/lib/shareCard";
import { isDemoModeActive } from "@/lib/demoMode";
import { openExternal } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
import { getYouTubeSearchUrl, getOfficialChannelName, getCompetitionName, resolveHighlightVideo } from "@/lib/youtube";
import { getBakedHighlight, getCachedBakedHighlight } from "@/lib/highlights";

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
// search YouTube clips, plus official league-site recap / condensed videos
// where available.
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
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  wrapMargin?: string;
}) {
  const officialChannel = getOfficialChannelName(game.sport, leagueLabel);
  // MLB: keep the official MLB channel in the first slot so unscoped/team or
  // unofficial uploads never occupy the primary button. The secondary slot can
  // still surface a shorter team recap when one is available.
  const isMlb = game.sport === "mlb";
  const isFifa = game.sport === "fifa";
  // FIFA's short clips are embeddable, but need the YouTube iframe origin fix in
  // VideoModal. Keep the "2m" slot visible.
  const fifaShortEnabled = true;
  const hasOfficialButton = !!officialChannel && !(isFifa && !fifaShortEnabled);
  const initialBaked = getCachedBakedHighlight(game.sport, game.id);
  const initialOldMlbBake = isMlb && initialBaked?.mlbOrder !== "official-first";
  const initialOfficialId = isFifa ? initialBaked?.official : initialOldMlbBake ? initialBaked?.extended : initialBaked?.official;
  const initialSecondaryId = isFifa ? (initialBaked?.extended ?? initialBaked?.official) : initialOldMlbBake ? initialBaked?.official : initialBaked?.extended;
  const prefetchedVideoId = useRef<string | null>(initialSecondaryId ?? null);
  const prefetchedOfficialId = useRef<string | null>(initialOfficialId ?? null);
  const prefetchedTelemundoShortId = useRef<string | null>(initialBaked?.telemundo ?? null);
  const prefetchedTelemundoLongId = useRef<string | null>(initialBaked?.telemundoExtended ?? null);
  const prefetchStarted = useRef(false);
  const [fetchingOnClick, setFetchingOnClick] = useState<"official" | "search" | "telemundoShort" | "telemundoLong" | null>(null);
  // "loading" while prefetch (or click-time chain) is running. "found" once
  // resolveHighlightVideo returns an id. "missing" once the full retry chain
  // has been exhausted — the button is hidden in that state so the user
  // never gets dropped onto a YouTube search page.
  type HighlightStatus = "loading" | "found" | "missing";
  const [officialStatus, setOfficialStatus] = useState<HighlightStatus>(initialOfficialId ? "found" : "loading");
  const [searchStatus, setSearchStatus] = useState<HighlightStatus>(initialSecondaryId ? "found" : "loading");
  const [telemundoShortStatus, setTelemundoShortStatus] = useState<HighlightStatus>(initialBaked?.telemundo ? "found" : "loading");
  const [telemundoLongStatus, setTelemundoLongStatus] = useState<HighlightStatus>(initialBaked?.telemundoExtended ? "found" : "loading");
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

  const strictPrimaryChannel = isFifa || isMlb;
  const strictWorldCupChannel = isFifa;
  const primaryChannel = isMlb ? (officialChannel ?? undefined) : (isFifa ? "FIFA" : (officialChannel ?? undefined));
  const secondaryChannel = isMlb ? undefined : (isFifa ? "FOX Sports" : undefined);
  const modalFallbackUrl = isFifa && highlightUrl
    ? `${highlightUrl}${highlightUrl.includes("?") ? "&" : "?"}nss_no_fallback=1`
    : highlightUrl;
  useEffect(() => {
    if (!highlightUrl || prefetchStarted.current) return;
    prefetchStarted.current = true;
    const away = game.awayTeam.shortDisplayName;
    const home = game.homeTeam.shortDisplayName;
    const series = game.seriesNote;
    if (officialChannel) {
      (async () => {
        // Prefer server-prebaked IDs (news cron → /news/highlights.json, keyed on
        // sport + ESPN event id). When present the buttons resolve with NO live
        // /api/youtube lookup — instant, no per-card scrape, no stagger. The baked
        // 2nd id is already deduped against the 1st at bake time. Whichever id the
        // bake doesn't have yet falls back to the exact same live resolution below.
        //
        // Resolve BOTH buttons CONCURRENTLY. Each resolveHighlightVideo is a live
        // YouTube scrape; running them in series made the 2nd link pop in seconds
        // after the 1st (Jacob 7/7 — "started with 1, then added the 2nd"). The 2nd
        // can't exclude the 1st's id until that resolves, so it runs WITHOUT exclude
        // in parallel and only re-resolves (excluding the official) in the rare case
        // both land the same video — so the fast path stays one round-trip.
        //
        // World Cup 2nd button = the EXTENDED cut (prefer=extended): FOX/FIFA post
        // both a standard and a longer "Extended Highlights" per match, so the pair
        // reads "normal + extended". Hidden if no extended exists. (fifa-only;
        // competition is null for every other league.)
        const preferExtended = !!competition;
        const baked = await getBakedHighlight(game.sport, game.id);
        // Older World Cup prebakes stored the FOX full recap in `official` before
        // we split FIFA into short FIFA recap + full FOX recap. Treat that older
        // lone value as the secondary/full slot until the next prebake refreshes.
        const oldMlbBake = isMlb && baked?.mlbOrder !== "official-first";
        const bakedOfficial = isFifa ? baked?.official : oldMlbBake ? baked?.extended : baked?.official;
        const bakedSecondary = isFifa ? (baked?.extended ?? baked?.official) : oldMlbBake ? baked?.official : baked?.extended;
        const officialP = !hasOfficialButton
          ? Promise.resolve(null)
          : bakedOfficial
          ? Promise.resolve(bakedOfficial)
          : resolveHighlightVideo(away, home, dateStr, series, primaryChannel, undefined, competition, false, strictPrimaryChannel);
        // If the server prebake already found the primary clip but no secondary,
        // trust that miss for this page load instead of making every browser do
        // another slow live YouTube scrape. The 30-min prebake will fill
        // `extended` later if FOX/FIFA posts a distinct companion cut.
        const skipLiveSecondary = !isFifa && !!bakedOfficial && !bakedSecondary;
        const secondP = bakedSecondary
          ? Promise.resolve(bakedSecondary)
          : skipLiveSecondary
            ? Promise.resolve(null)
          : resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, undefined, competition, preferExtended, strictWorldCupChannel);
        const bakedTelemundoShort = baked?.telemundo ?? null;
        const bakedTelemundoLong = baked?.telemundoExtended ?? null;
        const telemundoShortP = isFifa
          ? bakedTelemundoShort
            ? Promise.resolve(bakedTelemundoShort)
            : resolveHighlightVideo(away, home, dateStr, series, "Telemundo Deportes", undefined, competition, false, true)
          : Promise.resolve(null);
        const telemundoLongP = isFifa
          ? bakedTelemundoLong
            ? Promise.resolve(bakedTelemundoLong)
            : resolveHighlightVideo(away, home, dateStr, series, "Telemundo Deportes", bakedTelemundoShort ? [bakedTelemundoShort] : undefined, competition, true, true)
          : Promise.resolve(null);
        const officialId = await officialP;
        prefetchedOfficialId.current = officialId;
        setOfficialStatus(officialId ? "found" : "missing");
        let secondId = await secondP;
        if (!baked?.extended && secondId && officialId && secondId === officialId) {
          // Collision — the parallel (unexcluded) 2nd landed the same clip as the
          // official. Re-resolve once, this time excluding it, so the two buttons
          // never play the same video. (Only for a freshly live-resolved 2nd — a
          // baked 2nd is already deduped at bake time.)
          secondId = await resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, [officialId], competition, preferExtended, strictWorldCupChannel);
        }
        prefetchedVideoId.current = secondId;
        setSearchStatus(secondId ? "found" : "missing");
        const telemundoShortId = await telemundoShortP;
        let telemundoLongId = await telemundoLongP;
        if (telemundoLongId && telemundoShortId && telemundoLongId === telemundoShortId) {
          telemundoLongId = await resolveHighlightVideo(away, home, dateStr, series, "Telemundo Deportes", [telemundoShortId], competition, true, true);
        }
        prefetchedTelemundoShortId.current = telemundoShortId;
        prefetchedTelemundoLongId.current = telemundoLongId;
        setTelemundoShortStatus(telemundoShortId ? "found" : "missing");
        setTelemundoLongStatus(telemundoLongId ? "found" : "missing");
      })();
    } else {
      // No official channel for this league — only the search button is rendered.
      // officialStatus is derived to "missing" below (effectiveOfficialStatus)
      // rather than set synchronously here, which would trigger a cascading
      // render (react-hooks/set-state-in-effect).
      (async () => {
        const baked = await getBakedHighlight(game.sport, game.id);
        const id = baked?.extended ?? baked?.official
          ?? await resolveHighlightVideo(away, home, dateStr, series, undefined, undefined, competition);
        prefetchedVideoId.current = id;
        setSearchStatus(id ? "found" : "missing");
      })();
    }
  }, [highlightUrl, game.sport, game.id, game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, officialChannel, primaryChannel, secondaryChannel, competition, hasOfficialButton, isMlb, strictPrimaryChannel, strictWorldCupChannel]);

  // When there is no official channel the official button never renders, so
  // treat officialStatus as "missing" without storing it in state.
  const effectiveOfficialStatus = hasOfficialButton ? officialStatus : "missing";
  // Gate on "found", not "!== missing": rendering a button while it's still
  // "loading" and then hiding it when it resolves to null is what made the 2nd
  // link "appear then disappear" (Jacob 7/7).
  // AND wait until BOTH slots have settled (resolved to found/missing) before
  // showing the row at all — otherwise a card that ends up with two buttons
  // flashes the 1st as a single full-width button (they're flex-1, so one-alone
  // stretches) and then "splits" when the 2nd lands (Jacob 7/7 — "should never
  // load that big 1 button"). Both resolve in parallel now, so the wait is just
  // the slower of the two, not the sum. When there's no official channel the
  // official slot is synchronously "missing" (never loading), so single-button
  // leagues still show as soon as their one button resolves.
  const bothSettled = effectiveOfficialStatus !== "loading" && searchStatus !== "loading";
  const showYouTube = !!(!isMlb && isFinished && highlightUrl && bothSettled && (effectiveOfficialStatus === "found" || searchStatus === "found"));
  const showTelemundo = !!(isFinished && highlightUrl && isFifa && (telemundoShortStatus === "found" || telemundoLongStatus === "found"));
  const showNhl = !!(isFinished && game.sport === "nhl" && (game.nhlRecapEmbed || game.nhlCondensedEmbed));
  // MLB uses the official MLB.com row we previously settled on: short recap
  // first, condensed game second. Do not substitute baked YouTube here: the
  // MLB YouTube "Full Game Highlights" and MLB.com Condensed were the same cut,
  // and showing the YouTube fallback by itself regresses the row into a lone
  // "Condensed" button when the MLB.com proxy is unavailable.
  const showMlbCondensed = isMlb && !!game.mlbCondensedPlaybackUrl;
  const showMlb = !!(isFinished && isMlb && (game.mlbRecapPlaybackUrl || showMlbCondensed));
  if (!showYouTube && !showTelemundo && !showNhl && !showMlb) return null;

  return (
    <>
      {/* Highlights — render only buttons whose video resolved (or is still
          resolving). A button whose full retry chain returns null is hidden
          rather than falling back to a YouTube search page. */}
      {showYouTube && (
        <div className={`${wrapMargin} flex gap-1`}>
          {hasOfficialButton && officialStatus === "found" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedOfficialId.current) {
                  onPlayHighlight(prefetchedOfficialId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("official");
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, primaryChannel, undefined, competition, false, strictPrimaryChannel);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedOfficialId.current = id;
                  setOfficialStatus("found");
                  onPlayHighlight(id, modalFallbackUrl!, shareCard);
                } else {
                  setOfficialStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "official" ? 0.5 : undefined }}
              aria-label={`${officialChannel} highlights`}
              // aria-busy conveys the in-flight fetch that the visible "Loading..."
              // swap shows sighted users; the aria-label above stays pinned to the
              // button's purpose so the name never collapses to "Loading...".
              // Matches the aria-busy pairing on EventCard's highlight buttons.
              aria-busy={fetchingOnClick === "official"}
              title={`${officialChannel} highlights`}
            >
              {fetchingOnClick === "official" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                <>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">{isDemoModeActive() ? "Watch" : isFifa ? "2m" : game.sport.toUpperCase()}</span>
                </>
              )}
            </button>
          )}
          {searchStatus === "found" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedVideoId.current) {
                  onPlayHighlight(prefetchedVideoId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("search");
                // Dedup against primary so the two buttons never play the same video.
                // World Cup prefers the extended cut (see prefetch note above).
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, secondaryChannel, [prefetchedOfficialId.current], competition, !!competition, strictWorldCupChannel);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedVideoId.current = id;
                  setSearchStatus("found");
                  onPlayHighlight(id, modalFallbackUrl!, shareCard);
                } else {
                  setSearchStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "search" ? 0.5 : undefined }}
              aria-label={isFifa ? "FOX full highlights" : "Top search result highlights"}
              // aria-busy conveys the in-flight fetch that the visible "Loading..."
              // swap shows sighted users; the aria-label above stays pinned so the
              // name never collapses to "Loading...". Matches EventCard's buttons.
              aria-busy={fetchingOnClick === "search"}
              title={isFifa ? "FOX full highlights" : "Top search result highlights"}
            >
              {fetchingOnClick === "search" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                  <>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                    {isFifa && (
                      <span className="text-[10px] font-medium">
                        <span className="sm:hidden">15+</span>
                        <span className="hidden sm:inline">~15+ min</span>
                      </span>
                    )}
                  </>
              )}
            </button>
          )}
        </div>
      )}

      {/* MLB.com official game videos: short recap + condensed game in one row. */}
      {showMlb && (
        <div className={`${wrapMargin} flex gap-1`}>
          {game.mlbRecapPlaybackUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const page = game.mlbRecapUrl || game.mlbRecapPlaybackUrl!;
                if (onPlayEmbed) onPlayEmbed("", page, "MLB.com", shareCard, game.mlbRecapPlaybackUrl, game.mlbRecapPoster);
                else openExternal(page);
              }}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="MLB.com game recap"
              title="MLB.com game recap"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium">3m Recap</span>
            </button>
          )}
          {showMlbCondensed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const page = game.mlbCondensedUrl || game.mlbCondensedPlaybackUrl!;
                if (onPlayEmbed) onPlayEmbed("", page, "MLB.com", shareCard, game.mlbCondensedPlaybackUrl, game.mlbCondensedPoster);
                else openExternal(page);
              }}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="MLB condensed game"
              title="MLB condensed game"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium">Condensed</span>
            </button>
          )}
        </div>
      )}

      {showTelemundo && (
        <div className={`${showYouTube ? "mt-1" : wrapMargin} flex gap-1`}>
          {telemundoShortStatus === "found" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedTelemundoShortId.current) {
                  onPlayHighlight(prefetchedTelemundoShortId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("telemundoShort");
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, "Telemundo Deportes", undefined, competition, false, true);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedTelemundoShortId.current = id;
                  setTelemundoShortStatus("found");
                  onPlayHighlight(id, modalFallbackUrl!, shareCard);
                } else {
                  setTelemundoShortStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "telemundoShort" ? 0.5 : undefined }}
              aria-label="Telemundo highlights"
              title="Telemundo highlights"
            >
              {fetchingOnClick === "telemundoShort" ? <span className="text-[10px]">Loading...</span> : (
                <>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">TEL</span>
                </>
              )}
            </button>
          )}
          {telemundoLongStatus === "found" && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedTelemundoLongId.current) {
                  onPlayHighlight(prefetchedTelemundoLongId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("telemundoLong");
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, "Telemundo Deportes", [prefetchedTelemundoShortId.current], competition, true, true);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedTelemundoLongId.current = id;
                  setTelemundoLongStatus("found");
                  onPlayHighlight(id, modalFallbackUrl!, shareCard);
                } else {
                  setTelemundoLongStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "telemundoLong" ? 0.5 : undefined }}
              aria-label="Telemundo extended highlights"
              title="Telemundo extended highlights"
            >
              {fetchingOnClick === "telemundoLong" ? <span className="text-[10px]">Loading...</span> : (
                <>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">TEL+</span>
                </>
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
