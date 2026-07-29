"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { buildShareCard, type ShareCardMeta } from "@/lib/shareCard";
import { isDemoModeActive } from "@/lib/demoMode";
import { openExternal } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
import { getYouTubeSearchUrl, getOfficialChannelName, getCompetitionName, resolveHighlightVideo, resolveTelemundoWorldCupVideo } from "@/lib/youtube";
import { getBakedHighlight, getCachedBakedHighlight } from "@/lib/highlights";
import { resolveMlbGameVideos, type MlbGameVideos } from "@/lib/espn";

// Per-league buffer (hrs from game start) before showing the highlight button,
// and regulation period counts for the OT-extra calc below. Both are constant
// lookup tables with no per-render input, so they live at module scope rather
// than being re-allocated on every render of every game card.
// Buffers based on actual YouTube upload-timing research (April 2026).
const highlightBufferHours: Record<string, number> = {
  nba: 3.5, wnba: 3.5, ncaam: 4, ncaaw: 4, ncaaf: 5, nhl: 4.5, mlb: 5,
  nfl: 5, fifa: 3, epl: 3, mls: 3, ucl: 3, uel: 3, golf: 6, tennis: 4,
};
// ncaaw is 4, not 2: women's college hoops plays four 10-min quarters (moved to
// quarters in 2015-16), so a finished regulation game reports period 4. A value
// of 2 made otPeriods = 4 - 2 = 2 for EVERY regulation game, adding a phantom
// 1-hour double-OT buffer that delayed the highlight buttons. ncaam stays 2
// (men's still play two 20-min halves). Mirrors SPORT_RATING_CONFIG in espn.ts.
const regulationPeriods: Record<string, number> = { nba: 4, wnba: 4, ncaam: 2, ncaaw: 4, ncaaf: 4, nhl: 3, mlb: 9, nfl: 4, fifa: 2, epl: 2, mls: 2, ucl: 2, uel: 2, golf: 4, tennis: 3 };

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
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null, alternates?: { label: string; videoId: string }[]) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  wrapMargin?: string;
}) {
  const officialChannel = getOfficialChannelName(game.sport, leagueLabel);
  // MLB: keep the official MLB channel in the first slot so unscoped/team or
  // unofficial uploads never occupy the primary button. The secondary slot can
  // still surface a shorter team recap when one is available.
  const isMlb = game.sport === "mlb";
  const isFifa = game.sport === "fifa";
  // ?demo=1 is a page-load staging toggle (it never changes without a
  // navigation that remounts this component), so read it once on mount instead
  // of re-parsing window.location.search on every render — these buttons
  // reconcile on each 10s score poll for every finished game on screen. Mirrors
  // HomeContent, which likewise reads isDemoModeActive() once at fetch time.
  const demoActive = useMemo(() => isDemoModeActive(), []);
  // FIFA's short 2m clips frequently hit YouTube embed restrictions AND the live
  // resolver often lands the wrong clip for them, so keep the primary row to the
  // FOX full cut; the Spanish Telemundo pair still fills the second row when
  // those prebaked/search-resolved clips exist. (Jacob 7/16: tried enabling the
  // short cut, reverted — it surfaced a mismatched clip.)
  const fifaShortEnabled = false;
  const fifaTelemundoEnabled = true;
  const hasOfficialButton = !!officialChannel && !(isFifa && !fifaShortEnabled);
  const initialBaked = getCachedBakedHighlight(game.sport, game.id);
  const initialTrustedBaked = initialBaked ?? null;
  const initialOldMlbBake = isMlb && initialTrustedBaked?.mlbOrder !== "official-first";
  const initialOfficialId = isFifa && !fifaShortEnabled ? null : isFifa ? initialTrustedBaked?.official : initialOldMlbBake ? initialTrustedBaked?.extended : initialTrustedBaked?.official;
  const initialSecondaryId = isFifa ? (initialTrustedBaked?.extended ?? initialTrustedBaked?.official) : initialOldMlbBake ? initialTrustedBaked?.official : initialTrustedBaked?.extended;
  const prefetchedVideoId = useRef<string | null>(initialSecondaryId ?? null);
  const prefetchedOfficialId = useRef<string | null>(initialOfficialId ?? null);
  const prefetchedTelemundoShortId = useRef<string | null>(fifaTelemundoEnabled ? (initialTrustedBaked?.telemundo ?? null) : null);
  const prefetchedTelemundoLongId = useRef<string | null>(fifaTelemundoEnabled ? (initialTrustedBaked?.telemundoExtended ?? null) : null);
  const prefetchStarted = useRef(false);
  const [fetchingOnClick, setFetchingOnClick] = useState<"official" | "search" | "telemundoShort" | "telemundoLong" | null>(null);
  // "loading" while prefetch (or click-time chain) is running. "found" once
  // resolveHighlightVideo returns an id. "missing" once the full retry chain
  // has been exhausted — the button is hidden in that state so the user
  // never gets dropped onto a YouTube search page.
  type HighlightStatus = "loading" | "found" | "missing";
  const [officialStatus, setOfficialStatus] = useState<HighlightStatus>(initialOfficialId ? "found" : "loading");
  const [searchStatus, setSearchStatus] = useState<HighlightStatus>(initialSecondaryId ? "found" : "loading");
  const [telemundoShortStatus, setTelemundoShortStatus] = useState<HighlightStatus>(
    fifaTelemundoEnabled && isFifa ? (initialTrustedBaked?.telemundo ? "found" : "loading") : "missing",
  );
  const [telemundoLongStatus, setTelemundoLongStatus] = useState<HighlightStatus>(
    fifaTelemundoEnabled && isFifa ? (initialTrustedBaked?.telemundoExtended ? "found" : "loading") : "missing",
  );
  // "now" for the highlights-ready gate below. Read via useState (not Date.now()
  // during render, which react-hooks/purity flags) and advanced by a slow tick in
  // the effect further down. GameCard reconciles this component in place on every
  // score poll — it's keyed by the stable game.id, so it does NOT remount — which
  // means this initializer runs only at mount. Without the tick, nowMs would
  // freeze at page-load time and a game that was already final at load but still
  // inside its multi-hour buffer window would never reveal its highlight buttons
  // until a reload.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // MLB Recap/Condensed for surfaces that DON'T run the dated board enrich — the
  // team timeline (fetchTeamSchedule) and the "Last played"/lookahead fallback
  // slates hand us a finished MLB game with no mlbRecap* fields, so the 3m Recap
  // button never showed there (Jacob 7/16, only the 10m). Self-resolve them
  // (cached per date, shared across cards on the same day) so the 3m shows on
  // every surface, not just the main board.
  const [resolvedMlb, setResolvedMlb] = useState<MlbGameVideos | null>(null);
  const mlbResolvedForId = useRef<string | null>(null);

  const isFinished = game.state === "post";

  const highlightsReady = isFinished && (() => {
    if (!isToday) return true;
    const gameStart = new Date(game.date).getTime();
    // A completed game is gated on game.state, not the date, so a present-but-
    // malformed game.date from ESPN reaches here (same note as the dateStr guard
    // below). An unparseable date makes gameStart NaN, so the `nowMs > gameStart
    // + bufferMs` check is forever false and this today's-final card would NEVER
    // reveal its highlight buttons short of a reload. Treat a bad date as ready,
    // matching the !isToday early-return and the degrade-safely dateStr fallback.
    if (Number.isNaN(gameStart)) return true;
    const otPeriods = Math.max(0, game.period - (regulationPeriods[game.sport] ?? 4));
    const otExtra = otPeriods * (game.sport === "mlb" ? 0.25 : 0.5); // extra innings shorter, OT ~30min each
    const bufferMs = ((highlightBufferHours[game.sport] ?? 4) + otExtra) * 60 * 60 * 1000;
    return nowMs > gameStart + bufferMs;
  })();

  // Advance nowMs once a minute, but only while it still gates a today's-final
  // card (see the nowMs note above for why the mount-time read alone goes stale),
  // and stop as soon as the buffer opens so we're not holding an idle timer.
  useEffect(() => {
    if (!isToday || !isFinished || highlightsReady) return;
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [isToday, isFinished, highlightsReady]);

  // Pin the highlight query date to ET — the worker matches the YouTube
  // title's date strictly, and a UTC-shifted browser would push a late ET
  // game one day forward and 404 every labeled button. (Display time uses the
  // device's local zone; this is only the recap search key.)
  //
  // Guard the parse before formatting: a completed game (state === "post") is
  // gated on `game.state`, not the date, so a present-but-malformed game.date
  // from ESPN still reaches here — and toLocaleDateString on an Invalid Date
  // returns the literal string "Invalid Date", which would get baked into every
  // highlight query ("Away vs Home highlights Invalid Date") and 404 the labeled
  // lookups. Fall back to an empty date token so the query degrades to the
  // undated form the resolvers already retry with, instead of a poisoned one.
  // (Same isNaN guard etSlateYmd/shareCard/WorldCupBracket already apply; valid
  // dates are byte-for-byte unchanged.)
  const gameDate = new Date(game.date);
  const dateStr = isNaN(gameDate.getTime())
    ? ""
    : gameDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: getTimeZone() });
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

  const primaryChannel = isMlb ? (officialChannel ?? undefined) : (isFifa ? "FIFA" : (officialChannel ?? undefined));
  const secondaryChannel = isMlb ? undefined : (isFifa ? "FOX Sports" : primaryChannel);
  const strictPrimaryChannel = !!primaryChannel;
  const strictSecondaryChannel = !!secondaryChannel;
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
          : resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, undefined, competition, preferExtended, strictSecondaryChannel);
        const bakedTelemundoShort = baked?.telemundo ?? null;
        const bakedTelemundoLong = baked?.telemundoExtended ?? null;
        const telemundoShortP = isFifa && fifaTelemundoEnabled
          ? bakedTelemundoShort
            ? Promise.resolve(bakedTelemundoShort)
            : resolveTelemundoWorldCupVideo(away, home, dateStr, series)
          : Promise.resolve(null);
        const telemundoLongP = isFifa && fifaTelemundoEnabled
          ? bakedTelemundoLong
            ? Promise.resolve(bakedTelemundoLong)
            // Live-resolve the extended cut too (prefer=extended). Telemundo
            // posts a distinct "Resumen Extendido" for every WC match, not just
            // the baked ones — without this, non-baked games only ever showed
            // the short TEL link. The short/long collision re-resolve below
            // (excluding the short id) keeps the two buttons from playing the
            // same video when only one cut is up yet.
            : resolveTelemundoWorldCupVideo(away, home, dateStr, series, undefined, true)
          : Promise.resolve(null);
        if (isFifa && fifaTelemundoEnabled) {
          (async () => {
            const telemundoShortId = await telemundoShortP;
            let telemundoLongId = await telemundoLongP;
            // If the extended resolve returned the SAME clip as the short, there
            // is no distinct "Resumen Extendido" for this game yet — hide the 2nd
            // Telemundo button. Do NOT re-search with the short excluded: that
            // could surface a DIFFERENT game's recap (observed: Switzerland-
            // Argentina's exclude-retry returned England-Norway's clip). The
            // prefer=extended query already returns the true extended cut when one
            // exists, so a collision means there simply isn't one.
            if (telemundoLongId && telemundoLongId === telemundoShortId) {
              telemundoLongId = null;
            }
            prefetchedTelemundoShortId.current = telemundoShortId;
            prefetchedTelemundoLongId.current = telemundoLongId;
            setTelemundoShortStatus(telemundoShortId ? "found" : "missing");
            setTelemundoLongStatus(telemundoLongId ? "found" : "missing");
          })();
        }
        const officialId = await officialP;
        prefetchedOfficialId.current = officialId;
        setOfficialStatus(officialId ? "found" : "missing");
        let secondId = await secondP;
        if (!baked?.extended && secondId && officialId && secondId === officialId) {
          // Collision — the parallel (unexcluded) 2nd landed the same clip as the
          // official. Re-resolve once, this time excluding it, so the two buttons
          // never play the same video. (Only for a freshly live-resolved 2nd — a
          // baked 2nd is already deduped at bake time.)
          secondId = await resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, [officialId], competition, preferExtended, strictSecondaryChannel);
        }
        prefetchedVideoId.current = secondId;
        setSearchStatus(secondId ? "found" : "missing");
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
  }, [highlightUrl, game.sport, game.id, game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, officialChannel, primaryChannel, secondaryChannel, competition, hasOfficialButton, isMlb, isFifa, fifaTelemundoEnabled, strictPrimaryChannel, strictSecondaryChannel]);

  // See resolvedMlb above. Fires only when the board enrich did NOT already
  // attach a recap (game.mlbRecapPlaybackUrl absent) and the highlight window
  // has opened; the ref keeps it to one lookup per game.
  useEffect(() => {
    if (!isMlb || !isFinished || !highlightsReady) return;
    if (game.mlbRecapPlaybackUrl) return;
    if (mlbResolvedForId.current === game.id) return;
    mlbResolvedForId.current = game.id;
    let cancelled = false;
    resolveMlbGameVideos(game).then((r) => { if (!cancelled && r) setResolvedMlb(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMlb, isFinished, highlightsReady, game.id, game.mlbRecapPlaybackUrl]);

  // Effective MLB video fields: the board enrich sets them on the game prop; on
  // other surfaces they come from resolvedMlb (self-resolved above).
  const mlbRecapPlayback = game.mlbRecapPlaybackUrl ?? resolvedMlb?.recap?.playback ?? null;
  const mlbRecapPage = game.mlbRecapUrl ?? resolvedMlb?.recap?.url ?? null;
  const mlbRecapPoster = game.mlbRecapPoster ?? resolvedMlb?.recap?.poster ?? null;
  const mlbCondensedPlayback = game.mlbCondensedPlaybackUrl ?? resolvedMlb?.condensed?.playback ?? null;
  const mlbCondensedPage = game.mlbCondensedUrl ?? resolvedMlb?.condensed?.url ?? null;
  const mlbCondensedPoster = game.mlbCondensedPoster ?? resolvedMlb?.condensed?.poster ?? null;

  // When there is no official channel the official button never renders, so
  // treat officialStatus as "missing" without storing it in state.
  const effectiveOfficialStatus = hasOfficialButton ? officialStatus : "missing";
  // Gate on "found", not "!== missing": each button (below) only renders once
  // its OWN id resolves, so a slot that ends up null is never shown then hidden
  // ("appear then disappear", Jacob 7/7).
  // Show the row as soon as EITHER slot is found — do NOT wait for both to
  // settle. The official button is prebaked for today/yesterday, so it resolves
  // synchronously and now appears in lockstep with the MLB row instead of being
  // held back by the slower (often live-scraped) 2nd slot — that wait was what
  // made the whole highlight row "pop in later than MLB" on refresh and on past
  // days (Jacob 7/11). A distinct 2nd clip, when found, simply joins the row.
  const showYouTube = !!(!isMlb && isFinished && highlightUrl && (effectiveOfficialStatus === "found" || searchStatus === "found"));
  const showTelemundo = !!(fifaTelemundoEnabled && isFinished && highlightUrl && isFifa && (telemundoShortStatus === "found" || telemundoLongStatus === "found"));
  const showNhl = !!(isFinished && game.sport === "nhl" && (game.nhlRecapEmbed || game.nhlCondensedEmbed));
  // MLB row: short MLB.com recap (3m) first, then the condensed game (10m).
  // STRICT: the 10m is ALWAYS the date-exact MLB.com condensed — its slug and HLS
  // path both carry the game's date (…condensed-game-nym-phi-7-16-26 /
  // …/2026-07/16/…), so it can never be another game's clip. The old YouTube
  // "TeamA vs TeamB + date" fallback is gone: in a multi-game series it resolved a
  // DIFFERENT day's video (wrong highlight — Jacob 7/16). If MLB.com hasn't posted
  // the condensed yet, show NO 10m button rather than a possibly-wrong one.
  const showMlbCondensed = isMlb && !!mlbCondensedPlayback;
  const showMlb = !!(isFinished && isMlb && (mlbRecapPlayback || showMlbCondensed));
  if (!showYouTube && !showTelemundo && !showNhl && !showMlb) return null;

  // The OTHER resolved highlight versions of this game, minus the one being
  // played — passed to the modal so its embed-blocked overlay can offer a
  // one-tap jump to an alternate stream (Telemundo especially, since FIFA blocks
  // embedding on the FOX/official cut). WC only; other sports get no alternates.
  const buildAlternates = (excludeId: string): { label: string; videoId: string }[] => {
    const alts: { label: string; videoId: string }[] = [];
    const add = (id: string | null, label: string) => {
      if (id && id !== excludeId && !alts.some((a) => a.videoId === id)) alts.push({ videoId: id, label });
    };
    if (isFifa) {
      add(prefetchedTelemundoShortId.current, "Telemundo");
      add(prefetchedTelemundoLongId.current, "Telemundo (extended)");
      add(prefetchedOfficialId.current, "FOX 2m");
      add(prefetchedVideoId.current, "FOX 15m");
    }
    return alts;
  };
  const playHl = (videoId: string, fallbackUrl: string, share?: ShareCardMeta | null) =>
    onPlayHighlight?.(videoId, fallbackUrl, share, buildAlternates(videoId));

  return (
    <>
      {/* Highlights — render only buttons whose video resolved (or is still
          resolving). A button whose full retry chain returns null is hidden
          rather than falling back to a YouTube search page. */}
      {showYouTube && (
        <div className={`${wrapMargin} flex gap-1`}>
          {hasOfficialButton && officialStatus === "found" && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedOfficialId.current) {
                  playHl(prefetchedOfficialId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("official");
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, primaryChannel, undefined, competition, false, strictPrimaryChannel);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedOfficialId.current = id;
                  setOfficialStatus("found");
                  playHl(id, modalFallbackUrl!, shareCard);
                } else {
                  setOfficialStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex min-w-0 items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
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
                  <span className="text-[10px] font-medium">{demoActive ? "Watch" : isFifa ? "2m" : game.sport.toUpperCase()}</span>
                </>
              )}
            </button>
          )}
          {searchStatus === "found" && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedVideoId.current) {
                  playHl(prefetchedVideoId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("search");
                // Dedup against primary so the two buttons never play the same video.
                // World Cup prefers the extended cut (see prefetch note above).
                const id = await resolveHighlightVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote, secondaryChannel, [prefetchedOfficialId.current], competition, !!competition, strictSecondaryChannel);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedVideoId.current = id;
                  setSearchStatus("found");
                  playHl(id, modalFallbackUrl!, shareCard);
                } else {
                  setSearchStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex items-center justify-center py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "search" ? 0.5 : undefined }}
              aria-label={isFifa ? "FOX full highlights" : "Official alternate highlights"}
              // aria-busy conveys the in-flight fetch that the visible "Loading..."
              // swap shows sighted users; the aria-label above stays pinned so the
              // name never collapses to "Loading...". Matches EventCard's buttons.
              aria-busy={fetchingOnClick === "search"}
              title={isFifa ? "FOX full highlights" : "Official alternate highlights"}
            >
              {fetchingOnClick === "search" ? (
                <span className="text-[10px]">Loading...</span>
              ) : (
                  <>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                    {isFifa && (
                      <span className="text-[10px] font-medium">
                        <span>FOX 15m</span>
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
          {mlbRecapPlayback && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const page = mlbRecapPage || mlbRecapPlayback!;
                if (onPlayEmbed) onPlayEmbed("", page, "MLB.com", shareCard, mlbRecapPlayback, mlbRecapPoster);
                else openExternal(page);
              }}
              className="highlight-btn flex min-w-0 items-center justify-center gap-0.5 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="MLB.com game recap"
              title="MLB.com game recap"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium whitespace-nowrap">3m</span>
            </button>
          )}
          {showMlbCondensed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // STRICT MLB.com only (see showMlbCondensed): always the date-exact
                // condensed for THIS game, opened in the in-app modal. No YouTube
                // fallback — that was what surfaced a different day's clip.
                if (!mlbCondensedPlayback) return;
                const page = mlbCondensedPage || mlbCondensedPlayback;
                if (onPlayEmbed) onPlayEmbed("", page, "MLB.com", shareCard, mlbCondensedPlayback, mlbCondensedPoster);
                else openExternal(page);
              }}
              className="highlight-btn flex min-w-0 items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label="MLB 10 minute condensed game"
              // No loading/disabled/aria-busy state here (unlike the YouTube and
              // Telemundo buttons): this opens the pre-resolved date-exact clip
              // synchronously via onPlayEmbed with no click-time fetch, so
              // `fetchingOnClick` is never set on the MLB path (showYouTube needs
              // !isMlb, showTelemundo needs FIFA). The old loading swap keyed off
              // it was therefore dead code — the button never dimmed or showed
              // "Loading...".
              title="MLB 10 minute condensed game"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium whitespace-nowrap">10m</span>
            </button>
          )}
        </div>
      )}

      {showTelemundo && (
        <div className={`${showYouTube ? "mt-1" : wrapMargin} flex gap-1`}>
          {telemundoShortStatus === "found" && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                if (prefetchedTelemundoShortId.current) {
                  playHl(prefetchedTelemundoShortId.current, modalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("telemundoShort");
                const id = await resolveTelemundoWorldCupVideo(game.awayTeam.shortDisplayName, game.homeTeam.shortDisplayName, dateStr, game.seriesNote);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedTelemundoShortId.current = id;
                  setTelemundoShortStatus("found");
                  playHl(id, modalFallbackUrl!, shareCard);
                } else {
                  setTelemundoShortStatus("missing");
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex min-w-0 items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "telemundoShort" ? 0.5 : undefined }}
              aria-label="Telemundo highlights"
              aria-busy={fetchingOnClick === "telemundoShort"}
              title="Telemundo highlights"
            >
              {fetchingOnClick === "telemundoShort" ? <span className="text-[10px]">Loading...</span> : (
                <>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[9px] sm:text-[10px] font-medium whitespace-nowrap">TEL 10m</span>
                </>
              )}
            </button>
          )}
          {telemundoLongStatus === "found" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!onPlayHighlight) return;
                // Unlike the TEL 10m button, the extended cut has NO click-time
                // re-resolve (the collision note in the prefetch effect explains
                // why an exclude-retry can surface a different game's clip), so it
                // is only ever populated during prefetch — this button therefore
                // renders only when the ref is already set. Play it directly; the
                // old no-op/self-hide fallback below was unreachable dead code.
                if (prefetchedTelemundoLongId.current) {
                  playHl(prefetchedTelemundoLongId.current, modalFallbackUrl!, shareCard);
                }
              }}
              disabled={fetchingOnClick !== null}
              className="highlight-btn flex min-w-0 items-center justify-center gap-0.5 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)", opacity: fetchingOnClick === "telemundoLong" ? 0.5 : undefined }}
              aria-label="Telemundo extended highlights"
              aria-busy={fetchingOnClick === "telemundoLong"}
              title="Telemundo extended highlights"
            >
              {fetchingOnClick === "telemundoLong" ? <span className="text-[10px]">Loading...</span> : (
                <>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[9px] sm:text-[10px] font-medium whitespace-nowrap">TEL 30m</span>
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
              type="button"
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
              type="button"
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
