"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Game } from "@/lib/types";
import { buildShareCard, type ShareCardMeta } from "@/lib/shareCard";
import { isDemoModeActive } from "@/lib/demoMode";
import { openExternal } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
import { getYouTubeSearchUrl, getOfficialChannelName, getSecondaryChannels, getCompetitionName, getCompetitionTitleTokens, hasNoTrustedHighlightSource, highlightTeamName, requiresStrictChannelOnly, resolveHighlightVideo, resolveTelemundoWorldCupVideo } from "@/lib/youtube";
import { getBakedHighlight, getCachedBakedHighlight, getChannelVerifiedBakedId } from "@/lib/highlights";
import { resolveMlbGameVideos, type MlbGameVideos } from "@/lib/espn";

// Per-league buffer (hrs from game start) before showing the highlight button,
// and regulation period counts for the OT-extra calc below. Both are constant
// lookup tables with no per-render input, so they live at module scope rather
// than being re-allocated on every render of every game card.
// Buffers based on actual YouTube upload-timing research (April 2026).
// Extra innings are short in every baseball sport, not just MLB. NOT the same
// gate as isMlb below — that one is MLB.com-native video and stays MLB-only.
const BASEBALL_SPORTS = new Set<string>(["mlb", "ncaabase", "ncaasoft"]);

const highlightBufferHours: Record<string, number> = {
  nba: 3.5, wnba: 3.5, ncaam: 4, ncaaw: 4, ncaaf: 5, nhl: 4.5, ncaah: 4.5, ncaawh: 4.5, ncaavb: 3, mlb: 5, ufl: 4,
  // College baseball runs MLB-long; softball's seven innings finish an hour sooner.
  ncaabase: 5, ncaasoft: 4,
  nfl: 5, fifa: 3, epl: 3, mls: 3, ucl: 3, uel: 3, golf: 6, tennis: 4,
  laliga: 3, seriea: 3, bundesliga: 3, ligue1: 3,
  // Second-wave soccer: same 3-hour post-match buffer as every other 90-minute
  // league. Liga MX and Libertadores skew to late-night ET kickoffs, but the
  // buffer is measured from kickoff, not wall clock, so 3 still holds.
  ligamx: 3, nwsl: 3, efl: 3, libertadores: 3, euro: 3, afcon: 3, saudi: 3,
  // Cricket: 7 hours, and it is NOT a padded soccer number. The buffer counts
  // from the scheduled START, and a T20 runs ~3h20m of play before the innings
  // break and presentation — so an official highlight package doesn't exist
  // until roughly four hours in even on a fast turnaround. A 3-hour buffer would
  // surface the button while the second innings is still being bowled.
  cricket: 7,
  // Rugby union: 80 minutes of play in two halves, so the same 3-hour
  // post-kickoff buffer every 90-minute soccer league uses. These five were
  // absent until 2026-08-12 and silently took the 4h default, which both
  // delayed the buttons by an hour AND disagreed with
  // scripts/check-highlight-fallbacks.mjs, whose mirror has always said 3 —
  // i.e. the audit could flag a "missing" button during the hour the app was
  // still deliberately hiding it.
  sixnations: 3, superrugby: 3, rugbywc: 3, rugbychamp: 3, nationschamp: 3,
};
// ncaaw is 4, not 2: women's college hoops plays four 10-min quarters (moved to
// quarters in 2015-16), so a finished regulation game reports period 4. A value
// of 2 made otPeriods = 4 - 2 = 2 for EVERY regulation game, adding a phantom
// 1-hour double-OT buffer that delayed the highlight buttons. ncaam stays 2
// (men's still play two 20-min halves). Mirrors SPORT_RATING_CONFIG in espn.ts.
const regulationPeriods: Record<string, number> = { nba: 4, wnba: 4, ncaam: 2, ncaaw: 4, ncaaf: 4, nhl: 3, ncaah: 3, ncaawh: 3, ncaavb: 5, mlb: 9, ncaabase: 9, ncaasoft: 7, nfl: 4, ufl: 4, fifa: 2, epl: 2, mls: 2, ucl: 2, uel: 2, laliga: 2, seriea: 2, bundesliga: 2, ligue1: 2, ligamx: 2, nwsl: 2, efl: 2, libertadores: 2, euro: 2, afcon: 2, saudi: 2, cricket: 2, golf: 4, tennis: 4,
  // Two 40-minute halves. Without these the default of 4 made rawOt negative
  // for every finished rugby match — clamped to 0 by the Math.max, so the
  // buffer was right by accident; stating it keeps that an intent, not luck.
  sixnations: 2, superrugby: 2, rugbywc: 2, rugbychamp: 2, rugbytest: 2, nationschamp: 2 };

// The highlight-button badge uppercases the sport KEY (nba → "NBA"), which reads
// right for the leagues whose key IS the abbreviation. A couple of later
// additions use two-word descriptive keys, so the bare uppercase jams the words
// together ("SERIEA", "LIGAMX") on their official-highlight button. Restore the
// space here — same all-caps badge style, just the correct wording. Any key not
// listed keeps game.sport.toUpperCase() untouched (tennis Slams, NBA, etc.).
// The rugby keys are the same problem one step worse — "SIXNATIONS",
// "SUPERRUGBY", "RUGBYWC" and "NATIONSCHAMP" are not words. Badges stay short
// enough for the pill (the longest shipping one is "SERIE A" at 7).
const highlightBadgeLabel: Record<string, string> = {
  seriea: "SERIE A", ligamx: "LIGA MX",
  sixnations: "6 NATIONS", superrugby: "SUPER RUGBY", rugbywc: "RWC",
  rugbychamp: "CHAMPIONS", rugbytest: "TESTS", nationschamp: "NATIONS",
};


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
  // Esports keys its highlight channel on the LEAGUE ("LCK", "LEC"), not the
  // sport — one "esports" key spans leagues with unrelated uploaders. Callers
  // pass the column label ("Esports") as leagueLabel, which is useless here, so
  // swap in the league PandaScore reported. Every other sport is unchanged.
  const highlightLabel = game.sport === "esports" ? (game.esportsLeague ?? undefined) : leagueLabel;
  const officialChannel = getOfficialChannelName(game.sport, highlightLabel);
  // MLB's visible highlight row is MLB.com-native; no YouTube slot renders.
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
  const primaryChannel = isMlb ? (officialChannel ?? undefined) : (isFifa ? "FIFA" : (officialChannel ?? undefined));
  // Most leagues reuse their primary channel for slot 2. A league-specific
  // verified rightsholder can override that slot (currently NWSL → W Golazo)
  // without widening the primary button or affecting any other sport.
  const verifiedSecondaryChannel = getSecondaryChannels(game.sport, highlightLabel)[0];
  const secondaryChannel = isMlb ? undefined : (isFifa ? "FOX Sports" : (verifiedSecondaryChannel ?? primaryChannel));
  // The names the official uploader actually TITLES with. Identity for every
  // sport but the Little League World Series, where ESPN's team name is the
  // city ("Tacoma WA") and its recap title is the state ("Washington"). Used for
  // the query, the fallback YouTube URL and the baked-ID identity check alike —
  // the prebake keys on the same rewritten pair, so the two must not diverge.
  const hlAway = highlightTeamName(game.sport, game.awayTeam.shortDisplayName);
  const hlHome = highlightTeamName(game.sport, game.homeTeam.shortDisplayName);
  const initialBaked = getCachedBakedHighlight(game.sport, game.id);
  // MLB's visible row is MLB.com-native; never hydrate its removed YouTube row.
  // Every other prebaked ID must carry the exact expected uploader marker.
  const initialOfficialId = !isMlb && hasOfficialButton
    ? getChannelVerifiedBakedId(initialBaked, "official", primaryChannel, hlAway, hlHome)
    : null;
  const initialSecondaryId = !isMlb
    ? getChannelVerifiedBakedId(initialBaked, "extended", secondaryChannel, hlAway, hlHome)
    : null;
  const initialTelemundoShortId = fifaTelemundoEnabled && isFifa
    ? getChannelVerifiedBakedId(initialBaked, "telemundo", "Telemundo Deportes", hlAway, hlHome)
    : null;
  const initialTelemundoLongId = fifaTelemundoEnabled && isFifa
    ? getChannelVerifiedBakedId(initialBaked, "telemundoExtended", "Telemundo Deportes", hlAway, hlHome)
    : null;
  const prefetchedVideoId = useRef<string | null>(initialSecondaryId ?? null);
  const prefetchedOfficialId = useRef<string | null>(initialOfficialId ?? null);
  const prefetchedTelemundoShortId = useRef<string | null>(initialTelemundoShortId);
  const prefetchedTelemundoLongId = useRef<string | null>(initialTelemundoLongId);
  const prefetchStarted = useRef(false);
  const [fetchingOnClick, setFetchingOnClick] = useState<"official" | "search" | "telemundoShort" | "telemundoLong" | null>(null);
  // "loading" while prefetch (or click-time chain) is running. "found" once
  // resolveHighlightVideo returns an id. "missing" once the full retry chain
  // strict channel lookup has been exhausted — the button is hidden so the user
  // never gets dropped onto a YouTube search page.
  type HighlightStatus = "loading" | "found" | "missing";
  const [officialStatus, setOfficialStatus] = useState<HighlightStatus>(initialOfficialId ? "found" : "loading");
  const [searchStatus, setSearchStatus] = useState<HighlightStatus>(initialSecondaryId ? "found" : "loading");
  const [telemundoShortStatus, setTelemundoShortStatus] = useState<HighlightStatus>(
    fifaTelemundoEnabled && isFifa ? (initialTelemundoShortId ? "found" : "loading") : "missing",
  );
  const [telemundoLongStatus, setTelemundoLongStatus] = useState<HighlightStatus>(
    fifaTelemundoEnabled && isFifa ? (initialTelemundoLongId ? "found" : "loading") : "missing",
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
    // A regular-season NHL game still tied after its single overtime goes to a
    // SHOOTOUT, which ESPN reports as period 5 (period 4 = the lone OT). Counting
    // that as two overtimes — the raw period-minus-3 = 2 math — padded the buffer
    // by a full extra 30-min "OT" (~1h over regulation) even though a shootout
    // adds only minutes, so a today's NHL shootout final revealed its highlight
    // buttons ~30 min later than it should. Multiple OTs (periods 5, 6, …) exist
    // only in the PLAYOFFS, which never have a shootout — so cap the OT count at 1
    // for a non-playoff NHL game only, disambiguating period 5 exactly the way
    // GameCard's live-status labeler already does (shootout = period >= 5 &&
    // !isPlayoff). Every other sport and playoff NHL are byte-for-byte unchanged.
    const rawOt = Math.max(0, game.period - (regulationPeriods[game.sport] ?? 4));
    const otPeriods = (game.sport === "nhl" || game.sport === "ncaah" || game.sport === "ncaawh") && !game.isPlayoff ? Math.min(rawOt, 1) : rawOt;
    const otExtra = otPeriods * (BASEBALL_SPORTS.has(game.sport) ? 0.25 : 0.5); // extra innings shorter, OT ~30min each
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
  // Leagues with no trustworthy uploader (IPL / EURO — see
  // hasNoTrustedHighlightSource) get NO highlight URL at all. highlightUrl is
  // what gates the prefetch effect AND is the modal's fallback link, so nulling
  // it here is the single point that keeps both highlight buttons off the card:
  // without it a league lacking an approved uploader could reach resolution.
  const noTrustedSource = hasNoTrustedHighlightSource(game.sport, highlightLabel);
  const highlightUrl = highlightsReady && !noTrustedSource
    ? getYouTubeSearchUrl(hlAway, hlHome, dateStr, game.seriesNote, competition)
    : null;

  // Matchup card for shared highlight links — built from the game so the
  // VideoModal's copy-link can render+upload the preview and hand back a
  // hidescore.com link that unfurls cleanly in iMessage. See lib/shareCard.
  const shareCard = useMemo(() => buildShareCard(game, leagueLabel), [game, leagueLabel]);

  // Esports joins FIFA on the no-alternate-re-search path: a failed strict
  // resolve must surface the "open on YouTube" fallback rather than quietly
  // re-searching, because an unscoped esports search returns fan re-uploads
  // whose titles give away the result ("INSANE 3-0 SWEEP").
  const noSearchFallback = isFifa || requiresStrictChannelOnly(game.sport);
  // Gridiron week gate (NFL/NCAAF regular season) — rides along on the modal's
  // fallback URL for exactly the reason nss_race does: VideoModal's retry after
  // an embed failure re-queries the SAME correct channel, and the NFL channel
  // holds every week of the season, so an ungated retry can come back with a
  // different meeting of the same two teams. See Game.weekNumber.
  const weekNumber = game.weekNumber ?? null;
  const weekGateParam = weekNumber ? `&nss_week=${weekNumber}` : "";
  // Competition title gate — a hard filter on the winning title for the leagues
  // whose official channel uploads more than one competition between the same
  // teams (rugby's Nations Championship vs the U20s; an NFL preseason card vs
  // the same pair's regular-season meeting). Empty — and so completely inert —
  // for every other card. Carried on the modal's fallback URL as `nss_comp`
  // for the same reason as the week. See getCompetitionTitleTokens.
  const compTokens = useMemo(
    () => getCompetitionTitleTokens(game.sport, { preseason: game.isPreseason }),
    [game.sport, game.isPreseason],
  );
  const compGateParam = compTokens.length ? `&nss_comp=${encodeURIComponent(compTokens.join("|"))}` : "";
  const modalFallbackUrl = (channels: (string | null | undefined)[]) => {
    if (!highlightUrl) return null;
    if (noSearchFallback) return `${highlightUrl}&nss_no_fallback=1${weekGateParam}${compGateParam}`;
    const allowed = [...new Set(channels.filter((channel): channel is string => !!channel))];
    if (!allowed.length) return `${highlightUrl}${weekGateParam}${compGateParam}`;
    return `${highlightUrl}&nss_strict=1&nss_channels=${encodeURIComponent(allowed.join("|"))}${weekGateParam}${compGateParam}`;
  };
  const officialModalFallbackUrl = modalFallbackUrl([primaryChannel]);
  const secondaryModalFallbackUrl = modalFallbackUrl([secondaryChannel]);
  const telemundoModalFallbackUrl = isFifa && highlightUrl ? `${highlightUrl}&nss_no_fallback=1` : highlightUrl;
  useEffect(() => {
    if (!highlightUrl || prefetchStarted.current) return;
    prefetchStarted.current = true;
    const away = hlAway;
    const home = hlHome;
    const series = game.seriesNote;
    if (officialChannel) {
      (async () => {
        // Prefer server-prebaked IDs (news cron → /news/highlights.json, keyed on
        // sport + ESPN event id). When present the buttons resolve with NO live
        // /api/youtube lookup — instant, no per-card scrape, no stagger. The baked
        // 2nd id is already deduped against the 1st at bake time. Whichever id the
        // bake doesn't have yet falls back to the exact same live resolution below.
        //
        // Resolve BOTH channel-gated buttons CONCURRENTLY. Each resolve is a live
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
        // compTokens (the competition title gate) is the component-level one
        // above, so the prefetch, the click paths and the modal's retry all
        // send the same filter.
        const baked = await getBakedHighlight(game.sport, game.id);
        const bakedOfficial = getChannelVerifiedBakedId(baked, "official", primaryChannel, away, home);
        const bakedSecondary = getChannelVerifiedBakedId(baked, "extended", secondaryChannel, away, home);
        // MLB's official slot is never rendered (showYouTube requires !isMlb —
        // its visible row is MLB.com-native, per the initialOfficialId guard
        // above), so skip its live resolve: without the isMlb guard every
        // finished MLB card fired one wasted /api/youtube scrape per card whose
        // id nothing can display. The `secondP` slot was already safe (MLB's
        // secondaryChannel is undefined → resolveHighlightVideo returns null
        // before any fetch); this closes the same leak on the official slot.
        const officialP = !hasOfficialButton || isMlb
          ? Promise.resolve(null)
          : bakedOfficial
          ? Promise.resolve(bakedOfficial)
          : resolveHighlightVideo(away, home, dateStr, series, primaryChannel, undefined, competition, false, weekNumber, compTokens);
        // If the server prebake already found the primary clip but no secondary,
        // trust that miss for this page load instead of making every browser do
        // another slow live YouTube scrape. The 30-min prebake will fill
        // `extended` later if FOX/FIFA posts a distinct companion cut.
        const skipLiveSecondary = !isFifa && !!bakedOfficial && !bakedSecondary;
        const secondP = bakedSecondary
          ? Promise.resolve(bakedSecondary)
          : skipLiveSecondary
            ? Promise.resolve(null)
          : resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, undefined, competition, preferExtended, weekNumber, compTokens);
        const bakedTelemundoShort = getChannelVerifiedBakedId(baked, "telemundo", "Telemundo Deportes", away, home);
        const bakedTelemundoLong = getChannelVerifiedBakedId(baked, "telemundoExtended", "Telemundo Deportes", away, home);
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
        if (!bakedSecondary && secondId && officialId && secondId === officialId) {
          // Collision — the parallel (unexcluded) 2nd landed the same clip as the
          // official. Re-resolve once, this time excluding it, so the two buttons
          // never play the same video. (Only for a freshly live-resolved 2nd — a
          // baked 2nd is already deduped at bake time.)
          secondId = await resolveHighlightVideo(away, home, dateStr, series, secondaryChannel, [officialId], competition, preferExtended, weekNumber, compTokens);
        }
        prefetchedVideoId.current = secondId;
        setSearchStatus(secondId ? "found" : "missing");
      })();
    }
  }, [highlightUrl, game.sport, game.id, hlAway, hlHome, dateStr, game.seriesNote, officialChannel, primaryChannel, secondaryChannel, competition, hasOfficialButton, isMlb, isFifa, fifaTelemundoEnabled, weekNumber, compTokens]);

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
  // No playable highlight ⇒ NO row at all, finished or not. f2deaf2d used to
  // reserve the row's height on any finished card so a column of mixed cards
  // lined up, but that trade was wrong in practice: on a slate where NOTHING
  // resolves (a whole MLB column before the recaps land, or a league whose
  // official-channel string is dead) every card carries a permanently blank
  // 27px band and just reads as fat — "bigger box not until it has actual
  // highlight" (Jacob 8/10). Ragged heights only appear on the mixed slate,
  // and there the taller card is the one that earned it.
  if (!showYouTube && !showTelemundo && !showNhl && !showMlb) {
    // Nothing to draw — but WHY matters to the card's height. A finished game
    // still inside its highlight buffer (highlightBufferHours: 4h from first
    // serve for tennis, 5h from first pitch for MLB) has a clip COMING, so the
    // .hl-slot floor must stand down and let the card sit at its plain height;
    // reserving now parks an empty band on it for hours (Jacob 9/6, the US Open
    // finals on the today board). A finished game PAST its buffer with nothing
    // found is the case the floor exists for — a college game on a channel ESPN
    // skips — and gets no marker, so it reserves and lines up with the MLB card
    // beside it (Jacob 9/5). The 60s tick above re-renders this component the
    // moment the buffer opens, which drops the marker without a reload.
    return isFinished && !highlightsReady ? <span data-hl-pending hidden /> : null;
  }

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
                  playHl(prefetchedOfficialId.current, officialModalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("official");
                const id = await resolveHighlightVideo(hlAway, hlHome, dateStr, game.seriesNote, primaryChannel, undefined, competition, false, weekNumber, compTokens);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedOfficialId.current = id;
                  setOfficialStatus("found");
                  playHl(id, officialModalFallbackUrl!, shareCard);
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
                  <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium">{demoActive ? "Watch" : isFifa ? "2m" : (highlightBadgeLabel[game.sport] ?? game.sport.toUpperCase())}</span>
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
                  playHl(prefetchedVideoId.current, secondaryModalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("search");
                // Dedup against primary so the two buttons never play the same video.
                // World Cup prefers the extended cut (see prefetch note above).
                const id = await resolveHighlightVideo(hlAway, hlHome, dateStr, game.seriesNote, secondaryChannel, [prefetchedOfficialId.current], competition, !!competition, weekNumber, compTokens);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedVideoId.current = id;
                  setSearchStatus("found");
                  playHl(id, secondaryModalFallbackUrl!, shareCard);
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
                    <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
              <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
              {fetchingOnClick === "official" ? <span className="text-[10px]">Loading...</span> : (
                <>
                  <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  <span className="text-[10px] font-medium whitespace-nowrap">10m</span>
                </>
              )}
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
                  playHl(prefetchedTelemundoShortId.current, telemundoModalFallbackUrl!, shareCard);
                  return;
                }
                setFetchingOnClick("telemundoShort");
                const id = await resolveTelemundoWorldCupVideo(hlAway, hlHome, dateStr, game.seriesNote);
                setFetchingOnClick(null);
                if (id) {
                  prefetchedTelemundoShortId.current = id;
                  setTelemundoShortStatus("found");
                  playHl(id, telemundoModalFallbackUrl!, shareCard);
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
                  <svg aria-hidden="true" className="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
                  playHl(prefetchedTelemundoLongId.current, telemundoModalFallbackUrl!, shareCard);
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
                  <svg aria-hidden="true" className="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
              <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
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
              <svg aria-hidden="true" className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              <span className="text-[10px] font-medium">10<span className="sm:hidden">m</span><span className="hidden sm:inline"> min</span></span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
