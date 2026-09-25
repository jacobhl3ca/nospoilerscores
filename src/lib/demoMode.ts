import type { LeagueData, Game, Team } from "./types";

// Read once and pinned for the rest of the tab's life. Every highlight/share
// tap pushes a brand-new URL (?v=..., ?he=..., a game-detail deep link — see
// modalShareHref in HomeContent) that does not carry ?demo=1 forward, and this
// function is called fresh on every board refetch (HomeContent's fetchData,
// which also runs on the score poll and every date-nav tap) — not memoized
// once at mount the way GameCard/GameHighlights read their own copy. Without
// a pin, the FIRST tap that pushed one of those URLs silently dropped demo
// mode for the rest of the session: the very next refetch rendered real team
// names and logos over the anonymized board — exactly the leak class demo
// mode exists to prevent, and the hardest kind to notice in a quick check
// because the board looks right until the next poll. sessionStorage survives
// every history.pushState/replaceState in the tab, unlike window.location
// (which is the thing being rewritten).
const DEMO_SESSION_KEY = "hs_demo_active";

export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") {
    try { window.sessionStorage.setItem(DEMO_SESSION_KEY, "1"); } catch { /* private mode etc — falls back to per-call URL reads */ }
    return true;
  }
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

// ?demo=1&picker=1 — capture the anonymized first-run league picker itself
// (real league names/logos otherwise, the original 4.1(a) rejection). Every
// other demo session skips the sheet and lands straight on the auto-picked
// board, same result "Use defaults" produces — see the firstRunRef effect in
// HomeContent. Read directly off the current URL (not the sticky flag above):
// this only ever needs to matter on the page's first load, before any tap has
// had a chance to rewrite the URL.
export function isDemoPickerRequested(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1" && params.get("picker") === "1";
}

// ?demo=1&ratings=1 — force ratings on at launch (and skip the first-time
// explainer bar) so a screenshot session doesn't have to tap the tab by hand.
export function isDemoRatingsForced(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1" && params.get("ratings") === "1";
}

// ?demo=1&view=news — land straight on the News tab, WITH the first-time
// spoiler-warning bar showing (the opposite of the ratings override above,
// which skips its own bar) since a News screenshot wants that bar visible.
export function isDemoNewsRequested(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("demo") === "1" && params.get("view") === "news";
}

// ?demo=1&theme=light|dark — force a theme for the capture session regardless
// of the device's stored preference or OS setting.
export function getDemoThemeOverride(): "light" | "dark" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") return null;
  const t = params.get("theme");
  return t === "light" || t === "dark" ? t : null;
}

// Placeholder shown by the in-app highlights/embed player under ?demo=1
// instead of whatever real clip a button resolved. game.id is left untouched
// by applyDemoMode below (GameCard's espnUrl comment explains why: several
// non-identity features build real URLs off it), and it's exactly what keys
// the server's highlight bake — so a card whose team names ARE anonymized can
// still resolve and PLAY a real clip (real footage, real jerseys/logos, and
// the real matchup baked into the YouTube embed's own query params) the
// instant its highlight button is tapped. Rather than trying to chase every
// current and future button that can call onPlayHighlight/onPlayEmbed/a news
// video, HomeContent's three modal-opening functions substitute this
// placeholder at the single choke point they all share, unconditionally, in
// demo mode — the same "swap the leaf, not every caller" shape as the rest of
// this file.
export function demoHighlightPoster(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="12" fill="#1c1c1e"/><circle cx="160" cy="90" r="34" fill="#ffffff" fill-opacity="0.92"/><polygon points="148,68 148,112 190,90" fill="#1c1c1e"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEMO_HIGHLIGHT_HEADLINE = "Team A1 vs Team A2 highlights";

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

// The first-run league picker (?demo=1&picker=1) chooses from the real
// MLB/NFL/NBA/… catalog (ALL_LEAGUES / thirdLeagueOptions) with real ESPN/
// Wikimedia logos — applyDemoMode above never touches it, since it only
// transforms the fetched board data, not that static list. This builds a
// display-only label/logo per sport, in the order the picker renders them, so
// the sheet itself is safe to screenshot; callers keep using the real Sport
// value for selection and slot-mapping — only what's ON SCREEN changes.
export function anonymizeLeaguePickerOptions<T extends { sport: string }>(
  options: T[],
): Map<string, { label: string; logo: string }> {
  const map = new Map<string, { label: string; logo: string }>();
  options.forEach((o, i) => {
    const letter = String.fromCharCode(65 + (i % 26));
    const n = Math.floor(i / 26) + 1;
    map.set(o.sport, {
      label: n > 1 ? `League ${letter}${n}` : `League ${letter}`,
      logo: placeholderLogo(letter, PALETTE[i % PALETTE.length]),
    });
  });
  return map;
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
        // The overall standings rank (1 = league leader) is real data the
        // rename can't rewrite in place — it rode straight through `...team`
        // and rendered as the `#N` chip GameCard shows on live/upcoming cards
        // (team.rank != null && !effectivePastDate && !isFinished), pinning the
        // anonymized side to a real league position under ?demo=1. The FIFA
        // path never leaked it — that chip re-derives via fifaRank(displayName),
        // which returns null for the scrubbed "Team A1" name — so this nulls the
        // one sport family that still showed a real rank, matching that path and
        // the name/logo/venueLocation identity-scrub the rest of this file does.
        rank: null,
        // The W-L record ("12-5") is the same class of real standings data as
        // `rank` above — it rode straight through `...team` and rendered as the
        // record chip GameCard/GameDetailModal show on live/upcoming cards
        // (showRecords && team.record && !effectivePastDate && !isFinished &&
        // !isFuture), pinning the anonymized side to a real season position under
        // ?demo=1. Blank it so those chips fall to their empty state (each guards
        // on a truthy record), matching the rank scrub above. Empty is the type's
        // own "unknown" value (espn.ts defaults record to ""), and LeagueColumn's
        // getWins/getLosses/isWinningRecord already treat "" as 0-0 with no throw.
        record: "",
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
        // The soccer cup stage ("Group J", "Round of 16", "Final") is the
        // playoffLabel sibling for FIFA — rendered in the SAME detail-modal
        // label slot (game.playoffLabel || game.stage) — but it rode straight
        // through `...game` while playoffLabel was genericized above. Worse than
        // a facade break: the "Group X" line is TAPPABLE in the detail modal
        // (GameDetailModal's wcGroup) and opens the World Cup groups overlay with
        // REAL country names, and it also drives LeagueColumn's italic phase
        // subtitle ("Round of 16") right under an anonymized "Sports A" header.
        // Null it so both fall to their empty state (every read guards on a
        // truthy stage), matching the playoffLabel/seriesStatus scrub beside it.
        stage: null,
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
        // Same leak as the recap clips above, for the live "where to watch"
        // links. A live game's streamUrl is a pre-resolved real broadcast URL
        // that GameCard/GameDetailModal reuse verbatim — most concretely the
        // MLB.tv gamePk deep link (mlb.com/tv/g{gamePk}), which the card's
        // "Stream" chip serves straight through even though the anonymized
        // network name never matches ESPN/Prime. It rode through `...game`, so a
        // tapped stream chip on a live demo card opened the REAL broadcast page —
        // real team names and the live score, the exact identity ?demo=1 hides.
        // Null both so the chip falls back to the generic per-sport watch page
        // (sportStreamFallback — mlb.com/tv, nba.com/watch…), which names no
        // teams. Every consumer guards on a truthy streamUrl before using it, so
        // this only drops the real deep link; no card behavior changes otherwise.
        streamUrl: null,
        primeStreamUrl: null,
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
