"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Game, Sport, Team } from "@/lib/types";
import { type ShareCardMeta } from "@/lib/shareCard";
import { fetchTeamSchedule, fetchScheduleRatings } from "@/lib/espn";
import { getTimeZone, etSlateYmd } from "@/lib/etDay";
import GameCard from "./GameCard";
import { getDateString } from "@/components/DateNav";

interface TeamViewProps {
  sport: Sport;
  team: Team;
  leagueLabel: string;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null, alternates?: { label: string; videoId: string }[]) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
  onShowDetails?: (game: Game) => void;
  onBack: () => void;
  onSelectTeam: (team: Team) => void;
  useAbbreviations: boolean;
}

const PAGE_SIZE = 10;
const PAST_INITIAL = 3;

// team.id is "${sport}-${rawId}" — strip the sport prefix to get ESPN's team id.
function rawEspnTeamId(teamId: string, sport: Sport): string {
  const prefix = `${sport}-`;
  return teamId.startsWith(prefix) ? teamId.slice(prefix.length) : teamId;
}

// Sports whose season spans two calendar years (fall → spring) and that ESPN
// identifies by the season's ENDING year — the 2025-26 season is season=2026.
// During the fall half (Oct–Dec) the current season's number is therefore next
// year's, so a plain [y, y-1] window MISSES it: tapping an NBA/NHL/UCL team
// between October and New Year fetched only the prior two seasons and showed no
// current or upcoming games. The original soccer group already got a [y, y+1,
// y-1] window for exactly this reason; basketball/hockey (Oct–Jun) and the
// club-soccer cups (Sep–May) belong here too. Adding y+1 is safe under either
// convention — a not-yet-scheduled or out-of-range season year just returns no
// events (fetchTeamSchedule dedups + sorts, and no-ops on an empty/failed year).
const TWO_CALENDAR_YEAR_SPORTS = new Set<Sport>([
  "epl", "mls", "fifa", "ucl", "uel", "nba", "nhl", "ncaam", "ncaaw", "ncaah", "ncaawh",
  "laliga", "seriea", "bundesliga", "ligue1",
  // Second-wave leagues whose season spans two calendar years. EFL Championship
  // and the Saudi Pro League run Aug–May like the big five. Liga MX belongs here
  // too — ESPN identifies its season 2026-06-01 → 2027-06-01, so the Clausura
  // half lives in the following calendar year. NWSL, Libertadores, Euro and
  // AFCON are all single-calendar-year and correctly fall through to [y, y-1].
  "ligamx", "efl", "saudi",
  // Conference League and the three domestic cups all run autumn → late spring.
  "uecl", "facup", "copadelrey", "dfbpokal",
  // Nations League: a league phase in the autumn of an even year, knockouts in
  // the following spring/summer — ESPN files it as one season across both.
  "nations",
]);

// Fallback multi-year window so a season that spans (or hasn't filled) the
// current calendar year still resolves. Single-calendar-year sports (MLB, WNBA)
// and the start-year-identified ones (NFL, NCAAF) only need [y, y-1].
function seasonYearsForSport(sport: Sport): number[] {
  const y = new Date().getFullYear();
  if (TWO_CALENDAR_YEAR_SPORTS.has(sport)) return [y, y + 1, y - 1];
  return [y, y - 1];
}

export default function TeamView({
  sport,
  team,
  leagueLabel,
  favoriteTeams,
  onToggleFavoriteTeam,
  showRatings,
  onPlayHighlight,
  onPlayEmbed,
  onShowDetails,
  onBack,
  onSelectTeam,
  useAbbreviations,
}: TeamViewProps) {
  const [allGames, setAllGames] = useState<Game[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [upcomingLimit, setUpcomingLimit] = useState(PAGE_SIZE);
  const [pastLimit, setPastLimit] = useState(PAST_INITIAL);
  // Linescore-aware rating backfill for finished games (see effect below). Keyed
  // by game id; a value of null means "legitimately unrated on its date too".
  const [ratingOverrides, setRatingOverrides] = useState<Record<string, number | null>>({});
  const [headerAbbrev, setHeaderAbbrev] = useState(false);
  const [headerH, setHeaderH] = useState(80);
  const headerRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // Measure the sticky team header height so the section dividers can pin
  // exactly below it (same idea as the sticky-within-sticky playoff pattern).
  useIsoLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setUpcomingLimit(PAGE_SIZE);
    setPastLimit(PAST_INITIAL);
    setRatingOverrides({});
    setAllGames(null);
    setLoading(true);
    setError(false);
    const espnId = rawEspnTeamId(team.id, sport);
    if (!espnId) { setError(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const games = await fetchTeamSchedule(sport, espnId, seasonYearsForSport(sport));
        if (cancelled) return;
        setAllGames(games);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sport, team.id]);

  const { past, upcoming } = useMemo(() => {
    if (!allGames) return { past: [] as Game[], upcoming: [] as Game[] };
    const now = Date.now();
    // Parse the kickoff once, coercing an unparseable/missing date to 0 (epoch).
    // A raw new Date(bad).getTime() is NaN, and every comparison against NaN is
    // false — so a finished game with a bad date fell out of BOTH the `<= now`
    // (Recent) and `> now` (Upcoming) filters and vanished from the schedule
    // entirely, and NaN in the sort comparators left the order undefined. Epoch
    // keeps such a game in exactly one section (oldest in Recent) and sorts it
    // stably. Byte-for-byte unchanged for every real, parseable ESPN date — the
    // same defensive guard the card/bracket date paths already carry.
    const ms = (g: Game) => {
      const t = new Date(g.date).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    // Sort key for the ASCENDING Upcoming sort (soonest first). `ms` coerces a
    // bad/missing date to epoch (0) — the smallest possible value — which is
    // correct for Recent (descending → sorts oldest, as the comment above says)
    // but wrong here: an undated pre/in game (e.g. a TBD tournament fixture ESPN
    // hasn't dated yet) would sort to the very TOP of Upcoming, ahead of real
    // soonest games. Map a bad date to MAX_SAFE_INTEGER so it sinks to the end
    // instead. A finite sentinel (not Infinity) keeps `msUp(a) - msUp(b)` from
    // going NaN when two undated games meet, so their order stays stable. The
    // Upcoming FILTER still uses `ms` (a bad-date post game must land in Recent
    // via `ms(g) <= now`, not here), so only ordering changes.
    const msUp = (g: Game) => {
      const t = new Date(g.date).getTime();
      return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };
    // Future-dated "post" games (e.g. a suspended/rescheduled fixture ESPN still
    // tags final) belong under Upcoming, per the liveAndPre clause below. Anchor
    // Recent to post games at/before now so such a game lands in exactly one
    // section — otherwise it rendered in BOTH Recent and Upcoming.
    const finished = allGames
      .filter((g) => g.state === "post" && ms(g) <= now)
      .sort((a, b) => ms(b) - ms(a));
    const liveAndPre = allGames
      .filter((g) => g.state === "in" || g.state === "pre" || (g.state === "post" && ms(g) > now))
      .sort((a, b) => msUp(a) - msUp(b));
    return { past: finished, upcoming: liveAndPre };
  }, [allGames]);

  const pastShown = past.slice(0, pastLimit);
  const morePastAvailable = past.length > pastLimit;
  const upcomingShown = upcoming.slice(0, upcomingLimit);
  const moreAvailable = upcoming.length > upcomingLimit;

  // The team-schedule endpoint omits per-period linescores, so finished-game
  // ratings arrive as final-margin-only approximations that can disagree by a
  // full tier with the rating the same game shows on its date / at final.
  // Backfill the correct linescore-aware rating for just the visible finished
  // games (grouped by date + cache-warm, so a handful of light requests). Keyed
  // off the rendered ids so a "Show more" click only fetches the newcomers.
  const pastShownIds = pastShown.map((g) => g.id).join(",");
  useEffect(() => {
    if (!pastShown.length) return;
    const need = pastShown.filter((g) => !(g.id in ratingOverrides));
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      const map = await fetchScheduleRatings(
        sport,
        need.map((g) => ({ id: g.id, date: g.date }))
      );
      if (cancelled || !map.size) return;
      setRatingOverrides((prev) => {
        const next = { ...prev };
        for (const [id, r] of map) next[id] = r;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // ratingOverrides is read to skip already-resolved ids but intentionally not
    // a dep — the id-keyed setter merge avoids a refetch loop; pastShownIds (and
    // sport) are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastShownIds, sport]);

  // Doubleheaders: ids of finished games that share an Eastern calendar day with
  // another finished game. Their cards show the start time so the two otherwise-
  // identical FINAL rows (hidescore hides the score) are distinguishable.
  const doubleheaderIds = useMemo(() => {
    const byDay = new Map<string, string[]>();
    for (const g of past) {
      // Same bad-date defense as the Recent/Upcoming split above: a `post` game
      // with an unparseable/missing date is epoch-coerced into `past`, but
      // Intl.DateTimeFormat.format() THROWS "Invalid time value" on an Invalid
      // Date — which would crash the whole TeamView render here. Skip it; a game
      // with no valid date can't be grouped into a calendar-day doubleheader.
      const d = new Date(g.date);
      if (Number.isNaN(d.getTime())) continue;
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
      const arr = byDay.get(ymd) ?? [];
      arr.push(g.id);
      byDay.set(ymd, arr);
    }
    const ids = new Set<string>();
    for (const arr of byDay.values()) if (arr.length > 1) arr.forEach((id) => ids.add(id));
    return ids;
  }, [past]);

  // If the full team name would collide with the left-edge back button (the
  // centered group visually crosses under it), swap to the 3-char abbrev.
  useEffect(() => {
    const check = () => {
      const host = headerRef.current;
      const back = backRef.current;
      if (!host || !back) return;
      // Measure the centered group WITH the full name — do this by temporarily
      // forcing non-abbrev mode via a probe, or just measure current state and
      // toggle when needed.
      const probe = document.createElement("h2");
      probe.textContent = team.shortDisplayName || team.displayName;
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:1.125rem;font-weight:700;letter-spacing:0.025em;";
      document.body.appendChild(probe);
      const nameFullW = probe.offsetWidth;
      document.body.removeChild(probe);

      const hostW = host.clientWidth;
      const backW = back.getBoundingClientRect().width;
      // Center group = invisible★ (≈14) + logo (≈20) + name + gaps + ★ (≈14) ≈ name + ~60
      const centerGroupW = nameFullW + 60;
      // Need: half the center group (from center outward) must not cross back edge
      const halfGroup = centerGroupW / 2;
      const backEdge = backW + 8; // 8px gap buffer
      const tooWide = halfGroup > (hostW / 2) - backEdge;
      setHeaderAbbrev(tooWide);
    };
    check();
    const host = headerRef.current;
    if (!host) return;
    const ro = new ResizeObserver(check);
    ro.observe(host);
    return () => ro.disconnect();
  }, [team.shortDisplayName, team.displayName, team.abbreviation, leagueLabel]);

  // Bucket the game to its ET slate day the SAME way getDateString(0) derives
  // "today" (getEtServiceDate's 1 AM rollover), so a game kicking off between
  // midnight and 1 AM stays on the same day both sides call it — matching how
  // GameDetailModal computes isToday. A raw ET calendar day here would drift
  // from the service day in that window and make TeamView disagree with the
  // card/modal on isToday, which gates the recap-upload buffer in
  // GameHighlights (today's finals wait for the upload window; past games show
  // immediately). etSlateYmd also fixes the old UTC-day mislabel of
  // late-evening ET games since it buckets in the effective time zone.
  const gameIsToday = (g: Game) => etSlateYmd(g.date) === getDateString(0);

  const renderCard = (game: Game) => {
    // Swap in the linescore-aware rating when the backfill resolved one (and it
    // actually differs) so the card matches the dated/live-final view.
    const override = ratingOverrides[game.id];
    const g = override !== undefined && override !== game.rating
      ? { ...game, rating: override }
      : game;
    return (
    <GameCard
      key={g.id}
      game={g}
      favoriteTeams={favoriteTeams}
      onToggleFavoriteTeam={onToggleFavoriteTeam}
      showRatings={showRatings}
      onPlayHighlight={onPlayHighlight}
      onPlayEmbed={onPlayEmbed}
      onShowDetails={onShowDetails}
      leagueLabel={leagueLabel}
      useAbbreviations={useAbbreviations}
      teamView
      isToday={gameIsToday(g)}
      isDoubleheader={doubleheaderIds.has(g.id)}
      onSelectTeam={onSelectTeam}
    />
    );
  };

  return (
    <>
      {/* Team-view sticky header — just the team row (matches the NBA/NHL
          title row). The subtitle-height spacer lives OUTSIDE the sticky so
          when the user scrolls, the spacer scrolls away and the Recent/Upcoming
          divider rises into the italic slot under the pinned team row. */}
      <div ref={headerRef} className="league-sticky-top flex flex-col items-center sticky z-30" style={{ background: "var(--bg)", paddingTop: "1.75rem" }}>
        <div className="relative w-full flex items-center justify-center">
          <button
            ref={backRef}
            type="button"
            onClick={onBack}
            className="absolute left-0 flex items-center gap-0.5 text-[11px] sm:text-xs cursor-pointer hover:underline"
            style={{ color: "var(--text-muted)" }}
            title={`Back to ${leagueLabel}`}
            aria-label={`Back to ${leagueLabel}`}
          >
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{leagueLabel}</span>
          </button>
          <div className="flex items-center justify-center min-w-0">
            <span className="text-sm invisible mr-1" aria-hidden="true">★</span>
            {team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" width={20} height={20} loading="lazy" decoding="async" className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0 mr-1" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }} title={team.displayName}>
              {headerAbbrev ? team.abbreviation : (team.shortDisplayName || team.displayName)}
            </h2>
            <button
              type="button"
              onClick={() => onToggleFavoriteTeam(team.id)}
              className={`text-sm leading-none transition-colors cursor-pointer shrink-0 ml-1.5 ${favoriteTeams.includes(team.id) ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
              style={favoriteTeams.includes(team.id) ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
              title={favoriteTeams.includes(team.id) ? "Remove from favorites" : "Add to favorites"}
              aria-label={favoriteTeams.includes(team.id) ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={favoriteTeams.includes(team.id)}
            >★</button>
          </div>
        </div>
      </div>
      {/* Non-sticky whitespace spacer under the team name — mirrors the
          subtitle + header bottom-padding league columns use so the first
          Recent divider lands at the same Y as other columns' first card. */}
      <div className="mt-0.5 pb-5 sm:pb-6" aria-hidden="true">
        <span className="text-[9px] sm:text-[10px] italic block text-center whitespace-nowrap" style={{ color: "transparent" }}>
          {"\u00A0"}
        </span>
      </div>

      {/* Announce the async schedule fetch to screen readers. Tapping a team
          swaps the column to this view, but the loading / error / empty text was
          silent — an SR user got no feedback that the schedule was loading,
          failed, or came back empty. role=status + aria-live=polite voices each
          transition, matching the loading-skeleton pattern in HomeContent and
          the status lines in FeedbackBox / SettingsPanel (WCAG 4.1.3). */}
      {loading ? (
        <p role="status" aria-live="polite" className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Loading schedule…</p>
      ) : error ? (
        <p role="status" aria-live="polite" className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Failed to load schedule</p>
      ) : allGames && allGames.length === 0 ? (
        <p role="status" aria-live="polite" className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>No games found</p>
      ) : (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {pastShown.length > 0 && (
            <>
              {/* Recent divider — inline at first-card Y, pins below the team
                  header when scrolled. Upcoming divider below uses the same
                  sticky top, so CSS stacking naturally pushes Recent out of
                  view once Upcoming reaches the pinned position. */}
              <div
                className="sticky z-20 flex items-center gap-1.5 py-1"
                style={{
                  top: `calc(var(--header-h, 60px) + ${headerH - 1}px)`,
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                }}
              >
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[9px] uppercase tracking-wide">Recent</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              {pastShown.map(renderCard)}
              {morePastAvailable && (
                <button
                  type="button"
                  onClick={() => setPastLimit((n) => n + PAGE_SIZE)}
                  aria-label="Show more recent games"
                  className="py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  More
                </button>
              )}
            </>
          )}
          {upcomingShown.length > 0 && (
            <>
              {/* Upcoming divider — same sticky top as Recent so it replaces it
                  once scrolled into the pinned slot. */}
              <div
                className="sticky z-20 flex items-center gap-1.5 py-1"
                style={{
                  top: `calc(var(--header-h, 60px) + ${headerH - 1}px)`,
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                }}
              >
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[9px] uppercase tracking-wide">Upcoming</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              {upcomingShown.map(renderCard)}
              {moreAvailable && (
                <button
                  type="button"
                  onClick={() => setUpcomingLimit((n) => n + PAGE_SIZE)}
                  aria-label="Show more upcoming games"
                  className="py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  More
                </button>
              )}
            </>
          )}
          {pastShown.length === 0 && upcomingShown.length === 0 && (
            <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>No games found</p>
          )}
        </div>
      )}
    </>
  );
}
