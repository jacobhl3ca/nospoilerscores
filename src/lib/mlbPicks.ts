// MLB bracket picks — the adapter between the playoff picture and the generic
// picks engine in lib/bracketPicks, plus the two things only MLB's own
// postseason feed can say: when picks lock, and who has won which series.
//
// Both come from ONE StatsAPI call, /schedule/postseason/series, which lists
// every postseason game (placeholders like "AL #3 Seed" until the field is set)
// with its round, its scheduled time and, once played, its winner. It is the
// same CORS-open host the picture already reads, so no proxy is needed.
//
// Type-only imports, erased by `--experimental-strip-types`, so the unit tests
// load this file directly — see tests/mlb-picks.test.ts.

import type { BracketMatchupKey, BracketSlot, LeagueBracket, LeagueKey } from "./playoffPicture";
import type { PickBracket, PickMatchup, PickRound, PickSide, PickTeam, SeriesResult } from "./bracketPicks";

/**
 * Doubling weights: 1 point per correct wild-card winner, x2 for a division
 * series, x4 for an LCS, x8 for the World Series. The three later rounds are
 * worth 8 points each in total, the wild card round 4, so the max is 28 and a
 * right champion outweighs a perfect first round.
 */
export const MLB_ROUNDS: PickRound[] = [
  { label: "Wild Card", weight: 1, bestOf: 3 },
  { label: "Division Series", weight: 2, bestOf: 5 },
  { label: "LCS", weight: 4, bestOf: 7 },
  { label: "World Series", weight: 8, bestOf: 7 },
];

const ROUND_OF: Record<string, number> = { wildCard: 0, divisionSeries: 1, championship: 2 };

/** Column heading for one half's round: "AL Wild Card", "ALDS", "ALCS". */
export function mlbRoundHeading(round: number, half: LeagueKey | null): string {
  if (round === 3 || !half) return "World Series";
  return round === 0 ? `${half} Wild Card` : `${half}${round === 1 ? "DS" : "CS"}`;
}

export function mlbBracketId(season: number): string {
  return `mlb-${season}`;
}

/**
 * The picture's two league brackets as one pickable bracket. Matchup keys are
 * "AL:wc-a" … "NL:cs" plus "ws", and a team is keyed by its MLB id — the same
 * id the postseason feed reports winners by.
 */
export function mlbPickBracket(season: number, al: LeagueBracket, nl: LeagueBracket, logo: (id: number) => string): PickBracket {
  const matchups: PickMatchup[] = [];
  for (const [half, lb] of [[0, al], [1, nl]] as const) {
    const lg = lb.league;
    const team = (slot: BracketSlot): PickTeam | null =>
      slot.team
        ? { id: String(slot.team.id), abbrev: slot.team.abbrev, name: slot.team.name, seed: slot.seed, logo: logo(slot.team.id) }
        : null;
    // An empty seat names what fills it, the way the Bracket tab does: the two
    // clubs when the feeder is two seeds, the round when it is itself a winner.
    const fromLabel = (from: BracketMatchupKey): string => {
      const f = lb.matchups.find((m) => m.key === from);
      const a = f?.sides[0].team?.abbrev;
      const b = f?.sides[1].team?.abbrev;
      if (a && b) return `${a}/${b} winner`;
      return `${mlbRoundHeading(f ? ROUND_OF[f.round] : 0, lg)} winner`;
    };
    for (const m of lb.matchups) {
      const sides = m.sides.map((s): PickSide => ({
        team: team(s),
        from: s.from ? `${lg}:${s.from}` : null,
        label: s.from ? fromLabel(s.from) : s.seed ? `Seed ${s.seed}` : "TBD",
      })) as [PickSide, PickSide];
      matchups.push({ key: `${lg}:${m.key}`, round: ROUND_OF[m.round], half, sides });
    }
  }
  matchups.push({
    key: "ws",
    round: 3,
    half: null,
    sides: [
      { team: null, from: `${al.league}:cs`, label: `${al.league} champion` },
      { team: null, from: `${nl.league}:cs`, label: `${nl.league} champion` },
    ],
  });
  return { id: mlbBracketId(season), rounds: MLB_ROUNDS, matchups, final: "ws", halves: [al.league, nl.league] };
}

// ── The postseason feed ─────────────────────────────────────────────────────

export interface StatsApiPostseasonGame {
  gamePk?: number;
  gameType?: string;
  gameDate?: string;
  officialDate?: string;
  gamesInSeries?: number;
  status?: { abstractGameState?: string; startTimeTBD?: boolean };
  teams?: {
    home?: { team?: { id?: number }; isWinner?: boolean };
    away?: { team?: { id?: number }; isWinner?: boolean };
  };
}
export interface StatsApiPostseason {
  series?: { series?: { id?: string }; games?: StatsApiPostseasonGame[] }[];
}

const ROUND_BY_GAME_TYPE: Record<string, number> = { F: 0, D: 1, L: 2, W: 3 };

/**
 * Every finished series. A series is decided when one club has won a majority
 * of its best-of — counted from the games' own winner flags rather than from a
 * "series over" field, because a postponed game is also `Final` in StatsAPI and
 * carries no winner, and a suspended one can be listed twice under one gamePk.
 */
export function seriesResults(data: StatsApiPostseason): SeriesResult[] {
  const out: SeriesResult[] = [];
  for (const s of data.series ?? []) {
    const games = s.games ?? [];
    const round = ROUND_BY_GAME_TYPE[games[0]?.gameType ?? ""];
    if (round == null) continue;
    const bestOf = Math.max(0, ...games.map((g) => g.gamesInSeries ?? 0));
    if (!bestOf) continue;
    const need = Math.floor(bestOf / 2) + 1;
    const wins = new Map<number, number>();
    const played = new Set<number>();
    const seen = new Set<number>();
    for (const g of games) {
      if (g.gamePk != null) {
        if (seen.has(g.gamePk)) continue;
        seen.add(g.gamePk);
      }
      const h = g.teams?.home, a = g.teams?.away;
      const winner = h?.isWinner ? h.team?.id : a?.isWinner ? a.team?.id : undefined;
      if (winner == null) continue;
      for (const id of [h?.team?.id, a?.team?.id]) if (id != null) played.add(id);
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    for (const [id, n] of wins) {
      if (n < need) continue;
      const loser = [...played].find((x) => x !== id);
      if (loser == null) continue;
      out.push({ round, winner: String(id), loser: String(loser) });
    }
  }
  return out;
}

/**
 * First pitch of the first wild-card game: the moment picks lock.
 *
 * Until MLB sets the times, every postseason game is published at a 07:33Z
 * placeholder with `startTimeTBD`. A TBD game on the opening day locks picks at
 * noon Eastern that day instead — earlier than any wild-card first pitch MLB
 * has scheduled, so the lock can only ever be early, never late. Noon is
 * written as 16:00Z: the wild-card round is always in late September or early
 * October, inside daylight time.
 */
export function lockTimeFrom(data: StatsApiPostseason): Date | null {
  const games = (data.series ?? []).flatMap((s) => s.games ?? []).filter((g) => g.gameType === "F" && g.officialDate);
  if (!games.length) return null;
  const first = games.map((g) => g.officialDate!).sort()[0];
  const times: number[] = [];
  for (const g of games) {
    if (g.officialDate !== first) continue;
    const t = g.gameDate ? Date.parse(g.gameDate) : NaN;
    if (g.status?.startTimeTBD || !Number.isFinite(t)) times.push(Date.parse(`${first}T16:00:00Z`));
    else times.push(t);
  }
  return new Date(Math.min(...times));
}

/** True while the lock is still the noon placeholder rather than a real first pitch. */
export function lockIsPlaceholder(data: StatsApiPostseason): boolean {
  const games = (data.series ?? []).flatMap((s) => s.games ?? []).filter((g) => g.gameType === "F" && g.officialDate);
  if (!games.length) return false;
  const first = games.map((g) => g.officialDate!).sort()[0];
  return games.some((g) => g.officialDate === first && g.status?.startTimeTBD);
}

const POSTSEASON = (season: number) =>
  `https://statsapi.mlb.com/api/v1/schedule/postseason/series?sportId=1&season=${season}`;

export interface MlbPostseason {
  lockAt: Date | null;
  lockTbd: boolean;
  results: SeriesResult[];
}

export async function fetchMlbPostseason(season: number, signal?: AbortSignal): Promise<MlbPostseason> {
  const r = await fetch(POSTSEASON(season), { signal });
  if (!r.ok) throw new Error(`mlb postseason → ${r.status}`);
  const data = (await r.json()) as StatsApiPostseason;
  return { lockAt: lockTimeFrom(data), lockTbd: lockIsPlaceholder(data), results: seriesResults(data) };
}
