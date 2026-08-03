import type { LeagueData, Game, Team } from "./types";

export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1";
}

// ?nhalert=1 — staging-side preview for the MLB No-Hit / Perfect Game badge.
// Forces 3 MLB games into a live no-hit state (home pitcher + perfect-game
// home pitcher + combined away no-hitter) so the badge is visible outside of
// an actual live no-hitter. Requires ratings (the spoiler toggle) to be on.
export function isNoHitAlertDemoActive(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("nhalert") === "1";
}

export function applyNoHitAlertDemo(leagues: LeagueData[]): LeagueData[] {
  return leagues.map((league) => {
    if (league.sport !== "mlb" || league.games.length === 0) return league;
    const games = [...league.games];
    // First 3 cards: no-hit / perfect / combined no-hit (badge shown).
    // Next 4 cards: regular live games at each rating tier (no badge) so
    // the alert can be compared against normal in-progress ratings.
    type Override = {
      pitching?: "home" | "away";
      perfect?: boolean;
      status: string;
      rating: number;
      awayScore: string;
      homeScore: string;
    };
    const overrides: Override[] = [
      // Mirrors espn.ts rating overrides: perfect=110 (above natural cap →
      // always sorts #1), no-hitter=95 (always GREAT).
      { pitching: "home", status: "Top 7th", rating: 95, awayScore: "0", homeScore: "1" },
      { pitching: "home", perfect: true, status: "Bot 8th", rating: 110, awayScore: "0", homeScore: "2" },
      { pitching: "away", status: "Mid 9th", rating: 95, awayScore: "3", homeScore: "0" },
      { status: "Bot 6th", rating: 92, awayScore: "3", homeScore: "2" },  // GREAT
      { status: "Top 5th", rating: 78, awayScore: "5", homeScore: "3" },  // GOOD
      { status: "Bot 7th", rating: 60, awayScore: "7", homeScore: "3" },  // MEH
      { status: "Top 8th", rating: 30, awayScore: "11", homeScore: "2" }, // SKIP
    ];
    for (let i = 0; i < Math.min(games.length, overrides.length); i++) {
      const g = games[i];
      const o = overrides[i];
      const pitchingTeam = o.pitching === "home" ? g.homeTeam.abbreviation
                         : o.pitching === "away" ? g.awayTeam.abbreviation
                         : null;
      games[i] = {
        ...g,
        state: "in",
        statusDetail: o.status,
        rating: o.rating,
        awayTeam: { ...g.awayTeam, score: o.awayScore },
        homeTeam: { ...g.homeTeam, score: o.homeScore },
        noHitterPitchingTeam: pitchingTeam,
        isPerfectGame: !!o.perfect,
      };
    }
    return { ...league, games };
  });
}

const LEAGUE_LABELS = ["Sports A", "Sports B", "Sports C"];

const PALETTE = ["E45858", "5887E4", "58E490", "E4A058", "A058E4", "58D4E4", "E458C4", "8AE458"];

function placeholderLogo(letter: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#${color}"/><text x="12" y="16.5" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="13" fill="#ffffff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function applyDemoMode(leagues: LeagueData[]): LeagueData[] {
  return leagues.map((league, leagueIdx) => {
    const slot = String.fromCharCode(65 + leagueIdx);
    const teamNum = new Map<string, number>();
    const transformTeam = (team: Team): Team => {
      const key = team.id || team.abbreviation || team.displayName || "?";
      let n = teamNum.get(key);
      if (n == null) {
        n = teamNum.size + 1;
        teamNum.set(key, n);
      }
      const color = PALETTE[(n - 1) % PALETTE.length];
      const label = `Team ${slot}${n}`;
      return {
        ...team,
        displayName: label,
        shortDisplayName: label,
        abbreviation: `${slot}${n}`,
        logo: placeholderLogo(slot, color),
        color,
      };
    };
    const transformGame = (game: Game): Game => {
      const homeTeam = transformTeam(game.homeTeam);
      const awayTeam = transformTeam(game.awayTeam);
      return {
        ...game,
        homeTeam,
        awayTeam,
        name: `${awayTeam.displayName} at ${homeTeam.displayName}`,
        shortName: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
        broadcasts: game.broadcasts.length ? ["Stream"] : [],
        playoffLabel: game.playoffLabel ? "Playoffs" : null,
        seriesStatus: null,
        venue: "",
        // The venue city/state ("Minneapolis, Minnesota") is as identifying as
        // the team names transformTeam scrubs, and it renders on the detail
        // modal's venue line right after `venue`. Drop it so that line shows
        // nothing AND the weather effect — which geocodes this exact city — no-ops
        // (it guards on !venueLocation), instead of leaking the real location.
        venueLocation: undefined,
        // Pre-game probable pitchers ("Z. Wheeler (5-1, 2.22)") and the live MLB
        // no-hit / cycle-watch badges carry real player and team identities the
        // team-rename can't rewrite in place — transformTeam only touches the two
        // Team objects, so these rode straight through `...game` and leaked real
        // names (detail-modal probables line; card badge tooltips) under ?demo=1.
        // Null them so those rows/badges fall back to their empty state, exactly
        // as golf and the F1/UFC eventCard already do.
        homeProbable: null,
        awayProbable: null,
        noHitterPitchingTeam: null,
        cycleWatch: null,
        // The NHL recap/condensed clips are pre-attached direct URLs that
        // GameHighlights plays verbatim — unlike the YouTube path, they aren't
        // re-resolved off the (scrubbed) team names, so they rode straight
        // through `...game` and, when tapped on a finished demo card, played the
        // REAL recap: real team names and the real final score, the exact
        // spoiler ?demo=1 exists to hide. Null them so `showNhl` is false and
        // the buttons don't render, matching how golf/eventCard are nulled.
        nhlRecapUrl: null,
        nhlRecapEmbed: null,
        nhlCondensedUrl: null,
        nhlCondensedEmbed: null,
        // Same leak as the NHL clips above, for MLB. The board enrich pre-
        // attaches MLB.com recap/condensed URLs (applyMlbVideos in espn.ts) that
        // GameHighlights plays verbatim; they rode straight through `...game` and
        // a tapped "Recap"/"Condensed" button on a finished demo card played the
        // REAL clip — real team names, real final score — the exact spoiler
        // ?demo=1 hides. Null them so `showMlb` is false and the buttons don't
        // render. The self-resolve fallback (GameHighlights, when the playback
        // URL is absent) matches on the now-scrubbed team displayNames, so it
        // returns no entry and can't re-leak — same fail-safe as the YouTube path.
        mlbRecapUrl: null,
        mlbRecapPlaybackUrl: null,
        mlbRecapPoster: null,
        mlbCondensedUrl: null,
        mlbCondensedPlaybackUrl: null,
        mlbCondensedPoster: null,
      };
    };
    return {
      ...league,
      label: LEAGUE_LABELS[leagueIdx] ?? `Sports ${slot}`,
      games: league.games.map(transformGame),
      nextGameDay: league.nextGameDay
        ? { date: league.nextGameDay.date, games: league.nextGameDay.games.map(transformGame) }
        : null,
      previousGameDay: league.previousGameDay
        ? { date: league.previousGameDay.date, games: league.previousGameDay.games.map(transformGame) }
        : null,
      golfTournament: null,
      // Like golfTournament, the F1/UFC event card carries real identities the
      // anonymizer can't rewrite in place — the GP/fight-card title, venue
      // subtitle, broadcaster, and (UFC) every fighter's name. transformGame
      // only touches games[], so without this the eventCard leaked real data
      // straight through `...league` under ?demo=1. Null it so those columns
      // fall back to the empty state, exactly as golf already does.
      eventCard: null,
    };
  });
}
