"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    setUpcomingLimit(PAGE_SIZE);
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

  const { pastThree, upcoming } = useMemo(() => {
    if (!allGames) return { pastThree: [] as Game[], upcoming: [] as Game[] };
    const now = Date.now();
    const finished = allGames
      .filter((g) => g.state === "post")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const liveAndPre = allGames
      .filter((g) => g.state === "in" || g.state === "pre" || (g.state === "post" && new Date(g.date).getTime() > now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { pastThree: finished.slice(0, 3), upcoming: liveAndPre };
  }, [allGames]);

  const upcomingShown = upcoming.slice(0, upcomingLimit);
  const moreAvailable = upcoming.length > upcomingLimit;

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
    <div className="flex flex-col gap-1.5 sm:gap-2">
      <div
        className="league-sticky-top flex items-center justify-center gap-1.5 pb-2 sm:pb-3 sticky z-30"
        style={{ background: "var(--bg)", paddingTop: "1.75rem" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-0.5 text-[11px] sm:text-xs cursor-pointer hover:underline shrink-0"
          style={{ color: "var(--text-muted)" }}
          title={`Back to ${leagueLabel}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>{leagueLabel}</span>
        </button>
        <span className="shrink-0" style={{ color: "var(--text-muted)", opacity: 0.5 }}>·</span>
        {team.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt={team.abbreviation} width={20} height={20} className="w-4 h-4 sm:w-5 sm:h-5 object-contain shrink-0" />
        )}
        <h3 className="text-sm sm:text-base font-bold truncate" style={{ color: "var(--text)" }} title={team.displayName}>
          {team.shortDisplayName || team.displayName}
        </h3>
        <button
          onClick={() => onToggleFavoriteTeam(team.id)}
          className={`text-sm leading-none transition-colors cursor-pointer shrink-0 ${favoriteTeams.includes(team.id) ? "text-yellow-400" : "hover:text-yellow-400/50"}`}
          style={favoriteTeams.includes(team.id) ? undefined : { color: "var(--text-muted)", opacity: 0.4 }}
          title={favoriteTeams.includes(team.id) ? "Remove from favorites" : "Add to favorites"}
        >★</button>
      </div>

      {loading ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Loading schedule…</p>
      ) : error ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Failed to load schedule</p>
      ) : allGames && allGames.length === 0 ? (
        <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>No games found</p>
      ) : (
        <>
          {pastThree.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 mt-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[9px] uppercase tracking-wide">Recent</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              {pastThree.map(renderCard)}
            </>
          )}
          {upcomingShown.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 mt-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[9px] uppercase tracking-wide">Upcoming</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              {upcomingShown.map(renderCard)}
              {moreAvailable && (
                <button
                  type="button"
                  onClick={() => setUpcomingLimit((n) => n + PAGE_SIZE)}
                  className="mt-1 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  More
                </button>
              )}
            </>
          )}
          {pastThree.length === 0 && upcomingShown.length === 0 && (
            <p className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>No games found</p>
          )}
        </>
      )}
    </div>
  );
}
