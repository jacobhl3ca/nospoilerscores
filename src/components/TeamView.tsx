"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Game, Sport, Team } from "@/lib/types";
import { fetchTeamSchedule } from "@/lib/espn";
import GameCard from "./GameCard";

interface TeamViewProps {
  sport: Sport;
  team: Team;
  leagueLabel: string;
  favoriteTeams: string[];
  onToggleFavoriteTeam: (teamId: string) => void;
  showRatings: boolean;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
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

// Fallback 2-year window lets soccer (Aug–May seasons) and tail-end MLB
// postseasons still hit the right season when the current year is empty.
function seasonYearsForSport(sport: Sport): number[] {
  const y = new Date().getFullYear();
  if (sport === "epl" || sport === "mls" || sport === "fifa") return [y, y + 1, y - 1];
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
  onBack,
  onSelectTeam,
  useAbbreviations,
}: TeamViewProps) {
  const [allGames, setAllGames] = useState<Game[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [upcomingLimit, setUpcomingLimit] = useState(PAGE_SIZE);
  const [pastLimit, setPastLimit] = useState(PAST_INITIAL);
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
    const finished = allGames
      .filter((g) => g.state === "post")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const liveAndPre = allGames
      .filter((g) => g.state === "in" || g.state === "pre" || (g.state === "post" && new Date(g.date).getTime() > now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { past: finished, upcoming: liveAndPre };
  }, [allGames]);

  const pastShown = past.slice(0, pastLimit);
  const morePastAvailable = past.length > pastLimit;
  const upcomingShown = upcoming.slice(0, upcomingLimit);
  const moreAvailable = upcoming.length > upcomingLimit;

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

  const todayYMD = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const gameIsToday = (g: Game) => g.date.slice(0, 10) === todayYMD;

  const renderCard = (game: Game) => (
    <GameCard
      key={game.id}
      game={game}
      favoriteTeams={favoriteTeams}
      onToggleFavoriteTeam={onToggleFavoriteTeam}
      showRatings={showRatings}
      onPlayHighlight={onPlayHighlight}
      leagueLabel={leagueLabel}
      useAbbreviations={useAbbreviations}
      teamView
      isToday={gameIsToday(game)}
      onSelectTeam={onSelectTeam}
    />
  );

  return (
    <>
      {/* Team-view replaces the league sticky header. Back button sits absolutely
          on the left; team name + logo + star is dead-centered, same font and
          sticky placement as the league header it replaces. Falls back to the
          3-char abbreviation if the full name would overlap the back button. */}
      <div ref={headerRef} className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30" style={{ background: "var(--bg)", paddingTop: "1.75rem" }}>
        <div className="relative w-full flex items-center justify-center">
          <button
            ref={backRef}
            type="button"
            onClick={onBack}
            className="absolute left-0 flex items-center gap-0.5 text-[11px] sm:text-xs cursor-pointer hover:underline"
            style={{ color: "var(--text-muted)" }}
            title={`Back to ${leagueLabel}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{leagueLabel}</span>
          </button>
          <div className="flex items-center justify-center min-w-0">
            <span className="text-sm invisible mr-1" aria-hidden="true">★</span>
            {team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt={team.abbreviation} width={20} height={20} className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0 mr-1" />
            )}
            <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }} title={team.displayName}>
              {headerAbbrev ? team.abbreviation : (team.shortDisplayName || team.displayName)}
            </h2>
            <button
              onClick={() => onToggleFavoriteTeam(team.id)}
              className={`text-sm leading-none transition-colors cursor-pointer shrink-0 ml-1.5 ${favoriteTeams.includes(team.id) ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
              style={favoriteTeams.includes(team.id) ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
              title={favoriteTeams.includes(team.id) ? "Remove from favorites" : "Add to favorites"}
            >★</button>
          </div>
        </div>
        {/* Invisible subtitle-height spacer so this sticky header matches the
            height of PlayoffSubtitle-carrying league headers in adjacent
            columns. Keeps "NBA"/"NHL" pinned at the same Y while scrolling. */}
        <span
          className="text-[9px] sm:text-[10px] italic mt-0.5 block whitespace-nowrap"
          style={{ color: "transparent" }}
          aria-hidden="true"
        >
          {"\u00A0"}
        </span>
      </div>

      {loading ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Loading schedule…</p>
      ) : error ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Failed to load schedule</p>
      ) : allGames && allGames.length === 0 ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>No games found</p>
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
                  opacity: 0.8,
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
                  opacity: 0.8,
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
