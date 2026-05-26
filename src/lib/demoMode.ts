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
    // Color/emoji preview: each card showcases a different Tailwind color +
    // with-or-without baseball emoji combo so the user can pick the final
    // styling on staging. Label on the pill names the color. The first card
    // is the perfect-game pill in rose so it can be eyeballed alongside.
    type Variant = {
      label: string;
      textClass: string;
      bgRgba: string;
      showEmoji: boolean;
    };
    const variants: Variant[] = [
      // amber (current)
      { label: "Amber + ⚾",      textClass: "text-amber-500",   bgRgba: "rgba(245, 158, 11, 0.12)", showEmoji: true },
      { label: "Amber",          textClass: "text-amber-500",   bgRgba: "rgba(245, 158, 11, 0.12)", showEmoji: false },
      // orange
      { label: "Orange + ⚾",     textClass: "text-orange-500",  bgRgba: "rgba(249, 115, 22, 0.13)", showEmoji: true },
      { label: "Orange",         textClass: "text-orange-500",  bgRgba: "rgba(249, 115, 22, 0.13)", showEmoji: false },
      // red
      { label: "Red + ⚾",        textClass: "text-red-500",     bgRgba: "rgba(239, 68, 68, 0.12)",  showEmoji: true },
      { label: "Red",            textClass: "text-red-500",     bgRgba: "rgba(239, 68, 68, 0.12)",  showEmoji: false },
      // violet
      { label: "Violet + ⚾",     textClass: "text-violet-500",  bgRgba: "rgba(139, 92, 246, 0.13)", showEmoji: true },
      { label: "Violet",         textClass: "text-violet-500",  bgRgba: "rgba(139, 92, 246, 0.13)", showEmoji: false },
      // indigo
      { label: "Indigo + ⚾",     textClass: "text-indigo-500",  bgRgba: "rgba(99, 102, 241, 0.13)", showEmoji: true },
      { label: "Indigo",         textClass: "text-indigo-500",  bgRgba: "rgba(99, 102, 241, 0.13)", showEmoji: false },
      // fuchsia
      { label: "Fuchsia + ⚾",    textClass: "text-fuchsia-500", bgRgba: "rgba(217, 70, 239, 0.12)", showEmoji: true },
      { label: "Fuchsia",        textClass: "text-fuchsia-500", bgRgba: "rgba(217, 70, 239, 0.12)", showEmoji: false },
      // emerald
      { label: "Emerald + ⚾",    textClass: "text-emerald-500", bgRgba: "rgba(16, 185, 129, 0.13)", showEmoji: true },
      { label: "Emerald",        textClass: "text-emerald-500", bgRgba: "rgba(16, 185, 129, 0.13)", showEmoji: false },
    ];
    for (let i = 0; i < Math.min(games.length, variants.length); i++) {
      const g = games[i];
      const v = variants[i];
      games[i] = {
        ...g,
        state: "in",
        statusDetail: "Top 7th",
        rating: 95,
        awayTeam: { ...g.awayTeam, score: "0" },
        homeTeam: { ...g.homeTeam, score: "1" },
        noHitterPitchingTeam: g.homeTeam.abbreviation,
        isPerfectGame: false,
        noHitterBadgeOverride: { textClass: v.textClass, bgRgba: v.bgRgba, showEmoji: v.showEmoji, label: v.label },
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
      };
    };
    return {
      ...league,
      label: LEAGUE_LABELS[leagueIdx] ?? `Sports ${slot}`,
      games: league.games.map(transformGame),
      nextGameDay: league.nextGameDay
        ? { date: league.nextGameDay.date, games: league.nextGameDay.games.map(transformGame) }
        : null,
      golfTournament: null,
    };
  });
}
