"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game, Sport, Team } from "@/lib/types";
import type { ShareCardMeta } from "@/lib/shareCard";
import { fetchTeamSchedule, fetchScheduleRatings } from "@/lib/espn";
import { etSlateYmd } from "@/lib/etDay";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { getDateString } from "@/components/DateNav";
import GameCard from "@/components/GameCard";
import VideoModal from "@/components/VideoModal";

// The live half of a /teams/<league>/<team> page (added 2026-09-26): the
// team's last 5 and next 5 games, fetched from ESPN on the client the way
// TeamView does (plus `upcoming`, so the preseason and soccer's results-only
// default cannot hide the next five), and drawn with the board's own GameCard so the spoiler
// rules are inherited rather than re-implemented. GameCard never reads
// Team.score (see the note atop /champions-league-without-spoilers).
//
// Two things the board can show that a team page must not, stripped here
// before the card sees the game: the W-L record (GameCard prints it on
// upcoming cards for the leagues picked in Settings) and the standings "#N"
// chip. Neither says who won a given game, but a search visitor landing here
// has made no choice about either, and a record is a season-long spoiler.
const SAMPLE = 5;

// Mirrors TeamView's seasonYearsForSport for the five team-page sports: the
// fall-to-spring ones are named by ESPN for the season's ENDING year, so the
// current season can be next year's number.
function seasonYears(sport: Sport): number[] {
  const y = new Date().getFullYear();
  return sport === "nba" || sport === "nhl" || sport === "epl" ? [y, y + 1, y - 1] : [y, y - 1];
}

const ms = (g: Game) => {
  const t = new Date(g.date).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// An empty record is what GameCard already treats as "no record to show".
const stripTeam = (t: Team): Team => ({ ...t, record: "", rank: undefined });

type ModalState = {
  videoId: string;
  fallbackUrl: string;
  embedUrl?: string | null;
  playbackUrl?: string | null;
  poster?: string | null;
  sourceLabel?: string | null;
  shareCard?: ShareCardMeta | null;
  alternates?: { label: string; videoId: string }[];
};

export default function TeamSchedulePreview({
  sport,
  rawId,
  teamName,
  leagueLabel,
}: {
  sport: Sport;
  rawId: string;
  teamName: string;
  leagueLabel: string;
}) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  // Ratings stay opt-in, as on the board: on only if this visitor already
  // turned them on there (or set "Ratings on launch: on").
  const [showRatings, setShowRatings] = useState(false);
  const [maskTitle, setMaskTitle] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    const p = loadPreferences();
    setShowRatings(p.defaultRatings === "on" || (p.defaultRatings !== "off" && p.showRatings));
    setMaskTitle(p.maskVideoTitle ?? false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTeamSchedule(sport, rawId, seasonYears(sport), { upcoming: true })
      .then((all) => { if (!cancelled) setGames(all); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [sport, rawId]);

  const { past, upcoming } = useMemo(() => {
    if (!games) return { past: [] as Game[], upcoming: [] as Game[] };
    const now = Date.now();
    const clean = (g: Game): Game => ({ ...g, homeTeam: stripTeam(g.homeTeam), awayTeam: stripTeam(g.awayTeam) });
    const finished = games
      .filter((g) => g.state === "post" && ms(g) <= now)
      .sort((a, b) => ms(b) - ms(a))
      .slice(0, SAMPLE)
      .map(clean);
    const next = games
      .filter((g) => g.state === "in" || g.state === "pre" || (g.state === "post" && ms(g) > now))
      .sort((a, b) => ms(a) - ms(b))
      .slice(0, SAMPLE)
      .map(clean);
    return { past: finished, upcoming: next };
  }, [games]);

  // Same linescore-aware rating backfill TeamView runs: the schedule endpoint
  // rates on the final margin alone, which can disagree with the board.
  const pastIds = past.map((g) => g.id).join(",");
  useEffect(() => {
    if (!past.length) return;
    let cancelled = false;
    fetchScheduleRatings(sport, past.map((g) => ({ id: g.id, date: g.date })))
      .then((map) => {
        if (cancelled || !map.size) return;
        setRatings(Object.fromEntries(map));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastIds, sport]);

  const today = getDateString(0);
  const card = (game: Game) => {
    const override = ratings[game.id];
    const g = override !== undefined ? { ...game, rating: override } : game;
    return (
      <div key={g.id} data-team-game={g.state}>
        <GameCard
          game={g}
          favoriteTeams={[]}
          onToggleFavoriteTeam={() => {}}
          showRatings={showRatings}
          leagueLabel={leagueLabel}
          teamView
          isToday={etSlateYmd(g.date) === today}
          onPlayHighlight={(videoId, fallbackUrl, shareCard, alternates) => setModal({ videoId, fallbackUrl, shareCard, alternates })}
          onPlayEmbed={(embedUrl, fallbackUrl, sourceLabel, shareCard, playbackUrl, poster) =>
            setModal({ videoId: "", fallbackUrl, embedUrl, sourceLabel, shareCard, playbackUrl: playbackUrl || null, poster: poster || null })
          }
        />
      </div>
    );
  };

  const divider = (label: string) => (
    <div className="flex items-center gap-1.5 py-1" style={{ color: "var(--text-muted)" }}>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <h2 className="text-[10px] uppercase tracking-wide">{label}</h2>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );

  return (
    <section data-team-schedule aria-label={`${teamName} schedule`} className="mb-6">
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowRatings((v) => !v)}
          aria-pressed={showRatings}
          data-umami-event="team-page-ratings-toggle"
          className="rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer"
          style={{ background: showRatings ? "var(--accent)" : "var(--bg-card)", color: showRatings ? "#fff" : "var(--text)", border: "1px solid var(--border)" }}
        >
          {showRatings ? "Ratings on" : "Show ratings"}
        </button>
      </div>
      {error ? (
        <p role="status" aria-live="polite" className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
          The schedule did not load. Open HideScore to see today&apos;s games.
        </p>
      ) : !games ? (
        <p role="status" aria-live="polite" className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
          Loading the {teamName} schedule…
        </p>
      ) : past.length === 0 && upcoming.length === 0 ? (
        <p role="status" aria-live="polite" className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
          No {teamName} games are listed right now.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {past.length > 0 && (
            <>
              {divider("Recent")}
              {past.map(card)}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              {divider("Upcoming")}
              {upcoming.map(card)}
            </>
          )}
        </div>
      )}
      {modal && (
        <VideoModal
          videoId={modal.videoId}
          fallbackUrl={modal.fallbackUrl}
          embedUrl={modal.embedUrl}
          playbackUrl={modal.playbackUrl}
          poster={modal.poster}
          sourceLabel={modal.sourceLabel}
          shareCard={modal.shareCard}
          alternates={modal.alternates}
          maskVideoTitle={maskTitle}
          youtubeNativeControls
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// "Follow the <Team> on HideScore": adds the team to the saved favorites the
// board reads (the same localStorage blob Settings writes, same
// "${sport}-${rawId}" id) and opens the board, where a favorite team's games
// sort to the top of its league column. A signed-in visitor's server copy is
// not pushed from here: the board's own sync runs when it loads.
export function FollowTeamButton({ teamId, label }: { teamId: string; label: string }) {
  const router = useRouter();
  const follow = () => {
    const prefs = loadPreferences();
    if (!prefs.favoriteTeams.includes(teamId)) {
      savePreferences({ ...prefs, favoriteTeams: [...prefs.favoriteTeams, teamId] });
    }
    router.push("/");
  };
  return (
    <button
      type="button"
      onClick={follow}
      data-umami-event="team-page-follow"
      className="inline-block rounded-lg px-5 py-2.5 font-semibold cursor-pointer"
      style={{ background: "var(--accent)", color: "#fff" }}
    >
      {label}
    </button>
  );
}
